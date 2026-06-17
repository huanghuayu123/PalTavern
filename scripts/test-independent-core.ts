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
const privateChatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/private-chat.ts'), 'utf8');
const modelClientSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/model/client.ts'), 'utf8');
const schedulerSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/automation/scheduler.ts'), 'utf8');
const eventsSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/social/events.ts'), 'utf8');
const directChatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/character-direct-chat.ts'), 'utf8');
const firstRunGuideSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/first-run-guide.ts'), 'utf8');
const cardImportDiagnosticsSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/card-import-diagnostics.ts'), 'utf8');
const androidMainActivitySource = fs.readFileSync(path.join(
  process.cwd(),
  'android/app/src/main/java/com/tavernsocial/app/MainActivity.java',
), 'utf8');
const worldDialogueBody = functionBody(appSource, 'renderWorldDialogueStream');
const worldRpMessageActionsBlock = functionBody(appSource, 'renderWorldRpMessageActions');
const worldComposerBindingBody = functionBody(appSource, 'bindUi');
const chatPaneRenderBlock = functionBody(appSource, 'renderChatPane');
const renderMessagesBlock = functionBody(appSource, 'renderMessages');
const mobileRenderBlock = functionBody(appSource, 'renderMobile');
const privateTargetSelectorBlock = functionBody(appSource, 'renderPrivateChatTargetSelector');
const renderGroupSpeakerPickerBlock = functionBody(appSource, 'renderGroupSpeakerPicker');
const renderMomentsBlock = functionBody(appSource, 'renderMoments');
const generateOpeningMessageBlock = sourceSlice(
  privateChatSource,
  'export async function generateOpeningMessage',
  'export async function sendUserMessageOnly',
);
const embeddedWorldBookContextBlock = functionBody(modelClientSource, 'embeddedWorldBookContext');
const buildPresetModelMessagesBlock = functionBody(modelClientSource, 'buildPresetModelMessages');
const buildModelMessagesBlock = sourceSlice(
  modelClientSource,
  'export function buildModelMessages',
  'async function refreshCharacterWorldWeather',
);
const worldMemoryContextForEventBlock = sourceSlice(
  eventsSource,
  'export function worldMemoryContextForEvent',
  'function worldPresetMarkerContent',
);
const appendWorldEventRpMessageBlock = functionBody(eventsSource, 'appendWorldEventRpMessage');
const editWorldEventRpMessageBlock = functionBody(eventsSource, 'editWorldEventRpMessage');
const detectPrivateChatEventSuggestionBlock = sourceSlice(
  eventsSource,
  'function privateEventDetectionMessages',
  'export function pendingPrivateChatEventSuggestionsForThread',
);
const schedulerAttemptCharacterBlock = sourceSlice(
  schedulerSource,
  'async function attemptCharacter(character',
  'function attemptBackgroundInteractions',
);
if (worldDialogueBody.includes('messagesFor(')) {
  throw new Error('World RP stream must not render private-chat messages.');
}
if (
  !eventsSource.includes('contextMemorySummariesFor')
  || !eventsSource.includes('worldMemoryContextForEvent')
  || !eventsSource.includes('upsertWorldRpTimelineEntry')
  || !eventsSource.includes('revokeWorldRpTimelineEntriesForEvent')
  || !worldMemoryContextForEventBlock.includes('contextMemorySummariesFor')
  || worldMemoryContextForEventBlock.includes('messagesFor(')
  || !worldMemoryContextForEventBlock.includes('共同长期记忆')
  || !appendWorldEventRpMessageBlock.includes('upsertWorldRpTimelineEntry')
  || !editWorldEventRpMessageBlock.includes('upsertWorldRpTimelineEntry')
  || !eventsSource.includes('revokeWorldRpTimelineEntriesForEvent(event.id)')
  || !eventsSource.includes('不读取原始私聊记录')
  || !eventsSource.includes('已进入世界记录/三层总结')
) {
  throw new Error('World RP should share approved long-term memory summaries without reading raw private chat history.');
}
if (
  !eventsSource.includes('PrivateChatEventSuggestion')
  || !eventsSource.includes('callAuthoringModel')
  || !eventsSource.includes('detectPrivateChatEventSuggestion')
  || !eventsSource.includes('createWorldEventFromPrivateChatSuggestion')
  || !eventsSource.includes('dismissPrivateChatEventSuggestion')
  || !eventsSource.includes('markPrivateChatEventSuggestionAccepted')
  || !detectPrivateChatEventSuggestionBlock.includes('只输出 JSON')
  || !detectPrivateChatEventSuggestionBlock.includes('接受前不得进入世界记录/世界上下文')
  || detectPrivateChatEventSuggestionBlock.includes('callModel(')
  || !privateChatSource.includes('detectPrivateChatEventSuggestion')
  || !directChatSource.includes('detectPrivateChatEventSuggestion')
  || !appSource.includes('renderPrivateChatEventSuggestionCard')
  || !appSource.includes('data-create-private-event-suggestion')
  || !appSource.includes('data-edit-private-event-suggestion')
  || !appSource.includes('data-dismiss-private-event-suggestion')
) {
  throw new Error('Private chat event suggestions should use the authoring JSON detector, stay out of world context until accepted, and expose confirmation actions.');
}
if (
  typeof chat.isOpeningMessageGenerating !== 'function'
  || !privateChatSource.includes('export function isOpeningMessageGenerating')
  || !renderMessagesBlock.includes('isOpeningMessageGenerating(character')
  || !renderMessagesBlock.includes('正在生成新消息')
) {
  throw new Error('New character opening-message generation should surface an in-chat generating hint.');
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
  || !appSource.includes('data-private-chat-identity-option')
  || !appSource.includes('openPrivateChatByCharacterId')
  || !appSource.includes("document.querySelectorAll<HTMLButtonElement>('[data-private-chat-identity-option]')")
  || !stateSource.includes('communicationIdentityByWorldId')
  || !stateSource.includes('function normalizeCommunicationIdentityByWorldId')
  || !stateSource.includes('export function communicationActorId')
  || !stateSource.includes('export function communicationActor')
  || !stateSource.includes('export function setCommunicationActor')
  || !appSource.includes("setCommunicationActor(activeWorld().id, selectedId || 'user')")
  || !appSource.includes('closeMessageDetailAfterCommunicationIdentityChange')
  || !appSource.includes('selectPrivateChatIdentity(selectedId)')
  || !appSource.includes("'.private-chat-identity-select[open]'")
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
  !appSource.includes('ensureCommunicationIdentityViewState();\n  const character = activeCharacter();')
  || !appSource.includes('content = renderChatPane(activePrivateChatTarget(), true);')
  || !chatPaneRenderBlock.includes('privateChatIdentityCharacter()?.id === character.id')
  || !stylesSource.includes('.message-row.is-authored-character .message.user')
  || !stylesSource.includes('.message-row.is-authored-character .message-speaker-label')
) {
  throw new Error('Private chat detail should never stay open on the current communication identity itself.');
}
if (
  !generateOpeningMessageBlock.includes('contextMessages: []')
  || !schedulerAttemptCharacterBlock.includes("contextMessages: messagesFor(character.id, 'user')")
  || !embeddedWorldBookContextBlock.includes('contextMessages')
  || embeddedWorldBookContextBlock.includes('messagesFor(character.id)')
  || !buildPresetModelMessagesBlock.includes('presetMarkerContent(prompt.identifier, character, includeAllWorldBook, contextMessages)')
  || !buildModelMessagesBlock.includes('embeddedWorldBookContext(character, contextMessages, includeAllWorldBook)')
) {
  throw new Error('Private chat model context must use the current conversation for openings, worldbook triggers, and proactive default-user messages.');
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
  appSource.includes('function renderMobileCharacterStoryStrip')
  || appSource.includes('${renderMobileCharacterStoryStrip()}')
  || appSource.includes('mobile-inbox-summary')
  || stylesSource.includes('.mobile-inbox-summary')
  || stylesSource.includes('.inbox-orbit')
) {
  throw new Error('Mobile inbox should keep the top identity selector and private messages without restoring the old story strip or daily-brief panel.');
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
character.stickers.push({
  id: 'sticker_wink',
  name: 'wink',
  note: 'quick wink expression',
  dataUrl: 'data:image/webp;base64,WINK',
  importedAt: Date.now(),
});
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
const fullwidthStickerChat = chatFormat.parseModelChatOutput('＜sticker:wink＞', character);
if (fullwidthStickerChat.length !== 1 || fullwidthStickerChat[0].stickerId !== 'sticker_wink') {
  throw new Error('Fullwidth sticker marker parsing failed.');
}
const unknownStickerOnly = chatFormat.parseModelChatOutput('＜sticker:xxx＞', character);
if (unknownStickerOnly.length !== 0) {
  throw new Error('Unknown sticker markers should not leak into visible chat text.');
}
const unknownStickerWithText = chatFormat.parseModelChatOutput('稍等一下 ＜sticker:xxx＞', character);
if (
  unknownStickerWithText.length !== 1
  || unknownStickerWithText[0].content !== '稍等一下'
  || unknownStickerWithText[0].content.includes('sticker:')
) {
  throw new Error('Unknown inline sticker markers should be stripped from fallback text.');
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
stateModule.state.moments.push({
  id: 'delete_comment_moment',
  worldId: deleteTarget.worldId,
  characterId: relationshipPeer.id,
  content: 'Surviving moment with a deleted character comment.',
  createdAt: Date.now(),
  source: 'character',
  comments: [{
    id: 'delete_comment',
    momentId: 'delete_comment_moment',
    authorType: 'character',
    characterId: deleteTarget.id,
    content: 'This character comment should be removed.',
    createdAt: Date.now(),
    source: 'model',
  }, {
    id: 'delete_comment_reply',
    momentId: 'delete_comment_moment',
    authorType: 'user',
    characterId: '',
    replyToCommentId: 'delete_comment',
    content: 'This dangling reply should be removed too.',
    createdAt: Date.now(),
    source: 'manual',
  }],
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
  || stateModule.state.moments.some((item: { comments: Array<{ characterId: string; replyToCommentId?: string }> }) =>
    item.comments.some(comment =>
      comment.characterId === deleteTarget.id || comment.replyToCommentId === 'delete_comment',
    ),
  )
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
const isolatedContextCharacter = {
  ...stateModule.defaultState().characters[0],
  id: 'isolated_context_target',
  worldId: 'world_lore_test',
  name: 'Context Target',
  relationship: {
    stage: 'familiar',
    affinity: 22,
    summary: 'RELATIONSHIP_SUMMARY_ALLOWED',
    updatedAt: Date.now(),
  },
  characterBook: {
    entries: [
      {
        uid: 1,
        comment: 'Default leak lore',
        keys: ['keyword_default_only'],
        content: 'DEFAULT_WORLDBOOK_SHOULD_NOT_APPEAR',
        enabled: true,
      },
      {
        uid: 2,
        comment: 'Current actor lore',
        keys: ['keyword_actor_only'],
        content: 'ACTOR_WORLDBOOK_SHOULD_APPEAR',
        enabled: true,
      },
    ],
  },
};
const isolatedContextActor = {
  ...stateModule.defaultState().characters[0],
  id: 'isolated_context_actor',
  worldId: 'world_lore_test',
  name: 'Context Actor',
};
stateModule.state.characters = [isolatedContextCharacter, isolatedContextActor];
stateModule.state.conversations = [];
stateModule.state.messages = [];
stateModule.state.chatPromptPresetEnabled = false;
stateModule.state.activeChatPromptPresetId = '';
const defaultConversation = stateModule.ensureConversation(isolatedContextCharacter, 'user');
const actorConversation = stateModule.ensureConversation(isolatedContextCharacter, isolatedContextActor.id);
stateModule.state.messages.push(
  {
    id: 'default_context_message',
    conversationId: defaultConversation.id,
    characterId: isolatedContextCharacter.id,
    role: 'user',
    content: 'DEFAULT_CHAT_SHOULD_NOT_LEAK keyword_default_only',
    createdAt: Date.now(),
    source: 'user',
  },
  {
    id: 'actor_context_message',
    conversationId: actorConversation.id,
    characterId: isolatedContextCharacter.id,
    role: 'user',
    speakerType: 'character',
    speakerCharacterId: isolatedContextActor.id,
    content: 'ACTOR_CONTEXT_SHOULD_APPEAR keyword_actor_only',
    createdAt: Date.now() + 1,
    source: 'user',
  },
);
stateModule.state.timelineEntries = [{
  id: 'timeline_context_allowed',
  worldId: 'world_lore_test',
  createdAt: Date.now() + 2,
  type: 'manual_note',
  characterIds: [isolatedContextCharacter.id],
  characterNames: { [isolatedContextCharacter.id]: isolatedContextCharacter.name },
  title: 'TIMELINE_TITLE_ALLOWED',
  summary: 'TIMELINE_SUMMARY_ALLOWED',
  source: { type: 'manual', id: 'timeline_context_allowed' },
  canUndo: false,
  includeInContext: true,
}];
stateModule.state.characterStatuses = [{
  id: 'status_context_allowed',
  worldId: 'world_lore_test',
  characterId: isolatedContextCharacter.id,
  mood: 'STATUS_MOOD_ALLOWED',
  relationshipStage: 'familiar',
  affinity: 22,
  relationshipSummary: 'STATUS_RELATIONSHIP_ALLOWED',
  recentMemoryTitles: [],
  unresolvedItems: ['STATUS_ITEM_ALLOWED'],
  nextInclination: 'STATUS_NEXT_ALLOWED',
  activeSources: [],
  summary: 'STATUS_SUMMARY_ALLOWED',
  source: 'model',
  updatedAt: Date.now() + 3,
}];
stateModule.state.dailyBriefs = [{
  id: 'brief_context_allowed',
  worldId: 'world_lore_test',
  dateKey: '2026-06-13',
  title: 'DAILY_BRIEF_TITLE_ALLOWED',
  summary: 'DAILY_BRIEF_SUMMARY_ALLOWED',
  sections: ['DAILY_BRIEF_SECTION_ALLOWED'],
  suggestedCharacterIds: [isolatedContextCharacter.id],
  unreadCount: 0,
  changeCount: 1,
  createdAt: Date.now() + 4,
  updatedAt: Date.now() + 4,
}];
const isolatedContextPrompt = model.buildModelMessages(
  isolatedContextCharacter,
  '',
  false,
  true,
  stateModule.messagesFor(isolatedContextCharacter.id, isolatedContextActor.id),
  true,
).map((message: any) => message.content).join('\n');
for (const required of [
  'ACTOR_CONTEXT_SHOULD_APPEAR',
  'ACTOR_WORLDBOOK_SHOULD_APPEAR',
  'RELATIONSHIP_SUMMARY_ALLOWED',
  'TIMELINE_SUMMARY_ALLOWED',
  'STATUS_SUMMARY_ALLOWED',
  'DAILY_BRIEF_SUMMARY_ALLOWED',
]) {
  if (!isolatedContextPrompt.includes(required)) {
    throw new Error(`Current private conversation context should keep required summary or message: ${required}`);
  }
}
for (const forbidden of [
  'DEFAULT_CHAT_SHOULD_NOT_LEAK',
  'DEFAULT_WORLDBOOK_SHOULD_NOT_APPEAR',
]) {
  if (isolatedContextPrompt.includes(forbidden)) {
    throw new Error(`Private conversation context leaked data from another independent chat: ${forbidden}`);
  }
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
const coreTypesSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/core/types.ts'), 'utf8');
const authoringUiSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/authoring-ui.ts'), 'utf8');
const transitionsPath = path.join(process.cwd(), 'src/independent-chat/ui/transitions.ts');
const transitionsSource = fs.existsSync(transitionsPath)
  ? fs.readFileSync(transitionsPath, 'utf8')
  : '';
const iconsPath = path.join(process.cwd(), 'src/independent-chat/ui/icons.ts');
const iconsSource = fs.existsSync(iconsPath)
  ? fs.readFileSync(iconsPath, 'utf8')
  : '';
const chatSurfacePath = path.join(process.cwd(), 'src/independent-chat/ui/chat-surface.ts');
const chatSurfaceSource = fs.existsSync(chatSurfacePath)
  ? fs.readFileSync(chatSurfacePath, 'utf8')
  : '';
const modelSettingsPath = path.join(process.cwd(), 'src/independent-chat/ui/model-settings.ts');
const modelSettingsSource = fs.existsSync(modelSettingsPath)
  ? fs.readFileSync(modelSettingsPath, 'utf8')
  : '';
const settingsUiPath = path.join(process.cwd(), 'src/independent-chat/ui/settings-ui.ts');
const settingsUiSource = fs.existsSync(settingsUiPath)
  ? fs.readFileSync(settingsUiPath, 'utf8')
  : '';
const packageSource = fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');
const displayLabelsPath = path.join(process.cwd(), 'src/independent-chat/ui/display-labels.ts');
const displayLabelsSource = fs.existsSync(displayLabelsPath)
  ? fs.readFileSync(displayLabelsPath, 'utf8')
  : '';
const worldWorkbenchPanelsPath = path.join(process.cwd(), 'src/independent-chat/ui/world-workbench-panels.ts');
const worldWorkbenchPanelsSource = fs.existsSync(worldWorkbenchPanelsPath)
  ? fs.readFileSync(worldWorkbenchPanelsPath, 'utf8')
  : '';
const deletedWorldFeaturePaths = [
  'src/independent-chat/memory/suggestions.ts',
  'src/independent-chat/world/chapters.ts',
  'scripts/test-memory-suggestions.ts',
  'scripts/test-world-chapters.ts',
].map(relativePath => path.join(process.cwd(), relativePath));
const chatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/private-chat.ts'), 'utf8');
const groupChatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/group-chat.ts'), 'utf8');
const timelineMemorySource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/memory/timeline.ts'), 'utf8');
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
const replyStrategyRegenerateBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#regenerate-character-reply-strategy')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#save-chat-reply-mode')")[0] ?? '';
const characterPanelReplyStrategyRegenerateBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#regenerate-character-panel-reply-strategy')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#save-character-panel')")[0] ?? '';
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
const closeMessageActionMenuBlock = uiSource
  .split('function closeMessageActionMenuInPlace')[1]
  ?.split('function closeGroupMessageActionMenuInPlace')[0] ?? '';
const closeGroupMessageActionMenuBlock = uiSource
  .split('function closeGroupMessageActionMenuInPlace')[1]
  ?.split('function resizeComposerTextarea')[0] ?? '';
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
const restoreUiSessionSnapshotBlock = functionBody(uiSource, 'restoreUiSessionSnapshot');
const openPrivateChatByCharacterIdBlock = sourceSlice(
  uiSource,
  'function openPrivateChatByCharacterId',
  'function renderChatStatusShelf',
);
const settleChatScrollBlock = uiSource
  .split('function settleChatScrollAfterRender')[1]
  ?.split('function deleteActiveCharacterFromUi')[0] ?? '';
const currentScrollContainerBlock = functionBody(uiSource, 'currentScrollContainer');
const currentScrollKeyBlock = functionBody(uiSource, 'currentScrollKey');
const compactMediaDeclaration = uiSource
  .split('const compactMedia = window.matchMedia(')[1]
  ?.split(');')[0] ?? '';
const mainNavItemsBlock = uiSource
  .split('const MAIN_NAV_ITEMS')[1]
  ?.split('const BOTTOM_NAV_PRESS_MS')[0] ?? '';
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
const groupChatRowOpenBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-group-chat-id]').forEach")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#create-group-chat')")[0] ?? '';
const closeMobileGroupChatBlock = closeMobileLayerBlock
  .split('if (mobileGroupChatOpen)')[1]
  ?.split('if (mobileSettingsDetail)')[0] ?? '';
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
const renderMomentsPageBlock = uiSource
  .split('function renderMomentsPage')[1]
  ?.split('function renderMomentsTutorial')[0] ?? '';
const momentCommentFormMarkupBlock = uiSource
  .split('<form class="moment-comment-form')[1]
  ?.split('</form>')[0] ?? '';
const openMomentsTutorialHandlerBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#open-moments-tutorial')?.addEventListener('click'")[1]
  ?.split("document.querySelectorAll<HTMLButtonElement>('[data-close-moments-tutorial]')")[0] ?? '';
const openMomentComposerHandlerBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#open-moment-composer')?.addEventListener('click'")[1]
  ?.split('const closeMomentComposer = () => {')[0] ?? '';
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
const startStaggeredUiTransitionBlock = transitionsSource
  .split('function startStaggeredUiTransition')[1]
  ?.split('function overlayExitTargets')[0] ?? '';
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
if (
  worldWorkbenchBlock.includes('${renderMemorySummaryDrawer()}')
  || !worldWorkbenchBlock.includes("const memorySummaryDrawer = worldInsightTab === 'events' && selectedEvent ? '' : renderMemorySummaryDrawer();")
  || !worldWorkbenchBlock.includes('${memorySummaryDrawer}')
) {
  throw new Error('World event detail should not render the memory drawer in the main stream.');
}
const worldEventLobbyBlock = uiSource
  .split('function renderWorldEventLobby')[1]
  ?.split('function renderWorldDialogueStream')[0] ?? '';
const onboardingLayerBlock = uiSource
  .split('function renderOnboardingLayer')[1]
  ?.split('function renderGlobalStatus')[0] ?? '';
const worldEventDetailBlock = uiSource
  .split('function renderWorldEventRpDetail')[1]
  ?.split('function renderWorldStageComposer')[0] ?? '';
const privateEventSuggestionCardBlock = uiSource
  .split('function renderPrivateChatEventSuggestionCard')[1]
  ?.split('function openEventComposerFromPrivateSuggestion')[0] ?? '';
const memorySummaryCardBlock = uiSource
  .split('function renderMemorySummaryCard')[1]
  ?.split('function renderMemorySummaryGroup')[0] ?? '';
const worldDialogueInPageGuardBlock = styleSource
  .split('/* World RP dialogue in-page guard. */')[1]
  ?.split('/* Event choice border cleanup guard. */')[0] ?? '';
const eventChoiceBorderCleanupBlock = styleSource
  .split('/* Event choice border cleanup guard. */')[1]
  ?.split('/*')[0] ?? '';
const eventDeleteHandlerBlock = uiSource
  .split("document.querySelectorAll<HTMLButtonElement>('[data-delete-event]').forEach")[1]
  ?.split('function bindUi')[0] ?? '';
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
const deleteActiveCharacterFromUiBlock = functionBody(uiSource, 'deleteActiveCharacterFromUi');
const scrollMessagesToBottomBlock = functionBody(uiSource, 'scrollMessagesToBottom');
const renderBlock = uiSource
  .split('export function render(): void')[1]
  ?.split('export function renderWhenChatInputIdle')[0] ?? '';
const setRevealMaskBlock = functionBody(transitionsSource, 'setRevealMask');
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
const renderTabletLandscapeBlock = sourceSlice(
  uiSource,
  'function renderTabletLandscape(character?: CharacterProfile)',
  'function renderMobile(character?: CharacterProfile)',
);
const renderTabletLandscapeContentBlock = functionBody(uiSource, 'renderTabletLandscapeContent');
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
const privateMessageSwipeBlock = sourceSlice(
  uiSource,
  "document.querySelectorAll<HTMLElement>('[data-message-id]').forEach",
  "document.querySelector<HTMLButtonElement>('#toggle-stickers')",
);
const privateMessageBaseStyleBlock = sourceSlice(
  styleSource,
  '.message {\n',
  '.message.user {',
);
const privateMessageRowGridStyleBlock = sourceSlice(
  styleSource,
  '.message-row {\n  display: grid;',
  '.message-row.user {',
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
  "document.querySelectorAll<HTMLButtonElement>('[data-moment-comment-tap]').forEach",
  "document.querySelectorAll<HTMLButtonElement>('[data-clear-comment-reply]').forEach",
);
const authoringStepHandlerBlock = sourceSlice(
  authoringUiSource,
  "document.querySelectorAll<HTMLButtonElement>('[data-authoring-step]').forEach",
  "document.querySelector<HTMLButtonElement>('#authoring-previous')",
);
const privateChatContactCharactersBlock = functionBody(uiSource, 'privateChatContactCharacters');
const renderGroupConversationRowsBlock = functionBody(uiSource, 'renderGroupConversationRows');
const appendGroupMessageBlock = sourceSlice(groupChatSource, 'function appendGroupMessage', 'export function sendGroupUserMessage');
const eventsPageBlock = functionBody(uiSource, 'renderEventsPage');
const eventComposerDialogBlock = functionBody(uiSource, 'renderEventComposerDialog');
const worldEventSettingsPreviewBlock = functionBody(uiSource, 'renderWorldEventSettingsPreview');
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
  !timelineMemorySource.includes('export function upsertGroupChatSegmentTimelineEntry')
  || !timelineMemorySource.includes('groupChatSegmentTimelineSourceId')
  || !appendGroupMessageBlock.includes('syncGroupSegmentTimeline(chat, message)')
  || !groupChatSource.includes('upsertGroupChatSegmentTimelineEntry(chat, groupSegmentMessages(chat, anchor))')
  || appendGroupMessageBlock.includes('addTimelineEntry({')
  || !groupChatSource.includes('function groupSegmentAnchor')
  || !groupChatSource.includes('function rebuildGroupChatSegmentTimeline')
) {
  throw new Error('Group chat memory should be upserted as conversation segments instead of one timeline entry per message.');
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
  || !composerSubmitBlock.includes('isCompactViewport()')
  || !composerSubmitBlock.includes("requestMessageComposerFocusAfterSubmit(character?.id ?? '');")
  || !groupComposerSubmitBlock.includes('requestGroupComposerFocusAfterSubmit(chat.id);')
  || !uiSource.includes('COMPOSER_FOCUS_KEEPALIVE_MS')
) {
  throw new Error('Composer focus should be kept alive across mobile re-renders after sending.');
}
if (
  !uiSource.includes('function renderOnboardingLayer')
  || !onboardingLayerBlock.includes('if (modelOnboardingOpen) return renderModelOnboarding();')
  || !onboardingLayerBlock.includes('if (timeModeOnboardingOpen) return renderTimeModeOnboarding();')
  || !onboardingLayerBlock.includes('if (chatReplyModeOnboardingOpen) return renderChatReplyModeOnboarding();')
  || !renderBlock.includes('const onboardingLayer = welcomeCoverOpen')
  || !renderBlock.includes(': renderOnboardingLayer();')
  || renderBlock.includes('${renderModelOnboarding()}${renderTimeModeOnboarding()}${renderChatReplyModeOnboarding()}')
) {
  throw new Error('First-run onboarding should render one ordered mobile-friendly layer at a time.');
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
  || !closeMessageActionMenuBlock.includes("'.message-row.has-actions-open-above'")
  || !closeMessageActionMenuBlock.includes("row.classList.remove('has-actions-open-above')")
  || !closeGroupMessageActionMenuBlock.includes("'.group-message.is-actions-open-above'")
  || !closeGroupMessageActionMenuBlock.includes("message.classList.remove('is-actions-open-above')")
) {
  throw new Error('Message action menus should open above, anchor the tapped bubble, and clear row spacing on in-place close.');
}
if (
  !privateMessageSwipeBlock.includes("row?.classList.add('is-swiping')")
  || !privateMessageSwipeBlock.includes("row?.classList.add('is-returning')")
  || !privateMessageSwipeBlock.includes("row?.style.setProperty('--message-swipe-x'")
  || !privateMessageSwipeBlock.includes("row?.style.setProperty('--swipe-progress'")
  || privateMessageSwipeBlock.includes("message.classList.add('is-swiping')")
  || privateMessageSwipeBlock.includes("message.style.setProperty('--message-swipe-x'")
  || !privateMessageRowGridStyleBlock.includes('transform: translateX(var(--message-swipe-x, 0))')
  || !styleSource.includes('.message-row.is-swiping')
  || !styleSource.includes('.message-row.is-returning')
  || privateMessageBaseStyleBlock.includes('transform: translateX(var(--message-swipe-x, 0))')
  || styleSource.includes('.message.is-swiping')
  || styleSource.includes('.message.is-returning')
) {
  throw new Error('Private message swipe should move the whole message row so avatar, bubble, and quote indicator travel together.');
}
if (
  !restoreScrollBlock.includes('window.setTimeout(() => applyScrollSnapshot(snapshot), 0)')
  || !restoreScrollBlock.includes('动作菜单和图片可能在首轮布局后再改变高度')
) {
  throw new Error('Scroll restoration should run a second pass after message action layout settles.');
}
if (
  !uiSource.includes('function requestConversationOpenAtBottom')
  || !openPrivateChatByCharacterIdBlock.includes('requestConversationOpenAtBottom();')
  || !restoreUiSessionSnapshotBlock.includes('isSessionScrollSnapshotRestorable(parsed.scroll)')
  || !restoreUiSessionSnapshotBlock.includes('requestChatStickToBottom();')
  || !uiSource.includes("snapshot.key !== 'messages'")
  || !uiSource.includes("!snapshot.key.startsWith('groups:')")
) {
  throw new Error('Opening or restoring chat conversations should default to the latest message instead of replaying a stale saved scroll position.');
}
if (
  !compactMediaDeclaration.includes('(max-height: 560px) and (orientation: landscape)')
  || !uiSource.includes("type LayoutMode = 'mobile' | 'tabletLandscape' | 'desktop'")
  || !uiSource.includes('const tabletLandscapeMedia = window.matchMedia')
  || !uiSource.includes('(min-width: 900px)')
  || !uiSource.includes('(min-height: 600px)')
  || !uiSource.includes('(max-width: 1368px)')
  || !uiSource.includes('function hasTabletTouchInput(): boolean')
  || !uiSource.includes('navigatorInfo?.maxTouchPoints')
  || !uiSource.includes('/Android|iPad|Tablet/i.test(userAgent)')
  || !uiSource.includes('/Macintosh/i.test(userAgent) && touchPoints > 1')
  || !uiSource.includes('function isTabletLandscapeViewport(): boolean')
  || !uiSource.includes('tabletLandscapeMedia.matches && hasTabletTouchInput()')
  || !uiSource.includes('function isCompactViewport(): boolean')
  || !uiSource.includes('function getViewportLayoutMode(): LayoutMode')
  || !uiSource.includes("layoutMode === 'tabletLandscape'")
  || !uiSource.includes('tabletLandscapeMedia.addEventListener')
  || !styleSource.includes('@media (max-height: 560px) and (orientation: landscape)')
  || !styleSource.includes('.mobile-chat-detail .chat-header')
  || !styleSource.includes('.mobile-chat-detail .chat-status-expanded')
  || !styleSource.includes('.mobile-chat-detail .composer')
) {
  throw new Error('Short phone landscape should stay compact while tablet landscape uses its own layout mode.');
}
if (
  !renderTabletLandscapeBlock.includes('tablet-landscape-shell')
  || !renderTabletLandscapeBlock.includes('renderTabletLandscapeNav()')
  || !renderTabletLandscapeBlock.includes('renderTabletLandscapeContent(character)')
  || renderTabletLandscapeBlock.includes('bottom-nav')
  || !renderTabletLandscapeContentBlock.includes('renderTabletLandscapeInbox()')
  || !renderTabletLandscapeContentBlock.includes('renderTabletLandscapeContacts()')
  || !renderTabletLandscapeContentBlock.includes('renderTabletLandscapeGroups()')
  || !styleSource.includes('.tablet-landscape-shell')
  || !styleSource.includes('.tablet-landscape-nav')
  || !styleSource.includes('grid-template-columns: clamp(300px, 34vw, 390px) minmax(0, 1fr)')
  || !styleSource.includes('.tablet-landscape-detail .header-back')
) {
  throw new Error('Tablet landscape should render a dedicated left-rail shell with split chat surfaces and no bottom nav.');
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
if (
  renderMomentsPageBlock.indexOf('<section class="moments-scroll">') < 0
  || renderMomentsPageBlock.indexOf('${renderMomentComposerLauncher()}') < 0
  || renderMomentsPageBlock.indexOf('${renderMomentComposerLauncher()}') < renderMomentsPageBlock.indexOf('</section>')
) {
  throw new Error('Moment compose FAB should render outside the animated moments scroll container to avoid fixed-position drift during tab transitions.');
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
  || !uiSource.includes('async function generateCharacterReplyStrategy')
  || !uiSource.includes('buildCharacterReplyStrategyMessages(character)')
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
  || !replyStrategyRegenerateBlock.includes('void regenerateReplyStrategyForCharacter(')
  || !characterPanelReplyStrategyRegenerateBlock.includes('void regenerateReplyStrategyForCharacter(')
  || replyStrategyRegenerateBlock.includes('createCharacterReplyStrategy(character)')
  || characterPanelReplyStrategyRegenerateBlock.includes('createCharacterReplyStrategy(character)')
  || replyStrategySaveBlock.includes('state.chatReplyMode')
) {
  throw new Error('Reply strategy settings should use AI generation scoped to a selected character instead of local templates or global chat settings.');
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
  !characterSettingsPageBlock.includes('id="delete-character-panel"')
  || !uiSource.includes("document.querySelector<HTMLButtonElement>('#delete-character-panel')")
  || !uiSource.includes("document.querySelector<HTMLButtonElement>('#delete-character')")
  || !deleteActiveCharacterFromUiBlock.includes('deleteCharacter(character.id)')
  || !deleteActiveCharacterFromUiBlock.includes('characterPanelOpen = false;')
  || !deleteActiveCharacterFromUiBlock.includes("characterPanelPage = 'worldbook';")
  || !deleteActiveCharacterFromUiBlock.includes('mobileChatOpen = false;')
) {
  throw new Error('Deleting a character should be available from the character panel and close active character UI safely.');
}
if (
  !settingsUiSource.includes('export function renderSettingsFold(')
  || !settingsUiSource.includes('class="settings-fold"')
  || !settingsUiSource.includes('export function renderSwitchControl')
  || !settingsUiSource.includes('export function renderPromptRoleOptions')
  || !settingsUiSource.includes('export function renderParameterSummary')
  || !uiSource.includes("from './settings-ui'")
  || uiSource.includes('function renderSettingsFold(')
  || uiSource.includes('function renderSwitchControl(')
  || uiSource.includes('function renderPromptRoleOptions(')
  || uiSource.includes('function renderParameterSummary(')
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
  !indexHtmlSource.includes('<title>PalTavern</title>')
  || !uiSource.includes('<div class="brand"><h1>PalTavern</h1>')
  || !uiSource.includes('<span class="settings-kicker">PalTavern</span><h1>设置中心</h1>')
  || !uiSource.includes('<span class="eyebrow">PalTavern</span><h1>设置</h1>')
  || uiSource.includes('<div class="brand"><h1>Tavern Social</h1>')
) {
  throw new Error('Visible app shell branding should use PalTavern instead of Tavern Social.');
}
if (
  !appSource.includes("from './first-run-guide'")
  || !appSource.includes("from './card-import-diagnostics'")
  || appSource.includes('function renderFirstRunGuide(')
  || appSource.includes('function renderCardImportDiagnostics(')
  || !firstRunGuideSource.includes('export function renderFirstRunGuide')
  || !firstRunGuideSource.includes('export function shouldShowFirstRunGuide')
  || !cardImportDiagnosticsSource.includes('export function renderCardImportDiagnostics')
) {
  throw new Error('V1 first-run and import diagnostics render helpers should live outside app.ts.');
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
  || !mobileGroupListBackButtonBlock.includes('closeMobileGroupListWithTransition();')
) {
  throw new Error('Mobile navigation should push section history and keep visible back buttons on the intended back/close path.');
}
if (
  groupChatRowOpenBlock.includes("mobileSection = 'groups';")
  || closeMobileGroupChatBlock.includes("mobileSection = 'groups';")
  || !closeMobileGroupChatBlock.includes("if (mobileSection !== 'groups') setActiveView('chat');")
) {
  throw new Error('Mobile group chat back should return to the opening inbox instead of forcing the group list.');
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
if (false && (
  !uiSource.includes('data-moment-comment-tap')
  || !uiSource.includes('data-moment-comment-menu')
  || !uiSource.includes('moment-comment-actions')
  || !uiSource.includes('data-open-comment-character-reply')
  || !uiSource.includes('data-submit-comment-character-reply')
  || !uiSource.includes('楼主回复')
  || !uiSource.includes('选角色回复')
  || uiSource.includes('data-reply-comment=')
  || !uiSource.includes('data-author-reply-comment')
  || uiSource.includes('class="moment-comment-reply"')
  || !styleSource.includes('.moment-comment-actions')
  || !momentCommentFormMarkupBlock.includes('class="secondary moment-comment-submit"')
  || !momentCommentFormMarkupBlock.includes('moment-comment-inline-form')
  || !momentCommentFormMarkupBlock.includes('aria-label="发送评论"')
  || !momentCommentFormMarkupBlock.includes("${icon('send')}")
  || momentCommentFormMarkupBlock.includes('>发送</button>')
  || !styleSource.includes('grid-template-columns: minmax(96px, 0.28fr) minmax(0, 1fr) 44px')
  || !styleSource.includes('Moment comment inline layout guard')
  || !styleSource.includes('grid-template-columns: clamp(58px, 14%, 86px) minmax(0, 1fr) 44px')
  || styleSource.includes('.moment-comment-form select {\n    grid-column: 1 / -1;')
)) {
  throw new Error('Moment comments should use tap-to-reply plus long-press action menus instead of always-visible action buttons.');
}
if (
  !uiSource.includes('data-moment-comment-tap')
  || !uiSource.includes('moment-comment-actions')
  || !uiSource.includes('data-moment-comment-reply-action')
  || !uiSource.includes('data-open-comment-character-reply')
  || !uiSource.includes('data-submit-comment-character-reply')
  || !uiSource.includes('data-author-reply-comment')
  || !uiSource.includes('data-delete-comment')
  || !uiSource.includes('moment-comment-action-primary')
  || !uiSource.includes('moment-comment-action-muted')
  || !uiSource.includes('moment-comment-action-danger')
  || !uiSource.includes('moment-comment-reply-select')
  || !uiSource.includes('moment-comment-reply-submit')
  || !uiSource.includes('data-comment-actor-select')
  || !uiSource.includes('setCommunicationActor(moment.worldId, selectedActorId)')
  || momentCommentFormMarkupBlock.includes('moment-comment-author-chip')
  || !momentCommentFormMarkupBlock.includes('<select class="moment-comment-author-select"')
  || uiSource.includes('role="button" tabindex="0" data-moment-comment-tap')
  || !uiSource.includes('document.querySelectorAll<HTMLButtonElement>(\'[data-moment-comment-tap]\')')
  || uiSource.includes('data-reply-comment=')
  || uiSource.includes('class="moment-comment-reply"')
  || !styleSource.includes('.moment-comment-actions')
  || !styleSource.includes('.moment-comment-character-reply')
  || !styleSource.includes('.moment-comment-actions button')
  || !styleSource.includes('.moment-comment-action-primary')
  || !styleSource.includes('.moment-comment-action-danger')
  || !styleSource.includes('.moment-comment-actions .moment-comment-action + .moment-comment-action::before')
  || !styleSource.includes('text-underline-offset: 3px')
  || !styleSource.includes('.moment-comment-reply-submit')
  || !styleSource.includes('width: min(100%, 340px)')
  || !styleSource.includes('box-shadow: none')
  || !styleSource.includes('.moment-comment-author-select')
  || !styleSource.includes('grid-template-columns: clamp(58px, 14%, 86px) minmax(0, 1fr) 44px')
  || !momentCommentFormMarkupBlock.includes('class="secondary moment-comment-submit"')
  || !momentCommentFormMarkupBlock.includes('moment-comment-inline-form')
  || !momentCommentFormMarkupBlock.includes('aria-label="发送评论"')
  || !momentCommentFormMarkupBlock.includes("${icon('send')}")
  || momentCommentFormMarkupBlock.includes('>发送</button>')
  || !styleSource.includes('grid-template-columns: minmax(96px, 0.28fr) minmax(0, 1fr) 44px')
  || !styleSource.includes('Moment comment inline layout guard')
  || !styleSource.includes('grid-template-columns: clamp(58px, 14%, 86px) minmax(0, 1fr) 44px')
  || styleSource.includes('.moment-comment-form select {\n    grid-column: 1 / -1;')
) {
  throw new Error('Moment comments should expose reply as a real action button instead of nesting buttons inside a clickable comment row.');
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
if (
  !cssBlock('.moments-tutorial-overlay').includes('z-index: calc(var(--z-modal) + 30)')
  || !openMomentsTutorialHandlerBlock.includes('momentComposerOpen = false;')
  || !openMomentsTutorialHandlerBlock.includes('resetMomentComposerKeyboardState();')
  || !openMomentComposerHandlerBlock.includes('momentsTutorialOpen = false;')
) {
  throw new Error('Moments tutorial should sit above and dismiss the publish moment floating window.');
}
// 大注释：世界工作台导航契约。主入口只暴露消息、角色、世界、动态、设置；事件和时间线只作为世界内部能力出现。
if (
  !uiSource.includes("type MobileSection = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings'")
  || !desktopViewControlsBlock.includes('data-view="world"')
  || !desktopViewControlsBlock.includes('>世界<')
  || desktopViewControlsBlock.includes('data-view="events"')
  || desktopViewControlsBlock.includes('data-view="timeline"')
  || !mainNavItemsBlock.includes("id: 'messages', label: '消息'")
  || !mainNavItemsBlock.includes("id: 'contacts', label: '角色'")
  || !mainNavItemsBlock.includes("id: 'world', label: '世界'")
  || !mainNavItemsBlock.includes("id: 'moments', label: '动态'")
  || !mainNavItemsBlock.includes("id: 'settings', label: '设置'")
  || mainNavItemsBlock.includes("id: 'events'")
  || mainNavItemsBlock.includes("id: 'timeline'")
  || !mobileBottomNavBlock.includes('MAIN_NAV_ITEMS.map')
  || !renderTabletLandscapeBlock.includes('renderTabletLandscapeNav()')
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
  !transitionsSource.includes("export type UiTransitionKind = 'main-forward' | 'main-back' | 'world-forward' | 'world-back' | 'detail-in' | 'detail-out' | 'overlay-in' | 'overlay-out' | 'quiet'")
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
  !scrollMessagesToBottomBlock.includes('const previousBehavior = messages.style.scrollBehavior;')
  || !scrollMessagesToBottomBlock.includes("messages.style.scrollBehavior = 'auto';")
  || !scrollMessagesToBottomBlock.includes('messages.style.scrollBehavior = previousBehavior;')
  || !uiSource.includes("type ChatScrollSettleResult = 'none' | 'restored' | 'bottom' | 'snapshot';")
  || !settleChatScrollBlock.includes('restoreScrollIfNeeded() || restoreActionMenuAnchorIfNeeded()')
  || !settleChatScrollBlock.includes('const shouldScrollToBottom = shouldStickChatToBottom')
  || !settleChatScrollBlock.includes('scrollMessagesToBottom();')
  || !settleChatScrollBlock.includes('applyScrollSnapshot(preRenderScroll)')
  || !renderBlock.includes('const immediateChatScroll = settleChatScrollAfterRender(wasNearChatBottom, preRenderScroll);')
  || !renderBlock.includes("const settledChatScroll = immediateChatScroll === 'none'")
) {
  throw new Error('Chat renders should settle scroll before paint so overlays, long press menus, and sends never flash from top to bottom.');
}
const startStaggeredRenderIndex = startStaggeredUiTransitionBlock.indexOf('renderPage();');
const startStaggeredTimerIndex = startStaggeredUiTransitionBlock.indexOf('window.setTimeout');
if (
  startStaggeredRenderIndex < 0
  || startStaggeredTimerIndex < 0
  || startStaggeredRenderIndex < startStaggeredTimerIndex
  || !transitionsSource.includes('function currentPageTransitionTargets')
  || !startStaggeredUiTransitionBlock.includes("currentPageTransitionTargets().forEach(element => element.classList.add('is-exiting'))")
  || !startStaggeredUiTransitionBlock.includes("setTransitionPhase('exit');")
  || !startStaggeredUiTransitionBlock.includes("window.setTimeout(() => {\n    setTransitionPhase('enter');\n    renderPage();")
  || transitionsSource.includes('function createTransitionExitLayer')
  || transitionsSource.includes('function animateTransitionExitLayer')
  || styleSource.includes('.pt-transition-exit-layer')
) {
  throw new Error('Main page transitions should use the real current page for a short reference-style slide-fade out, not a cloned exit layer.');
}
const groupRevealPrepareIndex = groupChatRowOpenBlock.indexOf('prepareChatRevealFromElement(button);');
const groupRevealRenderIndex = groupChatRowOpenBlock.indexOf("renderWithUiTransition('detail-in')");
if (
  groupRevealPrepareIndex < 0
  || groupRevealRenderIndex < 0
  || groupRevealPrepareIndex > groupRevealRenderIndex
  || !transitionsSource.includes('dataset.groupChatId')
  || !transitionsSource.includes('data-group-chat-id')
  || transitionsSource.includes("!detail.classList.contains('mobile-group-chat')")
) {
  throw new Error('Group chat rows should seed the same anchored detail reveal as private chats, including mobile back reveal.');
}
if (
  !transitionsSource.includes('UI_ENTER_MS = 160')
  || !transitionsSource.includes('UI_EXIT_MS = 80')
  || !transitionsSource.includes('CHAT_REVEAL_ENTER_MS = 420')
  || !transitionsSource.includes('CHAT_REVEAL_EXIT_MS = 280')
  || !transitionsSource.includes('playChatRippleEnter')
  || !transitionsSource.includes('playChatRippleExit')
  || !transitionsSource.includes('nextAnimationFrame')
  || !transitionsSource.includes('window.requestAnimationFrame')
  || !transitionsSource.includes('window.setTimeout(() => callback(Date.now()), 16)')
  || !transitionsSource.includes('radial-gradient(circle at')
  || !transitionsSource.includes('data-character-id')
  || !styleSource.includes('--fade-dur: 260ms')
  || !styleSource.includes('--fade-out-dur: 220ms')
  || !styleSource.includes('--block-gap: 24ms')
  || !styleSource.includes('@keyframes referencePageEnter')
  || !styleSource.includes('@keyframes referencePageExit')
  || !styleSource.includes('.ui-fallback-transition[data-ui-transition-phase="enter"][data-ui-transition^="main-"] .mobile-page:not(.is-exiting) > *:not(.bottom-nav):not(.moment-compose-fab)')
  || !styleSource.includes('.ui-fallback-transition[data-ui-transition-phase="enter"][data-ui-transition^="main-"] .moments-page:not(.is-exiting) > *:not(.bottom-nav):not(.moments-publisher)')
  || !styleSource.includes('.ui-fallback-transition[data-ui-transition-phase="exit"][data-ui-transition^="main-"] .is-exiting.mobile-page > *:not(.bottom-nav):not(.moment-compose-fab)')
  || styleSource.includes('paltavern-page-enter-forward')
  || styleSource.includes('--ui-transition-duration')
  || styleSource.includes('::view-transition-old(root)')
  || !styleSource.includes('@keyframes slideUpIn')
  || !styleSource.includes('@keyframes slideDownOut')
  || styleSource.includes('.pt-transition-exit-layer')
  || !styleSource.includes('.bottom-nav button:active')
  || !styleSource.includes('transform: translateY(3px) scale(0.975)')
  || !styleSource.includes('.pt-chat-reveal-layer')
  || !styleSource.includes('.pt-chat-reveal-snapshot')
  || !transitionsSource.includes('let activeRevealCancel')
  || !transitionsSource.includes('cancelActiveChatReveal()')
  || !transitionsSource.includes('chatRevealAnimating = false')
) {
  throw new Error('Current motion should replicate the reference APK and let a back gesture take over an unfinished chat reveal.');
}
if (
  !styleSource.includes('html[data-ui-transition]:not([data-ui-transition^="main-"]) .moment-compose-fab')
  || !styleSource.includes('transition: none !important;')
  || !styleSource.includes('transform: none !important;')
  || !styleSource.includes('will-change: auto;')
) {
  throw new Error('Moment compose FAB should stay visually pinned during tab transition motion.');
}
if (
  !setRevealMaskBlock.includes('maskImage')
  || !setRevealMaskBlock.includes('radial-gradient(circle at')
  || setRevealMaskBlock.includes('--reveal-size')
  || styleSource.includes('will-change: width, height, opacity')
  || !styleSource.includes('will-change: opacity, mask-image, -webkit-mask-image')
) {
  throw new Error('Chat avatar reveal should animate a mask radius instead of width/height layout on every frame.');
}
if (
  !iconsSource.includes('export type IconName')
  || !iconsSource.includes('export function icon')
  || !uiSource.includes("from './icons'")
  || uiSource.includes('function icon(name: IconName)')
  || uiSource.includes('type IconName =')
) {
  throw new Error('Shared UI icons should live in ui/icons.ts instead of the main app renderer.');
}
if (
  !chatSurfaceSource.includes('export function chatSurfaceStyle')
  || !chatSurfaceSource.includes('export function renderAvatar')
  || !chatSurfaceSource.includes('export function renderChatBackgroundControl')
  || !uiSource.includes("from './chat-surface'")
  || uiSource.includes('function chatSurfaceStyle(')
  || uiSource.includes('function renderAvatar(')
  || uiSource.includes('function renderChatBackgroundControl(')
) {
  throw new Error('Chat surface helpers should live in ui/chat-surface.ts instead of the main app renderer.');
}
if (
  !modelSettingsSource.includes('export function modelProviderValue')
  || !modelSettingsSource.includes('export function modelProviderFor')
  || !modelSettingsSource.includes('export function apiUrlForProvider')
  || !modelSettingsSource.includes('function normalizeModelApiUrlBase')
  || !modelSettingsSource.includes("normalized !== normalizeModelApiUrlBase(DEEPSEEK_API_URL)")
  || !modelSettingsSource.includes('export function modelProviderOptions')
  || !uiSource.includes("from './model-settings'")
  || uiSource.includes('function modelProviderValue(')
  || uiSource.includes('function modelProviderFor(')
  || uiSource.includes('function apiUrlForProvider(')
  || uiSource.includes('function modelProviderOptions(')
) {
  throw new Error('Model provider UI helpers should live in ui/model-settings.ts instead of the main app renderer.');
}
if (
  !displayLabelsSource.includes('export function formatConversationTime')
  || !displayLabelsSource.includes('export function relationshipStageLabel')
  || !displayLabelsSource.includes('export function pacingStateLabel')
  || !displayLabelsSource.includes('export function countdownText')
  || !displayLabelsSource.includes('export function timelineTypeLabel')
  || !displayLabelsSource.includes('export function timelineSourceLabel')
  || !uiSource.includes("from './display-labels'")
  || uiSource.includes('function formatConversationTime(')
  || uiSource.includes('function relationshipStageLabel(')
  || uiSource.includes('function pacingStateLabel(')
  || uiSource.includes('function countdownText(')
  || uiSource.includes('function timelineTypeLabel(')
  || uiSource.includes('function timelineSourceLabel(')
) {
  throw new Error('Shared display labels should live in ui/display-labels.ts instead of the main app renderer.');
}
if (
  !worldWorkbenchPanelsSource.includes('export function renderWorldDrawerTimeline')
  || !worldWorkbenchPanelsSource.includes('type WorldWorkbenchPanelContext')
  || !uiSource.includes("from './world-workbench-panels'")
  || worldWorkbenchPanelsSource.includes('renderWorldContinuePanel')
  || worldWorkbenchPanelsSource.includes('renderMemorySuggestionItem')
  || worldWorkbenchPanelsSource.includes('renderMemoryVault')
  || worldWorkbenchPanelsSource.includes('renderWorldChapterPanel')
  || worldWorkbenchPanelsSource.includes('renderRelationshipMapPanel')
  || worldWorkbenchPanelsSource.includes('renderMemoryInboxPanel')
  || uiSource.includes('function renderWorldContinuePanel(')
  || uiSource.includes('function renderMemorySuggestionItem(')
  || uiSource.includes('function renderMemoryVault(')
  || uiSource.includes('function renderWorldChapterPanel(')
  || uiSource.includes('function renderRelationshipMapPanel(')
  || uiSource.includes('function renderMemoryInboxPanel(')
  || uiSource.includes('function renderWorldDrawerTimeline(')
) {
  throw new Error('World workbench dashboard panels should be deleted from the UI layer; only the drawer timeline helper should remain.');
}
if (
  deletedWorldFeaturePaths.some(filePath => fs.existsSync(filePath))
  || uiSource.includes('../memory/suggestions')
  || uiSource.includes('../world/chapters')
  || stateSource.includes('memorySuggestions')
  || stateSource.includes('MemorySuggestion')
  || stateSource.includes('worldChapters')
  || stateSource.includes('WorldChapter')
  || coreTypesSource.includes('memorySuggestions')
  || coreTypesSource.includes('MemorySuggestion')
  || coreTypesSource.includes('worldChapters')
  || coreTypesSource.includes('WorldChapter')
  || packageSource.includes('test:memory-suggestions')
  || packageSource.includes('test:world-chapters')
) {
  throw new Error('Removed world content functions should not leave modules, persisted state fields, imports, or package test entries behind.');
}
if (false && (
  !styleSource.includes('/* 大注释：页面切换动效层')
  || !styleSource.includes('::view-transition-old(root)')
  || !styleSource.includes('::view-transition-new(root)')
  || !styleSource.includes('@keyframes paltavern-page-enter-forward')
  || !styleSource.includes('.ui-fallback-transition[data-ui-transition')
  || !styleSource.includes('@media (prefers-reduced-motion: reduce)')
)) {
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
  || !uiSource.includes("'.world-gear-panel[open], .world-persona-select[open], .private-chat-identity-select[open]'")
) {
  throw new Error('Mobile world topbar should stay one-row, with an avatar identity, full-page world settings, and no horizontal overflow.');
}
if (
  !worldWorkbenchBlock.includes('aria-label="生成事件"')
  || !worldWorkbenchBlock.includes('<span class="world-action-label">生成事件</span>')
) {
  throw new Error('World topbar action should match the original generated-event entry wording.');
}
if (
  !worldWorkbenchBlock.includes('aria-label="生成事件"')
  || !worldWorkbenchBlock.includes('<span class="world-action-label">生成事件</span>')
  || !worldEventLobbyBlock.includes('生成一段日常后')
  || !worldEventLobbyBlock.includes('<span>生成片段</span>')
  || !renderMobileBlock.includes('aria-label="新建群聊"')
) {
  throw new Error('Mobile inbox actions should keep plain labels while the world page keeps its original event wording.');
}
if (
  !worldPersonaSelectorBlock.includes('renderUserAvatar(state.userName)')
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
  !worldDialogueInPageGuardBlock.includes('.world-event-rp-detail')
  || !worldDialogueInPageGuardBlock.includes('background: transparent;')
  || !worldDialogueInPageGuardBlock.includes('border: 0;')
  || !worldDialogueInPageGuardBlock.includes('box-shadow: none;')
  || !worldDialogueInPageGuardBlock.includes('border-radius: 0;')
  || !worldDialogueInPageGuardBlock.includes('width: 100%;')
  || !worldDialogueInPageGuardBlock.includes('max-width: none;')
  || !worldDialogueInPageGuardBlock.includes('.world-event-detail-toolbar')
  || !worldDialogueInPageGuardBlock.includes('position: sticky;')
) {
  throw new Error('World RP detail should stay as an in-page dialogue surface instead of a floating card window.');
}
if (
  !eventChoiceBorderCleanupBlock.includes('.event-choice-grid .secondary')
  || !eventChoiceBorderCleanupBlock.includes('border: 0;')
  || !eventChoiceBorderCleanupBlock.includes('box-shadow: none;')
  || !eventChoiceBorderCleanupBlock.includes('.event-choice-grid .secondary:hover')
  || !eventChoiceBorderCleanupBlock.includes('border-color: transparent;')
) {
  throw new Error('World event choice buttons should not show an extra dark border around the timeline choice box.');
}
if (
  !worldEventLobbyBlock.includes('event-swipe-row')
  || !worldEventLobbyBlock.includes('data-event-swipe-row')
  || !worldEventLobbyBlock.includes('event-swipe-delete')
  || !worldEventLobbyBlock.includes('data-delete-event')
  || !worldEventLobbyBlock.includes('tabindex="-1"')
  || !worldEventSettingsPreviewBlock.includes('event-swipe-row')
  || !worldEventSettingsPreviewBlock.includes('tabindex="-1"')
  || !uiSource.includes('eventSwipeStartX')
  || !uiSource.includes('setEventSwipeDeleteVisible')
  || !uiSource.includes('closeRevealedEventSwipeRows')
  || !uiSource.includes('action.tabIndex = revealed ? 0 : -1')
  || !uiSource.includes("action.setAttribute('aria-hidden', revealed ? 'false' : 'true')")
  || !uiSource.includes('is-delete-revealed')
  || eventDeleteHandlerBlock.includes('openConfirmDialog')
  || eventDeleteHandlerBlock.includes('const hasActiveImpact')
  || eventDeleteHandlerBlock.includes('deleteEventWithImpactChoice')
  || !eventDeleteHandlerBlock.includes('deleteWorldEvent(eventId, { rollbackImpact: true })')
  || !styleSource.includes('.event-swipe-row')
  || !styleSource.includes('.event-swipe-actions')
  || !styleSource.includes('width: 68px')
  || !styleSource.includes('opacity: 0;')
  || !styleSource.includes('pointer-events: none;')
  || !styleSource.includes('.event-swipe-row.is-delete-revealed .event-swipe-actions')
  || !styleSource.includes('opacity: 1;')
  || !styleSource.includes('.event-swipe-content')
  || !styleSource.includes('.event-swipe-row.is-delete-revealed .event-swipe-content')
  || !styleSource.includes('translateX(-68px)')
) {
  throw new Error('World events should delete from an in-page swipe action instead of a floating confirmation window.');
}
if (
  !privateEventSuggestionCardBlock.includes('岛上事件草稿')
  || !privateEventSuggestionCardBlock.includes('private-event-suggestion-label')
  || !privateEventSuggestionCardBlock.includes('private-event-suggestion-meta')
  || !privateEventSuggestionCardBlock.includes('private-event-suggestion-description')
  || !privateEventSuggestionCardBlock.includes('creatingPrivateEventSuggestionId')
  || !privateEventSuggestionCardBlock.includes('正在生成事件')
  || !styleSource.includes('.private-event-suggestion-card')
  || !styleSource.includes('margin: 0 16px 10px')
  || !styleSource.includes('border-radius: 12px')
  || !styleSource.includes('.private-event-suggestion-label')
  || !styleSource.includes('.private-event-suggestion-description')
) {
  throw new Error('Private chat event suggestions should render as a compact island-event draft bar attached to the composer.');
}
if (
  !uiSource.includes('let creatingPrivateEventSuggestionId = \'\'')
  || !uiSource.includes('creatingPrivateEventSuggestionId = suggestionId')
  || !uiSource.includes('window.setTimeout(() =>')
  || !uiSource.includes('creatingPrivateEventSuggestionId = \'\'')
) {
  throw new Error('Private chat event generation should keep the draft card visible in a generating state before it resolves.');
}
if (
  !memorySummaryCardBlock.includes('memory-summary-more-actions')
  || !memorySummaryCardBlock.includes('summary class="secondary small-button"')
  || !memorySummaryCardBlock.includes('>更多</summary>')
  || memorySummaryCardBlock.includes('data-confirm-memory-summary') && !memorySummaryCardBlock.includes('extraActions')
  || !styleSource.includes('.memory-summary-card-actions')
  || !styleSource.includes('.memory-summary-more-actions')
  || !styleSource.includes('.memory-summary-more-actions[open] summary')
) {
  throw new Error('Memory summary cards should show at most two top-level actions and collapse extra buttons behind an expandable More control.');
}
if (
  !uiSource.includes('let memorySummaryDrawerExpanded = false')
  || !uiSource.includes('data-toggle-memory-summary-drawer')
  || !uiSource.includes('rebuildPrivateChatAutoMemoryForCharacter(character.id)')
  || !uiSource.includes('memorySummaryDrawerExpanded ?')
  || !uiSource.includes('memory-summary-drawer is-expanded')
  || !uiSource.includes('memory-summary-drawer-body')
  || !styleSource.includes('.memory-summary-drawer:not(.is-expanded) .memory-summary-drawer-body')
  || !styleSource.includes('display: none;')
) {
  throw new Error('Memory drawer should be collapsed by default and expand only when the drawer toggle is pressed.');
}
const worldWorkbenchInsightTabsIndex = worldWorkbenchBlock.indexOf('${renderWorldInsightTabs()}');
const worldWorkbenchScrollIndex = worldWorkbenchBlock.indexOf('<section class="world-workbench-scroll">');
const worldWorkbenchColumnIndex = worldWorkbenchBlock.indexOf('<div class="world-workbench-column">');
if (
  worldWorkbenchBlock.includes('renderWorldContinuePanel')
  || worldWorkbenchBlock.includes('renderWorldChapterPanel')
  || worldWorkbenchBlock.includes('renderMemoryInboxPanel')
  || worldWorkbenchBlock.includes('renderRelationshipMapPanel')
  || worldEventLobbyBlock.includes('renderWorldContinuePanel')
) {
  throw new Error('World workbench page should keep the original session-start layout and not render the later dashboard panels on the main page.');
}
if (
  !uiSource.includes("type WorldInsightTab = 'events' | 'relationships' | 'timeline'")
  || !uiSource.includes("let worldInsightTab: WorldInsightTab = 'events'")
  || !worldWorkbenchBlock.includes('renderWorldInsightTabs')
  || worldWorkbenchInsightTabsIndex < 0
  || worldWorkbenchScrollIndex < 0
  || worldWorkbenchInsightTabsIndex > worldWorkbenchScrollIndex
  || worldWorkbenchBlock.slice(worldWorkbenchColumnIndex, worldWorkbenchScrollIndex + 240).includes('${renderWorldInsightTabs()}')
  || !worldWorkbenchBlock.includes('renderWorldRelationshipInsight')
  || !worldWorkbenchBlock.includes('renderWorldTimelineInsight')
  || !uiSource.includes('function renderRelationshipOverviewList')
  || !uiSource.includes('data-world-insight-tab')
  || !uiSource.includes('data-world-relationship-character')
  || !uiSource.includes('data-world-relationship-line')
  || !uiSource.includes('data-world-timeline-type')
  || !uiSource.includes('worldTimelineTypeFilter')
  || uiSource.includes('relationship-network-edge-label')
  || !styleSource.includes('.world-insight-tabs')
  || !styleSource.includes('.relationship-network-panel')
  || !styleSource.includes('.relationship-network-svg')
  || !styleSource.includes('.relationship-inspector')
  || !styleSource.includes('.relationship-overview-list')
  || !styleSource.includes('.relationship-overview-row')
  || !styleSource.includes('.relationship-stage-chip')
  || styleSource.includes('.relationship-network-edge-label')
  || !styleSource.includes('.world-topbar-tabs')
  || !styleSource.includes('.timeline-track-list')
  || !styleSource.includes('.timeline-track-day')
  || !styleSource.includes('.timeline-type-filter')
  || coreTypesSource.includes('worldInsightTab')
  || coreTypesSource.includes('worldTimelineTypeFilter')
) {
  throw new Error('World insight should add non-persisted relationship and timeline visualization tabs with editable relationship and filter controls.');
}
const timelineCardActionsBlock = styleSource.match(/\.timeline-card-actions\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (
  !timelineCardActionsBlock.includes('gap: 10px')
  || !timelineCardActionsBlock.includes('flex-wrap: wrap')
  || !timelineCardActionsBlock.includes('padding-top: 12px')
) {
  throw new Error('Timeline card action buttons should keep clear spacing and wrap safely on narrow cards.');
}
const momentHeaderBlock = styleSource.match(/\.moment-header\s*\{\s*display: grid;[\s\S]*?\}/)?.[0] ?? '';
const momentHeaderActionsMobileBlock = styleSource.match(/\.moment-header-actions\s*\{\s*width:[\s\S]*?\}/)?.[0] ?? '';
if (
  !momentHeaderBlock.includes('grid-template-columns: minmax(0, 1fr) auto')
  || !momentHeaderBlock.includes('align-items: start')
  || !styleSource.includes('.moment-header > div')
  || !styleSource.includes('min-width: 0;')
  || !styleSource.includes('.moment-header strong')
  || !styleSource.includes('overflow-wrap: anywhere;')
  || momentHeaderActionsMobileBlock.includes('width: 100%')
) {
  throw new Error('Moment card headers should keep author/meta text horizontal and prevent mobile actions from squeezing the content column.');
}
const relationshipNodeVisualBlock = styleSource.match(/\.relationship-network-node\s*\{\s*z-index:[\s\S]*?\.relationship-network-node\.is-highlighted/)?.[0] ?? '';
const relationshipAvatarVisualBlock = styleSource.match(/\.relationship-network-avatar\s*\{[\s\S]*?\}/)?.[0] ?? '';
const relationshipMobileNodeBlock = styleSource.match(/\.relationship-network-node\s*\{\s*--relationship-network-avatar-size: 38px;[\s\S]*?\}/)?.[0] ?? '';
const relationshipInsightLayoutBlock = styleSource.match(/\.world-relationship-insight\s*\{[\s\S]*?\}/)?.[0] ?? '';
const relationshipCanvasBlock = styleSource.match(/\.relationship-network-canvas\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (
  !uiSource.includes('function relationshipInsightVisibleRelationships')
  || !uiSource.includes('function relationshipInsightVisibleCharacterIds')
  || !uiSource.includes('data-world-relationship-canvas')
  || !relationshipInsightLayoutBlock.includes('grid-template-columns: minmax(460px, 1fr) minmax(320px, 380px)')
  || !relationshipInsightLayoutBlock.includes('max-width: 940px')
  || !relationshipCanvasBlock.includes('min-height: clamp(320px, 42vw, 460px)')
  || !relationshipCanvasBlock.includes('aspect-ratio: 1.35')
  || !styleSource.includes('.relationship-network-node.is-hidden')
  || !styleSource.includes('.relationship-network-line.is-hidden')
  || !styleSource.includes('--relationship-network-avatar-size: 44px')
  || !styleSource.includes('--relationship-network-avatar-size: 38px')
  || !styleSource.includes('transform: translate(-50%, -50%);')
  || !styleSource.includes('width: var(--relationship-network-avatar-size);')
  || !styleSource.includes('height: var(--relationship-network-avatar-size);')
  || !styleSource.includes('min-width: var(--relationship-network-avatar-size);')
  || !styleSource.includes('.relationship-network-node:active')
  || !styleSource.includes('top: calc(var(--relationship-network-avatar-size) + 6px);')
  || relationshipMobileNodeBlock.includes('width: 58px')
  || relationshipMobileNodeBlock.includes('min-height: 62px')
  || !uiSource.includes('return (1.0 + weight * 0.16).toFixed(1);')
  || styleSource.includes('.relationship-network-node:hover .relationship-network-avatar {\n  transform:')
  || relationshipAvatarVisualBlock.includes('transform')
  || relationshipNodeVisualBlock.includes('background:')
  || relationshipNodeVisualBlock.includes('border:')
  || relationshipNodeVisualBlock.includes('box-shadow:')
) {
  throw new Error('Relationship network should keep a stable two-column desktop layout while rendering frameless, fixed-center avatars.');
}
const relationshipMobileLayoutBlock = styleSource.match(/@media \(max-width: 780px\)\s*\{[\s\S]*?\.relationship-inspector\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (
  !relationshipMobileLayoutBlock.includes('grid-template-columns: minmax(0, 1fr)')
  || !relationshipMobileLayoutBlock.includes('max-width: min(100%, 560px)')
) {
  throw new Error('Relationship insight should collapse into a single centered column on mobile and narrow desktop widths.');
}
const coarseTouchBlock = styleSource.match(/@media \(max-width: 560px\), \(hover: none\), \(pointer: coarse\)\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (
  !coarseTouchBlock.includes('.moment-delete')
  || !coarseTouchBlock.includes('.small-button')
  || !coarseTouchBlock.includes('.world-insight-tabs button')
  || !coarseTouchBlock.includes('min-height: 44px')
) {
  throw new Error('Coarse pointer controls should include dynamic cards, small buttons, and insight tabs in the 44px touch-target guard.');
}
if (
  !worldDialogueBody.includes("plainTextMode: 'narration'")
  || worldDialogueBody.includes("plainTextMode: 'dialogue'")
  || !eventsSource.includes('没有 @bubble')
  || !eventsSource.includes('没有 @bubble:角色名|情绪|台词 的普通文本会被界面当作旁白')
) {
  throw new Error('World RP assistant text should keep untagged narration separate from explicit character bubbles.');
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
  || worldWorkbenchBlock.includes('${renderMemorySummaryDrawer()}')
  || !worldWorkbenchBlock.includes("const memorySummaryDrawer = worldInsightTab === 'events' && selectedEvent ? '' : renderMemorySummaryDrawer();")
  || !worldWorkbenchBlock.includes('${memorySummaryDrawer}')
  || !styleSource.includes('.world-stage-composer')
  || !styleSource.includes('.world-event-narration')
  || !styleSource.includes('.world-event-lobby')
  || !styleSource.includes('.world-drawer-section')
) {
  throw new Error('World tab should list daily/event entries first and keep the memory drawer out of event detail.');
}
if (
  !worldRpMessageActionsBlock.includes('data-edit-world-rp-message')
  || !worldWorkbenchBlock.includes('renderWorldRpMessageEditDialog')
  || !appSource.includes('id="world-rp-message-edit-input"')
  || !appSource.includes('editWorldEventRpMessage')
) {
  throw new Error('World RP user actions should be editable from inside the event dialogue.');
}
if (
  !chatSurfaceSource.includes('function avatarToneForId')
  || !chatSurfaceSource.includes('function avatarToneAttribute')
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
