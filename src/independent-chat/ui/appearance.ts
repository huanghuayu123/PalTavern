/**
 * 大注释：外观设置的生效方式。
 * 主题色、深浅色、动效档位都写成 <html> 上的属性，样式按属性取值。
 * “强制浅色/深色”不复制整套深色样式：直接改样式表里 prefers-color-scheme 媒体查询的条件，
 * 跟随系统时恢复原条件。这样原有深色规则的优先级和先后顺序都不变，电脑版和手机版一视同仁。
 */
import type { AppearanceSettings } from '../core/types';

const DARK_FEATURE = /\(\s*prefers-color-scheme\s*:\s*dark\s*\)/i;
const REDUCED_MOTION_FEATURE = /\(\s*prefers-reduced-motion\s*:\s*reduce\s*\)/i;

type MediaSwitch = { rule: CSSMediaRule; original: string[] };
type MediaSwitchMode = 'system' | 'on' | 'off';

let darkRules: MediaSwitch[] | null = null;
let reducedMotionRules: MediaSwitch[] = [];
let appliedMediaKey = '';
let waitingForStylesheet = false;

function mediaQueries(rule: CSSMediaRule): string[] {
  const queries: string[] = [];
  for (let index = 0; index < rule.media.length; index += 1) {
    const query = rule.media.item(index);
    if (query) queries.push(query);
  }
  return queries;
}

function collectMediaSwitches(): boolean {
  const dark: MediaSwitch[] = [];
  const reduced: MediaSwitch[] = [];
  let readable = false;
  Array.from(document.styleSheets).forEach(sheet => {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      return;
    }
    readable = readable || rules.length > 0;
    Array.from(rules).forEach(rule => {
      if (!(rule instanceof CSSMediaRule)) return;
      const original = mediaQueries(rule);
      if (original.some(query => DARK_FEATURE.test(query))) dark.push({ rule, original });
      if (original.some(query => REDUCED_MOTION_FEATURE.test(query))) reduced.push({ rule, original });
    });
  });
  if (!readable) return false;
  darkRules = dark;
  reducedMotionRules = reduced;
  return true;
}

function switchMedia(entry: MediaSwitch, feature: RegExp, mode: MediaSwitchMode): void {
  const next = entry.original.map(query => {
    if (mode === 'system' || !feature.test(query)) return query;
    // 小注释：打开时把这一项条件换成恒成立的 (min-width: 0px)，关闭时整条换成 not all。
    return mode === 'on' ? query.replace(feature, '(min-width: 0px)') : 'not all';
  });
  const text = next.join(', ');
  if (entry.rule.media.mediaText !== text) entry.rule.media.mediaText = text;
}

function waitForStylesheet(settings: AppearanceSettings): void {
  if (waitingForStylesheet) return;
  waitingForStylesheet = true;
  const retry = () => {
    waitingForStylesheet = false;
    applyAppearance(settings);
  };
  const link = document.querySelector<HTMLLinkElement>('link[rel="stylesheet"]');
  if (link) link.addEventListener('load', retry, { once: true });
  else window.addEventListener('load', retry, { once: true });
}

export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function effectiveColorScheme(settings: AppearanceSettings): 'light' | 'dark' {
  if (settings.colorScheme === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return settings.colorScheme;
}

export function applyAppearance(settings: AppearanceSettings): void {
  const root = document.documentElement;
  if (root.getAttribute('data-accent') !== settings.accent) root.setAttribute('data-accent', settings.accent);
  if (root.getAttribute('data-color-scheme') !== settings.colorScheme) root.setAttribute('data-color-scheme', settings.colorScheme);
  if (root.getAttribute('data-motion') !== settings.motion) root.setAttribute('data-motion', settings.motion);
  // 小注释：强制深浅色时，输入框、滚动条这类系统控件也要跟着变。
  root.style.colorScheme = settings.colorScheme === 'system' ? '' : settings.colorScheme;

  const mediaKey = `${settings.colorScheme}|${settings.motion}`;
  if (mediaKey === appliedMediaKey) return;
  if (!darkRules && !collectMediaSwitches()) {
    waitForStylesheet(settings);
    return;
  }
  const darkMode: MediaSwitchMode = settings.colorScheme === 'system' ? 'system' : settings.colorScheme === 'dark' ? 'on' : 'off';
  (darkRules ?? []).forEach(entry => switchMedia(entry, DARK_FEATURE, darkMode));
  reducedMotionRules.forEach(entry => switchMedia(entry, REDUCED_MOTION_FEATURE, settings.motion === 'reduced' ? 'on' : 'system'));
  appliedMediaKey = mediaKey;
}
