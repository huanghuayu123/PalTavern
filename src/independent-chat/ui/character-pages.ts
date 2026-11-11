// 大注释：角色状态页、角色世界书编辑、聊天顶部角色信息和关系变化摘要。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import { characterWorldBookEntryDrafts } from '../characters/settings';
import type { CharacterWorldBookEntryDraft } from '../characters/settings';
import type { CharacterProfile, CharacterRelationshipSide, RelationshipState } from '../core/types';
import { compactText, escapeHtml } from '../core/utils';
import { characterStatusFor, characterStatusLine } from '../memory/character-status';
import { renderAvatar } from './chat-surface';
import { relationshipStageLabel } from './display-labels';
import { icon } from './icons';
import { hasRecentMomentForCharacter, latestVisibleMessageFor, privateChatIdentityCharacter } from './private-chat-identity';
import { finiteNumber } from './settings-panels';

export const chatStatusShelfOpenCharacterIds = new Set<string>();

export function affinityProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

export function relationshipLabel(character: CharacterProfile): string {
  return character.relationship.summary || relationshipStageLabel(character.relationship.stage);
}

export function relationshipChanged(before: RelationshipState, after: RelationshipState): boolean {
  return before.stage !== after.stage
    || Math.round(before.affinity) !== Math.round(after.affinity)
    || before.summary.trim() !== after.summary.trim();
}

export function characterRelationshipSideChanged(before: CharacterRelationshipSide, after: CharacterRelationshipSide): boolean {
  return before.stage !== after.stage || before.summary.trim() !== after.summary.trim();
}

export function characterRelationshipChangeSummary(
  from: CharacterProfile,
  to: CharacterProfile,
  before: CharacterRelationshipSide,
  after: CharacterRelationshipSide,
): string {
  const lines: string[] = [];
  if (before.stage !== after.stage) {
    lines.push(`${from.name} → ${to.name}：${relationshipStageLabel(before.stage)} → ${relationshipStageLabel(after.stage)}`);
  }
  if (before.summary.trim() !== after.summary.trim()) {
    lines.push(after.summary.trim()
      ? `${from.name} 对 ${to.name} 的摘要：${compactText(after.summary.trim(), 120)}`
      : `${from.name} 对 ${to.name} 的摘要已清空`);
  }
  return lines.length > 0 ? lines.join('；') : '角色之间的关系已重新保存。';
}

export function relationshipChangeSummary(before: RelationshipState, after: RelationshipState): string {
  const lines: string[] = [];
  if (before.stage !== after.stage) {
    lines.push(`关系阶段：${relationshipStageLabel(before.stage)} → ${relationshipStageLabel(after.stage)}`);
  }
  const beforeAffinity = Math.round(before.affinity);
  const afterAffinity = Math.round(after.affinity);
  if (beforeAffinity !== afterAffinity) {
    const delta = afterAffinity - beforeAffinity;
    lines.push(`好感度：${beforeAffinity} → ${afterAffinity}（${delta > 0 ? '+' : ''}${delta}）`);
  }
  if (before.summary.trim() !== after.summary.trim()) {
    lines.push(after.summary.trim()
      ? `关系摘要更新为：${compactText(after.summary.trim(), 120)}`
      : '关系摘要已清空');
  }
  return lines.length > 0 ? lines.join('；') : '关系状态已重新保存。';
}

export function chatStatusShelfLine(character: CharacterProfile): string {
  const status = characterStatusFor(character);
  const latest = latestVisibleMessageFor(character);
  if (latest?.role === 'assistant') return '还在等你回那句话';
  if (status.unresolvedItems.length === 1) return '有一件事没处理';
  if (status.unresolvedItems.length > 1) return `有 ${status.unresolvedItems.length} 件事没处理`;
  if (hasRecentMomentForCharacter(character)) return '刚发了动态';
  const line = characterStatusLine(character).trim();
  return line && line !== '近况安静' ? line : '近况安静';
}

export function renderAffinityMeter(character: CharacterProfile): string {
  const value = Math.max(0, Math.round(character.relationship.affinity));
  const progress = affinityProgress(value);
  return `
    <div class="affinity-meter" style="--affinity-progress: ${progress}%">
      <div class="affinity-meter-label">
        <span>好感度</span>
        <strong>${value}</strong>
      </div>
      <div class="affinity-track" role="meter" aria-label="好感度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
        <span></span>
      </div>
      ${value > 100 ? `<small>已超过 100，进度条按 100 显示</small>` : ''}
    </div>
  `;
}

export function renderCharacterIntroCard(character: CharacterProfile, compact = false): string {
  const note = character.profileNote?.trim();
  return `
    <section class="character-intro-card ${compact ? 'compact' : ''}">
      <div class="character-intro-copy">
        <strong>${escapeHtml(character.name)} 的背景故事备注</strong>
        <p>${escapeHtml(note || '还没有背景故事备注。点头像或右上角齿轮，可以补一段来历、过去经历，或这个角色和 user 之间已经发生过什么。')}</p>
      </div>
      ${renderAffinityMeter(character)}
    </section>
  `;
}

export function renderChatStatusShelf(character?: CharacterProfile): string {
  if (!character) return '';
  const status = characterStatusFor(character);
  const isOpen = chatStatusShelfOpenCharacterIds.has(character.id);
  const unresolvedItems = status.unresolvedItems.slice(0, 3);
  const summary = chatStatusShelfLine(character);
  return `
    <section class="chat-status-shelf ${isOpen ? 'is-open' : ''}" aria-label="${escapeHtml(character.name)} 的当前状态">
      <button class="chat-status-shelf-toggle" type="button" data-chat-status-shelf="${escapeHtml(character.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <span class="chat-status-dot" aria-hidden="true"></span>
        <span class="chat-status-summary">
          <strong>${escapeHtml(summary)}</strong>
          <small>${escapeHtml(compactText(relationshipLabel(character), 72))}</small>
        </span>
        <span class="chat-status-arrow" aria-hidden="true">${isOpen ? '⌃' : '⌄'}</span>
      </button>
      ${isOpen ? `
        <div class="chat-status-expanded">
          <div class="chat-status-metrics">
            <span><small>现在</small><strong>${escapeHtml(status.mood || '近况安静')}</strong></span>
            <span><small>关系</small><strong>${escapeHtml(relationshipStageLabel(status.relationshipStage))}</strong></span>
            <span><small>未处理</small><strong>${unresolvedItems.length > 0 ? `${unresolvedItems.length} 件` : '暂时没有'}</strong></span>
            <span><small>下一步</small><strong>${escapeHtml(compactText(status.nextInclination, 60))}</strong></span>
          </div>
          <div class="chat-status-unresolved">
            <strong>未解决事项</strong>
            ${unresolvedItems.length > 0
              ? `<ul>${unresolvedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
              : '<p>暂时没有待处理事项。</p>'}
          </div>
          <div class="chat-status-actions">
            <button class="secondary chat-status-detail-button" type="button" data-open-context-preview="${escapeHtml(character.id)}">上下文预览</button>
            <button class="secondary chat-status-detail-button" type="button" data-open-character-status="${escapeHtml(character.id)}">查看完整状态</button>
          </div>
        </div>
      ` : ''}
    </section>
  `;
}

export function renderCharacterHeader(character?: CharacterProfile, backButton = false): string {
  if (!character) {
    return `
      <div class="chat-identity">
        ${backButton ? '<button class="header-back" data-mobile-back aria-label="返回">‹</button>' : ''}
        <div><strong>选择一个角色</strong><span>独立私聊会话</span></div>
      </div>
    `;
  }
  const directSpeaker = privateChatIdentityCharacter();
  if (directSpeaker && directSpeaker.id !== character.id) {
    return `
      <div class="chat-identity">
        ${backButton ? '<button class="header-back" data-mobile-back aria-label="返回">‹</button>' : ''}
        <button class="avatar header-avatar avatar-button" id="open-character-profile" type="button" aria-label="查看角色状态" data-morph="avatar:char:${escapeHtml(character.id)}" data-morph-scale="uniform">${renderAvatar(character)}</button>
        <div>
          <strong data-morph="title:char:${escapeHtml(character.id)}" data-morph-scale="uniform">${escapeHtml(character.name)}</strong>
          <span>${escapeHtml(`以 ${directSpeaker.name} 身份查看私聊`)}</span>
        </div>
      </div>
    `;
  }
  return `
    <div class="chat-identity">
      ${backButton ? '<button class="header-back" data-mobile-back aria-label="返回">‹</button>' : ''}
      <button class="avatar header-avatar avatar-button" id="open-character-profile" type="button" aria-label="查看角色状态" data-morph="avatar:char:${escapeHtml(character.id)}" data-morph-scale="uniform">${renderAvatar(character)}</button>
      <div>
        <strong data-morph="title:char:${escapeHtml(character.id)}" data-morph-scale="uniform">${escapeHtml(character.name)}</strong>
        <span>${escapeHtml(compactText(relationshipLabel(character), 54))}</span>
      </div>
    </div>
  `;
}

export function renderStatusList(title: string, items: string[], empty: string): string {
  return `
    <section class="character-status-block">
      <h3>${escapeHtml(title)}</h3>
      ${items.length > 0
        ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : `<p>${escapeHtml(empty)}</p>`}
    </section>
  `;
}

export function renderCharacterStatusPage(character: CharacterProfile): string {
  const status = characterStatusFor(character);
  const updated = status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '尚未保存';
  return `
    <section class="character-panel-page character-status-page">
      <div class="character-status-hero">
        <span class="avatar character-panel-avatar">${renderAvatar(character)}</span>
        <div class="character-panel-identity-copy">
          <span class="settings-kicker">角色状态</span>
          <h3>${escapeHtml(status.mood)}</h3>
          <p>${escapeHtml(status.summary)}</p>
        </div>
      </div>
      <div class="character-status-metrics">
        <span><strong>${escapeHtml(relationshipStageLabel(status.relationshipStage))}</strong><small>关系阶段</small></span>
        <span><strong>${status.affinity}</strong><small>好感度</small></span>
        <span><strong>${escapeHtml(status.source === 'model' ? '模型摘要' : '规则摘要')}</strong><small>来源</small></span>
      </div>
      ${status.relationshipSummary ? `
        <section class="character-status-block is-wide">
          <h3>关系摘要</h3>
          <p>${escapeHtml(status.relationshipSummary)}</p>
        </section>
      ` : ''}
      <section class="character-status-block is-wide">
        <h3>角色当前计划</h3>
        <p>${escapeHtml(character.currentPlan?.text ?? '')}</p>
        <p class="muted">来源：${escapeHtml(character.currentPlan?.source === 'model' ? '模型刷新' : '规则生成')}</p>
      </section>
      <div class="character-status-grid">
        ${renderStatusList('最近三件重要记忆', status.recentMemoryTitles, '还没有足够的重要记忆。')}
        ${renderStatusList('未解决事项', status.unresolvedItems, '暂时没有待处理事项。')}
        ${renderStatusList('最近活跃来源', status.activeSources, '最近还没有明显活跃来源。')}
        <section class="character-status-block">
          <h3>下一步倾向</h3>
          <p>${escapeHtml(status.nextInclination)}</p>
        </section>
      </div>
      <footer class="character-status-footer">
        <p class="muted">最后刷新：${escapeHtml(updated)}</p>
        <button class="secondary" id="refresh-character-plan" type="button">刷新当前计划</button>
        <button class="primary" id="refresh-character-status" type="button">刷新状态摘要</button>
      </footer>
    </section>
  `;
}

export function renderCharacterWorldBookEntryEditor(character: CharacterProfile): string {
  const entries = characterWorldBookEntryDrafts(character);
  return `
    <section class="character-worldbook-editor" aria-label="附加世界书条目">
      <header>
        <div>
          <strong>世界书</strong>
          <p class="muted">按条目收起管理，点开后再编辑关键词、正文和触发方式。</p>
        </div>
        <div class="character-worldbook-actions">
          <span class="character-worldbook-entry-count">${entries.length} 条</span>
          <button id="add-character-worldbook-entry" class="secondary" type="button">${icon('add')}<span>新增</span></button>
        </div>
      </header>
      ${entries.length > 0 ? `
        <div class="character-worldbook-list">
          ${entries.map((entry, index) => `
            <details class="character-worldbook-entry" data-worldbook-entry-id="${escapeHtml(entry.id)}">
              <summary class="character-worldbook-entry-head">
                <span>
                  <strong>${escapeHtml(entry.comment || `条目 ${index + 1}`)}</strong>
                  <small>${escapeHtml(entry.keys || '未设置关键词')}</small>
                </span>
                <em>${entry.enabled ? '启用' : '停用'}</em>
              </summary>
              <div class="character-worldbook-grid">
                <label class="field">
                  <span>标题 / 注释</span>
                  <input data-worldbook-entry-comment value="${escapeHtml(entry.comment)}" placeholder="例如：学院旧闻、某个 NPC、隐藏规则" />
                </label>
                <label class="field">
                  <span>关键词</span>
                  <input data-worldbook-entry-keys value="${escapeHtml(entry.keys)}" placeholder="多个关键词用逗号或顿号分隔" />
                </label>
                <label class="field">
                  <span>插入顺序</span>
                  <input data-worldbook-entry-order type="number" step="1" value="${entry.insertionOrder}" />
                </label>
                <label class="field">
                  <span>位置</span>
                  <input data-worldbook-entry-position type="number" step="1" value="${entry.position}" />
                </label>
              </div>
              <label class="field">
                <span>正文</span>
                <textarea data-worldbook-entry-content placeholder="触发后要交给模型看的设定内容">${escapeHtml(entry.content)}</textarea>
              </label>
              <div class="character-worldbook-switches">
                <label><input data-worldbook-entry-enabled type="checkbox" ${entry.enabled ? 'checked' : ''} />启用</label>
                <label><input data-worldbook-entry-constant type="checkbox" ${entry.constant ? 'checked' : ''} />常驻</label>
                <label><input data-worldbook-entry-selective type="checkbox" ${entry.selective ? 'checked' : ''} />选择性</label>
              </div>
              <button class="danger character-worldbook-delete" data-delete-character-worldbook-entry="${escapeHtml(entry.id)}" type="button">删除这个条目</button>
            </details>
          `).join('')}
        </div>
      ` : '<p class="muted character-worldbook-empty">还没有附加世界书条目。新增后可以像酒馆一样写关键词和正文。</p>'}
    </section>
  `;
}

export function readCharacterWorldBookEntryDraftsFromPanel(): CharacterWorldBookEntryDraft[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.character-worldbook-entry')).map((entry, index) => ({
    id: entry.dataset.worldbookEntryId ?? '',
    comment: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-comment]')?.value.trim() ?? '',
    keys: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-keys]')?.value.trim() ?? '',
    content: entry.querySelector<HTMLTextAreaElement>('[data-worldbook-entry-content]')?.value.trim() ?? '',
    enabled: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-enabled]')?.checked ?? true,
    constant: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-constant]')?.checked ?? false,
    selective: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-selective]')?.checked ?? false,
    insertionOrder: finiteNumber(entry.querySelector<HTMLInputElement>('[data-worldbook-entry-order]')?.value ?? '', index),
    position: finiteNumber(entry.querySelector<HTMLInputElement>('[data-worldbook-entry-position]')?.value ?? '', 0),
  }));
}

export function renderCharacterWorldBookPage(character: CharacterProfile): string {
  return `
    <section class="character-panel-page character-worldbook-page">
      <div class="character-worldbook-page-note">
        <strong>${escapeHtml(character.name)} 的角色世界书</strong>
        <p class="muted">每个条目可以单独设置关键词、正文、常驻和选择性触发。这里保存的是这个角色自己的附加世界书，不会改其它角色。</p>
      </div>
      ${renderCharacterWorldBookEntryEditor(character)}
      <footer class="character-worldbook-page-actions">
        <button id="save-character-worldbook" class="primary" type="button">保存世界书</button>
      </footer>
    </section>
  `;
}
