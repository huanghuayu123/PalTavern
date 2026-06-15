/**
 * 大注释：Three-layer memory summary module.
 * Compresses timeline facts into micro, middle, and macro summaries while keeping raw timeline entries intact.
 */
import { activeWorld, saveState, state } from '../core/state';
import type { CharacterProfile, MemorySummary, SummaryLayer, TimelineEntry } from '../core/types';
import { compactText, localDateKey, nowId } from '../core/utils';

type SummaryPatch = Partial<Pick<
  MemorySummary,
  'title' | 'factSummary' | 'emotionalLine' | 'unresolvedItems' | 'nextHook' | 'includeInContext' | 'status'
>>;

const layerOrder: Record<SummaryLayer, number> = {
  micro: 0,
  middle: 1,
  macro: 2,
};

export function summaryLayerLabel(layer: SummaryLayer): string {
  if (layer === 'macro') return '世界大结';
  if (layer === 'middle') return '角色中结';
  return '片段小结';
}

function findCharacter(characterId: string): CharacterProfile | undefined {
  return state.characters.find(character => character.id === characterId);
}

function summaryMatches(summary: MemorySummary, layer: SummaryLayer, worldId: string, targetId: string): boolean {
  return summary.layer === layer && summary.worldId === worldId && summary.targetId === targetId;
}

function upsertSummary(input: Omit<MemorySummary, 'id' | 'createdAt'>): MemorySummary {
  const existing = state.memorySummaries.find(summary =>
    summaryMatches(summary, input.layer, input.worldId, input.targetId),
  );
  const now = input.updatedAt;
  if (existing) {
    const nextStatus = existing.status === 'paused'
      ? existing.status
      : input.status ?? existing.status;
    const nextIncludeInContext = nextStatus === 'pending_confirmation' || nextStatus === 'paused'
      ? false
      : existing.includeInContext === false ? false : input.includeInContext;
    const preservesUserText = existing.status === 'paused';
    Object.assign(existing, {
      ...input,
      id: existing.id,
      createdAt: existing.createdAt,
      title: preservesUserText ? existing.title : input.title,
      factSummary: preservesUserText ? existing.factSummary : input.factSummary,
      emotionalLine: preservesUserText ? existing.emotionalLine : input.emotionalLine,
      unresolvedItems: preservesUserText ? existing.unresolvedItems : input.unresolvedItems,
      nextHook: preservesUserText ? existing.nextHook : input.nextHook,
      status: nextStatus,
      includeInContext: nextIncludeInContext,
      updatedAt: now,
    });
    return existing;
  }
  const summary: MemorySummary = {
    ...input,
    id: nowId('memory_summary'),
    createdAt: now,
  };
  state.memorySummaries.push(summary);
  return summary;
}

function relevantTimelineForCharacter(character: CharacterProfile, limit = 6): TimelineEntry[] {
  return state.timelineEntries
    .filter(entry =>
      entry.worldId === character.worldId
      && entry.includeInContext
      && !entry.revokedAt
      && entry.type !== 'daily_brief'
      && entry.type !== 'character_status'
      && (entry.characterIds.length === 0 || entry.characterIds.includes(character.id)),
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, limit);
}

function unresolvedItemsForCharacter(character: CharacterProfile): string[] {
  return state.worldEvents
    .filter(event =>
      event.worldId === character.worldId
      && event.status === 'active'
      && (event.participantCharacterIds.length === 0 || event.participantCharacterIds.includes(character.id)),
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 3)
    .map(event => event.title);
}

function sourceIsUsable(summary: MemorySummary): boolean {
  if (summary.sourceTimelineEntryIds.length === 0) return true;
  return summary.sourceTimelineEntryIds.every(id => {
    const entry = state.timelineEntries.find(item => item.id === id);
    return entry && !entry.revokedAt && entry.includeInContext;
  });
}

export function refreshMicroSummaryForCharacter(characterId: string): MemorySummary | undefined {
  const character = findCharacter(characterId);
  if (!character) return undefined;
  const entries = relevantTimelineForCharacter(character, 6);
  if (entries.length === 0) return undefined;
  const updatedAt = Date.now();
  const latest = entries[0];
  const unresolvedItems = unresolvedItemsForCharacter(character);
  const summary = upsertSummary({
    worldId: character.worldId,
    layer: 'micro',
    scope: 'character',
    targetId: character.id,
    characterIds: [character.id],
    sourceTimelineEntryIds: entries.map(entry => entry.id),
    sourceSummaryIds: [],
    title: `${character.name} 的片段小结`,
    factSummary: entries
      .map(entry => `${entry.title}：${compactText(entry.summary, 70)}`)
      .join('；'),
    emotionalLine: `${character.name} 最近的情绪线：${compactText(latest.summary, 90)}`,
    unresolvedItems,
    nextHook: unresolvedItems[0] ? `可以先处理：${unresolvedItems[0]}` : `可以自然接续：${latest.title}`,
    includeInContext: true,
    status: 'active',
    updatedAt,
  });
  saveState();
  return summary;
}

function activeMicroSummariesForCharacter(character: CharacterProfile): MemorySummary[] {
  return state.memorySummaries
    .filter(summary =>
      summary.worldId === character.worldId
      && summary.layer === 'micro'
      && summary.status === 'active'
      && summary.includeInContext
      && summary.characterIds.includes(character.id)
      && sourceIsUsable(summary),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function refreshMiddleSummaryForCharacter(characterId: string): MemorySummary | undefined {
  const character = findCharacter(characterId);
  if (!character) return undefined;
  const microSummaries = activeMicroSummariesForCharacter(character).slice(0, 4);
  if (microSummaries.length === 0) return undefined;
  const updatedAt = Date.now();
  const unresolvedItems = Array.from(new Set(microSummaries.flatMap(summary => summary.unresolvedItems))).slice(0, 4);
  const summary = upsertSummary({
    worldId: character.worldId,
    layer: 'middle',
    scope: 'character',
    targetId: character.id,
    characterIds: [character.id],
    sourceTimelineEntryIds: Array.from(new Set(microSummaries.flatMap(item => item.sourceTimelineEntryIds))).slice(0, 24),
    sourceSummaryIds: microSummaries.map(item => item.id),
    title: `${character.name} 的角色中结`,
    factSummary: `由 ${microSummaries.length} 条片段小结整理：${microSummaries.map(item => compactText(item.factSummary, 90)).join('；')}`,
    emotionalLine: microSummaries.map(item => item.emotionalLine).filter(Boolean).slice(0, 2).join('；'),
    unresolvedItems,
    nextHook: unresolvedItems[0] ? `下次优先接：${unresolvedItems[0]}` : microSummaries[0]?.nextHook ?? '',
    includeInContext: true,
    status: 'active',
    updatedAt,
  });
  saveState();
  return summary;
}

function activeWorldSummaries(worldId: string): MemorySummary[] {
  return state.memorySummaries
    .filter(summary =>
      summary.worldId === worldId
      && summary.status === 'active'
      && summary.includeInContext
      && sourceIsUsable(summary),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function refreshMacroSummaryForWorld(worldId = activeWorld().id): MemorySummary | undefined {
  const world = state.worlds.find(item => item.id === worldId);
  if (!world) return undefined;
  const middleSummaries = activeWorldSummaries(worldId).filter(summary => summary.layer === 'middle').slice(0, 8);
  const timelineEntries = state.timelineEntries
    .filter(entry => entry.worldId === worldId && entry.includeInContext && !entry.revokedAt)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 12);
  if (middleSummaries.length === 0 && timelineEntries.length === 0) return undefined;
  const existing = state.memorySummaries.find(summary => summaryMatches(summary, 'macro', worldId, worldId));
  const status = existing?.status ?? 'pending_confirmation';
  const updatedAt = Date.now();
  const sourceTimelineEntryIds = Array.from(new Set([
    ...middleSummaries.flatMap(summary => summary.sourceTimelineEntryIds),
    ...timelineEntries.map(entry => entry.id),
  ])).slice(0, 24);
  const summary = upsertSummary({
    worldId,
    layer: 'macro',
    scope: 'world',
    targetId: worldId,
    characterIds: Array.from(new Set([
      ...middleSummaries.flatMap(item => item.characterIds),
      ...timelineEntries.flatMap(entry => entry.characterIds),
    ])).slice(0, 12),
    sourceTimelineEntryIds,
    sourceSummaryIds: middleSummaries.map(item => item.id),
    title: `${world.name} · ${localDateKey(updatedAt)} 世界大结`,
    factSummary: middleSummaries.length > 0
      ? `长期事实：${middleSummaries.map(item => compactText(item.factSummary, 90)).join('；')}`
      : `长期事实：${timelineEntries.map(entry => `${entry.title}：${compactText(entry.summary, 60)}`).join('；')}`,
    emotionalLine: middleSummaries.map(item => item.emotionalLine).filter(Boolean).slice(0, 3).join('；'),
    unresolvedItems: Array.from(new Set(middleSummaries.flatMap(summary => summary.unresolvedItems))).slice(0, 6),
    nextHook: middleSummaries.find(item => item.nextHook)?.nextHook ?? timelineEntries[0]?.title ?? '',
    includeInContext: status === 'active',
    status,
    updatedAt,
  });
  saveState();
  return summary;
}

export function refreshSummariesForTimelineEntry(entry: TimelineEntry): void {
  if (!entry.includeInContext || entry.revokedAt || entry.type === 'daily_brief' || entry.type === 'character_status') return;
  const characterIds = entry.characterIds.length > 0
    ? entry.characterIds
    : state.characters.filter(character => character.worldId === entry.worldId).map(character => character.id).slice(0, 3);
  for (const characterId of characterIds) {
    refreshMicroSummaryForCharacter(characterId);
    refreshMiddleSummaryForCharacter(characterId);
  }
  refreshMacroSummaryForWorld(entry.worldId);
}

export function updateMemorySummary(summaryId: string, patch: SummaryPatch): MemorySummary | undefined {
  const summary = state.memorySummaries.find(item => item.id === summaryId);
  if (!summary) return undefined;
  if (typeof patch.title === 'string') summary.title = patch.title.trim() || summary.title;
  if (typeof patch.factSummary === 'string') summary.factSummary = patch.factSummary;
  if (typeof patch.emotionalLine === 'string') summary.emotionalLine = patch.emotionalLine;
  if (Array.isArray(patch.unresolvedItems)) summary.unresolvedItems = patch.unresolvedItems.map(item => item.trim()).filter(Boolean).slice(0, 8);
  if (typeof patch.nextHook === 'string') summary.nextHook = patch.nextHook;
  if (patch.status === 'active' || patch.status === 'paused' || patch.status === 'pending_confirmation') {
    summary.status = patch.status;
  }
  if (typeof patch.includeInContext === 'boolean') summary.includeInContext = patch.includeInContext;
  if (summary.status === 'pending_confirmation' || summary.status === 'paused') summary.includeInContext = false;
  summary.updatedAt = Date.now();
  saveState();
  return summary;
}

export function pauseMemorySummary(summaryId: string): MemorySummary | undefined {
  return updateMemorySummary(summaryId, { status: 'paused', includeInContext: false });
}

export function resumeMemorySummary(summaryId: string): MemorySummary | undefined {
  const summary = state.memorySummaries.find(item => item.id === summaryId);
  if (!summary) return undefined;
  return updateMemorySummary(summaryId, {
    status: summary.layer === 'macro' ? 'pending_confirmation' : 'active',
    includeInContext: summary.layer !== 'macro',
  });
}

export function confirmMemorySummary(summaryId: string): MemorySummary | undefined {
  return updateMemorySummary(summaryId, { status: 'active', includeInContext: true });
}

export function discardMemorySummary(summaryId: string): boolean {
  const before = state.memorySummaries.length;
  state.memorySummaries = state.memorySummaries.filter(summary => summary.id !== summaryId);
  if (state.memorySummaries.length === before) return false;
  saveState();
  return true;
}

export function memorySummariesForWorld(worldId = activeWorld().id): MemorySummary[] {
  return state.memorySummaries
    .filter(summary => summary.worldId === worldId)
    .sort((left, right) =>
      layerOrder[left.layer] - layerOrder[right.layer]
      || right.updatedAt - left.updatedAt,
    );
}

export function contextMemorySummariesFor(character: CharacterProfile): MemorySummary[] {
  return state.memorySummaries
    .filter(summary =>
      summary.worldId === character.worldId
      && summary.status === 'active'
      && summary.includeInContext
      && sourceIsUsable(summary)
      && (
        summary.layer === 'macro'
        || summary.characterIds.length === 0
        || summary.characterIds.includes(character.id)
      ),
    )
    .sort((left, right) =>
      layerOrder[left.layer] - layerOrder[right.layer]
      || right.updatedAt - left.updatedAt,
    )
    .slice(0, 8);
}

export function memorySummaryContextFor(character: CharacterProfile): string {
  const summaries = contextMemorySummariesFor(character);
  if (summaries.length === 0) return '';
  return [
    '三层长期记忆总结（事实 + 情绪线，按需自然引用，不要逐条复述）：',
    ...summaries.map(summary => {
      const unresolved = summary.unresolvedItems.length > 0
        ? `；未解决：${summary.unresolvedItems.slice(0, 3).join('、')}`
        : '';
      const hook = summary.nextHook ? `；下次可接：${compactText(summary.nextHook, 60)}` : '';
      const emotion = summary.emotionalLine ? `；情绪线：${compactText(summary.emotionalLine, 80)}` : '';
      return `- ${summaryLayerLabel(summary.layer)}｜${summary.title}：${compactText(summary.factSummary, 140)}${emotion}${unresolved}${hook}`;
    }),
  ].join('\n');
}
