/**
 * 大注释：Character relationship module.
 * Tracks relationship state, stage suggestions, and event-driven relationship summaries.
 */
import {
  recordImpact,
  recordTimelineEntryImpact,
} from '../memory/impacts';
import { saveState, state } from '../core/state';
import { addTimelineEntry } from '../memory/timeline';
import type {
  CharacterProfile,
  CharacterRelationshipRecord,
  CharacterRelationshipSide,
  CharacterRelationshipStageSuggestion,
  RelationshipStage,
  TimelineEntry,
  TimelineSourceRef,
  WorldEvent,
} from '../core/types';
import { compactText, nowId, stableHash } from '../core/utils';

export interface RelationshipStageSuggestionInput {
  worldId: string;
  relationshipId?: string;
  fromCharacterId: string;
  toCharacterId: string;
  suggestedStage: RelationshipStage;
  reason: string;
  sourceEventId: string;
}

export interface ApplyRelationshipSuggestionResult {
  ok: boolean;
  reason?: string;
  timelineEntry?: TimelineEntry;
}

const MAX_RELATIONSHIP_SUMMARY_LENGTH = 900;

function defaultRelationshipSide(now = Date.now()): CharacterRelationshipSide {
  return {
    stage: 'stranger',
    summary: '',
    updatedAt: now,
  };
}

export function canonicalRelationshipPair(leftId: string, rightId: string): [string, string] {
  return leftId.localeCompare(rightId) <= 0 ? [leftId, rightId] : [rightId, leftId];
}

export function characterRelationshipIdFor(worldId: string, leftId: string, rightId: string): string {
  const [characterAId, characterBId] = canonicalRelationshipPair(leftId, rightId);
  return `character_relationship_${stableHash(`${worldId}:${characterAId}:${characterBId}`)}`;
}

function characterById(characterId: string): CharacterProfile | undefined {
  return state.characters.find(character => character.id === characterId);
}

function appendSummary(existing: string, line: string): string {
  return existing ? `${existing}\n${line}`.slice(-MAX_RELATIONSHIP_SUMMARY_LENGTH) : line;
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function characterRelationshipSnapshot(
  relationship: CharacterRelationshipRecord | undefined,
): CharacterRelationshipRecord | null {
  return relationship ? cloneValue(relationship) : null;
}

export function findCharacterRelationship(
  worldId: string,
  leftCharacterId: string,
  rightCharacterId: string,
): CharacterRelationshipRecord | undefined {
  if (!leftCharacterId || !rightCharacterId || leftCharacterId === rightCharacterId) return undefined;
  const [characterAId, characterBId] = canonicalRelationshipPair(leftCharacterId, rightCharacterId);
  return state.characterRelationships.find(relationship =>
    relationship.worldId === worldId
    && relationship.characterAId === characterAId
    && relationship.characterBId === characterBId,
  );
}

export function ensureCharacterRelationship(
  left: CharacterProfile,
  right: CharacterProfile,
): CharacterRelationshipRecord {
  if (left.id === right.id) {
    throw new Error('不能为同一个角色创建角色间关系。');
  }
  if (left.worldId !== right.worldId) {
    throw new Error('角色间关系只能绑定同一个世界内的角色。');
  }
  const existing = findCharacterRelationship(left.worldId, left.id, right.id);
  if (existing) return existing;
  const now = Date.now();
  const [characterAId, characterBId] = canonicalRelationshipPair(left.id, right.id);
  const relationship: CharacterRelationshipRecord = {
    id: characterRelationshipIdFor(left.worldId, characterAId, characterBId),
    worldId: left.worldId,
    characterAId,
    characterBId,
    aToB: defaultRelationshipSide(now),
    bToA: defaultRelationshipSide(now),
    updatedAt: now,
  };
  state.characterRelationships.push(relationship);
  saveState();
  return relationship;
}

export function relationshipSideFor(
  relationship: CharacterRelationshipRecord,
  fromCharacterId: string,
): CharacterRelationshipSide {
  return relationship.characterAId === fromCharacterId ? relationship.aToB : relationship.bToA;
}

function relationshipSideKey(
  relationship: CharacterRelationshipRecord,
  fromCharacterId: string,
): 'aToB' | 'bToA' {
  return relationship.characterAId === fromCharacterId ? 'aToB' : 'bToA';
}

export function relationshipOtherCharacterId(
  relationship: CharacterRelationshipRecord,
  characterId: string,
): string | undefined {
  if (relationship.characterAId === characterId) return relationship.characterBId;
  if (relationship.characterBId === characterId) return relationship.characterAId;
  return undefined;
}

export function updateCharacterRelationshipSide(
  relationship: CharacterRelationshipRecord,
  fromCharacterId: string,
  input: Partial<Pick<CharacterRelationshipSide, 'stage' | 'summary'>>,
): CharacterRelationshipRecord {
  const key = relationshipSideKey(relationship, fromCharacterId);
  const now = Date.now();
  relationship[key] = {
    ...relationship[key],
    stage: input.stage ?? relationship[key].stage,
    summary: input.summary ?? relationship[key].summary,
    updatedAt: now,
  };
  relationship.updatedAt = now;
  saveState();
  return relationship;
}

function relationLine(
  from: CharacterProfile,
  to: CharacterProfile,
  side: CharacterRelationshipSide,
): string {
  return `${from.name} -> ${to.name}: ${side.stage}${side.summary.trim() ? `; ${compactText(side.summary, 180)}` : ''}`;
}

export function characterRelationshipContextFor(character: CharacterProfile, limit = 8): string {
  const rows = state.characterRelationships
    .filter(relationship =>
      relationship.worldId === character.worldId
      && (relationship.characterAId === character.id || relationship.characterBId === character.id),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .flatMap(relationship => {
      const otherId = relationshipOtherCharacterId(relationship, character.id);
      const other = otherId ? characterById(otherId) : undefined;
      if (!other) return [];
      const selfSide = relationshipSideFor(relationship, character.id);
      const otherSide = relationshipSideFor(relationship, other.id);
      return [
        relationLine(character, other, selfSide),
        relationLine(other, character, otherSide),
      ];
    });
  return rows.length > 0 ? `角色之间的关系网：\n${rows.map(row => `- ${row}`).join('\n')}` : '';
}

export function groupRelationshipContextFor(participants: CharacterProfile[], limit = 12): string {
  const participantIds = new Set(participants.map(character => character.id));
  const participantById = new Map(participants.map(character => [character.id, character]));
  const rows = state.characterRelationships
    .filter(relationship =>
      participantIds.has(relationship.characterAId)
      && participantIds.has(relationship.characterBId),
    )
    .sort((left, right) => right.updatedAt - left.updatedAt)
    .slice(0, limit)
    .flatMap(relationship => {
      const left = participantById.get(relationship.characterAId);
      const right = participantById.get(relationship.characterBId);
      if (!left || !right) return [];
      return [
        relationLine(left, right, relationship.aToB),
        relationLine(right, left, relationship.bToA),
      ];
    });
  return rows.length > 0 ? `角色之间的关系网：\n${rows.map(row => `- ${row}`).join('\n')}` : '';
}

export function pendingRelationshipSuggestionsForPair(
  worldId: string,
  leftCharacterId: string,
  rightCharacterId: string,
): CharacterRelationshipStageSuggestion[] {
  const relationship = findCharacterRelationship(worldId, leftCharacterId, rightCharacterId);
  if (!relationship) return [];
  return state.characterRelationshipSuggestions
    .filter(suggestion =>
      suggestion.worldId === worldId
      && suggestion.relationshipId === relationship.id
      && !suggestion.appliedAt
      && !suggestion.ignoredAt,
    )
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function createCharacterRelationshipStageSuggestion(
  input: RelationshipStageSuggestionInput,
): CharacterRelationshipStageSuggestion {
  const suggestion: CharacterRelationshipStageSuggestion = {
    id: nowId('relationship_suggestion'),
    worldId: input.worldId,
    relationshipId: input.relationshipId ?? '',
    fromCharacterId: input.fromCharacterId,
    toCharacterId: input.toCharacterId,
    suggestedStage: input.suggestedStage,
    reason: input.reason.trim(),
    sourceEventId: input.sourceEventId,
    createdAt: Date.now(),
  };
  state.characterRelationshipSuggestions.push(suggestion);
  saveState();
  return suggestion;
}

export function createEventRelationshipStageSuggestions(
  event: WorldEvent,
  suggestions: RelationshipStageSuggestionInput[],
): CharacterRelationshipStageSuggestion[] {
  const participantIds = new Set(event.participantCharacterIds);
  const created: CharacterRelationshipStageSuggestion[] = [];
  for (const suggestion of suggestions) {
    if (
      suggestion.worldId !== event.worldId
      || suggestion.sourceEventId !== event.id
      || !participantIds.has(suggestion.fromCharacterId)
      || !participantIds.has(suggestion.toCharacterId)
      || suggestion.fromCharacterId === suggestion.toCharacterId
    ) {
      continue;
    }
    const from = characterById(suggestion.fromCharacterId);
    const to = characterById(suggestion.toCharacterId);
    if (!from || !to || from.worldId !== event.worldId || to.worldId !== event.worldId) continue;
    const relationship = ensureCharacterRelationship(from, to);
    created.push(createCharacterRelationshipStageSuggestion({
      ...suggestion,
      relationshipId: relationship.id,
    }));
  }
  return created;
}

export function appendEventRelationshipSummaries(
  event: WorldEvent,
  result: string,
): Array<{
  relationship: CharacterRelationshipRecord;
  oldRelationship: CharacterRelationshipRecord | null;
  newRelationship: CharacterRelationshipRecord | null;
  timelineEntry: TimelineEntry;
}> {
  const participants = event.participantCharacterIds
    .map(id => characterById(id))
    .filter((character): character is CharacterProfile => Boolean(character))
    .filter(character => character.worldId === event.worldId);
  const changes: Array<{
    relationship: CharacterRelationshipRecord;
    oldRelationship: CharacterRelationshipRecord | null;
    newRelationship: CharacterRelationshipRecord | null;
    timelineEntry: TimelineEntry;
  }> = [];
  for (let leftIndex = 0; leftIndex < participants.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < participants.length; rightIndex += 1) {
      const left = participants[leftIndex];
      const right = participants[rightIndex];
      if (!left || !right) continue;
      const relationship = ensureCharacterRelationship(left, right);
      const oldRelationship = characterRelationshipSnapshot(relationship);
      const now = Date.now();
      const line = `事件「${event.title}」结算：${compactText(result, 120)}`;
      relationship.aToB = {
        ...relationship.aToB,
        summary: appendSummary(relationship.aToB.summary, line),
        updatedAt: now,
      };
      relationship.bToA = {
        ...relationship.bToA,
        summary: appendSummary(relationship.bToA.summary, line),
        updatedAt: now,
      };
      relationship.updatedAt = now;
      const timelineEntry = addTimelineEntry({
        worldId: event.worldId,
        type: 'relationship',
        characterIds: [left.id, right.id],
        title: `${left.name} 与 ${right.name} 的关系被事件影响`,
        summary: `事件「${event.title}」结算后，两人的关系摘要已追加：${compactText(result, 120)}`,
        source: { type: 'relationship', id: `${event.id}:character_relationship:${relationship.id}` },
        canUndo: false,
        includeInContext: true,
      });
      changes.push({
        relationship,
        oldRelationship,
        newRelationship: characterRelationshipSnapshot(relationship),
        timelineEntry,
      });
    }
  }
  saveState();
  return changes;
}

export function applyCharacterRelationshipSuggestion(
  suggestionId: string,
): ApplyRelationshipSuggestionResult {
  const suggestion = state.characterRelationshipSuggestions.find(item => item.id === suggestionId);
  if (!suggestion) return { ok: false, reason: '找不到这条关系阶段建议。' };
  if (suggestion.appliedAt) return { ok: false, reason: '这条建议已经应用过。' };
  if (suggestion.ignoredAt) return { ok: false, reason: '这条建议已经被忽略。' };
  const relationship = state.characterRelationships.find(item => item.id === suggestion.relationshipId);
  if (!relationship) return { ok: false, reason: '找不到这条角色关系。' };
  const from = characterById(suggestion.fromCharacterId);
  const to = characterById(suggestion.toCharacterId);
  if (!from || !to) return { ok: false, reason: '建议涉及的角色已经不存在。' };
  const oldRelationship = characterRelationshipSnapshot(relationship);
  const oldSuggestion = cloneValue(suggestion);
  const now = Date.now();
  const key = relationshipSideKey(relationship, suggestion.fromCharacterId);
  relationship[key] = {
    ...relationship[key],
    stage: suggestion.suggestedStage,
    updatedAt: now,
  };
  relationship.updatedAt = now;
  suggestion.appliedAt = now;
  const operationId = nowId('relationship_suggestion_apply');
  const source: TimelineSourceRef = { type: 'relationship', id: `relationship_suggestion:${suggestion.id}` };
  const title = `${from.name} 对 ${to.name} 的关系阶段已应用建议`;
  const summary = [
    `${from.name} -> ${to.name}: ${suggestion.suggestedStage}`,
    suggestion.reason ? `理由：${compactText(suggestion.reason, 140)}` : '',
  ].filter(Boolean).join('；');
  const timelineEntry = addTimelineEntry({
    worldId: suggestion.worldId,
    type: 'relationship',
    characterIds: [from.id, to.id],
    title,
    summary,
    source,
    canUndo: true,
    includeInContext: true,
  });
  const label = `撤销角色关系阶段建议：${from.name} -> ${to.name}`;
  recordTimelineEntryImpact(timelineEntry, operationId, label, source);
  recordImpact({
    worldId: suggestion.worldId,
    operationId,
    label,
    source,
    targetType: 'character_relationship',
    targetId: relationship.id,
    characterId: from.id,
    field: 'relationship',
    oldValue: oldRelationship,
    newValue: characterRelationshipSnapshot(relationship),
    timelineEntryIds: [timelineEntry.id],
    createdAt: now,
  });
  recordImpact({
    worldId: suggestion.worldId,
    operationId,
    label,
    source,
    targetType: 'character_relationship_suggestion',
    targetId: suggestion.id,
    characterId: from.id,
    field: 'appliedAt',
    oldValue: oldSuggestion,
    newValue: cloneValue(suggestion),
    timelineEntryIds: [timelineEntry.id],
    createdAt: now,
  });
  saveState();
  return { ok: true, timelineEntry };
}

export function ignoreCharacterRelationshipSuggestion(
  suggestionId: string,
): { ok: boolean; reason?: string } {
  const suggestion = state.characterRelationshipSuggestions.find(item => item.id === suggestionId);
  if (!suggestion) return { ok: false, reason: '找不到这条关系阶段建议。' };
  if (suggestion.appliedAt) return { ok: false, reason: '已应用的建议不能忽略。' };
  if (!suggestion.ignoredAt) {
    suggestion.ignoredAt = Date.now();
    saveState();
  }
  return { ok: true };
}
