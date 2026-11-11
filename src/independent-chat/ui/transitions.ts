/**
 * 大注释：页面转场入口。
 * app.ts 里约 70 处导航都通过 renderWithUiTransition(kind, renderPage) 走到这里，接口保持不变；
 * 具体怎么动交给 motion.ts 的“一镜到底”引擎：
 * - detail-in / detail-out：被点的那一行或按钮长成整页，返回时缩回原处；
 * - main-*：同级标签之间横向推移；world-*：世界页分段内容横向推移；
 * - overlay-in / overlay-out：浮层从被点的位置长出来，关闭时缩回去；
 * - quiet：直接渲染。
 * 所有转场都先立刻渲染新画面再播动画，不会因为等动画而拖住输入、清掉草稿。
 */
import {
  enterDetail,
  exitDetail,
  openOverlay,
  closeOverlay,
  sourceFromElement,
  switchAxis,
  takeTapSource,
  type MotionSource,
} from './motion';

export type UiTransitionKind = 'main-forward' | 'main-back' | 'world-forward' | 'world-back' | 'detail-in' | 'detail-out' | 'overlay-in' | 'overlay-out' | 'quiet';

export type MainSectionTransitionId = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings';
export type DesktopViewTransitionId = 'chat' | 'groups' | 'world' | 'moments';

const UI_MAIN_NAV_ORDER: MainSectionTransitionId[] = ['messages', 'contacts', 'groups', 'world', 'moments', 'settings'];
const UI_DESKTOP_VIEW_ORDER: DesktopViewTransitionId[] = ['chat', 'groups', 'world', 'moments'];
const WORLD_INSIGHT_SCOPE = '.world-insight-transition-frame';

let pendingSource: MotionSource | null = null;

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

/** 点开会话行时调用：记住这一行，进入聊天时由它展开，返回时缩回它。 */
export function prepareChatRevealFromElement(trigger: HTMLElement | null): void {
  pendingSource = sourceFromElement(trigger);
}

/** 点按钮打开整页或浮层时调用：记住按钮，新画面从按钮的位置长出来。 */
export function prepareActionExpandFromElement(trigger: HTMLElement | null): void {
  pendingSource = sourceFromElement(trigger);
}

export function renderWithUiTransition(kind: UiTransitionKind, renderPage: () => void): void {
  // 小注释：显式指定的来源优先，其次用最近一次点按的元素。
  const source = pendingSource;
  pendingSource = null;
  if (kind === 'quiet') {
    renderPage();
    return;
  }
  if (kind === 'detail-in') {
    enterDetail(renderPage, source ?? takeTapSource());
    return;
  }
  if (kind === 'detail-out') {
    exitDetail(renderPage);
    return;
  }
  if (kind === 'overlay-in') {
    openOverlay(renderPage, source ?? takeTapSource());
    return;
  }
  if (kind === 'overlay-out') {
    closeOverlay(renderPage);
    return;
  }
  if (kind === 'world-forward' || kind === 'world-back') {
    switchAxis(renderPage, kind === 'world-forward' ? 1 : -1, WORLD_INSIGHT_SCOPE);
    return;
  }
  switchAxis(renderPage, kind === 'main-forward' ? 1 : -1);
}
