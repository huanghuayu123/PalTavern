export {};
declare const require: (id: string) => any;

const globalAny = globalThis as any;
if (!globalAny.localStorage) {
  const store: Record<string, string> = {};
  globalAny.localStorage = {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
  };
}

const exporter = require('../src/independent-chat/characters/tavern-export');
const stateModule = require('../src/independent-chat/core/state');
const worldBundle = require('../src/independent-chat/data/world-bundle');

const character = {
  id: 'card_test',
  worldId: 'world_test',
  name: 'Alice/Test',
  description: 'Updated description',
  personality: 'Reserved',
  scenario: 'A quiet station',
  firstMessage: 'Hello.',
  profileNote: 'A generated opening note.',
  tags: ['test', 'export'],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v2',
    specVersion: '2.0',
    worldBookEntryCount: 1,
    importedFileName: 'alice.json',
  },
  characterBook: {
    entries: [{ keys: ['station'], content: 'World lore' }],
  },
  relationship: {
    stage: 'close',
    affinity: 70,
    summary: 'Mutual trust',
    updatedAt: 1_700_000_000_000,
  },
  autoMessage: {
    enabled: true,
    baseIntervalMin: 1,
    baseIntervalMax: 2,
  },
  rawCard: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Old name',
      creator_notes: 'Preserve this',
      extensions: {
        third_party: { keep: true },
        tavern_social: {
          characterRelationships: [{ leaked: true }],
          characterRelationshipSuggestions: [{ leaked: true }],
        },
      },
    },
    custom_top_level: 'preserve',
  },
  importedAt: 1,
};

const exported = exporter.createSillyTavernCard(character);
const data = exported.data;

if (exported.spec !== 'chara_card_v3' || exported.spec_version !== '3.0') {
  throw new Error('Card spec was not normalized to SillyTavern V3.');
}
if (exported.custom_top_level !== 'preserve' || data.creator_notes !== 'Preserve this') {
  throw new Error('Unknown original card fields were not preserved.');
}
if (data.name !== character.name || data.description !== '' || data.personality !== '' || data.scenario !== '') {
  throw new Error('Current character name or blank profile fields were not exported correctly.');
}
if (
  !JSON.stringify(data.character_book).includes('Updated description')
  || !JSON.stringify(data.character_book).includes('Reserved')
  || !JSON.stringify(data.character_book).includes('A quiet station')
) {
  throw new Error('Character settings were not exported through the bound world book.');
}
if (data.extensions.third_party.keep !== true) {
  throw new Error('Third-party extensions were not preserved.');
}
if (data.extensions.tavern_social.relationship.affinity !== 70) {
  throw new Error('Relationship extension was not exported.');
}
if (data.extensions.tavern_social.profile_note !== character.profileNote) {
  throw new Error('Profile note was not exported.');
}
if ('autoMessage' in data || JSON.stringify(exported).includes('baseIntervalMin')) {
  throw new Error('Private scheduler settings leaked into the character card.');
}
if (
  JSON.stringify(data.extensions.tavern_social).includes('characterRelationships')
  || JSON.stringify(data.extensions.tavern_social).includes('characterRelationshipSuggestions')
) {
  throw new Error('Character-to-character relationship network leaked into a single character card export.');
}

const bundleState = stateModule.defaultState();
const bundleWorld = {
  id: 'world_bundle_test',
  name: 'Bundle World',
  description: 'A full test world',
  worldLore: 'Shared lore for every exported character.',
  userPersona: 'World user persona',
  currentLocation: 'Station cafe',
  sceneAtmosphere: 'Rainy and quiet',
  sceneSummary: 'Everyone is waiting for the last train.',
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_100,
};
const sourceBundleCharacters = [
  bundleState.characters[0],
  { ...bundleState.characters[0], id: 'second_source_character', name: 'Second Source Character' },
];
const bundleCharacters = sourceBundleCharacters.map((item: any, index: number) => ({
  ...item,
  id: index === 0 ? 'bundle_char_a' : 'bundle_char_b',
  worldId: bundleWorld.id,
  name: index === 0 ? 'Bundle Alice' : 'Bundle Bob',
}));
bundleState.worlds = [bundleWorld];
bundleState.characters = bundleCharacters;
bundleState.activeWorldId = bundleWorld.id;
bundleState.activeCharacterId = bundleCharacters[0].id;
bundleState.characterRelationships = [{
  id: 'bundle_relationship',
  worldId: bundleWorld.id,
  characterAId: bundleCharacters[0].id,
  characterBId: bundleCharacters[1].id,
  aToB: { stage: 'familiar', summary: 'Alice trusts Bob.', updatedAt: 1_700_000_000_200 },
  bToA: { stage: 'close', summary: 'Bob watches over Alice.', updatedAt: 1_700_000_000_200 },
  updatedAt: 1_700_000_000_200,
}];
bundleState.characterRelationshipSuggestions = [{
  id: 'bundle_relationship_suggestion',
  worldId: bundleWorld.id,
  relationshipId: 'bundle_relationship',
  fromCharacterId: bundleCharacters[0].id,
  toCharacterId: bundleCharacters[1].id,
  suggestedStage: 'close',
  reason: 'They shared an event.',
  sourceEventId: 'bundle_event',
  createdAt: 1_700_000_000_300,
}];
bundleState.characterCardDrafts = [{
  id: 'bundle_draft',
  worldId: bundleWorld.id,
  mode: 'simple',
  currentStep: 'preview',
  name: 'Draft Person',
  concept: 'A draft tied to this world',
  age: '',
  backgroundStory: '',
  profileNote: '',
  appearance: '',
  personality: '',
  hobbies: '',
  palette: '',
  reinterpretation: '',
  firstMessage: '',
  notes: {},
  candidates: {},
  conversations: {},
  createdAt: 1_700_000_000_400,
  updatedAt: 1_700_000_000_400,
}];
bundleState.conversations = [{
  id: 'bundle_conversation',
  worldId: bundleWorld.id,
  characterId: bundleCharacters[0].id,
  createdAt: 1_700_000_000_500,
  updatedAt: 1_700_000_000_500,
  lastReadAt: 1_700_000_000_500,
}];
bundleState.messages = [{
  id: 'bundle_message',
  conversationId: 'bundle_conversation',
  characterId: bundleCharacters[0].id,
  role: 'assistant',
  speakerType: 'character',
  speakerCharacterId: bundleCharacters[0].id,
  content: 'The world bundle should keep this private chat.',
  createdAt: 1_700_000_000_600,
  source: 'model_reply',
}];
bundleState.groupChats = [{
  id: 'bundle_group',
  worldId: bundleWorld.id,
  title: 'Station Group',
  participantCharacterIds: bundleCharacters.map((item: any) => item.id),
  selectedSpeakerId: bundleCharacters[0].id,
  replyAllOnUserMessage: false,
  allowModelInitiatedMessages: true,
  createdAt: 1_700_000_000_700,
  updatedAt: 1_700_000_000_700,
}];
bundleState.groupMessages = [{
  id: 'bundle_group_message',
  groupChatId: 'bundle_group',
  worldId: bundleWorld.id,
  speakerType: 'character',
  speakerCharacterId: bundleCharacters[1].id,
  content: 'Group chat travels with the world.',
  source: 'model',
  createdAt: 1_700_000_000_800,
}];
bundleState.characterDirectThreads = [{
  id: 'bundle_direct_thread',
  worldId: bundleWorld.id,
  participantCharacterIds: bundleCharacters.map((item: any) => item.id),
  lastReadByCharacterId: {},
  createdAt: 1_700_000_000_900,
  updatedAt: 1_700_000_000_900,
}];
bundleState.characterDirectMessages = [{
  id: 'bundle_direct_message',
  threadId: 'bundle_direct_thread',
  worldId: bundleWorld.id,
  speakerCharacterId: bundleCharacters[0].id,
  content: 'Character-to-character chats are bundled.',
  source: 'model',
  createdAt: 1_700_000_001_000,
}];
bundleState.privateChatEventSuggestions = [{
  id: 'bundle_private_suggestion',
  worldId: bundleWorld.id,
  sourceKind: 'private_chat',
  threadId: 'bundle_conversation',
  sourceMessageId: 'bundle_message',
  sourceMessageRole: 'assistant',
  triggerCharacterId: bundleCharacters[0].id,
  title: 'Private Event',
  description: 'Suggested from chat.',
  eventType: 'daily',
  participantCharacterIds: [bundleCharacters[0].id],
  affinityDelta: 1,
  reason: 'Test suggestion',
  status: 'pending',
  createdAt: 1_700_000_001_100,
  updatedAt: 1_700_000_001_100,
}];
bundleState.moments = [{
  id: 'bundle_moment',
  worldId: bundleWorld.id,
  characterId: bundleCharacters[0].id,
  content: 'A moment from the exported world.',
  createdAt: 1_700_000_001_200,
  source: 'character',
  visibility: { mode: 'public', characterIds: [], blockedCharacterIds: [] },
  comments: [],
}];
bundleState.worldEvents = [{
  id: 'bundle_event',
  worldId: bundleWorld.id,
  title: 'Rain Delay',
  description: 'The train is delayed.',
  type: 'daily',
  participantCharacterIds: bundleCharacters.map((item: any) => item.id),
  affinityDelta: 0,
  choices: [],
  rpMessages: [],
  status: 'active',
  createdAt: 1_700_000_001_300,
  updatedAt: 1_700_000_001_300,
  resolvedAt: null,
  source: 'manual',
}];
bundleState.timelineEntries = [{
  id: 'bundle_timeline',
  worldId: bundleWorld.id,
  type: 'event',
  title: 'A shared memory',
  summary: 'Everyone remembers the rainy platform.',
  source: { type: 'event', id: 'bundle_event' },
  characterIds: bundleCharacters.map((item: any) => item.id),
  characterNames: Object.fromEntries(bundleCharacters.map((item: any) => [item.id, item.name])),
  canUndo: true,
  includeInContext: true,
  createdAt: 1_700_000_001_400,
}];
bundleState.impactRecords = [{
  id: 'bundle_impact',
  worldId: bundleWorld.id,
  operationId: 'bundle_operation',
  label: 'Trust gained',
  source: { type: 'event', id: 'bundle_event' },
  targetType: 'relationship',
  targetId: bundleCharacters[0].id,
  characterId: bundleCharacters[0].id,
  field: 'relationship',
  oldValue: 'stranger',
  newValue: 'familiar',
  timelineEntryIds: ['bundle_timeline'],
  createdAt: 1_700_000_001_500,
}];
bundleState.characterInteractions = [{
  id: 'bundle_interaction',
  worldId: bundleWorld.id,
  type: 'world_event',
  actorCharacterId: bundleCharacters[0].id,
  targetCharacterIds: [bundleCharacters[1].id],
  title: 'Shared umbrella',
  summary: 'Alice and Bob wait together.',
  reason: 'Event scene',
  source: { type: 'event', id: 'bundle_event' },
  createdAt: 1_700_000_001_600,
}];
bundleState.characterStatuses = [{
  id: 'bundle_status',
  worldId: bundleWorld.id,
  characterId: bundleCharacters[0].id,
  mood: 'calm',
  relationshipStage: 'familiar',
  affinity: 30,
  relationshipSummary: 'Trust is growing.',
  recentMemoryTitles: ['A shared memory'],
  unresolvedItems: [],
  nextInclination: 'Text Bob later.',
  activeSources: ['bundle_timeline'],
  summary: 'Alice is calmer after the platform scene.',
  source: 'rule',
  updatedAt: 1_700_000_001_700,
}];
bundleState.dailyBriefs = [{
  id: 'bundle_brief',
  worldId: bundleWorld.id,
  dateKey: '2026-06-15',
  title: 'Rainy station',
  summary: 'A quiet day.',
  sections: ['Station'],
  suggestedCharacterIds: bundleCharacters.map((item: any) => item.id),
  unreadCount: 1,
  changeCount: 2,
  createdAt: 1_700_000_001_800,
  updatedAt: 1_700_000_001_800,
}];
bundleState.memorySummaries = [{
  id: 'bundle_summary',
  worldId: bundleWorld.id,
  layer: 'micro',
  scope: 'world',
  targetId: bundleWorld.id,
  characterIds: bundleCharacters.map((item: any) => item.id),
  sourceTimelineEntryIds: ['bundle_timeline'],
  sourceSummaryIds: [],
  title: 'Platform memory',
  factSummary: 'The last train was delayed.',
  emotionalLine: 'Quiet mutual care.',
  unresolvedItems: [],
  nextHook: 'Check the weather tomorrow.',
  includeInContext: true,
  status: 'active',
  createdAt: 1_700_000_001_900,
  updatedAt: 1_700_000_001_900,
}];
bundleState.communicationIdentityByWorldId = { [bundleWorld.id]: bundleCharacters[1].id };
stateModule.replaceState(bundleState);

const bundleText = worldBundle.createWorldBundleText(bundleWorld.id);
const bundleJson = JSON.parse(bundleText);
if (bundleJson.schema !== 'pal-tavern-world-bundle-v1' || bundleJson.kind !== 'world_bundle') {
  throw new Error('World bundle schema was not exported.');
}
if (JSON.stringify(bundleJson).includes('apiKey') || JSON.stringify(bundleJson).includes('dailyRequestLimit')) {
  throw new Error('Model settings leaked into the world bundle.');
}
if (bundleJson.data.world.id !== bundleWorld.id || bundleJson.data.characters.length !== 2) {
  throw new Error('World bundle did not include the exported world and its characters.');
}
if (
  bundleJson.data.characterRelationships.length !== 1
  || bundleJson.data.messages.length !== 1
  || bundleJson.data.groupMessages.length !== 1
  || bundleJson.data.moments.length !== 1
  || bundleJson.data.worldEvents.length !== 1
) {
  throw new Error('World bundle missed linked world records.');
}

const preview = worldBundle.previewWorldBundleText(bundleText);
if (
  preview.worldName !== bundleWorld.name
  || preview.characterCount !== 2
  || preview.privateMessageCount !== 1
  || preview.groupMessageCount !== 1
  || preview.eventCount !== 1
) {
  throw new Error('World bundle preview counts are incorrect.');
}
if (!worldBundle.isWorldBundleText(bundleText) || worldBundle.isWorldBundleText(exporter.createSillyTavernCardText(character))) {
  throw new Error('World bundle recognition confused a bundle with a single role card.');
}

const importState = stateModule.defaultState();
importState.modelConfig.apiKey = 'keep-local-key';
stateModule.replaceState(importState);
const importResult = worldBundle.importWorldBundleText(bundleText, {
  world: true,
  characters: true,
  relationships: true,
  chats: false,
  moments: true,
  events: false,
  timeline: true,
  summaries: true,
  drafts: true,
});
const importedState = stateModule.state;
if (!importResult.importedSections.includes('characters') || !importedState.worlds.some((item: any) => item.id === bundleWorld.id)) {
  throw new Error('Selected world bundle sections were not imported.');
}
if (!importedState.characters.some((item: any) => item.id === bundleCharacters[0].id)) {
  throw new Error('Selected characters were not imported.');
}
if (importedState.messages.some((item: any) => item.id === 'bundle_message') || importedState.groupChats.some((item: any) => item.id === 'bundle_group')) {
  throw new Error('Unselected chat records were imported.');
}
if (!importedState.moments.some((item: any) => item.id === 'bundle_moment')) {
  throw new Error('Selected moments were not imported.');
}
if (importedState.worldEvents.some((item: any) => item.id === 'bundle_event')) {
  throw new Error('Unselected events were imported.');
}
if (importedState.modelConfig.apiKey !== 'keep-local-key') {
  throw new Error('World bundle import overwrote local model settings.');
}

console.log(JSON.stringify({
  v3: true,
  preservedUnknownFields: true,
  currentFieldsApplied: true,
  settingsInWorldBook: true,
  relationshipExtension: true,
  profileNoteExtension: true,
  privateSettingsExcluded: true,
  characterRelationshipsExcluded: true,
  worldBundleExport: true,
  worldBundleRecognition: true,
  worldBundlePartialImport: true,
}));
