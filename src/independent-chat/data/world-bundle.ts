/**
 * 大注释：Full world bundle module.
 * Exports one PalTavern world with all linked characters and world-scoped records.
 */
import { normalizeState, replaceState, saveState, state } from '../core/state';
import type {
  AppState,
  CharacterCardDraft,
  CharacterDirectMessage,
  CharacterDirectThread,
  CharacterInteractionRecord,
  CharacterProfile,
  CharacterRelationshipRecord,
  CharacterRelationshipStageSuggestion,
  CharacterStatusSummary,
  ChatMessage,
  ConversationProfile,
  DailyBrief,
  GroupChatMessage,
  GroupChatProfile,
  ImpactRecord,
  MemorySummary,
  MomentEntry,
  PrivateChatEventSuggestion,
  TimelineEntry,
  WorldEvent,
  WorldProfile,
} from '../core/types';
import { isRecord } from '../core/utils';
import { saveNativeJsonFile } from '../platform/runtime';

export const PAL_TAVERN_WORLD_BUNDLE_SCHEMA = 'pal-tavern-world-bundle-v1';

export type WorldBundleSection =
  | 'world'
  | 'characters'
  | 'relationships'
  | 'chats'
  | 'moments'
  | 'events'
  | 'timeline'
  | 'summaries'
  | 'drafts';

export interface WorldBundleData {
  world: WorldProfile;
  characters: CharacterProfile[];
  characterRelationships: CharacterRelationshipRecord[];
  characterRelationshipSuggestions: CharacterRelationshipStageSuggestion[];
  characterCardDrafts: CharacterCardDraft[];
  conversations: ConversationProfile[];
  groupChats: GroupChatProfile[];
  groupMessages: GroupChatMessage[];
  characterDirectThreads: CharacterDirectThread[];
  characterDirectMessages: CharacterDirectMessage[];
  messages: ChatMessage[];
  privateChatEventSuggestions: PrivateChatEventSuggestion[];
  moments: MomentEntry[];
  worldEvents: WorldEvent[];
  timelineEntries: TimelineEntry[];
  impactRecords: ImpactRecord[];
  characterInteractions: CharacterInteractionRecord[];
  characterStatuses: CharacterStatusSummary[];
  dailyBriefs: DailyBrief[];
  memorySummaries: MemorySummary[];
  communicationActorId: string;
}

export interface WorldBundleEnvelope {
  app: 'PalTavern';
  schema: typeof PAL_TAVERN_WORLD_BUNDLE_SCHEMA;
  kind: 'world_bundle';
  exportedAt: string;
  worldId: string;
  data: WorldBundleData;
}

export interface WorldBundlePreview {
  envelope: WorldBundleEnvelope;
  data: WorldBundleData;
  worldId: string;
  worldName: string;
  exportedAt: string;
  characterCount: number;
  relationshipCount: number;
  relationshipSuggestionCount: number;
  draftCount: number;
  privateChatCount: number;
  privateMessageCount: number;
  groupChatCount: number;
  groupMessageCount: number;
  directThreadCount: number;
  directMessageCount: number;
  privateEventSuggestionCount: number;
  momentCount: number;
  eventCount: number;
  timelineCount: number;
  impactCount: number;
  interactionCount: number;
  statusCount: number;
  dailyBriefCount: number;
  summaryCount: number;
}

export type WorldBundleImportSelection = Partial<Record<WorldBundleSection, boolean>>;

export interface WorldBundleImportResult {
  worldId: string;
  worldName: string;
  importedSections: WorldBundleSection[];
  characterCount: number;
  privateMessageCount: number;
  groupMessageCount: number;
  directMessageCount: number;
  momentCount: number;
  eventCount: number;
  timelineCount: number;
  summaryCount: number;
}

export interface WorldBundleDownloadInfo {
  fileName: string;
  folderHint: string;
}

const importSections: WorldBundleSection[] = [
  'world',
  'characters',
  'relationships',
  'chats',
  'moments',
  'events',
  'timeline',
  'summaries',
  'drafts',
];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function arrayFromRecord(raw: Record<string, unknown>, key: keyof WorldBundleData): unknown[] {
  const value = raw[key as string];
  return Array.isArray(value) ? value : [];
}

function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return cleaned || 'world';
}

function worldBundleDownloadFolderHint(): string {
  return '系统默认下载文件夹（通常是“下载/Downloads”）';
}

function stateLikeFromBundleData(rawData: unknown): Partial<AppState> {
  if (!isRecord(rawData) || !isRecord(rawData.world)) {
    throw new Error('这不是 PalTavern 完整世界包。');
  }
  const worldId = typeof rawData.world.id === 'string' ? rawData.world.id : '';
  const communicationActorId = typeof rawData.communicationActorId === 'string'
    ? rawData.communicationActorId
    : 'user';
  return {
    worlds: [rawData.world as unknown as WorldProfile],
    characters: arrayFromRecord(rawData, 'characters') as CharacterProfile[],
    characterRelationships: arrayFromRecord(rawData, 'characterRelationships') as CharacterRelationshipRecord[],
    characterRelationshipSuggestions: arrayFromRecord(rawData, 'characterRelationshipSuggestions') as CharacterRelationshipStageSuggestion[],
    characterCardDrafts: arrayFromRecord(rawData, 'characterCardDrafts') as CharacterCardDraft[],
    conversations: arrayFromRecord(rawData, 'conversations') as ConversationProfile[],
    groupChats: arrayFromRecord(rawData, 'groupChats') as GroupChatProfile[],
    groupMessages: arrayFromRecord(rawData, 'groupMessages') as GroupChatMessage[],
    characterDirectThreads: arrayFromRecord(rawData, 'characterDirectThreads') as CharacterDirectThread[],
    characterDirectMessages: arrayFromRecord(rawData, 'characterDirectMessages') as CharacterDirectMessage[],
    messages: arrayFromRecord(rawData, 'messages') as ChatMessage[],
    privateChatEventSuggestions: arrayFromRecord(rawData, 'privateChatEventSuggestions') as PrivateChatEventSuggestion[],
    moments: arrayFromRecord(rawData, 'moments') as MomentEntry[],
    worldEvents: arrayFromRecord(rawData, 'worldEvents') as WorldEvent[],
    timelineEntries: arrayFromRecord(rawData, 'timelineEntries') as TimelineEntry[],
    impactRecords: arrayFromRecord(rawData, 'impactRecords') as ImpactRecord[],
    characterInteractions: arrayFromRecord(rawData, 'characterInteractions') as CharacterInteractionRecord[],
    characterStatuses: arrayFromRecord(rawData, 'characterStatuses') as CharacterStatusSummary[],
    dailyBriefs: arrayFromRecord(rawData, 'dailyBriefs') as DailyBrief[],
    memorySummaries: arrayFromRecord(rawData, 'memorySummaries') as MemorySummary[],
    activeWorldId: worldId,
    activeCharacterId: '',
    activeGroupChatId: '',
    communicationIdentityByWorldId: worldId ? { [worldId]: communicationActorId } : {},
  };
}

function bundleDataFromState(source: AppState, worldId: string): WorldBundleData {
  const world = source.worlds.find(item => item.id === worldId);
  if (!world) {
    throw new Error('找不到要导出的世界。');
  }
  const characterIds = new Set(source.characters
    .filter(character => character.worldId === worldId)
    .map(character => character.id));
  const conversationIds = new Set(source.conversations
    .filter(conversation => conversation.worldId === worldId)
    .map(conversation => conversation.id));
  return {
    world: clone(world),
    characters: clone(source.characters.filter(character => character.worldId === worldId)),
    characterRelationships: clone(source.characterRelationships.filter(relationship => relationship.worldId === worldId)),
    characterRelationshipSuggestions: clone(source.characterRelationshipSuggestions.filter(suggestion => suggestion.worldId === worldId)),
    characterCardDrafts: clone(source.characterCardDrafts.filter(draft => draft.worldId === worldId)),
    conversations: clone(source.conversations.filter(conversation => conversation.worldId === worldId)),
    groupChats: clone(source.groupChats.filter(chat => chat.worldId === worldId)),
    groupMessages: clone(source.groupMessages.filter(message => message.worldId === worldId)),
    characterDirectThreads: clone(source.characterDirectThreads.filter(thread => thread.worldId === worldId)),
    characterDirectMessages: clone(source.characterDirectMessages.filter(message => message.worldId === worldId)),
    messages: clone(source.messages.filter(message =>
      characterIds.has(message.characterId) || conversationIds.has(message.conversationId),
    )),
    privateChatEventSuggestions: clone(source.privateChatEventSuggestions.filter(suggestion => suggestion.worldId === worldId)),
    moments: clone(source.moments.filter(moment => moment.worldId === worldId)),
    worldEvents: clone(source.worldEvents.filter(event => event.worldId === worldId)),
    timelineEntries: clone(source.timelineEntries.filter(entry => entry.worldId === worldId)),
    impactRecords: clone(source.impactRecords.filter(record => record.worldId === worldId)),
    characterInteractions: clone(source.characterInteractions.filter(record => record.worldId === worldId)),
    characterStatuses: clone(source.characterStatuses.filter(status => status.worldId === worldId)),
    dailyBriefs: clone(source.dailyBriefs.filter(brief => brief.worldId === worldId)),
    memorySummaries: clone(source.memorySummaries.filter(summary => summary.worldId === worldId)),
    communicationActorId: source.communicationIdentityByWorldId[worldId] ?? 'user',
  };
}

function normalizeBundleData(rawData: unknown): WorldBundleData {
  const normalized = normalizeState(stateLikeFromBundleData(rawData));
  const worldId = normalized.activeWorldId;
  return bundleDataFromState(normalized, worldId);
}

function isWorldBundleEnvelope(value: unknown): value is WorldBundleEnvelope {
  return Boolean(
    isRecord(value)
    && value.app === 'PalTavern'
    && value.schema === PAL_TAVERN_WORLD_BUNDLE_SCHEMA
    && value.kind === 'world_bundle'
    && isRecord(value.data),
  );
}

function parseWorldBundleEnvelope(rawText: string): WorldBundleEnvelope {
  const parsed = JSON.parse(rawText) as unknown;
  if (!isWorldBundleEnvelope(parsed)) {
    throw new Error('这不是 PalTavern 完整世界包。');
  }
  const data = normalizeBundleData(parsed.data);
  return {
    app: 'PalTavern',
    schema: PAL_TAVERN_WORLD_BUNDLE_SCHEMA,
    kind: 'world_bundle',
    exportedAt: typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    worldId: data.world.id,
    data,
  };
}

function previewFromEnvelope(envelope: WorldBundleEnvelope): WorldBundlePreview {
  const data = envelope.data;
  return {
    envelope,
    data,
    worldId: data.world.id,
    worldName: data.world.name,
    exportedAt: envelope.exportedAt,
    characterCount: data.characters.length,
    relationshipCount: data.characterRelationships.length,
    relationshipSuggestionCount: data.characterRelationshipSuggestions.length,
    draftCount: data.characterCardDrafts.length,
    privateChatCount: data.conversations.length,
    privateMessageCount: data.messages.length,
    groupChatCount: data.groupChats.length,
    groupMessageCount: data.groupMessages.length,
    directThreadCount: data.characterDirectThreads.length,
    directMessageCount: data.characterDirectMessages.length,
    privateEventSuggestionCount: data.privateChatEventSuggestions.length,
    momentCount: data.moments.length,
    eventCount: data.worldEvents.length,
    timelineCount: data.timelineEntries.length,
    impactCount: data.impactRecords.length,
    interactionCount: data.characterInteractions.length,
    statusCount: data.characterStatuses.length,
    dailyBriefCount: data.dailyBriefs.length,
    summaryCount: data.memorySummaries.length,
  };
}

function browserDownloadWorldBundle(fileName: string, text: string): WorldBundleDownloadInfo {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return {
    fileName,
    folderHint: worldBundleDownloadFolderHint(),
  };
}

function mergeById<T extends { id: string }>(current: T[], incoming: T[]): T[] {
  const incomingIds = new Set(incoming.map(item => item.id));
  return [
    ...current.filter(item => !incomingIds.has(item.id)),
    ...clone(incoming),
  ];
}

function upsertWorld(current: WorldProfile[], incoming: WorldProfile): WorldProfile[] {
  const withoutCurrent = current.filter(world => world.id !== incoming.id);
  return [...withoutCurrent, clone(incoming)];
}

function effectiveImportSelection(selection?: WorldBundleImportSelection): Required<Record<WorldBundleSection, boolean>> {
  if (!selection) {
    return Object.fromEntries(importSections.map(section => [section, true])) as Required<Record<WorldBundleSection, boolean>>;
  }
  return {
    world: selection.world !== false,
    characters: selection.characters === true,
    relationships: selection.relationships === true,
    chats: selection.chats === true,
    moments: selection.moments === true,
    events: selection.events === true,
    timeline: selection.timeline === true,
    summaries: selection.summaries === true,
    drafts: selection.drafts === true,
  };
}

function selectedSections(selection: Required<Record<WorldBundleSection, boolean>>): WorldBundleSection[] {
  return importSections.filter(section => selection[section]);
}

export function defaultWorldBundleImportSelection(): Required<Record<WorldBundleSection, boolean>> {
  return effectiveImportSelection();
}

export function createWorldBundle(worldId = state.activeWorldId): WorldBundleEnvelope {
  const data = bundleDataFromState(state, worldId);
  return {
    app: 'PalTavern',
    schema: PAL_TAVERN_WORLD_BUNDLE_SCHEMA,
    kind: 'world_bundle',
    exportedAt: new Date().toISOString(),
    worldId: data.world.id,
    data,
  };
}

export function createWorldBundleText(worldId = state.activeWorldId): string {
  return JSON.stringify(createWorldBundle(worldId), null, 2);
}

export function worldBundleFileName(world: WorldProfile): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `${safeFileName(world.name)}-完整世界包-${stamp}.json`;
}

export async function downloadWorldBundle(worldId = state.activeWorldId): Promise<WorldBundleDownloadInfo> {
  const envelope = createWorldBundle(worldId);
  const fileName = worldBundleFileName(envelope.data.world);
  const text = JSON.stringify(envelope, null, 2);
  const nativeResult = await saveNativeJsonFile(fileName, text);
  if (nativeResult) {
    return {
      fileName: nativeResult.fileName,
      folderHint: `Android 下载目录：${nativeResult.folderPath}`,
    };
  }

  return browserDownloadWorldBundle(fileName, text);
}

export function previewWorldBundleText(rawText: string): WorldBundlePreview {
  return previewFromEnvelope(parseWorldBundleEnvelope(rawText));
}

export function isWorldBundleText(rawText: string): boolean {
  try {
    previewWorldBundleText(rawText);
    return true;
  } catch {
    return false;
  }
}

export function importWorldBundlePreview(
  preview: WorldBundlePreview,
  selection?: WorldBundleImportSelection,
): WorldBundleImportResult {
  const data = preview.data;
  const effective = effectiveImportSelection(selection);
  const importedSections = selectedSections(effective);
  if (importedSections.length === 0) {
    throw new Error('请至少选择一个要导入的部分。');
  }

  const next = clone(state);
  if (effective.world) {
    next.worlds = upsertWorld(next.worlds, data.world);
    next.communicationIdentityByWorldId = {
      ...next.communicationIdentityByWorldId,
      [data.world.id]: data.communicationActorId,
    };
  } else if (!next.worlds.some(world => world.id === data.world.id)) {
    next.worlds = upsertWorld(next.worlds, data.world);
    next.communicationIdentityByWorldId = {
      ...next.communicationIdentityByWorldId,
      [data.world.id]: data.communicationActorId,
    };
  }

  if (effective.characters) {
    next.characters = mergeById(next.characters, data.characters);
  }
  if (effective.relationships) {
    next.characterRelationships = mergeById(next.characterRelationships, data.characterRelationships);
    next.characterRelationshipSuggestions = mergeById(
      next.characterRelationshipSuggestions,
      data.characterRelationshipSuggestions,
    );
  }
  if (effective.chats) {
    next.conversations = mergeById(next.conversations, data.conversations);
    next.messages = mergeById(next.messages, data.messages);
    next.groupChats = mergeById(next.groupChats, data.groupChats);
    next.groupMessages = mergeById(next.groupMessages, data.groupMessages);
    next.characterDirectThreads = mergeById(next.characterDirectThreads, data.characterDirectThreads);
    next.characterDirectMessages = mergeById(next.characterDirectMessages, data.characterDirectMessages);
  }
  if (effective.moments) {
    next.moments = mergeById(next.moments, data.moments);
  }
  if (effective.events) {
    next.worldEvents = mergeById(next.worldEvents, data.worldEvents);
    next.privateChatEventSuggestions = mergeById(next.privateChatEventSuggestions, data.privateChatEventSuggestions);
  }
  if (effective.timeline) {
    next.timelineEntries = mergeById(next.timelineEntries, data.timelineEntries);
    next.impactRecords = mergeById(next.impactRecords, data.impactRecords);
    next.characterInteractions = mergeById(next.characterInteractions, data.characterInteractions);
  }
  if (effective.summaries) {
    next.characterStatuses = mergeById(next.characterStatuses, data.characterStatuses);
    next.dailyBriefs = mergeById(next.dailyBriefs, data.dailyBriefs);
    next.memorySummaries = mergeById(next.memorySummaries, data.memorySummaries);
  }
  if (effective.drafts) {
    next.characterCardDrafts = mergeById(next.characterCardDrafts, data.characterCardDrafts);
  }

  next.activeWorldId = data.world.id;
  next.activeCharacterId = data.characters[0]?.id
    ?? next.characters.find(character => character.worldId === data.world.id)?.id
    ?? '';
  next.activeGroupChatId = data.groupChats[0]?.id
    ?? next.groupChats.find(chat => chat.worldId === data.world.id)?.id
    ?? '';
  next.activeView = 'world';
  replaceState(next);
  saveState();

  return {
    worldId: data.world.id,
    worldName: data.world.name,
    importedSections,
    characterCount: effective.characters ? data.characters.length : 0,
    privateMessageCount: effective.chats ? data.messages.length : 0,
    groupMessageCount: effective.chats ? data.groupMessages.length : 0,
    directMessageCount: effective.chats ? data.characterDirectMessages.length : 0,
    momentCount: effective.moments ? data.moments.length : 0,
    eventCount: effective.events ? data.worldEvents.length : 0,
    timelineCount: effective.timeline ? data.timelineEntries.length : 0,
    summaryCount: effective.summaries ? data.memorySummaries.length : 0,
  };
}

export function importWorldBundleText(
  rawText: string,
  selection?: WorldBundleImportSelection,
): WorldBundleImportResult {
  return importWorldBundlePreview(previewWorldBundleText(rawText), selection);
}
