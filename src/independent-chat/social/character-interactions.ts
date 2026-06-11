/**
 * 大注释：Character interaction record module.
 * Stores shared interaction context for moments, events, and relationship updates.
 */
import { saveState, state } from '../core/state';
import { addTimelineEntry } from '../memory/timeline';
import {
  ensureCharacterRelationship,
  relationshipSideFor,
  updateCharacterRelationshipSide,
} from '../characters/relationships';
import type {
  CharacterInteractionRecord,
  CharacterInteractionType,
  CharacterProfile,
  MomentEntry,
  TimelineSourceRef,
  WorldEvent,
} from '../core/types';
import { compactText, localDateKey, nowId } from '../core/utils';

const WORLD_DAILY_INTERACTION_LIMIT = 8;
const CHARACTER_DAILY_INTERACTION_LIMIT = 3;
const HIGH_SIM_WORLD_DAILY_INTERACTION_LIMIT = 16;
const HIGH_SIM_CHARACTER_DAILY_INTERACTION_LIMIT = 6;
const MAX_RELATIONSHIP_SUMMARY_LENGTH = 900;

type InteractionInput = {
  worldId: string;
  type: CharacterInteractionType;
  actorCharacterId: string;
  targetCharacterIds: string[];
  title: string;
  summary: string;
  reason: string;
  source: TimelineSourceRef;
  createdAt?: number;
};

function todayKey(now = Date.now()): string {
  return localDateKey(now);
}

function interactionDate(record: CharacterInteractionRecord): string {
  return localDateKey(record.createdAt);
}

function appendRelationshipSummary(existing: string, line: string): string {
  return existing ? `${existing}\n${line}`.slice(-MAX_RELATIONSHIP_SUMMARY_LENGTH) : line;
}

function characterName(characterId: string): string {
  return state.characters.find(character => character.id === characterId)?.name ?? '角色';
}

function appendInteractionRelationshipSummaries(record: CharacterInteractionRecord): void {
  const actor = state.characters.find(character => character.id === record.actorCharacterId);
  if (!actor) return;
  const summaryLine = `互动「${record.title}」：${compactText(record.summary, 120)}`;
  for (const targetId of record.targetCharacterIds) {
    const target = state.characters.find(character => character.id === targetId && character.worldId === actor.worldId);
    if (!target || target.id === actor.id) continue;
    const relationship = ensureCharacterRelationship(actor, target);
    const actorSide = relationshipSideFor(relationship, actor.id);
    const targetSide = relationshipSideFor(relationship, target.id);
    updateCharacterRelationshipSide(relationship, actor.id, {
      summary: appendRelationshipSummary(actorSide.summary, summaryLine),
    });
    updateCharacterRelationshipSide(relationship, target.id, {
      summary: appendRelationshipSummary(
        targetSide.summary,
        `互动「${record.title}」：${characterName(record.actorCharacterId)} 与自己产生交集。${compactText(record.summary, 100)}`,
      ),
    });
  }
}

export function characterInteractionBudget(
  worldId: string,
  actorCharacterId: string,
  now = Date.now(),
): { ok: boolean; reason?: string } {
  const date = todayKey(now);
  const worldLimit = state.worldInteractionHighSimulation
    ? HIGH_SIM_WORLD_DAILY_INTERACTION_LIMIT
    : WORLD_DAILY_INTERACTION_LIMIT;
  const characterLimit = state.worldInteractionHighSimulation
    ? HIGH_SIM_CHARACTER_DAILY_INTERACTION_LIMIT
    : CHARACTER_DAILY_INTERACTION_LIMIT;
  const worldCount = state.characterInteractions.filter(record =>
    record.worldId === worldId && interactionDate(record) === date,
  ).length;
  if (worldCount >= worldLimit) {
    return { ok: false, reason: '今天角色之间的互动已经够多，先保持安静。' };
  }
  const actorCount = state.characterInteractions.filter(record =>
    record.worldId === worldId
    && record.actorCharacterId === actorCharacterId
    && interactionDate(record) === date,
  ).length;
  if (actorCount >= characterLimit) {
    return { ok: false, reason: '这个角色今天已经参与过几次互动，先不继续打扰。' };
  }
  return { ok: true };
}

export function interactionReasonForMomentComment(
  actor: CharacterProfile,
  moment: MomentEntry,
  author?: CharacterProfile,
): string {
  const momentHint = compactText(moment.content, 34);
  if (author && author.id !== actor.id) {
    return `因为 ${actor.name} 看到了 ${author.name} 的可见动态「${momentHint}」，且同在当前世界。`;
  }
  if (!author) {
    return `因为 ${actor.name} 看到了 ${state.userName} 的可见动态「${momentHint}」。`;
  }
  return `因为 ${actor.name} 正在回应自己动态下的新评论。`;
}

export function recordCharacterInteraction(input: InteractionInput): CharacterInteractionRecord {
  const createdAt = input.createdAt ?? Date.now();
  const existing = state.characterInteractions.find(record =>
    record.source.type === input.source.type && record.source.id === input.source.id,
  );
  if (existing) return existing;
  const record: CharacterInteractionRecord = {
    id: nowId('interaction'),
    worldId: input.worldId,
    type: input.type,
    actorCharacterId: input.actorCharacterId,
    targetCharacterIds: Array.from(new Set(input.targetCharacterIds.filter(Boolean))),
    title: input.title.trim() || '角色互动',
    summary: compactText(input.summary, 260),
    reason: input.reason.trim(),
    source: input.source,
    createdAt,
  };
  state.characterInteractions.push(record);
  const timelineEntry = addTimelineEntry({
    worldId: record.worldId,
    type: 'character_interaction',
    characterIds: [record.actorCharacterId, ...record.targetCharacterIds],
    title: record.title,
    summary: record.reason ? `${record.reason} ${record.summary}` : record.summary,
    source: { type: 'interaction', id: record.id },
    canUndo: false,
    includeInContext: true,
    createdAt,
  });
  record.timelineEntryId = timelineEntry.id;
  appendInteractionRelationshipSummaries(record);
  saveState();
  return record;
}

export function recordWorldEventInteraction(event: WorldEvent): CharacterInteractionRecord | undefined {
  if (event.participantCharacterIds.length < 2) return undefined;
  const [actorCharacterId, ...targetCharacterIds] = event.participantCharacterIds;
  const actorName = state.characters.find(character => character.id === actorCharacterId)?.name ?? '角色';
  const targetNames = targetCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return recordCharacterInteraction({
    worldId: event.worldId,
    type: 'world_event',
    actorCharacterId,
    targetCharacterIds,
    title: targetNames.length > 0
      ? `${actorName} 和 ${targetNames.join('、')} 一起经历了「${event.title}」`
      : `多角色事件：${event.title}`,
    summary: event.decision?.result ?? event.resultSummary ?? event.description,
    reason: '因为多个角色共同参与了同一条生活线索。',
    source: { type: 'event', id: `${event.id}:participants` },
    createdAt: event.resolvedAt ?? event.updatedAt,
  });
}
