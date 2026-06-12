// Big comment: this module owns page-transition mechanics only.
// It receives the render callback from app.ts so future UI splits avoid circular imports.
export type UiTransitionKind = 'main-forward' | 'main-back' | 'detail-in' | 'detail-out' | 'overlay-in' | 'overlay-out' | 'quiet';

export type MainSectionTransitionId = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings';
export type DesktopViewTransitionId = 'chat' | 'groups' | 'world' | 'moments';

const UI_TRANSITION_MS = 180;
const UI_MAIN_NAV_ORDER: MainSectionTransitionId[] = ['messages', 'contacts', 'world', 'moments', 'settings'];
const UI_DESKTOP_VIEW_ORDER: DesktopViewTransitionId[] = ['chat', 'groups', 'world', 'moments'];

let fallbackTransitionTimer: number | undefined;

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

function clearUiTransitionMarker(kind: UiTransitionKind): void {
  const root = document.documentElement;
  if (root.getAttribute('data-ui-transition') === kind) {
    root.removeAttribute('data-ui-transition');
  }
  root.classList.remove('ui-fallback-transition');
}

function reducedMotionRequested(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function startFallbackUiTransition(kind: UiTransitionKind): void {
  const root = document.documentElement;
  window.clearTimeout(fallbackTransitionTimer);
  root.classList.add('ui-fallback-transition');
  root.setAttribute('data-ui-transition', kind);
  fallbackTransitionTimer = window.setTimeout(() => clearUiTransitionMarker(kind), UI_TRANSITION_MS + 90);
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
    renderPage();
    return;
  }
  // Big comment: transitions wrap only user-triggered navigation, detail, and overlay changes.
  // Background scheduler updates and input-idle refreshes must stay quiet so drafts, focus, and mobile keyboards are not disturbed.
  if (startViewTransitionRender(kind, renderPage)) {
    return;
  }
  startFallbackUiTransition(kind);
  renderPage();
}
