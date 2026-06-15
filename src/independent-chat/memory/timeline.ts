/**
 * 大注释：Timeline memory module.
 * Stores chat, relationship, event, and manual notes as long-term memory entries.
 */
import { activeWorld, saveState, state } from '../core/state';
import { canCharacterViewMomentSource } from '../social/moment-visibility';
import type {
  CharacterProfile,
  ChatMessage,
  ConversationProfile,
  GroupChatMessage,
  GroupChatProfile,
  MomentComment,
  MomentEntry,
  TimelineEntry,
  WorldEvent,
  WorldEventRpMessage,
} from '../core/types';
import { compactText, nowId } from '../core/utils';
import { refreshSummariesForTimelineEntry } from './summaries';

type TimelineEntryInput = {
  worldId?: string;
  type: TimelineEntry['type'];
  characterIds?: string[];
  title: string;
  summary: string;
  source: TimelineEntry['source'];
  canUndo?: boolean;
  includeInContext?: boolean;
  createdAt?: number;
};

export type TimelineEntryFilter = {
  type?: TimelineEntry['type'] | 'all';
  query?: string;
  characterId?: string;
};

function characterNameMap(characterIds: string[]): Record<string, string> {
  return Object.fromEntries(characterIds.map(id => {
    const character = state.characters.find(item => item.id === id);
    return [id, character?.name ?? '已删除角色'];
  }));
}

function timelineKey(entry: TimelineEntryInput): string {
  const worldId = entry.worldId ?? activeWorld().id;
  return [
    worldId,
    entry.type,
    entry.source.type,
    entry.source.id,
    entry.title,
  ].join(':');
}

export function addTimelineEntry(input: TimelineEntryInput): TimelineEntry {
  const worldId = input.worldId ?? activeWorld().id;
  const characterIds = Array.from(new Set(input.characterIds ?? []));
  const key = timelineKey({ ...input, worldId });
  const existing = state.timelineEntries.find(entry =>
    timelineKey({
      worldId: entry.worldId,
      type: entry.type,
      title: entry.title,
      summary: entry.summary,
      source: entry.source,
      characterIds: entry.characterIds,
    }) === key,
  );
  if (existing) return existing;
  const entry: TimelineEntry = {
    id: nowId('timeline'),
    worldId,
    createdAt: input.createdAt ?? Date.now(),
    type: input.type,
    characterIds,
    characterNames: characterNameMap(characterIds),
    title: input.title.trim() || '世界记录',
    summary: input.summary.trim(),
    source: input.source,
    canUndo: input.canUndo === true,
    includeInContext: input.includeInContext !== false,
  };
  state.timelineEntries.push(entry);
  refreshSummariesForTimelineEntry(entry);
  saveState();
  return entry;
}

export function timelineForActiveWorld(): TimelineEntry[] {
  const worldId = activeWorld().id;
  return state.timelineEntries
    .filter(entry => entry.worldId === worldId)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function filterTimelineEntries<T extends TimelineEntry>(
  entries: readonly T[],
  filter: TimelineEntryFilter = {},
): T[] {
  const type = filter.type ?? 'all';
  const query = filter.query?.trim().toLocaleLowerCase() ?? '';
  const characterId = filter.characterId?.trim() ?? '';
  return entries.filter(entry => {
    if (type !== 'all' && entry.type !== type) return false;
    if (characterId && !entry.characterIds.includes(characterId)) return false;
    if (!query) return true;
    const characterText = Object.values(entry.characterNames ?? {}).join(' ');
    return [
      entry.title,
      entry.summary,
      timelineSourceText(entry),
      characterText,
    ].join(' ').toLocaleLowerCase().includes(query);
  });
}

function timelineSourceText(entry: TimelineEntry): string {
  return `${entry.source.type} ${entry.source.id}`;
}

function worldRpTimelineSourceId(eventId: string, messageId: string): string {
  return `${eventId}:rp:${messageId}`;
}

export function groupChatSegmentTimelineSourceId(chatId: string, anchorMessageId: string): string {
  return `${chatId}:segment:${anchorMessageId}`;
}

export function privateChatSegmentTimelineSourceId(conversationId: string, anchorMessageId: string): string {
  return `${conversationId}:private:${anchorMessageId}`;
}

function groupChatSpeakerName(message: GroupChatMessage): string {
  if (message.speakerType === 'user') return state.userName || '我';
  if (message.speakerType === 'system') return '系统';
  return state.characters.find(character => character.id === message.speakerCharacterId)?.name ?? '已删除角色';
}

function privateChatSpeakerName(character: CharacterProfile, message: ChatMessage): string {
  if (message.role === 'assistant') return character.name;
  if (message.speakerType === 'character' && message.speakerCharacterId) {
    return state.characters.find(item => item.id === message.speakerCharacterId)?.name ?? '已删除角色';
  }
  return state.userName.trim() || '我';
}

function privateChatParticipantIds(character: CharacterProfile, messages: readonly ChatMessage[]): string[] {
  return Array.from(new Set([
    character.id,
    ...messages
      .filter(message => message.speakerType === 'character' && message.speakerCharacterId)
      .map(message => message.speakerCharacterId as string),
  ]));
}

export function upsertPrivateChatSegmentTimelineEntry(
  character: CharacterProfile,
  conversation: ConversationProfile,
  messages: readonly ChatMessage[],
): TimelineEntry | undefined {
  const segmentMessages = messages
    .filter(message =>
      message.characterId === character.id
      && message.conversationId === conversation.id
      && !message.recalledAt
      && message.content.trim(),
    )
    .sort((left, right) => left.createdAt - right.createdAt);
  const anchor = segmentMessages[0];
  if (!anchor) return undefined;
  const sourceId = privateChatSegmentTimelineSourceId(conversation.id, anchor.id);
  const characterIds = privateChatParticipantIds(character, segmentMessages);
  const lines = segmentMessages.map(message =>
    `${privateChatSpeakerName(character, message)}：${message.content.trim()}`,
  );
  const title = `${character.name} 的一段私聊`;
  const summary = compactText(`私聊自动总结（${segmentMessages.length} 条）\n${lines.join('\n')}`, 620);
  const createdAt = segmentMessages[segmentMessages.length - 1]?.createdAt ?? anchor.createdAt;
  const existing = state.timelineEntries.find(entry =>
    entry.worldId === character.worldId
    && entry.type === 'chat'
    && entry.source.type === 'message'
    && entry.source.id === sourceId,
  );
  if (existing) {
    existing.characterIds = characterIds;
    existing.characterNames = characterNameMap(characterIds);
    existing.title = title;
    existing.summary = summary;
    existing.createdAt = createdAt;
    if (existing.includeInContext && !existing.revokedAt) {
      refreshSummariesForTimelineEntry(existing);
    }
    saveState();
    return existing;
  }
  return addTimelineEntry({
    worldId: character.worldId,
    type: 'chat',
    characterIds,
    title,
    summary,
    source: { type: 'message', id: sourceId },
    canUndo: false,
    includeInContext: true,
    createdAt,
  });
}

export function removePrivateChatSegmentTimelineEntries(conversationId: string): number {
  const prefix = `${conversationId}:private:`;
  const before = state.timelineEntries.length;
  state.timelineEntries = state.timelineEntries.filter(entry =>
    entry.source.type !== 'message' || !entry.source.id.startsWith(prefix),
  );
  const removed = before - state.timelineEntries.length;
  if (removed > 0) saveState();
  return removed;
}

export function upsertGroupChatSegmentTimelineEntry(
  chat: GroupChatProfile,
  messages: readonly GroupChatMessage[],
): TimelineEntry | undefined {
  const segmentMessages = messages
    .filter(message => message.groupChatId === chat.id && message.worldId === chat.worldId && !message.recalledAt)
    .sort((left, right) => left.createdAt - right.createdAt);
  const anchor = segmentMessages[0];
  if (!anchor) return undefined;
  const sourceId = groupChatSegmentTimelineSourceId(chat.id, anchor.id);
  const title = `${chat.title} 里的一段群聊`;
  const lines = segmentMessages.map(message =>
    `${groupChatSpeakerName(message)}：${message.content.trim()}`,
  );
  const summary = compactText(`群聊片段（${segmentMessages.length} 条）\n${lines.join('\n')}`, 520);
  const characterIds = Array.from(new Set(chat.participantCharacterIds));
  const createdAt = segmentMessages[segmentMessages.length - 1]?.createdAt ?? anchor.createdAt;
  const existing = state.timelineEntries.find(entry =>
    entry.worldId === chat.worldId
    && entry.type === 'group_chat'
    && entry.source.type === 'group_message'
    && entry.source.id === sourceId,
  );
  if (existing) {
    existing.characterIds = characterIds;
    existing.characterNames = characterNameMap(characterIds);
    existing.title = title;
    existing.summary = summary;
    existing.createdAt = createdAt;
    if (existing.includeInContext && !existing.revokedAt) {
      refreshSummariesForTimelineEntry(existing);
    }
    saveState();
    return existing;
  }
  return addTimelineEntry({
    worldId: chat.worldId,
    type: 'group_chat',
    characterIds,
    title,
    summary,
    source: { type: 'group_message', id: sourceId },
    canUndo: false,
    includeInContext: true,
    createdAt,
  });
}

function worldRpSpeakerName(message: WorldEventRpMessage): string {
  if (message.speaker?.trim()) return message.speaker.trim();
  if (message.characterId) {
    return state.characters.find(character => character.id === message.characterId)?.name ?? '角色';
  }
  return message.role === 'user' ? state.userName : '世界 RP';
}

export function upsertWorldRpTimelineEntry(event: WorldEvent, message: WorldEventRpMessage): TimelineEntry {
  const sourceId = worldRpTimelineSourceId(event.id, message.id);
  const characterIds = Array.from(new Set([
    ...event.participantCharacterIds,
    ...(message.characterId ? [message.characterId] : []),
  ]));
  const title = `世界 RP：${event.title}`;
  const summary = compactText(`${worldRpSpeakerName(message)}：${message.content}`, 240);
  const existing = state.timelineEntries.find(entry =>
    entry.worldId === event.worldId
    && entry.source.type === 'event'
    && entry.source.id === sourceId,
  );
  if (existing) {
    existing.characterIds = characterIds;
    existing.characterNames = characterNameMap(characterIds);
    existing.title = title;
    existing.summary = summary;
    existing.createdAt = message.createdAt;
    refreshSummariesForTimelineEntry(existing);
    saveState();
    return existing;
  }
  return addTimelineEntry({
    worldId: event.worldId,
    type: 'event',
    characterIds,
    title,
    summary,
    source: { type: 'event', id: sourceId },
    canUndo: false,
    includeInContext: true,
    createdAt: message.createdAt,
  });
}

export function revokeWorldRpTimelineEntriesForEvent(eventId: string): void {
  const prefix = `${eventId}:rp:`;
  const now = Date.now();
  let changed = false;
  for (const entry of state.timelineEntries) {
    if (entry.source.type === 'event' && entry.source.id.startsWith(prefix) && !entry.revokedAt) {
      entry.revokedAt = now;
      entry.includeInContext = false;
      changed = true;
    }
  }
  if (changed) saveState();
}

export function addManualTimelineNote(content: string): TimelineEntry {
  const text = content.trim();
  if (!text) throw new Error('记录内容不能为空。');
  return addTimelineEntry({
    type: 'manual_note',
    title: '手动记录',
    summary: compactText(text, 420),
    source: { type: 'manual', id: nowId('manual') },
    canUndo: false,
    includeInContext: true,
  });
}

export function addChatMessageTimelineEntry(message: ChatMessage, character: CharacterProfile): TimelineEntry {
  const speaker = message.role === 'assistant' ? character.name : state.userName;
  return addTimelineEntry({
    worldId: character.worldId,
    type: 'chat',
    characterIds: [character.id],
    title: `记住了 ${speaker} 的一句话`,
    summary: compactText(message.content, 220),
    source: { type: 'message', id: message.id },
    canUndo: false,
    includeInContext: true,
    createdAt: message.createdAt,
  });
}

export function revokeTimelineSource(sourceType: TimelineEntry['source']['type'], sourceId: string): void {
  const now = Date.now();
  let changed = false;
  for (const entry of state.timelineEntries) {
    if (entry.source.type === sourceType && entry.source.id === sourceId && !entry.revokedAt) {
      entry.revokedAt = now;
      entry.includeInContext = false;
      changed = true;
    }
  }
  if (changed) saveState();
}

export function addMomentTimelineEntry(moment: MomentEntry, character?: CharacterProfile): TimelineEntry {
  const author = character?.name ?? state.userName;
  return addTimelineEntry({
    worldId: moment.worldId,
    type: 'moment',
    characterIds: character ? [character.id] : [],
    title: `${author} 发布了动态`,
    summary: compactText(moment.content, 180),
    source: { type: 'moment', id: moment.id },
    canUndo: false,
    includeInContext: true,
    createdAt: moment.createdAt,
  });
}

export function addMomentCommentTimelineEntry(
  moment: MomentEntry,
  comment: MomentComment,
  character?: CharacterProfile,
): TimelineEntry {
  const commenter = character?.name ?? state.userName;
  const author = moment.characterId
    ? state.characters.find(item => item.id === moment.characterId)?.name ?? '角色'
    : state.userName;
  const title = commenter === author
    ? `${commenter} 回复了动态评论`
    : `${commenter} 评论了 ${author} 的动态`;
  return addTimelineEntry({
    worldId: moment.worldId,
    type: 'comment',
    characterIds: character ? [character.id] : [],
    title,
    summary: compactText(comment.content, 160),
    source: { type: 'comment', id: comment.id },
    canUndo: false,
    includeInContext: true,
    createdAt: comment.createdAt,
  });
}

export function addEventCreatedTimelineEntry(event: WorldEvent): TimelineEntry {
  return addTimelineEntry({
    worldId: event.worldId,
    type: 'event',
    characterIds: event.participantCharacterIds,
    title: `新事件：${event.title}`,
    summary: compactText(event.description, 220),
    source: { type: 'event', id: event.id },
    canUndo: false,
    includeInContext: true,
    createdAt: event.createdAt,
  });
}

export function addEventResolvedTimelineEntry(event: WorldEvent): TimelineEntry {
  const result = event.decision?.result ?? event.resultSummary ?? '这件事已经结束。';
  return addTimelineEntry({
    worldId: event.worldId,
    type: 'event',
    characterIds: event.participantCharacterIds,
    title: `事件已结算：${event.title}`,
    summary: compactText(result, 220),
    source: { type: 'event', id: `${event.id}:resolved` },
    canUndo: event.participantCharacterIds.length > 0,
    includeInContext: true,
    createdAt: event.resolvedAt ?? event.updatedAt,
  });
}

export function addEventDeletedTimelineEntry(event: WorldEvent): TimelineEntry {
  return addTimelineEntry({
    worldId: event.worldId,
    type: 'event',
    characterIds: event.participantCharacterIds,
    title: `事件已删除：${event.title}`,
    summary: '这条事件已从当前世界移除，后续模型不会再读取它。',
    source: { type: 'event', id: `${event.id}:deleted` },
    canUndo: false,
    includeInContext: false,
  });
}

export function addAutoMessageTimelineEntry(
  character: CharacterProfile,
  messages: ChatMessage[],
  reason: string,
): TimelineEntry {
  const summary = messages.map(message => message.content).join(' ');
  return addTimelineEntry({
    worldId: character.worldId,
    type: 'auto_message',
    characterIds: [character.id],
    title: `${character.name} 主动联系了你`,
    summary: reason ? `${reason} ${compactText(summary, 160)}` : compactText(summary, 180),
    source: { type: 'message', id: messages[0]?.id ?? nowId('message') },
    canUndo: false,
    includeInContext: true,
    createdAt: messages[0]?.createdAt,
  });
}

export function addRelationshipTimelineEntry(
  character: CharacterProfile,
  title: string,
  summary: string,
  sourceId: string,
): TimelineEntry {
  return addTimelineEntry({
    worldId: character.worldId,
    type: 'relationship',
    characterIds: [character.id],
    title,
    summary,
    source: { type: 'relationship', id: sourceId },
    canUndo: false,
    includeInContext: true,
  });
}

export function timelineContextFor(character: CharacterProfile, limit = 6): string {
  const entries = state.timelineEntries
    .filter(entry =>
      entry.worldId === character.worldId
      && entry.includeInContext
      && !entry.revokedAt
      && canCharacterViewMomentSource(entry.source, character)
      && (entry.characterIds.length === 0 || entry.characterIds.includes(character.id)),
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
  if (entries.length === 0) return '';
  return `近期世界时间线：\n${entries.map(entry => `- ${entry.title}：${compactText(entry.summary, 120)}`).join('\n')}`;
}
