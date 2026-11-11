// 大注释：世界页的纯渲染与小工具：日常片段大厅、RP 旁白片段、关系网、时间线、记忆总结卡片。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import { relationshipSideFor } from '../characters/relationships';
import { activeWorld, state } from '../core/state';
import { formatCompanionDateTime } from '../core/time';
import type { CharacterProfile, CharacterRelationshipRecord, MemorySummary, RelationshipStage, TimelineEntry, WorldEvent, WorldEventLeadActor, WorldEventRpMessage } from '../core/types';
import { compactText, escapeHtml } from '../core/utils';
import { quietBriefText, todayBriefForActiveWorld } from '../memory/daily-brief';
import { rollbackStateForTimelineEntry } from '../memory/impacts';
import { summaryLayerLabel } from '../memory/summaries';
import { timelineForActiveWorld } from '../memory/timeline';
import { eventTypeLabel, worldEventRpMessageVariantInfo, worldEventRpMessages } from '../social/events';
import { avatarToneAttribute, renderAvatar } from './chat-surface';
import { formatConversationTime, relationshipStageLabel, timelineSourceLabel, timelineTypeLabel } from './display-labels';
import { icon } from './icons';
import { parseRpRenderSegments } from './rp-rendering';
import type { RpRenderSegment } from './rp-rendering';
import type { UiTransitionKind } from './transitions';
import type { EventComposerDraft, WorldEventSettingsPanelContext, WorldInsightTab, WorldTimelineTypeFilter } from './ui-types';

export const WORLD_INSIGHT_TABS: Array<{ value: WorldInsightTab; label: string }> = [
  { value: 'events', label: '小事件' },
  { value: 'relationships', label: '关系' },
  { value: 'timeline', label: '时间线' },
];

export const WORLD_TIMELINE_FILTERS: Array<{ value: WorldTimelineTypeFilter; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'event', label: timelineTypeLabel('event') },
  { value: 'relationship', label: timelineTypeLabel('relationship') },
  { value: 'chat', label: timelineTypeLabel('chat') },
  { value: 'group_chat', label: timelineTypeLabel('group_chat') },
  { value: 'moment', label: timelineTypeLabel('moment') },
  { value: 'comment', label: timelineTypeLabel('comment') },
  { value: 'auto_message', label: timelineTypeLabel('auto_message') },
  { value: 'daily_brief', label: timelineTypeLabel('daily_brief') },
  { value: 'character_status', label: timelineTypeLabel('character_status') },
  { value: 'character_interaction', label: timelineTypeLabel('character_interaction') },
  { value: 'manual_note', label: timelineTypeLabel('manual_note') },
  { value: 'system', label: timelineTypeLabel('system') },
];

export function isWorldInsightTab(value: unknown): value is WorldInsightTab {
  return value === 'events' || value === 'relationships' || value === 'timeline';
}

export function worldInsightTransition(from: WorldInsightTab, to: WorldInsightTab): UiTransitionKind {
  if (from === to) return 'quiet';
  const fromIndex = WORLD_INSIGHT_TABS.findIndex(tab => tab.value === from);
  const toIndex = WORLD_INSIGHT_TABS.findIndex(tab => tab.value === to);
  if (fromIndex < 0 || toIndex < 0) return 'world-forward';
  return toIndex > fromIndex ? 'world-forward' : 'world-back';
}

export function isWorldTimelineTypeFilter(value: unknown): value is WorldTimelineTypeFilter {
  return typeof value === 'string' && WORLD_TIMELINE_FILTERS.some(filter => filter.value === value);
}

export function nonEmptyStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => key && typeof item === 'string' && item.length > 0);
  return Object.fromEntries(entries) as Record<string, string>;
}

export function isWorldEventLeadActor(value: unknown): value is WorldEventLeadActor {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Record<string, unknown>;
  return (actor.type === 'user' || actor.type === 'character')
    && typeof actor.id === 'string'
    && typeof actor.name === 'string';
}

export function normalizeEventDraft(value: unknown): EventComposerDraft {
  const draft = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const participantIds = Array.isArray(draft.participantIds)
    ? draft.participantIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : typeof draft.participantId === 'string' && draft.participantId
      ? [draft.participantId]
      : [];
  return {
    mode: draft.mode === 'manual' ? 'manual' : 'auto',
    title: typeof draft.title === 'string' ? draft.title : '',
    description: typeof draft.description === 'string' ? draft.description : '',
    eventType: draft.eventType === 'relationship' || draft.eventType === 'problem' || draft.eventType === 'news'
      ? draft.eventType
      : draft.eventType === 'daily' ? 'daily' : undefined,
    participantIds,
    leadActor: isWorldEventLeadActor(draft.leadActor) ? draft.leadActor : undefined,
    affinityDelta: typeof draft.affinityDelta === 'string' ? draft.affinityDelta : '0',
    privateEventSuggestionId: typeof draft.privateEventSuggestionId === 'string' ? draft.privateEventSuggestionId : undefined,
  };
}

export function renderEventAvatars(event: WorldEvent): string {
  const participants = event.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id))
    .filter((character): character is CharacterProfile => Boolean(character));
  if (participants.length === 0) {
    return '<span class="event-avatar world-avatar" data-avatar-tone="world">岛</span>';
  }
  return participants.slice(0, 4).map(character =>
    `<span class="event-avatar" title="${escapeHtml(character.name)}"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>`,
  ).join('');
}

export function renderEventParticipantNames(event: WorldEvent): string {
  const names = event.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const leadName = event.leadActor?.name && !names.includes(event.leadActor.name)
    ? event.leadActor.name
    : '';
  return [leadName, ...names].filter(Boolean).join('、') || '整个世界';
}

export function renderTimelineCharacters(entry: TimelineEntry): string {
  const names = entry.characterIds
    .map(id => entry.characterNames[id] ?? state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return '<span>整个世界</span>';
  return names.map(name => `<span>${escapeHtml(name)}</span>`).join('');
}

export function timelineCharacterText(entry: TimelineEntry): string {
  return entry.characterIds
    .map(id => entry.characterNames[id] ?? state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join('、') || '整个世界';
}

export function renderTimelineDetails(entry: TimelineEntry): string {
  const contextState = entry.revokedAt
    ? '已撤销影响，不进入模型上下文'
    : entry.includeInContext ? '允许进入近期模型上下文' : '仅作为世界记录保存';
  return `
    <details class="timeline-details">
      <summary>查看详情</summary>
      <dl>
        <div><dt>来源</dt><dd>${escapeHtml(timelineSourceLabel(entry))}</dd></div>
        <div><dt>关联</dt><dd>${escapeHtml(timelineCharacterText(entry))}</dd></div>
        <div><dt>记录时间</dt><dd>${escapeHtml(new Date(entry.createdAt).toLocaleString())}</dd></div>
        <div><dt>上下文状态</dt><dd>${escapeHtml(contextState)}</dd></div>
        ${entry.revokedAt ? `<div><dt>撤销时间</dt><dd>${escapeHtml(new Date(entry.revokedAt).toLocaleString())}</dd></div>` : ''}
      </dl>
    </details>
  `;
}

export function renderTimeline(): string {
  const entries = timelineForActiveWorld();
  if (entries.length === 0) {
    return '<div class="moments-empty"><strong>还没有世界记录</strong><span>发布动态、创建事件，或手动记下一件应该被这个世界记住的事。</span></div>';
  }
  return entries.map(entry => {
    const rollbackState = rollbackStateForTimelineEntry(entry);
    return `
    <article class="timeline-card ${entry.revokedAt ? 'is-revoked' : ''}" data-timeline-entry="${escapeHtml(entry.id)}">
      <div class="timeline-card-head">
        <span class="timeline-type">${escapeHtml(timelineTypeLabel(entry.type))}</span>
        <time>${formatConversationTime(entry.createdAt)}</time>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="timeline-characters">${renderTimelineCharacters(entry)}</div>
      <div class="timeline-meta">
        <span>${entry.revokedAt ? '已撤销，不再进入上下文' : entry.includeInContext ? '进入上下文' : '仅作记录'}</span>
        ${rollbackState?.canRollback ? '<span>可撤销影响</span>' : rollbackState?.rolledBackAt ? '<span>影响已撤销</span>' : ''}
      </div>
      ${renderTimelineDetails(entry)}
      ${!entry.revokedAt || rollbackState?.canRollback ? `
        <footer class="timeline-card-actions">
          ${!entry.revokedAt ? `<button class="secondary" type="button" data-toggle-timeline-context="${escapeHtml(entry.id)}">${entry.includeInContext ? '设为仅保存' : '进入上下文'}</button>` : ''}
          ${rollbackState?.canRollback ? `<button class="secondary" type="button" data-rollback-timeline="${escapeHtml(entry.id)}">撤销影响</button>` : ''}
        </footer>
      ` : ''}
    </article>
  `;
  }).join('');
}

export function renderDailyBriefCard(): string {
  const brief = todayBriefForActiveWorld();
  if (!brief) {
    return `
      <section class="daily-brief-card is-quiet">
        <div>
          <span class="timeline-type">今日简报</span>
          <h3>今天暂时安静</h3>
          <p>${escapeHtml(quietBriefText())}</p>
        </div>
      </section>
    `;
  }
  const suggestedNames = brief.suggestedCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return `
    <section class="daily-brief-card">
      <div class="daily-brief-head">
        <span class="timeline-type">今日简报</span>
        <small>${escapeHtml(brief.dateKey)}</small>
      </div>
      <h3>${escapeHtml(brief.title)}</h3>
      <div class="daily-brief-sections">
        ${brief.sections.map(section => `<p>${escapeHtml(section)}</p>`).join('')}
      </div>
      <footer>
        <span>${brief.changeCount} 项变化</span>
        <span>${brief.unreadCount} 条未读</span>
        ${suggestedNames.length > 0 ? `<span>建议关注：${escapeHtml(suggestedNames.join('、'))}</span>` : ''}
      </footer>
    </section>
  `;
}

export function renderDailyBriefBanner(): string {
  const brief = todayBriefForActiveWorld();
  const title = brief ? `${brief.changeCount} 项今日变化` : '今天暂时安静';
  const summary = brief
    ? compactText(brief.sections[0] ?? brief.summary, 86)
    : quietBriefText();
  return `
    <button class="daily-brief-banner" type="button" data-open-timeline>
      <span>${icon('timeline')}</span>
      <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(summary)}</small></span>
    </button>
  `;
}

export function renderWorldStageHeader(): string {
  const world = activeWorld();
  const location = world.currentLocation.trim() || '日常生活场景';
  const atmosphere = world.sceneAtmosphere.trim() || '轻松、自然、适合日常 RP';
  return `
    <div class="world-stage-header" aria-label="当前 RP 舞台">
      <strong>${escapeHtml(world.name)}</strong>
      <span>${escapeHtml(location)} · ${escapeHtml(atmosphere)}</span>
      <small>${escapeHtml(formatCompanionDateTime(state))}</small>
    </div>
  `;
}

export function renderEventSettingsSurfaceName(surface: WorldEventSettingsPanelContext['surface']): string {
  return surface === 'drawer' ? '世界抽屉' : '独立设置页';
}

export function renderWorldEventSettingsPreview(event: WorldEvent, character?: CharacterProfile): string {
  const messageCount = worldEventRpMessages(event.id).length;
  const eventId = escapeHtml(event.id);
  return `
    <div class="event-swipe-row" data-event-swipe-row="${eventId}">
      <div class="event-swipe-actions">
        <button class="event-swipe-delete" data-delete-event="${eventId}" type="button" tabindex="-1" aria-hidden="true">删除</button>
      </div>
      <button class="event-settings-preview world-event-entry-card event-swipe-content" data-open-world-event-rp="${eventId}" type="button">
      <div class="event-avatar-stack">${renderEventAvatars(event)}</div>
      <div class="world-event-entry-main">
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(worldEventRpPreview(event, character))}</p>
        <footer class="world-event-entry-meta">
          <span>${escapeHtml(renderEventParticipantNames(event))}</span>
          <span>${messageCount > 0 ? `${messageCount} 条` : escapeHtml(eventTypeLabel(event.type))}</span>
          <span class="world-event-entry-status ${event.status === 'resolved' ? 'is-resolved' : ''}">${event.status === 'resolved' ? '已归档' : '进行中'}</span>
        </footer>
        </div>
      </button>
    </div>
  `;
}

export function characterForRpSpeaker(speaker?: string): CharacterProfile | undefined {
  const normalized = speaker?.trim();
  if (!normalized) return undefined;
  return state.characters.find(character =>
    character.worldId === activeWorld().id
    && (character.name === normalized || character.nickname === normalized),
  );
}

export function renderRpSegment(segment: RpRenderSegment, fallbackCharacter?: CharacterProfile): string {
  if (segment.kind === 'narration') {
    return `
      <article class="narrative-card">
        <span class="render-label">旁白</span>
        <p class="narrative-text">${escapeHtml(segment.text)}</p>
      </article>
    `;
  }
  const speakerCharacter = characterForRpSpeaker(segment.speaker) ?? fallbackCharacter;
  const speakerName = segment.speaker || speakerCharacter?.name || '角色';
  const emotion = segment.kind === 'thought' ? `内心 · ${segment.emotion ?? '日常'}` : segment.emotion ?? '日常';
  return `
    <div class="dialogue-turn">
      <span class="avatar"${avatarToneAttribute(speakerCharacter)}>${speakerCharacter ? renderAvatar(speakerCharacter) : escapeHtml(speakerName.slice(0, 1))}</span>
      <div class="dialogue-bubble">
        <div class="dialogue-head">
          <span class="dialogue-name">${escapeHtml(speakerName)}</span>
          <span class="emotion-chip">${escapeHtml(emotion)}</span>
        </div>
        <p class="dialogue-line">${escapeHtml(segment.text)}</p>
      </div>
    </div>
  `;
}

export function renderWorldEventNarration(event: WorldEvent): string {
  const resultText = event.decision?.result
    ? `\n\n收束：${event.decision.result}`
    : '';
  const statusText = event.status === 'resolved' ? '已写入记忆' : '正在发生';
  return `
    <article class="narrative-card world-event-narration">
      <span class="render-label">世界小事件 · ${escapeHtml(statusText)}</span>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="narrative-text">${escapeHtml(`${event.description}${resultText}`)}</p>
      <footer>
        <span>${escapeHtml(renderEventParticipantNames(event))}</span>
        <span>${escapeHtml(formatConversationTime(event.createdAt))}</span>
      </footer>
    </article>
  `;
}

export function renderWorldRpVariantBar(message: WorldEventRpMessage): string {
  const variantInfo = worldEventRpMessageVariantInfo(message);
  if (variantInfo.count <= 1) return '';
  return `
    <div class="world-rp-variant-bar ${message.role === 'assistant' ? 'is-assistant' : 'is-user'}">
      <button type="button" data-world-rp-message-variant-prev="${escapeHtml(message.id)}" aria-label="上一个版本">‹</button>
      <span>&lt;${variantInfo.index + 1}/${variantInfo.count}&gt;</span>
      <button type="button" data-world-rp-message-variant-next="${escapeHtml(message.id)}" aria-label="下一个版本">›</button>
    </div>
  `;
}

export function worldEventRpPreview(event: WorldEvent, character?: CharacterProfile): string {
  const latest = worldEventRpMessages(event.id).slice(-1)[0];
  const raw = latest?.content || event.decision?.result || event.description;
  const segments = parseRpRenderSegments(raw, {
    fallbackSpeaker: latest?.speaker || character?.name || '角色',
    fallbackEmotion: '日常',
    plainTextMode: 'narration',
  });
  const text = segments.map(segment => segment.text).filter(Boolean).join(' ');
  return compactText(text || event.description, 140);
}

export function buildWorldEventAutoCloseSummary(event: WorldEvent): string {
  const recentRp = worldEventRpMessages(event.id)
    .slice(-4)
    .map(message => `${message.speaker || (message.role === 'assistant' ? '模型续写' : '旁白')}：${message.content}`)
    .join('\n');
  // Big comment: the end button writes a useful archive note without asking the user to fill another modal.
  return [
    event.description.trim(),
    recentRp ? `最近 RP 记录：\n${recentRp}` : '',
    `事件「${event.title}」已结束，作为当前世界的日常片段归档。`,
  ].filter(Boolean).join('\n\n');
}

export function renderWorldEventLobby(events: WorldEvent[], character?: CharacterProfile): string {
  if (events.length === 0) {
    return `
      <div class="world-event-lobby">
        <div class="world-event-empty">
          <strong>没有更多片段</strong>
          <span>生成一段日常后，角色对话和旁白都会围绕这个片段展开。</span>
          <div class="world-event-empty-actions">
            <button class="primary" data-open-event-composer type="button">${icon('add')}<span>生成片段</span></button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <section class="world-event-lobby" aria-label="日常片段列表">
      <div class="world-event-lobby-heading">
        <div>
          <strong>日常片段</strong>
          <small>点击进入 RP</small>
        </div>
      </div>
      <div class="world-event-entry-list">
        ${events.map(event => {
          const messageCount = worldEventRpMessages(event.id).length;
          const eventId = escapeHtml(event.id);
          return `
            <div class="event-swipe-row" data-event-swipe-row="${eventId}">
              <div class="event-swipe-actions">
                <button class="event-swipe-delete" data-delete-event="${eventId}" type="button" tabindex="-1" aria-hidden="true">删除</button>
              </div>
              <button class="world-event-entry-card conversation-entry event-swipe-content" data-open-world-event-rp="${eventId}" type="button">
              <div class="event-avatar-stack">${renderEventAvatars(event)}</div>
              <div class="world-event-entry-main">
                <strong>${escapeHtml(event.title)}</strong>
                <p>${escapeHtml(worldEventRpPreview(event, character))}</p>
                <footer class="world-event-entry-meta">
                  <span>${escapeHtml(renderEventParticipantNames(event))}</span>
                  <span>${messageCount > 0 ? `${messageCount} 条` : escapeHtml(eventTypeLabel(event.type))}</span>
                  <span class="world-event-entry-status ${event.status === 'resolved' ? 'is-resolved' : ''}">${event.status === 'resolved' ? '已归档' : '进行中'}</span>
                </footer>
              </div>
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

export function worldInsightCharacters(): CharacterProfile[] {
  return state.characters
    .filter(character => character.worldId === activeWorld().id)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function worldInsightRelationships(characterIds: Set<string>): CharacterRelationshipRecord[] {
  return state.characterRelationships
    .filter(relationship =>
      relationship.worldId === activeWorld().id
      && characterIds.has(relationship.characterAId)
      && characterIds.has(relationship.characterBId),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function relationshipStageWeight(stage: RelationshipStage): number {
  const weights: Record<RelationshipStage, number> = {
    stranger: 1,
    familiar: 2,
    close: 3,
    intimate: 4,
    strained: 3,
  };
  return weights[stage];
}

export function relationshipInsightTone(relationship: CharacterRelationshipRecord): RelationshipStage {
  const stages = [relationship.aToB.stage, relationship.bToA.stage];
  if (stages.includes('strained')) return 'strained';
  if (stages.includes('intimate')) return 'intimate';
  if (stages.includes('close')) return 'close';
  if (stages.includes('familiar')) return 'familiar';
  return 'stranger';
}

export function relationshipInsightStrokeWidth(relationship: CharacterRelationshipRecord): string {
  const weight = (relationshipStageWeight(relationship.aToB.stage) + relationshipStageWeight(relationship.bToA.stage)) / 2;
  return (1.0 + weight * 0.16).toFixed(1);
}

export function relationshipPairIsSelected(relationship: CharacterRelationshipRecord, first?: CharacterProfile, second?: CharacterProfile): boolean {
  if (!first || !second) return false;
  return (
    (relationship.characterAId === first.id && relationship.characterBId === second.id)
    || (relationship.characterAId === second.id && relationship.characterBId === first.id)
  );
}

export function relationshipInsightVisibleRelationships(
  relationships: CharacterRelationshipRecord[],
  first?: CharacterProfile,
  second?: CharacterProfile,
): CharacterRelationshipRecord[] {
  if (first && second) {
    return relationships.filter(relationship => relationshipPairIsSelected(relationship, first, second));
  }
  if (first) {
    return relationships.filter(relationship =>
      relationship.characterAId === first.id || relationship.characterBId === first.id,
    );
  }
  return relationships;
}

export function relationshipInsightVisibleCharacterIds(
  characters: CharacterProfile[],
  relationships: CharacterRelationshipRecord[],
  first?: CharacterProfile,
  second?: CharacterProfile,
): Set<string> {
  if (!first && !second) return new Set(characters.map(character => character.id));
  const visibleIds = new Set([first?.id ?? '', second?.id ?? ''].filter(Boolean));
  relationships.forEach(relationship => {
    visibleIds.add(relationship.characterAId);
    visibleIds.add(relationship.characterBId);
  });
  return visibleIds;
}

export function relationshipPairLabel(relationship: CharacterRelationshipRecord, left: CharacterProfile, right: CharacterProfile): string {
  const leftSide = relationshipSideFor(relationship, left.id);
  const rightSide = relationshipSideFor(relationship, right.id);
  return `${left.name}: ${relationshipStageLabel(leftSide.stage)} / ${right.name}: ${relationshipStageLabel(rightSide.stage)}`;
}

export function renderRelationshipStageChip(stage: RelationshipStage): string {
  return `<span class="relationship-stage-chip stage-${stage}">${escapeHtml(relationshipStageLabel(stage))}</span>`;
}

export function renderRelationshipOverviewList(
  relationships: CharacterRelationshipRecord[],
  characterById: Map<string, CharacterProfile>,
): string {
  if (relationships.length === 0) {
    return `
      <div class="relationship-overview-empty">
        <strong>还没有关系记录</strong>
        <span>先在图谱上点选两个角色，就可以建立第一条双向关系。</span>
      </div>
    `;
  }
  return `
    <div class="relationship-overview-list">
      ${relationships.map(relationship => {
        const left = characterById.get(relationship.characterAId);
        const right = characterById.get(relationship.characterBId);
        if (!left || !right) return '';
        const leftSide = relationshipSideFor(relationship, left.id);
        const rightSide = relationshipSideFor(relationship, right.id);
        const summary = [leftSide.summary, rightSide.summary]
          .map(text => text.trim())
          .filter(Boolean)
          .map(text => compactText(text, 48))
          .join(' / ');
        return `
          <button
            class="relationship-overview-row stage-${relationshipInsightTone(relationship)}"
            data-world-relationship-line="${escapeHtml(relationship.id)}"
            title="${escapeHtml(relationshipPairLabel(relationship, left, right))}"
            type="button"
          >
            <span class="relationship-overview-names">
              <strong>${escapeHtml(left.name)}</strong>
              <span>↔</span>
              <strong>${escapeHtml(right.name)}</strong>
            </span>
            <span class="relationship-overview-stages">
              ${renderRelationshipStageChip(leftSide.stage)}
              ${renderRelationshipStageChip(rightSide.stage)}
            </span>
            <span class="relationship-overview-summary">${summary ? escapeHtml(summary) : '暂无摘要'}</span>
          </button>
        `;
      }).join('')}
    </div>
  `;
}

export function relationshipNetworkPosition(index: number, total: number): { x: number; y: number } {
  if (total <= 1) return { x: 50, y: 50 };
  if (total === 2) return { x: index === 0 ? 30 : 70, y: 50 };
  const angle = (-Math.PI / 2) + (Math.PI * 2 * index) / total;
  const radius = total <= 5 ? 34 : 38;
  return {
    x: 50 + Math.cos(angle) * radius,
    y: 50 + Math.sin(angle) * radius,
  };
}

export function timelineInsightDateKey(entry: TimelineEntry): string {
  return new Date(entry.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

export function timelineInsightDateLabel(entry: TimelineEntry): string {
  return new Date(entry.createdAt).toLocaleDateString('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });
}

export function renderTimelineTrackEntry(entry: TimelineEntry): string {
  const rollbackState = rollbackStateForTimelineEntry(entry);
  return `
    <article class="timeline-track-entry type-${escapeHtml(entry.type)} ${entry.revokedAt ? 'is-revoked' : ''}" data-timeline-entry="${escapeHtml(entry.id)}">
      <div class="timeline-track-entry-head">
        <span class="timeline-type">${escapeHtml(timelineTypeLabel(entry.type))}</span>
        <time>${formatConversationTime(entry.createdAt)}</time>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="timeline-characters">${renderTimelineCharacters(entry)}</div>
      <div class="timeline-meta">
        <span>${entry.revokedAt ? '已撤销，不再进入上下文' : entry.includeInContext ? '进入上下文' : '仅作记录'}</span>
        ${rollbackState?.canRollback ? '<span>可撤销影响</span>' : rollbackState?.rolledBackAt ? '<span>影响已撤销</span>' : ''}
      </div>
      ${renderTimelineDetails(entry)}
      ${!entry.revokedAt || rollbackState?.canRollback ? `
        <footer class="timeline-card-actions">
          ${!entry.revokedAt ? `<button class="secondary" type="button" data-toggle-timeline-context="${escapeHtml(entry.id)}">${entry.includeInContext ? '设为仅保存' : '进入上下文'}</button>` : ''}
          ${rollbackState?.canRollback ? `<button class="secondary" type="button" data-rollback-timeline="${escapeHtml(entry.id)}">撤销影响</button>` : ''}
        </footer>
      ` : ''}
    </article>
  `;
}

export function memorySummaryStatusText(summary: MemorySummary): string {
  if (summary.status === 'pending_confirmation') return '待确认';
  if (summary.status === 'paused') return '已停用';
  return summary.includeInContext ? '进入上下文' : '仅保存';
}

export function memorySummaryCharacterText(summary: MemorySummary): string {
  if (summary.characterIds.length === 0) return '整个世界';
  return summary.characterIds
    .map(id => state.characters.find(character => character.id === id)?.name ?? '已删除角色')
    .slice(0, 4)
    .join('、');
}

export function renderMemorySummaryCard(summary: MemorySummary): string {
  const isMacro = summary.layer === 'macro';
  const editAction = `<button class="secondary small-button" type="button" data-edit-memory-summary="${escapeHtml(summary.id)}">编辑</button>`;
  const toggleAction = summary.status === 'paused'
    ? `<button class="secondary small-button" type="button" data-resume-memory-summary="${escapeHtml(summary.id)}">启用</button>`
    : `<button class="secondary small-button" type="button" data-pause-memory-summary="${escapeHtml(summary.id)}">停用</button>`;
  const extraActions = [
    toggleAction,
    isMacro && summary.status === 'pending_confirmation'
      ? `<button class="primary small-button" type="button" data-confirm-memory-summary="${escapeHtml(summary.id)}">确认</button>`
      : '',
    isMacro && summary.status === 'pending_confirmation'
      ? `<button class="secondary small-button" type="button" data-discard-memory-summary="${escapeHtml(summary.id)}">丢弃</button>`
      : '',
  ].filter(Boolean);
  const collapsedActions = extraActions.length > 1 ? extraActions : [];
  const visibleActions = collapsedActions.length > 0 ? [editAction] : [editAction, toggleAction];
  return `
    <article class="memory-summary-card layer-${escapeHtml(summary.layer)} status-${escapeHtml(summary.status)}">
      <header>
        <span class="timeline-type">${escapeHtml(summaryLayerLabel(summary.layer))}</span>
        <small>${escapeHtml(memorySummaryStatusText(summary))}</small>
      </header>
      <h3>${escapeHtml(summary.title)}</h3>
      <p>${escapeHtml(summary.factSummary || '还没有形成稳定事实摘要。')}</p>
      ${summary.emotionalLine ? `<p class="memory-summary-emotion">${escapeHtml(summary.emotionalLine)}</p>` : ''}
      ${summary.unresolvedItems.length > 0 ? `
        <div class="memory-summary-unresolved">
          ${summary.unresolvedItems.slice(0, 3).map(item => `<span>${escapeHtml(item)}</span>`).join('')}
        </div>
      ` : ''}
      <footer>
        <span>${escapeHtml(memorySummaryCharacterText(summary))}</span>
        <div class="memory-summary-card-actions">
          ${visibleActions.join('')}
          ${collapsedActions.length > 0 ? `
            <details class="memory-summary-more-actions">
              <summary class="secondary small-button">更多</summary>
              <div>${collapsedActions.join('')}</div>
            </details>
          ` : ''}
        </div>
      </footer>
    </article>
  `;
}

export function renderMemorySummaryGroup(layer: MemorySummary['layer'], title: string, emptyText: string, summaries: MemorySummary[]): string {
  const rows = summaries.filter(summary => summary.layer === layer);
  return `
    <section class="memory-summary-group">
      <header>
        <strong>${escapeHtml(title)}</strong>
        <span>${rows.length} 条</span>
      </header>
      ${rows.length > 0
        ? `<div class="memory-summary-list">${rows.map(renderMemorySummaryCard).join('')}</div>`
        : `<p class="muted">${escapeHtml(emptyText)}</p>`}
    </section>
  `;
}
