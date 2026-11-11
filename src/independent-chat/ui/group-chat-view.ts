// 大注释：群聊的纯渲染与小工具：群列表排序、群头像、发言人、成员管理区块。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import { groupParticipants, isGroupGenerating } from '../chat/group-chat';
import { activeWorld, communicationActor, groupChatsForActiveWorld, groupMessagesFor, state } from '../core/state';
import type { CharacterProfile, GroupChatMessage, GroupChatProfile, GroupReplyLiveliness } from '../core/types';
import { escapeHtml } from '../core/utils';
import { avatarToneAttribute, renderAvatar, renderUserAvatar } from './chat-surface';

export function groupChatBackgroundImage(chat?: GroupChatProfile): string | undefined {
  return chat?.backgroundImage;
}

export function lastGroupMessageFor(chat: GroupChatProfile): GroupChatMessage | undefined {
  return groupMessagesFor(chat.id).reduce(
    (latest, message) => !latest || message.createdAt > latest.createdAt ? message : latest,
    undefined as GroupChatMessage | undefined,
  );
}

export function groupChatSortTime(chat: GroupChatProfile): number {
  return lastGroupMessageFor(chat)?.createdAt ?? chat.updatedAt ?? chat.createdAt;
}

export function groupChatVisibleForPrivateIdentity(_chat: GroupChatProfile): boolean {
  // 大注释：群聊记录是世界内共享的，不按通讯身份拆分；当前身份只影响发言人和视角。
  return true;
}

export function groupChatsForPrivateIdentity(): GroupChatProfile[] {
  return groupChatsForActiveWorld().filter(groupChatVisibleForPrivateIdentity);
}

export function groupSpeakerFromCommunicationIdentity(chat: GroupChatProfile): string {
  const actor = communicationActor(chat.worldId);
  if (actor.type === 'character' && chat.participantCharacterIds.includes(actor.character.id)) return actor.character.id;
  return 'user';
}

export function preferredGroupSpeakerIdForPrivateIdentity(chat: GroupChatProfile): string {
  return groupSpeakerFromCommunicationIdentity(chat);
}

export function ensureGroupChatForSpeaker(): void {
  const chats = groupChatsForPrivateIdentity();
  if (chats.length === 0) {
    state.activeGroupChatId = '';
    return;
  }
  const active = chats.find(chat => chat.id === state.activeGroupChatId) ?? chats[0];
  state.activeGroupChatId = active.id;
  const preferredSpeakerId = preferredGroupSpeakerIdForPrivateIdentity(active);
  if (active.selectedSpeakerId !== preferredSpeakerId) {
    active.selectedSpeakerId = preferredSpeakerId;
  }
}

export function renderGroupAvatarStack(chat: GroupChatProfile): string {
  const participants = chat.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id && character.worldId === chat.worldId))
    .filter((character): character is CharacterProfile => Boolean(character))
    .slice(0, 4);
  if (participants.length === 0) {
    return '<span class="group-avatar-stack"><span class="avatar group-avatar-fallback">群</span></span>';
  }
  return `
    <span class="group-avatar-stack" aria-hidden="true" data-group-avatar-count="${participants.length}">
      ${participants.map(character => `<span class="avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>`).join('')}
    </span>
  `;
}

export function groupSpeakerName(message: GroupChatMessage): string {
  if (message.speakerType === 'user') return state.userName || '我';
  if (message.speakerType === 'system') return '系统';
  return state.characters.find(character => character.id === message.speakerCharacterId)?.name ?? '已删除角色';
}

export function renderGroupMessageAvatar(message: GroupChatMessage): string {
  if (message.speakerType === 'character') {
    const character = state.characters.find(item => item.id === message.speakerCharacterId);
    return character ? renderAvatar(character) : escapeHtml(groupSpeakerName(message).slice(0, 1));
  }
  return renderUserAvatar(state.userName);
}

export function userSelfLabel(): string {
  const name = state.userName.trim();
  return name && name !== '我' ? `我（${name}）` : '我';
}

export function groupUserSpeakerLabel(): string {
  return userSelfLabel();
}

export function renderGroupSpeakerPicker(chat?: GroupChatProfile): string {
  if (!chat) return '';
  const participants = groupParticipants(chat);
  const selected = groupSpeakerFromCommunicationIdentity(chat);
  const selectedCharacter = participants.find(character => character.id === selected);
  const selectedLabel = selectedCharacter?.name ?? groupUserSpeakerLabel();
  return `
    <div class="group-speaker-switch is-readonly">
      <span>发言身份</span>
      <strong>${escapeHtml(selectedLabel)}</strong>
      <small>跟随消息页左上角通讯身份</small>
    </div>
  `;
}

export function renderGroupParticipantsEditor(chat?: GroupChatProfile): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  if (characters.length === 0) {
    return '<p class="muted">当前世界还没有角色。先导入或写一张角色卡，再创建群聊。</p>';
  }
  const selected = new Set(chat?.participantCharacterIds ?? characters.map(character => character.id));
  return `
    <div class="group-participant-grid">
      ${characters.map(character => `
        <label class="group-participant-option ${selected.has(character.id) ? 'is-active' : ''}">
          <input type="checkbox" data-group-participant value="${escapeHtml(character.id)}" ${selected.has(character.id) ? 'checked' : ''} />
          <span class="avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
          <strong>${escapeHtml(character.name)}</strong>
        </label>
      `).join('')}
    </div>
  `;
}

export function renderGroupMemberActions(chat?: GroupChatProfile): string {
  if (!chat) return '';
  const participants = groupParticipants(chat);
  if (participants.length === 0) return '<p class="muted">这个群聊还没有角色成员。</p>';
  return `
    <div class="group-member-actions">
      ${participants.map(character => `
        <button class="secondary" type="button" data-generate-group-speaker="${escapeHtml(character.id)}" ${isGroupGenerating() ? 'disabled' : ''}>
          让 ${escapeHtml(character.name)} 说
        </button>
      `).join('')}
    </div>
  `;
}

export function renderGroupHeader(chat?: GroupChatProfile, mobile = false): string {
  const participants = chat ? groupParticipants(chat) : [];
  const subtitle = chat ? `${participants.length} 位成员` : '创建或管理群聊';
  return `
    <div class="chat-identity group-chat-identity">
      ${mobile ? '<button class="header-back" data-mobile-group-back aria-label="返回">‹</button>' : ''}
      ${chat ? renderGroupAvatarStack(chat) : '<span class="avatar group-avatar-fallback">群</span>'}
      <div>
        <strong>${escapeHtml(chat?.title ?? '群聊')}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
    </div>
  `;
}

export function renderGroupManagementSection(chat: GroupChatProfile): string {
  const participants = groupParticipants(chat);
  const messageCount = groupMessagesFor(chat.id).length;
  const disabled = isGroupGenerating();
  return `
    <section class="group-settings-section group-management-section">
      <div class="mobile-section-label">
        <strong>群聊管理</strong>
        <span>${participants.length} 位成员 · ${messageCount} 条聊天记录</span>
      </div>
      <p class="muted">清空只删除这个群的聊天记录；解散会删除群聊和记录，角色卡不会被删除。</p>
      <div class="group-danger-actions">
        <button class="secondary" id="clear-group-messages" type="button" ${messageCount > 0 && !disabled ? '' : 'disabled'}>清空聊天记录</button>
        <button class="danger" id="delete-group-chat" type="button" ${disabled ? 'disabled' : ''}>解散群聊</button>
      </div>
    </section>
  `;
}

export const GROUP_REPLY_LIVELINESS_OPTIONS: Array<{ value: GroupReplyLiveliness; label: string; description: string }> = [
  { value: 'lively', label: '热闹', description: '优先 2-3 位角色短句接话，单人最多 3 个气泡。' },
  { value: 'natural', label: '自然', description: '保持旧节奏，最多 2 位角色、整轮最多 3 个气泡。' },
  { value: 'quiet', label: '安静', description: '最多 1 位角色接话，也可以没人接。' },
];

export function groupReplyLivelinessValue(value: unknown): GroupReplyLiveliness {
  return value === 'quiet' || value === 'natural' || value === 'lively' ? value : 'lively';
}

export function renderGroupReplyLivelinessOptions(selected: GroupReplyLiveliness): string {
  return GROUP_REPLY_LIVELINESS_OPTIONS.map(option =>
    `<option value="${option.value}" ${option.value === selected ? 'selected' : ''}>${option.label}</option>`,
  ).join('');
}

export function groupReplyLivelinessDescription(value: GroupReplyLiveliness): string {
  return GROUP_REPLY_LIVELINESS_OPTIONS.find(option => option.value === value)?.description
    ?? GROUP_REPLY_LIVELINESS_OPTIONS[0].description;
}
