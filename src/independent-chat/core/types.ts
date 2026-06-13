/**
 * 大注释：Core type module.
 * Defines shared data contracts for chat, characters, worlds, moments, events, memory, and settings.
 */
export type MessageRole = 'user' | 'assistant' | 'system';

export type NotificationPrivacy = 'full' | 'generic' | 'hide_character';

export type PacingState = 'normal' | 'probe' | 'waiting' | 'cooldown' | 'silent';

export type ChatReplyMode = 'auto' | 'manual';

export type RelationshipStage = 'stranger' | 'familiar' | 'close' | 'intimate' | 'strained';

export type TimelineEntryType =
  | 'chat'
  | 'group_chat'
  | 'moment'
  | 'comment'
  | 'event'
  | 'relationship'
  | 'auto_message'
  | 'daily_brief'
  | 'character_status'
  | 'character_interaction'
  | 'system'
  | 'manual_note';

export interface TimelineSourceRef {
  type: 'message' | 'group_message' | 'moment' | 'comment' | 'event' | 'relationship' | 'brief' | 'status' | 'interaction' | 'system' | 'manual';
  id: string;
}

export interface TimelineEntry {
  id: string;
  worldId: string;
  createdAt: number;
  type: TimelineEntryType;
  characterIds: string[];
  characterNames: Record<string, string>;
  title: string;
  summary: string;
  source: TimelineSourceRef;
  canUndo: boolean;
  includeInContext: boolean;
  revokedAt?: number;
}

export type MemorySuggestionStatus = 'pending' | 'accepted' | 'dismissed';
export type MemorySuggestionTrigger = 'event_resolved' | 'manual_note' | 'chat_message' | 'manual_tidy';

export interface MemorySuggestion {
  id: string;
  worldId: string;
  trigger: MemorySuggestionTrigger;
  source: TimelineSourceRef;
  title: string;
  summary: string;
  reason: string;
  characterIds: string[];
  includeInContext: boolean;
  status: MemorySuggestionStatus;
  acceptedTimelineEntryId?: string;
  acceptedAt?: number;
  dismissedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export type ImpactTargetType =
  | 'relationship'
  | 'character_relationship'
  | 'character_relationship_suggestion'
  | 'timeline_entry'
  | 'message'
  | 'character_status';

export interface ImpactRecord {
  id: string;
  worldId: string;
  operationId: string;
  label: string;
  source: TimelineSourceRef;
  targetType: ImpactTargetType;
  targetId: string;
  characterId?: string;
  field?: string;
  oldValue: unknown;
  newValue: unknown;
  timelineEntryIds: string[];
  createdAt: number;
  rolledBackAt?: number;
}

export interface RelationshipState {
  stage: RelationshipStage;
  affinity: number;
  summary: string;
  updatedAt: number;
}

export interface CharacterRelationshipSide {
  stage: RelationshipStage;
  summary: string;
  updatedAt: number;
}

export interface CharacterRelationshipRecord {
  id: string;
  worldId: string;
  characterAId: string;
  characterBId: string;
  aToB: CharacterRelationshipSide;
  bToA: CharacterRelationshipSide;
  updatedAt: number;
}

export interface CharacterRelationshipStageSuggestion {
  id: string;
  worldId: string;
  relationshipId: string;
  fromCharacterId: string;
  toCharacterId: string;
  suggestedStage: RelationshipStage;
  reason: string;
  sourceEventId: string;
  createdAt: number;
  appliedAt?: number;
  ignoredAt?: number;
}

export interface QuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface AutoMessageSchedule {
  enabled: boolean;
  baseIntervalMin: number;
  baseIntervalMax: number;
  quietHours: QuietHours;
  dailyLimit: number;
  maxInterval: number;
  backgroundNotificationsEnabled: boolean;
  notificationPrivacy: NotificationPrivacy;
  nextAttemptAt: number | null;
  lastSentAt: number | null;
  lastUserReplyAt: number | null;
  unansweredCount: number;
  currentPacingState: PacingState;
  pacingReason: string;
  pacingStrategy: string;
  pendingResetDecision: boolean;
}

export interface AutoMomentSchedule {
  enabled: boolean;
  baseIntervalMin: number;
  baseIntervalMax: number;
  quietHours: QuietHours;
  dailyLimit: number;
  nextAttemptAt: number | null;
  lastPostedAt: number | null;
  statusReason: string;
}

export interface AutoEventSchedule {
  enabled: boolean;
  baseIntervalMin: number;
  baseIntervalMax: number;
  quietHours: QuietHours;
  dailyLimit: number;
  nextAttemptAt: number | null;
  lastGeneratedAt: number | null;
  statusReason: string;
}

export interface WorldWeatherLocation {
  name: string;
  country: string;
  admin1?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
}

export interface WorldWeatherSnapshot {
  temperatureC: number;
  apparentTemperatureC?: number;
  relativeHumidity?: number;
  windSpeedKmh?: number;
  weatherCode?: number;
  weatherText: string;
  isDay?: boolean;
  observedAt: string;
  fetchedAt: number;
  source: 'open-meteo';
}

export interface WorldProfile {
  id: string;
  name: string;
  description: string;
  // Big comment: World lore is shared by every character in the same world; it is intentionally separate from per-character world books.
  worldLore: string;
  userPersona: string;
  currentLocation: string;
  sceneAtmosphere: string;
  sceneSummary: string;
  location?: WorldWeatherLocation;
  weather?: WorldWeatherSnapshot;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterImportInfo {
  sourceFormat: 'json' | 'png';
  spec: string;
  specVersion: string;
  worldBookEntryCount: number;
  importedFileName: string;
}

export type CharacterCurrentPlanSource = 'rule' | 'model';

export interface CharacterCurrentPlan {
  text: string;
  updatedAt: number;
  source: CharacterCurrentPlanSource;
}

export interface StickerAsset {
  id: string;
  name: string;
  note?: string;
  dataUrl: string;
  importedAt: number;
}

export interface CharacterProfile {
  id: string;
  worldId: string;
  name: string;
  avatar?: string;
  customAvatar?: boolean;
  description?: string;
  age?: string;
  backgroundStory?: string;
  personality?: string;
  scenario?: string;
  firstMessage?: string;
  alternateGreetings?: string[];
  groupOnlyGreetings?: string[];
  nickname?: string;
  profileNote?: string;
  replyStrategy?: string;
  creator?: string;
  creatorNotes?: string;
  characterVersion?: string;
  systemPrompt?: string;
  postHistoryInstructions?: string;
  cardAssets?: unknown[];
  cardSources?: string[];
  stickers?: StickerAsset[];
  tags: string[];
  importInfo: CharacterImportInfo;
  characterBook?: unknown;
  relationship: RelationshipState;
  autoMessage: AutoMessageSchedule;
  autoMoment: AutoMomentSchedule;
  autoEvent: AutoEventSchedule;
  currentPlan: CharacterCurrentPlan;
  rawCard?: unknown;
  importedAt: number;
}

export interface CharacterStatusSummary {
  id: string;
  worldId: string;
  characterId: string;
  mood: string;
  relationshipStage: RelationshipStage;
  affinity: number;
  relationshipSummary: string;
  recentMemoryTitles: string[];
  unresolvedItems: string[];
  nextInclination: string;
  activeSources: string[];
  summary: string;
  source: 'rule' | 'model';
  updatedAt: number;
}

export interface DailyBrief {
  id: string;
  worldId: string;
  dateKey: string;
  title: string;
  summary: string;
  sections: string[];
  suggestedCharacterIds: string[];
  unreadCount: number;
  changeCount: number;
  timelineEntryId?: string;
  createdAt: number;
  updatedAt: number;
}

export type CharacterCardDraftMode = 'simple';

export type CharacterCardDraftStep =
  | 'identity'
  | 'appearance'
  | 'personality'
  | 'hobbies'
  | 'palette'
  | 'reinterpretation'
  | 'preview';

export interface AuthoringExchange {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface CharacterCardDraft {
  id: string;
  worldId: string;
  mode: CharacterCardDraftMode;
  currentStep: CharacterCardDraftStep;
  name: string;
  concept: string;
  age: string;
  backgroundStory: string;
  profileNote: string;
  appearance: string;
  personality: string;
  hobbies: string;
  palette: string;
  reinterpretation: string;
  firstMessage: string;
  notes: Partial<Record<CharacterCardDraftStep, string>>;
  candidates: Partial<Record<CharacterCardDraftStep, string>>;
  conversations: Partial<Record<CharacterCardDraftStep, AuthoringExchange[]>>;
  linkedCharacterId?: string;
  createdAt: number;
  updatedAt: number;
}

export interface ConversationProfile {
  id: string;
  worldId: string;
  characterId: string;
  // Big comment: undefined means the user persona owns this private chat; a character id means that character's view owns it.
  ownerCharacterId?: string;
  backgroundImage?: string;
  createdAt: number;
  updatedAt: number;
  lastReadAt: number;
}

export interface GroupChatProfile {
  id: string;
  worldId: string;
  title: string;
  participantCharacterIds: string[];
  selectedSpeakerId: string;
  replyAllOnUserMessage: boolean;
  allowModelInitiatedMessages: boolean;
  backgroundImage?: string;
  createdAt: number;
  updatedAt: number;
}

export interface GroupChatMessage {
  id: string;
  groupChatId: string;
  worldId: string;
  speakerType: 'user' | 'character' | 'system';
  speakerCharacterId?: string;
  content: string;
  replyToId?: string;
  source: 'user' | 'model' | 'auto_model' | 'system';
  createdAt: number;
  recalledAt?: number;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  characterId: string;
  role: MessageRole;
  // Big comment: characterId is the target window; conversationId isolates the current communication identity's view.
  speakerType?: 'user' | 'character';
  speakerCharacterId?: string;
  content: string;
  stickerId?: string;
  autoReason?: string;
  impactRevokedAt?: number;
  replyToId?: string;
  variants?: ChatMessageVariant[];
  activeVariantIndex?: number;
  recalledAt?: number;
  createdAt: number;
  source: 'user' | 'model_reply' | 'generated_opening' | 'imported_first_message' | 'auto_message';
}

export interface ChatMessageVariant {
  id: string;
  content: string;
  stickerId?: string;
  createdAt: number;
}

export type MomentVisibilityMode = 'public' | 'friends' | 'specific' | 'blocked' | 'private';

export interface MomentVisibility {
  mode: MomentVisibilityMode;
  characterIds: string[];
  blockedCharacterIds: string[];
}

export interface MomentEntry {
  id: string;
  worldId: string;
  characterId: string;
  content: string;
  createdAt: number;
  source: 'manual' | 'character' | 'auto_character' | 'system';
  visibility: MomentVisibility;
  comments: MomentComment[];
}

export interface MomentComment {
  id: string;
  momentId: string;
  authorType: 'user' | 'character';
  characterId: string;
  replyToCommentId?: string;
  content: string;
  createdAt: number;
  source: 'manual' | 'model';
}

export type CharacterInteractionType = 'moment_comment' | 'world_event' | 'mention' | 'background_scene';

export interface CharacterInteractionRecord {
  id: string;
  worldId: string;
  type: CharacterInteractionType;
  actorCharacterId: string;
  targetCharacterIds: string[];
  title: string;
  summary: string;
  reason: string;
  source: TimelineSourceRef;
  timelineEntryId?: string;
  createdAt: number;
}

export type WorldEventStatus = 'active' | 'resolved';
export type WorldEventType = 'daily' | 'relationship' | 'problem' | 'news';

export interface WorldEventChoice {
  id: string;
  label: string;
  intent: string;
  affinityDelta: number;
}

export interface WorldEventDecision {
  choiceId: string;
  label: string;
  result: string;
  affinityDelta: number;
  relationshipStageSuggestions?: Array<{
    fromCharacterId: string;
    toCharacterId: string;
    suggestedStage: RelationshipStage;
    reason: string;
  }>;
  createdAt: number;
  source: 'model' | 'manual';
}

export interface WorldEventRpMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  characterId?: string;
  speaker?: string;
  createdAt: number;
  source: 'manual' | 'model' | 'system';
}

export interface WorldEventLeadActor {
  type: 'user' | 'character';
  id: string;
  name: string;
  characterId?: string;
}

export interface WorldEvent {
  id: string;
  worldId: string;
  title: string;
  description: string;
  type: WorldEventType;
  participantCharacterIds: string[];
  leadActor?: WorldEventLeadActor;
  affinityDelta: number;
  choices: WorldEventChoice[];
  decision?: WorldEventDecision;
  // 大注释：世界 RP 的正文记录挂在事件上，而不是挂在私聊会话上，避免私聊内容污染世界舞台。
  rpMessages: WorldEventRpMessage[];
  resultSummary?: string;
  modelError?: string;
  status: WorldEventStatus;
  createdAt: number;
  updatedAt: number;
  resolvedAt: number | null;
  source: 'manual' | 'model' | 'auto_model';
}

export type WorldChapterStatus = 'active' | 'ended';
export type WorldSceneStatus = 'active' | 'ended';

export interface WorldChapterScene {
  id: string;
  chapterId: string;
  worldId: string;
  title: string;
  summary: string;
  sourceEventId?: string;
  status: WorldSceneStatus;
  startedAt: number;
  endedAt?: number;
}

export interface WorldChapter {
  id: string;
  worldId: string;
  title: string;
  summary: string;
  activeSceneId: string;
  status: WorldChapterStatus;
  scenes: WorldChapterScene[];
  createdAt: number;
  updatedAt: number;
  endedAt?: number;
}

export type ModelProvider = 'deepseek' | 'custom';

export type CompanionTimeMode = 'system' | 'virtual';

export interface ModelConfig {
  provider: ModelProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  dailyRequestLimit: number;
}

export interface ModelUsage {
  date: string;
  requestCount: number;
}

export interface PromptPresetPrompt {
  identifier: string;
  name: string;
  role: ModelMessage['role'];
  content: string;
  enabled: boolean;
  defaultEnabled: boolean;
  marker: boolean;
  systemPrompt: boolean;
  position: number;
}

export interface PromptPresetOrderItem {
  identifier: string;
  enabled: boolean;
}

export interface PromptPresetRegexScript {
  id: string;
  name: string;
  enabled: boolean;
  findRegex: string;
  replaceString: string;
  promptOnly: boolean;
  markdownOnly: boolean;
  raw?: unknown;
}

export interface PromptPreset {
  id: string;
  name: string;
  sourceFileName: string;
  importedAt: number;
  prompts: PromptPresetPrompt[];
  regexScripts: PromptPresetRegexScript[];
  order: PromptPresetOrderItem[];
  extensionKeys: string[];
  regexScriptCount: number;
  hasSPreset: boolean;
  parameterSummary: Record<string, unknown>;
  raw: unknown;
}

export interface AppState {
  worlds: WorldProfile[];
  characters: CharacterProfile[];
  characterRelationships: CharacterRelationshipRecord[];
  characterRelationshipSuggestions: CharacterRelationshipStageSuggestion[];
  characterCardDrafts: CharacterCardDraft[];
  commonStickers: StickerAsset[];
  userStickers: StickerAsset[];
  conversations: ConversationProfile[];
  groupChats: GroupChatProfile[];
  groupMessages: GroupChatMessage[];
  messages: ChatMessage[];
  moments: MomentEntry[];
  worldEvents: WorldEvent[];
  worldChapters: WorldChapter[];
  timelineEntries: TimelineEntry[];
  impactRecords: ImpactRecord[];
  characterInteractions: CharacterInteractionRecord[];
  characterStatuses: CharacterStatusSummary[];
  dailyBriefs: DailyBrief[];
  memorySuggestions: MemorySuggestion[];
  activeWorldId: string;
  activeWorldChapterIdByWorldId: Record<string, string>;
  activeCharacterId: string;
  activeGroupChatId: string;
  communicationIdentityByWorldId: Record<string, string>;
  activeView: 'chat' | 'groups' | 'world' | 'moments';
  chatReplyMode: ChatReplyMode;
  enterToSend: boolean;
  chatFontScale: number;
  worldInteractionHighSimulation: boolean;
  worldInteractionNextAttemptAt: number | null;
  worldInteractionStatusReason: string;
  companionTimeMode: CompanionTimeMode;
  virtualTimeMinutes: number;
  userName: string;
  userPersona: string;
  promptPresets: PromptPreset[];
  activeChatPromptPresetId: string;
  chatPromptPresetEnabled: boolean;
  activeGroupPromptPresetId: string;
  groupPromptPresetEnabled: boolean;
  activeWorldPromptPresetId: string;
  worldPromptPresetEnabled: boolean;
  modelConfig: ModelConfig;
  modelUsage: ModelUsage;
}

export interface ModelMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
