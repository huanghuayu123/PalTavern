/**
 * 大注释：Private chat module.
 * Owns one-on-one messages, reply generation, retry, recall, delete, and input-protection state.
 */
import type { CharacterProfile, ChatMessage, ConversationProfile } from '../core/types';
import { cleanModelChatFallback, parseModelChatOutput } from './format';
import {
  ensureCharacterRelationship,
  relationshipSideFor,
  updateCharacterRelationshipSide,
} from '../characters/relationships';
import { findUserStickerById } from '../media/stickers';
import { callModel } from '../model/client';
import { detectPrivateChatEventSuggestion } from '../social/events';
import {
  activeCharacter,
  communicationActorId,
  ensureConversation,
  markConversationRead,
  messagesFor,
  privateConversationActorIdFor,
  saveState,
  state,
} from '../core/state';
import {
  addRelationshipTimelineEntry,
  privateChatSegmentTimelineSourceId,
  removePrivateChatSegmentTimelineEntries,
  upsertPrivateChatSegmentTimelineEntry,
} from '../memory/timeline';
import { waitForModelTyping } from './typing-delay';
import { nowId } from '../core/utils';

export type PrivateChatSpeaker = {
  speakerType: 'user' | 'character';
  speakerCharacterId?: string;
};

export let statusText = '独立应用已启动。';
const openingRequests = new Set<string>();
let replyController: AbortController | null = null;
let replyStartedAt = 0;
let replyAbortFinalStatus = '';

// 小注释：回复控制器集中在私聊层，UI 只读状态，避免输入框在生成中被误清空。
export function isReplying(): boolean {
  return Boolean(replyController);
}

export function isOpeningMessageGenerating(character?: CharacterProfile, actorId = 'user'): boolean {
  if (!character) return false;
  const conversationActorId = privateConversationActorIdFor(character, actorId);
  return openingRequests.has(`${conversationActorId}:${character.id}`);
}

export function replyStateAgeMs(): number | null {
  return replyController && replyStartedAt > 0 ? Date.now() - replyStartedAt : null;
}

function markReplyStarted(controller: AbortController): void {
  replyController = controller;
  replyStartedAt = Date.now();
  replyAbortFinalStatus = '';
}

function clearReplyController(controller: AbortController): void {
  if (replyController !== controller) return;
  replyController = null;
  replyStartedAt = 0;
}

function actorIdFromSpeaker(character: CharacterProfile, speaker: PrivateChatSpeaker = { speakerType: 'user' }): string {
  const candidate = speaker.speakerType === 'character' && speaker.speakerCharacterId
    ? speaker.speakerCharacterId
    : 'user';
  return privateConversationActorIdFor(character, candidate);
}

function activePrivateConversationActorId(character: CharacterProfile): string {
  return privateConversationActorIdFor(character, communicationActorId(character.worldId));
}

function conversationActorId(conversation: ConversationProfile): string {
  return conversation.ownerCharacterId ?? 'user';
}

function privateChatSpeakerNameForMessage(character: CharacterProfile, message: ChatMessage): string {
  if (message.role === 'assistant') return character.name;
  if (message.speakerType === 'character' && message.speakerCharacterId) {
    return state.characters.find(item => item.id === message.speakerCharacterId)?.name ?? '已删除角色';
  }
  return state.userName.trim() || '我';
}

function participantIdsForPrivateChatEvent(character: CharacterProfile, message: ChatMessage): string[] {
  return [...new Set([
    character.id,
    message.speakerType === 'character' ? message.speakerCharacterId : undefined,
  ].filter((id): id is string => Boolean(id)))];
}

async function detectPrivateChatEventForMessage(
  character: CharacterProfile,
  conversation: ConversationProfile,
  message: ChatMessage,
): Promise<void> {
  if (message.recalledAt || !message.content.trim()) return;
  const actorId = conversationActorId(conversation);
  const recentMessages = messagesFor(character.id, actorId)
    .slice(-5)
    .map(item => ({
      speaker: privateChatSpeakerNameForMessage(character, item),
      role: item.role === 'assistant' ? 'assistant' as const : 'user' as const,
      content: item.content,
    }));
  const leadActor = message.role === 'assistant'
    ? { type: 'character' as const, id: character.id, characterId: character.id, name: character.name }
    : message.speakerType === 'character' && message.speakerCharacterId
      ? {
        type: 'character' as const,
        id: message.speakerCharacterId,
        characterId: message.speakerCharacterId,
        name: state.characters.find(item => item.id === message.speakerCharacterId)?.name ?? '角色',
      }
      : { type: 'user' as const, id: 'user', name: state.userName.trim() || '我' };
  await detectPrivateChatEventSuggestion({
    worldId: character.worldId,
    sourceKind: 'private_chat',
    threadId: conversation.id,
    messageId: message.id,
    sourceMessageRole: message.role === 'assistant' ? 'assistant' : 'user',
    content: message.content,
    speakerName: privateChatSpeakerNameForMessage(character, message),
    triggerCharacterId: message.role === 'assistant' ? character.id : message.speakerCharacterId,
    participantCharacterIds: participantIdsForPrivateChatEvent(character, message),
    leadActor,
    recentMessages,
  });
}

function abortReply(status: string, finalStatus = status): boolean {
  const controller = replyController;
  if (!controller) return false;
  replyAbortFinalStatus = finalStatus;
  controller.abort();
  replyController = null;
  replyStartedAt = 0;
  statusText = status;
  return true;
}

export function stopReply(): boolean {
  return abortReply('正在停止回复…', '已停止回复。');
}

export function resetReplyState(status = '已停止未完成的回复，输入内容已保留。'): boolean {
  return abortReply(status);
}

export function recallMessage(messageId: string): boolean {
  const message = state.messages.find(item => item.id === messageId);
  if (!message || message.recalledAt) return false;
  const character = state.characters.find(item => item.id === message.characterId);
  const conversation = state.conversations.find(item => item.id === message.conversationId);
  message.recalledAt = Date.now();
  if (character && conversation) rebuildPrivateChatAutoMemory(character, conversation);
  saveState();
  return true;
}

export function deleteMessage(messageId: string): boolean {
  const index = state.messages.findIndex(item => item.id === messageId);
  if (index < 0) return false;
  const target = state.messages[index];
  const character = state.characters.find(item => item.id === target.characterId);
  const conversation = state.conversations.find(item => item.id === target.conversationId);
  const deleteIds = new Set<string>([messageId]);
  if (target.role === 'user') {
    for (const message of state.messages) {
      if (
        message.conversationId === target.conversationId
        && message.characterId === target.characterId
        && message.createdAt > target.createdAt
      ) {
        deleteIds.add(message.id);
      }
    }
  }
  state.messages = state.messages.filter(message => !deleteIds.has(message.id));
  for (const message of state.messages) {
    if (message.replyToId && deleteIds.has(message.replyToId)) message.replyToId = undefined;
  }
  if (character && conversation) rebuildPrivateChatAutoMemory(character, conversation);
  saveState();
  return true;
}

function ensureMessageVariants(message: ChatMessage): NonNullable<ChatMessage['variants']> {
  if (!message.variants || message.variants.length === 0) {
    message.variants = [{
      id: nowId('variant'),
      content: message.content,
      stickerId: message.stickerId,
      createdAt: message.createdAt,
    }];
    message.activeVariantIndex = 0;
  }
  const activeIndex = typeof message.activeVariantIndex === 'number'
    ? Math.max(0, Math.min(message.variants.length - 1, Math.round(message.activeVariantIndex)))
    : message.variants.length - 1;
  message.activeVariantIndex = activeIndex;
  return message.variants;
}

function setMessageActiveVariant(message: ChatMessage, index: number): void {
  const variants = ensureMessageVariants(message);
  const nextIndex = Math.max(0, Math.min(variants.length - 1, Math.round(index)));
  const variant = variants[nextIndex];
  message.activeVariantIndex = nextIndex;
  message.content = variant.content;
  message.stickerId = variant.stickerId;
}

function appendMessageVariant(message: ChatMessage, content: string, stickerId?: string): void {
  const variants = ensureMessageVariants(message);
  variants.push({
    id: nowId('variant'),
    content,
    stickerId,
    createdAt: Date.now(),
  });
  setMessageActiveVariant(message, variants.length - 1);
}

function deleteMessagesAfter(message: ChatMessage): void {
  const removed = new Set<string>();
  state.messages = state.messages.filter(item => {
    const shouldRemove = item.conversationId === message.conversationId
      && item.characterId === message.characterId
      && item.createdAt > message.createdAt;
    if (shouldRemove) removed.add(item.id);
    return !shouldRemove;
  });
  for (const item of state.messages) {
    if (item.replyToId && removed.has(item.replyToId)) item.replyToId = undefined;
  }
}

export function selectMessageVariant(messageId: string, direction: -1 | 1): boolean {
  const message = state.messages.find(item => item.id === messageId);
  if (!message) return false;
  const variants = ensureMessageVariants(message);
  if (variants.length <= 1) return false;
  const current = message.activeVariantIndex ?? 0;
  const next = (current + direction + variants.length) % variants.length;
  setMessageActiveVariant(message, next);
  saveState();
  return true;
}

export function messageVariantInfo(message: ChatMessage): { index: number; count: number } {
  const count = message.variants?.length ?? 1;
  const index = typeof message.activeVariantIndex === 'number'
    ? Math.max(0, Math.min(count - 1, Math.round(message.activeVariantIndex)))
    : 0;
  return { index, count };
}

export async function editUserMessageAndRegenerate(
  messageId: string,
  content: string,
  onChange: () => void,
): Promise<void> {
  const message = state.messages.find(item => item.id === messageId);
  const character = message ? state.characters.find(item => item.id === message.characterId) : undefined;
  if (!message || message.role !== 'user' || !character) {
    statusText = '找不到可修改的用户消息。';
    onChange();
    return;
  }
  const text = content.trim();
  if (!text) {
    statusText = '消息内容不能为空。';
    onChange();
    return;
  }
  if (replyController) {
    statusText = '上一条消息仍在回复中。';
    onChange();
    return;
  }
  appendMessageVariant(message, text);
  deleteMessagesAfter(message);
  const conversation = state.conversations.find(item => item.id === message.conversationId)
    ?? ensureConversation(character);
  conversation.updatedAt = Date.now();
  rebuildPrivateChatAutoMemory(character, conversation);
  saveState();
  await generateModelReply(character, conversation, onChange);
}

export async function regenerateAssistantMessage(messageId: string, onChange: () => void): Promise<void> {
  const message = state.messages.find(item => item.id === messageId);
  const character = message ? state.characters.find(item => item.id === message.characterId) : undefined;
  if (!message || message.role !== 'assistant' || !character) {
    statusText = '找不到可重新生成的 AI 消息。';
    onChange();
    return;
  }
  if (replyController) {
    statusText = '上一条消息仍在回复中。';
    onChange();
    return;
  }
  const conversation = state.conversations.find(item => item.id === message.conversationId)
    ?? ensureConversation(character);
  statusText = '正在重新生成这一条回复…';
  const controller = new AbortController();
  markReplyStarted(controller);
  onChange();
  try {
    const contextMessages = messagesFor(character.id, conversationActorId(conversation))
      .filter(item => item.createdAt < message.createdAt);
    const rawReply = await callModel(
      character,
      '请基于上面的聊天上下文，重新生成接下来这一条角色回复。只输出这一条消息，不要解释。',
      false,
      true,
      controller.signal,
      { contextMessages, useChatPreset: true },
    );
    if (controller.signal.aborted) {
      statusText = '已停止重新生成。';
      return;
    }
    const parts = parseModelChatOutput(rawReply, character);
    const fallbackContent = cleanModelChatFallback(rawReply);
    const next = parts[0] ?? (fallbackContent ? { content: fallbackContent, stickerId: undefined } : undefined);
    if (!next) {
      statusText = `${character.name} 这次只返回了不可用的表情包，已跳过。`;
      saveState();
      return;
    }
    statusText = `${character.name} 正在输入…`;
    onChange();
    await waitForModelTyping(next.content, controller.signal);
    if (controller.signal.aborted) {
      statusText = '已停止重新生成。';
      return;
    }
    appendMessageVariant(message, next.content, next.stickerId);
    conversation.updatedAt = Date.now();
    rebuildPrivateChatAutoMemory(character, conversation);
    statusText = '已重新生成，可用下方版本切换查看旧回复。';
    saveState();
  } catch (error) {
    const abortStatus = replyAbortFinalStatus || '已停止重新生成。';
    statusText = error instanceof Error && error.name === 'AbortError'
      ? abortStatus
      : error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === 'AbortError') replyAbortFinalStatus = '';
  } finally {
    clearReplyController(controller);
  }
  onChange();
}

export function removeSingleMessage(messageId: string): boolean {
  const index = state.messages.findIndex(item => item.id === messageId);
  if (index < 0) return false;
  const target = state.messages[index];
  const character = state.characters.find(item => item.id === target.characterId);
  const conversation = state.conversations.find(item => item.id === target.conversationId);
  state.messages.splice(index, 1);
  for (const message of state.messages) {
    if (message.replyToId === messageId) message.replyToId = undefined;
  }
  if (character && conversation) rebuildPrivateChatAutoMemory(character, conversation);
  saveState();
  return true;
}

export function setStatusText(value: string): void {
  statusText = value;
}

function appendPrivateRelationshipSummary(existing: string, line: string): string {
  return existing ? `${existing}\n${line}`.slice(-900) : line;
}

function noteCharacterAuthoredPrivateActivity(
  target: CharacterProfile,
  speakerId: string | undefined,
  conversation: ConversationProfile,
  createdAt: number,
  userMessageCount: number,
): boolean {
  if (!speakerId || speakerId === target.id || userMessageCount === 0 || userMessageCount % 5 !== 0) return false;
  const speaker = state.characters.find(character =>
    character.id === speakerId && character.worldId === target.worldId,
  );
  if (!speaker) return false;
  const relationship = ensureCharacterRelationship(speaker, target);
  const speakerSide = relationshipSideFor(relationship, speaker.id);
  // Big comment: a character-authored private message is still stored in the target private chat, but relationship memory belongs to character-to-character context.
  updateCharacterRelationshipSide(relationship, speaker.id, {
    stage: speakerSide.stage,
    summary: appendPrivateRelationshipSummary(
      speakerSide.summary,
      `${new Date(createdAt).toLocaleDateString()} 私聊里连续互动，${speaker.name} 主动联系了 ${target.name}。`,
    ),
  });
  conversation.updatedAt = createdAt;
  return true;
}

function noteUserActivity(
  character: CharacterProfile,
  conversation: ConversationProfile,
  createdAt: number,
  speaker: PrivateChatSpeaker = { speakerType: 'user' },
): void {
  character.autoMessage.lastUserReplyAt = createdAt;
  if (character.autoMessage.unansweredCount > 0) {
    character.autoMessage.pendingResetDecision = true;
    character.autoMessage.pacingReason = '用户已经回复，等待用户决定是否恢复主动联系频率。';
  }
  const userMessageCount = state.messages
    .filter(message =>
      message.conversationId === conversation.id
      && message.role === 'user'
      && !message.recalledAt
    )
    .length;
  if (userMessageCount > 0 && userMessageCount % 5 === 0) {
    if (speaker.speakerType === 'character' && noteCharacterAuthoredPrivateActivity(
      character,
      speaker.speakerCharacterId,
      conversation,
      createdAt,
      userMessageCount,
    )) {
      return;
    }
    character.relationship.affinity = Math.max(0, Math.round(character.relationship.affinity + 1));
    character.relationship.updatedAt = createdAt;
    addRelationshipTimelineEntry(
      character,
      `${character.name} 和你的关系更稳定了`,
      `最近连续聊天让关系更熟悉，好感度 +1。`,
      `${conversation.id}:chat:${userMessageCount}`,
    );
  }
  conversation.updatedAt = createdAt;
}

function privateChatMemorySegmentIsWorthKeeping(messages: ChatMessage[]): boolean {
  const text = messages.map(message => message.content).join('\n').trim();
  if (!text) return false;
  if (text.length >= 18) return true;
  return /表白|喜欢|愛|爱|线下|見面|见面|约|約|明天|后天|今晚|地址|地点|计划|承诺|答应|拒绝|分手|恋人|关系|亲吻|牵手/.test(text);
}

function privateChatMemorySegments(character: CharacterProfile, conversation: ConversationProfile): ChatMessage[][] {
  const messages = messagesFor(character.id, conversationActorId(conversation))
    .filter(message => !message.recalledAt && message.content.trim())
    .sort((left, right) => left.createdAt - right.createdAt);
  const segments: ChatMessage[][] = [];
  let current: ChatMessage[] = [];
  for (const message of messages) {
    if (message.role === 'user' && current.some(item => item.role === 'assistant')) {
      if (privateChatMemorySegmentIsWorthKeeping(current)) segments.push(current);
      current = [];
    }
    current.push(message);
  }
  if (privateChatMemorySegmentIsWorthKeeping(current)) segments.push(current);
  return segments;
}

function rebuildPrivateChatAutoMemory(character: CharacterProfile, conversation: ConversationProfile): void {
  removePrivateChatSegmentTimelineEntries(conversation.id);
  for (const segment of privateChatMemorySegments(character, conversation)) {
    const sourceId = privateChatSegmentTimelineSourceId(conversation.id, segment[0].id);
    if (state.timelineEntries.some(entry => entry.source.type === 'message' && entry.source.id === sourceId)) {
      continue;
    }
    upsertPrivateChatSegmentTimelineEntry(character, conversation, segment);
  }
}

export function rebuildPrivateChatAutoMemoryForCharacter(characterId: string): number {
  const character = state.characters.find(item => item.id === characterId);
  if (!character) return 0;
  const conversations = state.conversations.filter(conversation =>
    conversation.characterId === character.id && conversation.worldId === character.worldId,
  );
  for (const conversation of conversations) {
    rebuildPrivateChatAutoMemory(character, conversation);
  }
  return conversations.length;
}

function appendUserMessage(
  character: CharacterProfile,
  conversation: ConversationProfile,
  content: string,
  replyToId?: string,
  speaker: PrivateChatSpeaker = { speakerType: 'user' },
): ChatMessage {
  const createdAt = Date.now();
  // Big comment: the message stays in the current private chat; this only records the selected speaking identity.
  const speakerType = speaker.speakerType === 'character' && speaker.speakerCharacterId ? 'character' : 'user';
  const message: ChatMessage = {
    id: nowId('msg'),
    conversationId: conversation.id,
    characterId: character.id,
    role: 'user',
    speakerType,
    speakerCharacterId: speakerType === 'character' ? speaker.speakerCharacterId : undefined,
    content,
    replyToId,
    variants: [{
      id: nowId('variant'),
      content,
      createdAt,
    }],
    activeVariantIndex: 0,
    createdAt,
    source: 'user',
  };
  state.messages.push(message);
  noteUserActivity(character, conversation, createdAt, speaker);
  rebuildPrivateChatAutoMemory(character, conversation);
  saveState();
  return message;
}

function hasPendingUserInput(character: CharacterProfile, actorId = 'user'): boolean {
  const visibleMessages = messagesFor(character.id, actorId)
    .filter(message => !message.recalledAt)
    .sort((left, right) => left.createdAt - right.createdAt);
  const lastAssistantIndex = visibleMessages.findLastIndex(message => message.role === 'assistant');
  return visibleMessages.slice(lastAssistantIndex + 1).some(message => message.role === 'user');
}

async function generateModelReply(
  character: CharacterProfile,
  conversation: ConversationProfile,
  onChange: () => void,
): Promise<void> {
  if (replyController) {
    statusText = '上一条消息仍在回复中。';
    onChange();
    return;
  }
  statusText = '正在回复中…';
  const controller = new AbortController();
  markReplyStarted(controller);
  onChange();

  try {
    const reply = await callModel(character, '', false, true, controller.signal, {
      contextMessages: messagesFor(character.id, conversationActorId(conversation)),
      useChatPreset: true,
    });
    if (controller.signal.aborted) {
      statusText = '已停止回复。';
      return;
    }
    statusText = `${character.name} 正在输入…`;
    onChange();
    await waitForModelTyping(reply, controller.signal);
    if (controller.signal.aborted) {
      statusText = '已停止回复。';
      return;
    }
    const messages = appendAssistantReply(character, conversation, reply, 'model_reply');
    for (const message of messages) {
      await detectPrivateChatEventForMessage(character, conversation, message);
    }
    if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
      markConversationRead(character.id, Date.now(), conversationActorId(conversation));
    }
    statusText = '回复完成。';
  } catch (error) {
    const abortStatus = replyAbortFinalStatus || '已停止回复。';
    statusText = error instanceof Error && error.name === 'AbortError'
      ? abortStatus
      : error instanceof Error ? error.message : String(error);
    if (error instanceof Error && error.name === 'AbortError') replyAbortFinalStatus = '';
  } finally {
    clearReplyController(controller);
  }
  saveState();
  onChange();
}

export function appendAssistantReply(
  character: CharacterProfile,
  conversation: ConversationProfile,
  rawReply: string,
  source: ChatMessage['source'],
  autoReason?: string,
): ChatMessage[] {
  const baseTime = Date.now();
  const messages = parseModelChatOutput(rawReply, character).map((part, index) => {
    const createdAt = baseTime + index;
    return {
      id: nowId(source === 'generated_opening' ? 'opening' : source === 'auto_message' ? 'auto' : 'msg'),
      conversationId: conversation.id,
      characterId: character.id,
      role: 'assistant' as const,
      content: part.content,
      stickerId: part.stickerId,
      autoReason: source === 'auto_message' ? autoReason : undefined,
      variants: [{
        id: nowId('variant'),
        content: part.content,
        stickerId: part.stickerId,
        createdAt,
      }],
      activeVariantIndex: 0,
      createdAt,
      source,
    };
  });
  state.messages.push(...messages);
  conversation.updatedAt = messages[messages.length - 1]?.createdAt ?? baseTime;
  rebuildPrivateChatAutoMemory(character, conversation);
  return messages;
}

export async function generateOpeningMessage(
  character: CharacterProfile,
  onChange: () => void,
  actorId = 'user',
): Promise<boolean> {
  const conversationActorId = privateConversationActorIdFor(character, actorId);
  const openingRequestId = `${conversationActorId}:${character.id}`;
  if (messagesFor(character.id, conversationActorId).length > 0 || openingRequests.has(openingRequestId)) {
    return false;
  }
  if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
    statusText = `已导入 ${character.name}。配置模型后会自动生成新的开场消息。`;
    onChange();
    return false;
  }

  openingRequests.add(openingRequestId);
  statusText = `正在为 ${character.name} 生成新的开场消息…`;
  onChange();
  try {
    const conversation = ensureConversation(character, conversationActorId);
    const content = await callModel(character, [
      '这是这个角色与用户在本应用中的第一次私聊。',
      '请根据角色描述、性格、当前场景、关系状态、世界书与近期世界事件，主动发出一条全新的开场消息。',
      '不要读取、复述、改写或提及角色卡原本的 first_mes、first_message 或开场白。',
      '写成聊天软件里自然发来的私信，不要写成长篇小说，不要替用户行动或说话。',
      '控制在 1 到 4 个短段落内，可以有少量符合角色风格的动作或环境描写。',
    ].join('\n'), true, true, undefined, { contextMessages: [], useChatPreset: true });
    statusText = `${character.name} 正在输入…`;
    onChange();
    await waitForModelTyping(content);
    appendAssistantReply(character, conversation, content, 'generated_opening');
    statusText = `${character.name} 的新开场消息已生成。`;
    saveState();
    return true;
  } catch (error) {
    statusText = error instanceof Error ? `开场消息生成失败：${error.message}` : String(error);
    saveState();
    return false;
  } finally {
    openingRequests.delete(openingRequestId);
    onChange();
  }
}

export async function sendUserMessageOnly(
  content: string,
  onChange: () => void,
  replyToId?: string,
  speaker?: PrivateChatSpeaker,
): Promise<void> {
  const character = activeCharacter();
  if (!character) {
    statusText = '请先导入角色卡。';
    onChange();
    return;
  }
  const text = content.trim();
  if (!text) return;
  if (replyController) {
    statusText = '上一条消息仍在回复中。';
    onChange();
    return;
  }
  const actorId = actorIdFromSpeaker(character, speaker);
  const conversation = ensureConversation(character, actorId);
  const message = appendUserMessage(character, conversation, text, replyToId, speaker);
  await detectPrivateChatEventForMessage(character, conversation, message);
  statusText = '已发送。可以继续发短消息，或点生成回复。';
  onChange();
}

export async function generateReply(onChange: () => void): Promise<void> {
  const character = activeCharacter();
  if (!character) {
    statusText = '请先导入角色卡。';
    onChange();
    return;
  }
  const actorId = activePrivateConversationActorId(character);
  const conversation = ensureConversation(character, actorId);
  if (!hasPendingUserInput(character, actorId)) {
    statusText = '先发一条短消息，再点生成回复。';
    onChange();
    return;
  }
  await generateModelReply(character, conversation, onChange);
}

export async function sendMessage(
  content: string,
  onChange: () => void,
  replyToId?: string,
  speaker?: PrivateChatSpeaker,
): Promise<void> {
  const character = activeCharacter();
  if (!character) {
    statusText = '请先导入角色卡。';
    onChange();
    return;
  }
  const text = content.trim();
  if (!text) {
    return;
  }
  if (replyController) {
    statusText = '上一条消息仍在回复中。';
    onChange();
    return;
  }
  const actorId = actorIdFromSpeaker(character, speaker);
  const conversation = ensureConversation(character, actorId);
  const message = appendUserMessage(character, conversation, text, replyToId, speaker);
  await detectPrivateChatEventForMessage(character, conversation, message);
  await generateModelReply(character, conversation, onChange);
}

export async function sendStickerMessage(
  stickerId: string,
  onChange: () => void,
  speaker: PrivateChatSpeaker = { speakerType: 'user' },
): Promise<void> {
  const character = activeCharacter();
  const sticker = findUserStickerById(stickerId);
  if (!character || !sticker) {
    statusText = '找不到这个表情包。';
    onChange();
    return;
  }
  if (replyController) {
    statusText = '上一条消息仍在回复中。';
    onChange();
    return;
  }
  const actorId = actorIdFromSpeaker(character, speaker);
  const conversation = ensureConversation(character, actorId);
  const createdAt = Date.now();
  const speakerType = speaker.speakerType === 'character' && speaker.speakerCharacterId ? 'character' : 'user';
  state.messages.push({
    id: nowId('sticker'),
    conversationId: conversation.id,
    characterId: character.id,
    role: 'user',
    speakerType,
    speakerCharacterId: speakerType === 'character' ? speaker.speakerCharacterId : undefined,
    content: `[表情包：${sticker.name}]`,
    stickerId: sticker.id,
    variants: [{
      id: nowId('variant'),
      content: `[表情包：${sticker.name}]`,
      stickerId: sticker.id,
      createdAt,
    }],
    activeVariantIndex: 0,
    createdAt,
    source: 'user',
  });
  noteUserActivity(character, conversation, createdAt, speaker);
  saveState();
  if (state.chatReplyMode === 'manual') {
    statusText = '表情已发送。可以继续发短消息，或点生成回复。';
    onChange();
    return;
  }
  await generateModelReply(character, conversation, onChange);
}
