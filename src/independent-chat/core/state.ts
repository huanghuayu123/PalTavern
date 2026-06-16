/**
 * 大注释：Core state module.
 * Owns persisted app state, defaults, migration, world isolation, and common state selectors.
 */
import type {
  AppState,
  AutoEventSchedule,
  AutoMessageSchedule,
  AutoMomentSchedule,
  CharacterCardDraft,
  CharacterCardDraftStep,
  CharacterDirectMessage,
  CharacterDirectThread,
  CharacterRelationshipRecord,
  CharacterRelationshipSide,
  CharacterRelationshipStageSuggestion,
  CharacterCurrentPlan,
  CharacterInteractionRecord,
  CharacterInteractionType,
  CharacterProfile,
  CharacterStatusSummary,
  ChatReplyMode,
  CompanionTimeMode,
  ConversationProfile,
  DailyBrief,
  GroupChatMessage,
  GroupChatProfile,
  GroupReplyLiveliness,
  ImpactRecord,
  ImpactTargetType,
  MemorySummary,
  MemorySummaryScope,
  MemorySummaryStatus,
  MomentVisibility,
  MomentVisibilityMode,
  ModelProvider,
  PrivateChatEventSuggestion,
  PrivateChatEventSuggestionSourceKind,
  PrivateChatEventSuggestionStatus,
  PromptPreset,
  RelationshipStage,
  RelationshipState,
  TimelineEntry,
  TimelineEntryType,
  TimelineSourceRef,
  WorldEvent,
  WorldWeatherLocation,
  WorldWeatherSnapshot,
  WorldEventChoice,
  WorldEventType,
  WorldProfile,
} from './types';
import {
  createAutoMessagePacingStrategy,
  DEFAULT_AUTO_MESSAGE_PACING_STRATEGY,
} from '../chat/auto-message-strategy';
import {
  BUILTIN_CHARACTER_CARDS,
  type BuiltinCharacterCardDefinition,
} from '../characters/builtin-character-cards';
import { migrateInlineSettingsToWorldBook } from '../characters/settings';
import {
  createTavernSocialDefaultGroupPromptPreset,
  createTavernSocialDefaultPromptPreset,
  createTavernSocialDefaultWorldPromptPreset,
  normalizePromptPresets,
  TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID,
  TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
  TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID,
} from '../model/prompt-presets';
import { clampVirtualTimeMinutes, minutesFromDate, normalizeCompanionTimeMode } from './time';
import { firstString, isRecord, localDateKey, nowId, stableHash } from './utils';

export const STORAGE_KEY = 'tavern-social-state-v1';
export const DEFAULT_WORLD_ID = 'world_default';
export const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1';
export const DEFAULT_CHAT_FONT_SCALE = 1;
export const MIN_CHAT_FONT_SCALE = 0.85;
export const MAX_CHAT_FONT_SCALE = 1.25;

export type CommunicationActor =
  | { type: 'user'; id: 'user' }
  | { type: 'character'; id: string; character: CharacterProfile };

// 小注释：这些持久化常量不能因为目录整理而改名，否则旧用户的本地数据会读不到。
function normalizeApiUrlBase(value: string): string {
  return value.trim().replace(/\/+$/, '').toLowerCase();
}

function normalizeModelProvider(provider: unknown, apiUrl: string): ModelProvider {
  if (provider === 'deepseek' || provider === 'custom') return provider;
  const normalized = normalizeApiUrlBase(apiUrl);
  return normalized && normalized !== normalizeApiUrlBase(DEEPSEEK_API_URL) ? 'custom' : 'deepseek';
}

export function normalizeChatFontScale(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return DEFAULT_CHAT_FONT_SCALE;
  return Math.max(MIN_CHAT_FONT_SCALE, Math.min(MAX_CHAT_FONT_SCALE, Number(value.toFixed(2))));
}

export function normalizeChatBackgroundImage(value: unknown): string | undefined {
  return typeof value === 'string' && /^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(value)
    ? value
    : undefined;
}

export function createDefaultAutoMessageSchedule(): AutoMessageSchedule {
  return {
    enabled: false,
    baseIntervalMin: 2 * 60 * 60 * 1000,
    baseIntervalMax: 6 * 60 * 60 * 1000,
    quietHours: { enabled: true, start: '23:00', end: '08:00' },
    dailyLimit: 3,
    maxInterval: 48 * 60 * 60 * 1000,
    backgroundNotificationsEnabled: true,
    notificationPrivacy: 'generic',
    nextAttemptAt: null,
    lastSentAt: null,
    lastUserReplyAt: null,
    unansweredCount: 0,
    currentPacingState: 'normal',
    pacingReason: '尚未启用主动消息。',
    pacingStrategy: DEFAULT_AUTO_MESSAGE_PACING_STRATEGY,
    pendingResetDecision: false,
  };
}

export function createDefaultRelationship(): RelationshipState {
  return {
    stage: 'stranger',
    affinity: 0,
    summary: '',
    updatedAt: Date.now(),
  };
}

export function createDefaultCharacterPlan(name: string, now = Date.now()): CharacterCurrentPlan {
  const displayName = name.trim() || '这个角色';
  return {
    text: `${displayName} 最近按自己的生活节奏行动，偶尔会因为动态、关系或身边小事和其他角色产生交集。`,
    updatedAt: now,
    source: 'rule',
  };
}

function normalizeCharacterPlan(value: unknown, name: string): CharacterCurrentPlan {
  const fallback = createDefaultCharacterPlan(name);
  if (!isRecord(value)) return fallback;
  return {
    text: typeof value.text === 'string' && value.text.trim() ? value.text.trim() : fallback.text,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : fallback.updatedAt,
    source: value.source === 'model' ? 'model' : 'rule',
  };
}

export function createDefaultAutoMomentSchedule(): AutoMomentSchedule {
  return {
    enabled: true,
    baseIntervalMin: 4 * 60 * 60 * 1000,
    baseIntervalMax: 10 * 60 * 60 * 1000,
    quietHours: { enabled: true, start: '00:00', end: '07:00' },
    dailyLimit: 2,
    nextAttemptAt: null,
    lastPostedAt: null,
    statusReason: '等待安排第一次自动动态。',
  };
}

export function createDefaultAutoEventSchedule(): AutoEventSchedule {
  return {
    enabled: true,
    baseIntervalMin: 6 * 60 * 60 * 1000,
    baseIntervalMax: 16 * 60 * 60 * 1000,
    quietHours: { enabled: true, start: '00:00', end: '07:00' },
    dailyLimit: 1,
    nextAttemptAt: null,
    lastGeneratedAt: null,
    statusReason: '等待安排第一次岛上事件。',
  };
}

function createDefaultWorld(now: number): WorldProfile {
  return {
    id: DEFAULT_WORLD_ID,
    name: '现实世界',
    description: '以用户当前生活城市为锚点的现实世界。角色、关系、动态、群聊和主动消息都发生在这个手机生活场景里。',
    worldLore: '',
    userPersona: '',
    currentLocation: '日常生活场景',
    sceneAtmosphere: '轻松、自然、适合日常 RP',
    sceneSummary: '这里记录当前世界正在发生的小片段，不要求完成任务，只帮助角色关系和生活细节自然延续。',
    createdAt: now,
    updatedAt: now,
  };
}

function builtinStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function builtinWorldBookEntryCount(characterBook: unknown): number {
  return isRecord(characterBook) && Array.isArray(characterBook.entries) ? characterBook.entries.length : 0;
}

function createDefaultCharacter(
  definition: BuiltinCharacterCardDefinition,
  worldId: string,
  importedAt: number,
): CharacterProfile {
  const raw = JSON.parse(definition.rawJson) as Record<string, unknown>;
  const data = isRecord(raw.data) ? raw.data : raw;
  const name = firstString(data.name, raw.name, data.char_name, raw.char_name);
  if (!name) {
    throw new Error(`内置角色卡 ${definition.fileName} 缺少 name 字段。`);
  }
  const avatar = firstString(data.avatar, raw.avatar, data.avatar_url, raw.avatar_url);
  const characterBook = data.character_book ?? raw.character_book;
  const description = firstString(data.description, raw.description);
  const personality = firstString(data.personality, raw.personality);
  const scenario = firstString(data.scenario, raw.scenario);
  const tags = [data.tags, raw.tags]
    .flatMap(value => Array.isArray(value) ? value : [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const character: CharacterProfile = {
    id: `builtin_${definition.id}`,
    worldId,
    name,
    avatar: avatar && avatar !== 'none' ? avatar : undefined,
    description,
    personality,
    scenario,
    firstMessage: firstString(data.first_mes, raw.first_mes, data.first_message, raw.first_message),
    alternateGreetings: builtinStringArray(data.alternate_greetings ?? raw.alternate_greetings),
    groupOnlyGreetings: builtinStringArray(data.group_only_greetings ?? raw.group_only_greetings),
    nickname: firstString(data.nickname, raw.nickname),
    profileNote: definition.profileNote,
    creator: firstString(data.creator, raw.creator),
    creatorNotes: firstString(data.creator_notes, raw.creator_notes),
    characterVersion: firstString(data.character_version, raw.character_version),
    systemPrompt: firstString(data.system_prompt, raw.system_prompt),
    postHistoryInstructions: firstString(data.post_history_instructions, raw.post_history_instructions),
    cardAssets: Array.isArray(data.assets) ? data.assets : Array.isArray(raw.assets) ? raw.assets : [],
    cardSources: builtinStringArray(data.source ?? raw.source),
    stickers: [],
    tags: [...new Set(tags)],
    importInfo: {
      sourceFormat: 'json',
      spec: firstString(raw.spec, data.spec) ?? (isRecord(raw.data) ? 'chara_card_v2' : 'legacy'),
      specVersion: firstString(raw.spec_version, data.spec_version) ?? '',
      worldBookEntryCount: builtinWorldBookEntryCount(characterBook),
      importedFileName: definition.fileName,
    },
    characterBook,
    relationship: createDefaultRelationship(),
    autoMessage: createDefaultAutoMessageSchedule(),
    autoMoment: createDefaultAutoMomentSchedule(),
    autoEvent: createDefaultAutoEventSchedule(),
    currentPlan: createDefaultCharacterPlan(name, importedAt),
    rawCard: raw,
    importedAt,
  };
  character.autoMessage.pacingStrategy = createAutoMessagePacingStrategy(character);
  migrateInlineSettingsToWorldBook(character);
  return character;
}

function createDefaultCharacters(worldId: string, importedAt: number): CharacterProfile[] {
  return BUILTIN_CHARACTER_CARDS.map(definition => createDefaultCharacter(definition, worldId, importedAt));
}

function normalizeWeatherLocation(value: unknown): WorldWeatherLocation | undefined {
  if (!isRecord(value)) return undefined;
  const latitude = typeof value.latitude === 'number' && Number.isFinite(value.latitude) ? value.latitude : undefined;
  const longitude = typeof value.longitude === 'number' && Number.isFinite(value.longitude) ? value.longitude : undefined;
  if (latitude === undefined || longitude === undefined) return undefined;
  return {
    name: typeof value.name === 'string' && value.name.trim() ? value.name.trim() : '未命名城市',
    country: typeof value.country === 'string' ? value.country.trim() : '',
    admin1: typeof value.admin1 === 'string' && value.admin1.trim() ? value.admin1.trim() : undefined,
    latitude,
    longitude,
    timezone: typeof value.timezone === 'string' && value.timezone.trim() ? value.timezone.trim() : undefined,
  };
}

function normalizeWeatherSnapshot(value: unknown): WorldWeatherSnapshot | undefined {
  if (!isRecord(value)) return undefined;
  const temperatureC = typeof value.temperatureC === 'number' && Number.isFinite(value.temperatureC)
    ? value.temperatureC
    : undefined;
  const fetchedAt = typeof value.fetchedAt === 'number' && Number.isFinite(value.fetchedAt)
    ? value.fetchedAt
    : undefined;
  if (temperatureC === undefined || fetchedAt === undefined) return undefined;
  return {
    temperatureC,
    apparentTemperatureC: typeof value.apparentTemperatureC === 'number' && Number.isFinite(value.apparentTemperatureC)
      ? value.apparentTemperatureC
      : undefined,
    relativeHumidity: typeof value.relativeHumidity === 'number' && Number.isFinite(value.relativeHumidity)
      ? value.relativeHumidity
      : undefined,
    windSpeedKmh: typeof value.windSpeedKmh === 'number' && Number.isFinite(value.windSpeedKmh)
      ? value.windSpeedKmh
      : undefined,
    weatherCode: typeof value.weatherCode === 'number' && Number.isFinite(value.weatherCode)
      ? value.weatherCode
      : undefined,
    weatherText: typeof value.weatherText === 'string' && value.weatherText.trim()
      ? value.weatherText.trim()
      : '天气未知',
    isDay: typeof value.isDay === 'boolean' ? value.isDay : undefined,
    observedAt: typeof value.observedAt === 'string' ? value.observedAt : new Date(fetchedAt).toISOString(),
    fetchedAt,
    source: 'open-meteo',
  };
}

function normalizeStickers(value: unknown): import('./types').StickerAsset[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(sticker => ({
    id: typeof sticker.id === 'string' ? sticker.id : nowId('sticker'),
    name: typeof sticker.name === 'string' && sticker.name.trim() ? sticker.name.trim() : '表情包',
    note: typeof sticker.note === 'string' ? sticker.note.trim() : undefined,
    dataUrl: typeof sticker.dataUrl === 'string' ? sticker.dataUrl : '',
    importedAt: typeof sticker.importedAt === 'number' ? sticker.importedAt : Date.now(),
  })).filter(sticker => sticker.dataUrl.startsWith('data:image/'));
}

export function defaultState(): AppState {
  const now = Date.now();
  const nowDate = new Date(now);
  const defaultWorld = createDefaultWorld(now);
  const defaultCharacters = createDefaultCharacters(defaultWorld.id, now);
  const defaultPromptPreset = createTavernSocialDefaultPromptPreset(now);
  const defaultGroupPromptPreset = createTavernSocialDefaultGroupPromptPreset(now);
  const defaultWorldPromptPreset = createTavernSocialDefaultWorldPromptPreset(now);
  return {
    worlds: [defaultWorld],
    characters: defaultCharacters,
    characterRelationships: [],
    characterRelationshipSuggestions: [],
    characterCardDrafts: [],
    commonStickers: [],
    userStickers: [],
    conversations: [],
    groupChats: [],
    groupMessages: [],
    characterDirectThreads: [],
    characterDirectMessages: [],
    messages: [],
    privateChatEventSuggestions: [],
    moments: [],
    worldEvents: [],
    timelineEntries: [],
    impactRecords: [],
    characterInteractions: [],
    characterStatuses: [],
    dailyBriefs: [],
    memorySummaries: [],
    activeWorldId: DEFAULT_WORLD_ID,
    activeCharacterId: defaultCharacters[0]?.id ?? '',
    activeGroupChatId: '',
    communicationIdentityByWorldId: {
      [DEFAULT_WORLD_ID]: 'user',
    },
    activeView: 'chat',
    chatReplyMode: 'auto',
    enterToSend: false,
    chatFontScale: DEFAULT_CHAT_FONT_SCALE,
    worldInteractionHighSimulation: false,
    worldInteractionNextAttemptAt: null,
    worldInteractionStatusReason: '角色互动循环保持克制，等待下一次自然检查。',
    companionTimeMode: 'system',
    virtualTimeMinutes: minutesFromDate(nowDate),
    userName: '我',
    userPersona: '',
    promptPresets: [defaultPromptPreset, defaultGroupPromptPreset, defaultWorldPromptPreset],
    activeChatPromptPresetId: defaultPromptPreset.id,
    chatPromptPresetEnabled: true,
    activeGroupPromptPresetId: defaultGroupPromptPreset.id,
    groupPromptPresetEnabled: true,
    activeWorldPromptPresetId: defaultWorldPromptPreset.id,
    worldPromptPresetEnabled: true,
    modelConfig: {
      provider: 'deepseek',
      apiUrl: DEEPSEEK_API_URL,
      apiKey: '',
      model: '',
      temperature: 0.75,
      dailyRequestLimit: 100,
    },
    modelUsage: {
      date: localDateKey(now),
      requestCount: 0,
    },
  };
}

function normalizeRelationshipStage(value: unknown): RelationshipStage {
  return value === 'familiar' || value === 'close' || value === 'intimate' || value === 'strained'
    ? value
    : 'stranger';
}

function normalizeRelationship(value: unknown): RelationshipState {
  const fallback = createDefaultRelationship();
  if (!isRecord(value)) {
    return fallback;
  }
  return {
    stage: normalizeRelationshipStage(value.stage),
    affinity: typeof value.affinity === 'number' && Number.isFinite(value.affinity)
      ? Math.max(0, Math.round(value.affinity))
      : 0,
    summary: typeof value.summary === 'string' ? value.summary : '',
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : fallback.updatedAt,
  };
}

function normalizeCharacterRelationshipSide(value: unknown): CharacterRelationshipSide {
  const now = Date.now();
  if (!isRecord(value)) {
    return { stage: 'stranger', summary: '', updatedAt: now };
  }
  return {
    stage: normalizeRelationshipStage(value.stage),
    summary: typeof value.summary === 'string' ? value.summary : '',
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : now,
  };
}

function canonicalCharacterPair(leftId: string, rightId: string): [string, string] {
  return leftId.localeCompare(rightId) <= 0 ? [leftId, rightId] : [rightId, leftId];
}

function characterRelationshipId(worldId: string, leftId: string, rightId: string): string {
  const [characterAId, characterBId] = canonicalCharacterPair(leftId, rightId);
  return `character_relationship_${stableHash(`${worldId}:${characterAId}:${characterBId}`)}`;
}

function normalizeCharacterRelationships(
  value: unknown,
  characters: CharacterProfile[],
  worlds: WorldProfile[],
): CharacterRelationshipRecord[] {
  if (!Array.isArray(value)) return [];
  const worldIds = new Set(worlds.map(world => world.id));
  const characterById = new Map(characters.map(character => [character.id, character]));
  const relationships = new Map<string, CharacterRelationshipRecord>();
  for (const item of value.filter(isRecord)) {
    const rawA = typeof item.characterAId === 'string' ? item.characterAId : '';
    const rawB = typeof item.characterBId === 'string' ? item.characterBId : '';
    if (!rawA || !rawB || rawA === rawB) continue;
    const left = characterById.get(rawA);
    const right = characterById.get(rawB);
    if (!left || !right || left.worldId !== right.worldId) continue;
    const worldId = typeof item.worldId === 'string' && worldIds.has(item.worldId) ? item.worldId : left.worldId;
    if (worldId !== left.worldId) continue;
    const [characterAId, characterBId] = canonicalCharacterPair(rawA, rawB);
    const id = characterRelationshipId(worldId, characterAId, characterBId);
    if (relationships.has(id)) continue;
    const aSide = rawA === characterAId ? item.aToB : item.bToA;
    const bSide = rawA === characterAId ? item.bToA : item.aToB;
    const aToB = normalizeCharacterRelationshipSide(aSide);
    const bToA = normalizeCharacterRelationshipSide(bSide);
    relationships.set(id, {
      id,
      worldId,
      characterAId,
      characterBId,
      aToB,
      bToA,
      updatedAt: typeof item.updatedAt === 'number'
        ? item.updatedAt
        : Math.max(aToB.updatedAt, bToA.updatedAt),
    });
  }
  return [...relationships.values()];
}

function normalizeCharacterRelationshipSuggestions(
  value: unknown,
  relationships: CharacterRelationshipRecord[],
  characters: CharacterProfile[],
  worlds: WorldProfile[],
): CharacterRelationshipStageSuggestion[] {
  if (!Array.isArray(value)) return [];
  const worldIds = new Set(worlds.map(world => world.id));
  const characterById = new Map(characters.map(character => [character.id, character]));
  const relationshipIds = new Set(relationships.map(relationship => relationship.id));
  return value.filter(isRecord).map(item => {
    const fromCharacterId = typeof item.fromCharacterId === 'string' ? item.fromCharacterId : '';
    const toCharacterId = typeof item.toCharacterId === 'string' ? item.toCharacterId : '';
    const from = characterById.get(fromCharacterId);
    const worldId = typeof item.worldId === 'string' && worldIds.has(item.worldId)
      ? item.worldId
      : from?.worldId ?? '';
    return {
      id: typeof item.id === 'string' ? item.id : nowId('relationship_suggestion'),
      worldId,
      relationshipId: typeof item.relationshipId === 'string' ? item.relationshipId : '',
      fromCharacterId,
      toCharacterId,
      suggestedStage: normalizeRelationshipStage(item.suggestedStage),
      reason: typeof item.reason === 'string' ? item.reason : '',
      sourceEventId: typeof item.sourceEventId === 'string' ? item.sourceEventId : '',
      createdAt: typeof item.createdAt === 'number' ? item.createdAt : Date.now(),
      appliedAt: typeof item.appliedAt === 'number' ? item.appliedAt : undefined,
      ignoredAt: typeof item.ignoredAt === 'number' ? item.ignoredAt : undefined,
    };
  }).filter(suggestion => {
    const from = characterById.get(suggestion.fromCharacterId);
    const to = characterById.get(suggestion.toCharacterId);
    return Boolean(
      suggestion.worldId
      && suggestion.relationshipId
      && relationshipIds.has(suggestion.relationshipId)
      && suggestion.fromCharacterId !== suggestion.toCharacterId
      && from
      && to
      && from.worldId === to.worldId
      && from.worldId === suggestion.worldId,
    );
  });
}

function normalizeCharacters(value: unknown): CharacterProfile[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isRecord).map(character => {
    const rawAutoMessage = isRecord(character.autoMessage) ? character.autoMessage : {};
    const normalized: CharacterProfile = {
    id: typeof character.id === 'string' ? character.id : `card_${stableHash(JSON.stringify(character))}`,
    worldId: typeof character.worldId === 'string' ? character.worldId : DEFAULT_WORLD_ID,
    name: typeof character.name === 'string' && character.name.trim() ? character.name.trim() : '未命名角色',
    avatar: typeof character.avatar === 'string' ? character.avatar : undefined,
    customAvatar: character.customAvatar === true,
    description: typeof character.description === 'string' ? character.description : undefined,
    age: typeof character.age === 'string' ? character.age : undefined,
    backgroundStory: typeof character.backgroundStory === 'string' ? character.backgroundStory : undefined,
    personality: typeof character.personality === 'string' ? character.personality : undefined,
    scenario: typeof character.scenario === 'string' ? character.scenario : undefined,
    firstMessage: typeof character.firstMessage === 'string' ? character.firstMessage : undefined,
    alternateGreetings: Array.isArray(character.alternateGreetings)
      ? character.alternateGreetings.filter((item): item is string => typeof item === 'string')
      : [],
    groupOnlyGreetings: Array.isArray(character.groupOnlyGreetings)
      ? character.groupOnlyGreetings.filter((item): item is string => typeof item === 'string')
      : [],
    nickname: typeof character.nickname === 'string' ? character.nickname : undefined,
    profileNote: typeof character.profileNote === 'string' ? character.profileNote : '',
    replyStrategy: typeof character.replyStrategy === 'string' ? character.replyStrategy : undefined,
    creator: typeof character.creator === 'string' ? character.creator : undefined,
    creatorNotes: typeof character.creatorNotes === 'string' ? character.creatorNotes : undefined,
    characterVersion: typeof character.characterVersion === 'string' ? character.characterVersion : undefined,
    systemPrompt: typeof character.systemPrompt === 'string' ? character.systemPrompt : undefined,
    postHistoryInstructions: typeof character.postHistoryInstructions === 'string'
      ? character.postHistoryInstructions
      : undefined,
    cardAssets: Array.isArray(character.cardAssets) ? character.cardAssets : [],
    cardSources: Array.isArray(character.cardSources)
      ? character.cardSources.filter((item): item is string => typeof item === 'string')
      : [],
    stickers: normalizeStickers(character.stickers),
    tags: Array.isArray(character.tags) ? character.tags.filter((tag): tag is string => typeof tag === 'string') : [],
    importInfo: {
      sourceFormat: isRecord(character.importInfo) && character.importInfo.sourceFormat === 'png' ? 'png' : 'json',
      spec: isRecord(character.importInfo) && typeof character.importInfo.spec === 'string'
        ? character.importInfo.spec
        : 'legacy',
      specVersion: isRecord(character.importInfo) && typeof character.importInfo.specVersion === 'string'
        ? character.importInfo.specVersion
        : '',
      worldBookEntryCount: isRecord(character.importInfo) && typeof character.importInfo.worldBookEntryCount === 'number'
        ? character.importInfo.worldBookEntryCount
        : 0,
      importedFileName: isRecord(character.importInfo) && typeof character.importInfo.importedFileName === 'string'
        ? character.importInfo.importedFileName
        : '',
    },
    characterBook: character.characterBook,
    relationship: normalizeRelationship(character.relationship),
    autoMessage: {
      ...createDefaultAutoMessageSchedule(),
      ...rawAutoMessage,
    },
    autoMoment: {
      ...createDefaultAutoMomentSchedule(),
      ...(isRecord(character.autoMoment) ? character.autoMoment : {}),
    },
    autoEvent: {
      ...createDefaultAutoEventSchedule(),
      ...(isRecord(character.autoEvent) ? character.autoEvent : {}),
    },
    currentPlan: normalizeCharacterPlan(
      character.currentPlan,
      typeof character.name === 'string' && character.name.trim() ? character.name.trim() : '未命名角色',
    ),
    rawCard: character.rawCard,
    importedAt: typeof character.importedAt === 'number' ? character.importedAt : Date.now(),
    };
    if (typeof rawAutoMessage.pacingStrategy !== 'string' || !rawAutoMessage.pacingStrategy.trim()) {
      normalized.autoMessage.pacingStrategy = createAutoMessagePacingStrategy(normalized);
    }
    migrateInlineSettingsToWorldBook(normalized);
    return normalized;
  });
}

const draftSteps: CharacterCardDraftStep[] = [
  'identity',
  'appearance',
  'personality',
  'hobbies',
  'palette',
  'reinterpretation',
  'preview',
];

function normalizeDrafts(value: unknown): CharacterCardDraft[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(draft => {
    const mode = 'simple' as const;
    const allowedSteps = ['identity', 'appearance', 'personality', 'hobbies', 'preview'];
    const rawCurrentStep = draft.currentStep === 'palette' || draft.currentStep === 'reinterpretation'
      ? 'personality'
      : draft.currentStep;
    // 小注释：旧复杂草稿会统一回到普通性格页；补充内容仍保存在兼容字段里。
    const currentStep = typeof rawCurrentStep === 'string'
      && draftSteps.includes(rawCurrentStep as CharacterCardDraftStep)
      && allowedSteps.includes(rawCurrentStep)
      ? rawCurrentStep as CharacterCardDraftStep
      : 'identity';
    const normalizeStepText = (input: unknown): Partial<Record<CharacterCardDraftStep, string>> => {
      if (!isRecord(input)) return {};
      return Object.fromEntries(draftSteps.flatMap(step =>
        typeof input[step] === 'string' ? [[step, input[step]]] : [],
      ));
    };
    const conversations: CharacterCardDraft['conversations'] = {};
    if (isRecord(draft.conversations)) {
      for (const step of draftSteps) {
        const exchanges = draft.conversations[step];
        if (!Array.isArray(exchanges)) continue;
        conversations[step] = exchanges.filter(isRecord).map(exchange => ({
          id: typeof exchange.id === 'string' ? exchange.id : nowId('exchange'),
          role: exchange.role === 'assistant' ? 'assistant' as const : 'user' as const,
          content: typeof exchange.content === 'string' ? exchange.content : '',
          createdAt: typeof exchange.createdAt === 'number' ? exchange.createdAt : Date.now(),
        })).filter(exchange => exchange.content.trim());
      }
    }
    const createdAt = typeof draft.createdAt === 'number' ? draft.createdAt : Date.now();
    return {
      id: typeof draft.id === 'string' ? draft.id : nowId('draft'),
      worldId: typeof draft.worldId === 'string' ? draft.worldId : DEFAULT_WORLD_ID,
      mode,
      currentStep,
      name: typeof draft.name === 'string' ? draft.name : '',
      concept: typeof draft.concept === 'string' ? draft.concept : '',
      age: typeof draft.age === 'string' ? draft.age : '',
      backgroundStory: typeof draft.backgroundStory === 'string' ? draft.backgroundStory : '',
      profileNote: typeof draft.profileNote === 'string' ? draft.profileNote : '',
      appearance: typeof draft.appearance === 'string' ? draft.appearance : '',
      personality: typeof draft.personality === 'string' ? draft.personality : '',
      hobbies: typeof draft.hobbies === 'string' ? draft.hobbies : '',
      palette: typeof draft.palette === 'string' ? draft.palette : '',
      reinterpretation: typeof draft.reinterpretation === 'string' ? draft.reinterpretation : '',
      firstMessage: typeof draft.firstMessage === 'string' ? draft.firstMessage : '',
      notes: normalizeStepText(draft.notes),
      candidates: normalizeStepText(draft.candidates),
      conversations,
      linkedCharacterId: typeof draft.linkedCharacterId === 'string' ? draft.linkedCharacterId : undefined,
      createdAt,
      updatedAt: typeof draft.updatedAt === 'number' ? draft.updatedAt : createdAt,
    };
  });
}

function normalizeGroupReplyLiveliness(value: unknown): GroupReplyLiveliness {
  return value === 'quiet' || value === 'natural' || value === 'lively' ? value : 'lively';
}

function normalizeGroupChats(value: unknown, fallbackWorldId: string): GroupChatProfile[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(chat => {
    const createdAt = typeof chat.createdAt === 'number' ? chat.createdAt : Date.now();
    const participantCharacterIds = Array.isArray(chat.participantCharacterIds)
      ? Array.from(new Set(chat.participantCharacterIds.filter((id): id is string => typeof id === 'string')))
      : [];
    const selectedSpeakerId = typeof chat.selectedSpeakerId === 'string' ? chat.selectedSpeakerId : 'user';
    return {
      id: typeof chat.id === 'string' ? chat.id : nowId('group'),
      worldId: typeof chat.worldId === 'string' ? chat.worldId : fallbackWorldId,
      title: typeof chat.title === 'string' && chat.title.trim() ? chat.title.trim() : '群聊',
      participantCharacterIds,
      selectedSpeakerId,
      replyLiveliness: normalizeGroupReplyLiveliness(chat.replyLiveliness),
      replyAllOnUserMessage: chat.replyAllOnUserMessage === true,
      allowModelInitiatedMessages: chat.allowModelInitiatedMessages === true,
      backgroundImage: normalizeChatBackgroundImage(chat.backgroundImage),
      createdAt,
      updatedAt: typeof chat.updatedAt === 'number' ? chat.updatedAt : createdAt,
    };
  }).filter(chat => chat.participantCharacterIds.length > 0 || chat.title.trim());
}

function normalizeGroupMessages(value: unknown, fallbackWorldId: string): GroupChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(message => {
    const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
    const speakerType = message.speakerType === 'character'
      ? 'character' as const
      : message.speakerType === 'system' ? 'system' as const : 'user' as const;
    const source = message.source === 'model'
      ? 'model' as const
      : message.source === 'auto_model'
        ? 'auto_model' as const
        : message.source === 'system' ? 'system' as const : 'user' as const;
    return {
      id: typeof message.id === 'string' ? message.id : nowId('gmsg'),
      groupChatId: typeof message.groupChatId === 'string' ? message.groupChatId : '',
      worldId: typeof message.worldId === 'string' ? message.worldId : fallbackWorldId,
      speakerType,
      speakerCharacterId: typeof message.speakerCharacterId === 'string' ? message.speakerCharacterId : undefined,
      content: typeof message.content === 'string' ? message.content : '',
      replyToId: typeof message.replyToId === 'string' ? message.replyToId : undefined,
      source,
      createdAt,
      recalledAt: typeof message.recalledAt === 'number' ? message.recalledAt : undefined,
    };
  }).filter(message => message.groupChatId && message.content.trim());
}

function canonicalDirectParticipants(firstCharacterId: string, secondCharacterId: string): [string, string] {
  return firstCharacterId.localeCompare(secondCharacterId) <= 0
    ? [firstCharacterId, secondCharacterId]
    : [secondCharacterId, firstCharacterId];
}

function characterDirectThreadIdFor(worldId: string, firstCharacterId: string, secondCharacterId: string): string {
  const [leftId, rightId] = canonicalDirectParticipants(firstCharacterId, secondCharacterId);
  return `character_direct_${stableHash(`${worldId}:${leftId}:${rightId}`)}`;
}

function validDirectParticipantIds(
  worldId: string,
  participantIds: string[],
  characters: CharacterProfile[],
): string[] {
  const validIds = new Set(characters.filter(character => character.worldId === worldId).map(character => character.id));
  const unique = Array.from(new Set(participantIds.filter(id => validIds.has(id))));
  if (unique.length !== 2 || unique[0] === unique[1]) return [];
  return canonicalDirectParticipants(unique[0], unique[1]);
}

function normalizeLastReadByCharacterId(value: unknown, participantIds: string[], fallback = 0): Record<string, number> {
  const raw = isRecord(value) ? value : {};
  return Object.fromEntries(participantIds.map(id => [
    id,
    typeof raw[id] === 'number' && Number.isFinite(raw[id]) ? raw[id] : fallback,
  ]));
}

function normalizeCharacterDirectThreads(
  value: unknown,
  fallbackWorldId: string,
  characters: CharacterProfile[],
): CharacterDirectThread[] {
  if (!Array.isArray(value)) return [];
  const byId = new Map<string, CharacterDirectThread>();
  for (const thread of value.filter(isRecord)) {
    const worldId = typeof thread.worldId === 'string' ? thread.worldId : fallbackWorldId;
    const rawParticipants = Array.isArray(thread.participantCharacterIds)
      ? thread.participantCharacterIds.filter((id): id is string => typeof id === 'string')
      : [];
    const participantCharacterIds = validDirectParticipantIds(worldId, rawParticipants, characters);
    if (participantCharacterIds.length !== 2) continue;
    const createdAt = typeof thread.createdAt === 'number' ? thread.createdAt : Date.now();
    const id = typeof thread.id === 'string' && thread.id.trim()
      ? thread.id
      : characterDirectThreadIdFor(worldId, participantCharacterIds[0], participantCharacterIds[1]);
    byId.set(id, {
      id,
      worldId,
      participantCharacterIds,
      lastReadByCharacterId: normalizeLastReadByCharacterId(thread.lastReadByCharacterId, participantCharacterIds, createdAt),
      lastAutoGeneratedAt: typeof thread.lastAutoGeneratedAt === 'number' ? thread.lastAutoGeneratedAt : undefined,
      createdAt,
      updatedAt: typeof thread.updatedAt === 'number' ? thread.updatedAt : createdAt,
    });
  }
  return [...byId.values()];
}

function normalizeCharacterDirectMessages(
  value: unknown,
  fallbackWorldId: string,
  threads: CharacterDirectThread[],
): CharacterDirectMessage[] {
  if (!Array.isArray(value)) return [];
  const threadById = new Map(threads.map(thread => [thread.id, thread]));
  const byId = new Map<string, CharacterDirectMessage>();
  for (const message of value.filter(isRecord)) {
    const threadId = typeof message.threadId === 'string' ? message.threadId : '';
    const thread = threadById.get(threadId);
    if (!thread) continue;
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content) continue;
    const speakerCharacterId = typeof message.speakerCharacterId === 'string' ? message.speakerCharacterId : '';
    if (!thread.participantCharacterIds.includes(speakerCharacterId)) continue;
    const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
    const source = message.source === 'auto_model'
      ? 'auto_model' as const
      : message.source === 'model' ? 'model' as const : 'manual' as const;
    const id = typeof message.id === 'string' && message.id.trim() ? message.id : nowId('dmsg');
    byId.set(id, {
      id,
      threadId,
      worldId: typeof message.worldId === 'string' ? message.worldId : thread.worldId || fallbackWorldId,
      speakerCharacterId,
      content,
      source,
      replyToId: typeof message.replyToId === 'string' ? message.replyToId : undefined,
      createdAt,
      recalledAt: typeof message.recalledAt === 'number' ? message.recalledAt : undefined,
    });
  }
  return [...byId.values()].sort((left, right) => left.createdAt - right.createdAt);
}

function legacyCharacterDirectDataFromPrivateChats(
  conversationsValue: unknown,
  messagesValue: unknown,
  characters: CharacterProfile[],
  fallbackWorldId: string,
): { threads: CharacterDirectThread[]; messages: CharacterDirectMessage[] } {
  if (!Array.isArray(conversationsValue) || !Array.isArray(messagesValue)) {
    return { threads: [], messages: [] };
  }
  const characterById = new Map(characters.map(character => [character.id, character]));
  const directConversationById = new Map<string, {
    conversationId: string;
    worldId: string;
    ownerCharacterId: string;
    targetCharacterId: string;
    createdAt: number;
    updatedAt: number;
    lastReadAt: number;
    threadId: string;
  }>();
  for (const conversation of conversationsValue.filter(isRecord)) {
    const targetCharacterId = typeof conversation.characterId === 'string' ? conversation.characterId : '';
    const ownerCharacterId = typeof conversation.ownerCharacterId === 'string' ? conversation.ownerCharacterId : '';
    const target = characterById.get(targetCharacterId);
    const owner = characterById.get(ownerCharacterId);
    if (!target || !owner || target.id === owner.id || target.worldId !== owner.worldId) continue;
    const worldId = typeof conversation.worldId === 'string' ? conversation.worldId : target.worldId || fallbackWorldId;
    if (worldId !== target.worldId) continue;
    const participantCharacterIds = canonicalDirectParticipants(owner.id, target.id);
    const threadId = characterDirectThreadIdFor(worldId, participantCharacterIds[0], participantCharacterIds[1]);
    const updatedAt = typeof conversation.updatedAt === 'number' ? conversation.updatedAt : Date.now();
    const conversationId = typeof conversation.id === 'string' ? conversation.id : '';
    if (!conversationId) continue;
    directConversationById.set(conversationId, {
      conversationId,
      worldId,
      ownerCharacterId: owner.id,
      targetCharacterId: target.id,
      createdAt: typeof conversation.createdAt === 'number' ? conversation.createdAt : updatedAt,
      updatedAt,
      lastReadAt: typeof conversation.lastReadAt === 'number' ? conversation.lastReadAt : updatedAt,
      threadId,
    });
  }
  const threadById = new Map<string, CharacterDirectThread>();
  for (const conversation of directConversationById.values()) {
    const participantCharacterIds = canonicalDirectParticipants(conversation.ownerCharacterId, conversation.targetCharacterId);
    const existing = threadById.get(conversation.threadId);
    threadById.set(conversation.threadId, {
      id: conversation.threadId,
      worldId: conversation.worldId,
      participantCharacterIds,
      lastReadByCharacterId: {
        ...(existing?.lastReadByCharacterId ?? {}),
        [conversation.ownerCharacterId]: Math.max(
          existing?.lastReadByCharacterId[conversation.ownerCharacterId] ?? 0,
          conversation.lastReadAt,
        ),
      },
      createdAt: Math.min(existing?.createdAt ?? conversation.createdAt, conversation.createdAt),
      updatedAt: Math.max(existing?.updatedAt ?? conversation.updatedAt, conversation.updatedAt),
    });
  }
  const messages: CharacterDirectMessage[] = [];
  for (const message of messagesValue.filter(isRecord)) {
    const conversationId = typeof message.conversationId === 'string' ? message.conversationId : '';
    const conversation = directConversationById.get(conversationId);
    if (!conversation) continue;
    const content = typeof message.content === 'string' ? message.content.trim() : '';
    if (!content) continue;
    const role = message.role === 'assistant' ? 'assistant' : 'user';
    const speakerCharacterId = role === 'assistant'
      ? conversation.targetCharacterId
      : typeof message.speakerCharacterId === 'string'
        && [conversation.ownerCharacterId, conversation.targetCharacterId].includes(message.speakerCharacterId)
        ? message.speakerCharacterId
        : conversation.ownerCharacterId;
    const source = role === 'assistant'
      ? 'model' as const
      : message.source === 'auto_message' ? 'auto_model' as const : 'manual' as const;
    const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
    const rawMessageId = typeof message.id === 'string' ? message.id : `${conversationId}:${createdAt}:${content}`;
    messages.push({
      id: `legacy_direct_${stableHash(`${conversation.threadId}:${rawMessageId}`)}`,
      threadId: conversation.threadId,
      worldId: conversation.worldId,
      speakerCharacterId,
      content,
      source,
      replyToId: typeof message.replyToId === 'string'
        ? `legacy_direct_${stableHash(`${conversation.threadId}:${message.replyToId}`)}`
        : undefined,
      createdAt,
      recalledAt: typeof message.recalledAt === 'number' ? message.recalledAt : undefined,
    });
  }
  return { threads: [...threadById.values()], messages };
}

function normalizeTimelineEntryType(value: unknown): TimelineEntryType {
  return value === 'chat'
    || value === 'group_chat'
    || value === 'moment'
    || value === 'comment'
    || value === 'event'
    || value === 'relationship'
    || value === 'auto_message'
    || value === 'daily_brief'
    || value === 'character_status'
    || value === 'character_interaction'
    || value === 'system'
    || value === 'manual_note'
    ? value
    : 'system';
}

function normalizeTimelineSourceRef(value: unknown): TimelineSourceRef {
  if (!isRecord(value)) return { type: 'system', id: '' };
  const type = value.type === 'message'
    || value.type === 'group_message'
    || value.type === 'direct_chat'
    || value.type === 'moment'
    || value.type === 'comment'
    || value.type === 'event'
    || value.type === 'relationship'
    || value.type === 'brief'
    || value.type === 'status'
    || value.type === 'interaction'
    || value.type === 'manual'
    ? value.type
    : 'system';
  return {
    type,
    id: typeof value.id === 'string' ? value.id : '',
  };
}

function normalizeCharacterNames(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter((entry): entry is [string, string] =>
      typeof entry[0] === 'string' && typeof entry[1] === 'string',
    ),
  );
}

function normalizeCommunicationIdentityByWorldId(
  value: unknown,
  worlds: WorldProfile[],
  characters: CharacterProfile[],
): Record<string, string> {
  const raw: Record<string, unknown> = isRecord(value) ? value : {};
  const charactersByWorld = new Map<string, Set<string>>();
  for (const world of worlds) {
    charactersByWorld.set(world.id, new Set());
  }
  for (const character of characters) {
    if (!charactersByWorld.has(character.worldId)) continue;
    charactersByWorld.get(character.worldId)?.add(character.id);
  }
  const result: Record<string, string> = {};
  for (const world of worlds) {
    const rawStored = raw[world.id];
    const stored = typeof rawStored === 'string' ? rawStored : 'user';
    const valid = stored === 'user' || Boolean(charactersByWorld.get(world.id)?.has(stored));
    result[world.id] = valid ? stored : 'user';
  }
  return result;
}

function normalizeTimelineEntries(value: unknown, fallbackWorldId: string): TimelineEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(entry => ({
    id: typeof entry.id === 'string' ? entry.id : nowId('timeline'),
    worldId: typeof entry.worldId === 'string' ? entry.worldId : fallbackWorldId,
    createdAt: typeof entry.createdAt === 'number' ? entry.createdAt : Date.now(),
    type: normalizeTimelineEntryType(entry.type),
    characterIds: Array.isArray(entry.characterIds)
      ? entry.characterIds.filter((id): id is string => typeof id === 'string')
      : [],
    characterNames: normalizeCharacterNames(entry.characterNames),
    title: typeof entry.title === 'string' && entry.title.trim() ? entry.title : '世界记录',
    summary: typeof entry.summary === 'string' ? entry.summary : '',
    source: normalizeTimelineSourceRef(entry.source),
    canUndo: entry.canUndo === true,
    includeInContext: entry.includeInContext !== false,
    revokedAt: typeof entry.revokedAt === 'number' ? entry.revokedAt : undefined,
  })).filter(entry => entry.summary.trim() || entry.title.trim());
}

function normalizeImpactValue(value: unknown): unknown {
  if (
    value === null
    || typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
  ) {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(normalizeImpactValue);
  }
  if (!isRecord(value)) return null;
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key, normalizeImpactValue(item)]),
  );
}

function normalizeImpactTargetType(value: unknown): ImpactTargetType {
  return value === 'relationship'
    || value === 'character_relationship'
    || value === 'character_relationship_suggestion'
    || value === 'timeline_entry'
    || value === 'message'
    || value === 'character_status'
    ? value
    : 'timeline_entry';
}

function normalizeImpactRecords(value: unknown, fallbackWorldId: string): ImpactRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(record => {
    const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
    return {
      id: typeof record.id === 'string' ? record.id : nowId('impact'),
      worldId: typeof record.worldId === 'string' ? record.worldId : fallbackWorldId,
      operationId: typeof record.operationId === 'string' && record.operationId.trim()
        ? record.operationId.trim()
        : nowId('operation'),
      label: typeof record.label === 'string' && record.label.trim() ? record.label.trim() : '影响记录',
      source: normalizeTimelineSourceRef(record.source),
      targetType: normalizeImpactTargetType(record.targetType),
      targetId: typeof record.targetId === 'string' ? record.targetId : '',
      characterId: typeof record.characterId === 'string' ? record.characterId : undefined,
      field: typeof record.field === 'string' ? record.field : undefined,
      oldValue: normalizeImpactValue(record.oldValue),
      newValue: normalizeImpactValue(record.newValue),
      timelineEntryIds: Array.isArray(record.timelineEntryIds)
        ? record.timelineEntryIds.filter((id): id is string => typeof id === 'string')
        : [],
      createdAt,
      rolledBackAt: typeof record.rolledBackAt === 'number' ? record.rolledBackAt : undefined,
    };
  }).filter(record => record.targetId);
}

function normalizeCharacterInteractionType(value: unknown): CharacterInteractionType {
  return value === 'world_event'
    || value === 'mention'
    || value === 'background_scene'
    ? value
    : 'moment_comment';
}

function normalizeCharacterInteractions(value: unknown, fallbackWorldId: string): CharacterInteractionRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(record => {
    const createdAt = typeof record.createdAt === 'number' ? record.createdAt : Date.now();
    return {
      id: typeof record.id === 'string' ? record.id : nowId('interaction'),
      worldId: typeof record.worldId === 'string' ? record.worldId : fallbackWorldId,
      type: normalizeCharacterInteractionType(record.type),
      actorCharacterId: typeof record.actorCharacterId === 'string' ? record.actorCharacterId : '',
      targetCharacterIds: Array.isArray(record.targetCharacterIds)
        ? Array.from(new Set(record.targetCharacterIds.filter((id): id is string => typeof id === 'string')))
        : [],
      title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : '角色互动',
      summary: typeof record.summary === 'string' ? record.summary : '',
      reason: typeof record.reason === 'string' ? record.reason : '',
      source: normalizeTimelineSourceRef(record.source),
      timelineEntryId: typeof record.timelineEntryId === 'string' ? record.timelineEntryId : undefined,
      createdAt,
    };
  }).filter(record => record.actorCharacterId || record.targetCharacterIds.length > 0);
}

function normalizeMomentVisibilityMode(value: unknown): MomentVisibilityMode {
  return value === 'friends'
    || value === 'specific'
    || value === 'blocked'
    || value === 'private'
    ? value
    : 'public';
}

function normalizeMomentVisibility(value: unknown): MomentVisibility {
  if (!isRecord(value)) {
    return { mode: 'public', characterIds: [], blockedCharacterIds: [] };
  }
  return {
    mode: normalizeMomentVisibilityMode(value.mode),
    characterIds: Array.isArray(value.characterIds)
      ? Array.from(new Set(value.characterIds.filter((id): id is string => typeof id === 'string')))
      : [],
    blockedCharacterIds: Array.isArray(value.blockedCharacterIds)
      ? Array.from(new Set(value.blockedCharacterIds.filter((id): id is string => typeof id === 'string')))
      : [],
  };
}

function normalizeStringArray(value: unknown, maxItems = 8): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    .map(item => item.trim())
    .slice(0, maxItems);
}

function normalizeCharacterStatuses(value: unknown, fallbackWorldId: string): CharacterStatusSummary[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(status => {
    const stage = status.relationshipStage;
    const relationshipStage: RelationshipStage = stage === 'familiar' || stage === 'close' || stage === 'intimate' || stage === 'strained'
      ? stage
      : 'stranger';
    const updatedAt = typeof status.updatedAt === 'number' ? status.updatedAt : Date.now();
    return {
      id: typeof status.id === 'string' ? status.id : nowId('status'),
      worldId: typeof status.worldId === 'string' ? status.worldId : fallbackWorldId,
      characterId: typeof status.characterId === 'string' ? status.characterId : '',
      mood: typeof status.mood === 'string' && status.mood.trim() ? status.mood.trim() : '近况安静',
      relationshipStage,
      affinity: typeof status.affinity === 'number' && Number.isFinite(status.affinity)
        ? Math.max(0, Math.round(status.affinity))
        : 0,
      relationshipSummary: typeof status.relationshipSummary === 'string' ? status.relationshipSummary : '',
      recentMemoryTitles: normalizeStringArray(status.recentMemoryTitles, 3),
      unresolvedItems: normalizeStringArray(status.unresolvedItems, 6),
      nextInclination: typeof status.nextInclination === 'string' && status.nextInclination.trim()
        ? status.nextInclination.trim()
        : '暂时保持自己的节奏。',
      activeSources: normalizeStringArray(status.activeSources, 6),
      summary: typeof status.summary === 'string' ? status.summary : '',
      source: status.source === 'model' ? 'model' as const : 'rule' as const,
      updatedAt,
    };
  }).filter(status => status.characterId);
}

function normalizeDailyBriefs(value: unknown, fallbackWorldId: string): DailyBrief[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(brief => {
    const createdAt = typeof brief.createdAt === 'number' ? brief.createdAt : Date.now();
    return {
      id: typeof brief.id === 'string' ? brief.id : nowId('brief'),
      worldId: typeof brief.worldId === 'string' ? brief.worldId : fallbackWorldId,
      dateKey: typeof brief.dateKey === 'string' && brief.dateKey.trim() ? brief.dateKey.trim() : localDateKey(createdAt),
      title: typeof brief.title === 'string' && brief.title.trim() ? brief.title.trim() : '今日简报',
      summary: typeof brief.summary === 'string' ? brief.summary : '',
      sections: normalizeStringArray(brief.sections, 12),
      suggestedCharacterIds: Array.isArray(brief.suggestedCharacterIds)
        ? brief.suggestedCharacterIds.filter((id): id is string => typeof id === 'string')
        : [],
      unreadCount: typeof brief.unreadCount === 'number' && Number.isFinite(brief.unreadCount)
        ? Math.max(0, Math.round(brief.unreadCount))
        : 0,
      changeCount: typeof brief.changeCount === 'number' && Number.isFinite(brief.changeCount)
        ? Math.max(0, Math.round(brief.changeCount))
        : 0,
      timelineEntryId: typeof brief.timelineEntryId === 'string' ? brief.timelineEntryId : undefined,
      createdAt,
      updatedAt: typeof brief.updatedAt === 'number' ? brief.updatedAt : createdAt,
    };
  }).filter(brief => brief.dateKey);
}

function normalizeSummaryLayer(value: unknown): MemorySummary['layer'] {
  return value === 'middle' || value === 'macro' ? value : 'micro';
}

function normalizeMemorySummaryStatus(value: unknown, layer: MemorySummary['layer']): MemorySummaryStatus {
  if (value === 'paused' || value === 'pending_confirmation' || value === 'active') return value;
  return layer === 'macro' ? 'pending_confirmation' : 'active';
}

function normalizeMemorySummaryScope(value: unknown, layer: MemorySummary['layer']): MemorySummaryScope {
  if (
    value === 'character'
    || value === 'event'
    || value === 'relationship'
    || value === 'world'
    || value === 'chapter'
    || value === 'conversation'
  ) {
    return value;
  }
  return layer === 'macro' ? 'world' : 'character';
}

function normalizeMemorySummaries(value: unknown, fallbackWorldId: string): MemorySummary[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(summary => {
    const layer = normalizeSummaryLayer(summary.layer);
    const status = normalizeMemorySummaryStatus(summary.status, layer);
    const createdAt = typeof summary.createdAt === 'number' ? summary.createdAt : Date.now();
    const includeInContext = status === 'pending_confirmation'
      ? false
      : summary.includeInContext !== false;
    return {
      id: typeof summary.id === 'string' && summary.id.trim() ? summary.id : nowId('memory_summary'),
      worldId: typeof summary.worldId === 'string' ? summary.worldId : fallbackWorldId,
      layer,
      scope: normalizeMemorySummaryScope(summary.scope, layer),
      targetId: typeof summary.targetId === 'string' ? summary.targetId : '',
      characterIds: normalizeStringArray(summary.characterIds, 12),
      sourceTimelineEntryIds: normalizeStringArray(summary.sourceTimelineEntryIds, 24),
      sourceSummaryIds: normalizeStringArray(summary.sourceSummaryIds, 24),
      title: typeof summary.title === 'string' && summary.title.trim()
        ? summary.title.trim()
        : layer === 'macro' ? '世界大结' : layer === 'middle' ? '角色中结' : '片段小结',
      factSummary: typeof summary.factSummary === 'string' ? summary.factSummary : '',
      emotionalLine: typeof summary.emotionalLine === 'string' ? summary.emotionalLine : '',
      unresolvedItems: normalizeStringArray(summary.unresolvedItems, 8),
      nextHook: typeof summary.nextHook === 'string' ? summary.nextHook : '',
      includeInContext,
      status,
      createdAt,
      updatedAt: typeof summary.updatedAt === 'number' ? summary.updatedAt : createdAt,
    };
  }).filter(summary => summary.worldId);
}

function defaultEventChoices(type: WorldEventType, affinityDelta: number): WorldEventChoice[] {
  const primary = affinityDelta !== 0 ? affinityDelta : type === 'relationship' || type === 'problem' ? 4 : 2;
  return [
    { id: nowId('choice'), label: '介入处理', intent: '主动介入这件事，并让它产生明确后续。', affinityDelta: primary },
    { id: nowId('choice'), label: '留作记录', intent: '只把它记录成岛上近期发生过的生活片段。', affinityDelta: 0 },
  ];
}

function normalizeWorldEventRpMessages(value: unknown): WorldEvent['rpMessages'] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map((message): WorldEvent['rpMessages'][number] => {
    const content = typeof message.content === 'string' ? message.content : '';
    const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
    const variants = Array.isArray(message.variants)
      ? message.variants.filter(isRecord).map(variant => ({
        id: typeof variant.id === 'string' ? variant.id : nowId('variant'),
        content: typeof variant.content === 'string' ? variant.content : content,
        createdAt: typeof variant.createdAt === 'number' ? variant.createdAt : createdAt,
      })).filter(variant => variant.content.trim())
      : [];
    const normalizedVariants = variants.length > 0
      ? variants
      : [{
        id: nowId('variant'),
        content,
        createdAt,
      }];
    const activeVariantIndex = typeof message.activeVariantIndex === 'number'
      ? Math.max(0, Math.min(normalizedVariants.length - 1, Math.round(message.activeVariantIndex)))
      : normalizedVariants.length - 1;
    const activeVariant = normalizedVariants[activeVariantIndex] ?? normalizedVariants[0];
    return {
      id: typeof message.id === 'string' ? message.id : nowId('event_rp'),
      role: message.role === 'assistant' || message.role === 'system' ? message.role : 'user',
      content: activeVariant.content,
      characterId: typeof message.characterId === 'string' ? message.characterId : undefined,
      speaker: typeof message.speaker === 'string' ? message.speaker : undefined,
      variants: normalizedVariants,
      activeVariantIndex,
      createdAt,
      source: message.source === 'model' || message.source === 'system' ? message.source : 'manual',
    };
  }).filter(message => message.content.trim().length > 0);
}

function normalizeWorldEventLeadActor(value: unknown): WorldEvent['leadActor'] {
  if (!isRecord(value)) return undefined;
  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : '';
  if (value.type === 'user') {
    return {
      type: 'user',
      id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : 'user',
      name: name || '我',
    };
  }
  const characterId = typeof value.characterId === 'string' && value.characterId.trim()
    ? value.characterId.trim()
    : typeof value.id === 'string' && value.id.trim()
      ? value.id.trim()
      : '';
  if (value.type !== 'character' || !characterId) return undefined;
  return {
    type: 'character',
    id: characterId,
    characterId,
    name: name || '角色',
  };
}

function normalizeWorldEventType(value: unknown): WorldEventType {
  return value === 'relationship' || value === 'problem' || value === 'news' ? value : 'daily';
}

function normalizePrivateChatEventSuggestionStatus(value: unknown): PrivateChatEventSuggestionStatus {
  return value === 'accepted' || value === 'dismissed' ? value : 'pending';
}

function normalizePrivateChatEventSuggestionSourceKind(value: unknown): PrivateChatEventSuggestionSourceKind {
  return value === 'character_direct' ? 'character_direct' : 'private_chat';
}

function normalizePrivateChatEventSuggestions(
  value: unknown,
  fallbackWorldId: string,
  worlds: WorldProfile[],
  characters: CharacterProfile[],
): PrivateChatEventSuggestion[] {
  if (!Array.isArray(value)) return [];
  const worldIds = new Set(worlds.map(world => world.id));
  return value.filter(isRecord).map(item => {
    const worldId = typeof item.worldId === 'string' && worldIds.has(item.worldId)
      ? item.worldId
      : fallbackWorldId;
    const characterIds = new Set(
      characters
        .filter(character => character.worldId === worldId)
        .map(character => character.id),
    );
    const participantCharacterIds = Array.isArray(item.participantCharacterIds)
      ? [...new Set(item.participantCharacterIds.filter((id): id is string =>
        typeof id === 'string' && characterIds.has(id),
      ))]
      : [];
    const title = typeof item.title === 'string' && item.title.trim() ? item.title.trim() : '';
    const description = typeof item.description === 'string' && item.description.trim() ? item.description.trim() : '';
    const createdAt = typeof item.createdAt === 'number' ? item.createdAt : Date.now();
    const status = normalizePrivateChatEventSuggestionStatus(item.status);
    return {
      id: typeof item.id === 'string' && item.id.trim() ? item.id : nowId('private_event_suggestion'),
      worldId,
      sourceKind: normalizePrivateChatEventSuggestionSourceKind(item.sourceKind),
      threadId: typeof item.threadId === 'string' ? item.threadId : '',
      sourceMessageId: typeof item.sourceMessageId === 'string' ? item.sourceMessageId : '',
      sourceMessageRole: item.sourceMessageRole === 'assistant' ? 'assistant' as const : 'user' as const,
      triggerCharacterId: typeof item.triggerCharacterId === 'string' && characterIds.has(item.triggerCharacterId)
        ? item.triggerCharacterId
        : undefined,
      title,
      description,
      eventType: normalizeWorldEventType(item.eventType ?? item.type),
      participantCharacterIds,
      leadActor: normalizeWorldEventLeadActor(item.leadActor),
      affinityDelta: typeof item.affinityDelta === 'number'
        ? Math.max(-20, Math.min(20, Math.round(item.affinityDelta)))
        : 0,
      reason: typeof item.reason === 'string' ? item.reason.trim() : '',
      status,
      createdEventId: typeof item.createdEventId === 'string' ? item.createdEventId : undefined,
      resolvedAt: typeof item.resolvedAt === 'number' ? item.resolvedAt : undefined,
      createdAt,
      updatedAt: typeof item.updatedAt === 'number' ? item.updatedAt : createdAt,
    };
  }).filter(suggestion =>
    suggestion.worldId
    && suggestion.threadId
    && suggestion.sourceMessageId
    && suggestion.title
    && suggestion.description,
  );
}

export function normalizeState(input: unknown): AppState {
  const fallback = defaultState();
  const parsed = isRecord(input) ? input as Partial<AppState> : {};
  const rawActiveView = isRecord(input) ? (input as Record<string, unknown>).activeView : undefined;
  const worlds = Array.isArray(parsed.worlds) && parsed.worlds.length > 0
    ? parsed.worlds.filter(isRecord).map(world => ({
      id: typeof world.id === 'string' ? world.id : nowId('world'),
      name: typeof world.name === 'string' && world.name.trim() ? world.name : '未命名世界',
      description: typeof world.description === 'string' ? world.description : '',
      worldLore: typeof world.worldLore === 'string' ? world.worldLore : '',
      userPersona: typeof world.userPersona === 'string' ? world.userPersona.trim() : '',
      currentLocation: typeof world.currentLocation === 'string' && world.currentLocation.trim()
        ? world.currentLocation.trim()
        : '日常生活场景',
      sceneAtmosphere: typeof world.sceneAtmosphere === 'string' && world.sceneAtmosphere.trim()
        ? world.sceneAtmosphere.trim()
        : '轻松、自然、适合日常 RP',
      sceneSummary: typeof world.sceneSummary === 'string' && world.sceneSummary.trim()
        ? world.sceneSummary.trim()
        : '',
      location: normalizeWeatherLocation(world.location),
      weather: normalizeWeatherSnapshot(world.weather),
      createdAt: typeof world.createdAt === 'number' ? world.createdAt : Date.now(),
      updatedAt: typeof world.updatedAt === 'number' ? world.updatedAt : Date.now(),
    }))
    : fallback.worlds;
  const activeWorldId = typeof parsed.activeWorldId === 'string'
    && worlds.some(world => world.id === parsed.activeWorldId)
    ? parsed.activeWorldId
    : worlds[0].id;
  const modelConfig: Record<string, unknown> = isRecord(parsed.modelConfig) ? parsed.modelConfig : {};
  const rawModelApiUrl = typeof modelConfig.apiUrl === 'string' ? modelConfig.apiUrl : '';
  const modelProvider = normalizeModelProvider(modelConfig.provider, rawModelApiUrl);
  const modelUsage: Record<string, unknown> = isRecord(parsed.modelUsage) ? parsed.modelUsage : {};
  const chatReplyMode: ChatReplyMode = parsed.chatReplyMode === 'manual' ? 'manual' : 'auto';
  const enterToSend = parsed.enterToSend === true;
  const chatFontScale = normalizeChatFontScale(parsed.chatFontScale);
  const worldInteractionHighSimulation = parsed.worldInteractionHighSimulation === true;
  const worldInteractionNextAttemptAt = typeof parsed.worldInteractionNextAttemptAt === 'number'
    ? parsed.worldInteractionNextAttemptAt
    : null;
  const worldInteractionStatusReason = typeof parsed.worldInteractionStatusReason === 'string'
    ? parsed.worldInteractionStatusReason
    : '角色互动循环保持克制，等待下一次自然检查。';
  const companionTimeMode: CompanionTimeMode = normalizeCompanionTimeMode(parsed.companionTimeMode);
  const virtualTimeMinutes = clampVirtualTimeMinutes(parsed.virtualTimeMinutes, fallback.virtualTimeMinutes);
  const hasStoredPromptPresets = Array.isArray(parsed.promptPresets);
  let promptPresets: PromptPreset[] = hasStoredPromptPresets
    ? normalizePromptPresets(parsed.promptPresets)
    : fallback.promptPresets;
  if (promptPresets.length === 0) {
    promptPresets = [
      createTavernSocialDefaultPromptPreset(Date.now()),
      createTavernSocialDefaultGroupPromptPreset(Date.now()),
      createTavernSocialDefaultWorldPromptPreset(Date.now()),
    ];
  }
  if (!promptPresets.some(preset => preset.id === TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID)) {
    promptPresets = [...promptPresets, createTavernSocialDefaultGroupPromptPreset(Date.now())];
  }
  if (!promptPresets.some(preset => preset.id === TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID)) {
    promptPresets = [...promptPresets, createTavernSocialDefaultWorldPromptPreset(Date.now())];
  }
  const activeChatPromptPresetId = typeof parsed.activeChatPromptPresetId === 'string'
    && promptPresets.some(preset => preset.id === parsed.activeChatPromptPresetId)
    ? parsed.activeChatPromptPresetId
    : promptPresets.find(preset => preset.id === TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID)?.id
      ?? promptPresets[0]?.id
      ?? '';
  const activeGroupPromptPresetId = typeof parsed.activeGroupPromptPresetId === 'string'
    && promptPresets.some(preset => preset.id === parsed.activeGroupPromptPresetId)
    ? parsed.activeGroupPromptPresetId
    : promptPresets.find(preset => preset.id === TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID)?.id
      ?? activeChatPromptPresetId;
  const activeWorldPromptPresetId = typeof parsed.activeWorldPromptPresetId === 'string'
    && promptPresets.some(preset => preset.id === parsed.activeWorldPromptPresetId)
    ? parsed.activeWorldPromptPresetId
    : promptPresets.find(preset => preset.id === TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID)?.id
      ?? activeChatPromptPresetId;
  const defaultChatPromptPresetEnabled = !hasStoredPromptPresets
    && activeChatPromptPresetId === TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID;
  const legacyUserPersona = typeof parsed.userPersona === 'string' ? parsed.userPersona.trim() : '';
  if (legacyUserPersona) {
    const activeWorldForPersona = worlds.find(world => world.id === activeWorldId);
    if (activeWorldForPersona && !activeWorldForPersona.userPersona.trim()) {
      activeWorldForPersona.userPersona = legacyUserPersona;
    }
  }
  const groupChats = normalizeGroupChats(parsed.groupChats, activeWorldId);
  const activeGroupChatId = typeof parsed.activeGroupChatId === 'string'
    && groupChats.some(chat => chat.id === parsed.activeGroupChatId && chat.worldId === activeWorldId)
    ? parsed.activeGroupChatId
    : groupChats.find(chat => chat.worldId === activeWorldId)?.id ?? '';
  const characters = normalizeCharacters(parsed.characters);
  const communicationIdentityByWorldId = normalizeCommunicationIdentityByWorldId(
    parsed.communicationIdentityByWorldId,
    worlds,
    characters,
  );
  const characterRelationships = normalizeCharacterRelationships(parsed.characterRelationships, characters, worlds);
  const characterRelationshipSuggestions = normalizeCharacterRelationshipSuggestions(
    parsed.characterRelationshipSuggestions,
    characterRelationships,
    characters,
    worlds,
  );
  const legacyCharacterDirectData = legacyCharacterDirectDataFromPrivateChats(
    parsed.conversations,
    parsed.messages,
    characters,
    activeWorldId,
  );
  const characterDirectThreads = normalizeCharacterDirectThreads(
    [
      ...(Array.isArray(parsed.characterDirectThreads) ? parsed.characterDirectThreads : []),
      ...legacyCharacterDirectData.threads,
    ],
    activeWorldId,
    characters,
  );
  const characterDirectMessages = normalizeCharacterDirectMessages(
    [
      ...(Array.isArray(parsed.characterDirectMessages) ? parsed.characterDirectMessages : []),
      ...legacyCharacterDirectData.messages,
    ],
    activeWorldId,
    characterDirectThreads,
  );

  return {
    ...fallback,
    worlds,
    characters,
    characterRelationships,
    characterRelationshipSuggestions,
    characterCardDrafts: normalizeDrafts(parsed.characterCardDrafts),
    commonStickers: normalizeStickers(parsed.commonStickers),
    userStickers: normalizeStickers(parsed.userStickers),
    conversations: Array.isArray(parsed.conversations)
      ? parsed.conversations.filter(isRecord).map(conversation => {
        const updatedAt = typeof conversation.updatedAt === 'number' ? conversation.updatedAt : Date.now();
        const worldId = typeof conversation.worldId === 'string' ? conversation.worldId : activeWorldId;
        const characterId = typeof conversation.characterId === 'string' ? conversation.characterId : '';
        const rawOwnerCharacterId = typeof conversation.ownerCharacterId === 'string'
          ? conversation.ownerCharacterId
          : undefined;
        const ownerCharacterId = rawOwnerCharacterId
          && rawOwnerCharacterId !== characterId
          && characters.some(character => character.id === rawOwnerCharacterId && character.worldId === worldId)
          ? rawOwnerCharacterId
          : undefined;
        return {
          id: typeof conversation.id === 'string' ? conversation.id : nowId('conversation'),
          worldId,
          characterId,
          ownerCharacterId,
          backgroundImage: normalizeChatBackgroundImage(conversation.backgroundImage),
          createdAt: typeof conversation.createdAt === 'number' ? conversation.createdAt : updatedAt,
          updatedAt,
          lastReadAt: typeof conversation.lastReadAt === 'number' ? conversation.lastReadAt : updatedAt,
        };
      })
      : [],
    groupChats,
    groupMessages: normalizeGroupMessages(parsed.groupMessages, activeWorldId),
    characterDirectThreads,
    characterDirectMessages,
    messages: Array.isArray(parsed.messages)
      ? parsed.messages
        .filter(message => isRecord(message) && message.source !== 'imported_first_message')
        .map(message => {
          const content = typeof message.content === 'string' ? message.content : '';
          const stickerId = typeof message.stickerId === 'string' ? message.stickerId : undefined;
          const createdAt = typeof message.createdAt === 'number' ? message.createdAt : Date.now();
          const role = message.role === 'assistant' || message.role === 'system' ? message.role : 'user';
          // Big comment: A private chat still targets one character; these optional fields only preserve the selected speaking identity.
          const speakerType = role === 'user' && message.speakerType === 'character' ? 'character' as const : 'user' as const;
          const speakerCharacterId = speakerType === 'character' && typeof message.speakerCharacterId === 'string'
            ? message.speakerCharacterId
            : undefined;
          const variants = Array.isArray(message.variants)
            ? message.variants.filter(isRecord).map(variant => ({
              id: typeof variant.id === 'string' ? variant.id : nowId('variant'),
              content: typeof variant.content === 'string' ? variant.content : content,
              stickerId: typeof variant.stickerId === 'string' ? variant.stickerId : undefined,
              createdAt: typeof variant.createdAt === 'number' ? variant.createdAt : createdAt,
            })).filter(variant => variant.content.trim() || variant.stickerId)
            : [];
          const normalizedVariants = variants.length > 0
            ? variants
            : [{
              id: nowId('variant'),
              content,
              stickerId,
              createdAt,
            }];
          const activeVariantIndex = typeof message.activeVariantIndex === 'number'
            ? Math.max(0, Math.min(normalizedVariants.length - 1, Math.round(message.activeVariantIndex)))
            : normalizedVariants.length - 1;
          const activeVariant = normalizedVariants[activeVariantIndex] ?? normalizedVariants[0];
          return {
          id: typeof message.id === 'string' ? message.id : nowId('msg'),
          conversationId: typeof message.conversationId === 'string' ? message.conversationId : '',
          characterId: typeof message.characterId === 'string' ? message.characterId : '',
          role,
          speakerType: role === 'user' ? speakerType : undefined,
          speakerCharacterId,
          content: activeVariant.content,
          stickerId: activeVariant.stickerId,
          autoReason: typeof message.autoReason === 'string' ? message.autoReason : undefined,
          impactRevokedAt: typeof message.impactRevokedAt === 'number' ? message.impactRevokedAt : undefined,
          replyToId: typeof message.replyToId === 'string' ? message.replyToId : undefined,
          variants: normalizedVariants,
          activeVariantIndex,
          recalledAt: typeof message.recalledAt === 'number' ? message.recalledAt : undefined,
          createdAt,
          source: message.source === 'model_reply'
            || message.source === 'generated_opening'
            || message.source === 'auto_message'
            ? message.source
            : 'user',
          };
        })
      : [],
    privateChatEventSuggestions: normalizePrivateChatEventSuggestions(
      parsed.privateChatEventSuggestions,
      activeWorldId,
      worlds,
      characters,
    ),
    moments: Array.isArray(parsed.moments)
      ? parsed.moments.filter(isRecord).map(moment => ({
        id: typeof moment.id === 'string' ? moment.id : nowId('moment'),
        worldId: typeof moment.worldId === 'string' ? moment.worldId : activeWorldId,
        characterId: typeof moment.characterId === 'string' ? moment.characterId : '',
        content: typeof moment.content === 'string' ? moment.content : '',
        createdAt: typeof moment.createdAt === 'number' ? moment.createdAt : Date.now(),
        source: moment.source === 'character' || moment.source === 'auto_character' || moment.source === 'system'
          ? moment.source
          : 'manual',
        visibility: normalizeMomentVisibility(moment.visibility),
        comments: Array.isArray(moment.comments)
          ? moment.comments.filter(isRecord).map(comment => ({
            id: typeof comment.id === 'string' ? comment.id : nowId('comment'),
            momentId: typeof comment.momentId === 'string' ? comment.momentId : String(moment.id ?? ''),
            authorType: comment.authorType === 'character' ? 'character' as const : 'user' as const,
            characterId: typeof comment.characterId === 'string' ? comment.characterId : '',
            replyToCommentId: typeof comment.replyToCommentId === 'string' ? comment.replyToCommentId : undefined,
            content: typeof comment.content === 'string' ? comment.content : '',
            createdAt: typeof comment.createdAt === 'number' ? comment.createdAt : Date.now(),
            source: comment.source === 'model' ? 'model' as const : 'manual' as const,
          }))
          : [],
      }))
      : [],
    worldEvents: Array.isArray(parsed.worldEvents)
      ? parsed.worldEvents.filter(isRecord).map(event => {
        const type: WorldEventType = event.type === 'relationship' || event.type === 'problem' || event.type === 'news'
          ? event.type
          : 'daily';
        const affinityDelta = typeof event.affinityDelta === 'number'
          ? Math.max(-20, Math.min(20, event.affinityDelta))
          : 0;
        const choices = Array.isArray(event.choices)
          ? event.choices.filter(isRecord).map(choice => ({
            id: typeof choice.id === 'string' ? choice.id : nowId('choice'),
            label: typeof choice.label === 'string' && choice.label.trim() ? choice.label : '介入一下',
            intent: typeof choice.intent === 'string' ? choice.intent : '',
            affinityDelta: typeof choice.affinityDelta === 'number'
              ? Math.max(-20, Math.min(20, Math.round(choice.affinityDelta)))
              : 0,
          }))
          : [];
        return {
          id: typeof event.id === 'string' ? event.id : nowId('event'),
          worldId: typeof event.worldId === 'string' ? event.worldId : activeWorldId,
          title: typeof event.title === 'string' && event.title.trim() ? event.title : '未命名事件',
          description: typeof event.description === 'string' ? event.description : '',
          type,
          participantCharacterIds: Array.isArray(event.participantCharacterIds)
            ? event.participantCharacterIds.filter((id): id is string => typeof id === 'string')
            : [],
          leadActor: normalizeWorldEventLeadActor(event.leadActor),
          affinityDelta,
          choices: choices.length > 0 ? choices : defaultEventChoices(type, affinityDelta),
          decision: isRecord(event.decision)
            ? {
              choiceId: typeof event.decision.choiceId === 'string' ? event.decision.choiceId : '',
              label: typeof event.decision.label === 'string' ? event.decision.label : '已处理',
              result: typeof event.decision.result === 'string' ? event.decision.result : '',
              affinityDelta: typeof event.decision.affinityDelta === 'number'
                ? Math.max(-20, Math.min(20, Math.round(event.decision.affinityDelta)))
                : 0,
              createdAt: typeof event.decision.createdAt === 'number' ? event.decision.createdAt : Date.now(),
              source: event.decision.source === 'manual' ? 'manual' as const : 'model' as const,
            }
            : undefined,
          rpMessages: normalizeWorldEventRpMessages(event.rpMessages),
          resultSummary: typeof event.resultSummary === 'string' ? event.resultSummary : undefined,
          modelError: typeof event.modelError === 'string' ? event.modelError : undefined,
          status: event.status === 'resolved' ? 'resolved' as const : 'active' as const,
          createdAt: typeof event.createdAt === 'number' ? event.createdAt : Date.now(),
          updatedAt: typeof event.updatedAt === 'number'
            ? event.updatedAt
            : typeof event.createdAt === 'number' ? event.createdAt : Date.now(),
          resolvedAt: typeof event.resolvedAt === 'number' ? event.resolvedAt : null,
          source: event.source === 'auto_model' ? 'auto_model' as const : event.source === 'model' ? 'model' as const : 'manual' as const,
        };
      })
      : [],
    timelineEntries: normalizeTimelineEntries(parsed.timelineEntries, activeWorldId),
    impactRecords: normalizeImpactRecords(parsed.impactRecords, activeWorldId),
    characterInteractions: normalizeCharacterInteractions(parsed.characterInteractions, activeWorldId),
    characterStatuses: normalizeCharacterStatuses(parsed.characterStatuses, activeWorldId),
    dailyBriefs: normalizeDailyBriefs(parsed.dailyBriefs, activeWorldId),
    memorySummaries: normalizeMemorySummaries(parsed.memorySummaries, activeWorldId),
    activeWorldId,
    activeCharacterId: typeof parsed.activeCharacterId === 'string' ? parsed.activeCharacterId : '',
    activeGroupChatId,
    communicationIdentityByWorldId,
    activeView: rawActiveView === 'events' || rawActiveView === 'timeline'
      ? 'world'
      : rawActiveView === 'groups'
      || rawActiveView === 'moments'
      || rawActiveView === 'world'
      ? rawActiveView
      : 'chat',
    chatReplyMode,
    enterToSend,
    chatFontScale,
    worldInteractionHighSimulation,
    worldInteractionNextAttemptAt,
    worldInteractionStatusReason,
    companionTimeMode,
    virtualTimeMinutes,
    userName: typeof parsed.userName === 'string' && parsed.userName.trim() ? parsed.userName : fallback.userName,
    userPersona: legacyUserPersona,
    promptPresets,
    activeChatPromptPresetId,
    chatPromptPresetEnabled: (parsed.chatPromptPresetEnabled === true || defaultChatPromptPresetEnabled)
      && Boolean(activeChatPromptPresetId),
    activeGroupPromptPresetId,
    groupPromptPresetEnabled: (typeof parsed.groupPromptPresetEnabled === 'boolean'
      ? parsed.groupPromptPresetEnabled
      : true) && Boolean(activeGroupPromptPresetId),
    activeWorldPromptPresetId,
    worldPromptPresetEnabled: (typeof parsed.worldPromptPresetEnabled === 'boolean'
      ? parsed.worldPromptPresetEnabled
      : true) && Boolean(activeWorldPromptPresetId),
    modelConfig: {
      provider: modelProvider,
      apiUrl: rawModelApiUrl.trim() || (modelProvider === 'deepseek' ? DEEPSEEK_API_URL : ''),
      apiKey: typeof modelConfig.apiKey === 'string' ? modelConfig.apiKey : '',
      model: typeof modelConfig.model === 'string' ? modelConfig.model : '',
      temperature: typeof modelConfig.temperature === 'number' ? modelConfig.temperature : 0.75,
      dailyRequestLimit: typeof modelConfig.dailyRequestLimit === 'number'
        ? Math.max(1, Math.floor(modelConfig.dailyRequestLimit))
        : 100,
    },
    modelUsage: {
      date: typeof modelUsage.date === 'string' ? modelUsage.date : localDateKey(),
      requestCount: typeof modelUsage.requestCount === 'number' ? Math.max(0, modelUsage.requestCount) : 0,
    },
  };
}

export function loadState(): AppState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : defaultState();
  } catch {
    return defaultState();
  }
}

export let state = loadState();

export function saveState(): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function replaceState(nextState: AppState): void {
  state = normalizeState(nextState);
  saveState();
}

export function resetDailyModelUsage(now = Date.now()): void {
  const today = localDateKey(now);
  if (state.modelUsage.date !== today) {
    state.modelUsage = { date: today, requestCount: 0 };
  }
}

export function hasModelBudget(now = Date.now()): boolean {
  resetDailyModelUsage(now);
  return state.modelUsage.requestCount < state.modelConfig.dailyRequestLimit;
}

export function recordModelRequest(now = Date.now()): void {
  resetDailyModelUsage(now);
  state.modelUsage.requestCount += 1;
  saveState();
}

export function activeWorld(): WorldProfile {
  return state.worlds.find(world => world.id === state.activeWorldId) ?? state.worlds[0] ?? createDefaultWorld(Date.now());
}

export function communicationActorId(worldId = activeWorld().id): string {
  const stored = state.communicationIdentityByWorldId[worldId] ?? 'user';
  if (
    stored !== 'user'
    && !state.characters.some(character => character.id === stored && character.worldId === worldId)
  ) {
    state.communicationIdentityByWorldId[worldId] = 'user';
    return 'user';
  }
  return stored;
}

export function communicationActor(worldId = activeWorld().id): CommunicationActor {
  const actorId = communicationActorId(worldId);
  if (actorId !== 'user') {
    const character = state.characters.find(item => item.id === actorId && item.worldId === worldId);
    if (character) return { type: 'character', id: character.id, character };
  }
  return { type: 'user', id: 'user' };
}

export function setCommunicationActor(worldId: string, actorId: string): string {
  const world = state.worlds.find(item => item.id === worldId);
  if (!world) return 'user';
  const normalized = actorId !== 'user'
    && state.characters.some(character => character.id === actorId && character.worldId === world.id)
    ? actorId
    : 'user';
  state.communicationIdentityByWorldId[world.id] = normalized;
  saveState();
  return normalized;
}

export function activeCharacter(): CharacterProfile | undefined {
  const worldId = activeWorld().id;
  return state.characters.find(character => character.id === state.activeCharacterId && character.worldId === worldId)
    ?? state.characters.find(character => character.worldId === worldId);
}

export function groupChatsForActiveWorld(): GroupChatProfile[] {
  const worldId = activeWorld().id;
  return state.groupChats
    .filter(chat => chat.worldId === worldId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function activeGroupChat(): GroupChatProfile | undefined {
  const worldId = activeWorld().id;
  return state.groupChats.find(chat => chat.id === state.activeGroupChatId && chat.worldId === worldId)
    ?? groupChatsForActiveWorld()[0];
}

export function ensureGroupChat(): GroupChatProfile {
  const existing = activeGroupChat();
  if (existing) {
    state.activeGroupChatId = existing.id;
    return existing;
  }
  const world = activeWorld();
  const characterIds = state.characters
    .filter(character => character.worldId === world.id)
    .map(character => character.id);
  const now = Date.now();
  const chat: GroupChatProfile = {
    id: `group_${stableHash(`${world.id}:default`)}`,
    worldId: world.id,
      title: `${world.name} 群聊`,
      participantCharacterIds: characterIds,
      selectedSpeakerId: 'user',
      replyLiveliness: 'lively',
      replyAllOnUserMessage: false,
    allowModelInitiatedMessages: false,
    createdAt: now,
    updatedAt: now,
  };
  state.groupChats.push(chat);
  state.activeGroupChatId = chat.id;
  saveState();
  return chat;
}

export function groupMessagesFor(groupChatId: string): GroupChatMessage[] {
  return state.groupMessages
    .filter(message => message.groupChatId === groupChatId && !message.recalledAt)
    .sort((left, right) => left.createdAt - right.createdAt);
}

export function ensureWorldExists(worldId: string): void {
  if (state.worlds.some(world => world.id === worldId)) {
    return;
  }
  const now = Date.now();
  state.worlds.push({
    id: worldId,
    name: '未命名世界',
    description: '',
    worldLore: '',
    userPersona: '',
    currentLocation: '日常生活场景',
    sceneAtmosphere: '轻松、自然、适合日常 RP',
    sceneSummary: '',
    createdAt: now,
    updatedAt: now,
  });
  state.communicationIdentityByWorldId[worldId] = 'user';
}

export function createWorld(name: string, description = ''): WorldProfile {
  const now = Date.now();
  const world = {
    id: nowId('world'),
    name: name.trim() || '新世界',
    description: description.trim(),
    worldLore: '',
    userPersona: '',
    currentLocation: '日常生活场景',
    sceneAtmosphere: '轻松、自然、适合日常 RP',
    sceneSummary: '',
    createdAt: now,
    updatedAt: now,
  };
  state.worlds.push(world);
  state.activeWorldId = world.id;
  state.activeCharacterId = '';
  state.activeGroupChatId = '';
  state.communicationIdentityByWorldId[world.id] = 'user';
  saveState();
  return world;
}

export function setActiveWorld(worldId: string): boolean {
  if (!state.worlds.some(world => world.id === worldId)) {
    return false;
  }
  state.activeWorldId = worldId;
  state.activeCharacterId = state.characters.find(character => character.worldId === worldId)?.id ?? '';
  state.activeGroupChatId = state.groupChats.find(chat => chat.worldId === worldId)?.id ?? '';
  communicationActorId(worldId);
  saveState();
  return true;
}

export function setActiveView(view: AppState['activeView']): void {
  state.activeView = view;
  saveState();
}

export function deleteWorld(worldId: string): { ok: boolean; reason?: string } {
  if (state.worlds.length <= 1) {
    return { ok: false, reason: '至少需要保留一个世界。' };
  }
  if (!state.worlds.some(world => world.id === worldId)) {
    return { ok: false, reason: '找不到要删除的世界。' };
  }
  const characterIds = new Set(state.characters.filter(character => character.worldId === worldId).map(character => character.id));
  const conversationIds = new Set(state.conversations.filter(item => item.worldId === worldId).map(item => item.id));
  state.worlds = state.worlds.filter(world => world.id !== worldId);
  delete state.communicationIdentityByWorldId[worldId];
  state.characters = state.characters.filter(character => character.worldId !== worldId);
  state.characterRelationships = state.characterRelationships.filter(relationship => relationship.worldId !== worldId);
  state.characterRelationshipSuggestions = state.characterRelationshipSuggestions.filter(suggestion => suggestion.worldId !== worldId);
  state.characterCardDrafts = state.characterCardDrafts.filter(draft => draft.worldId !== worldId);
  state.conversations = state.conversations.filter(item => item.worldId !== worldId);
  state.groupChats = state.groupChats.filter(chat => chat.worldId !== worldId);
  state.groupMessages = state.groupMessages.filter(message => message.worldId !== worldId);
  state.characterDirectThreads = state.characterDirectThreads.filter(thread => thread.worldId !== worldId);
  state.characterDirectMessages = state.characterDirectMessages.filter(message => message.worldId !== worldId);
  state.messages = state.messages.filter(message =>
    !characterIds.has(message.characterId) && !conversationIds.has(message.conversationId),
  );
  state.privateChatEventSuggestions = state.privateChatEventSuggestions.filter(suggestion => suggestion.worldId !== worldId);
  state.moments = state.moments.filter(moment => moment.worldId !== worldId);
  state.worldEvents = state.worldEvents.filter(event => event.worldId !== worldId);
  state.timelineEntries = state.timelineEntries.filter(entry => entry.worldId !== worldId);
  state.impactRecords = state.impactRecords.filter(record => record.worldId !== worldId);
  state.characterInteractions = state.characterInteractions.filter(record => record.worldId !== worldId);
  state.characterStatuses = state.characterStatuses.filter(status => status.worldId !== worldId);
  state.dailyBriefs = state.dailyBriefs.filter(brief => brief.worldId !== worldId);
  state.memorySummaries = state.memorySummaries.filter(summary => summary.worldId !== worldId);
  if (state.activeWorldId === worldId) {
    state.activeWorldId = state.worlds[0].id;
    state.activeCharacterId = state.characters.find(character => character.worldId === state.activeWorldId)?.id ?? '';
    state.activeGroupChatId = state.groupChats.find(chat => chat.worldId === state.activeWorldId)?.id ?? '';
    communicationActorId(state.activeWorldId);
  }
  saveState();
  return { ok: true };
}

export function privateConversationActorIdFor(character: CharacterProfile, actorId = 'user'): string {
  // 大注释：私聊窗口按“通讯身份 -> 目标角色”隔离；角色本人不能拥有发给自己的私聊窗口。
  if (
    actorId !== 'user'
    && actorId !== character.id
    && state.characters.some(item => item.id === actorId && item.worldId === character.worldId)
  ) {
    return actorId;
  }
  return 'user';
}

function conversationOwnerKey(conversation: ConversationProfile): string {
  return conversation.ownerCharacterId ?? 'user';
}

export function ensureConversation(character: CharacterProfile, actorId = 'user'): ConversationProfile {
  const ownerId = privateConversationActorIdFor(character, actorId);
  const existing = state.conversations.find(item =>
    item.characterId === character.id
    && item.worldId === character.worldId
    && conversationOwnerKey(item) === ownerId,
  );
  if (existing) {
    return existing;
  }
  const now = Date.now();
  const conversation = {
    id: `conversation_${stableHash(`${character.worldId}:${ownerId}:${character.id}`)}`,
    worldId: character.worldId,
    characterId: character.id,
    ownerCharacterId: ownerId === 'user' ? undefined : ownerId,
    createdAt: now,
    updatedAt: now,
    lastReadAt: now,
  };
  state.conversations.push(conversation);
  return conversation;
}

export function conversationFor(characterId: string, actorId = 'user'): ConversationProfile | undefined {
  const character = state.characters.find(item => item.id === characterId);
  if (!character) return undefined;
  const ownerId = privateConversationActorIdFor(character, actorId);
  return state.conversations.find(item =>
    item.characterId === characterId
    && item.worldId === character.worldId
    && conversationOwnerKey(item) === ownerId,
  );
}

export function messagesFor(characterId: string, actorId = 'user') {
  const character = state.characters.find(item => item.id === characterId);
  const conversation = character ? conversationFor(characterId, actorId) : undefined;
  if (!conversation) return [];
  return state.messages.filter(message =>
    message.characterId === characterId
    && (!conversation || message.conversationId === conversation.id)
    && message.role !== 'system',
  );
}

export function unreadCountFor(characterId: string, actorId = 'user'): number {
  const conversation = conversationFor(characterId, actorId);
  if (!conversation) return 0;
  return state.messages.filter(message =>
    message.conversationId === conversation.id
    && message.characterId === characterId
    && message.role === 'assistant'
    && !message.impactRevokedAt
    && message.createdAt > conversation.lastReadAt,
  ).length;
}

export function markConversationRead(characterId: string, readAt = Date.now(), actorId = 'user'): void {
  const character = state.characters.find(item => item.id === characterId);
  if (!character) return;
  const conversation = ensureConversation(character, actorId);
  const latestMessageAt = messagesFor(characterId, actorId).reduce(
    (latest, message) => Math.max(latest, message.createdAt),
    0,
  );
  conversation.lastReadAt = Math.max(conversation.lastReadAt, readAt, latestMessageAt);
  saveState();
}
