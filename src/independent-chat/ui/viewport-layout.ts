// 大注释：判断当前是手机、平板横屏还是电脑布局。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import type { LayoutMode } from './ui-types';

export const tabletLandscapeMedia = window.matchMedia('(orientation: landscape) and (min-width: 900px) and (min-height: 600px) and (max-width: 1368px)');

export const compactMedia = window.matchMedia('(max-width: 980px), (max-height: 560px) and (orientation: landscape)');

export function hasTabletTouchInput(): boolean {
  const navigatorInfo = window.navigator;
  const touchPoints = typeof navigatorInfo?.maxTouchPoints === 'number' ? navigatorInfo.maxTouchPoints : 0;
  const userAgent = navigatorInfo?.userAgent ?? '';
  return touchPoints > 0 && (
    /Android|iPad|Tablet/i.test(userAgent)
    || (/Macintosh/i.test(userAgent) && touchPoints > 1)
  );
}

export function isTabletLandscapeViewport(): boolean {
  return tabletLandscapeMedia.matches && hasTabletTouchInput();
}

export function isCompactViewport(): boolean {
  return compactMedia.matches || isTabletLandscapeViewport();
}

export function getViewportLayoutMode(): LayoutMode {
  if (isTabletLandscapeViewport()) return 'tabletLandscape';
  return isCompactViewport() ? 'mobile' : 'desktop';
}
