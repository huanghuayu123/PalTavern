/**
 * 大注释：Character status memory module.
 * Maintains current character summaries and model-ready status context.
 */
import { saveState, state, unreadCountFor } from '../core/state';
import type { CharacterProfile, CharacterStatusSummary, TimelineEntry } from '../core/types';
import { recordImpact, recordTimelineEntryImpact, statusSnapshot } from './impacts';
import { addTimelineEntry } from './timeline';
import { canCharacterViewMoment } from '../social/moment-visibility';
import { compactText, nowId } from '../core/utils';

function statusFor(character: CharacterProfile): CharacterStatusSummary | undefined {
  return state.characterStatuses.find(status =>
    status.worldId === character.worldId && status.characterId === character.id,
  );
}

function relatedTimelineEntries(character: CharacterProfile): TimelineEntry[] {
  return state.timelineEntries
    .filter(entry =>
      entry.worldId === character.worldId
      && !entry.revokedAt
      && entry.includeInContext
      && (entry.characterIds.length === 0 || entry.characterIds.includes(character.id))
      && entry.type !== 'daily_brief'
      && entry.type !== 'character_status',
    )
    .sort((left, right) => right.createdAt - left.createdAt);
}

function activeEventsFor(character: CharacterProfile) {
  return state.worldEvents
    .filter(event =>
      event.worldId === character.worldId
      && event.status === 'active'
      && (event.participantCharacterIds.length === 0 || event.participantCharacterIds.includes(character.id)),
    )
    .sort((left, right) => right.createdAt - left.createdAt);
}

function recentSources(character: CharacterProfile): string[] {
  const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sources: string[] = [];
  if (state.messages.some(message => message.characterId === character.id && message.createdAt >= weekAgo)) {
    sources.push('聊天');
  }
  if (state.moments.some(moment =>
    moment.worldId === character.worldId
    && moment.createdAt >= weekAgo
    && (
      moment.characterId === character.id
      || moment.comments.some(comment => comment.characterId === character.id)
      || canCharacterViewMoment(moment, character)
    ),
  )) {
    sources.push('动态');
  }
  if (state.worldEvents.some(event =>
    event.worldId === character.worldId
    && event.createdAt >= weekAgo
    && (event.participantCharacterIds.length === 0 || event.participantCharacterIds.includes(character.id)),
  )) {
    sources.push('事件');
  }
  if (state.characterInteractions.some(interaction =>
    interaction.worldId === character.worldId
    && interaction.createdAt >= weekAgo
    && (
      interaction.actorCharacterId === character.id
      || interaction.targetCharacterIds.includes(character.id)
    ),
  )) {
    sources.push('互动');
  }
  if (state.messages.some(message =>
    message.characterId === character.id
    && message.source === 'auto_message'
    && message.createdAt >= weekAgo,
  )) {
    sources.push('主动消息');
  }
  return Array.from(new Set(sources));
}

function inclinationFor(character: CharacterProfile, unreadCount: number, unresolvedItems: string[]): string {
  if (unreadCount > 0) return '可能在等你回应刚才的消息。';
  if (unresolvedItems.length > 0) return '可能会被未处理的事件牵动。';
  if (character.autoMessage.enabled && character.autoMessage.nextAttemptAt) {
    return '可能会按自己的节奏主动联系你。';
  }
  if (character.relationship.stage === 'close' || character.relationship.stage === 'intimate') {
    return '关系比较近，可能更自然地靠近你。';
  }
  if (character.relationship.stage === 'strained') {
    return '关系有些紧，可能会先保持距离。';
  }
  return '暂时保持自己的生活节奏。';
}

function moodFor(memoryTitles: string[], unresolvedItems: string[], unreadCount: number): string {
  if (unreadCount > 0) return '有话还没被回应';
  if (unresolvedItems.length > 0) return '被未解决的事牵动';
  if (memoryTitles.length > 0) return '最近有新的生活痕迹';
  return '近况安静';
}

function summaryFor(
  character: CharacterProfile,
  mood: string,
  memoryTitles: string[],
  unresolvedItems: string[],
): string {
  if (!character.relationship.summary && memoryTitles.length === 0 && unresolvedItems.length === 0) {
    return '暂时没有足够信息形成稳定状态摘要。';
  }
  return [
    `${character.name} 现在看起来：${mood}。`,
    character.relationship.summary ? `关系摘要：${compactText(character.relationship.summary, 120)}` : '',
    memoryTitles.length > 0 ? `最近记住的是：${memoryTitles.join('、')}。` : '',
    unresolvedItems.length > 0 ? `还有未解决事项：${unresolvedItems.join('、')}。` : '',
  ].filter(Boolean).join('');
}

export function deriveCharacterStatusSummary(character: CharacterProfile): CharacterStatusSummary {
  const entries = relatedTimelineEntries(character).slice(0, 3);
  const recentMemoryTitles = entries.map(entry => entry.title);
  const unresolvedItems = activeEventsFor(character).slice(0, 4).map(event => event.title);
  const unreadCount = unreadCountFor(character.id);
  const activeSources = recentSources(character);
  const mood = moodFor(recentMemoryTitles, unresolvedItems, unreadCount);
  const nextInclination = inclinationFor(character, unreadCount, unresolvedItems);
  const updatedAt = Date.now();
  return {
    id: statusFor(character)?.id ?? nowId('status'),
    worldId: character.worldId,
    characterId: character.id,
    mood,
    relationshipStage: character.relationship.stage,
    affinity: Math.max(0, Math.round(character.relationship.affinity)),
    relationshipSummary: character.relationship.summary,
    recentMemoryTitles,
    unresolvedItems,
    nextInclination,
    activeSources,
    summary: summaryFor(character, mood, recentMemoryTitles, unresolvedItems),
    source: 'rule',
    updatedAt,
  };
}

export function characterStatusFor(character: CharacterProfile): CharacterStatusSummary {
  return statusFor(character) ?? deriveCharacterStatusSummary(character);
}

export function refreshCharacterStatusSummary(character: CharacterProfile): CharacterStatusSummary {
  const previous = statusSnapshot(statusFor(character));
  const next = deriveCharacterStatusSummary(character);
  const index = state.characterStatuses.findIndex(status =>
    status.worldId === character.worldId && status.characterId === character.id,
  );
  if (index >= 0) state.characterStatuses[index] = next;
  else state.characterStatuses.push(next);
  const operationId = `status:${character.id}:${next.updatedAt}`;
  const source = { type: 'status' as const, id: operationId };
  const impactLabel = `状态摘要刷新：${character.name}`;
  const timelineEntry = addTimelineEntry({
    worldId: character.worldId,
    type: 'character_status',
    characterIds: [character.id],
    title: `${character.name} 的状态摘要已刷新`,
    summary: compactText(next.summary || next.mood, 220),
    source,
    canUndo: true,
    includeInContext: false,
    createdAt: next.updatedAt,
  });
  recordTimelineEntryImpact(timelineEntry, operationId, impactLabel, source);
  recordImpact({
    worldId: character.worldId,
    operationId,
    label: impactLabel,
    source,
    targetType: 'character_status',
    targetId: next.id,
    characterId: character.id,
    oldValue: previous,
    newValue: statusSnapshot(next),
    timelineEntryIds: [timelineEntry.id],
    createdAt: next.updatedAt,
  });
  saveState();
  return next;
}

export function characterStatusLine(character: CharacterProfile): string {
  const status = statusFor(character);
  if (status?.mood) return status.mood;
  const derived = deriveCharacterStatusSummary(character);
  return derived.mood === '近况安静' ? '' : derived.mood;
}

export function characterStatusContextFor(character: CharacterProfile): string {
  const status = statusFor(character);
  if (!status) return '';
  return [
    '当前角色状态摘要：',
    `- 状态：${status.mood}`,
    character.currentPlan?.text ? `- 角色当前计划：${character.currentPlan.text}` : '',
    `- 下一步倾向：${status.nextInclination}`,
    status.unresolvedItems.length > 0 ? `- 未解决事项：${status.unresolvedItems.slice(0, 3).join('；')}` : '',
    status.summary ? `- 摘要：${compactText(status.summary, 180)}` : '',
  ].filter(Boolean).join('\n');
}
