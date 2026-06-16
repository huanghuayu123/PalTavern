// Big comment: this module owns page-transition mechanics only.
// It receives the render callback from app.ts so future UI splits avoid circular imports.
export type UiTransitionKind = 'main-forward' | 'main-back' | 'world-forward' | 'world-back' | 'detail-in' | 'detail-out' | 'overlay-in' | 'overlay-out' | 'quiet';

export type MainSectionTransitionId = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings';
export type DesktopViewTransitionId = 'chat' | 'groups' | 'world' | 'moments';

const UI_ENTER_MS = 160;
const UI_EXIT_MS = 80;
const UI_MAIN_ENTER_MS = 260;
const UI_MAIN_EXIT_MS = 220;
const UI_MAIN_BLOCK_GAP_MS = 24;
const UI_MAIN_OVERLAP_DELAY_MS = 140;
const UI_MAIN_EXIT_TOTAL_MS = UI_MAIN_EXIT_MS + (UI_MAIN_BLOCK_GAP_MS * 4);
const UI_MAIN_ENTER_TOTAL_MS = UI_MAIN_ENTER_MS + (UI_MAIN_BLOCK_GAP_MS * 4);
const UI_WORLD_ENTER_MS = 260;
const UI_WORLD_EXIT_MS = 220;
const UI_OVERLAY_ENTER_MS = 180;
const UI_OVERLAY_EXIT_MS = 120;
const UI_OVERLAY_SPRING_EXIT_MS = 360;
const CHAT_REVEAL_ENTER_MS = 420;
const CHAT_REVEAL_EXIT_MS = 280;
const ACTION_EXPAND_MS = 280;
const UI_MAIN_NAV_ORDER: MainSectionTransitionId[] = ['messages', 'contacts', 'groups', 'world', 'moments', 'settings'];
const UI_DESKTOP_VIEW_ORDER: DesktopViewTransitionId[] = ['chat', 'groups', 'world', 'moments'];

type ChatRevealAnchor = {
  x: number;
  y: number;
  size: number;
  targetSelector: string;
};

type ActionExpandAnchor = {
  left: number;
  top: number;
  width: number;
  height: number;
  radius: number;
};

type RevealLayerParts = {
  layer: HTMLDivElement;
  snapshot: HTMLDivElement;
};

let transitionTimer: number | undefined;
let transitionClearTimer: number | undefined;
let transitionSnapshotTimer: number | undefined;
let chatRevealAnimating = false;
let pendingChatRevealAnchor: ChatRevealAnchor | null = null;
let lastChatRevealAnchor: ChatRevealAnchor | null = null;
let activeRevealCancel: (() => void) | null = null;
let activeRevealSerial = 0;
let pendingActionExpandAnchor: ActionExpandAnchor | null = null;
let actionExpandAnimating = false;
let actionExpandSerial = 0;
let actionExpandTimer: number | undefined;

const MOBILE_MAIN_PAGE_SELECTOR = [
  '.mobile-shell > .mobile-page',
  '.mobile-shell > .mobile-list-page',
  '.mobile-shell > .moments-page',
  '.mobile-shell > .events-page',
  '.mobile-shell > .timeline-page',
  '.mobile-shell > .group-list-page',
  '.mobile-shell > .chat',
  '.mobile-shell > .world-workbench',
].join(',');

export function mainSectionTransition(from: MainSectionTransitionId, to: MainSectionTransitionId): UiTransitionKind {
  if (from === to) return 'quiet';
  const fromIndex = UI_MAIN_NAV_ORDER.indexOf(from);
  const toIndex = UI_MAIN_NAV_ORDER.indexOf(to);
  if (fromIndex < 0 || toIndex < 0) return 'main-forward';
  return toIndex > fromIndex ? 'main-forward' : 'main-back';
}

export function desktopViewTransition(from: DesktopViewTransitionId, to: DesktopViewTransitionId): UiTransitionKind {
  if (from === to) return 'quiet';
  return UI_DESKTOP_VIEW_ORDER.indexOf(to) > UI_DESKTOP_VIEW_ORDER.indexOf(from) ? 'main-forward' : 'main-back';
}

export function prepareChatRevealFromElement(trigger: HTMLElement | null): void {
  if (!trigger || reducedMotionRequested() || !isCompactShellVisible() || isChatDetailVisible()) return;
  pendingChatRevealAnchor = anchorFromElement(trigger, revealTargetSelector(trigger));
  lastChatRevealAnchor = pendingChatRevealAnchor;
}

export function prepareActionExpandFromElement(trigger: HTMLElement | null): void {
  if (!trigger || reducedMotionRequested()) return;
  const rect = trigger.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const radiusText = window.getComputedStyle(trigger).borderRadius;
  pendingActionExpandAnchor = {
    left: rect.left,
    top: rect.top,
    width: rect.width,
    height: rect.height,
    radius: Math.max(8, Number.parseFloat(radiusText) || 14),
  };
}

function clearUiTransitionMarker(kind?: UiTransitionKind): void {
  const root = document.documentElement;
  if (kind && root.getAttribute('data-ui-transition') !== kind) return;
  window.clearTimeout(transitionTimer);
  window.clearTimeout(transitionClearTimer);
  window.clearTimeout(transitionSnapshotTimer);
  root.removeAttribute('data-ui-transition');
  root.removeAttribute('data-tab-dir');
  root.removeAttribute('data-ui-transition-phase');
  root.classList.remove('ui-fallback-transition');
  document.querySelectorAll('.is-exiting').forEach(element => element.classList.remove('is-exiting'));
  document.querySelectorAll('.pt-main-tab-snapshot').forEach(element => element.remove());
}

function clearActionExpandLayer(force = false): void {
  if (actionExpandAnimating && !force) return;
  actionExpandAnimating = false;
  actionExpandSerial += 1;
  window.clearTimeout(actionExpandTimer);
  document.querySelectorAll('.pt-action-expand-layer').forEach(element => element.remove());
}

function reducedMotionRequested(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function transitionDirection(kind: UiTransitionKind): 'left' | 'right' | '' {
  if (kind === 'main-forward' || kind === 'world-forward' || kind === 'detail-in') return 'right';
  if (kind === 'main-back' || kind === 'world-back' || kind === 'detail-out') return 'left';
  return '';
}

function isCompactShellVisible(): boolean {
  const nav = document.querySelector<HTMLElement>('.bottom-nav');
  if (!nav) return false;
  const rect = nav.getBoundingClientRect();
  const style = window.getComputedStyle(nav);
  return rect.width > 0
    && rect.height > 0
    && style.display !== 'none'
    && style.visibility !== 'hidden';
}

function isChatDetailVisible(): boolean {
  const detail = document.querySelector<HTMLElement>('.mobile-chat-detail');
  return Boolean(detail && detail.offsetParent !== null);
}

function safeAttr(value: string): string {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function revealTargetSelector(element: HTMLElement): string {
  const characterId = element.dataset.characterId ?? '';
  if (characterId) return `button[data-character-id="${safeAttr(characterId)}"]`;
  const groupChatId = element.dataset.groupChatId ?? '';
  if (groupChatId) return `button[data-group-chat-id="${safeAttr(groupChatId)}"]`;
  return '';
}

function anchorFromElement(element: HTMLElement, targetSelector: string): ChatRevealAnchor {
  const avatar = element.querySelector<HTMLElement>('.avatar');
  const box = avatar ?? element;
  const rect = box.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    size: Math.max(rect.width, rect.height, 44),
    targetSelector,
  };
}

function findAnchorForReveal(anchor: ChatRevealAnchor): ChatRevealAnchor | null {
  if (!anchor.targetSelector) return null;
  const element = document.querySelector<HTMLElement>(anchor.targetSelector);
  return element ? anchorFromElement(element, anchor.targetSelector) : null;
}

function defaultChatRevealAnchor(): ChatRevealAnchor {
  return {
    x: 54,
    y: window.innerHeight * 0.42,
    size: 58,
    targetSelector: '',
  };
}

function maxRevealRadius(anchor: ChatRevealAnchor): number {
  const x = Math.max(0, Math.min(window.innerWidth, anchor.x));
  const y = Math.max(0, Math.min(window.innerHeight, anchor.y));
  return Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 72;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function currentMotionTime(): number {
  if (typeof window.requestAnimationFrame === 'function' && typeof window.performance?.now === 'function') {
    return window.performance.now();
  }
  return Date.now();
}

function nextAnimationFrame(callback: (now: number) => void): void {
  if (typeof window.requestAnimationFrame === 'function') {
    window.requestAnimationFrame(callback);
    return;
  }
  window.setTimeout(() => callback(Date.now()), 16);
}

function setRevealMask(snapshot: HTMLDivElement, anchor: ChatRevealAnchor, radius: number, mode: 'enter' | 'exit'): void {
  const x = Math.max(0, Math.min(window.innerWidth, anchor.x));
  const y = Math.max(0, Math.min(window.innerHeight, anchor.y));
  const r = Math.max(0, radius);
  const edge = Math.max(1, r + 1.5);
  const mask = mode === 'enter'
    ? `radial-gradient(circle at ${x}px ${y}px, transparent 0, transparent ${r}px, #000 ${edge}px)`
    : `radial-gradient(circle at ${x}px ${y}px, #000 0, #000 ${r}px, transparent ${edge}px)`;
  snapshot.style.webkitMaskImage = mask;
  snapshot.style.maskImage = mask;
  snapshot.style.webkitMaskRepeat = 'no-repeat';
  snapshot.style.maskRepeat = 'no-repeat';
}

function createRevealLayer(_anchor: ChatRevealAnchor, mode: 'enter' | 'exit'): RevealLayerParts | null {
  document.querySelectorAll('.pt-chat-reveal-layer').forEach(element => element.remove());
  const app = document.getElementById('app');
  if (!app) return null;

  const layer = document.createElement('div');
  layer.className = `pt-chat-reveal-layer is-${mode}`;

  const snapshot = document.createElement('div');
  snapshot.className = 'pt-chat-reveal-snapshot';
  const clone = app.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.classList.remove('is-exiting');
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  clone.querySelectorAll('.is-exiting').forEach(node => node.classList.remove('is-exiting'));
  clone.removeAttribute('data-tab-dir');
  clone.querySelectorAll('[data-tab-dir]').forEach(node => node.removeAttribute('data-tab-dir'));
  clone.setAttribute('aria-hidden', 'true');
  snapshot.appendChild(clone);

  layer.append(snapshot);
  document.body.appendChild(layer);
  return { layer, snapshot };
}

function cancelActiveChatReveal(): void {
  activeRevealCancel?.();
  activeRevealCancel = null;
  activeRevealSerial += 1;
  document.querySelectorAll('.pt-chat-reveal-layer').forEach(element => element.remove());
  chatRevealAnimating = false;
}

function animateReveal(parts: RevealLayerParts, anchor: ChatRevealAnchor, mode: 'enter' | 'exit', done?: () => void): void {
  const startRadius = mode === 'enter' ? Math.max(22, anchor.size || 30) : maxRevealRadius(anchor);
  const endRadius = mode === 'enter' ? maxRevealRadius(anchor) : Math.max(24, (anchor.size || 58) * 0.52);
  const duration = mode === 'enter' ? CHAT_REVEAL_ENTER_MS : CHAT_REVEAL_EXIT_MS;
  const started = currentMotionTime();
  const revealSerial = ++activeRevealSerial;
  activeRevealCancel = () => {
    if (activeRevealSerial === revealSerial) activeRevealSerial += 1;
    parts.layer.remove();
    activeRevealCancel = null;
  };

  function frame(now: number): void {
    if (activeRevealSerial !== revealSerial || !parts.layer.isConnected) return;
    const t = Math.min(1, (now - started) / duration);
    const eased = mode === 'enter' ? easeOutCubic(t) : easeInOutCubic(t);
    const radius = startRadius + (endRadius - startRadius) * eased;
    const fadeStart = 0.72;
    const opacity = mode === 'exit'
      ? 1
      : t < fadeStart ? 1 : 1 - ((t - fadeStart) / (1 - fadeStart));
    setRevealMask(parts.snapshot, anchor, radius, mode);
    parts.snapshot.style.opacity = opacity.toFixed(3);
    if (t < 1) {
      nextAnimationFrame(frame);
      return;
    }
    parts.layer.remove();
    if (activeRevealSerial === revealSerial) activeRevealCancel = null;
    done?.();
  }

  setRevealMask(parts.snapshot, anchor, startRadius, mode);
  parts.snapshot.style.opacity = '1';
  nextAnimationFrame(frame);
}

function afterNextPaint(callback: () => void): void {
  nextAnimationFrame(() => nextAnimationFrame(callback));
}

function playChatRippleEnter(renderPage: () => void): boolean {
  if (chatRevealAnimating) cancelActiveChatReveal();
  const anchor = pendingChatRevealAnchor;
  pendingChatRevealAnchor = null;
  if (!anchor) return false;
  lastChatRevealAnchor = anchor;
  chatRevealAnimating = true;
  const parts = createRevealLayer(anchor, 'enter');
  renderPage();
  if (!parts) {
    chatRevealAnimating = false;
    return true;
  }
  animateReveal(parts, anchor, 'enter', () => {
    chatRevealAnimating = false;
  });
  return true;
}

function playChatRippleExit(renderPage: () => void): boolean {
  if (chatRevealAnimating) cancelActiveChatReveal();
  const anchor = lastChatRevealAnchor ?? defaultChatRevealAnchor();
  chatRevealAnimating = true;
  const parts = createRevealLayer(anchor, 'exit');
  if (!parts) {
    renderPage();
    chatRevealAnimating = false;
    return true;
  }
  setRevealMask(parts.snapshot, anchor, maxRevealRadius(anchor), 'exit');
  parts.snapshot.style.opacity = '1';
  afterNextPaint(() => {
    renderPage();
    nextAnimationFrame(() => {
      const nextAnchor = findAnchorForReveal(anchor) ?? anchor;
      lastChatRevealAnchor = nextAnchor;
      animateReveal(parts, nextAnchor, 'exit', () => {
        chatRevealAnimating = false;
      });
    });
  });
  return true;
}

function markTransitionRoot(kind: UiTransitionKind): void {
  const root = document.documentElement;
  const direction = transitionDirection(kind);
  window.clearTimeout(transitionClearTimer);
  root.classList.add('ui-fallback-transition');
  root.setAttribute('data-ui-transition', kind);
  if (direction) root.setAttribute('data-tab-dir', direction);
}

function setTransitionPhase(phase: 'exit' | 'enter'): void {
  document.documentElement.setAttribute('data-ui-transition-phase', phase);
}

function isMainTransition(kind: UiTransitionKind): boolean {
  return kind === 'main-forward' || kind === 'main-back';
}

function isWorldTransition(kind: UiTransitionKind): boolean {
  return kind === 'world-forward' || kind === 'world-back';
}

function copyFormState(source: HTMLElement, clone: HTMLElement): void {
  const sourceFields = Array.from(source.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
  const cloneFields = Array.from(clone.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>('input, textarea, select'));
  sourceFields.forEach((field, index) => {
    const cloneField = cloneFields[index];
    if (!cloneField) return;
    cloneField.value = field.value;
    if (field instanceof HTMLInputElement && cloneField instanceof HTMLInputElement) {
      cloneField.checked = field.checked;
    }
  });
}

function copyScrollState(source: HTMLElement, clone: HTMLElement): void {
  const sourceNodes = [source, ...Array.from(source.querySelectorAll<HTMLElement>('*'))];
  const cloneNodes = [clone, ...Array.from(clone.querySelectorAll<HTMLElement>('*'))];
  sourceNodes.forEach((node, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode) return;
    cloneNode.scrollTop = node.scrollTop;
    cloneNode.scrollLeft = node.scrollLeft;
  });
}

function createMainTabSnapshot(): HTMLElement | null {
  const source = document.querySelector<HTMLElement>(MOBILE_MAIN_PAGE_SELECTOR);
  if (!source) return null;
  const rect = source.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const layer = document.createElement('div');
  layer.className = 'pt-main-tab-snapshot';
  layer.style.left = `${rect.left}px`;
  layer.style.top = `${rect.top}px`;
  layer.style.width = `${rect.width}px`;
  layer.style.height = `${rect.height}px`;

  const clone = source.cloneNode(true) as HTMLElement;
  clone.classList.add('is-exiting', 'pt-main-tab-snapshot-page');
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(element => element.removeAttribute('id'));
  clone.querySelectorAll('[autofocus]').forEach(element => element.removeAttribute('autofocus'));
  clone.setAttribute('aria-hidden', 'true');
  copyFormState(source, clone);
  layer.append(clone);
  document.body.append(layer);
  copyScrollState(source, clone);
  return layer;
}

function startMainTabTransition(kind: UiTransitionKind, renderPage: () => void): void {
  window.clearTimeout(transitionTimer);
  window.clearTimeout(transitionClearTimer);
  window.clearTimeout(transitionSnapshotTimer);
  clearUiTransitionMarker();
  clearActionExpandLayer(true);
  const snapshot = createMainTabSnapshot();
  if (!snapshot) {
    renderPage();
    return;
  }
  markTransitionRoot(kind);
  setTransitionPhase('exit');
  transitionTimer = window.setTimeout(() => {
    setTransitionPhase('enter');
    renderPage();
    snapshot.classList.add('is-overlapping-next');
    transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_MAIN_ENTER_TOTAL_MS);
  }, UI_MAIN_OVERLAP_DELAY_MS);
  transitionSnapshotTimer = window.setTimeout(() => snapshot.remove(), UI_MAIN_EXIT_TOTAL_MS);
}

function currentPageTransitionTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>([
    MOBILE_MAIN_PAGE_SELECTOR,
    '.mobile-shell > .mobile-chat-detail',
    '.desktop-shell > .chat',
    '.desktop-shell > .moments-page',
    '.desktop-shell > .events-page',
    '.desktop-shell > .timeline-page',
    '.desktop-shell > .group-list-page',
    '.desktop-shell > .desktop-settings-page',
    '.desktop-shell > .character-page',
    '.desktop-shell > .sidebar',
  ].join(',')));
}

function startStaggeredUiTransition(kind: UiTransitionKind, renderPage: () => void): void {
  const exitMs = isMainTransition(kind) ? UI_MAIN_EXIT_TOTAL_MS : UI_EXIT_MS;
  const enterMs = isMainTransition(kind) ? UI_MAIN_ENTER_TOTAL_MS : UI_ENTER_MS;
  window.clearTimeout(transitionTimer);
  window.clearTimeout(transitionClearTimer);
  window.clearTimeout(transitionSnapshotTimer);
  clearUiTransitionMarker();
  markTransitionRoot(kind);
  setTransitionPhase('exit');
  currentPageTransitionTargets().forEach(element => element.classList.add('is-exiting'));
  transitionTimer = window.setTimeout(() => {
    setTransitionPhase('enter');
    renderPage();
    transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), enterMs);
  }, exitMs);
}

function currentWorldInsightTargets(): HTMLElement[] {
  const frame = document.querySelector<HTMLElement>('.world-insight-transition-frame');
  if (!frame) return [];
  const directChildren = Array.from(frame.children).filter((element): element is HTMLElement => element instanceof HTMLElement);
  if (directChildren.length > 0) return directChildren;
  return [frame];
}

function startWorldInsightTransition(kind: UiTransitionKind, renderPage: () => void): void {
  window.clearTimeout(transitionTimer);
  window.clearTimeout(transitionClearTimer);
  clearUiTransitionMarker();
  markTransitionRoot(kind);
  setTransitionPhase('exit');
  currentWorldInsightTargets().forEach(element => element.classList.add('is-exiting'));
  transitionTimer = window.setTimeout(() => {
    setTransitionPhase('enter');
    renderPage();
    transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_WORLD_ENTER_MS);
  }, UI_WORLD_EXIT_MS);
}

function overlayExitTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>([
    '.moments-publisher.is-open',
    '.event-composer-dialog',
    '.character-panel',
    '.group-settings-panel',
    '.card-recognition-dialog',
    '.message-edit-dialog',
    '.message-choice-dialog',
    '.app-dialog',
    '.sticker-import-dialog',
    '.settings-window',
    '.settings-dialog',
    '.moments-tutorial-sheet',
  ].join(',')));
}

function startOverlayTransition(kind: UiTransitionKind, renderPage: () => void): void {
  window.clearTimeout(transitionTimer);
  window.clearTimeout(transitionClearTimer);
  markTransitionRoot(kind);
  if (kind === 'overlay-out') {
    const targets = overlayExitTargets();
    targets.forEach(element => element.classList.add('is-exiting'));
    const exitMs = targets.some(element => element.matches('.moments-publisher, .event-composer-dialog.event-composer-drop-closing'))
      ? UI_OVERLAY_SPRING_EXIT_MS
      : UI_OVERLAY_EXIT_MS;
    transitionTimer = window.setTimeout(() => {
      renderPage();
      transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_OVERLAY_ENTER_MS);
    }, exitMs);
    return;
  }
  renderPage();
  transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_OVERLAY_ENTER_MS);
}

function playActionExpand(renderPage: () => void): boolean {
  const anchor = pendingActionExpandAnchor;
  pendingActionExpandAnchor = null;
  if (!anchor) return false;

  clearUiTransitionMarker();
  const app = document.getElementById('app');
  if (!app) {
    renderPage();
    return true;
  }
  const layer = document.createElement('div');
  layer.className = 'pt-action-expand-layer';
  const serial = ++actionExpandSerial;
  actionExpandAnimating = true;

  const oldSnapshot = document.createElement('div');
  oldSnapshot.className = 'pt-action-expand-snapshot pt-action-expand-old';
  const oldClone = app.cloneNode(true) as HTMLElement;
  oldClone.removeAttribute('id');
  oldClone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  oldClone.setAttribute('aria-hidden', 'true');
  oldSnapshot.appendChild(oldClone);
  layer.append(oldSnapshot);
  document.body.append(layer);

  renderPage();
  const nextApp = document.getElementById('app');
  if (!nextApp) return true;

  const snapshot = document.createElement('div');
  snapshot.className = 'pt-action-expand-snapshot pt-action-expand-new';
  const clone = nextApp.cloneNode(true) as HTMLElement;
  clone.removeAttribute('id');
  clone.querySelectorAll('[id]').forEach(node => node.removeAttribute('id'));
  clone.setAttribute('aria-hidden', 'true');
  snapshot.appendChild(clone);
  layer.append(snapshot);

  const insetTop = Math.max(0, anchor.top);
  const insetRight = Math.max(0, window.innerWidth - anchor.left - anchor.width);
  const insetBottom = Math.max(0, window.innerHeight - anchor.top - anchor.height);
  const insetLeft = Math.max(0, anchor.left);
  const startClip = `inset(${insetTop}px ${insetRight}px ${insetBottom}px ${insetLeft}px round ${anchor.radius}px)`;
  const prefixedSnapshotStyle = snapshot.style as CSSStyleDeclaration & { webkitClipPath: string };
  snapshot.style.clipPath = startClip;
  prefixedSnapshotStyle.webkitClipPath = startClip;
  snapshot.style.opacity = '1';

  requestAnimationFrame(() => {
    layer.classList.add('is-running');
    snapshot.style.clipPath = 'inset(0 0 0 0 round 0px)';
    prefixedSnapshotStyle.webkitClipPath = 'inset(0 0 0 0 round 0px)';
  });
  actionExpandTimer = window.setTimeout(() => {
    if (actionExpandSerial !== serial) return;
    layer.remove();
    actionExpandAnimating = false;
  }, ACTION_EXPAND_MS + 70);
  return true;
}

function startViewTransitionRender(kind: UiTransitionKind, renderPage: () => void): boolean {
  const transitionDocument = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };
  if (!transitionDocument.startViewTransition) return false;
  const root = document.documentElement;
  root.setAttribute('data-ui-transition', kind);
  const transition = transitionDocument.startViewTransition(() => {
    renderPage();
  });
  void transition.finished.finally(() => clearUiTransitionMarker(kind));
  return true;
}

export function renderWithUiTransition(kind: UiTransitionKind, renderPage: () => void): void {
  if (kind === 'quiet' || reducedMotionRequested()) {
    pendingChatRevealAnchor = null;
    pendingActionExpandAnchor = null;
    renderPage();
    return;
  }
  if ((kind === 'detail-in' || kind === 'overlay-in') && pendingActionExpandAnchor && playActionExpand(renderPage)) {
    return;
  }
  if (kind === 'detail-in' && pendingChatRevealAnchor && isCompactShellVisible() && playChatRippleEnter(renderPage)) {
    return;
  }
  if (kind === 'detail-out' && isChatDetailVisible() && playChatRippleExit(renderPage)) {
    return;
  }
  pendingChatRevealAnchor = null;
  pendingActionExpandAnchor = null;
  if (kind === 'overlay-in' || kind === 'overlay-out') {
    startOverlayTransition(kind, renderPage);
    return;
  }
  if (isWorldTransition(kind)) {
    startWorldInsightTransition(kind, renderPage);
    return;
  }
  if (isMainTransition(kind) && isCompactShellVisible()) {
    startMainTabTransition(kind, renderPage);
    return;
  }
  // Big comment: startViewTransition remains available for future shared-element work, but the
  // reference APK motion is a short DOM-level slide-fade instead of whole-page snapshots.
  void startViewTransitionRender;
  startStaggeredUiTransition(kind, renderPage);
}
