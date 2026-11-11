/**
 * 大注释：一镜到底动效引擎。
 * 原则：点了什么，什么就变成下一个画面；返回时沿原路收回；底栏、顶栏这些不变的部分始终不动。
 *
 * 这个应用每次都整页重画（innerHTML），旧元素会被换掉。所以这里的做法是：
 * 1. 渲染前记下需要衔接的元素（带 data-morph 的元素）的位置，必要时复制一份旧画面；
 * 2. 立刻渲染新画面，不等动画（不拖慢输入，也不会清掉草稿）；
 * 3. 渲染后用浏览器自带的 Web Animations 让新元素从旧位置“长”到新位置。
 *
 * 只动 transform / opacity / clip-path；所有图层都 pointer-events: none、aria-hidden，不抢焦点。
 * 动效档位为“精简”或系统要求减少动态效果时，只保留很短的淡入淡出。
 */

export const MOTION_MS = {
  fast: 160,
  base: 280,
  emphasized: 380,
  exit: 200,
} as const;

export const MOTION_EASE = {
  standard: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0.05, 0.7, 0.1, 1)',
  accelerate: 'cubic-bezier(0.3, 0, 0.8, 0.15)',
} as const;

export type MotionBox = { left: number; top: number; width: number; height: number; radius: number };
export type MotionSource = MotionBox & { key: string };
export type AxisDirection = 1 | -1;

type MorphEntry = MotionBox & { scale: 'free' | 'uniform' | 'none' };
type ExitEntry = { key: string; element: HTMLElement; box: MotionBox; kind: string; origin: string };
export type MorphCapture = { layout: string; entries: Map<string, MorphEntry>; exits: ExitEntry[] };

const SHELL_SELECTOR = '.mobile-shell, .tablet-landscape-shell, .desktop-shell';
const PAGE_SELECTORS = [
  '.mobile-shell > .character-panel',
  '.mobile-shell > .mobile-chat-detail',
  '.mobile-shell > main',
  '.mobile-shell > .chat',
  '.tablet-landscape-detail > main',
  '.tablet-landscape-detail > .chat',
  '.tablet-landscape-detail > section',
  '.tablet-landscape-content > .tablet-landscape-page',
  '.desktop-shell > .character-page',
  '.desktop-shell > .desktop-settings-page',
  '.desktop-shell > .chat',
  '.desktop-shell > main',
];
const OVERLAY_SELECTOR = [
  '.action-sheet-overlay',
  '.app-dialog-overlay',
  '.message-choice-overlay',
  '.message-edit-overlay',
  '.card-recognition-overlay',
  '.sticker-import-overlay',
  '.world-bundle-import-overlay',
  '.event-composer-overlay',
  '.moments-tutorial-overlay',
  '.group-settings-panel',
  '.moments-publisher.is-open',
  '.sticker-picker',
  '.message-profile-popover',
  '.world-gear-panel[open]',
  '.model-onboarding-overlay',
  '.time-mode-onboarding-overlay',
  '.reply-mode-onboarding-overlay',
].join(',');
// 小注释：复制出来的旧画面里，只保留样式要用到的 data 属性，其余事件钩子全部去掉，避免被脚本误选。
const CLONE_KEEP_DATA = new Set(['data-avatar-tone', 'data-group-settings-mode', 'data-group-avatar-count', 'data-swatch']);
const SCROLL_CONTAINERS = '.messages, .group-messages, .world-workbench-scroll, .world-gear-body, .moments-scroll, .mobile-settings-content, .character-panel, .character-panel-page, .mobile-list-page, .settings-content, .desktop-list-scroll, .tablet-landscape-list-scroll, .mobile-page';

const liveAnimations = new Set<Animation>();
const animationListeners = new Map<Animation, Array<() => void>>();
const liveLayers = new Set<HTMLElement>();
const detailStack: Array<{ key: string; box: MotionBox }> = [];
const overlayStack: Array<{ key: string; box: MotionBox }> = [];
let lastTap: { source: MotionSource; at: number } | null = null;
let tapTrackingInstalled = false;
let pendingSendFlight: { box: MotionBox; text: string; font: string; color: string; lineHeight: string } | null = null;
// 小注释：最近一次渲染前记下的位置，以及这次渲染里正在飞的共享元素；页面展开时要按页面自己的位移重新校准它们。
let lastCapture: MorphCapture | null = null;
const morphAnimations = new Map<HTMLElement, Animation>();
// 小注释：发送时文字还在飞，目标气泡先藏着；中途又整页重画也要接着藏，落地后才露出来。
let landing: { key: string; selector: string } | null = null;

// ---------------------------------------------------------------- 基础工具

export function isMotionReduced(): boolean {
  if (typeof document === 'undefined' || typeof window === 'undefined') return true;
  if (document.documentElement.getAttribute('data-motion') === 'reduced') return true;
  if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return true;
  return typeof document.documentElement.animate !== 'function';
}

function layoutSignature(): string {
  return `${document.documentElement.getAttribute('data-layout') ?? ''}:${window.innerWidth}x${window.innerHeight}`;
}

export function boxOf(element: Element, withRadius = false): MotionBox {
  const rect = element.getBoundingClientRect();
  let radius = 0;
  if (withRadius) radius = Number.parseFloat(window.getComputedStyle(element).borderTopLeftRadius) || 0;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height, radius };
}

function onScreen(box: MotionBox): boolean {
  return box.width > 0
    && box.height > 0
    && box.left < window.innerWidth
    && box.top < window.innerHeight
    && box.left + box.width > 0
    && box.top + box.height > 0;
}

/** 由元素算出“同一个东西”的识别名，渲染前后用它配对。 */
export function motionKeyFor(element: Element): string {
  const el = element as HTMLElement;
  const data = el.dataset ?? {};
  if (data.morph) return data.morph;
  if (data.characterId) return `row:char:${data.characterId}`;
  if (data.groupChatId) return `row:group:${data.groupChatId}`;
  if (data.settingsSection) return `settings:${data.settingsSection}`;
  if (data.openWorldEventRp) return `event:${data.openWorldEventRp}`;
  if (data.openMomentDetail) return `moment:${data.openMomentDetail}`;
  if (el.id) return `id:${el.id}`;
  return '';
}

export function sourceFromElement(element: Element | null): MotionSource | null {
  if (!element) return null;
  const box = boxOf(element, true);
  if (!onScreen(box)) return null;
  return { ...box, radius: Math.max(box.radius, 10), key: motionKeyFor(element) };
}

function findByKey(key: string): HTMLElement | null {
  if (!key) return null;
  const escaped = key.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const candidates: string[] = [`[data-morph="${escaped}"]`];
  const [kind, type, id] = key.split(':');
  if (kind === 'row' && type === 'char' && id) candidates.push(`[data-character-id="${escaped.slice(9)}"]`);
  if (kind === 'row' && type === 'group' && id) candidates.push(`[data-group-chat-id="${escaped.slice(10)}"]`);
  if (kind === 'settings') candidates.push(`[data-settings-section="${escaped.slice(9)}"]`);
  if (kind === 'event') candidates.push(`[data-open-world-event-rp="${escaped.slice(6)}"]`);
  if (kind === 'moment') candidates.push(`[data-open-moment-detail="${escaped.slice(7)}"]`);
  if (kind === 'id') candidates.push(`#${CSS.escape ? CSS.escape(key.slice(3)) : key.slice(3)}`);
  for (const selector of candidates) {
    let found: HTMLElement | null = null;
    try {
      found = Array.from(document.querySelectorAll<HTMLElement>(selector))
        .find(element => !element.closest('.pt-motion-clone') && onScreen(boxOf(element))) ?? null;
    } catch {
      found = null;
    }
    if (found) return found;
  }
  return null;
}

function animate(element: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions): Animation | null {
  if (typeof (element as HTMLElement).animate !== 'function') return null;
  const animation = element.animate(keyframes, { fill: 'backwards', ...options });
  liveAnimations.add(animation);
  const settle = () => {
    liveAnimations.delete(animation);
    const listeners = animationListeners.get(animation) ?? [];
    animationListeners.delete(animation);
    listeners.forEach(listener => listener());
  };
  animation.onfinish = settle;
  animation.oncancel = settle;
  return animation;
}

function whenSettled(animations: Array<Animation | null>, maxMs: number, callback: () => void): void {
  const active = animations.filter((item): item is Animation => Boolean(item));
  let remaining = active.length;
  let called = false;
  const finish = () => {
    if (called) return;
    called = true;
    window.clearTimeout(timer);
    callback();
  };
  // 小注释：页面切到后台时动画可能停住，保底定时清理，不留残影。
  const timer = window.setTimeout(finish, maxMs + 180);
  if (remaining === 0) {
    finish();
    return;
  }
  active.forEach(animation => {
    const listeners = animationListeners.get(animation) ?? [];
    listeners.push(() => {
      remaining -= 1;
      if (remaining <= 0) finish();
    });
    animationListeners.set(animation, listeners);
  });
}

function trackLayer(layer: HTMLElement): HTMLElement {
  liveLayers.add(layer);
  return layer;
}

function dropLayer(layer: HTMLElement | null): void {
  if (!layer) return;
  liveLayers.delete(layer);
  layer.remove();
}

/** 新的页面级动效开始前，把上一段还没播完的直接跳到终点并清掉残影。 */
export function settlePageMotion(): void {
  Array.from(liveAnimations).forEach(animation => {
    try {
      animation.finish();
    } catch {
      animation.cancel();
    }
  });
  Array.from(liveLayers).forEach(layer => dropLayer(layer));
  document.querySelectorAll<HTMLElement>('[data-motion-lifted]').forEach(restoreLifted);
}

export function hasLiveMotionLayers(): boolean {
  return liveLayers.size > 0 || document.querySelector('.pt-motion-clone, .pt-motion-ghost') !== null;
}

// ---------------------------------------------------------------- 复制旧画面

function stripClone(root: HTMLElement): void {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  all.forEach(node => {
    node.removeAttribute('id');
    node.removeAttribute('autofocus');
    node.removeAttribute('for');
    Array.from(node.attributes).forEach(attribute => {
      if (attribute.name.startsWith('data-') && !CLONE_KEEP_DATA.has(attribute.name)) node.removeAttribute(attribute.name);
    });
  });
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('inert', '');
}

type LiveState = {
  fields: Array<{ value: string | null; checked: boolean }>;
  scrolls: Array<[number, number]>;
};

/** 渲染前记下输入框内容和各个滚动区域的位置（渲染后旧元素就没了，必须先记）。 */
function readLiveState(source: HTMLElement): LiveState {
  const fields = Array.from(source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'))
    .map(field => ({
      value: field.type === 'file' ? null : field.value,
      checked: field instanceof HTMLInputElement ? field.checked : false,
    }));
  const scrolls = [source, ...Array.from(source.querySelectorAll<HTMLElement>(SCROLL_CONTAINERS))]
    .map(node => [node.scrollTop, node.scrollLeft] as [number, number]);
  return { fields, scrolls };
}

/** 复制层放进页面后，把记下的输入内容和滚动位置还原上去，看起来和原来一模一样。 */
function applyLiveState(clone: HTMLElement, live: LiveState): void {
  const cloneFields = Array.from(clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
  live.fields.forEach((field, index) => {
    const target = cloneFields[index];
    if (!target) return;
    if (field.value !== null && target.type !== 'file') target.value = field.value;
    if (target instanceof HTMLInputElement) target.checked = field.checked;
  });
  const cloneScrollers = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>(SCROLL_CONTAINERS))];
  live.scrolls.forEach(([top, left], index) => {
    const target = cloneScrollers[index];
    if (!target || (top === 0 && left === 0)) return;
    target.scrollTop = top;
    target.scrollLeft = left;
  });
}

/** 复制当前整个外壳（而不是单独一页），这样依赖父级的样式都还能生效。 */
type ShellClone = { layer: HTMLElement; box: MotionBox; source: HTMLElement; morphs: Map<string, HTMLElement>; live: LiveState };

function cloneShell(): ShellClone | null {
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR);
  if (!shell) return null;
  const box = boxOf(shell);
  if (!onScreen(box)) return null;
  const live = readLiveState(shell);
  const clone = shell.cloneNode(true) as HTMLElement;
  // 小注释：清掉 data 属性之前先记下复制层里每个共享元素，退出动画要让它们飞回列表里的位置。
  const morphs = new Map<string, HTMLElement>();
  clone.querySelectorAll<HTMLElement>('[data-morph]').forEach(element => {
    const key = element.dataset.morph;
    if (key && !morphs.has(key)) morphs.set(key, element);
  });
  stripClone(clone);
  clone.classList.add('pt-motion-clone');
  clone.style.position = 'fixed';
  clone.style.left = `${box.left}px`;
  clone.style.top = `${box.top}px`;
  clone.style.width = `${box.width}px`;
  clone.style.height = `${box.height}px`;
  clone.style.margin = '0';
  clone.style.pointerEvents = 'none';
  return { layer: clone, box, source: shell, morphs, live };
}

function mountOnTop(old: ShellClone): void {
  document.body.appendChild(old.layer);
  applyLiveState(old.layer, old.live);
  trackLayer(old.layer);
}

function currentPage(): HTMLElement | null {
  for (const selector of PAGE_SELECTORS) {
    const found = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find(element => !element.closest('.pt-motion-clone') && onScreen(boxOf(element)));
    if (found) return found;
  }
  return null;
}

// 小注释：把新页面临时抬到复制层上面；动画结束后还原内联样式。
function liftAbove(element: HTMLElement, zIndex: number): void {
  if (element.hasAttribute('data-motion-lifted')) return;
  element.setAttribute('data-motion-lifted', `${element.style.position}|${element.style.zIndex}`);
  if (window.getComputedStyle(element).position === 'static') element.style.position = 'relative';
  element.style.zIndex = String(zIndex);
}

function restoreLifted(element: HTMLElement): void {
  const saved = element.getAttribute('data-motion-lifted');
  if (saved === null) return;
  const [position, zIndex] = saved.split('|');
  element.style.position = position ?? '';
  element.style.zIndex = zIndex ?? '';
  element.removeAttribute('data-motion-lifted');
}

function lerp(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

function lerpBox(from: MotionBox, to: MotionBox, t: number): MotionBox {
  return {
    left: lerp(from.left, to.left, t),
    top: lerp(from.top, to.top, t),
    width: lerp(from.width, to.width, t),
    height: lerp(from.height, to.height, t),
    radius: lerp(from.radius, to.radius, t),
  };
}

function flyTransform(dx: number, dy: number, scale: number, t: number): string {
  const k = 1 - t;
  return `translate(${(dx * k).toFixed(1)}px, ${(dy * k).toFixed(1)}px) scale(${lerp(scale, 1, t).toFixed(3)})`;
}

function insetFor(box: MotionBox, frame: MotionBox): string {
  const top = Math.max(0, box.top - frame.top);
  const left = Math.max(0, box.left - frame.left);
  const right = Math.max(0, frame.left + frame.width - (box.left + box.width));
  const bottom = Math.max(0, frame.top + frame.height - (box.top + box.height));
  return `inset(${top.toFixed(1)}px ${right.toFixed(1)}px ${bottom.toFixed(1)}px ${left.toFixed(1)}px round ${Math.max(0, box.radius).toFixed(1)}px)`;
}

// ---------------------------------------------------------------- 点按来源

/** 记住最近一次点按的元素，页面展开和浮层“从哪里长出来”都靠它。 */
export function installMotionTapTracking(): void {
  if (tapTrackingInstalled || typeof document === 'undefined') return;
  tapTrackingInstalled = true;
  document.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : null;
    const trigger = target?.closest<HTMLElement>('[data-morph-source], button, [role="button"], a, label.file-button, summary');
    if (!trigger || trigger.closest('.pt-motion-clone')) return;
    const source = sourceFromElement(trigger);
    if (source) lastTap = { source, at: Date.now() };
  }, { capture: true, passive: true });
}

export function takeTapSource(maxAgeMs = 1200): MotionSource | null {
  const tap = lastTap;
  lastTap = null;
  return tap && Date.now() - tap.at <= maxAgeMs ? tap.source : null;
}

// ---------------------------------------------------------------- 共享元素与列表重排

/** 渲染前记录所有 data-morph 元素的位置。 */
export function captureMorphs(): MorphCapture {
  const entries = new Map<string, MorphEntry>();
  const exits: ExitEntry[] = [];
  if (typeof document === 'undefined' || isMotionReduced()) return { layout: '', entries, exits };
  document.querySelectorAll<HTMLElement>('[data-morph]').forEach(element => {
    const key = element.dataset.morph;
    if (!key || entries.has(key) || element.closest('.pt-motion-clone')) return;
    const box = boxOf(element);
    if (!onScreen(box)) return;
    const scaleMode = element.dataset.morphScale;
    entries.set(key, { ...box, scale: scaleMode === 'uniform' || scaleMode === 'none' ? scaleMode : 'free' });
    // 小注释：带 data-motion-exit 的小元素（菜单、引用条、面板）重画后如果没了，要演一段收回；先记住它本身。
    if (element.dataset.motionExit) {
      exits.push({ key, element, box: boxOf(element, true), kind: element.dataset.motionExit, origin: element.dataset.motionOrigin ?? 'center' });
    }
  });
  lastCapture = { layout: layoutSignature(), entries, exits };
  return lastCapture;
}

/** 小元素出现：pop 从一点弹出，rise 从下方升起，fade 淡入，reveal 从上往下展开。 */
function playEnter(element: HTMLElement, kind: string): void {
  const origin = element.dataset.motionOrigin ?? 'center';
  if (kind === 'pop') {
    animate(element, [
      { transformOrigin: origin, transform: 'scale(0.86)', opacity: 0 },
      { transformOrigin: origin, transform: 'none', opacity: 1 },
    ], { duration: MOTION_MS.fast + 40, easing: MOTION_EASE.decelerate });
  } else if (kind === 'rise') {
    animate(element, [
      { transform: 'translateY(12px)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration: MOTION_MS.base - 40, easing: MOTION_EASE.decelerate });
  } else if (kind === 'reveal') {
    animate(element, [
      { clipPath: 'inset(0 0 100% 0)', opacity: 0.2 },
      { clipPath: 'inset(0 0 0 0)', opacity: 1 },
    ], { duration: MOTION_MS.base - 20, easing: MOTION_EASE.standard });
  } else {
    animate(element, [{ opacity: 0 }, { opacity: 1 }], { duration: MOTION_MS.fast, easing: 'linear' });
  }
}

/**
 * 小元素消失：把旧元素复制一份放回原处再收走。
 * 复制品外面套一层和原来一样的祖先类名（display: contents，不占位置），原来的样式规则照样生效。
 */
function playExit(entry: ExitEntry): void {
  let wrapper: HTMLElement | null = null;
  let innermost: HTMLElement | null = null;
  for (let parent = entry.element.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
    const shell = parent.cloneNode(false) as HTMLElement;
    shell.removeAttribute('id');
    Array.from(shell.attributes).forEach(attribute => {
      if (attribute.name.startsWith('data-') && !CLONE_KEEP_DATA.has(attribute.name)) shell.removeAttribute(attribute.name);
    });
    shell.removeAttribute('style');
    shell.style.display = 'contents';
    if (wrapper) shell.appendChild(wrapper);
    else innermost = shell;
    wrapper = shell;
  }
  const clone = entry.element.cloneNode(true) as HTMLElement;
  stripClone(clone);
  Object.assign(clone.style, { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' });
  Object.assign(clone.style, {
    position: 'fixed', left: `${entry.box.left}px`, top: `${entry.box.top}px`, width: `${entry.box.width}px`, height: `${entry.box.height}px`,
    margin: '0', pointerEvents: 'none', zIndex: '70', transform: 'none', animation: 'none', transition: 'none',
  });
  const layer = wrapper ?? clone;
  if (innermost) innermost.appendChild(clone);
  if (wrapper) wrapper.classList.add('pt-motion-clone');
  else clone.classList.add('pt-motion-clone');
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  trackLayer(layer);
  let keyframes: Keyframe[];
  if (entry.kind === 'pop') {
    keyframes = [
      { transformOrigin: entry.origin, transform: 'none', opacity: 1 },
      { transformOrigin: entry.origin, transform: 'scale(0.9)', opacity: 0 },
    ];
  } else if (entry.kind === 'sink') {
    keyframes = [{ transform: 'none', opacity: 1 }, { transform: 'translateY(12px)', opacity: 0 }];
  } else if (entry.kind === 'collapse') {
    keyframes = [{ clipPath: 'inset(0 0 0 0)', opacity: 1 }, { clipPath: 'inset(0 0 100% 0)', opacity: 0.2 }];
  } else {
    keyframes = [{ opacity: 1 }, { opacity: 0 }];
  }
  const exit = animate(clone, keyframes, { duration: MOTION_MS.fast, easing: MOTION_EASE.accelerate, fill: 'forwards' });
  whenSettled([exit], MOTION_MS.fast, () => dropLayer(layer));
}

/** 切换回复版本等“同一个位置换内容”：新内容从一侧滑进来。渲染前调用，渲染后自动播放。 */
let pendingSlide: { key: string; selector: string; direction: AxisDirection } | null = null;

export function prepareContentSlide(key: string, selector: string, direction: AxisDirection): void {
  pendingSlide = isMotionReduced() ? null : { key, selector, direction };
}

function playContentSlide(): void {
  const slide = pendingSlide;
  pendingSlide = null;
  if (!slide) return;
  const host = findByKey(slide.key);
  const target = host && (host.matches(slide.selector) ? host : host.querySelector<HTMLElement>(slide.selector));
  if (!target) return;
  animate(target, [
    { transform: `translateX(${18 * slide.direction}px)`, opacity: 0 },
    { transform: 'none', opacity: 1 },
  ], { duration: MOTION_MS.base - 40, easing: MOTION_EASE.decelerate });
}

/**
 * 渲染后把同名元素从旧位置平滑移到新位置。
 * 父子都在动时只算子元素相对父元素多出来的那一段，避免叠加。
 */
export function playMorphs(capture: MorphCapture, options: { duration?: number; enterPrefixes?: string[] } = {}): void {
  morphAnimations.clear();
  holdLanding();
  if (capture.layout !== layoutSignature() || isMotionReduced()) {
    pendingSlide = null;
    return;
  }
  const duration = options.duration ?? MOTION_MS.base;
  const moved = new Map<HTMLElement, { dx: number; dy: number }>();
  const seen = new Set<string>();
  const prefixesBefore = new Set(Array.from(capture.entries.keys()).map(key => key.split(':')[0]));
  document.querySelectorAll<HTMLElement>('[data-morph]').forEach(element => {
    const key = element.dataset.morph;
    if (!key || seen.has(key) || element.closest('.pt-motion-clone')) return;
    seen.add(key);
    const from = capture.entries.get(key);
    const to = boxOf(element);
    if (!onScreen(to)) return;
    if (!from) {
      // 小注释：从另一个元素的位置过来（比如引用条从被引用的那条消息处飞过来）：只平移不缩放，边走边显现。
      const sourceKey = element.dataset.motionFrom;
      const source = sourceKey ? capture.entries.get(sourceKey) : undefined;
      if (source) {
        animate(element, [
          { transform: `translate(${(source.left - to.left).toFixed(1)}px, ${(source.top + source.height / 2 - (to.top + to.height / 2)).toFixed(1)}px)`, opacity: 0.15 },
          { transform: 'none', opacity: 1 },
        ], { duration: MOTION_MS.base, easing: MOTION_EASE.standard });
        return;
      }
      if (element.dataset.motionEnter) {
        playEnter(element, element.dataset.motionEnter);
        return;
      }
      const prefix = key.split(':')[0];
      if (options.enterPrefixes?.includes(prefix) && prefixesBefore.has(prefix)) {
        animate(element, [
          { opacity: 0, transform: 'translateY(10px) scale(0.98)' },
          { opacity: 1, transform: 'none' },
        ], { duration: MOTION_MS.base, easing: MOTION_EASE.decelerate });
      }
      return;
    }
    let parentShift = { dx: 0, dy: 0 };
    for (let parent = element.parentElement; parent; parent = parent.parentElement) {
      const shift = moved.get(parent);
      if (shift) {
        parentShift = shift;
        break;
      }
    }
    const dx = from.left - to.left - parentShift.dx;
    const dy = from.top - to.top - parentShift.dy;
    let sx = to.width > 0 ? from.width / to.width : 1;
    let sy = to.height > 0 ? from.height / to.height : 1;
    if (from.scale === 'none') {
      sx = 1;
      sy = 1;
    } else if (from.scale === 'uniform') {
      // 小注释：等比缩放取宽高两个比例的中间值，前后形状稍有出入时也不会被压窄或拉宽。
      const uniform = Math.sqrt(sx * sy);
      sx = uniform;
      sy = uniform;
    }
    if (Math.abs(dx) < 0.75 && Math.abs(dy) < 0.75 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) return;
    moved.set(element, { dx: from.left - to.left, dy: from.top - to.top });
    const animation = animate(element, [
      { transformOrigin: '0 0', transform: `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})` },
      { transformOrigin: '0 0', transform: 'none' },
    ], { duration, easing: MOTION_EASE.standard });
    if (animation) morphAnimations.set(element, animation);
  });
  capture.exits.forEach(entry => {
    if (!seen.has(entry.key) && onScreen(entry.box)) playExit(entry);
  });
  playContentSlide();
}

function morphTransform(from: MotionBox, to: MotionBox, shiftX: number, shiftY: number, uniform: boolean): string {
  const ry = to.height > 0 ? from.height / to.height : 1;
  const rx = to.width > 0 ? from.width / to.width : 1;
  const sy = uniform ? Math.sqrt(rx * ry) : ry;
  const sx = uniform ? sy : rx;
  return `translate(${(from.left - to.left - shiftX).toFixed(2)}px, ${(from.top - to.top - shiftY).toFixed(2)}px) scale(${sx.toFixed(4)}, ${sy.toFixed(4)})`;
}

/**
 * 页面自己也在移动时，页面里的共享元素要扣掉页面的位移，才能看起来是从原处直线飞过来。
 * 这里把 playMorphs 已经开始的动画换成“扣掉位移、和页面同节奏”的版本。
 */
function rideAlongMorphs(container: HTMLElement, shiftX: number, shiftY: number, duration: number, easing: string): Array<Animation | null> {
  const capture = lastCapture;
  const animations: Array<Animation | null> = [];
  if (!capture) return animations;
  Array.from(morphAnimations.entries()).forEach(([element, animation]) => {
    if (!container.contains(element)) return;
    const key = element.dataset.morph ?? '';
    const from = capture.entries.get(key);
    animation.cancel();
    morphAnimations.delete(element);
    if (!from) return;
    const to = boxOf(element);
    animations.push(animate(element, [
      { transformOrigin: '0 0', transform: morphTransform(from, to, shiftX, shiftY, from.scale === 'uniform') },
      { transformOrigin: '0 0', transform: 'none' },
    ], { duration, easing }));
  });
  return animations;
}

/** 来源是不是一整行（宽度占页面大半、且在页面里面）：整行时页面从这一行的位置“长”出来，而不是原地揭开。 */
function isRowSource(source: MotionBox, page: MotionBox): boolean {
  return source.width >= page.width * 0.6
    && source.left >= page.left - 1
    && source.left + source.width <= page.left + page.width + 1;
}

/** 删除、撤回前先让这条内容淡出缩小，然后再改数据重画，后面的内容会顺着补上来。 */
export function fadeOutThen(elements: Array<HTMLElement | null>, then: () => void): void {
  const targets = elements.filter((item): item is HTMLElement => Boolean(item));
  if (!targets.length || isMotionReduced()) {
    then();
    return;
  }
  const animations = targets.map(element => animate(element, [
    { opacity: 1, transform: 'none' },
    { opacity: 0, transform: 'scale(0.96)' },
  ], { duration: MOTION_MS.fast, easing: MOTION_EASE.accelerate, fill: 'forwards' }));
  whenSettled(animations, MOTION_MS.fast, then);
}

// ---------------------------------------------------------------- 页面级动效

function quickFade(renderPage: () => void): void {
  const old = cloneShell();
  renderPage();
  if (!old || typeof old.layer.animate !== 'function') return;
  mountOnTop(old);
  const fade = animate(old.layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 140, easing: 'linear', fill: 'forwards' });
  whenSettled([fade], 140, () => dropLayer(old.layer));
}

/**
 * 进入详情：被点的那一行或按钮长成整页。
 * 旧画面复制一份垫在下面并微微后退，新页面从来源的位置裁剪展开；头像、标题等由 playMorphs 一起飞过去。
 */
/** 找“这一页”：给了范围（例如世界页下面的内容区）就只用那一块，顶栏这类不变的部分留在原地不动。 */
function detailPage(scopeSelector?: string): HTMLElement | null {
  if (scopeSelector) {
    const scoped = Array.from(document.querySelectorAll<HTMLElement>(scopeSelector))
      .find(element => !element.closest('.pt-motion-clone') && onScreen(boxOf(element)));
    if (scoped) return scoped;
  }
  return currentPage();
}

export function enterDetail(renderPage: () => void, source: MotionSource | null, scopeSelector?: string): void {
  settlePageMotion();
  if (isMotionReduced()) {
    quickFade(renderPage);
    return;
  }
  const old = cloneShell();
  renderPage();
  const page = detailPage(scopeSelector);
  if (!old || !page) {
    if (old) dropLayer(old.layer);
    return;
  }
  const pageBox = boxOf(page);
  const from = source && onScreen(source) ? source : null;
  detailStack.push({ key: from?.key ?? '', box: from ?? pageBox });
  if (detailStack.length > 12) detailStack.shift();

  // 小注释：旧画面垫在新页面下面（同一个外壳里，用层级区分），新页面在上面展开。
  // 垫底的旧画面只露出新页面所在的区域，平板和电脑上的列表、导航栏保持不动。
  const shell = document.querySelector<HTMLElement>(SHELL_SELECTOR);
  (shell ?? document.body).appendChild(old.layer);
  applyLiveState(old.layer, old.live);
  trackLayer(old.layer);
  old.layer.style.zIndex = '1';
  old.layer.style.clipPath = insetFor({ ...pageBox, radius: 0 }, old.box);
  liftAbove(page, 2);

  const duration = MOTION_MS.emphasized + 20;
  const easing = MOTION_EASE.standard;
  const backdrop = animate(old.layer, [
    { opacity: 1, transform: 'none' },
    { opacity: 0.35, transform: 'scale(0.94)' },
  ], { duration, easing, fill: 'forwards' });
  const full = { ...pageBox, radius: 0 };
  const animations: Array<Animation | null> = [backdrop];
  if (from && isRowSource(from, pageBox)) {
    // 小注释：整行展开。新页面先整体挪到这一行的位置，只露出和这一行一样高的顶部（正好是顶栏），
    // 然后一边往上归位一边向下铺开；头像、名字扣掉页面位移后直线飞到顶栏里。
    const shiftY = from.top - pageBox.top;
    const startClip = { left: from.left, top: pageBox.top, width: from.width, height: from.height, radius: from.radius };
    // 小注释：正在飞的头像、名字就是那一行里的那一份，垫底旧画面里的同一份先藏起来，免得出现两个。
    Array.from(morphAnimations.keys()).forEach(element => {
      if (!page.contains(element)) return;
      const copy = old.morphs.get(element.dataset.morph ?? '');
      if (copy) copy.style.visibility = 'hidden';
    });
    animations.push(...rideAlongMorphs(page, 0, shiftY, duration, easing));
    animations.push(animate(page, [
      { transform: `translateY(${shiftY.toFixed(1)}px)`, clipPath: insetFor(startClip, pageBox), opacity: 0.6 },
      { opacity: 1, offset: 0.3 },
      { transform: 'none', clipPath: insetFor(full, pageBox), opacity: 1 },
    ], { duration, easing }));
  } else if (from) {
    animations.push(animate(page, [
      { clipPath: insetFor(from, pageBox), opacity: 0.55 },
      { clipPath: insetFor(lerpBox(from, full, 0.4), pageBox), opacity: 1, offset: 0.4 },
      { clipPath: insetFor(full, pageBox), opacity: 1 },
    ], { duration, easing: MOTION_EASE.decelerate }));
  } else {
    animations.push(animate(page, [
      { transform: `translateX(${Math.round(pageBox.width * 0.28)}px)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration, easing: MOTION_EASE.decelerate }));
  }
  whenSettled(animations, duration, () => {
    dropLayer(old.layer);
    restoreLifted(page);
  });
}

/** 退出详情：当前页面缩回当初点开它的那一行；那一行不在屏幕上时，就向右退出。 */
export function exitDetail(renderPage: () => void, scopeSelector?: string): void {
  settlePageMotion();
  if (isMotionReduced()) {
    quickFade(renderPage);
    return;
  }
  const origin = detailStack.pop() ?? null;
  const oldPage = detailPage(scopeSelector);
  const oldPageBox = oldPage ? { ...boxOf(oldPage), radius: 0 } : null;
  const old = cloneShell();
  renderPage();
  if (!old) return;
  mountOnTop(old);
  old.layer.style.zIndex = '60';
  const startBox = oldPageBox ?? { ...old.box, radius: 0 };
  const target = origin?.key ? findByKey(origin.key) : null;
  const targetBox = target ? { ...boxOf(target, true), radius: Math.max(10, boxOf(target, true).radius) } : null;
  const page = detailPage(scopeSelector);
  const duration = MOTION_MS.emphasized;
  const animations: Array<Animation | null> = [];
  if (target && targetBox && isRowSource(targetBox, startBox)) {
    // 小注释：整行收回，和展开正好相反：旧页面边往下挪边收窄，最后只剩顶栏那一条，正好盖在那一行上再淡掉。
    // 顶栏里的头像、名字在复制层里同步飞回那一行的位置；列表里真的那一行就不再单独飞了。
    const shiftY = targetBox.top - startBox.top;
    const endClip = { left: targetBox.left, top: startBox.top, width: targetBox.width, height: targetBox.height, radius: targetBox.radius };
    const exitMs = MOTION_MS.base + 60;
    const easing = MOTION_EASE.standard;
    Array.from(morphAnimations.entries()).forEach(([element, animation]) => {
      if (target.contains(element)) {
        animation.cancel();
        morphAnimations.delete(element);
      }
    });
    old.morphs.forEach((cloneElement, key) => {
      const landing = target.querySelector<HTMLElement>(`[data-morph="${key.replace(/"/g, '\\"')}"]`)
        ?? (target.getAttribute('data-morph') === key ? target : null);
      const fromEntry = lastCapture?.entries.get(key);
      if (!landing || !fromEntry) return;
      // 小注释：列表里真的那一份先藏着，等复制层里飞回来的那一份快到位时再交接，免得同时出现两个。
      animations.push(animate(landing, [
        { opacity: 0 },
        { opacity: 0, offset: 0.72 },
        { opacity: 1 },
      ], { duration: exitMs, easing }));
      animations.push(animate(cloneElement, [
        { transformOrigin: '0 0', transform: 'none' },
        { transformOrigin: '0 0', transform: morphTransform(boxOf(landing), fromEntry, 0, shiftY, fromEntry.scale === 'uniform') },
      ], { duration: exitMs, easing, fill: 'forwards' }));
    });
    // 小注释：裁剪比位移先到位（四分之三处就只剩顶栏那一条），最后一段只是这一条落到那一行上并淡掉。
    animations.push(animate(old.layer, [
      { transform: 'none', clipPath: insetFor(startBox, old.box), opacity: 1 },
      { opacity: 1, offset: 0.72 },
      { clipPath: insetFor(endClip, old.box), offset: 0.75 },
      { transform: `translateY(${shiftY.toFixed(1)}px)`, clipPath: insetFor(endClip, old.box), opacity: 0 },
    ], { duration: exitMs, easing, fill: 'forwards' }));
  } else if (targetBox) {
    // 小注释：前半段内容还看得清，后半段边缩边淡，最后正好落在那个按钮上。
    animations.push(animate(old.layer, [
      { clipPath: insetFor(startBox, old.box), opacity: 1 },
      { clipPath: insetFor(lerpBox(startBox, targetBox, 0.55), old.box), opacity: 0.9, offset: 0.55 },
      { clipPath: insetFor(targetBox, old.box), opacity: 0 },
    ], { duration: MOTION_MS.base + 60, easing: MOTION_EASE.standard, fill: 'forwards' }));
  } else {
    old.layer.style.clipPath = insetFor(startBox, old.box);
    animations.push(animate(old.layer, [
      { transform: 'none', opacity: 1 },
      { transform: `translateX(${Math.round(startBox.width * 0.3)}px)`, opacity: 0 },
    ], { duration: MOTION_MS.base, easing: MOTION_EASE.accelerate, fill: 'forwards' }));
  }
  if (page) {
    animations.push(animate(page, [
      { opacity: 0.4, transform: 'scale(0.96)' },
      { opacity: 1, transform: 'none' },
    ], { duration, easing: MOTION_EASE.decelerate }));
  }
  whenSettled(animations, duration, () => dropLayer(old.layer));
}

/** 同级切换（底部标签、分段控件）：旧内容往一边推走，新内容从另一边进来。 */
export function switchAxis(renderPage: () => void, direction: AxisDirection, scopeSelector?: string): void {
  settlePageMotion();
  if (isMotionReduced()) {
    quickFade(renderPage);
    return;
  }
  const oldScope = scopeSelector ? document.querySelector<HTMLElement>(scopeSelector) : null;
  const old = cloneShell();
  const clipBox = oldScope ? boxOf(oldScope) : currentPage() ? boxOf(currentPage() as HTMLElement) : null;
  renderPage();
  const nextScope = scopeSelector ? document.querySelector<HTMLElement>(scopeSelector) : currentPage();
  if (!old) return;
  if (!nextScope || !clipBox) {
    dropLayer(old.layer);
    return;
  }
  mountOnTop(old);
  old.layer.style.zIndex = '60';
  // 小注释：同级切换时页面里的东西不跨页飞（两页碰巧都有同一个角色也不算同一个东西），只留底栏胶囊这类页面外的滑动。
  Array.from(morphAnimations.entries()).forEach(([element, animation]) => {
    if (!nextScope.contains(element)) return;
    animation.cancel();
    morphAnimations.delete(element);
  });
  // 小注释：旧画面只保留内容区，底栏这类不变的部分用新画面里真的那一份。
  old.layer.style.clipPath = insetFor({ ...clipBox, radius: 0 }, old.box);
  const shift = Math.round(Math.min(clipBox.width, 520) * 0.22) * direction;
  // 小注释：旧内容先快速退场，新内容稍晚一点进来，两页叠在一起的时间尽量短，画面不乱。
  const out = animate(old.layer, [
    { transform: 'none', opacity: 1 },
    { transform: `translateX(${-shift}px)`, opacity: 0 },
  ], { duration: MOTION_MS.fast + 20, easing: MOTION_EASE.standard, fill: 'forwards' });
  const into = animate(nextScope, [
    { transform: `translateX(${shift}px)`, opacity: 0 },
    { opacity: 1, offset: 0.45 },
    { transform: 'none', opacity: 1 },
  ], { duration: MOTION_MS.base + 20, delay: 70, easing: MOTION_EASE.decelerate });
  whenSettled([out, into], MOTION_MS.base + 90, () => dropLayer(old.layer));
}

function newOverlayElements(before: Set<Element>): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR))
    .filter(element => !before.has(element) && !element.closest('.pt-motion-clone') && onScreen(boxOf(element)));
}

/**
 * 浮层后面的暗色遮罩：开关时只让它淡入淡出，前面的面板保持不透明地移动。
 * 有单独遮罩元素的淡它；遮罩直接画在浮层底色上的，就只把底色渐变成透明。
 */
function fadeScrim(overlay: HTMLElement, show: boolean, duration: number, fill?: FillMode): Animation | null {
  const backdrop = overlay.querySelector<HTMLElement>(':scope > [class*="backdrop"]');
  if (backdrop) {
    return animate(backdrop, show ? [{ opacity: 0 }, { opacity: 1 }] : [{ opacity: 1 }, { opacity: 0 }], { duration, easing: 'linear', fill });
  }
  const color = window.getComputedStyle(overlay).backgroundColor;
  if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return null;
  const clear = 'rgba(0, 0, 0, 0)';
  return animate(overlay, show
    ? [{ backgroundColor: clear }, { backgroundColor: color }]
    : [{ backgroundColor: color }, { backgroundColor: clear }], { duration, easing: 'linear', fill });
}

function overlaySurface(overlay: HTMLElement): HTMLElement {
  return overlay.querySelector<HTMLElement>('.action-sheet, [role="dialog"] > section, section[class*="dialog"], section[class*="window"], .app-dialog, .group-settings-sheet, .moments-tutorial-sheet, .world-gear-card')
    ?? overlay;
}

/** 几乎铺满屏幕的浮层其实是一整页（例如世界设置）：它从按钮处展开成整页，不当作底部菜单。 */
function isFullPage(box: MotionBox): boolean {
  return box.width >= window.innerWidth * 0.9 && box.height >= window.innerHeight * 0.85 && box.top <= 24;
}

/** 贴着屏幕底边、几乎通栏的浮层就是底部菜单：它从底边升起、落回底边，不从按钮处长出来。 */
function isBottomSheet(box: MotionBox): boolean {
  return box.top + box.height >= window.innerHeight - 2 && box.width >= window.innerWidth * 0.9 && !isFullPage(box);
}

/** 浮层打开：从被点的位置长出来；底部菜单和找不到来源时从底部升起。 */
export function openOverlay(renderPage: () => void, source: MotionSource | null): void {
  const before = new Set<Element>(Array.from(document.querySelectorAll(OVERLAY_SELECTOR)));
  renderPage();
  if (isMotionReduced()) return;
  const overlays = newOverlayElements(before);
  if (!overlays.length) return;
  overlays.forEach(overlay => {
    const surface = overlaySurface(overlay);
    const box = boxOf(surface);
    overlayStack.push({ key: source?.key ?? '', box: source ?? box });
    if (overlayStack.length > 12) overlayStack.shift();
    if (surface !== overlay) {
      fadeScrim(overlay, true, MOTION_MS.fast);
    }
    if (isFullPage(box) && source && onScreen(source)) {
      const full = { ...box, radius: 0 };
      const from = { ...source, radius: Math.max(source.radius, 12) };
      animate(surface, [
        { clipPath: insetFor(from, box), opacity: 0.5 },
        { clipPath: insetFor(lerpBox(from, full, 0.4), box), opacity: 1, offset: 0.4 },
        { clipPath: insetFor(full, box), opacity: 1 },
      ], { duration: MOTION_MS.base + 60, easing: MOTION_EASE.decelerate });
    } else if (isBottomSheet(box)) {
      animate(surface, [
        { transform: `translateY(${Math.round(box.height)}px)` },
        { transform: 'none' },
      ], { duration: MOTION_MS.base + 40, easing: MOTION_EASE.decelerate });
    } else if (source && onScreen(source) && box.width > 0 && box.height > 0) {
      const dx = source.left + source.width / 2 - (box.left + box.width / 2);
      const dy = source.top + source.height / 2 - (box.top + box.height / 2);
      const s = Math.max(0.12, Math.min(source.width / box.width, source.height / box.height));
      animate(surface, [
        { transform: flyTransform(dx, dy, s, 0), opacity: 0 },
        { transform: flyTransform(dx, dy, s, 0.35), opacity: 1, offset: 0.35 },
        { transform: 'none', opacity: 1 },
      ], { duration: MOTION_MS.base + 40, easing: MOTION_EASE.decelerate });
    } else {
      animate(surface, [
        { transform: 'translateY(24px)', opacity: 0 },
        { transform: 'none', opacity: 1 },
      ], { duration: MOTION_MS.base, easing: MOTION_EASE.decelerate });
    }
  });
}

/** 浮层关闭：复制一份浮层，缩回当初打开它的位置后消失。 */
export function closeOverlay(renderPage: () => void): void {
  const overlays = Array.from(document.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR))
    .filter(element => !element.closest('.pt-motion-clone') && onScreen(boxOf(element)));
  if (!overlays.length || isMotionReduced()) {
    renderPage();
    return;
  }
  const clones = overlays.map(overlay => {
    // 小注释：有的浮层本身只是个很小的壳（例如世界设置的 details），真正的整页是里面 fixed 的那块；
    // 复制层会裁掉超出自己的内容，所以按两者合起来的范围摆放。
    const own = boxOf(overlay);
    const inner = boxOf(overlaySurface(overlay));
    const left = Math.min(own.left, inner.left);
    const top = Math.min(own.top, inner.top);
    const box = {
      left,
      top,
      width: Math.max(own.left + own.width, inner.left + inner.width) - left,
      height: Math.max(own.top + own.height, inner.top + inner.height) - top,
      radius: own.radius,
    };
    const live = readLiveState(overlay);
    const clone = overlay.cloneNode(true) as HTMLElement;
    stripClone(clone);
    clone.classList.add('pt-motion-clone');
    // 小注释：先清掉四边定位，再按原来的位置和大小钉住，复制层才会正好叠在原浮层上。
    Object.assign(clone.style, {
      top: 'auto', right: 'auto', bottom: 'auto', left: 'auto',
    });
    Object.assign(clone.style, {
      position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
      margin: '0', pointerEvents: 'none', zIndex: '80',
    });
    return { overlay, clone, live };
  });
  const survivors = new Set<Element>();
  renderPage();
  document.querySelectorAll(OVERLAY_SELECTOR).forEach(element => survivors.add(element));
  clones.forEach(({ clone, live }) => {
    const animations: Array<Animation | null> = [];
    // 小注释：同一个浮层重画后还在（只是内容变了）时不做关闭动画。
    const className = clone.className.split(' ').find(name => name && name !== 'pt-motion-clone') ?? '';
    if (className && Array.from(survivors).some(element => (element as HTMLElement).classList?.contains(className))) return;
    document.body.appendChild(clone);
    applyLiveState(clone, live);
    trackLayer(clone);
    const origin = overlayStack.pop() ?? null;
    const target = origin?.key ? findByKey(origin.key) : null;
    const surface = overlaySurface(clone);
    const box = boxOf(surface);
    if (surface !== clone) animations.push(fadeScrim(clone, false, MOTION_MS.exit, 'forwards'));
    if (isFullPage(box) && target) {
      const targetBox = boxOf(target, true);
      const to = { ...targetBox, radius: Math.max(targetBox.radius, 12) };
      const full = { ...box, radius: 0 };
      animations.push(animate(surface, [
        { clipPath: insetFor(full, box), opacity: 1 },
        { clipPath: insetFor(lerpBox(full, to, 0.6), box), opacity: 0.9, offset: 0.6 },
        { clipPath: insetFor(to, box), opacity: 0 },
      ], { duration: MOTION_MS.base, easing: MOTION_EASE.standard, fill: 'forwards' }));
    } else if (isBottomSheet(box)) {
      animations.push(animate(surface, [
        { transform: 'none' },
        { transform: `translateY(${Math.round(box.height)}px)` },
      ], { duration: MOTION_MS.exit + 20, easing: MOTION_EASE.accelerate, fill: 'forwards' }));
    } else if (target && box.width > 0 && box.height > 0) {
      const t = boxOf(target);
      const dx = t.left + t.width / 2 - (box.left + box.width / 2);
      const dy = t.top + t.height / 2 - (box.top + box.height / 2);
      const s = Math.max(0.12, Math.min(t.width / box.width, t.height / box.height));
      animations.push(animate(surface, [
        { transform: 'none', opacity: 1 },
        { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${s.toFixed(3)})`, opacity: 0 },
      ], { duration: MOTION_MS.exit + 40, easing: MOTION_EASE.accelerate, fill: 'forwards' }));
    } else {
      animations.push(animate(surface, [
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(20px)', opacity: 0 },
      ], { duration: MOTION_MS.exit, easing: MOTION_EASE.accelerate, fill: 'forwards' }));
    }
    whenSettled(animations, MOTION_MS.exit + 40, () => dropLayer(clone));
  });
}

// ---------------------------------------------------------------- 发送：输入框里的字飞进气泡

function holdLanding(): void {
  if (!landing) return;
  const row = findByKey(landing.key);
  const target = row && (row.matches(landing.selector) ? row : row.querySelector<HTMLElement>(landing.selector));
  if (!target || target.hasAttribute('data-motion-hold')) return;
  target.setAttribute('data-motion-hold', '');
  target.style.opacity = '0';
}

function releaseLanding(): void {
  landing = null;
  document.querySelectorAll<HTMLElement>('[data-motion-hold]').forEach(element => {
    element.style.opacity = '';
    element.removeAttribute('data-motion-hold');
  });
}

export function prepareSendFlight(input: HTMLTextAreaElement | null): void {
  pendingSendFlight = null;
  if (!input || isMotionReduced()) return;
  const text = input.value.trim();
  if (!text) return;
  const style = window.getComputedStyle(input);
  const box = boxOf(input);
  if (!onScreen(box)) return;
  pendingSendFlight = {
    box,
    text: text.length > 400 ? `${text.slice(0, 400)}…` : text,
    font: style.font,
    color: style.color,
    lineHeight: style.lineHeight,
  };
}

/** 新气泡出现后调用：一段文字从输入框的位置飞到气泡的位置，落地时气泡接替显示。 */
export function playSendFlight(bubble: HTMLElement | null): void {
  const flight = pendingSendFlight;
  pendingSendFlight = null;
  if (!flight || !bubble || isMotionReduced()) return;
  const to = boxOf(bubble, true);
  if (!onScreen(to)) return;
  const ghost = document.createElement('div');
  ghost.className = 'pt-motion-ghost pt-send-ghost';
  ghost.setAttribute('aria-hidden', 'true');
  ghost.textContent = flight.text;
  const bubbleStyle = window.getComputedStyle(bubble);
  Object.assign(ghost.style, {
    position: 'fixed', left: `${to.left}px`, top: `${to.top}px`, width: `${to.width}px`, height: `${to.height}px`,
    font: bubbleStyle.font, lineHeight: bubbleStyle.lineHeight, color: bubbleStyle.color,
    background: bubbleStyle.backgroundColor, borderRadius: bubbleStyle.borderRadius,
    padding: bubbleStyle.padding, boxSizing: 'border-box', whiteSpace: 'pre-wrap', overflow: 'hidden',
    pointerEvents: 'none', zIndex: '70', margin: '0',
  });
  document.body.appendChild(ghost);
  trackLayer(ghost);
  const from = flight.box;
  const dx = from.left - to.left;
  const dy = from.top + from.height - (to.top + to.height);
  const sx = Math.max(0.3, Math.min(1.6, from.width / Math.max(1, to.width)));
  const flightAnimation = animate(ghost, [
    { transformOrigin: '0 100%', transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) scale(${sx.toFixed(3)}, 1)`, opacity: 0.6 },
    { transformOrigin: '0 100%', transform: 'none', opacity: 1 },
  ], { duration: MOTION_MS.base + 20, easing: MOTION_EASE.decelerate, fill: 'forwards' });
  const rowKey = bubble.closest<HTMLElement>('[data-morph]')?.dataset.morph ?? '';
  if (rowKey) {
    releaseLanding();
    landing = { key: rowKey, selector: '.message, .group-message-body' };
    holdLanding();
  }
  whenSettled([flightAnimation], MOTION_MS.base + 20, () => {
    releaseLanding();
    dropLayer(ghost);
  });
}

// ---------------------------------------------------------------- 换主题色 / 深浅色

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void>; finished: Promise<void> };
};

/**
 * 换颜色：支持“视图过渡”的设备上，从点的那个色点处圆形扩散出新颜色；
 * 其它设备复制一份旧画面（固定住旧颜色）再淡出。
 */
export function playAppearanceSwitch(trigger: HTMLElement | null, apply: () => void, themeVariables: string[]): void {
  const doc = document as ViewTransitionDocument;
  if (isMotionReduced()) {
    apply();
    return;
  }
  const origin = trigger ? boxOf(trigger) : null;
  const x = origin ? origin.left + origin.width / 2 : window.innerWidth / 2;
  const y = origin ? origin.top + origin.height / 2 : window.innerHeight / 2;
  if (typeof doc.startViewTransition === 'function') {
    const root = document.documentElement;
    root.setAttribute('data-theme-transition', '');
    const transition = doc.startViewTransition(() => apply());
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    void transition.ready.then(() => {
      root.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] }, {
        duration: 520, easing: MOTION_EASE.standard, pseudoElement: '::view-transition-new(root)',
      } as KeyframeAnimationOptions);
    }).catch(() => undefined);
    void transition.finished.then(() => root.removeAttribute('data-theme-transition'), () => root.removeAttribute('data-theme-transition'));
    return;
  }
  settlePageMotion();
  const old = cloneShell();
  if (old) {
    const computed = window.getComputedStyle(document.documentElement);
    themeVariables.forEach(name => {
      const value = computed.getPropertyValue(name);
      if (value) old.layer.style.setProperty(name, value.trim());
    });
    old.layer.style.background = window.getComputedStyle(old.source).backgroundColor;
  }
  apply();
  if (!old) return;
  mountOnTop(old);
  old.layer.style.zIndex = '90';
  const fade = animate(old.layer, [{ opacity: 1 }, { opacity: 0 }], { duration: 360, easing: MOTION_EASE.standard, fill: 'forwards' });
  whenSettled([fade], 360, () => dropLayer(old.layer));
}
