// Big comment: this module owns page-transition mechanics only.
// It receives the render callback from app.ts so future UI splits avoid circular imports.
export type UiTransitionKind = 'main-forward' | 'main-back' | 'detail-in' | 'detail-out' | 'overlay-in' | 'overlay-out' | 'quiet';

export type MainSectionTransitionId = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings';
export type DesktopViewTransitionId = 'chat' | 'groups' | 'world' | 'moments';

const UI_ENTER_MS = 160;
const UI_EXIT_MS = 80;
const UI_OVERLAY_ENTER_MS = 180;
const UI_OVERLAY_EXIT_MS = 120;
const CHAT_REVEAL_ENTER_MS = 420;
const CHAT_REVEAL_EXIT_MS = 280;
const UI_MAIN_NAV_ORDER: MainSectionTransitionId[] = ['messages', 'contacts', 'groups', 'world', 'moments', 'settings'];
const UI_DESKTOP_VIEW_ORDER: DesktopViewTransitionId[] = ['chat', 'groups', 'world', 'moments'];

type ChatRevealAnchor = {
  x: number;
  y: number;
  size: number;
  targetSelector: string;
};

type RevealLayerParts = {
  layer: HTMLDivElement;
  snapshot: HTMLDivElement;
  ring: HTMLDivElement;
};

let transitionTimer: number | undefined;
let transitionClearTimer: number | undefined;
let chatRevealAnimating = false;
let pendingChatRevealAnchor: ChatRevealAnchor | null = null;
let lastChatRevealAnchor: ChatRevealAnchor | null = null;
let activeRevealCancel: (() => void) | null = null;
let activeRevealSerial = 0;

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

function clearUiTransitionMarker(kind?: UiTransitionKind): void {
  const root = document.documentElement;
  if (!kind || root.getAttribute('data-ui-transition') === kind) {
    root.removeAttribute('data-ui-transition');
  }
  root.removeAttribute('data-tab-dir');
  root.removeAttribute('data-ui-transition-phase');
  root.classList.remove('ui-fallback-transition');
  document.querySelectorAll('.is-exiting').forEach(element => element.classList.remove('is-exiting'));
}

function reducedMotionRequested(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function transitionDirection(kind: UiTransitionKind): 'left' | 'right' | '' {
  if (kind === 'main-forward' || kind === 'detail-in') return 'right';
  if (kind === 'main-back' || kind === 'detail-out') return 'left';
  return '';
}

function isCompactShellVisible(): boolean {
  const nav = document.querySelector<HTMLElement>('.bottom-nav');
  return Boolean(nav && nav.offsetParent !== null);
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

function setRevealRing(ring: HTMLDivElement, anchor: ChatRevealAnchor, radius: number, opacity: number): void {
  const scale = Math.max(0.5, (radius * 2) / 56);
  ring.style.setProperty('--reveal-x', `${anchor.x}px`);
  ring.style.setProperty('--reveal-y', `${anchor.y}px`);
  ring.style.setProperty('--reveal-scale', scale.toFixed(3));
  ring.style.opacity = Math.max(0, Math.min(1, opacity)).toFixed(3);
}

function createRevealLayer(anchor: ChatRevealAnchor, mode: 'enter' | 'exit'): RevealLayerParts | null {
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

  const ring = document.createElement('div');
  ring.className = 'pt-chat-reveal-ring';
  layer.append(snapshot, ring);
  document.body.appendChild(layer);
  setRevealRing(ring, anchor, anchor.size, mode === 'enter' ? 0.62 : 0.72);
  return { layer, snapshot, ring };
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
    const fadeStart = mode === 'enter' ? 0.72 : 0.58;
    let opacity = t < fadeStart ? 1 : 1 - ((t - fadeStart) / (1 - fadeStart));
    if (mode === 'exit') opacity *= 0.92;
    setRevealMask(parts.snapshot, anchor, radius, mode);
    setRevealRing(parts.ring, anchor, radius, mode === 'enter' ? Math.min(0.72, opacity) : opacity * 0.72);
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
  parts.snapshot.style.opacity = mode === 'exit' ? '0.92' : '1';
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
  setRevealRing(parts.ring, anchor, maxRevealRadius(anchor), 0.72);
  parts.snapshot.style.opacity = '0.92';
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

function currentPageTransitionTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>([
    '.mobile-shell > .mobile-page',
    '.mobile-shell > .mobile-list-page',
    '.mobile-shell > .mobile-chat-detail',
    '.mobile-shell > .moments-page',
    '.mobile-shell > .events-page',
    '.mobile-shell > .timeline-page',
    '.mobile-shell > .group-list-page',
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
  window.clearTimeout(transitionTimer);
  window.clearTimeout(transitionClearTimer);
  clearUiTransitionMarker();
  markTransitionRoot(kind);
  setTransitionPhase('exit');
  currentPageTransitionTargets().forEach(element => element.classList.add('is-exiting'));
  transitionTimer = window.setTimeout(() => {
    setTransitionPhase('enter');
    renderPage();
    transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_ENTER_MS);
  }, UI_EXIT_MS);
}

function overlayExitTargets(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>([
    '.event-composer-dialog',
    '.character-panel',
    '.group-settings-panel',
    '.card-recognition-dialog',
    '.message-edit-dialog',
    '.message-choice-dialog',
    '.sticker-import-dialog',
    '.settings-window',
    '.settings-dialog',
    '.moments-tutorial-sheet',
  ].join(',')));
}

function startOverlayTransition(kind: UiTransitionKind, renderPage: () => void): void {
  window.clearTimeout(transitionTimer);
  markTransitionRoot(kind);
  if (kind === 'overlay-out') {
    overlayExitTargets().forEach(element => element.classList.add('is-exiting'));
    transitionTimer = window.setTimeout(() => {
      renderPage();
      transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_OVERLAY_ENTER_MS);
    }, UI_OVERLAY_EXIT_MS);
    return;
  }
  renderPage();
  transitionClearTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_OVERLAY_ENTER_MS);
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
    renderPage();
    return;
  }
  if (kind === 'detail-in' && pendingChatRevealAnchor && isCompactShellVisible() && playChatRippleEnter(renderPage)) {
    return;
  }
  if (kind === 'detail-out' && isChatDetailVisible() && playChatRippleExit(renderPage)) {
    return;
  }
  pendingChatRevealAnchor = null;
  if (kind === 'overlay-in' || kind === 'overlay-out') {
    startOverlayTransition(kind, renderPage);
    return;
  }
  // Big comment: startViewTransition remains available for future shared-element work, but the
  // reference APK motion is a short DOM-level slide-fade instead of whole-page snapshots.
  void startViewTransitionRender;
  startStaggeredUiTransition(kind, renderPage);
}
