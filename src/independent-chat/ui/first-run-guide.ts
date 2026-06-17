import { escapeHtml } from '../core/utils';

export type FirstRunStepId = 'model' | 'character' | 'chat';

export type FirstRunGuideState = {
  modelDone: boolean;
  characterDone: boolean;
  contentDone: boolean;
  dismissed: boolean;
  compact?: boolean;
};

type FirstRunGuideStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const FIRST_RUN_GUIDE_DISMISSED_KEY = 'tavern-social-first-run-guide-dismissed-v1';

function resolvedStorage(storage?: FirstRunGuideStorage): FirstRunGuideStorage | null {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function isFirstRunGuideDismissed(storage?: FirstRunGuideStorage): boolean {
  const targetStorage = resolvedStorage(storage);
  if (!targetStorage) return false;
  try {
    return targetStorage.getItem(FIRST_RUN_GUIDE_DISMISSED_KEY) === 'done';
  } catch {
    return false;
  }
}

export function markFirstRunGuideDismissed(storage?: FirstRunGuideStorage): void {
  const targetStorage = resolvedStorage(storage);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(FIRST_RUN_GUIDE_DISMISSED_KEY, 'done');
  } catch {
    // If storage is blocked, keep the guide dismissible for the current render cycle only.
  }
}

export function shouldShowFirstRunGuide(state: FirstRunGuideState): boolean {
  return !state.dismissed && (!state.modelDone || !state.characterDone || !state.contentDone);
}

export function renderFirstRunGuide(state: FirstRunGuideState): string {
  if (!shouldShowFirstRunGuide(state)) return '';
  const steps: Array<[FirstRunStepId, string, boolean, string]> = [
    ['model', '连接模型', state.modelDone, '填写 API 地址、Key 和模型名称。'],
    ['character', '准备角色', state.characterDone, '导入角色卡，或直接写一张新卡。'],
    ['chat', '开始相处', state.contentDone, '进入私聊、世界或动态，留下第一段记录。'],
  ];
  return `
    <section class="first-run-guide ${state.compact ? 'is-compact' : ''}" aria-label="新手上手路径">
      <header>
        <div>
          <span>开始使用 PalTavern</span>
          <strong>三步就能跑起来</strong>
        </div>
        <button class="first-run-guide-dismiss" id="dismiss-first-run-guide" type="button" aria-label="关闭新手引导">×</button>
      </header>
      <div class="first-run-steps">
        ${steps.map(([id, title, done, copy], index) => `
          <div class="first-run-step ${done ? 'is-done' : ''}" data-first-run-step-id="${id}">
            <b>${done ? '✓' : index + 1}</b>
            <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span>
          </div>
        `).join('')}
      </div>
    </section>
  `;
}
