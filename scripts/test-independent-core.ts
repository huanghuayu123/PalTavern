export {};
declare const require: (id: string) => any;

const fs = require('node:fs');
const path = require('node:path');

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

Object.defineProperty(globalThis, 'window', {
  value: {
    setInterval,
    clearInterval,
  },
});

Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node-test' },
});

const stateModule = require('../src/independent-chat/core/state');
const scheduler = require('../src/independent-chat/automation/scheduler');
const model = require('../src/independent-chat/model/client');
const cards = require('../src/independent-chat/characters/cards');
const authoring = require('../src/independent-chat/characters/authoring');
const characterRelationships = require('../src/independent-chat/characters/relationships');
const autoStrategy = require('../src/independent-chat/chat/auto-message-strategy');
const characterSettings = require('../src/independent-chat/characters/settings');
const chatFormat = require('../src/independent-chat/chat/format');
const chat = require('../src/independent-chat/chat/private-chat');
const rpRendering = require('../src/independent-chat/ui/rp-rendering');

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`function ${name}`);
  if (start < 0) {
    throw new Error(`Missing ${name} in UI source.`);
  }
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(open + 1, index);
    }
  }
  throw new Error(`Could not read ${name} body.`);
}

function sourceSlice(source: string, startMarker: string, endMarker: string): string {
  return source.split(startMarker)[1]?.split(endMarker)[0] ?? '';
}

const freshDefault = stateModule.defaultState();
if (
  freshDefault.worlds[0].name !== '现实世界'
  || !freshDefault.worlds[0].description.includes('手机生活场景')
) {
  throw new Error('Default world should be grounded as the real world.');
}
if (freshDefault.chatFontScale !== 1) {
  throw new Error('Default state should include the standard chat font scale.');
}
if (freshDefault.communicationIdentityByWorldId[freshDefault.worlds[0].id] !== 'user') {
  throw new Error('Default state should store the communication identity per world.');
}
const defaultYeyun = freshDefault.characters.find((character: any) => character.name === '叶昀');
if (!defaultYeyun) {
  throw new Error('Default state should include the built-in Ye Yun character card.');
}
if (
  defaultYeyun.worldId !== freshDefault.worlds[0].id
  || !defaultYeyun.profileNote?.includes('匿名树洞')
  || !defaultYeyun.profileNote?.includes('情绪出口')
  || defaultYeyun.importInfo.worldBookEntryCount < 3
  || defaultYeyun.rawCard?.data?.name !== '叶昀'
) {
  throw new Error('Built-in Ye Yun card was not initialized with its profile note and original card data.');
}

const migrated = stateModule.normalizeState({
  worlds: [
    { id: 'legacy_world', name: 'Legacy', description: '', createdAt: 1, updatedAt: 1 },
    { id: 'second_world', name: 'Second', description: '', createdAt: 1, updatedAt: 1 },
  ],
  characters: [{
    id: 'legacy_character',
    worldId: 'legacy_world',
    name: 'Legacy Character',
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'legacy',
      specVersion: '',
      worldBookEntryCount: 0,
      importedFileName: '',
    },
    autoMessage: stateModule.createDefaultAutoMessageSchedule(),
    importedAt: 1,
  }, {
    id: 'second_character',
    worldId: 'second_world',
    name: 'Second Character',
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'legacy',
      specVersion: '',
      worldBookEntryCount: 0,
      importedFileName: '',
    },
    autoMessage: stateModule.createDefaultAutoMessageSchedule(),
    importedAt: 1,
  }],
  activeWorldId: 'legacy_world',
  activeCharacterId: 'legacy_character',
  communicationIdentityByWorldId: {
    legacy_world: 'legacy_character',
    second_world: 'second_character',
    ghost_world: 'legacy_character',
  },
  chatFontScale: 2.5,
  conversations: [{
    id: 'legacy_conversation',
    worldId: 'legacy_world',
    characterId: 'legacy_character',
    createdAt: 10,
    updatedAt: 20,
    backgroundImage: 'not-an-image',
  }],
  groupChats: [{
    id: 'legacy_group',
    worldId: 'legacy_world',
    title: 'Legacy Group',
    participantCharacterIds: ['legacy_character'],
    selectedSpeakerId: 'legacy_character',
    replyAllOnUserMessage: false,
    allowModelInitiatedMessages: false,
    backgroundImage: 'data:image/png;base64,GROUP_BG',
    createdAt: 10,
    updatedAt: 20,
  }],
  messages: [{
    id: 'legacy_first_message',
    conversationId: 'legacy_conversation',
    characterId: 'legacy_character',
    role: 'assistant',
    content: 'This imported opening must be removed.',
    createdAt: 20,
    source: 'imported_first_message',
  }],
  moments: [{
    id: 'legacy_moment',
    worldId: 'legacy_world',
    characterId: '',
    content: 'Legacy public moment',
    createdAt: 30,
    source: 'manual',
    comments: [],
  }],
});
if (!migrated.characters[0].autoMessage.pacingStrategy.includes('主动消息')) {
  throw new Error('Legacy character did not receive a natural-language proactive pacing strategy.');
}

if (
  migrated.chatFontScale !== 1.25
  || migrated.conversations[0].backgroundImage
  || migrated.groupChats[0].backgroundImage !== 'data:image/png;base64,GROUP_BG'
) {
  throw new Error('Chat appearance defaults, clamping, or background migration failed.');
}

if (
  migrated.communicationIdentityByWorldId.legacy_world !== 'legacy_character'
  || migrated.communicationIdentityByWorldId.second_world !== 'second_character'
  || 'ghost_world' in migrated.communicationIdentityByWorldId
) {
  throw new Error('Communication identity should be normalized per world and ignore missing worlds.');
}

if (
  migrated.characters[0].relationship.stage !== 'stranger'
  || !migrated.characters[0].currentPlan?.text
) {
  throw new Error('Legacy state did not receive the default relationship or current plan.');
}
if (migrated.modelConfig.dailyRequestLimit !== 100) {
  throw new Error('Legacy state did not receive the default model budget.');
}
if (migrated.modelConfig.provider !== 'deepseek' || migrated.modelConfig.apiUrl !== stateModule.DEEPSEEK_API_URL) {
  throw new Error('Legacy state did not receive the default DeepSeek provider.');
}
if (migrated.conversations[0].lastReadAt !== migrated.conversations[0].updatedAt) {
  throw new Error('Legacy conversation did not migrate lastReadAt from updatedAt.');
}
if (migrated.messages.length !== 0) {
  throw new Error('Legacy imported first messages were not removed during migration.');
}
if (migrated.chatReplyMode !== 'auto') {
  throw new Error('Legacy state did not default to automatic chat replies.');
}
if (migrated.enterToSend !== false) {
  throw new Error('Legacy state should default to keeping Enter as newline.');
}
if (migrated.worldInteractionHighSimulation !== false) {
  throw new Error('Legacy state should default to lightweight world interaction.');
}
if (migrated.companionTimeMode !== 'system' || typeof migrated.virtualTimeMinutes !== 'number') {
  throw new Error('Legacy state did not default to system companion time.');
}
// 大注释：世界工作台成为新主入口后，旧的事件/时间线主视图要迁移到 world，避免旧会话打开到被收起的入口。
const worldViewState = stateModule.normalizeState({
  worlds: [{ id: 'world_view', name: 'World View', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'world_view',
  activeView: 'world',
});
const legacyEventsViewState = stateModule.normalizeState({
  worlds: [{ id: 'events_view', name: 'Events View', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'events_view',
  activeView: 'events',
});
const legacyTimelineViewState = stateModule.normalizeState({
  worlds: [{ id: 'timeline_view', name: 'Timeline View', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'timeline_view',
  activeView: 'timeline',
});
if (
  worldViewState.activeView !== 'world'
  || legacyEventsViewState.activeView !== 'world'
  || legacyTimelineViewState.activeView !== 'world'
) {
  throw new Error('World workbench should be the persisted entry for world, event, and timeline views.');
}
if (!Array.isArray(migrated.timelineEntries) || migrated.timelineEntries.length !== 0) {
  throw new Error('Legacy state did not receive an empty world timeline.');
}
if (!Array.isArray(migrated.characterInteractions) || migrated.characterInteractions.length !== 0) {
  throw new Error('Legacy state did not receive an empty character interaction log.');
}
if (
  !Array.isArray(migrated.characterRelationships)
  || !Array.isArray(migrated.characterRelationshipSuggestions)
) {
  throw new Error('Legacy state did not receive empty character relationship stores.');
}
if (migrated.moments[0].visibility.mode !== 'public') {
  throw new Error('Legacy moments did not default to public visibility.');
}

const rpSegments = rpRendering.parseRpRenderSegments([
  '雨点贴着便利店的玻璃往下滑。',
  '@bubble:夏梨|犹豫|[现在吃的话，会不会太没耐心？]',
  '@bubble:夏梨|害羞|[*他好像真的注意到我想吃这个。*]',
  '她把冰淇淋推到桌子中间。',
].join('\n'), { fallbackSpeaker: '夏梨', fallbackEmotion: '日常' });
if (
  rpSegments.length !== 4
  || rpSegments[0].kind !== 'narration'
  || rpSegments[1].kind !== 'dialogue'
  || rpSegments[1].speaker !== '夏梨'
  || rpSegments[1].emotion !== '犹豫'
  || rpSegments[1].text !== '现在吃的话，会不会太没耐心？'
  || rpSegments[2].kind !== 'thought'
  || !rpSegments[2].text.includes('注意到')
  || rpSegments[3].kind !== 'narration'
) {
  throw new Error('RP rendering parser should split narration, dialogue, and inner thoughts.');
}

const appSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/app.ts'), 'utf8');
const stylesSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/styles.css'), 'utf8');
const stateSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/core/state.ts'), 'utf8');
const androidMainActivitySource = fs.readFileSync(path.join(
  process.cwd(),
  'android/app/src/main/java/com/tavernsocial/app/MainActivity.java',
), 'utf8');
const worldDialogueBody = functionBody(appSource, 'renderWorldDialogueStream');
const worldComposerBindingBody = functionBody(appSource, 'bindUi');
const chatPaneRenderBlock = functionBody(appSource, 'renderChatPane');
const mobileRenderBlock = functionBody(appSource, 'renderMobile');
const privateTargetSelectorBlock = functionBody(appSource, 'renderPrivateChatTargetSelector');
const renderGroupSpeakerPickerBlock = functionBody(appSource, 'renderGroupSpeakerPicker');
const renderMomentsBlock = functionBody(appSource, 'renderMoments');
if (worldDialogueBody.includes('messagesFor(')) {
  throw new Error('World RP stream must not render private-chat messages.');
}
if (worldComposerBindingBody.includes('void sendMessage(content, render);')) {
  throw new Error('World RP composer must not submit through the private-chat sender.');
}
if (
  !appSource.includes('data-world-rp-render-mode="narration"')
  || !appSource.includes('data-world-rp-render-mode="bubble"')
) {
  throw new Error('World RP render-mode buttons should be wired as real world-stage controls.');
}
if (
  !appSource.includes('data-end-world-rp-event')
  || !appSource.includes('finishWorldEventManually')
  || !appSource.includes('buildWorldEventAutoCloseSummary')
) {
  throw new Error('World RP detail should expose an end-event button that archives through the event timeline flow.');
}
if (
  !appSource.includes('renderPrivateChatTargetSelector')
  || !appSource.includes('id="private-chat-target-select"')
  || !appSource.includes('openPrivateChatByCharacterId')
  || !appSource.includes("document.querySelector<HTMLSelectElement>('#private-chat-target-select')")
  || !stateSource.includes('communicationIdentityByWorldId')
  || !stateSource.includes('function normalizeCommunicationIdentityByWorldId')
  || !stateSource.includes('export function communicationActorId')
  || !stateSource.includes('export function communicationActor')
  || !stateSource.includes('export function setCommunicationActor')
  || !appSource.includes('setCommunicationActor(activeWorld().id, selectedId)')
  || !appSource.includes('closeMessageDetailAfterCommunicationIdentityChange')
  || !privateTargetSelectorBlock.includes('communicationActorId(')
  || privateTargetSelectorBlock.includes('privateChatSpeakerId')
  || appSource.includes('let privateChatSpeakerId')
  || appSource.includes('renderPrivateChatSpeakerPicker')
  || appSource.includes('id="private-chat-speaker-select"')
  || chatPaneRenderBlock.includes('renderPrivateChatTargetSelector')
  || chatPaneRenderBlock.includes('private-chat-target-select')
  || privateTargetSelectorBlock.includes('currentWorldCharacters()')
  || !privateTargetSelectorBlock.includes('state.characters.filter')
  || !privateTargetSelectorBlock.includes('private-chat-identity-select')
  || !stylesSource.includes('.private-chat-identity-select')
  || stylesSource.includes('.private-chat-target-switch')
  || stylesSource.includes('.private-speaker-switch')
) {
  throw new Error('Private chat identity switching should use one per-world communication identity selector outside the chat window.');
}
if (
  appSource.includes('id="group-speaker-select"')
  || appSource.includes("document.querySelector<HTMLSelectElement>('#group-speaker-select')")
  || renderGroupSpeakerPickerBlock.includes('<select')
  || !appSource.includes('groupSpeakerFromCommunicationIdentity')
) {
  throw new Error('Group chat should follow the shared communication identity instead of exposing a second speaker selector.');
}
if (
  renderMomentsBlock.includes('data-comment-author-select')
  || appSource.includes('momentCommentAuthorDrafts')
  || !appSource.includes('momentCommentCharacterFromCommunicationIdentity')
  || !appSource.includes('addMomentComment(')
) {
  throw new Error('Moment inline comments should follow the shared communication identity and remove their per-comment author selector.');
}
if (
  mobileRenderBlock.includes('<section class="mobile-inbox-panel">\n          <div class="mobile-section-label">')
  && mobileRenderBlock.includes('${renderPrivateChatTargetSelector()}\n          <div class="mobile-conversation-list">${renderInboxConversations()}</div>')
) {
  throw new Error('Mobile inbox should fold private identity switching into the top-left selector instead of a separate section control.');
}
if (
  !appSource.includes('function renderMobileCharacterStoryStrip')
  || !appSource.includes('${renderMobileCharacterStoryStrip()}')
  || appSource.includes('mobile-inbox-summary')
  || stylesSource.includes('.mobile-inbox-summary')
  || stylesSource.includes('.inbox-orbit')
) {
  throw new Error('Mobile inbox should match the lightweight prototype: top identity selector, character story strip, and private messages without the old daily-brief panel.');
}
if (
  !appSource.includes('activeWorldPromptPresetId')
  || !appSource.includes('worldPromptPresetEnabled')
  || !appSource.includes('id="active-world-prompt-preset"')
  || !appSource.includes('id="world-prompt-preset-enabled"')
  || !appSource.includes('restore-tavern-social-world-prompt-preset')
) {
  throw new Error('Settings prompt presets should expose a separate world RP preset slot.');
}
const weatherState = stateModule.normalizeState({
  worlds: [{
    id: 'weather_world',
    name: 'Weather World',
    description: '',
    userPersona: '',
    location: {
      name: '北京',
      country: '中国',
      admin1: '北京市',
      latitude: 39.9042,
      longitude: 116.4074,
      timezone: 'Asia/Shanghai',
    },
    weather: {
      temperatureC: 26.4,
      apparentTemperatureC: 27.1,
      relativeHumidity: 58,
      windSpeedKmh: 8.6,
      weatherCode: 0,
      weatherText: '晴',
      observedAt: '2026-06-08T15:00',
      fetchedAt: 100,
      source: 'open-meteo',
    },
    createdAt: 1,
    updatedAt: 1,
  }],
  activeWorldId: 'weather_world',
});
if (
  weatherState.worlds[0].location?.name !== '北京'
  || weatherState.worlds[0].weather?.temperatureC !== 26.4
) {
  throw new Error('World weather location or snapshot did not survive normalization.');
}

const manualReplyModeState = stateModule.normalizeState({
  worlds: [{ id: 'reply_world', name: 'Reply Mode', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'reply_world',
  chatReplyMode: 'manual',
  enterToSend: true,
  worldInteractionHighSimulation: true,
});
if (
  manualReplyModeState.chatReplyMode !== 'manual'
  || manualReplyModeState.enterToSend !== true
  || manualReplyModeState.worldInteractionHighSimulation !== true
) {
  throw new Error('Manual chat reply mode, Enter-to-send, or world interaction setting was not preserved.');
}

const virtualTimeState = stateModule.normalizeState({
  worlds: [{ id: 'time_world', name: 'Time Mode', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'time_world',
  companionTimeMode: 'virtual',
  virtualTimeMinutes: 23 * 60 + 45,
});
if (virtualTimeState.companionTimeMode !== 'virtual' || virtualTimeState.virtualTimeMinutes !== 23 * 60 + 45) {
  throw new Error('Virtual companion time mode was not preserved.');
}

const timelineViewState = stateModule.normalizeState({
  worlds: [{ id: 'timeline_world', name: 'Timeline', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'timeline_world',
  activeView: 'timeline',
  timelineEntries: [{
    id: 'timeline_legacy',
    worldId: 'timeline_world',
    createdAt: 12,
    type: 'manual_note',
    characterIds: ['deleted_character'],
    characterNames: { deleted_character: 'Deleted Character' },
    title: 'Legacy memory',
    summary: 'This old backup memory should survive.',
    source: { type: 'manual', id: 'legacy_manual' },
    canUndo: false,
    includeInContext: true,
  }],
});
if (
  timelineViewState.activeView !== 'world'
  || timelineViewState.timelineEntries.length !== 1
  || timelineViewState.timelineEntries[0].characterNames.deleted_character !== 'Deleted Character'
) {
  throw new Error('Timeline view or legacy timeline entries were not normalized.');
}

const groupViewState = stateModule.normalizeState({
  worlds: [{ id: 'group_world', name: 'Group World', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'group_world',
  activeView: 'groups',
  activeGroupChatId: 'group_legacy',
  groupChats: [{
    id: 'group_legacy',
    worldId: 'group_world',
    title: 'Legacy Group',
    participantCharacterIds: ['legacy_character_a', 'legacy_character_b', 'legacy_character_a'],
    selectedSpeakerId: 'legacy_character_b',
    createdAt: 11,
    updatedAt: 12,
  }],
  groupMessages: [{
    id: 'group_message_legacy',
    groupChatId: 'group_legacy',
    worldId: 'group_world',
    speakerType: 'character',
    speakerCharacterId: 'legacy_character_b',
    content: 'Legacy group message',
    source: 'auto_model',
    createdAt: 13,
  }],
  timelineEntries: [{
    id: 'timeline_group_legacy',
    worldId: 'group_world',
    createdAt: 14,
    type: 'group_chat',
    characterIds: ['legacy_character_a', 'legacy_character_b'],
    characterNames: { legacy_character_a: 'A', legacy_character_b: 'B' },
    title: 'Legacy group memory',
    summary: 'Group memory should survive.',
    source: { type: 'group_message', id: 'group_message_legacy' },
    canUndo: false,
    includeInContext: true,
  }],
});
if (
  groupViewState.activeView !== 'groups'
  || groupViewState.activeGroupChatId !== 'group_legacy'
  || groupViewState.groupChats[0].participantCharacterIds.length !== 2
  || groupViewState.groupChats[0].allowModelInitiatedMessages !== false
  || groupViewState.groupMessages[0].source !== 'auto_model'
  || groupViewState.timelineEntries[0].type !== 'group_chat'
  || groupViewState.timelineEntries[0].source.type !== 'group_message'
) {
  throw new Error('Group chats, group messages, or group timeline entries were not normalized.');
}

const userPersonaState = stateModule.normalizeState({
  worlds: [{ id: 'persona_world', name: 'Persona', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'persona_world',
  userName: '小鱼',
  userPersona: '住在学校附近的高二学生，说话偏直白。',
});
if (userPersonaState.userName !== '小鱼' || userPersonaState.userPersona !== '住在学校附近的高二学生，说话偏直白。') {
  throw new Error('User name or user persona was not preserved.');
}
if (userPersonaState.worlds[0].userPersona !== '住在学校附近的高二学生，说话偏直白。') {
  throw new Error('Legacy user persona was not migrated into the active world.');
}

const customProviderState = stateModule.normalizeState({
  worlds: [{ id: 'custom_provider_world', name: 'Custom Provider', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'custom_provider_world',
  modelConfig: { apiUrl: 'https://example.invalid/v1', model: 'x' },
});
if (customProviderState.modelConfig.provider !== 'custom') {
  throw new Error('Custom model API URL did not migrate to the custom provider.');
}

const highAffinityState = stateModule.normalizeState({
  worlds: [{ id: 'affinity_world', name: 'Affinity', description: '', createdAt: 1, updatedAt: 1 }],
  characters: [{
    id: 'affinity_character',
    worldId: 'affinity_world',
    name: 'Affinity Character',
    profileNote: 'Keep this note visible.',
    replyStrategy: 'Keep this reply strategy visible.',
    tags: [],
    relationship: {
      stage: 'close',
      affinity: 150,
      summary: '',
      updatedAt: 1,
    },
    importInfo: {
      sourceFormat: 'json',
      spec: 'legacy',
      specVersion: '',
      worldBookEntryCount: 0,
      importedFileName: '',
    },
    autoMessage: stateModule.createDefaultAutoMessageSchedule(),
    importedAt: 1,
  }],
  activeWorldId: 'affinity_world',
  activeCharacterId: 'affinity_character',
});
if (
  highAffinityState.characters[0].relationship.affinity !== 150
  || highAffinityState.characters[0].profileNote !== 'Keep this note visible.'
  || highAffinityState.characters[0].replyStrategy !== 'Keep this reply strategy visible.'
) {
  throw new Error('Character note, reply strategy, or unbounded affinity was not preserved.');
}

stateModule.replaceState(migrated);
stateModule.state.worlds[0].userPersona = '住在学校附近的高二学生，说话偏直白。';
const importedV3 = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'V3 Character',
    nickname: 'V3 Nickname',
    description: 'V3 description',
    personality: 'V3 personality',
    first_mes: 'V3 first greeting',
    alternate_greetings: ['V3 alternate greeting'],
    group_only_greetings: ['V3 group greeting'],
    creator: 'V3 creator',
    creator_notes: 'V3 creator notes',
    character_version: '3.1',
    system_prompt: 'V3 system instruction',
    post_history_instructions: 'V3 post-history instruction',
    source: ['https://example.invalid/v3-card'],
    assets: [{ type: 'icon', uri: 'ccdefault:', name: 'main', ext: 'png' }],
    character_book: { entries: [{ keys: ['v3'], content: 'V3 lore' }] },
  },
}));
if (
  importedV3.importInfo.spec !== 'chara_card_v3'
  || importedV3.importInfo.specVersion !== '3.0'
  || importedV3.nickname !== 'V3 Nickname'
  || importedV3.alternateGreetings?.[0] !== 'V3 alternate greeting'
  || importedV3.groupOnlyGreetings?.[0] !== 'V3 group greeting'
  || importedV3.creator !== 'V3 creator'
  || importedV3.systemPrompt !== 'V3 system instruction'
  || importedV3.postHistoryInstructions !== 'V3 post-history instruction'
  || importedV3.cardSources?.length !== 1
  || importedV3.cardAssets?.length !== 1
  || importedV3.importInfo.worldBookEntryCount !== 2
) {
  throw new Error('Character Card V3 fields were not imported.');
}
if (
  importedV3.description
  || importedV3.personality
  || !characterSettings.characterSettingsText(importedV3).includes('V3 description')
  || !characterSettings.characterSettingsText(importedV3).includes('V3 personality')
) {
  throw new Error('Imported character settings were not moved into the character world book.');
}
const v3Prompt = model.buildModelMessages(importedV3)[0].content;
if (
  !v3Prompt.includes('V3 Nickname')
  || !v3Prompt.includes('V3 system instruction')
  || !v3Prompt.includes('V3 post-history instruction')
  || !v3Prompt.includes('V3 description')
) {
  throw new Error('Character Card V3 prompt fields were not applied.');
}
cards.updateCharacterCardDetails(importedV3, {
  name: 'Renamed V3',
  settings: 'Edited settings stored in world book.',
});
if (
  importedV3.name !== 'Renamed V3'
  || importedV3.description
  || !characterSettings.characterSettingsText(importedV3).includes('Edited settings stored in world book.')
  || !JSON.stringify(importedV3.rawCard).includes('"name":"Renamed V3"')
  || !JSON.stringify(importedV3.rawCard).includes('"char_name":"Renamed V3"')
) {
  throw new Error('Editing card name or settings did not update the bound world book.');
}
const multiCharacterCard = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v2',
  data: {
    name: '海边小队',
    description: '角色列表：林夏、周遥。林夏负责观察天气，周遥负责整理地图。',
    character_book: {
      entries: [
        { comment: '林夏', keys: ['林夏'], content: '角色：林夏\n性格谨慎，擅长记录潮汐。' },
        { comment: '周遥', keys: ['周遥'], content: '角色：周遥\n性格开朗，喜欢画旧地图。' },
      ],
    },
  },
}));
const recognized = cards.recognizeCharacterCard(multiCharacterCard);
if (
  recognized.length < 3
  || !recognized.some((candidate: { name: string; isPrimary: boolean }) => candidate.name === '海边小队' && candidate.isPrimary)
  || !recognized.some((candidate: { name: string }) => candidate.name === '林夏')
  || !recognized.some((candidate: { name: string }) => candidate.name === '周遥')
) {
  throw new Error('Multi-character card recognition did not find expected candidates.');
}
const linxiaCandidate = recognized.find((candidate: { name: string }) => candidate.name === '林夏');
const linxiaCharacter = cards.characterFromCardCandidate(multiCharacterCard, linxiaCandidate);
if (
  linxiaCharacter.name !== '林夏'
  || linxiaCharacter.id === multiCharacterCard.id
  || linxiaCharacter.importInfo.spec !== 'chara_card_v3'
  || linxiaCharacter.importInfo.specVersion !== '3.0'
  || linxiaCharacter.rawCard.spec !== 'chara_card_v3'
  || linxiaCharacter.rawCard.spec_version !== '3.0'
  || !JSON.stringify(linxiaCharacter.rawCard).includes('"candidate_name":"林夏"')
) {
  throw new Error('Recognized candidate was not converted into an importable character.');
}
const singleCharacterWithSectionWorldBook = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: '叶昀',
    first_mes: '测试开场白',
    character_book: {
      entries: [
        { comment: '二次解释', keys: [], content: '对叶昀的理解与思考：她的开朗是真的，焦虑也是真的。' },
        { comment: '调色盘', keys: [], content: '性格调色盘：要强与焦虑是底色，开朗与温柔是主色调。' },
        { comment: '角色速览', keys: [], content: '角色速览:\n  - 姓名: 叶昀\n    性别: 女\n    年龄: 16岁' },
      ],
    },
  },
}));
const sectionCandidates = cards.recognizeCharacterCard(singleCharacterWithSectionWorldBook);
if (
  sectionCandidates.length !== 1
  || sectionCandidates[0].name !== '叶昀'
) {
  throw new Error(`Single-character section headings were misread as character candidates: ${sectionCandidates.map((item: { name: string }) => item.name).join(', ')}`);
}
const worldBookEditCharacter = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v3',
  spec_version: '3.0',
  data: {
    name: 'World Book Editor Test',
    character_book: {
      entries: [
        { uid: 101, comment: 'Original lore', keys: ['archive'], content: 'Old archive rule.', enabled: true },
      ],
    },
  },
}));
const originalWorldBookDrafts = characterSettings.characterWorldBookEntryDrafts(worldBookEditCharacter);
if (originalWorldBookDrafts.length !== 1 || originalWorldBookDrafts[0].keys !== 'archive') {
  throw new Error('Existing character world book entries were not exposed for editing.');
}
const addedWorldBookDraft = characterSettings.appendCharacterWorldBookEntry(worldBookEditCharacter);
characterSettings.setCharacterWorldBookEntryDrafts(worldBookEditCharacter, [
  {
    ...originalWorldBookDrafts[0],
    comment: 'Edited archive lore',
    keys: 'archive, rain',
    content: 'Archive rule after editing.',
    enabled: false,
    constant: true,
    selective: true,
    insertionOrder: 12,
    position: 4,
  },
  {
    ...addedWorldBookDraft,
    comment: 'Bell lore',
    keys: 'bell',
    content: 'Bell rule.',
    enabled: true,
    constant: false,
    selective: false,
    insertionOrder: 13,
    position: 0,
  },
]);
let editedWorldBookDrafts = characterSettings.characterWorldBookEntryDrafts(worldBookEditCharacter);
if (
  editedWorldBookDrafts.length !== 2
  || editedWorldBookDrafts[0].keys !== 'archive、rain'
  || editedWorldBookDrafts[0].enabled !== false
  || editedWorldBookDrafts[0].constant !== true
  || editedWorldBookDrafts[1].comment !== 'Bell lore'
) {
  throw new Error('Character world book entry edits were not persisted.');
}
characterSettings.setCharacterSettingsWorldBook(worldBookEditCharacter, 'Main settings entry.');
characterSettings.setCharacterWorldBookEntryDrafts(worldBookEditCharacter, editedWorldBookDrafts);
if (worldBookEditCharacter.importInfo.worldBookEntryCount !== 3) {
  throw new Error('Character settings entry and editable world book entries did not coexist.');
}
characterSettings.deleteCharacterWorldBookEntry(worldBookEditCharacter, editedWorldBookDrafts[1].id);
editedWorldBookDrafts = characterSettings.characterWorldBookEntryDrafts(worldBookEditCharacter);
if (editedWorldBookDrafts.length !== 1 || worldBookEditCharacter.importInfo.worldBookEntryCount !== 2) {
  throw new Error('Character world book entry deletion did not update the entry count.');
}

const imported = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v2',
  data: {
    name: 'Generated Opening Test',
    description: 'A quiet archivist.',
    personality: 'Reserved and observant.',
    first_mes: 'FORBIDDEN_IMPORTED_OPENING',
  },
}));
if (
  imported.autoMessage.pacingStrategy.length < 80
  || autoStrategy.pacingStyleFor(imported) !== 'reserved'
) {
  throw new Error('Imported character did not receive a persona-based proactive pacing strategy.');
}
cards.upsertCharacter(imported);
if (stateModule.messagesFor(imported.id).length !== 0) {
  throw new Error('Character import inserted the card first_mes into the conversation.');
}
imported.avatar = 'data:image/webp;base64,CUSTOM_AVATAR';
imported.customAvatar = true;
stateModule.saveState();
const reimported = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v2',
  data: {
    name: 'Generated Opening Test',
    description: 'Updated card.',
    avatar: 'https://example.invalid/card-avatar.png',
  },
}));
cards.upsertCharacter(reimported);
const preservedCharacter = stateModule.state.characters.find((item: { name: string }) =>
  item.name === 'Generated Opening Test',
);
if (preservedCharacter?.avatar !== 'data:image/webp;base64,CUSTOM_AVATAR' || preservedCharacter.customAvatar !== true) {
  throw new Error('Reimporting a character card overwrote the custom avatar.');
}

const character = stateModule.state.characters[0];
const relationshipPeer = {
  id: 'character_relationship_peer',
  worldId: character.worldId,
  name: 'Relationship Peer',
  replyStrategy: 'RELATIONSHIP_PEER_REPLY_STRATEGY_ONLY',
  tags: [],
  importInfo: {
    sourceFormat: 'json',
    spec: 'test',
    specVersion: '',
    worldBookEntryCount: 0,
    importedFileName: '',
  },
  relationship: stateModule.createDefaultRelationship(),
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
  importedAt: Date.now(),
};
stateModule.state.characters.push(relationshipPeer);
character.replyStrategy = 'CHARACTER_A_REPLY_STRATEGY_ONLY';
const pair = characterRelationships.ensureCharacterRelationship(character, relationshipPeer);
characterRelationships.updateCharacterRelationshipSide(pair, character.id, {
  stage: 'close',
  summary: 'A trusts B with quiet plans.',
});
characterRelationships.updateCharacterRelationshipSide(pair, relationshipPeer.id, {
  stage: 'strained',
  summary: 'B is cautious around A after the last argument.',
});
const samePair = characterRelationships.ensureCharacterRelationship(relationshipPeer, character);
if (
  samePair.id !== pair.id
  || stateModule.state.characterRelationships.filter((item: any) => item.id === pair.id).length !== 1
  || 'affinity' in pair.aToB
  || 'affinity' in pair.bToA
  || characterRelationships.relationshipSideFor(pair, character.id).summary !== 'A trusts B with quiet plans.'
  || characterRelationships.relationshipSideFor(pair, relationshipPeer.id).summary !== 'B is cautious around A after the last argument.'
) {
  throw new Error('Character-to-character relationship pairs should be unique and keep two independent non-affinity sides.');
}
character.personality = '克制、理性、疏离';
stateModule.state.activeCharacterId = character.id;
chat.sendUserMessageOnly('Relationship Peer borrows this private chat slot.', () => {}, undefined, {
  speakerType: 'character',
  speakerCharacterId: relationshipPeer.id,
});
const authoredPrivateMessage = stateModule.messagesFor(character.id, relationshipPeer.id).at(-1);
if (
  !authoredPrivateMessage
  || authoredPrivateMessage.characterId !== character.id
  || authoredPrivateMessage.speakerType !== 'character'
  || authoredPrivateMessage.speakerCharacterId !== relationshipPeer.id
) {
  throw new Error('Private chat character-speaker messages should stay in that identity-to-target conversation and keep speaker metadata.');
}
if (stateModule.messagesFor(character.id, 'user').some((message: any) => message.id === authoredPrivateMessage.id)) {
  throw new Error('Character-authored private chat messages must not leak into the user-to-target conversation.');
}
const authoredPromptMessages = model.buildModelMessages(
  character,
  '',
  false,
  true,
  stateModule.messagesFor(character.id, relationshipPeer.id),
);
if (
  !authoredPromptMessages.some((message: { content: string }) =>
    message.content.includes('Relationship Peer')
    && message.content.includes('Relationship Peer borrows this private chat slot.'))
) {
  throw new Error('Private chat model context should label character-authored user turns with the selected speaker.');
}
const beforeCharacterSpeakerUserAffinity = character.relationship.affinity;
const beforeCharacterSpeakerSideSummary = characterRelationships.relationshipSideFor(pair, relationshipPeer.id).summary;
for (let index = 0; index < 4; index += 1) {
  chat.sendUserMessageOnly(`Character speaker continuity ${index}`, () => {}, undefined, {
    speakerType: 'character',
    speakerCharacterId: relationshipPeer.id,
  });
}
if (
  character.relationship.affinity !== beforeCharacterSpeakerUserAffinity
  || characterRelationships.relationshipSideFor(pair, relationshipPeer.id).summary === beforeCharacterSpeakerSideSummary
) {
  throw new Error('Character-authored private chat activity should update character-to-character relationship context instead of user affinity.');
}
character.firstMessage = 'FORBIDDEN_PROMPT_OPENING';
character.stickers = [{
  id: 'sticker_smile',
  name: '偷笑',
  note: 'sly smile expression',
  dataUrl: 'data:image/webp;base64,TEST',
  importedAt: Date.now(),
}];
stateModule.state.commonStickers = [{
  id: 'sticker_common',
  name: '点头',
  note: 'quiet nod expression',
  dataUrl: 'data:image/webp;base64,COMMON',
  importedAt: Date.now(),
}];
stateModule.state.userStickers = [{
  id: 'sticker_user',
  name: '我的猫猫',
  dataUrl: 'data:image/webp;base64,USER',
  importedAt: Date.now(),
}];
character.relationship = {
  stage: 'close',
  affinity: 66,
  summary: '已经彼此信任，但表达仍然含蓄。',
  updatedAt: Date.now(),
};
character.profileNote = '她幼年时离开故乡，和 user 曾在雨夜一起守过一间旧书店。';
const characterWorld = stateModule.state.worlds.find((world: { id: string }) => world.id === character.worldId);
if (characterWorld) {
  characterWorld.location = {
    name: '北京',
    country: '中国',
    admin1: '北京市',
    latitude: 39.9042,
    longitude: 116.4074,
    timezone: 'Asia/Shanghai',
  };
  characterWorld.weather = {
    temperatureC: 26.4,
    apparentTemperatureC: 27.1,
    relativeHumidity: 58,
    windSpeedKmh: 8.6,
    weatherCode: 0,
    weatherText: '晴',
    observedAt: '2026-06-08T15:00',
    fetchedAt: Date.now(),
    source: 'open-meteo',
  };
}
stateModule.state.companionTimeMode = 'virtual';
stateModule.state.virtualTimeMinutes = 23 * 60 + 45;
stateModule.state.timelineEntries.push({
  id: 'timeline_prompt_memory',
  worldId: character.worldId,
  createdAt: Date.now(),
  type: 'manual_note',
  characterIds: [character.id],
  characterNames: { [character.id]: character.name },
  title: '世界时间线测试',
  summary: 'TIMELINE_CONTEXT_SHOULD_APPEAR',
  source: { type: 'manual', id: 'timeline_prompt_memory' },
  canUndo: false,
  includeInContext: true,
});
stateModule.state.timelineEntries.push({
  id: 'timeline_revoked_memory',
  worldId: character.worldId,
  createdAt: Date.now() + 1,
  type: 'manual_note',
  characterIds: [character.id],
  characterNames: { [character.id]: character.name },
  title: '已撤销时间线测试',
  summary: 'TIMELINE_REVOKED_SHOULD_NOT_APPEAR',
  source: { type: 'manual', id: 'timeline_revoked_memory' },
  canUndo: false,
  includeInContext: false,
  revokedAt: Date.now() + 2,
});
stateModule.state.dailyBriefs.push({
  id: 'brief_prompt_memory',
  worldId: character.worldId,
  dateKey: '2026-06-08',
  title: '今日简报',
  summary: 'DAILY_BRIEF_CONTEXT_SHOULD_APPEAR',
  sections: ['今天的简报应作为参考摘要进入私聊上下文。'],
  suggestedCharacterIds: [character.id],
  unreadCount: 1,
  changeCount: 1,
  createdAt: Date.now() + 3,
  updatedAt: Date.now() + 3,
});

const systemPrompt = model.buildModelMessages(character)[0].content;
if (
  !systemPrompt.includes('关系阶段：close')
  || !systemPrompt.includes('好感度：66')
  || !systemPrompt.includes(character.relationship.summary)
  || !systemPrompt.includes(character.profileNote)
  || !systemPrompt.includes('角色背景故事备注')
  || !systemPrompt.includes('<time mode="virtual">')
  || !systemPrompt.includes('虚拟时间')
  || !systemPrompt.includes('今天日历')
  || !systemPrompt.includes('当前世界城市：北京')
  || !systemPrompt.includes('当前天气：晴')
  || !systemPrompt.includes('气温 26°C')
  || !systemPrompt.includes('用户人设')
  || !systemPrompt.includes(stateModule.state.worlds[0].userPersona)
  || !systemPrompt.includes('CHARACTER_A_REPLY_STRATEGY_ONLY')
  || systemPrompt.includes('RELATIONSHIP_PEER_REPLY_STRATEGY_ONLY')
  || !systemPrompt.includes('TIMELINE_CONTEXT_SHOULD_APPEAR')
  || !systemPrompt.includes('A trusts B with quiet plans.')
  || !systemPrompt.includes('B is cautious around A after the last argument.')
  || !systemPrompt.includes('长期记忆摘要')
  || !systemPrompt.includes('今日简报（大总结，参考总结，不覆盖真实时间线）')
  || !systemPrompt.includes('DAILY_BRIEF_CONTEXT_SHOULD_APPEAR')
) {
  throw new Error('Relationship, user persona, or timeline context was not included in the model prompt.');
}
const peerSystemPrompt = model.buildModelMessages(relationshipPeer)[0].content;
if (
  !peerSystemPrompt.includes('RELATIONSHIP_PEER_REPLY_STRATEGY_ONLY')
  || peerSystemPrompt.includes('CHARACTER_A_REPLY_STRATEGY_ONLY')
) {
  throw new Error('Character reply strategies should be scoped to the selected speaking character.');
}
if (systemPrompt.includes('TIMELINE_REVOKED_SHOULD_NOT_APPEAR')) {
  throw new Error('Revoked timeline entries leaked into the model prompt.');
}
if (systemPrompt.includes('FORBIDDEN_PROMPT_OPENING')) {
  throw new Error('The imported first message leaked into the model prompt.');
}
if (
  !systemPrompt.includes('<msg>')
  || !systemPrompt.includes('<sticker:表情包名称>')
  || !systemPrompt.includes('偷笑')
  || !systemPrompt.includes('点头')
  || !systemPrompt.includes('sly smile expression')
  || !systemPrompt.includes('quiet nod expression')
  || !systemPrompt.includes('默认不输出括号动作描写')
) {
  throw new Error('Online chat style and sticker instructions were not included in the model prompt.');
}
if (systemPrompt.includes('我的猫猫')) {
  throw new Error('User-only stickers leaked into the character model prompt.');
}
stateModule.state.companionTimeMode = 'system';
stateModule.state.virtualTimeMinutes = 0;
const parsedChat = chatFormat.parseModelChatOutput(
  '<msg>你刚刚去哪了</msg><msg>我还以为你不回来了</msg><sticker:偷笑>',
  character,
);
if (parsedChat.length !== 3 || parsedChat[2].stickerId !== 'sticker_smile') {
  throw new Error('Segmented online chat output or sticker marker parsing failed.');
}

const messageConversation = stateModule.ensureConversation(character);
stateModule.state.messages.push({
  id: 'recalled_context_message',
  conversationId: messageConversation.id,
  characterId: character.id,
  role: 'user',
  content: '撤回后仍应被角色记住',
  createdAt: Date.now(),
  source: 'user',
});
if (!chat.recallMessage('recalled_context_message')) {
  throw new Error('Message recall failed.');
}
const recalledPrompt = model.buildModelMessages(character);
if (
  !recalledPrompt.some((message: { content: string }) =>
    message.content.includes('这条消息已被撤回') && message.content.includes('撤回后仍应被角色记住'),
  )
) {
  throw new Error('Recalled message was not preserved in model context.');
}
stateModule.state.messages.push({
  id: 'deleted_context_message',
  conversationId: messageConversation.id,
  characterId: character.id,
  role: 'user',
  content: '删除后模型不应看到',
  createdAt: Date.now() + 1,
  source: 'user',
});
if (!chat.deleteMessage('deleted_context_message')) {
  throw new Error('Message deletion failed.');
}
if (
  stateModule.state.messages.some((message: { id: string }) => message.id === 'deleted_context_message')
  || model.buildModelMessages(character).some((message: { content: string }) =>
    message.content.includes('删除后模型不应看到'),
  )
) {
  throw new Error('Deleted message remained in storage or model context.');
}

character.autoMessage.unansweredCount = 2;
character.autoMessage.pacingStrategy = '节奏倾向：克制疏离型。用户连续 2 次以上未回复时进入沉默，明显拉长间隔，不要打扰。';
const reservedPacing = scheduler.pacingFor(character);
if (reservedPacing.state !== 'silent' || reservedPacing.multiplier <= 2) {
  throw new Error('Reserved pacing strategy did not slow down enough.');
}

character.personality = '黏人、热情、依赖';
character.autoMessage.pacingStrategy = '节奏倾向：黏人主动型。用户没有回复时只轻微放慢，仍会惦记但不要刷屏。';
const clingyPacing = scheduler.pacingFor(character);
if (clingyPacing.multiplier >= reservedPacing.multiplier) {
  throw new Error('Natural-language pacing strategy did not differentiate clingy and reserved characters.');
}

character.autoMessage.enabled = true;
character.autoMessage.quietHours.enabled = false;
character.autoMessage.nextAttemptAt = Date.now() - 60_000;
stateModule.state.modelConfig.apiUrl = 'https://example.invalid/v1';
stateModule.state.modelConfig.model = 'test-model';
stateModule.state.modelConfig.dailyRequestLimit = 1;
stateModule.state.modelUsage = {
  date: new Date().toLocaleDateString('en-CA'),
  requestCount: 1,
};
if (scheduler.autoMessageReadiness(character) !== 'budget_limit') {
  throw new Error('Proactive message readiness ignored the daily model budget.');
}

const before = character.autoMessage.nextAttemptAt;
character.autoMoment.enabled = true;
character.autoMoment.nextAttemptAt = Date.now() - 60_000;
const momentBefore = character.autoMoment.nextAttemptAt;
scheduler.skipMissedAttemptsOnStartup(Date.now());
if (
  character.autoMessage.nextAttemptAt === null
  || character.autoMessage.nextAttemptAt <= Date.now()
  || character.autoMessage.nextAttemptAt === before
  || !character.autoMessage.pacingReason.includes('不补发')
) {
  throw new Error('Missed proactive messages were not skipped and rescheduled.');
}
if (
  character.autoMoment.nextAttemptAt === null
  || character.autoMoment.nextAttemptAt <= Date.now()
  || character.autoMoment.nextAttemptAt === momentBefore
  || !character.autoMoment.statusReason.includes('不补发')
) {
  throw new Error('Missed automatic moments were not skipped and rescheduled.');
}

const deleteTarget = preservedCharacter;
if (!deleteTarget) throw new Error('Missing character for deletion test.');
const deleteConversation = stateModule.ensureConversation(deleteTarget);
stateModule.state.messages.push({
  id: 'delete_message',
  conversationId: deleteConversation.id,
  characterId: deleteTarget.id,
  role: 'user',
  content: 'delete me',
  replyToId: 'quoted_message',
  recalledAt: Date.now(),
  createdAt: Date.now(),
  source: 'user',
});
stateModule.state.moments.push({
  id: 'delete_moment',
  worldId: deleteTarget.worldId,
  characterId: deleteTarget.id,
  content: 'delete moment',
  createdAt: Date.now(),
  source: 'character',
  comments: [],
});
stateModule.state.worldEvents.push({
  id: 'delete_event',
  worldId: deleteTarget.worldId,
  title: 'delete event',
  description: '',
  participantCharacterIds: [deleteTarget.id],
  affinityDelta: 0,
  status: 'active',
  createdAt: Date.now(),
  resolvedAt: null,
  source: 'manual',
});
stateModule.state.characterCardDrafts.push({
  id: 'delete_draft_link',
  worldId: deleteTarget.worldId,
  mode: 'simple',
  currentStep: 'concept',
  name: 'linked draft',
  concept: '',
  appearance: '',
  personality: '',
  hobbies: '',
  palette: '',
  reinterpretation: '',
  firstMessage: '',
  notes: {},
  candidates: {},
  conversations: {},
  linkedCharacterId: deleteTarget.id,
  createdAt: Date.now(),
  updatedAt: Date.now(),
});
const deleteRelationship = characterRelationships.ensureCharacterRelationship(deleteTarget, relationshipPeer);
characterRelationships.updateCharacterRelationshipSide(deleteRelationship, deleteTarget.id, {
  stage: 'familiar',
  summary: 'This relation should be removed with the deleted character.',
});
stateModule.state.characterRelationshipSuggestions.push({
  id: 'delete_relationship_suggestion',
  worldId: deleteTarget.worldId,
  relationshipId: deleteRelationship.id,
  fromCharacterId: deleteTarget.id,
  toCharacterId: relationshipPeer.id,
  suggestedStage: 'close',
  reason: 'This suggestion should be removed with the deleted character.',
  sourceEventId: 'delete_event',
  createdAt: Date.now(),
});
cards.deleteCharacter(deleteTarget.id);
if (
  stateModule.state.characters.some((item: { id: string }) => item.id === deleteTarget.id)
  || stateModule.state.conversations.some((item: { characterId: string }) => item.characterId === deleteTarget.id)
  || stateModule.state.messages.some((item: { characterId: string }) => item.characterId === deleteTarget.id)
  || stateModule.state.moments.some((item: { characterId: string }) => item.characterId === deleteTarget.id)
  || stateModule.state.worldEvents.some((item: { participantCharacterIds: string[] }) =>
    item.participantCharacterIds.includes(deleteTarget.id),
  )
  || stateModule.state.characterCardDrafts.some((item: { linkedCharacterId?: string }) =>
    item.linkedCharacterId === deleteTarget.id,
  )
  || stateModule.state.characterRelationships.some((item: any) =>
    item.characterAId === deleteTarget.id || item.characterBId === deleteTarget.id,
  )
  || stateModule.state.characterRelationshipSuggestions.some((item: any) =>
    item.fromCharacterId === deleteTarget.id || item.toCharacterId === deleteTarget.id,
  )
) {
  throw new Error('Deleting a character left related local data behind.');
}

const normalizedWorldLoreState = stateModule.normalizeState({
  worlds: [{
    id: 'world_lore_test',
    name: 'Lore Test',
    description: 'Base world description.',
    worldLore: 'Shared moonlit rules for every character in this world.',
    userPersona: '',
    currentLocation: 'A quiet street',
    sceneAtmosphere: 'Soft and ordinary',
    sceneSummary: '',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }],
  activeWorldId: 'world_lore_test',
});
if (normalizedWorldLoreState.worlds[0].worldLore !== 'Shared moonlit rules for every character in this world.') {
  throw new Error('World-level lore should survive state normalization.');
}
stateModule.state.worlds = normalizedWorldLoreState.worlds;
stateModule.state.activeWorldId = 'world_lore_test';
const lorePromptCharacter = {
  ...stateModule.defaultState().characters[0],
  id: 'world_lore_prompt_character',
  worldId: 'world_lore_test',
  name: 'Lore Listener',
};
stateModule.state.characters = [lorePromptCharacter];
const lorePromptText = model.buildModelMessages(lorePromptCharacter, false, undefined, []).map((message: any) => message.content).join('\n');
if (!lorePromptText.includes('Shared moonlit rules for every character in this world.')) {
  throw new Error('World-level lore should be included in private chat model context.');
}

const authoredDraft = authoring.createCharacterCardDraft();
authoredDraft.name = 'Field Test';
authoredDraft.concept = 'A character with structured creation metadata.';
authoredDraft.age = '17';
authoredDraft.backgroundStory = 'Grew up near the station and remembers small seasonal rituals.';
authoredDraft.profileNote = 'Prefers short evening walks.';
authoredDraft.appearance = 'Short hair and a navy jacket.';
authoredDraft.personality = 'Quiet but attentive.';
authoredDraft.hobbies = 'Collects train tickets.';
const authoredCharacter = authoring.characterProfileFromDraft(authoredDraft);
if (
  authoredCharacter.age !== authoredDraft.age
  || authoredCharacter.backgroundStory !== authoredDraft.backgroundStory
  || authoredCharacter.profileNote !== authoredDraft.profileNote
) {
  throw new Error('Character authoring should persist age, background story, and notes.');
}

const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/app.ts'), 'utf8');
const authoringUiSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/authoring-ui.ts'), 'utf8');
const transitionsPath = path.join(process.cwd(), 'src/independent-chat/ui/transitions.ts');
const transitionsSource = fs.existsSync(transitionsPath)
  ? fs.readFileSync(transitionsPath, 'utf8')
  : '';
const chatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/private-chat.ts'), 'utf8');
const schedulerSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/automation/scheduler.ts'), 'utf8');
const groupChatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/group-chat.ts'), 'utf8');
const typingDelayPath = path.join(process.cwd(), 'src/independent-chat/chat/typing-delay.ts');
const typingDelaySource = fs.existsSync(typingDelayPath)
  ? fs.readFileSync(typingDelayPath, 'utf8')
  : '';
const indexHtmlSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/styles.css'), 'utf8');
const switchInputBlock = styleSource.split('.switch-control input {')[1]?.split('}')[0] ?? '';
const switchTrackBlock = styleSource.split('.switch-track {')[1]?.split('}')[0] ?? '';
if (
  !switchInputBlock.includes('z-index: 1;')
  || !switchTrackBlock.includes('pointer-events: none;')
) {
  throw new Error('Custom switch decorations must not block taps on the real checkbox.');
}
if (
  !uiSource.includes('id="workbench-world-lore"')
  || !authoringUiSource.includes('id="draft-age"')
  || !authoringUiSource.includes('id="draft-background-story"')
  || !authoringUiSource.includes('id="draft-profile-note"')
) {
  throw new Error('World settings and character creation should expose shared world lore plus age/background/note fields.');
}
const worldHeaderTextBlock = styleSource
  .split('.world-stage-header strong,')[1]
  ?.split('.world-stage-header strong {')[0] ?? '';
const mobileChatStatusBlock = styleSource
  .split('.mobile-chat-detail .chat-status-expanded {')[1]
  ?.split('}')[0] ?? '';
if (
  !worldHeaderTextBlock.includes('display: block;')
  || !mobileChatStatusBlock.includes('max-height:')
  || !mobileChatStatusBlock.includes('overflow-y: auto;')
) {
  throw new Error('Mobile world header and expanded chat status shelf should prevent text overflow and message coverage.');
}
const profileNoteGenerationBlock = uiSource
  .split('async function generateImportProfileNote')[1]
  ?.split('function cleanGeneratedPacingStrategy')[0] ?? '';
const autoMessageSaveBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#save-auto-message')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#regenerate-auto-pacing-strategy')")[0] ?? '';
const autoPacingRegenerateBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#regenerate-auto-pacing-strategy')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#run-auto-check')")[0] ?? '';
const replyStrategySettingsBlock = uiSource
  .split('const replyStrategySettings = `')[1]
  ?.split('const replyModeSettings = `')[0] ?? '';
const replyStrategySaveBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#save-character-reply-strategy')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#save-chat-reply-mode')")[0] ?? '';
const restoreAutoPacingBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#restore-auto-pacing')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#keep-auto-pacing')")[0] ?? '';
const keepAutoPacingBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#keep-auto-pacing')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#request-notification')")[0] ?? '';
const forceRestartServicesBlock = uiSource
  .split('function forceRestartAllServices')[1]
  ?.split('function fieldValue')[0] ?? '';
const forceRestartServicesHandlerBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#force-restart-services')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#export-backup')")[0] ?? '';
const modelConnectionTestBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#test-model-connection')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLSelectElement>('#model-list-select')")[0] ?? '';
const onboardingModelConnectionTestBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#onboarding-test-model-connection')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLSelectElement>('#onboarding-model-select')")[0] ?? '';
const momentDraftGenerationBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#generate-moment')?.addEventListener('click'")[1]
  ?.split("document.querySelectorAll<HTMLFormElement>('[data-comment-form]')")[0] ?? '';
const composerSubmitBlock = uiSource
  .split("document.querySelector<HTMLFormElement>('#composer')?.addEventListener('submit'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#generate-reply')")[0] ?? '';
const groupComposerSubmitBlock = uiSource
  .split("document.querySelector<HTMLFormElement>('#group-composer')?.addEventListener('submit'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#generate-group-inline')")[0] ?? '';
const privateMessageActionOpenBlock = uiSource
  .split("document.querySelectorAll<HTMLElement>('[data-message-id]').forEach")[1]
  ?.split('const cancelLongPress = () => {')[0] ?? '';
const groupMessageActionOpenBlock = uiSource
  .split("document.querySelectorAll<HTMLElement>('[data-group-message-id]').forEach")[1]
  ?.split('const cancelLongPress = () => {')[0] ?? '';
const requestBeforeInputSubmitBlock = uiSource
  .split('function requestTextareaFormSubmitFromBeforeInput')[1]
  ?.split('function focusPendingMessageComposer')[0] ?? '';
const idleRenderBlock = uiSource
  .split('export function renderWhenChatInputIdle')[1]
  ?.split('function bindUi')[0] ?? '';
const timelineIdleRenderBranch = idleRenderBlock
  .split("} else if (input.id === 'timeline-note-input')")[1]
  ?.split('} else if (input.dataset.commentInput)')[0] ?? '';
const eventComposerIdleRenderBranch = idleRenderBlock
  .split("input.closest('.event-composer-dialog')")[1]
  ?.split('} else if (input.dataset.eventManualInput)')[0] ?? '';
const promptPresetSwitchHandlerBlock = uiSource
  .split("document.querySelector<HTMLInputElement>('#chat-prompt-preset-enabled')?.addEventListener('change'")[1]
  ?.split("document.querySelector<HTMLInputElement>('#prompt-preset-name')")[0] ?? '';
const promptRowSwitchHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLInputElement>('[data-preset-prompt]').forEach")[1]
  ?.split("document.querySelectorAll<HTMLInputElement>('[data-preset-prompt-name]')")[0] ?? '';
const regexSwitchHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLInputElement>('[data-preset-regex]').forEach")[1]
  ?.split("document.querySelectorAll<HTMLInputElement>('[data-preset-regex-name]')")[0] ?? '';
const restoreScrollBlock = uiSource
  .split('function restoreScrollIfNeeded')[1]
  ?.split('function applyScrollSnapshot')[0] ?? '';
const currentScrollContainerBlock = functionBody(uiSource, 'currentScrollContainer');
const currentScrollKeyBlock = functionBody(uiSource, 'currentScrollKey');
const openSettingsBlock = uiSource
  .split('const openSettings = () => {')[1]
  ?.split("document.querySelector<HTMLButtonElement>('#open-settings')")[0] ?? '';
const mobileSectionHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-mobile-section]').forEach")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-open-timeline]')")[0] ?? '';
const openTimelineMobileHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-open-timeline]').forEach")[1]
  ?.split("document.querySelector<HTMLButtonElement>('[data-mobile-back]')")[0] ?? '';
const mobileBackButtonBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('[data-mobile-back]')?.addEventListener('click'")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-open-model-settings]')")[0] ?? '';
const hasMobileBackTargetBlock = uiSource
  .split('function hasMobileBackTarget')[1]
  ?.split('function pushMobileHistory')[0] ?? '';
const closeMobileLayerBlock = uiSource
  .split('function closeMobileLayer')[1]
  ?.split('function backMobileLayer')[0] ?? '';
const androidBackListenerBlock = uiSource
  .split("window.addEventListener('tavern-social-android-back'")[1]
  ?.split('mobileNativeBackInstalled = true')[0] ?? '';
const mobileGroupBackButtonBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('[data-mobile-group-back]')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('[data-group-list-back]')")[0] ?? '';
const mobileGroupListBackButtonBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('[data-mobile-group-list-back]')?.addEventListener('click'")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-group-chat-id]')")[0] ?? '';
const momentComposerKeyboardBlock = cssBlock('.keyboard-open .moments-publisher.is-open');
const momentComposerKeyboardTextareaBlock = cssBlock('.keyboard-open .moments-publisher textarea');
const momentComposerMarkupBlock = uiSource
  .split('<div class="moment-compose-meta">')[1]
  ?.split('<textarea id="moment-input"')[0] ?? '';
const momentComposeMetaBlock = cssBlock('.moment-compose-meta');
const momentVisibilityControlsBlock = uiSource
  .split('function renderMomentVisibilityControls')[1]
  ?.split('function renderMomentVisibilityContactControls')[0] ?? '';
const momentVisibilityContactControlsBlock = uiSource
  .split('function renderMomentVisibilityContactControls')[1]
  ?.split('function renderMomentsPage')[0] ?? '';
const momentVisibilityPickerBlock = uiSource
  .split('function renderMomentVisibilityContactPicker')[1]
  ?.split('function renderMomentVisibilityControls')[0] ?? '';
const momentCommentFormMarkupBlock = uiSource
  .split('<form class="moment-comment-form')[1]
  ?.split('</form>')[0] ?? '';
const mobileMomentComposerOpenBlock = (styleSource.split('.moment-compose-fab {')[1] ?? '')
  .split('.keyboard-open .moments-publisher.is-open')[0]
  .split('.moments-publisher.is-open {')[1]
  ?.split('}')[0] ?? '';
const keepMomentComposerVisibleBlock = uiSource
  .split('function keepMomentComposerVisible')[1]
  ?.split('function updateKeyboardOffset')[0] ?? '';
const desktopViewControlsBlock = uiSource
  .split('function renderDesktopViewControls')[1]
  ?.split('function renderCharacterPanelTabs')[0] ?? '';
const renderWithUiTransitionBlock = transitionsSource
  .split('function renderWithUiTransition')[1]
  ?.split('function modelIsReady')[0] ?? '';
const renderWhenChatInputIdleBlock = uiSource
  .split('export function renderWhenChatInputIdle')[1]
  ?.split('function bindUi')[0] ?? '';
const desktopViewHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-open-groups]')")[0] ?? '';
const openEventComposerBlock = uiSource
  .split("function openEventComposer")[1]
  ?.split("function renderSettingsItems")[0] ?? '';
const closeEventComposerBlock = uiSource
  .split('const closeEventComposer = () => {')[1]
  ?.split("document.querySelector<HTMLButtonElement>('#close-event-composer')")[0] ?? '';
const mobileBottomNavBlock = uiSource
  .split('<nav class="bottom-nav"')[1]
  ?.split('</nav>')[0] ?? '';
const bottomNavFinalBlock = styleSource
  .split('/* Bottom nav final alignment guard */')[1] ?? '';
const globalUiResetBlock = styleSource
  .split('/* 大注释：全局 UI 重置层。')[1] ?? '';
const worldWorkbenchBlock = uiSource
  .split('function renderWorldWorkbenchPage')[1]
  ?.split('function renderDesktop')[0] ?? '';
const worldEventLobbyBlock = uiSource
  .split('function renderWorldEventLobby')[1]
  ?.split('function renderWorldDialogueStream')[0] ?? '';
const worldEventDetailBlock = uiSource
  .split('function renderWorldEventRpDetail')[1]
  ?.split('function renderWorldStageComposer')[0] ?? '';
const worldStageComposerBlock = functionBody(uiSource, 'renderWorldStageComposer');
const worldSettingsPanelBlock = uiSource
  .split('function renderWorldSettingsPanel')[1]
  ?.split('function renderWorldStageHeader')[0] ?? '';
const characterSettingsPageBlock = uiSource
  .split('function renderCharacterSettingsPage')[1]
  ?.split('function renderCharacterWorldBookPage')[0] ?? '';
const characterWorldBookPageBlock = uiSource
  .split('function renderCharacterWorldBookPage')[1]
  ?.split('function renderCharacterPanel')[0] ?? '';
const characterWorldBookEditorBlock = uiSource
  .split('function renderCharacterWorldBookEntryEditor')[1]
  ?.split('function readCharacterWorldBookEntryDraftsFromPanel')[0] ?? '';
const characterWorldBookPageEditorStyleBlock = styleSource
  .split('.character-worldbook-page .character-worldbook-editor')[1]
  ?.split('.character-worldbook-page-note')[0] ?? '';
const renderSettingsContentBlock = functionBody(uiSource, 'renderSettingsContent');
const renderDesktopSettingsPageBlock = uiSource
  .split('function renderDesktopSettingsPage')[1]
  ?.split('function renderModelOnboarding')[0] ?? '';
const renderAutoMessageBlock = functionBody(uiSource, 'renderAutoMessage');
const renderPromptPresetRowsBlock = functionBody(uiSource, 'renderPromptPresetRows');
const renderPromptPresetSettingsBlock = functionBody(uiSource, 'renderPromptPresetSettings');
const renderChatPaneBlock = functionBody(uiSource, 'renderChatPane');
const renderCharacterPanelBlock = uiSource
  .split('function renderCharacterPanel(character?: CharacterProfile)')[1]
  ?.split('function renderMessageEditDialog')[0] ?? '';
const renderDesktopBlock = uiSource
  .split('function renderDesktop(character?: CharacterProfile)')[1]
  ?.split('function renderMobileSettings')[0] ?? '';
const renderMobileBlock = uiSource
  .split('function renderMobile(character?: CharacterProfile)')[1]
  ?.split('function modelIsReady')[0] ?? '';
const renderGroupChatPageBlock = functionBody(uiSource, 'renderGroupChatPage');
const renderCharacterSettingsPageBlock = functionBody(uiSource, 'renderCharacterSettingsPage');
const renderGroupSettingsPanelBlock = functionBody(uiSource, 'renderGroupSettingsPanel');
const saveCharacterPanelBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#save-character-panel')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLInputElement>('#character-panel-avatar-import')")[0] ?? '';
const jumpCharacterWorldBookBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#jump-character-worldbook')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#save-character-worldbook')")[0] ?? '';
const saveCharacterWorldBookBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#save-character-worldbook')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#regenerate-character-panel-reply-strategy')")[0] ?? '';
const characterPanelTabHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-character-panel-page]').forEach",
  "document.querySelector<HTMLButtonElement>('#jump-character-worldbook')",
);
const addCharacterWorldBookEntryBlock = sourceSlice(
  uiSource,
  "document.querySelector<HTMLButtonElement>('#add-character-worldbook-entry')?.addEventListener('click'",
  "document.querySelectorAll<HTMLButtonElement>('[data-delete-character-worldbook-entry]').forEach",
);
const deleteCharacterWorldBookEntryBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-delete-character-worldbook-entry]').forEach",
  "document.querySelector<HTMLButtonElement>('#refresh-character-status')",
);
const settingsSectionHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-settings-section]').forEach",
  "document.querySelector<HTMLButtonElement>('[data-settings-back]')",
);
const worldSelectHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLSelectElement>('#world-select, [data-world-select]').forEach",
  "document.querySelector<HTMLButtonElement>('#search-world-location')",
);
const contactSearchHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLInputElement>('#contact-search').forEach",
  "document.querySelector<HTMLButtonElement>('#create-world')",
);
const worldRpRenderModeHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-world-rp-render-mode]').forEach",
  "document.querySelectorAll<HTMLButtonElement>('[data-open-world-event-rp]').forEach",
);
const eventChoiceHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach",
  "document.querySelectorAll<HTMLButtonElement>('[data-event-manual-finish]').forEach",
);
const eventManualFinishHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-event-manual-finish]').forEach",
  "document.querySelectorAll<HTMLButtonElement>('[data-resolve-event]').forEach",
);
const momentVisibilityModeHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelector<HTMLSelectElement>('#moment-visibility-mode')?.addEventListener('change'",
  "document.querySelectorAll<HTMLButtonElement>('[data-moment-visibility-picker]').forEach",
);
const momentVisibilityPickerHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-moment-visibility-picker]').forEach",
  "document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-character]').forEach",
);
const momentVisibilityCharacterHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-character]').forEach",
  "document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-blocked]').forEach",
);
const momentVisibilityBlockedHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-blocked]').forEach",
  "document.querySelector<HTMLTextAreaElement>('#moment-input')",
);
const momentCommentTapHandlerBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLElement>('[data-moment-comment-tap]').forEach",
  "document.querySelectorAll<HTMLButtonElement>('[data-clear-comment-reply]').forEach",
);
const authoringStepHandlerBlock = sourceSlice(
  authoringUiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-authoring-step]').forEach",
  "document.querySelector<HTMLButtonElement>('#authoring-previous')",
);
const privateChatContactCharactersBlock = functionBody(uiSource, 'privateChatContactCharacters');
const renderGroupConversationRowsBlock = functionBody(uiSource, 'renderGroupConversationRows');
const eventsPageBlock = functionBody(uiSource, 'renderEventsPage');
const eventComposerDialogBlock = functionBody(uiSource, 'renderEventComposerDialog');
const worldEventSettingsPanelBlock = functionBody(uiSource, 'renderWorldEventSettingsPanel');
const worldPersonaSelectorBlock = functionBody(uiSource, 'renderWorldPersonaSelector');
const worldPersonaSummaryBlock = worldPersonaSelectorBlock
  .split('<summary')[1]
  ?.split('</summary>')[0] ?? '';
const focusAfterSubmitIndex = composerSubmitBlock.indexOf("requestMessageComposerFocusAfterSubmit(character?.id ?? '');");
const replyModeBranchIndex = composerSubmitBlock.indexOf("if (state.chatReplyMode === 'manual')");
const groupSentBranchIndex = groupComposerSubmitBlock.indexOf('if (sent) {');
const groupFocusAfterSubmitIndex = groupComposerSubmitBlock.indexOf('requestGroupComposerFocusAfterSubmit(chat.id);');
const groupReplyModeBranchIndex = groupComposerSubmitBlock.indexOf("if (sent && state.chatReplyMode !== 'manual')");
if (
  !typingDelaySource.includes('export function modelTypingDelayMs')
  || !typingDelaySource.includes('MIN_MODEL_TYPING_DELAY_MS')
  || !typingDelaySource.includes('MAX_MODEL_TYPING_DELAY_MS')
  || !typingDelaySource.includes('export function waitForModelTyping')
  || !chatSource.includes('await waitForModelTyping(reply, controller.signal);')
  || chatSource.indexOf('await waitForModelTyping(reply, controller.signal);') > chatSource.indexOf("appendAssistantReply(character, conversation, reply, 'model_reply')")
  || !chatSource.includes('await waitForModelTyping(content);')
  || !schedulerSource.includes('await waitForModelTyping(reply);')
  || !groupChatSource.includes('await waitForModelTyping(raw);')
) {
  throw new Error('Model-generated messages should simulate typing time before being appended.');
}
if (
  focusAfterSubmitIndex < 0
  || replyModeBranchIndex < 0
  || focusAfterSubmitIndex > replyModeBranchIndex
) {
  throw new Error('Private chat submit should keep the composer focused for both auto and manual reply modes.');
}
if (
  groupSentBranchIndex < 0
  || groupFocusAfterSubmitIndex < 0
  || groupReplyModeBranchIndex < 0
  || groupFocusAfterSubmitIndex < groupSentBranchIndex
  || groupFocusAfterSubmitIndex > groupReplyModeBranchIndex
) {
  throw new Error('Group chat submit should keep the composer focused for both auto and manual reply modes.');
}
if (
  !requestBeforeInputSubmitBlock.includes("event.inputType !== 'insertLineBreak'")
  || !requestBeforeInputSubmitBlock.includes('!state.enterToSend')
  || !requestBeforeInputSubmitBlock.includes('textarea.form?.requestSubmit()')
  || !uiSource.includes("messageInput.addEventListener('beforeinput'")
  || !uiSource.includes("groupInput.addEventListener('beforeinput'")
  || !uiSource.includes('enterkeyhint="${state.enterToSend ? \'send\' : \'enter\'}"')
) {
  throw new Error('Mobile keyboard line breaks should submit when enter-to-send is enabled.');
}
if (
  !uiSource.includes('function requestMessageComposerFocusAfterSubmit')
  || !uiSource.includes('function requestGroupComposerFocusAfterSubmit')
  || !composerSubmitBlock.includes("requestMessageComposerFocusAfterSubmit(character?.id ?? '');")
  || !groupComposerSubmitBlock.includes('requestGroupComposerFocusAfterSubmit(chat.id);')
  || !uiSource.includes('COMPOSER_FOCUS_KEEPALIVE_MS')
) {
  throw new Error('Composer focus should be kept alive across mobile re-renders after sending.');
}
if (
  renderDesktopSettingsPageBlock.includes('settings-overlay')
  || renderDesktopSettingsPageBlock.includes('settings-backdrop')
  || renderDesktopSettingsPageBlock.includes('role="dialog"')
  || renderDesktopSettingsPageBlock.includes('aria-modal')
  || !renderDesktopSettingsPageBlock.includes('desktop-settings-page')
  || !renderDesktopBlock.includes('settingsOpen ? renderDesktopSettingsPage(character)')
) {
  throw new Error('Desktop settings should render as a normal page instead of a modal overlay.');
}
if (
  renderCharacterPanelBlock.includes('character-panel-overlay')
  || renderCharacterPanelBlock.includes('character-panel-backdrop')
  || renderCharacterPanelBlock.includes('role="dialog"')
  || renderCharacterPanelBlock.includes('aria-modal')
  || !renderCharacterPanelBlock.includes('character-page')
  || renderChatPaneBlock.includes('renderCharacterPanel(character)')
  || !renderDesktopBlock.includes('characterPanelOpen ? renderCharacterPanel(character)')
  || !renderMobileBlock.includes('characterPanelOpen && character')
) {
  throw new Error('Private chat character settings should render as a page, not as a sheet overlay inside chat.');
}
if (
  !characterWorldBookEditorBlock.includes('<details class="character-worldbook-entry"')
  || characterWorldBookEditorBlock.includes('role="dialog"')
  || characterWorldBookEditorBlock.includes('aria-modal')
) {
  throw new Error('Character worldbook entries should stay as inline interactive accordions without an edit popup.');
}
if (
  !idleRenderBlock.includes("input.closest('.sticker-import-dialog')")
  || !idleRenderBlock.includes('窗口失焦时不能让后台调度触发重渲染清空内容')
  || !idleRenderBlock.includes('return;')
) {
  throw new Error('Idle scheduler renders should not refresh non-draft form fields on window blur.');
}
if (
  !idleRenderBlock.includes("input.id === 'group-message-input'")
  || !idleRenderBlock.includes('setGroupMessageDraft(activeGroupChat(), input.value)')
  || !idleRenderBlock.includes("input.id === 'timeline-note-input'")
  || !idleRenderBlock.includes('timelineNoteDraft = input.value')
  || !idleRenderBlock.includes('captureEventComposerDraftFromDom()')
  || !idleRenderBlock.includes('input.dataset.eventManualInput')
  || !idleRenderBlock.includes('.world-gear-panel')
  || !idleRenderBlock.includes('.world-persona-select')
  || !idleRenderBlock.includes('.message-edit-dialog')
) {
  throw new Error('Idle scheduler renders should protect every visible text box from draft loss and keyboard focus drops.');
}
if (
  !timelineIdleRenderBranch.includes('return;')
  || !eventComposerIdleRenderBranch.includes('return;')
  || !/timelineNoteDraft = input\.value;\r?\n\s*return;/.test(timelineIdleRenderBranch)
  || !/captureEventComposerDraftFromDom\(\);\r?\n\s*return;/.test(eventComposerIdleRenderBranch)
) {
  throw new Error('World and event forms should drop idle scheduler renders instead of refreshing after blur.');
}
if (
  !promptPresetSwitchHandlerBlock.includes('preserveScrollForNextRender();')
  || !promptRowSwitchHandlerBlock.includes('preserveScrollForNextRender();')
  || !regexSwitchHandlerBlock.includes('preserveScrollForNextRender();')
) {
  throw new Error('Prompt preset switches should preserve the current scroll position when they re-render.');
}
if (
  !characterPanelTabHandlerBlock.includes('preserveScrollForNextRender();')
  || !addCharacterWorldBookEntryBlock.includes('preserveScrollForNextRender();')
  || !deleteCharacterWorldBookEntryBlock.includes('preserveScrollForNextRender();')
  || !settingsSectionHandlerBlock.includes('preserveScrollForNextRender();')
  || !worldSelectHandlerBlock.includes('saveUiSessionSnapshot();')
  || !contactSearchHandlerBlock.includes('preserveScrollForNextRender();')
  || !worldRpRenderModeHandlerBlock.includes('preserveScrollForNextRender();')
  || !eventChoiceHandlerBlock.includes('preserveScrollForNextRender();')
  || !eventManualFinishHandlerBlock.includes('preserveScrollForNextRender();')
  || !momentVisibilityModeHandlerBlock.includes('preserveScrollForNextRender();')
  || !momentVisibilityPickerHandlerBlock.includes('preserveScrollForNextRender();')
  || !momentVisibilityCharacterHandlerBlock.includes('preserveScrollForNextRender();')
  || !momentVisibilityBlockedHandlerBlock.includes('preserveScrollForNextRender();')
  || !momentCommentTapHandlerBlock.includes('preserveScrollForNextRender();')
  || !authoringStepHandlerBlock.includes('preserveAuthoringScrollForNextRender();')
) {
  throw new Error('Same-page option changes should preserve scroll instead of jumping back to the top.');
}
if (
  !uiSource.includes("let actionMenuAnchor: { kind: 'message' | 'group'; id: string; top: number } | null = null")
  || !uiSource.includes('function captureActionMenuAnchor')
  || !uiSource.includes('function restoreActionMenuAnchorIfNeeded')
  || privateMessageActionOpenBlock.indexOf("captureActionMenuAnchor('message', messageId, message);") < 0
  || privateMessageActionOpenBlock.indexOf('messageActionId = messageId;') < 0
  || privateMessageActionOpenBlock.indexOf("captureActionMenuAnchor('message', messageId, message);") > privateMessageActionOpenBlock.indexOf('messageActionId = messageId;')
  || groupMessageActionOpenBlock.indexOf("captureActionMenuAnchor('group', messageId, message);") < 0
  || groupMessageActionOpenBlock.indexOf('groupMessageActionId = messageId;') < 0
  || groupMessageActionOpenBlock.indexOf("captureActionMenuAnchor('group', messageId, message);") > groupMessageActionOpenBlock.indexOf('groupMessageActionId = messageId;')
  || !uiSource.includes('restoreScrollIfNeeded() || restoreActionMenuAnchorIfNeeded()')
  || !uiSource.includes('has-actions-open-above')
  || !uiSource.includes('is-actions-open is-actions-open-above')
  || !styleSource.includes('.message-row.has-actions-open-above')
  || !styleSource.includes('--message-actions-space: 150px')
  || !styleSource.includes('.group-message.is-actions-open-above .group-message-actions')
) {
  throw new Error('Message action menus should open above while anchoring the tapped bubble in place.');
}
if (
  !restoreScrollBlock.includes('window.setTimeout(() => applyScrollSnapshot(snapshot), 0)')
  || !restoreScrollBlock.includes('动作菜单和图片可能在首轮布局后再改变高度')
) {
  throw new Error('Scroll restoration should run a second pass after message action layout settles.');
}
if (
  currentScrollContainerBlock.indexOf('settingsOpen') < 0
  || currentScrollContainerBlock.indexOf('characterPanelOpen') < 0
  || currentScrollContainerBlock.indexOf('settingsOpen') > currentScrollContainerBlock.indexOf("state.activeView === 'world'")
  || currentScrollContainerBlock.indexOf('characterPanelOpen') > currentScrollContainerBlock.indexOf("state.activeView === 'chat'")
  || !currentScrollKeyBlock.includes('settings:')
  || !currentScrollKeyBlock.includes('character-panel:')
) {
  throw new Error('Scroll snapshots should prioritize open settings and character panels over the page behind them.');
}
if (
  keepMomentComposerVisibleBlock.includes('scrollTop')
  || keepMomentComposerVisibleBlock.includes('scrollIntoView')
) {
  throw new Error('Moment composer keyboard handling should not auto-scroll the modal contents.');
}
function cssBlock(selector: string): string {
  return styleSource.split(`${selector} {`)[1]?.split('}')[0] ?? '';
}
if (
  !cssBlock('.composer').includes('align-items: center')
  || !cssBlock('.sticker-trigger').includes('align-self: center')
  || !cssBlock('.generate-reply-button').includes('align-self: center')
  || !cssBlock('.send-button').includes('align-self: center')
) {
  throw new Error('Composer controls should stay vertically centered instead of stretching with the textarea.');
}
if (
  !profileNoteGenerationBlock.includes('角色介绍')
  || !profileNoteGenerationBlock.includes('不是聊天开场')
  || !profileNoteGenerationBlock.includes('不要输出 <msg>')
  || !profileNoteGenerationBlock.includes('contextMessages: []')
) {
  throw new Error('Generated character intro should be a profile note, not a chat opener, and should not read chat history.');
}
if (!styleSource.includes(".messages {\n  gap: 10px;\n  padding: 18px clamp(20px, 5vw, 72px);\n}")) {
  throw new Error('Chat messages should have comfortable spacing between bubbles.');
}
if (
  !uiSource.includes('let proactiveManagerCharacterId')
  || !uiSource.includes('function proactiveManagerCharacter()')
  || !uiSource.includes('id="proactive-character-select"')
  || !uiSource.includes("document.querySelector<HTMLSelectElement>('#proactive-character-select')")
  || !autoMessageSaveBlock.includes('const character = proactiveManagerCharacter();')
  || autoMessageSaveBlock.includes('const character = activeCharacter();')
  || !autoPacingRegenerateBlock.includes('const character = proactiveManagerCharacter();')
  || !restoreAutoPacingBlock.includes('const character = proactiveManagerCharacter();')
  || !keepAutoPacingBlock.includes('const character = proactiveManagerCharacter();')
) {
  throw new Error('Proactive settings should use a role dropdown instead of the active chat character.');
}
if (
  !uiSource.includes('let replyStrategyManagerCharacterId')
  || !uiSource.includes('function replyStrategyManagerCharacter()')
  || !uiSource.includes('function createCharacterReplyStrategy')
  || !replyStrategySettingsBlock.includes('id="reply-strategy-character-select"')
  || !replyStrategySettingsBlock.includes('id="character-reply-strategy"')
  || !replyStrategySettingsBlock.includes('id="regenerate-character-reply-strategy"')
  || !renderSettingsContentBlock.includes("renderSettingsFold('角色回复策略', managedReplyStrategyCharacter ? managedReplyStrategyCharacter.name : '按角色分别保存', replyStrategySettings, true)")
  || !uiSource.includes("document.querySelector<HTMLSelectElement>('#reply-strategy-character-select')")
  || !uiSource.includes("document.querySelector<HTMLButtonElement>('#regenerate-character-reply-strategy')")
  || !characterSettingsPageBlock.includes('id="regenerate-character-panel-reply-strategy"')
  || !uiSource.includes("document.querySelector<HTMLButtonElement>('#regenerate-character-panel-reply-strategy')")
  || !replyStrategySaveBlock.includes('const character = replyStrategyManagerCharacter();')
  || !replyStrategySaveBlock.includes("character.replyStrategy = fieldValue<HTMLTextAreaElement>('#character-reply-strategy');")
  || replyStrategySaveBlock.includes('state.chatReplyMode')
) {
  throw new Error('Reply strategy settings should be scoped to a selected character instead of global chat settings.');
}
if (
  characterSettingsPageBlock.includes('id="character-panel-worldbook"')
  || characterSettingsPageBlock.includes('设定世界书正文')
  || !characterSettingsPageBlock.includes('id="jump-character-worldbook"')
  || characterSettingsPageBlock.includes('renderCharacterWorldBookEntryEditor(character)')
  || !characterWorldBookPageBlock.includes('class="character-panel-page character-worldbook-page"')
  || !characterWorldBookPageBlock.includes('renderCharacterWorldBookEntryEditor(character)')
  || !characterWorldBookPageBlock.includes('id="save-character-worldbook"')
  || !renderCharacterPanelBlock.includes("characterPanelPage === 'worldbook-editor'")
  || !renderCharacterPanelBlock.includes('character-worldbook-shell')
  || !renderCharacterPanelBlock.includes("worldbookEditorMode ? '' : renderCharacterPanelTabs()")
  || !uiSource.includes("type CharacterPanelPage = 'worldbook' | 'worldbook-editor' | 'status'")
  || !jumpCharacterWorldBookBlock.includes("characterPanelPage = 'worldbook-editor';")
  || jumpCharacterWorldBookBlock.includes('scrollIntoView')
  || saveCharacterPanelBlock.includes('setCharacterWorldBookEntryDrafts')
  || !saveCharacterWorldBookBlock.includes('setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());')
  || !characterWorldBookEditorBlock.includes('<details class="character-worldbook-entry"')
  || !characterWorldBookEditorBlock.includes('<summary class="character-worldbook-entry-head">')
  || !characterWorldBookEditorBlock.includes('class="character-worldbook-entry-count"')
  || !styleSource.includes('.character-worldbook-jump')
) {
  throw new Error('Character private settings should open a dedicated worldbook page instead of embedding worldbook editing in the general settings page.');
}
if (
  !characterWorldBookPageEditorStyleBlock.includes('flex: 0 0 auto')
  || !characterWorldBookPageEditorStyleBlock.includes('overflow: visible')
) {
  throw new Error('Dedicated character worldbook page should let expanded entries grow the page so the page itself can scroll.');
}
if (
  !uiSource.includes('function renderSettingsFold(')
  || !uiSource.includes('class="settings-fold"')
  || !uiSource.includes('class="settings-fold-list"')
  || !styleSource.includes('.settings-fold > summary')
  || !renderAutoMessageBlock.includes('renderSettingsFold(')
  || !renderSettingsContentBlock.includes("renderSettingsFold('世界资料'")
  || !renderSettingsContentBlock.includes("renderSettingsFold('连接信息'")
  || !renderSettingsContentBlock.includes("renderSettingsFold('当前角色关系'")
  || !renderSettingsContentBlock.includes("renderSettingsFold('我的人设'")
  || !renderSettingsContentBlock.includes("renderSettingsFold('通知权限'")
  || renderSettingsContentBlock.includes('id="character-settings-text"')
  || !renderPromptPresetSettingsBlock.includes('renderSettingsFold(')
  || !renderPromptPresetRowsBlock.includes('<details class="prompt-preset-row')
  || renderPromptPresetRowsBlock.includes('<article class="prompt-preset-row')
) {
  throw new Error('Bulky settings panels should use compact collapsible sections and prompt rows should be details entries.');
}
if (
  !uiSource.includes('id="chat-font-scale"')
  || !uiSource.includes('fontScaleLabel(state.chatFontScale)')
  || !uiSource.includes('style="${chatSurfaceStyle')
  || !renderChatPaneBlock.includes('privateChatBackgroundImage(character)')
  || !renderGroupChatPageBlock.includes('groupChatBackgroundImage(chat)')
  || !renderCharacterSettingsPageBlock.includes("importId: 'private-chat-background-import'")
  || !renderCharacterSettingsPageBlock.includes("clearId: 'clear-private-chat-background'")
  || !renderGroupSettingsPanelBlock.includes("importId: 'group-chat-background-import'")
  || !renderGroupSettingsPanelBlock.includes("clearId: 'clear-group-chat-background'")
  || !styleSource.includes('--chat-font-scale')
  || !styleSource.includes('.chat-background-preview')
) {
  throw new Error('Chat appearance settings should expose font-size controls and per-chat background image controls.');
}
if (
  !styleSource.includes('Mobile density polish final guard')
  || !styleSource.includes('--mobile-control-height')
  || !styleSource.includes('.mobile-list-tools .world-switcher > span')
  || !styleSource.includes('.mobile-settings-list .settings-menu-group')
  || !styleSource.includes('.mobile-settings-list .settings-list-item.is-active')
  || !styleSource.includes('.character-panel-page .field:first-of-type')
  || !styleSource.includes('.character-worldbook-editor')
  || !styleSource.includes('.character-settings-shell > .character-panel-page')
  || !styleSource.includes('flex-direction: column')
  || !styleSource.includes('scroll-padding-top: var(--mobile-sheet-top)')
  || !uiSource.includes('let scrollCharacterPanelToTopAfterRender')
  || !uiSource.includes("document.querySelector<HTMLElement>('.character-panel')?.scrollTo")
) {
  throw new Error('Mobile contact, settings, and character panels should use the compact safe-area polish layer without compressing the worldbook editor.');
}
if (
  !autoMessageSaveBlock.includes("const hasAutoMessageSettings = Boolean(document.querySelector<HTMLInputElement>('#auto-enabled'));")
  || !autoMessageSaveBlock.includes("const hasAutoMomentSettings = Boolean(document.querySelector<HTMLInputElement>('#auto-moment-enabled'));")
  || !autoMessageSaveBlock.includes("const hasAutoEventSettings = Boolean(document.querySelector<HTMLInputElement>('#auto-event-enabled'));")
  || !autoMessageSaveBlock.includes('if (hasAutoEventSettings)')
  || !autoMessageSaveBlock.includes('preserveScrollForNextRender();')
) {
  throw new Error('Shared event settings should save only visible auto-setting fields and preserve scroll.');
}
if (
  !momentDraftGenerationBlock.includes('momentComposerTextDraft = content;')
  || !momentDraftGenerationBlock.includes('saveUiSessionSnapshot({ captureDom: false });')
  || momentDraftGenerationBlock.includes('saveUiSessionSnapshot({ captureDom: true });')
) {
  throw new Error('Generated moment drafts should not be overwritten by stale textarea DOM snapshots.');
}
if (
  !indexHtmlSource.includes('<title>Pal Tavern</title>')
  || !uiSource.includes('<div class="brand"><h1>PalTavern</h1>')
  || !uiSource.includes('<span class="settings-kicker">PalTavern</span><h1>设置中心</h1>')
  || !uiSource.includes('<span class="eyebrow">PalTavern</span><h1>设置</h1>')
  || uiSource.includes('<div class="brand"><h1>Tavern Social</h1>')
) {
  throw new Error('Visible app shell branding should use PalTavern instead of Tavern Social.');
}
if (
  !uiSource.includes('id="force-restart-services"')
  || !uiSource.includes('强制重启所有服务')
  || !forceRestartServicesBlock.includes('captureVisibleDraftsFromDom()')
  || !forceRestartServicesBlock.includes('saveUiSessionSnapshot()')
  || !forceRestartServicesBlock.includes('window.location.reload()')
  || forceRestartServicesBlock.includes('refreshCharacterStatusSummary')
  || forceRestartServicesBlock.includes('refreshWorldWeather')
  || forceRestartServicesBlock.includes('runAutoMessageCheckNow')
  || forceRestartServicesBlock.includes('saveState()')
  || !forceRestartServicesHandlerBlock.includes('forceRestartAllServices()')
) {
  throw new Error('Settings data panel should expose a force restart button that reloads the app without touching existing content data.');
}
if (
  !uiSource.includes("type SettingsSection = 'world' | 'drafts' | 'stickers' | 'model' | 'prompts' | 'relationship' | 'interactions' | 'proactive' | 'chat' | 'notifications' | 'data'")
  || !uiSource.includes("['interactions',")
  || !uiSource.includes('id="world-interaction-high-simulation"')
  || !uiSource.includes('id="refresh-character-plan"')
  || !uiSource.includes('currentPlan')
) {
  throw new Error('Settings and character status UI should expose character interaction mode and current plans.');
}
if (
  !uiSource.includes('id="test-model-connection"')
  || !uiSource.includes('测试连接')
  || !uiSource.includes("import { callAuthoringModel, callModel, fetchModelList, testModelConnection } from '../model/client';")
  || !modelConnectionTestBlock.includes('testModelConnection({')
  || !modelConnectionTestBlock.includes("apiUrl: apiUrlForProvider(provider, fieldValue('#api-url'))")
  || !modelConnectionTestBlock.includes("model: fieldValue('#model-name')")
  || !modelConnectionTestBlock.includes('modelFormDraft = {')
  || modelConnectionTestBlock.includes('saveState()')
) {
  throw new Error('Model settings should expose a connection test button that uses the unsaved form config.');
}
if (
  !uiSource.includes('id="onboarding-test-model-connection"')
  || !onboardingModelConnectionTestBlock.includes('modelOnboardingDraft = {')
  || !onboardingModelConnectionTestBlock.includes('testModelConnection({')
  || !onboardingModelConnectionTestBlock.includes("apiUrl: apiUrlForProvider(provider, fieldValue('#onboarding-api-url'))")
  || !onboardingModelConnectionTestBlock.includes("model: fieldValue('#onboarding-model-name')")
  || !onboardingModelConnectionTestBlock.includes('onboarding-model-status')
  || !onboardingModelConnectionTestBlock.includes('onboarding-fetch-models')
) {
  throw new Error('First-run model onboarding should expose a connection test button that uses the current API fields.');
}
if (
  !uiSource.includes('id="relationship-pair-a-select"')
  || !uiSource.includes('id="relationship-pair-b-select"')
  || !uiSource.includes('id="save-character-relationship"')
  || !uiSource.includes('data-apply-relationship-suggestion')
  || !uiSource.includes('data-ignore-relationship-suggestion')
) {
  throw new Error('Relationship settings should expose editable character-to-character relationship controls and suggestion actions.');
}
if (
  !openSettingsBlock.includes("mobileSection = 'settings';")
  || !openSettingsBlock.includes('mobileChatOpen = false;')
  || !openSettingsBlock.includes('mobileGroupChatOpen = false;')
  || !openSettingsBlock.includes("pushMobileHistory('section');")
  || !mobileSectionHandlerBlock.includes("if (mobileSection !== 'messages') pushMobileHistory('section');")
  || !openTimelineMobileHandlerBlock.includes("pushMobileHistory('section');")
  || mobileBackButtonBlock.includes('closeMobileLayer()')
  || mobileGroupBackButtonBlock.includes('closeMobileLayer()')
  || mobileGroupListBackButtonBlock.includes("mobileSection = 'messages';")
  || !mobileBackButtonBlock.includes('backMobileLayer();')
  || !mobileGroupBackButtonBlock.includes('backMobileLayer();')
  || !mobileGroupListBackButtonBlock.includes('backMobileLayer();')
) {
  throw new Error('Mobile navigation should push section history and route visible back buttons through the single-layer back handler.');
}
if (
  !hasMobileBackTargetBlock.includes('Boolean(activeWorldRpEventId)')
  || !hasMobileBackTargetBlock.includes('Boolean(worldRpMessageEditId)')
  || closeMobileLayerBlock.indexOf('if (worldRpMessageEditId)') < 0
  || closeMobileLayerBlock.indexOf('if (activeWorldRpEventId)') < 0
  || closeMobileLayerBlock.indexOf('if (activeWorldRpEventId)') > closeMobileLayerBlock.indexOf("if (mobileSection !== 'messages')")
  || !androidBackListenerBlock.includes('event.preventDefault();')
  || !androidBackListenerBlock.includes('closeMobileLayer()')
  || !androidMainActivitySource.includes('OnBackPressedCallback')
  || !androidMainActivitySource.includes('tavern-social-android-back')
) {
  throw new Error('Android hardware back should be bridged into the mobile in-app back stack before the activity can exit.');
}
if (
  !momentComposerMarkupBlock.includes('id="moment-author-select"')
  || !momentComposerMarkupBlock.includes('renderMomentVisibilityControls()')
  || !momentComposeMetaBlock.includes('grid-template-columns: minmax(0, 1fr) minmax(0, 1fr)')
  || !momentComposeMetaBlock.includes('align-items: start')
) {
  throw new Error('Moment composer should place author and visibility controls in one horizontal row.');
}
if (
  !momentVisibilityContactControlsBlock.includes('renderMomentVisibilityContactPicker(')
  || !momentVisibilityContactControlsBlock.includes('data-moment-visibility-character')
  || !momentVisibilityContactControlsBlock.includes('data-moment-visibility-blocked')
  || !momentVisibilityControlsBlock.includes("['public'")
  || !momentVisibilityControlsBlock.includes("['private'")
  || momentVisibilityControlsBlock.includes("['friends'")
  || momentVisibilityControlsBlock.includes("['specific'")
  || momentVisibilityControlsBlock.includes("['blocked'")
  || !momentVisibilityPickerBlock.includes('moment-visibility-picker-trigger')
  || !momentVisibilityPickerBlock.includes('moment-visibility-contact-panel')
  || !momentVisibilityPickerBlock.includes('moment-visibility-contact-row')
  || momentVisibilityPickerBlock.includes('moment-visibility-checks')
  || !styleSource.includes('.moment-visibility-contact-panel')
  || !styleSource.includes('.moment-visibility-contact-row')
  || !styleSource.includes('.keyboard-open .moment-compose-meta')
  || !styleSource.includes('.keyboard-open .moment-visibility-contact-controls')
  || !styleSource.includes('justify-content: flex-end')
) {
  throw new Error('Moment visibility should use public/private plus separate contact-list allow/block pickers.');
}
if (
  !uiSource.includes('data-moment-comment-tap')
  || !uiSource.includes('data-moment-comment-menu')
  || !uiSource.includes('moment-comment-menu')
  || !uiSource.includes('data-open-comment-character-reply')
  || !uiSource.includes('data-submit-comment-character-reply')
  || !uiSource.includes('楼主回复')
  || !uiSource.includes('选角色回复')
  || uiSource.includes('data-reply-comment=')
  || uiSource.includes('moment-comment-actions')
  || uiSource.includes('class="moment-comment-reply"')
  || !styleSource.includes('.moment-comment-menu')
  || !momentCommentFormMarkupBlock.includes('class="secondary moment-comment-submit"')
  || !momentCommentFormMarkupBlock.includes('moment-comment-inline-form')
  || !momentCommentFormMarkupBlock.includes('aria-label="发送评论"')
  || !momentCommentFormMarkupBlock.includes("${icon('send')}")
  || momentCommentFormMarkupBlock.includes('>发送</button>')
  || !styleSource.includes('grid-template-columns: minmax(96px, 0.28fr) minmax(0, 1fr) 44px')
  || !styleSource.includes('Moment comment inline layout guard')
  || !styleSource.includes('grid-template-columns: clamp(86px, 26%, 132px) minmax(0, 1fr) 44px')
  || styleSource.includes('.moment-comment-form select {\n    grid-column: 1 / -1;')
) {
  throw new Error('Moment comments should use tap-to-reply plus long-press action menus instead of always-visible action buttons.');
}
if (
  !styleSource.includes("  .moments-publisher.is-open {\n    top: 50%;\n    right: 12px;\n    bottom: auto;")
  || !styleSource.includes('transform: translateY(-50%)')
  || !momentComposerKeyboardBlock.includes('top: auto')
  || !momentComposerKeyboardBlock.includes('transform: none')
) {
  throw new Error('Mobile moment composer should open centered when the keyboard is closed.');
}
if (
  !momentComposerKeyboardBlock.includes('var(--keyboard-offset)')
  || !momentComposerKeyboardBlock.includes('overscroll-behavior: contain')
  || !momentComposerKeyboardTextareaBlock.includes('max-height')
  || !uiSource.includes('function keepMomentComposerVisible')
  || !uiSource.includes('window.setTimeout(keepMomentComposerVisible, 80)')
  || !uiSource.includes('window.setTimeout(keepMomentComposerVisible, 220)')
) {
  throw new Error('Moment composer should stay visible and scrollable above the mobile keyboard.');
}
// 大注释：世界工作台导航契约。主入口只暴露消息、角色、世界、动态、设置；事件和时间线只作为世界内部能力出现。
if (
  !uiSource.includes("type MobileSection = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings'")
  || !desktopViewControlsBlock.includes('data-view="world"')
  || !desktopViewControlsBlock.includes('>世界<')
  || desktopViewControlsBlock.includes('data-view="events"')
  || desktopViewControlsBlock.includes('data-view="timeline"')
  || !mobileBottomNavBlock.includes("['messages', '消息'")
  || !mobileBottomNavBlock.includes("['contacts', '角色'")
  || !mobileBottomNavBlock.includes("['world', '世界'")
  || !mobileBottomNavBlock.includes("['moments', '动态'")
  || !mobileBottomNavBlock.includes("['settings', '设置'")
  || mobileBottomNavBlock.includes("['events'")
  || mobileBottomNavBlock.includes("['timeline'")
) {
  throw new Error('Main navigation should expose messages, characters, world, moments, and settings only.');
}
if (
  !bottomNavFinalBlock.includes('grid-template-columns: repeat(5, minmax(0, 1fr))')
  || !bottomNavFinalBlock.includes('grid-auto-flow: column')
  || !bottomNavFinalBlock.includes('justify-items: stretch')
  || !bottomNavFinalBlock.includes('width: 100%')
  || !bottomNavFinalBlock.includes('min-width: 0')
  || !bottomNavFinalBlock.includes('place-items: center')
  || !bottomNavFinalBlock.includes('width: 36px')
  || !bottomNavFinalBlock.includes('height: 28px')
) {
  throw new Error('Mobile bottom navigation should lock five equal slots and centered icon/label alignment.');
}
if (
  !transitionsSource.includes("export type UiTransitionKind = 'main-forward' | 'main-back' | 'detail-in' | 'detail-out' | 'overlay-in' | 'overlay-out' | 'quiet'")
  || !transitionsSource.includes('startViewTransition')
  || !transitionsSource.includes("setAttribute('data-ui-transition'")
  || uiSource.includes('function startViewTransitionRender')
  || uiSource.includes("setAttribute('data-ui-transition'")
  || !uiSource.includes("from './transitions'")
  || !renderWithUiTransitionBlock.includes('renderPage();')
  || !mobileSectionHandlerBlock.includes('renderWithUiTransition')
  || !desktopViewHandlerBlock.includes('renderWithUiTransition')
  || !openEventComposerBlock.includes("renderWithUiTransition('overlay-in'")
  || !closeEventComposerBlock.includes("renderWithUiTransition('overlay-out'")
  || renderWhenChatInputIdleBlock.includes('renderWithUiTransition')
) {
  throw new Error('Page changes should use one guarded UI transition entry while idle/background renders stay quiet.');
}
if (
  !styleSource.includes('/* 大注释：页面切换动效层')
  || !styleSource.includes('::view-transition-old(root)')
  || !styleSource.includes('::view-transition-new(root)')
  || !styleSource.includes('@keyframes paltavern-page-enter-forward')
  || !styleSource.includes('.ui-fallback-transition[data-ui-transition')
  || !styleSource.includes('@media (prefers-reduced-motion: reduce)')
) {
  throw new Error('Page transition styles should include View Transition, fallback, and reduced-motion support.');
}
if (
  !globalUiResetBlock.includes('--warm-accent')
  || !globalUiResetBlock.includes('.desktop-shell')
  || !globalUiResetBlock.includes('.chat,')
  || !globalUiResetBlock.includes('.settings-window')
  || !globalUiResetBlock.includes('.moment-card')
  || !globalUiResetBlock.includes('.world-workbench')
  || !globalUiResetBlock.includes('.bottom-nav')
  || !globalUiResetBlock.includes('统一 PalTavern 的基础视觉语言')
  || !globalUiResetBlock.includes('手机端最终重置')
) {
  throw new Error('Global UI reset layer should keep the shared product styling for all major surfaces.');
}
const worldTopbarFinalBlock = styleSource.split('/* World topbar final mobile arrangement guard */')[1] ?? '';
if (
  !worldTopbarFinalBlock.includes('grid-template-areas:')
  || !worldTopbarFinalBlock.includes('"persona stage actions"')
  || !worldTopbarFinalBlock.includes('position: relative')
  || !worldTopbarFinalBlock.includes('.world-stage-header {')
  || !worldTopbarFinalBlock.includes('grid-area: stage')
  || !worldTopbarFinalBlock.includes('.world-stage-actions {')
  || !worldTopbarFinalBlock.includes('grid-area: actions')
  || !worldTopbarFinalBlock.includes('#generate-event')
  || !worldTopbarFinalBlock.includes('width: 44px')
  || !worldTopbarFinalBlock.includes('white-space: nowrap')
  || !styleSource.includes('Mobile overlap repair guard')
  || !styleSource.includes('.world-persona-select.world-persona-avatar-only')
  || !styleSource.includes('.world-gear-panel[open] .world-gear-card')
  || !styleSource.includes('height: 100dvh')
  || !styleSource.includes('.moments-scroll,')
  || !styleSource.includes('overflow-x: hidden')
  || !uiSource.includes('function closeTransientOverlaysForPageChange')
  || !uiSource.includes("'.world-gear-panel[open], .world-persona-select[open]'")
) {
  throw new Error('Mobile world topbar should stay one-row, with an avatar identity, full-page world settings, and no horizontal overflow.');
}
if (
  !worldWorkbenchBlock.includes('aria-label="生成事件"')
  || !worldWorkbenchBlock.includes('<span class="world-action-label">生成事件</span>')
) {
  throw new Error('World generate-event should keep an accessible label while rendering as a lighter topbar action.');
}
if (
  !worldPersonaSelectorBlock.includes('renderUserAvatar()')
  || !worldPersonaSelectorBlock.includes('personaName')
  || !worldPersonaSelectorBlock.includes('world-persona-avatar-only')
  || !worldPersonaSummaryBlock.includes('⌄')
  || worldPersonaSummaryBlock.includes('world-persona-name')
  || worldPersonaSummaryBlock.includes('<small')
  || worldPersonaSummaryBlock.includes('personaSummary')
) {
  throw new Error('World persona selector should collapse to avatar plus dropdown arrow in the top bar.');
}
if (
  !uiSource.includes('worldRpActorId')
  || !worldPersonaSelectorBlock.includes('renderWorldRpActorOptions')
  || !uiSource.includes('value="user"')
  || !worldPersonaSelectorBlock.includes('data-world-rp-actor')
  || worldPersonaSelectorBlock.includes('workbench-user-persona')
) {
  throw new Error('World persona selector should switch directly between user and character identities without editing persona text.');
}
if (
  !uiSource.includes('let worldRpActorId')
  || !uiSource.includes('function worldRpActor')
  || !uiSource.includes("document.querySelector<HTMLSelectElement>('[data-world-rp-actor]')")
  || !uiSource.includes('characterId: actor.characterId')
  || !uiSource.includes('speaker: actor.name')
) {
  throw new Error('World RP submissions should preserve the selected user/character speaker identity.');
}
if (
  !uiSource.includes('participantIds: string[]')
  || !uiSource.includes('leadActor')
  || !uiSource.includes('[data-event-participant]:checked')
  || !uiSource.includes('data-event-participant')
  || !uiSource.includes('data-event-composer-submit')
  || !uiSource.includes('eventComposerLeadActor')
  || !uiSource.includes('eventComposerParticipantIds')
  || uiSource.includes("fieldValue<HTMLSelectElement>('#event-participant-select')")
  || !uiSource.includes("mode: 'auto' | 'manual'")
  || !uiSource.includes('eventComposerDraft.mode')
) {
  throw new Error('World event composer should keep auto/manual modes, lead actor, and multiple participating characters.');
}
const generateEventHandlerBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#generate-event')")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-event-choice]')")[0] ?? '';
const eventComposerModeHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-event-composer-mode]').forEach")[1]
  ?.split("document.querySelector<HTMLFormElement>('#event-composer')")[0] ?? '';
const openEventComposerModeHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-open-event-composer-mode]').forEach")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-event-choice]')")[0] ?? '';
if (
  !generateEventHandlerBlock.includes('openEventComposer')
  || generateEventHandlerBlock.includes('generateWorldEvent(')
  || generateEventHandlerBlock.includes('modelIsReady()')
) {
  throw new Error('World generate-event button should open the unified event composer instead of generating immediately.');
}
if (
  !eventComposerModeHandlerBlock.includes('event.preventDefault();')
  || !eventComposerModeHandlerBlock.includes('event.stopPropagation();')
  || !openEventComposerModeHandlerBlock.includes('event.preventDefault();')
  || !openEventComposerModeHandlerBlock.includes('event.stopPropagation();')
) {
  throw new Error('Manual event buttons should guard against form/details default click handling on mobile.');
}
if (
  !uiSource.includes('data-event-composer-mode')
  || !uiSource.includes('data-open-event-composer-mode="manual"')
  || !uiSource.includes("openEventComposer(button.dataset.openEventComposerMode === 'manual' ? 'manual' : 'auto')")
  || !eventComposerDialogBlock.includes('手写事件')
  || !eventComposerDialogBlock.includes('event-manual-title')
  || !eventComposerDialogBlock.includes('event-manual-description')
  || !eventComposerDialogBlock.includes('event-manual-affinity')
  || worldStageComposerBlock.includes('data-world-rp-reply-mode')
  || worldStageComposerBlock.includes('手动记录')
  || uiSource.includes("document.querySelectorAll<HTMLButtonElement>('[data-world-rp-reply-mode]')")
  || uiSource.includes("if (worldRpReplyMode === 'manual')")
) {
  throw new Error('World event UI should expose manual event creation inside the same event composer, without reviving the old RP reply-mode switch.');
}
if (
  !eventComposerDialogBlock.includes('renderEventComposerLeadActor')
  || !eventComposerDialogBlock.includes('renderEventParticipantSelect')
  || !eventComposerDialogBlock.includes('data-event-composer-submit')
) {
  throw new Error('World event dialog should expose lead identity, participant picker, and one generated-event submit action.');
}
const eventComposerSubmitBlock = functionBody(uiSource, 'bindUi');
if (
  !eventComposerSubmitBlock.includes('createWorldEvent({')
  || !eventComposerSubmitBlock.includes("eventComposerDraft.mode === 'manual'")
  || !eventComposerSubmitBlock.includes('eventComposerLeadActor()')
  || !eventComposerSubmitBlock.includes('eventComposerParticipantIds()')
  || !eventComposerSubmitBlock.includes('generateWorldEvent(')
  || !eventComposerSubmitBlock.includes('activeWorldRpEventId = worldEvent.id')
  || !eventComposerSubmitBlock.includes('preserveScrollForNextRender()')
) {
  throw new Error('World event submit should support manual creation or auto generation, carry lead actor/participants, open RP detail, and preserve scroll.');
}
if (
  !privateChatContactCharactersBlock.includes('privateChatIdentityCharacter()')
  || !privateChatContactCharactersBlock.includes('character.id !== speaker.id')
  || !uiSource.includes('function groupChatVisibleForPrivateIdentity')
  || !uiSource.includes('function groupChatsForPrivateIdentity')
  || !renderGroupConversationRowsBlock.includes('groupChatsForPrivateIdentity()')
  || !uiSource.includes('function ensureGroupChatForSpeaker')
  || !uiSource.includes('ensureGroupChatForSpeaker();')
) {
  throw new Error('Character communication identity should hide its own private window while keeping shared group records visible.');
}
if (
  !eventsPageBlock.includes('renderWorldEventSettingsPanel({')
  || !worldSettingsPanelBlock.includes('renderWorldEventSettingsPanel({')
  || !worldEventSettingsPanelBlock.includes('event-settings-summary')
  || !worldEventSettingsPanelBlock.includes('event-settings-advanced')
  || !worldEventSettingsPanelBlock.includes('event-settings-recent')
  || !worldEventSettingsPanelBlock.includes('event-settings-generate')
  || !worldEventSettingsPanelBlock.includes('event-settings-action-row')
  || !worldEventSettingsPanelBlock.includes('renderEventSettingsSurfaceName')
  || !worldEventSettingsPanelBlock.includes('data-open-event-composer')
  || !worldEventSettingsPanelBlock.includes('auto-event-enabled')
  || !worldEventSettingsPanelBlock.includes('auto-event-min-hours')
  || !worldEventSettingsPanelBlock.includes('auto-event-max-hours')
  || !worldEventSettingsPanelBlock.includes('auto-event-daily-limit')
  || !worldEventSettingsPanelBlock.includes('auto-event-quiet-start')
  || !worldEventSettingsPanelBlock.includes('auto-event-quiet-end')
  || !styleSource.includes('.event-settings-panel')
  || !styleSource.includes('.event-settings-action-row')
) {
  throw new Error('World drawer and legacy event page should share one lightweight event settings panel.');
}
if (
  eventsPageBlock.includes('event-broadcast-card')
  || eventsPageBlock.includes('events-section-title')
  || worldSettingsPanelBlock.includes('renderWorldDrawerEvents')
  || worldSettingsPanelBlock.includes('renderWorldDrawerEventSchedule')
  || worldEventSettingsPanelBlock.includes('event-broadcast-card')
  || worldEventSettingsPanelBlock.includes('events-section-title')
  || worldEventSettingsPanelBlock.includes('renderEvents(events)')
) {
  throw new Error('Event settings surfaces should not keep the old broadcast-card or duplicated drawer event layouts.');
}
if (
  !worldWorkbenchBlock.includes('旁白 + 对话')
  || !worldWorkbenchBlock.includes('当前氛围')
  || worldWorkbenchBlock.includes('当前目标')
  || !worldWorkbenchBlock.includes('renderWorldEventLobby')
  || !worldWorkbenchBlock.includes('renderWorldEventRpDetail')
  || !worldWorkbenchBlock.includes('renderWorldSettingsPanel')
  || !worldEventLobbyBlock.includes('日常片段')
  || !worldEventLobbyBlock.includes('点击进入 RP')
  || !worldDialogueBody.includes('world-scene-note')
  || !styleSource.includes('.world-workbench')
  || !styleSource.includes('世界页 UI 重置层')
  || !styleSource.includes('.world-scene-note')
  || !styleSource.includes('.narrative-card')
  || !styleSource.includes('.dialogue-turn')
  || styleSource.includes('.world-lobby-scene')
  || styleSource.includes('.world-lobby-counts')
) {
  throw new Error('World workbench should render daily RP narration, dialogue, event, and world-setting surfaces.');
}
if (
  !worldWorkbenchBlock.includes('const selectedEvent = selectedWorldRpEvent()')
  || worldWorkbenchBlock.includes('ensureWorldRpEvent(character)')
  || !worldWorkbenchBlock.includes('selectedEvent')
  || !worldWorkbenchBlock.includes('? renderWorldEventRpDetail(selectedEvent, character)')
  || !worldWorkbenchBlock.includes(': renderWorldEventLobby(worldEvents, character)')
  || !worldWorkbenchBlock.includes("selectedEvent && selectedEvent.status !== 'resolved' ? renderWorldStageComposer(character)")
) {
  throw new Error('World page should default to the daily fragment list and only open RP detail after selecting an event.');
}
if (
  !worldEventDetailBlock.includes('aria-label="返回日常"')
  || !worldEventDetailBlock.includes('title="返回日常"')
  || !worldEventDetailBlock.includes("icon('back')")
  || worldEventDetailBlock.includes('>返回日常<')
) {
  throw new Error('World RP detail should use an icon-only return button with an accessible label.');
}
if (
  !worldEventLobbyBlock.includes('conversation-entry')
  || !worldEventLobbyBlock.includes('world-event-entry-main')
  || !worldEventLobbyBlock.includes('world-event-entry-meta')
  || !worldEventLobbyBlock.includes('world-event-entry-status')
  || worldEventLobbyBlock.includes('world-lobby-scene')
  || worldEventLobbyBlock.includes('world-lobby-counts')
  || worldEventLobbyBlock.includes('settings-kicker')
  || worldEventLobbyBlock.includes('手写记录')
) {
  throw new Error('World event lobby should read like a lightweight conversation list, not a management card stack.');
}
if (
  worldDialogueBody.includes('render-mode-switch')
  || worldDialogueBody.includes('data-world-rp-render-mode')
  || !worldSettingsPanelBlock.includes('renderWorldRenderModeSetting')
) {
  throw new Error('World RP render-mode controls should move out of the main reading stream into the settings drawer.');
}
// Big guard: the world entry must feel like an RP stage first. Event controls and timeline memory belong in the drawer, not in the main stream.
if (
  !uiSource.includes('id="world-rp-composer"')
  || !uiSource.includes('id="world-rp-input"')
  || !worldWorkbenchBlock.includes('renderWorldStageHeader')
  || !worldWorkbenchBlock.includes("selectedEvent && selectedEvent.status !== 'resolved' ? renderWorldStageComposer(character)")
  || !worldEventDetailBlock.includes('renderWorldDialogueStream')
  || !worldEventDetailBlock.includes('data-close-world-event-rp')
  || !worldEventLobbyBlock.includes('data-open-world-event-rp')
  || worldEventLobbyBlock.includes('renderWorldDialogueStream')
  || worldEventLobbyBlock.includes('id="world-rp-composer"')
  || worldWorkbenchBlock.includes('renderWorldEventSummary')
  || worldWorkbenchBlock.includes('world-timeline-panel')
  || !worldSettingsPanelBlock.includes('world-drawer-section')
  || !worldSettingsPanelBlock.includes('renderWorldEventSettingsPanel')
  || !worldSettingsPanelBlock.includes('renderWorldDrawerTimeline')
  || !uiSource.includes('activeWorldRpEventId')
  || !styleSource.includes('.world-stage-composer')
  || !styleSource.includes('.world-event-narration')
  || !styleSource.includes('.world-event-lobby')
  || !styleSource.includes('.world-drawer-section')
) {
  throw new Error('World tab should list daily/event entries first and open RP dialogue only after selecting one.');
}
if (
  !worldDialogueBody.includes('data-edit-world-rp-message')
  || !worldWorkbenchBlock.includes('renderWorldRpMessageEditDialog')
  || !appSource.includes('id="world-rp-message-edit-input"')
  || !appSource.includes('editWorldEventRpMessage')
) {
  throw new Error('World RP user actions should be editable from inside the event dialogue.');
}
if (
  !appSource.includes('function avatarToneForId')
  || !appSource.includes('function avatarToneAttribute')
  || !privateTargetSelectorBlock.includes('avatarToneAttribute(selectedCharacter)')
  || !worldPersonaSelectorBlock.includes('avatarToneAttribute(actor.character)')
  || !appSource.includes('renderEventAvatars')
  || !appSource.includes('avatarToneAttribute(character)')
  || !styleSource.includes('--social-sky-bg')
  || !styleSource.includes('--social-lavender-bg')
  || !styleSource.includes('--social-peach-bg')
  || !styleSource.includes('--social-amber-bg')
  || !styleSource.includes('[data-avatar-tone="sky"]')
  || !styleSource.includes('[data-avatar-tone="lavender"]')
  || !styleSource.includes('[data-avatar-tone="peach"]')
  || !styleSource.includes('[data-avatar-tone="amber"]')
) {
  throw new Error('Mobile social UI should use a restrained multi-tone palette for avatars and event participants instead of one flat accent color.');
}
if (
  !styleSource.includes('.world-event-detail-toolbar')
  || !styleSource.includes('position: sticky')
) {
  throw new Error('World RP return toolbar should stay visible instead of forcing users to scroll back to the top.');
}
if (
  !idleRenderBlock.includes("input.id === 'world-rp-input'")
  || !idleRenderBlock.includes('worldRpInputDraft = input.value')
  || !uiSource.includes("document.querySelector<HTMLTextAreaElement>('#world-rp-input')")
) {
  throw new Error('World RP input should be protected from idle scheduler refreshes and keyboard drops.');
}

console.log(JSON.stringify({
  migration: true,
  unreadMigration: true,
  importedOpeningRemoved: true,
  firstMessageIgnoredByPrompt: true,
  customAvatarPreserved: true,
  onlineChatPreset: true,
  stickerMarkerParsing: true,
  stickerScopesSeparated: true,
  relationshipPrompt: true,
  personalityPacing: true,
  budgetGate: true,
  noBackfill: true,
  momentNoBackfill: true,
  characterDeleteCascade: true,
  recalledContextPreserved: true,
  deletedContextRemoved: true,
  characterCardV3: true,
  characterSettingsWorldBook: true,
  stickerNotesForModel: true,
  unboundedAffinity: true,
  characterProfileNote: true,
  userPersona: true,
  timelineDefaults: true,
  characterInteractionDefaults: true,
  momentVisibilityDefaults: true,
  timelinePromptContext: true,
  realWorldDefault: true,
  worldWeatherContext: true,
  composerFocusAfterSubmit: true,
  groupComposerFocusAfterSubmit: true,
  composerControlsCentered: true,
  mobileEnterToSend: true,
  composerKeyboardKeepalive: true,
  characterIntroPromptProfileOnly: true,
  comfortableMessageSpacing: true,
  proactiveSettingsCharacterSelect: true,
  generatedMomentDraftPreserved: true,
  palTavernVisibleBranding: true,
  forceRestartServices: true,
  characterInteractionSettings: true,
  modelConnectionTest: true,
  mobileBackLayered: true,
  characterRelationshipPairs: true,
  characterRelationshipPrompt: true,
  characterRelationshipUi: true,
  characterRelationshipDeleteCascade: true,
  momentComposerKeyboardSafe: true,
  worldWorkbenchNavigation: true,
  worldWorkbenchNarrationMode: true,
  immersiveWorldStage: true,
}));
