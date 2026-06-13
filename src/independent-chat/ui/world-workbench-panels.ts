import type {
  CharacterProfile,
  MemorySuggestion,
  TimelineEntry,
  WorldEvent,
} from '../core/types';
import { relationshipSideFor } from '../characters/relationships';
import { quietBriefText, todayBriefForActiveWorld } from '../memory/daily-brief';
import {
  memorySuggestionsForActiveWorld,
  pendingMemorySuggestionsForActiveWorld,
} from '../memory/suggestions';
import { timelineForActiveWorld } from '../memory/timeline';
import { activeWorldChapter, chaptersForWorld } from '../world/chapters';
import { activeWorld, state } from '../core/state';
import { compactText, escapeHtml } from '../core/utils';
import { formatConversationTime, relationshipStageLabel } from './display-labels';
import { icon } from './icons';

export type WorldWorkbenchPanelContext = {
  timelineNoteDraft: string;
  renderTimeline: () => string;
  renderEventParticipantNames: (event: WorldEvent) => string;
  relationshipLabel: (character: CharacterProfile) => string;
};

export function renderWorldContinuePanel(
  events: WorldEvent[],
  character: CharacterProfile | undefined,
  context: WorldWorkbenchPanelContext,
): string {
  const brief = todayBriefForActiveWorld();
  const pendingCount = pendingMemorySuggestionsForActiveWorld().length;
  const nextEvent = events.find(event => event.status === 'active') ?? events[0];
  const suggestedCharacterId = brief?.suggestedCharacterIds.find(id =>
    state.characters.some(item => item.id === id && item.worldId === activeWorld().id),
  );
  const suggestedCharacter = suggestedCharacterId
    ? state.characters.find(item => item.id === suggestedCharacterId)
    : character;
  const briefText = brief
    ? compactText(brief.sections[0] ?? brief.summary, 100)
    : quietBriefText();
  const nextTitle = nextEvent
    ? nextEvent.title
    : suggestedCharacter ? `找 ${suggestedCharacter.name} 继续聊` : '开始一段日常';
  const nextMeta = nextEvent
    ? `${nextEvent.status === 'active' ? '进行中' : '已归档'} · ${context.renderEventParticipantNames(nextEvent)}`
    : suggestedCharacter ? context.relationshipLabel(suggestedCharacter) : '今天还没有片段';
  return `
    <section class="world-continue-panel" aria-label="今日续玩">
      <div class="world-continue-main">
        <span class="timeline-type">今日续玩</span>
        <strong>${escapeHtml(nextTitle)}</strong>
        <p>${escapeHtml(briefText)}</p>
        <footer>
          <span>${escapeHtml(nextMeta)}</span>
          <span>${pendingCount > 0 ? `${pendingCount} 条记忆待确认` : '暂无待确认记忆'}</span>
        </footer>
      </div>
      ${nextEvent
        ? `<button class="secondary" data-open-world-event-rp="${escapeHtml(nextEvent.id)}" type="button">${icon('message')}<span>继续</span></button>`
        : `<button class="primary" data-open-event-composer type="button">${icon('add')}<span>开始日常</span></button>`}
    </section>
  `;
}

function renderMemorySuggestionItem(suggestion: MemorySuggestion): string {
  const names = suggestion.characterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return `
    <article class="memory-suggestion-item" data-memory-suggestion="${escapeHtml(suggestion.id)}">
      <div class="memory-suggestion-copy">
        <label class="field compact-field">
          <span>标题</span>
          <input data-memory-suggestion-title="${escapeHtml(suggestion.id)}" value="${escapeHtml(suggestion.title)}" />
        </label>
        <label class="field compact-field">
          <span>记忆内容</span>
          <textarea data-memory-suggestion-summary="${escapeHtml(suggestion.id)}">${escapeHtml(suggestion.summary)}</textarea>
        </label>
        <p>${escapeHtml(suggestion.reason || 'AI 认为这件事可能影响后续 RP。')}</p>
        <footer>
          <span>${names.length > 0 ? escapeHtml(names.join('、')) : '整个世界'}</span>
          <label class="memory-context-toggle">
            <input data-memory-suggestion-context="${escapeHtml(suggestion.id)}" type="checkbox" ${suggestion.includeInContext ? 'checked' : ''} />
            <span>进入上下文</span>
          </label>
        </footer>
      </div>
      <div class="memory-suggestion-actions">
        <button class="primary" data-accept-memory-suggestion="${escapeHtml(suggestion.id)}" type="button">保存</button>
        <button class="secondary" data-dismiss-memory-suggestion="${escapeHtml(suggestion.id)}" type="button">忽略</button>
      </div>
    </article>
  `;
}

function renderMemorySuggestionQueue(): string {
  const suggestions = pendingMemorySuggestionsForActiveWorld();
  if (suggestions.length === 0) {
    return '<div class="memory-vault-empty"><strong>没有待确认记忆</strong><span>结束事件、保存记录或记住一句聊天后，AI 会在这里给出草稿。</span></div>';
  }
  return suggestions.map(renderMemorySuggestionItem).join('');
}

function renderMemoryTimelineRows(entries: TimelineEntry[], empty: string): string {
  if (entries.length === 0) return `<div class="memory-vault-empty"><span>${escapeHtml(empty)}</span></div>`;
  return entries.map(entry => `
    <article class="memory-vault-row ${entry.revokedAt ? 'is-revoked' : ''}">
      <div>
        <strong>${escapeHtml(entry.title)}</strong>
        <p>${escapeHtml(compactText(entry.summary, 120))}</p>
        <small>${escapeHtml(formatConversationTime(entry.createdAt))} · ${entry.revokedAt ? '已撤销' : entry.includeInContext ? '进入上下文' : '仅保存'}</small>
      </div>
      ${entry.revokedAt ? '' : `
        <button class="secondary small-button" data-toggle-timeline-context="${escapeHtml(entry.id)}" type="button">
          ${entry.includeInContext ? '设为仅保存' : '进入上下文'}
        </button>
      `}
    </article>
  `).join('');
}

function renderMemoryVault(): string {
  const suggestions = memorySuggestionsForActiveWorld();
  const accepted = suggestions.filter(suggestion => suggestion.status === 'accepted');
  const entries = timelineForActiveWorld();
  const acceptedEntryIds = new Set(accepted.map(suggestion => suggestion.acceptedTimelineEntryId).filter(Boolean));
  const savedEntries = entries
    .filter(entry => !entry.revokedAt && (acceptedEntryIds.size === 0 || acceptedEntryIds.has(entry.id) || entry.type === 'manual_note'))
    .slice(0, 8);
  const revokedEntries = entries.filter(entry => entry.revokedAt).slice(0, 6);
  return `
    <section class="world-drawer-section memory-vault-section">
      <h3>记忆保险柜</h3>
      <div class="memory-vault-group">
        <div class="memory-vault-title"><strong>待确认</strong><span>${pendingMemorySuggestionsForActiveWorld().length} 条</span></div>
        ${renderMemorySuggestionQueue()}
      </div>
      <details class="world-drawer-details" open>
        <summary>已保存记忆 · ${savedEntries.length} 条</summary>
        <div class="memory-vault-list">${renderMemoryTimelineRows(savedEntries, '还没有确认保存的长期记忆。')}</div>
      </details>
      <details class="world-drawer-details">
        <summary>已撤销 · ${revokedEntries.length} 条</summary>
        <div class="memory-vault-list">${renderMemoryTimelineRows(revokedEntries, '暂时没有撤销过的记忆影响。')}</div>
      </details>
    </section>
  `;
}

export function renderWorldChapterPanel(): string {
  const chapter = activeWorldChapter();
  const chapters = chaptersForWorld();
  const activeScene = chapter?.scenes.find(scene => scene.id === chapter.activeSceneId);
  return `
    <section class="world-chapter-panel" aria-label="长 RP 章节">
      <header>
        <div>
          <span>长 RP 章节</span>
          <strong>${escapeHtml(chapter?.title ?? '还没有章节')}</strong>
          <small>${escapeHtml(activeScene ? `当前场景：${activeScene.title}` : chapter ? '还没有场景' : '把一段长期剧情收进章节里')}</small>
        </div>
        <div class="world-chapter-actions">
          <button class="secondary small-button" data-create-world-chapter type="button">新章节</button>
          <button class="secondary small-button" data-create-world-scene type="button" ${chapter && chapter.status === 'active' ? '' : 'disabled'}>新场景</button>
          <button class="secondary small-button" data-end-world-scene type="button" ${chapter?.activeSceneId ? '' : 'disabled'}>结束场景</button>
          <button class="secondary small-button danger-soft" data-end-world-chapter type="button" ${chapter ? '' : 'disabled'}>结束章节</button>
        </div>
      </header>
      ${chapters.length > 0 ? `
        <div class="world-chapter-list">
          ${chapters.slice(0, 4).map(item => `
            <button class="world-chapter-chip ${chapter?.id === item.id ? 'is-active' : ''}" data-set-world-chapter="${escapeHtml(item.id)}" type="button">
              <span>${escapeHtml(item.title)}</span>
              <small>${item.status === 'ended' ? '已结束' : `${item.scenes.filter(scene => scene.status === 'active').length || item.scenes.length} 场景`}</small>
            </button>
          `).join('')}
        </div>
      ` : '<p class="muted">适合存放长线剧情、约会篇章、任务线或一整晚的 RP。</p>'}
      ${chapter && chapter.scenes.length > 0 ? `
        <div class="world-scene-list">
          ${chapter.scenes.slice(-4).map(scene => `
            <button class="world-scene-chip ${chapter.activeSceneId === scene.id ? 'is-active' : ''}" data-set-world-scene="${escapeHtml(scene.id)}" data-world-scene-chapter="${escapeHtml(chapter.id)}" type="button" ${scene.status === 'ended' ? 'disabled' : ''}>
              <span>${escapeHtml(scene.title)}</span>
              <small>${scene.status === 'ended' ? '已结束' : '进行中'}</small>
            </button>
          `).join('')}
        </div>
      ` : ''}
    </section>
  `;
}

export function renderRelationshipMapPanel(): string {
  const worldId = activeWorld().id;
  const relationships = state.characterRelationships.filter(item => item.worldId === worldId);
  const suggestions = state.characterRelationshipSuggestions.filter(item => !item.appliedAt && !item.ignoredAt && item.worldId === worldId);
  if (relationships.length === 0 && suggestions.length === 0) {
    return `
      <section class="relationship-map-panel">
        <header><span>关系地图</span><strong>还没有角色关系</strong></header>
        <p class="muted">群聊、事件结算或手动关系调整后，这里会出现角色之间的关系线。</p>
      </section>
    `;
  }
  return `
    <section class="relationship-map-panel" aria-label="关系地图">
      <header>
        <div><span>关系地图</span><strong>${relationships.length} 条关系线</strong></div>
        ${suggestions.length > 0 ? `<small>${suggestions.length} 条阶段建议待处理</small>` : ''}
      </header>
      <div class="relationship-map-list">
        ${relationships.slice(0, 6).map(relationship => {
          const first = state.characters.find(character => character.id === relationship.characterAId);
          const second = state.characters.find(character => character.id === relationship.characterBId);
          const firstSide = first ? relationshipSideFor(relationship, first.id) : relationship.aToB;
          const secondSide = second ? relationshipSideFor(relationship, second.id) : relationship.bToA;
          return `
            <article class="relationship-map-row">
              <strong>${escapeHtml(first?.name ?? '角色')} ↔ ${escapeHtml(second?.name ?? '角色')}</strong>
              <p>${escapeHtml(relationshipStageLabel(firstSide.stage))} / ${escapeHtml(relationshipStageLabel(secondSide.stage))}</p>
              <small>${escapeHtml(compactText(firstSide.summary || secondSide.summary || '暂无摘要', 110))}</small>
            </article>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

export function renderMemoryInboxPanel(): string {
  const pending = pendingMemorySuggestionsForActiveWorld();
  return `
    <section class="memory-inbox-panel" aria-label="记忆收件箱">
      <header>
        <div><span>记忆收件箱</span><strong>${pending.length > 0 ? `${pending.length} 条待确认` : '暂无待确认'}</strong></div>
        <small>确认后会进入世界上下文</small>
      </header>
      ${pending.length > 0
        ? `<div class="memory-inbox-list">${pending.slice(0, 3).map(renderMemorySuggestionItem).join('')}</div>`
        : '<div class="memory-vault-empty"><strong>还没有新的记忆建议</strong><span>事件结束、重要聊天或手动记录后，这里会把可沉淀的内容集中起来。</span></div>'}
    </section>
  `;
}

export function renderWorldDrawerTimeline(context: WorldWorkbenchPanelContext): string {
  const entries = timelineForActiveWorld();
  const recentEntries = entries.slice(0, 3);
  return `
    ${renderMemoryVault()}
    <section class="world-drawer-section world-memory-section">
      <h3>手动记录</h3>
      <div class="world-memory-mini">
        ${recentEntries.length > 0
          ? recentEntries.map(entry => `<span><small>${escapeHtml(formatConversationTime(entry.createdAt))}</small>${escapeHtml(compactText(entry.summary || entry.title, 72))}</span>`).join('')
          : '<span><small>暂无</small>还没有世界记忆。</span>'}
      </div>
      <form class="timeline-note-form" id="timeline-note-form">
        <label class="field">
          <span>手动记录</span>
          <textarea id="timeline-note-input" placeholder="记下一件这个世界应该记住的日常小事…">${escapeHtml(context.timelineNoteDraft)}</textarea>
        </label>
        <footer>
          <p class="muted">保存后会进入当前世界的长期记忆。</p>
          <button class="primary" type="submit">保存记忆</button>
        </footer>
      </form>
      <details class="world-drawer-details">
        <summary>完整时间线 · ${entries.length} 条</summary>
        <div class="timeline-feed world-drawer-timeline-feed">${context.renderTimeline()}</div>
      </details>
    </section>
  `;
}
