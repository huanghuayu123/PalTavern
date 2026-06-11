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

const freshDefault = stateModule.defaultState();
if (
  freshDefault.worlds[0].name !== '现实世界'
  || !freshDefault.worlds[0].description.includes('手机生活场景')
) {
  throw new Error('Default world should be grounded as the real world.');
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
  worlds: [{ id: 'legacy_world', name: 'Legacy', description: '', createdAt: 1, updatedAt: 1 }],
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
  }],
  activeWorldId: 'legacy_world',
  activeCharacterId: 'legacy_character',
  conversations: [{
    id: 'legacy_conversation',
    worldId: 'legacy_world',
    characterId: 'legacy_character',
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
const worldDialogueBody = functionBody(appSource, 'renderWorldDialogueStream');
const worldComposerBindingBody = functionBody(appSource, 'bindUi');
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
) {
  throw new Error('Character note or unbounded affinity was not preserved.');
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
  || !systemPrompt.includes('TIMELINE_CONTEXT_SHOULD_APPEAR')
  || !systemPrompt.includes('A trusts B with quiet plans.')
  || !systemPrompt.includes('B is cautious around A after the last argument.')
  || !systemPrompt.includes('长期记忆摘要')
  || !systemPrompt.includes('今日简报（大总结，参考总结，不覆盖真实时间线）')
  || !systemPrompt.includes('DAILY_BRIEF_CONTEXT_SHOULD_APPEAR')
) {
  throw new Error('Relationship, user persona, or timeline context was not included in the model prompt.');
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

const uiSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/app.ts'), 'utf8');
const chatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/private-chat.ts'), 'utf8');
const schedulerSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/automation/scheduler.ts'), 'utf8');
const groupChatSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/chat/group-chat.ts'), 'utf8');
const typingDelayPath = path.join(process.cwd(), 'src/independent-chat/chat/typing-delay.ts');
const typingDelaySource = fs.existsSync(typingDelayPath)
  ? fs.readFileSync(typingDelayPath, 'utf8')
  : '';
const indexHtmlSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/styles.css'), 'utf8');
const profileNoteGenerationBlock = uiSource
  .split('async function generateImportProfileNote')[1]
  ?.split('function cleanGeneratedPacingStrategy')[0] ?? '';
const autoMessageSaveBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#save-auto-message')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#regenerate-auto-pacing-strategy')")[0] ?? '';
const autoPacingRegenerateBlock = uiSource
  .split("document.querySelector<HTMLButtonElement>('#regenerate-auto-pacing-strategy')?.addEventListener('click'")[1]
  ?.split("document.querySelector<HTMLButtonElement>('#run-auto-check')")[0] ?? '';
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
const restoreScrollBlock = uiSource
  .split('function restoreScrollIfNeeded')[1]
  ?.split('function applyScrollSnapshot')[0] ?? '';
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
const mobileBottomNavBlock = uiSource
  .split('<nav class="bottom-nav"')[1]
  ?.split('</nav>')[0] ?? '';
const bottomNavFinalBlock = styleSource
  .split('/* Bottom nav final alignment guard */')[1] ?? '';
const worldWorkbenchBlock = uiSource
  .split('function renderWorldWorkbenchPage')[1]
  ?.split('function renderDesktop')[0] ?? '';
const worldEventLobbyBlock = uiSource
  .split('function renderWorldEventLobby')[1]
  ?.split('function renderWorldDialogueStream')[0] ?? '';
const worldEventDetailBlock = uiSource
  .split('function renderWorldEventRpDetail')[1]
  ?.split('function renderWorldStageComposer')[0] ?? '';
const worldSettingsPanelBlock = uiSource
  .split('function renderWorldSettingsPanel')[1]
  ?.split('function renderWorldStageHeader')[0] ?? '';
const worldPersonaSelectorBlock = functionBody(uiSource, 'renderWorldPersonaSelector');
const worldPersonaSummaryBlock = worldPersonaSelectorBlock
  .split('<summary>')[1]
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
const worldTopbarFinalBlock = styleSource.split('/* World topbar final mobile arrangement guard */')[1] ?? '';
if (
  !worldTopbarFinalBlock.includes('grid-template-areas:')
  || !worldTopbarFinalBlock.includes('"persona . gear"')
  || !worldTopbarFinalBlock.includes('"event event event"')
  || !worldTopbarFinalBlock.includes('position: relative')
  || !worldTopbarFinalBlock.includes('.world-stage-header {')
  || !worldTopbarFinalBlock.includes('position: absolute')
  || !worldTopbarFinalBlock.includes('left: 50%')
  || !worldTopbarFinalBlock.includes('transform: translateX(-50%)')
  || !worldTopbarFinalBlock.includes('.world-stage-actions {')
  || !worldTopbarFinalBlock.includes('display: contents')
  || !worldTopbarFinalBlock.includes('#generate-event')
  || !worldTopbarFinalBlock.includes('grid-area: event')
  || !worldTopbarFinalBlock.includes('white-space: nowrap')
) {
  throw new Error('Mobile world topbar should keep persona/settings on the first row, center the world title, and move generate-event into a horizontal second row.');
}
if (
  !worldPersonaSummaryBlock.includes('renderUserAvatar()')
  || !worldPersonaSummaryBlock.includes('personaName')
  || !worldPersonaSummaryBlock.includes('⌄')
  || worldPersonaSummaryBlock.includes('<small')
  || worldPersonaSummaryBlock.includes('personaSummary')
) {
  throw new Error('World persona selector should only show avatar, user name, and dropdown arrow in the top bar.');
}
if (
  !worldWorkbenchBlock.includes('旁白 + 对话')
  || !worldWorkbenchBlock.includes('当前氛围')
  || worldWorkbenchBlock.includes('当前目标')
  || !worldWorkbenchBlock.includes('renderWorldEventLobby')
  || !worldWorkbenchBlock.includes('renderWorldEventRpDetail')
  || !worldWorkbenchBlock.includes('renderWorldSettingsPanel')
  || !styleSource.includes('.world-workbench')
  || !styleSource.includes('.narrative-card')
  || !styleSource.includes('.dialogue-turn')
) {
  throw new Error('World workbench should render daily RP narration, dialogue, event, and world-setting surfaces.');
}
// Big guard: the world entry must feel like an RP stage first. Event controls and timeline memory belong in the drawer, not in the main stream.
if (
  !uiSource.includes('id="world-rp-composer"')
  || !uiSource.includes('id="world-rp-input"')
  || !worldWorkbenchBlock.includes('renderWorldStageHeader')
  || !worldWorkbenchBlock.includes('selectedEvent ? renderWorldStageComposer(character)')
  || !worldEventDetailBlock.includes('renderWorldDialogueStream')
  || !worldEventDetailBlock.includes('data-close-world-event-rp')
  || !worldEventLobbyBlock.includes('data-open-world-event-rp')
  || worldEventLobbyBlock.includes('renderWorldDialogueStream')
  || worldEventLobbyBlock.includes('id="world-rp-composer"')
  || worldWorkbenchBlock.includes('renderWorldEventSummary')
  || worldWorkbenchBlock.includes('world-timeline-panel')
  || !worldSettingsPanelBlock.includes('world-drawer-section')
  || !worldSettingsPanelBlock.includes('renderWorldDrawerEvents')
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
