// 大注释：私聊的“通讯身份”相关：以谁的身份聊天、角色之间的私聊线程、身份选择菜单。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import { characterDirectMessagesFor, characterDirectThreadIdFor, characterDirectThreadsForActor, ensureCharacterDirectThread } from '../chat/character-direct-chat';
import type { PrivateChatSpeaker } from '../chat/private-chat';
import { activeCharacter, activeWorld, communicationActor, communicationActorId, conversationFor, messagesFor, privateConversationActorIdFor, state } from '../core/state';
import type { CharacterDirectMessage, CharacterDirectThread, CharacterProfile, ChatMessage, PrivateChatEventSuggestion } from '../core/types';
import { escapeHtml } from '../core/utils';
import { pendingPrivateChatEventSuggestionsForThread } from '../social/events';
import { avatarToneAttribute, renderAvatar, renderUserAvatar } from './chat-surface';
import { icon } from './icons';

export function privateChatBackgroundImage(character?: CharacterProfile): string | undefined {
  return character ? conversationFor(character.id, privateConversationActorId(character))?.backgroundImage : undefined;
}

export function privateChatIdentityCharacter(): CharacterProfile | undefined {
  const actor = communicationActor(activeWorld().id);
  return actor.type === 'character' ? actor.character : undefined;
}

export function privateConversationActorId(character?: CharacterProfile): string {
  if (!character) return 'user';
  return privateConversationActorIdFor(character, communicationActorId(character.worldId));
}

export function activePrivateChatTarget(): CharacterProfile | undefined {
  const character = activeCharacter();
  return character && privateChatIdentityCharacter()?.id !== character.id ? character : undefined;
}

export function characterDirectThreadForTarget(
  character?: CharacterProfile,
  create = false,
): CharacterDirectThread | undefined {
  const speaker = privateChatIdentityCharacter();
  if (!speaker || !character || speaker.id === character.id || speaker.worldId !== character.worldId) return undefined;
  if (create) return ensureCharacterDirectThread(character.worldId, speaker.id, character.id);
  const threadId = characterDirectThreadIdFor(character.worldId, speaker.id, character.id);
  return state.characterDirectThreads.find(thread => thread.id === threadId);
}

export function isCharacterDirectChat(character?: CharacterProfile): boolean {
  const speaker = privateChatIdentityCharacter();
  return Boolean(speaker && character && speaker.id !== character.id && speaker.worldId === character.worldId);
}

export function characterDirectPeerThread(
  actor: CharacterProfile,
  peer: CharacterProfile,
  threads: CharacterDirectThread[] = characterDirectThreadsForActor(actor.id, actor.worldId),
): CharacterDirectThread | undefined {
  return threads.find(thread => thread.participantCharacterIds.includes(peer.id));
}

export function characterDirectLatestMessageFor(character: CharacterProfile): CharacterDirectMessage | undefined {
  const thread = characterDirectThreadForTarget(character);
  if (!thread) return undefined;
  const messages = characterDirectMessagesFor(thread.id);
  return messages[messages.length - 1];
}

export function characterDirectUnreadCount(thread: CharacterDirectThread | undefined, actorCharacterId: string): number {
  if (!thread) return 0;
  const lastReadAt = thread.lastReadByCharacterId[actorCharacterId] ?? 0;
  return state.characterDirectMessages.filter(message =>
    message.threadId === thread.id
    && !message.recalledAt
    && message.speakerCharacterId !== actorCharacterId
    && message.createdAt > lastReadAt,
  ).length;
}

export function characterDirectSpeakerName(message: CharacterDirectMessage): string {
  return state.characters.find(character => character.id === message.speakerCharacterId)?.name ?? '已删除角色';
}

export function lastMessageFor(character: CharacterProfile) {
  return messagesFor(character.id, privateConversationActorId(character)).reduce(
    (latest, message) => !latest || message.createdAt > latest.createdAt ? message : latest,
    undefined as ReturnType<typeof messagesFor>[number] | undefined,
  );
}

export function contactActivityTimeFor(character: CharacterProfile): number {
  if (isCharacterDirectChat(character)) {
    const latest = characterDirectLatestMessageFor(character);
    return latest?.createdAt ?? characterDirectThreadForTarget(character)?.updatedAt ?? character.importedAt;
  }
  return lastMessageFor(character)?.createdAt
    ?? conversationFor(character.id, privateConversationActorId(character))?.updatedAt
    ?? character.importedAt;
}

export function visibleMessagesForCharacter(character: CharacterProfile): ChatMessage[] {
  return messagesFor(character.id, privateConversationActorId(character))
    .filter(message => !message.recalledAt && !message.impactRevokedAt);
}

export function latestVisibleMessageFor(character: CharacterProfile): ChatMessage | undefined {
  const messages = visibleMessagesForCharacter(character);
  return messages[messages.length - 1];
}

export function hasRecentMomentForCharacter(character: CharacterProfile): boolean {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return state.moments.some(moment =>
    moment.worldId === character.worldId
    && moment.characterId === character.id
    && moment.createdAt >= dayAgo,
  );
}

export function activePrivateChatEventSuggestion(
  character?: CharacterProfile,
  directSpeaker?: CharacterProfile,
): PrivateChatEventSuggestion | undefined {
  if (!character) return undefined;
  if (directSpeaker && directSpeaker.id !== character.id) {
    return pendingPrivateChatEventSuggestionsForThread({
      worldId: character.worldId,
      sourceKind: 'character_direct',
      threadId: characterDirectThreadIdFor(character.worldId, directSpeaker.id, character.id),
    })[0];
  }
  const conversation = conversationFor(character.id, privateConversationActorId(character));
  if (!conversation) return undefined;
  return pendingPrivateChatEventSuggestionsForThread({
    worldId: character.worldId,
    sourceKind: 'private_chat',
    threadId: conversation.id,
  })[0];
}

export function privateChatSpeaker(): PrivateChatSpeaker {
  const actor = communicationActor(activeWorld().id);
  if (actor.type === 'character') {
    return { speakerType: 'character', speakerCharacterId: actor.character.id };
  }
  return { speakerType: 'user' };
}

export function privateChatSpeakerName(message: ChatMessage): string {
  if (message.speakerType === 'character' && message.speakerCharacterId) {
    return state.characters.find(character => character.id === message.speakerCharacterId)?.name ?? '已删除角色';
  }
  return state.userName.trim() || '我';
}

export function privateChatSpeakerAvatar(message: ChatMessage): string {
  if (message.speakerType === 'character' && message.speakerCharacterId) {
    const character = state.characters.find(item => item.id === message.speakerCharacterId);
    return character ? renderAvatar(character) : escapeHtml(privateChatSpeakerName(message).slice(0, 1));
  }
  return renderUserAvatar(state.userName);
}

export function renderPrivateChatTargetSelector(): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selectedId = communicationActorId(activeWorld().id) === 'user'
    || characters.some(character => character.id === communicationActorId(activeWorld().id))
    ? communicationActorId(activeWorld().id)
    : 'user';
  const selectedCharacter = characters.find(character => character.id === selectedId);
  const selectedName = selectedCharacter?.name ?? (state.userName.trim() || '我');
  const optionItems = [
    {
      id: 'user',
      name: state.userName.trim() || '我',
      avatar: renderUserAvatar(state.userName),
      character: undefined,
    },
    ...characters.map(character => ({
      id: character.id,
      name: character.name,
      avatar: renderAvatar(character),
      character,
    })),
  ];
  return `
    <details class="private-chat-identity-select">
      <summary aria-label="选择通讯身份">
        <span class="avatar private-chat-identity-avatar"${avatarToneAttribute(selectedCharacter)}>${selectedCharacter ? renderAvatar(selectedCharacter) : renderUserAvatar(state.userName)}</span>
        <span class="private-chat-identity-copy">
          <strong>${escapeHtml(selectedName)}</strong>
          <small>选择通讯身份</small>
        </span>
        <span class="private-chat-identity-chevron" aria-hidden="true">${icon('chevronDown')}</span>
      </summary>
      <div class="private-chat-identity-menu" role="listbox" aria-label="选择通讯身份">
        ${optionItems.map(option => `
          <button
            class="private-chat-identity-option ${option.id === selectedId ? 'is-active' : ''}"
            type="button"
            role="option"
            aria-selected="${option.id === selectedId ? 'true' : 'false'}"
            data-private-chat-identity-option="${escapeHtml(option.id)}"
          >
            <span class="avatar private-chat-identity-option-avatar"${avatarToneAttribute(option.character)}>${option.avatar}</span>
            <span class="private-chat-identity-option-copy">
              <strong>${escapeHtml(option.name)}</strong>
              <small>${option.id === selectedId ? '当前身份' : '切换身份'}</small>
            </span>
            <span class="private-chat-identity-option-check" aria-hidden="true">${option.id === selectedId ? '✓' : ''}</span>
          </button>
        `).join('')}
      </div>
    </details>
  `;
}

export function characterDirectSourceLabel(message: CharacterDirectMessage): string {
  if (message.source === 'manual') return '手写身份';
  if (message.source === 'auto_model') return '热闹世界';
  return '生成回复';
}

export function closePrivateIdentityMenus(): void {
  document.querySelectorAll<HTMLDetailsElement>('.private-chat-identity-select[open]').forEach(details => {
    details.open = false;
  });
}
