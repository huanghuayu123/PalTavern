import type { CharacterProfile } from '../core/types';
import type { CharacterCardCandidate } from '../characters/cards';
import { escapeHtml } from '../core/utils';

export function renderCardImportDiagnostics(
  character: CharacterProfile,
  candidates: CharacterCardCandidate[],
): string {
  const missing = [
    character.description?.trim() ? '' : '描述',
    character.personality?.trim() ? '' : '性格',
    character.firstMessage?.trim() ? '' : '开场白',
    character.importInfo.worldBookEntryCount > 0 ? '' : '世界书',
  ].filter(Boolean);
  const actions = [
    character.description?.trim() && character.personality?.trim()
      ? ''
      : '<button class="secondary" type="button" data-card-import-action="profile">导入后补资料</button>',
    character.firstMessage?.trim()
      ? ''
      : '<button class="secondary" type="button" data-card-import-action="opening">导入后补开场白</button>',
    character.importInfo.worldBookEntryCount > 0
      ? ''
      : '<button class="secondary" type="button" data-card-import-action="worldbook">导入后写世界书</button>',
  ].filter(Boolean);
  const confidence = candidates.length > 1
    ? '检测到多个候选角色，建议只勾选你真的想拆出来的人。'
    : '识别结果比较明确。';
  return `
    <section class="card-import-diagnostics" aria-label="导入体检">
      <div><strong>识别结果</strong><span>${candidates.length} 个候选角色，原卡格式 ${escapeHtml(character.importInfo.spec || '未知')}</span></div>
      <div><strong>缺项提醒</strong><span>${missing.length > 0 ? missing.join('、') : '关键字段齐全'}</span></div>
      <div><strong>建议下一步</strong><span>${confidence}</span></div>
      ${actions.length > 0 ? `<footer>${actions.join('')}</footer>` : ''}
    </section>
  `;
}
