export {};
declare const require: (id: string) => any;

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  },
});

const stateModule = require('../src/independent-chat/core/state');
const backup = require('../src/independent-chat/data/backup');
const promptPresets = require('../src/independent-chat/model/prompt-presets');
const characterRelationships = require('../src/independent-chat/characters/relationships');

const character = {
  id: 'backup_character',
  worldId: 'world_default',
  name: 'Backup Character',
  tags: ['backup'],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v2',
    specVersion: '2.0',
    worldBookEntryCount: 0,
    importedFileName: '',
  },
  relationship: {
    stage: 'intimate',
    affinity: 88,
    summary: 'A relationship that must survive backup.',
    updatedAt: Date.now(),
  },
  autoMessage: {
    ...stateModule.createDefaultAutoMessageSchedule(),
    enabled: true,
    unansweredCount: 3,
    currentPacingState: 'cooldown',
    pendingResetDecision: true,
  },
  importedAt: Date.now(),
};
const backupPeer = {
  ...character,
  id: 'backup_peer_character',
  name: 'Backup Peer',
  relationship: stateModule.createDefaultRelationship(),
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
};
stateModule.state.characters.push(character, backupPeer);
const backupPair = characterRelationships.ensureCharacterRelationship(character, backupPeer);
characterRelationships.updateCharacterRelationshipSide(backupPair, character.id, {
  stage: 'close',
  summary: 'Backup Character relies on Backup Peer during night shifts.',
});
characterRelationships.updateCharacterRelationshipSide(backupPair, backupPeer.id, {
  stage: 'familiar',
  summary: 'Backup Peer keeps a careful distance but answers quickly.',
});
stateModule.state.characterRelationshipSuggestions.push({
  id: 'backup_relationship_suggestion',
  worldId: 'world_default',
  relationshipId: backupPair.id,
  fromCharacterId: backupPeer.id,
  toCharacterId: character.id,
  suggestedStage: 'close',
  reason: 'A backup relationship suggestion that must survive restore.',
  sourceEventId: 'backup_event',
  createdAt: Date.now(),
});
stateModule.state.commonStickers.push({
  id: 'common_sticker',
  name: 'Common',
  dataUrl: 'data:image/webp;base64,COMMON',
  importedAt: Date.now(),
});
stateModule.state.userStickers.push({
  id: 'user_sticker',
  name: 'User',
  dataUrl: 'data:image/webp;base64,USER',
  importedAt: Date.now(),
});
stateModule.state.activeCharacterId = character.id;
stateModule.state.enterToSend = true;
stateModule.state.worldInteractionHighSimulation = true;
stateModule.state.worlds[0].userPersona = 'A backup persona that must survive restore.';
stateModule.state.userPersona = 'A backup persona that must survive restore.';
const backupPreset = promptPresets.parseSillyTavernPromptPreset(JSON.stringify({
  prompts: [{ identifier: 'backup_prompt', name: 'Backup Prompt', role: 'system', content: 'Persist preset.' }],
  prompt_order: [{ order: [{ identifier: 'backup_prompt', enabled: true }] }],
  extensions: { regex_scripts: [{ id: 'regex' }], SPreset: { kept: true } },
}), 'backup-preset.json', Date.now());
stateModule.state.promptPresets.push(backupPreset);
stateModule.state.activeChatPromptPresetId = backupPreset.id;
stateModule.state.chatPromptPresetEnabled = true;
const conversation = stateModule.ensureConversation(character);
stateModule.state.messages.push({
  id: 'backup_message',
  conversationId: conversation.id,
  characterId: character.id,
  role: 'assistant',
  content: 'Persist me',
  autoReason: 'Because this reason must survive backup.',
  impactRevokedAt: Date.now(),
  createdAt: Date.now(),
  source: 'auto_message',
});
stateModule.state.moments.push({
  id: 'backup_moment',
  worldId: 'world_default',
  characterId: character.id,
  content: 'Persist this moment',
  createdAt: Date.now(),
  source: 'character',
  visibility: {
    mode: 'specific',
    characterIds: [character.id],
    blockedCharacterIds: [],
  },
});
stateModule.state.worldEvents.push({
  id: 'backup_event',
  worldId: 'world_default',
  title: 'Persist this event',
  description: 'Event description',
  participantCharacterIds: [character.id],
  affinityDelta: 2,
  status: 'active',
  createdAt: Date.now(),
  resolvedAt: null,
  source: 'manual',
});
stateModule.state.groupChats.push({
  id: 'backup_group',
  worldId: 'world_default',
  title: 'Backup Group',
  participantCharacterIds: [character.id],
  selectedSpeakerId: character.id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
stateModule.state.activeGroupChatId = 'backup_group';
stateModule.state.groupMessages.push({
  id: 'backup_group_message',
  groupChatId: 'backup_group',
  worldId: 'world_default',
  speakerType: 'character',
  speakerCharacterId: character.id,
  content: 'Persist this group message',
  source: 'auto_model',
  createdAt: Date.now(),
});
stateModule.state.timelineEntries.push({
  id: 'backup_timeline',
  worldId: 'world_default',
  createdAt: Date.now(),
  type: 'auto_message',
  characterIds: [character.id],
  characterNames: { [character.id]: character.name },
  title: 'Backup Character contacted you',
  summary: 'Because this reason must survive backup. Persist me',
  source: { type: 'message', id: 'backup_message' },
  canUndo: false,
  includeInContext: true,
});
stateModule.state.impactRecords.push({
  id: 'backup_impact',
  worldId: 'world_default',
  operationId: 'auto_message:backup_message',
  label: '主动消息：Backup Character',
  source: { type: 'message', id: 'backup_message' },
  targetType: 'message',
  targetId: 'backup_message',
  characterId: character.id,
  oldValue: { impactRevokedAt: null },
  newValue: { content: 'Persist me' },
  timelineEntryIds: ['backup_timeline'],
  createdAt: Date.now(),
  rolledBackAt: Date.now(),
});
stateModule.state.characterInteractions.push({
  id: 'backup_interaction',
  worldId: 'world_default',
  type: 'moment_comment',
  actorCharacterId: character.id,
  targetCharacterIds: ['backup_target_character'],
  title: 'Backup interaction',
  summary: 'A saved interaction that must survive backup.',
  reason: 'Because a character commented on another visible moment.',
  source: { type: 'comment', id: 'backup_comment' },
  timelineEntryId: 'backup_timeline',
  createdAt: Date.now(),
});
stateModule.state.characterStatuses.push({
  id: 'backup_status',
  worldId: 'world_default',
  characterId: character.id,
  mood: '有新的状态',
  relationshipStage: 'intimate',
  affinity: 88,
  relationshipSummary: 'A relationship that must survive backup.',
  recentMemoryTitles: ['Backup memory'],
  unresolvedItems: ['Backup unresolved item'],
  nextInclination: '可能会主动联系。',
  activeSources: ['聊天', '事件'],
  summary: 'A saved status summary that must survive backup.',
  source: 'rule',
  updatedAt: Date.now(),
});
stateModule.state.dailyBriefs.push({
  id: 'backup_brief',
  worldId: 'world_default',
  dateKey: '2026-06-07',
  title: '今日简报',
  summary: 'A saved daily brief that must survive backup.',
  sections: ['备份里的一条简报。'],
  suggestedCharacterIds: [character.id],
  unreadCount: 1,
  changeCount: 2,
  timelineEntryId: 'backup_timeline',
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
stateModule.state.companionTimeMode = 'virtual';
stateModule.state.virtualTimeMinutes = 6 * 60 + 30;

const text = backup.createBackupText();
const envelope = JSON.parse(text);
if (envelope.schema !== 'tavern-social-backup-v1') {
  throw new Error('Backup schema marker is missing.');
}
if (!backup.backupFileName().startsWith('tavern-social-backup-') || !backup.backupFileName().endsWith('.json')) {
  throw new Error('Backup file name is not user-readable.');
}
if (!backup.backupDownloadFolderHint().includes('Downloads')) {
  throw new Error('Backup folder hint does not tell the user where to find the file.');
}

stateModule.replaceState(stateModule.defaultState());
const restored = backup.restoreBackupText(text);
const restoredCharacter = restored.characters.find((item: any) => item.id === character.id);
if (!restoredCharacter || restoredCharacter.relationship.affinity !== 88) {
  throw new Error('Character relationship did not survive backup restore.');
}
const restoredPair = restored.characterRelationships.find((item: any) => item.id === backupPair.id);
if (
  !restoredPair
  || restoredPair.aToB.summary !== 'Backup Character relies on Backup Peer during night shifts.'
  || restoredPair.bToA.summary !== 'Backup Peer keeps a careful distance but answers quickly.'
  || restored.characterRelationshipSuggestions.length !== 1
  || restored.characterRelationshipSuggestions[0].id !== 'backup_relationship_suggestion'
) {
  throw new Error('Character-to-character relationships or pending stage suggestions did not survive backup restore.');
}
if (restored.companionTimeMode !== 'virtual' || restored.virtualTimeMinutes !== 6 * 60 + 30) {
  throw new Error('Companion time mode did not survive backup restore.');
}
if (restored.enterToSend !== true) {
  throw new Error('Enter-to-send setting did not survive backup restore.');
}
if (restored.worldInteractionHighSimulation !== true) {
  throw new Error('World interaction high simulation setting did not survive backup restore.');
}
if (
  restoredCharacter.autoMessage.unansweredCount !== 3
  || !restoredCharacter.autoMessage.pendingResetDecision
  || restoredCharacter.autoMessage.currentPacingState !== 'cooldown'
) {
  throw new Error('Proactive pacing state did not survive backup restore.');
}
if (
  restored.messages.length !== 1
  || restored.moments.length !== 1
  || restored.worldEvents.length !== 1
  || restored.conversations.length !== 1
) {
  throw new Error('Conversation, message, moment, or event data was lost during restore.');
}
if (
  restored.groupChats.length !== 1
  || restored.activeGroupChatId !== 'backup_group'
  || restored.groupChats[0].selectedSpeakerId !== character.id
  || restored.groupMessages.length !== 1
  || restored.groupMessages[0].content !== 'Persist this group message'
) {
  throw new Error('Group chats or group messages did not survive backup restore.');
}
if (
  restored.moments[0].visibility.mode !== 'specific'
  || restored.moments[0].visibility.characterIds[0] !== character.id
) {
  throw new Error('Moment visibility did not survive backup restore.');
}
if (
  restored.messages[0].autoReason !== 'Because this reason must survive backup.'
  || !restored.messages[0].impactRevokedAt
  || restored.timelineEntries.length !== 1
  || restored.timelineEntries[0].source.id !== 'backup_message'
) {
  throw new Error('Timeline entries or proactive message reasons did not survive backup restore.');
}
if (
  restored.impactRecords.length !== 1
  || restored.impactRecords[0].operationId !== 'auto_message:backup_message'
  || !restored.impactRecords[0].rolledBackAt
) {
  throw new Error('Impact records did not survive backup restore.');
}
if (
  restored.characterInteractions.length !== 1
  || restored.characterInteractions[0].id !== 'backup_interaction'
  || restored.characterInteractions[0].targetCharacterIds[0] !== 'backup_target_character'
) {
  throw new Error('Character interaction records did not survive backup restore.');
}
if (
  restored.characterStatuses.length !== 1
  || restored.characterStatuses[0].summary !== 'A saved status summary that must survive backup.'
  || restored.dailyBriefs.length !== 1
  || restored.dailyBriefs[0].summary !== 'A saved daily brief that must survive backup.'
) {
  throw new Error('Character status summaries or daily briefs did not survive backup restore.');
}
if (restored.commonStickers.length !== 1 || restored.userStickers.length !== 1) {
  throw new Error('Common or user sticker libraries did not survive backup restore.');
}
if (restored.worlds[0].userPersona !== 'A backup persona that must survive restore.') {
  throw new Error('User persona did not survive backup restore.');
}
const restoredBackupPreset = restored.promptPresets.find((preset: { id: string }) => preset.id === backupPreset.id);
if (
  restored.promptPresets.length < 1
  || restored.activeChatPromptPresetId !== backupPreset.id
  || restored.chatPromptPresetEnabled !== true
  || !restoredBackupPreset
  || restoredBackupPreset.regexScriptCount !== 1
  || restoredBackupPreset.regexScripts.length !== 1
) {
  throw new Error('Prompt preset data did not survive backup restore.');
}

console.log(JSON.stringify({
  schema: true,
  relationship: true,
  proactivePacing: true,
  conversation: true,
  moments: true,
  momentVisibility: true,
  events: true,
  stickerLibraries: true,
  userPersona: true,
  promptPresets: true,
  timeline: true,
  groupChats: true,
  groupMessages: true,
  impactRecords: true,
  characterInteractions: true,
  characterStatus: true,
  dailyBrief: true,
  worldInteractionHighSimulation: true,
  proactiveReason: true,
  characterRelationships: true,
}));
