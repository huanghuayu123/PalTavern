import { escapeHtml } from '../core/utils';

export type FirstRunStepId = 'model' | 'character' | 'chat';

export type FirstRunGuideState = {
  modelDone: boolean;
  characterDone: boolean;
  contentDone: boolean;
  compact?: boolean;
};

export function shouldShowFirstRunGuide(state: FirstRunGuideState): boolean {
  return !state.modelDone || !state.characterDone || !state.contentDone;
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
        <span>开始使用 PalTavern</span>
        <strong>三步就能跑起来</strong>
      </header>
      <div class="first-run-steps">
        ${steps.map(([id, title, done, copy], index) => `
          <button class="first-run-step ${done ? 'is-done' : ''}" data-first-run-step="${id}" type="button">
            <b>${done ? '✓' : index + 1}</b>
            <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(copy)}</small></span>
          </button>
        `).join('')}
      </div>
    </section>
  `;
}
