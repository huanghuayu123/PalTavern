/**
 * Big comment: Character direct chat stores private conversations shared by two characters.
 * The user may inspect the thread from either character identity and speak as the current identity.
 */
import { characterSettingsText } from '../characters/settings';
import {
  createCharacterRelationshipStageSuggestion,
  ensureCharacterRelationship,
  groupRelationshipContextFor,
  relationshipSideFor,
  updateCharacterRelationshipSide,
} from '../characters/relationships';
import { cleanModelChatFallback, parseModelChatOutput } from './format';
import { callAuthoringModel } from '../model/client';
import { addTimelineEntry } from '../memory/timeline';
import { detectPrivateChatEventSuggestion } from '../social/events';
import { saveState, state } from '../core/state';
import type {
  CharacterDirectMessage,
  CharacterDirectThread,
  CharacterProfile,
  ModelMessage,
  RelationshipStage,
} from '../core/types';
import { compactText, firstString, isRecord, nowId, stableHash } from '../core/utils';

const AUTO_DIRECT_MIN_MESSAGES = 5;
const AUTO_DIRECT_MAX_MESSAGES = 8;
const DIRECT_RELATIONSHIP_SUMMARY_LIMIT = 900;

export interface CharacterDirectReplyOptions {
  countBudget?: boolean;
  replyToId?: string;
}

export interface BackgroundCharacterDirectOptions {
  participantIds?: string[];
  now?: number;
  countBudget?: boolean;
}

export interface BackgroundCharacterDirectResult {
  ok: boolean;
  reason: string;
  thread?: CharacterDirectThread;
  messages?: CharacterDirectMessage[];
  suggestionCount?: number;
}

interface ParsedAutoDirectDialogue {
  reason: string;
  relationshipSummary: string;
  messages: Array<{
    speakerCharacterId: string;
    content: string;
  }>;
  stageSuggestions: Array<{
    fromCharacterId: string;
    toCharacterId: string;
    suggestedStage: RelationshipStage;
    reason: string;
  }>;
}

function canonicalDirectParticipants(firstCharacterId: string, secondCharacterId: string): [string, string] {
  return firstCharacterId.localeCompare(secondCharacterId) <= 0
    ? [firstCharacterId, secondCharacterId]
    : [secondCharacterId, firstCharacterId];
}

export function characterDirectThreadIdFor(
  worldId: string,
  firstCharacterId: string,
  secondCharacterId: string,
): string {
  const [leftId, rightId] = canonicalDirectParticipants(firstCharacterId, secondCharacterId);
  return `character_direct_${stableHash(`${worldId}:${leftId}:${rightId}`)}`;
}

function characterById(characterId: string): CharacterProfile | undefined {
  return state.characters.find(character => character.id === characterId);
}

function characterInWorld(worldId: string, characterId: string): CharacterProfile | undefined {
  return state.characters.find(character => character.id === characterId && character.worldId === worldId);
}

function participantCharacters(thread: CharacterDirectThread): CharacterProfile[] {
  return thread.participantCharacterIds
    .map(characterById)
    .filter((character): character is CharacterProfile => Boolean(character))
    .filter(character => character.worldId === thread.worldId);
}

function directSpeakerName(characterId: string): string {
  return characterById(characterId)?.name ?? '已删除角色';
}

export function ensureCharacterDirectThread(
  worldId: string,
  firstCharacterId: string,
  secondCharacterId: string,
): CharacterDirectThread {
  const first = characterInWorld(worldId, firstCharacterId);
  const second = characterInWorld(worldId, secondCharacterId);
  if (!first || !second || first.id === second.id) {
    throw new Error('角色私聊需要同一世界里的两个不同角色。');
  }
  const participantCharacterIds = canonicalDirectParticipants(first.id, second.id);
  const id = characterDirectThreadIdFor(worldId, participantCharacterIds[0], participantCharacterIds[1]);
  const existing = state.characterDirectThreads.find(thread => thread.id === id);
  if (existing) return existing;
  const now = Date.now();
  const thread: CharacterDirectThread = {
    id,
    worldId,
    participantCharacterIds,
    lastReadByCharacterId: {
      [participantCharacterIds[0]]: now,
      [participantCharacterIds[1]]: now,
    },
    createdAt: now,
    updatedAt: now,
  };
  state.characterDirectThreads.push(thread);
  saveState();
  return thread;
}

export function characterDirectThreadsForActor(
  actorCharacterId: string,
  worldId: string,
): CharacterDirectThread[] {
  return state.characterDirectThreads
    .filter(thread =>
      thread.worldId === worldId
      && thread.participantCharacterIds.includes(actorCharacterId)
      && participantCharacters(thread).length === 2,
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function characterDirectMessagesFor(threadId: string): CharacterDirectMessage[] {
  return state.characterDirectMessages
    .filter(message => message.threadId === threadId && !message.recalledAt)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function markCharacterDirectThreadRead(threadId: string, characterId: string, readAt = Date.now()): void {
  const thread = state.characterDirectThreads.find(item => item.id === threadId);
  if (!thread || !thread.participantCharacterIds.includes(characterId)) return;
  thread.lastReadByCharacterId[characterId] = Math.max(thread.lastReadByCharacterId[characterId] ?? 0, readAt);
  saveState();
}

export function appendCharacterDirectMessage(
  threadId: string,
  speakerCharacterId: string,
  content: string,
  source: CharacterDirectMessage['source'],
  options: { replyToId?: string; createdAt?: number } = {},
): CharacterDirectMessage {
  const thread = state.characterDirectThreads.find(item => item.id === threadId);
  if (!thread || !thread.participantCharacterIds.includes(speakerCharacterId)) {
    throw new Error('找不到可写入的角色私聊线程。');
  }
  const text = content.trim();
  if (!text) throw new Error('角色私聊内容不能为空。');
  const createdAt = options.createdAt ?? Date.now();
  const message: CharacterDirectMessage = {
    id: nowId('dmsg'),
    threadId: thread.id,
    worldId: thread.worldId,
    speakerCharacterId,
    content: text,
    source,
    replyToId: options.replyToId,
    createdAt,
  };
  state.characterDirectMessages.push(message);
  thread.updatedAt = Math.max(thread.updatedAt, createdAt);
  thread.lastReadByCharacterId[speakerCharacterId] = createdAt;
  saveState();
  return message;
}

function directHistory(thread: CharacterDirectThread, limit = 16): string {
  const messages = characterDirectMessagesFor(thread.id).slice(-limit);
  if (messages.length === 0) return '这段角色私聊还没有历史消息。';
  return messages.map(message => `${directSpeakerName(message.speakerCharacterId)}：${message.content}`).join('\n');
}

export async function detectCharacterDirectMessageEventSuggestion(
  message: CharacterDirectMessage,
): Promise<void> {
  const thread = state.characterDirectThreads.find(item => item.id === message.threadId);
  if (!thread || message.recalledAt || !message.content.trim()) return;
  const speaker = characterById(message.speakerCharacterId);
  await detectPrivateChatEventSuggestion({
    worldId: thread.worldId,
    sourceKind: 'character_direct',
    threadId: thread.id,
    messageId: message.id,
    sourceMessageRole: message.source === 'model' || message.source === 'auto_model' ? 'assistant' : 'user',
    content: message.content,
    speakerName: speaker?.name ?? directSpeakerName(message.speakerCharacterId),
    triggerCharacterId: message.speakerCharacterId,
    participantCharacterIds: thread.participantCharacterIds,
    leadActor: speaker
      ? { type: 'character', id: speaker.id, characterId: speaker.id, name: speaker.name }
      : undefined,
    recentMessages: characterDirectMessagesFor(thread.id).slice(-5).map(item => ({
      speaker: directSpeakerName(item.speakerCharacterId),
      role: item.source === 'model' || item.source === 'auto_model' ? 'assistant' as const : 'user' as const,
      content: item.content,
    })),
  });
}

function directParticipantBrief(character: CharacterProfile): string {
  const settings = characterSettingsText(character);
  return [
    `角色ID：${character.id}`,
    `姓名：${character.name}`,
    settings ? `设定：${compactText(settings, 320)}` : '',
    character.currentPlan?.text ? `当前计划：${character.currentPlan.text}` : '',
    character.replyStrategy?.trim() ? `回复策略：${compactText(character.replyStrategy, 180)}` : '',
  ].filter(Boolean).join('\n');
}

function buildDirectReplyPrompt(
  thread: CharacterDirectThread,
  speaker: CharacterProfile,
  options: CharacterDirectReplyOptions,
): ModelMessage[] {
  const participants = participantCharacters(thread);
  const target = options.replyToId
    ? characterDirectMessagesFor(thread.id).find(message => message.id === options.replyToId)
    : characterDirectMessagesFor(thread.id).at(-1);
  return [
    {
      role: 'system',
      content: [
        `你正在为 PalTavern 的角色私聊生成下一句。当前说话角色是 ${speaker.name}。`,
        '这是两个角色之间的私聊，不是 user 和角色的私聊。只写当前说话角色会发出的消息。',
        '保持真实聊天软件里的短句节奏，不写旁白，不替另一个角色说话，不提系统规则。',
        '输出格式：只输出 <msg>消息内容</msg>，通常 1 条，最多 2 条。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `参与角色：\n${participants.map(directParticipantBrief).join('\n\n')}`,
        groupRelationshipContextFor(participants, 8),
        target ? `正在接上一条：${directSpeakerName(target.speakerCharacterId)}：${target.content}` : '',
        `最近私聊：\n${directHistory(thread)}`,
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function parsedReplyParts(raw: string, speaker: CharacterProfile): string[] {
  const parts = parseModelChatOutput(raw, speaker)
    .map(part => part.content.trim())
    .filter(Boolean);
  const fallback = cleanModelChatFallback(raw);
  return (parts.length > 0 ? parts : fallback ? [fallback] : []).slice(0, 2);
}

export async function generateCharacterDirectReply(
  threadId: string,
  respondingCharacterId: string,
  options: CharacterDirectReplyOptions = {},
): Promise<CharacterDirectMessage[]> {
  const thread = state.characterDirectThreads.find(item => item.id === threadId);
  const speaker = thread ? characterById(respondingCharacterId) : undefined;
  if (!thread || !speaker || !thread.participantCharacterIds.includes(speaker.id)) return [];
  const raw = await callAuthoringModel(buildDirectReplyPrompt(thread, speaker, options), {
    countBudget: options.countBudget,
  });
  const parts = parsedReplyParts(raw, speaker);
  let replyToId = options.replyToId;
  const messages: CharacterDirectMessage[] = [];
  for (const part of parts) {
    const message = appendCharacterDirectMessage(thread.id, speaker.id, part, 'model', { replyToId });
    messages.push(message);
    await detectCharacterDirectMessageEventSuggestion(message);
    replyToId = message.id;
  }
  return messages;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  const text = start >= 0 && end >= start ? cleaned.slice(start, end + 1) : cleaned;
  const parsed = JSON.parse(text) as unknown;
  if (!isRecord(parsed)) throw new Error('角色私聊模型没有返回 JSON 对象。');
  return parsed;
}

function relationshipStage(value: unknown): RelationshipStage | undefined {
  return value === 'stranger'
    || value === 'familiar'
    || value === 'close'
    || value === 'intimate'
    || value === 'strained'
    ? value
    : undefined;
}

function parseAutoDirectDialogue(raw: string, participantIds: Set<string>): ParsedAutoDirectDialogue {
  const parsed = parseJsonObject(raw);
  const messages = Array.isArray(parsed.messages)
    ? parsed.messages.filter(isRecord).flatMap(message => {
      const speakerCharacterId = firstString(message.speakerCharacterId, message.characterId, message.speakerId);
      const content = firstString(message.content, message.text, message.message)?.trim() ?? '';
      if (!speakerCharacterId || !participantIds.has(speakerCharacterId) || !content) return [];
      return [{ speakerCharacterId, content }];
    }).slice(0, AUTO_DIRECT_MAX_MESSAGES)
    : [];
  const stageSuggestions = Array.isArray(parsed.stageSuggestions)
    ? parsed.stageSuggestions.filter(isRecord).flatMap(suggestion => {
      const suggestedStage = relationshipStage(suggestion.suggestedStage);
      const fromCharacterId = firstString(suggestion.fromCharacterId);
      const toCharacterId = firstString(suggestion.toCharacterId);
      if (
        !suggestedStage
        || !fromCharacterId
        || !toCharacterId
        || fromCharacterId === toCharacterId
        || !participantIds.has(fromCharacterId)
        || !participantIds.has(toCharacterId)
      ) {
        return [];
      }
      return [{
        fromCharacterId,
        toCharacterId,
        suggestedStage,
        reason: firstString(suggestion.reason) ?? '角色私聊后产生的关系阶段建议。',
      }];
    })
    : [];
  return {
    reason: firstString(parsed.reason) ?? '角色之间自然发生了一段私聊。',
    relationshipSummary: firstString(parsed.relationshipSummary, parsed.summary)
      ?? '角色之间通过这段私聊产生了新的关系细节。',
    messages,
    stageSuggestions,
  };
}

function chooseBackgroundParticipants(worldId: string, options: BackgroundCharacterDirectOptions): CharacterProfile[] {
  if (options.participantIds?.length) {
    return options.participantIds
      .map(id => characterInWorld(worldId, id))
      .filter((character): character is CharacterProfile => Boolean(character))
      .slice(0, 2);
  }
  return state.characters
    .filter(character => character.worldId === worldId)
    .sort((left, right) => {
      const leftRecent = characterDirectThreadsForActor(left.id, worldId)[0]?.lastAutoGeneratedAt ?? 0;
      const rightRecent = characterDirectThreadsForActor(right.id, worldId)[0]?.lastAutoGeneratedAt ?? 0;
      return leftRecent - rightRecent;
    })
    .slice(0, 2);
}

function buildBackgroundDirectPrompt(
  worldId: string,
  participants: CharacterProfile[],
): ModelMessage[] {
  const world = state.worlds.find(item => item.id === worldId);
  return [
    {
      role: 'system',
      content: [
        '你是 PalTavern 的角色私聊编排器。',
        '目标：让同一世界里的两个角色产生一段自然、克制、像真实聊天记录的私聊。',
        `输出 ${AUTO_DIRECT_MIN_MESSAGES}-${AUTO_DIRECT_MAX_MESSAGES} 条消息，只允许给参与角色发言。`,
        '只输出 JSON，不要 Markdown，不要解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `当前世界：${world?.name ?? worldId}`,
        `参与角色：\n${participants.map(directParticipantBrief).join('\n\n')}`,
        groupRelationshipContextFor(participants, 8),
        `已有私聊：\n${directHistory(ensureCharacterDirectThread(worldId, participants[0].id, participants[1].id), 12)}`,
        '输出 JSON 结构：',
        JSON.stringify({
          reason: '为什么这段私聊自然发生',
          relationshipSummary: '这段私聊给两人关系留下的新细节',
          messages: [{
            speakerCharacterId: participants[0]?.id ?? '角色ID',
            content: '一条短消息',
          }],
          stageSuggestions: [{
            fromCharacterId: participants[1]?.id ?? '角色ID',
            toCharacterId: participants[0]?.id ?? '角色ID',
            suggestedStage: 'stranger/familiar/close/intimate/strained',
            reason: '不确定就返回空数组',
          }],
        }),
      ].filter(Boolean).join('\n\n'),
    },
  ];
}

function appendRelationshipSummary(existing: string, line: string): string {
  return existing ? `${existing}\n${line}`.slice(-DIRECT_RELATIONSHIP_SUMMARY_LIMIT) : line;
}

function recordDirectDialogueImpact(
  thread: CharacterDirectThread,
  participants: CharacterProfile[],
  messages: CharacterDirectMessage[],
  action: ParsedAutoDirectDialogue,
): number {
  const [left, right] = participants;
  const createdAt = messages[0]?.createdAt ?? Date.now();
  const sliceId = `${thread.id}:${messages[0]?.id ?? nowId('direct_slice')}`;
  const transcript = messages.map(message =>
    `${directSpeakerName(message.speakerCharacterId)}：${message.content}`,
  ).join(' ');
  const title = `${left.name} 和 ${right.name} 私下聊了几句`;
  const summary = `${action.reason} ${compactText(transcript, 220)}`;
  const timelineEntry = addTimelineEntry({
    worldId: thread.worldId,
    type: 'character_interaction',
    characterIds: participants.map(character => character.id),
    title,
    summary,
    source: { type: 'direct_chat', id: sliceId },
    canUndo: false,
    includeInContext: true,
    createdAt,
  });
  state.characterInteractions.push({
    id: nowId('interaction'),
    worldId: thread.worldId,
    type: 'background_scene',
    actorCharacterId: left.id,
    targetCharacterIds: [right.id],
    title,
    summary: compactText(action.relationshipSummary || transcript, 260),
    reason: action.reason,
    source: { type: 'direct_chat', id: sliceId },
    timelineEntryId: timelineEntry.id,
    createdAt,
  });
  const relationship = ensureCharacterRelationship(left, right);
  const line = `私聊「${title}」：${compactText(action.relationshipSummary || transcript, 160)}`;
  updateCharacterRelationshipSide(relationship, left.id, {
    summary: appendRelationshipSummary(relationshipSideFor(relationship, left.id).summary, line),
  });
  updateCharacterRelationshipSide(relationship, right.id, {
    summary: appendRelationshipSummary(relationshipSideFor(relationship, right.id).summary, line),
  });
  let suggestionCount = 0;
  for (const suggestion of action.stageSuggestions) {
    createCharacterRelationshipStageSuggestion({
      worldId: thread.worldId,
      relationshipId: relationship.id,
      fromCharacterId: suggestion.fromCharacterId,
      toCharacterId: suggestion.toCharacterId,
      suggestedStage: suggestion.suggestedStage,
      reason: suggestion.reason,
      sourceEventId: `direct_chat:${sliceId}`,
    });
    suggestionCount += 1;
  }
  saveState();
  return suggestionCount;
}

export async function runBackgroundCharacterDirectDialogue(
  worldId: string,
  options: BackgroundCharacterDirectOptions = {},
): Promise<BackgroundCharacterDirectResult> {
  if (!state.worldInteractionHighSimulation) {
    return { ok: false, reason: '热闹世界未开启，角色私聊半自动生成保持关闭。' };
  }
  const participants = chooseBackgroundParticipants(worldId, options);
  if (participants.length < 2) {
    return { ok: false, reason: '当前世界至少需要两个角色，才能生成角色私聊。' };
  }
  if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
    return { ok: false, reason: '模型尚未配置，角色私聊半自动生成已跳过。' };
  }
  const thread = ensureCharacterDirectThread(worldId, participants[0].id, participants[1].id);
  const raw = await callAuthoringModel(buildBackgroundDirectPrompt(worldId, participants), {
    countBudget: options.countBudget,
  });
  const action = parseAutoDirectDialogue(raw, new Set(participants.map(character => character.id)));
  if (action.messages.length < 2) {
    return { ok: false, reason: '模型返回的有效角色私聊少于两条，已跳过写入。', thread };
  }
  const createdAt = options.now ?? Date.now();
  const messages: CharacterDirectMessage[] = [];
  let replyToId: string | undefined;
  for (const [index, message] of action.messages.entries()) {
    const appended = appendCharacterDirectMessage(thread.id, message.speakerCharacterId, message.content, 'auto_model', {
      replyToId,
      createdAt: createdAt + index,
    });
    messages.push(appended);
    replyToId = appended.id;
  }
  thread.lastAutoGeneratedAt = messages.at(-1)?.createdAt ?? createdAt;
  thread.updatedAt = thread.lastAutoGeneratedAt;
  const suggestionCount = recordDirectDialogueImpact(thread, participants, messages, action);
  return {
    ok: true,
    reason: action.reason,
    thread,
    messages,
    suggestionCount,
  };
}
