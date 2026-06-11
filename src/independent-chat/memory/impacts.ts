/**
 * 大注释：Impact record module.
 * Records, traces, and rolls back relationship, status, and event side effects.
 */
import { saveState, state } from '../core/state';
import { addTimelineEntry } from './timeline';
import type {
  CharacterRelationshipRecord,
  CharacterRelationshipSide,
  CharacterRelationshipStageSuggestion,
  CharacterProfile,
  CharacterStatusSummary,
  ImpactRecord,
  ImpactTargetType,
  RelationshipState,
  RelationshipStage,
  TimelineEntry,
  TimelineSourceRef,
} from '../core/types';
import { compactText, isRecord, nowId } from '../core/utils';

type ImpactRecordInput = {
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
  timelineEntryIds?: string[];
  createdAt?: number;
};

export type TimelineRollbackState = {
  operationId: string;
  label: string;
  canRollback: boolean;
  rolledBackAt?: number;
};

function cloneImpactValue<T>(value: T): T {
  if (value === undefined) return null as T;
  return JSON.parse(JSON.stringify(value)) as T;
}

export function relationshipSnapshot(character: CharacterProfile): RelationshipState {
  return cloneImpactValue(character.relationship);
}

export function statusSnapshot(status: CharacterStatusSummary | undefined): CharacterStatusSummary | null {
  return status ? cloneImpactValue(status) : null;
}

export function recordImpact(input: ImpactRecordInput): ImpactRecord {
  const existing = state.impactRecords.find(record =>
    record.operationId === input.operationId
    && record.targetType === input.targetType
    && record.targetId === input.targetId
    && record.field === input.field,
  );
  if (existing) {
    return existing;
  }
  const record: ImpactRecord = {
    id: nowId('impact'),
    worldId: input.worldId,
    operationId: input.operationId,
    label: input.label,
    source: input.source,
    targetType: input.targetType,
    targetId: input.targetId,
    characterId: input.characterId,
    field: input.field,
    oldValue: cloneImpactValue(input.oldValue),
    newValue: cloneImpactValue(input.newValue),
    timelineEntryIds: Array.from(new Set(input.timelineEntryIds ?? [])),
    createdAt: input.createdAt ?? Date.now(),
  };
  state.impactRecords.push(record);
  saveState();
  return record;
}

export function recordTimelineEntryImpact(
  entry: TimelineEntry,
  operationId: string,
  label: string,
  source: TimelineSourceRef = entry.source,
): ImpactRecord {
  entry.canUndo = true;
  return recordImpact({
    worldId: entry.worldId,
    operationId,
    label,
    source,
    targetType: 'timeline_entry',
    targetId: entry.id,
    oldValue: null,
    newValue: {
      title: entry.title,
      summary: entry.summary,
      includeInContext: entry.includeInContext,
      revokedAt: entry.revokedAt ?? null,
    },
    timelineEntryIds: [entry.id],
    createdAt: entry.createdAt,
  });
}

export function recordsForOperation(operationId: string): ImpactRecord[] {
  return state.impactRecords.filter(record => record.operationId === operationId);
}

export function isImpactSourceRolledBack(source: TimelineSourceRef): boolean {
  const records = state.impactRecords.filter(record =>
    record.source.type === source.type && record.source.id === source.id,
  );
  return records.length > 0 && records.every(record => Boolean(record.rolledBackAt));
}

export function rollbackStateForTimelineEntry(entry: TimelineEntry): TimelineRollbackState | undefined {
  const records = state.impactRecords.filter(record =>
    record.worldId === entry.worldId
    && (
      record.timelineEntryIds.includes(entry.id)
      || (record.source.type === entry.source.type && record.source.id === entry.source.id)
    ),
  );
  if (records.length === 0) return undefined;
  const operationId = records[0].operationId;
  const group = recordsForOperation(operationId);
  const active = group.filter(record => !record.rolledBackAt);
  const rolledBackAt = active.length === 0
    ? Math.max(...group.map(record => record.rolledBackAt ?? 0))
    : undefined;
  return {
    operationId,
    label: records[0].label,
    canRollback: active.length > 0,
    rolledBackAt: rolledBackAt || undefined,
  };
}

function relationshipFromValue(value: unknown): RelationshipState | undefined {
  if (!isRecord(value)) return undefined;
  const stage = value.stage;
  return {
    stage: stage === 'familiar' || stage === 'close' || stage === 'intimate' || stage === 'strained'
      ? stage
      : 'stranger',
    affinity: typeof value.affinity === 'number' && Number.isFinite(value.affinity)
      ? Math.max(0, Math.round(value.affinity))
      : 0,
    summary: typeof value.summary === 'string' ? value.summary : '',
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  };
}

function relationshipStageFromValue(value: unknown): RelationshipStage {
  return value === 'familiar' || value === 'close' || value === 'intimate' || value === 'strained'
    ? value
    : 'stranger';
}

function characterRelationshipSideFromValue(value: unknown): CharacterRelationshipSide {
  if (!isRecord(value)) {
    return { stage: 'stranger', summary: '', updatedAt: Date.now() };
  }
  return {
    stage: relationshipStageFromValue(value.stage),
    summary: typeof value.summary === 'string' ? value.summary : '',
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  };
}

function characterRelationshipFromValue(value: unknown): CharacterRelationshipRecord | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === 'string' ? value.id : '';
  const worldId = typeof value.worldId === 'string' ? value.worldId : '';
  const characterAId = typeof value.characterAId === 'string' ? value.characterAId : '';
  const characterBId = typeof value.characterBId === 'string' ? value.characterBId : '';
  if (!id || !worldId || !characterAId || !characterBId || characterAId === characterBId) return undefined;
  const aToB = characterRelationshipSideFromValue(value.aToB);
  const bToA = characterRelationshipSideFromValue(value.bToA);
  return {
    id,
    worldId,
    characterAId,
    characterBId,
    aToB,
    bToA,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Math.max(aToB.updatedAt, bToA.updatedAt),
  };
}

function characterRelationshipSuggestionFromValue(value: unknown): CharacterRelationshipStageSuggestion | undefined {
  if (!isRecord(value)) return undefined;
  const id = typeof value.id === 'string' ? value.id : '';
  const worldId = typeof value.worldId === 'string' ? value.worldId : '';
  const relationshipId = typeof value.relationshipId === 'string' ? value.relationshipId : '';
  const fromCharacterId = typeof value.fromCharacterId === 'string' ? value.fromCharacterId : '';
  const toCharacterId = typeof value.toCharacterId === 'string' ? value.toCharacterId : '';
  if (!id || !worldId || !relationshipId || !fromCharacterId || !toCharacterId) return undefined;
  return {
    id,
    worldId,
    relationshipId,
    fromCharacterId,
    toCharacterId,
    suggestedStage: relationshipStageFromValue(value.suggestedStage),
    reason: typeof value.reason === 'string' ? value.reason : '',
    sourceEventId: typeof value.sourceEventId === 'string' ? value.sourceEventId : '',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    appliedAt: typeof value.appliedAt === 'number' ? value.appliedAt : undefined,
    ignoredAt: typeof value.ignoredAt === 'number' ? value.ignoredAt : undefined,
  };
}

function statusFromValue(value: unknown): CharacterStatusSummary | undefined {
  if (!isRecord(value)) return undefined;
  const stage = value.relationshipStage;
  return {
    id: typeof value.id === 'string' ? value.id : nowId('status'),
    worldId: typeof value.worldId === 'string' ? value.worldId : '',
    characterId: typeof value.characterId === 'string' ? value.characterId : '',
    mood: typeof value.mood === 'string' ? value.mood : '近况安静',
    relationshipStage: stage === 'familiar' || stage === 'close' || stage === 'intimate' || stage === 'strained'
      ? stage
      : 'stranger',
    affinity: typeof value.affinity === 'number' && Number.isFinite(value.affinity)
      ? Math.max(0, Math.round(value.affinity))
      : 0,
    relationshipSummary: typeof value.relationshipSummary === 'string' ? value.relationshipSummary : '',
    recentMemoryTitles: Array.isArray(value.recentMemoryTitles)
      ? value.recentMemoryTitles.filter((item): item is string => typeof item === 'string').slice(0, 3)
      : [],
    unresolvedItems: Array.isArray(value.unresolvedItems)
      ? value.unresolvedItems.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : [],
    nextInclination: typeof value.nextInclination === 'string' ? value.nextInclination : '暂时保持自己的节奏。',
    activeSources: Array.isArray(value.activeSources)
      ? value.activeSources.filter((item): item is string => typeof item === 'string').slice(0, 6)
      : [],
    summary: typeof value.summary === 'string' ? value.summary : '',
    source: value.source === 'model' ? 'model' : 'rule',
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
  };
}

function applyRollback(record: ImpactRecord, rolledBackAt: number): void {
  if (record.targetType === 'relationship') {
    const character = state.characters.find(item => item.id === record.targetId);
    const oldRelationship = relationshipFromValue(record.oldValue);
    if (character && oldRelationship) {
      character.relationship = oldRelationship;
    }
    return;
  }
  if (record.targetType === 'character_relationship') {
    const index = state.characterRelationships.findIndex(item => item.id === record.targetId);
    const oldRelationship = characterRelationshipFromValue(record.oldValue);
    if (oldRelationship) {
      if (index >= 0) state.characterRelationships[index] = oldRelationship;
      else state.characterRelationships.push(oldRelationship);
    } else if (index >= 0) {
      state.characterRelationships.splice(index, 1);
    }
    return;
  }
  if (record.targetType === 'character_relationship_suggestion') {
    const index = state.characterRelationshipSuggestions.findIndex(item => item.id === record.targetId);
    const oldSuggestion = characterRelationshipSuggestionFromValue(record.oldValue);
    if (oldSuggestion) {
      if (index >= 0) state.characterRelationshipSuggestions[index] = oldSuggestion;
      else state.characterRelationshipSuggestions.push(oldSuggestion);
    } else if (index >= 0) {
      state.characterRelationshipSuggestions.splice(index, 1);
    }
    return;
  }
  if (record.targetType === 'timeline_entry') {
    const entry = state.timelineEntries.find(item => item.id === record.targetId);
    if (entry) {
      entry.revokedAt = rolledBackAt;
      entry.includeInContext = false;
    }
    return;
  }
  if (record.targetType === 'message') {
    const message = state.messages.find(item => item.id === record.targetId);
    if (message) {
      message.impactRevokedAt = rolledBackAt;
    }
    return;
  }
  if (record.targetType === 'character_status') {
    const index = state.characterStatuses.findIndex(status =>
      status.id === record.targetId || (
        record.characterId
        && status.characterId === record.characterId
        && status.worldId === record.worldId
      ),
    );
    const oldStatus = statusFromValue(record.oldValue);
    if (oldStatus) {
      if (index >= 0) state.characterStatuses[index] = oldStatus;
      else state.characterStatuses.push(oldStatus);
    } else if (index >= 0) {
      state.characterStatuses.splice(index, 1);
    }
  }
}

export function rollbackImpactOperation(operationId: string): { ok: boolean; reason?: string } {
  const records = recordsForOperation(operationId);
  const activeRecords = records.filter(record => !record.rolledBackAt);
  if (records.length === 0) {
    return { ok: false, reason: '找不到可撤销的影响记录。' };
  }
  if (activeRecords.length === 0) {
    return { ok: false, reason: '这次影响已经撤销过。' };
  }
  const rolledBackAt = Date.now();
  for (const record of activeRecords) {
    applyRollback(record, rolledBackAt);
    record.rolledBackAt = rolledBackAt;
  }
  const label = records[0].label;
  addTimelineEntry({
    worldId: records[0].worldId,
    type: 'system',
    characterIds: Array.from(new Set(records.map(record => record.characterId).filter((id): id is string => Boolean(id)))),
    title: `已撤销影响：${label}`,
    summary: `这次影响已经撤销，相关记录不会再进入模型上下文。${compactText(label, 80)}`,
    source: { type: 'system', id: `rollback:${operationId}:${rolledBackAt}` },
    canUndo: false,
    includeInContext: false,
    createdAt: rolledBackAt,
  });
  saveState();
  return { ok: true };
}

export function rollbackTimelineEntryImpact(timelineEntryId: string): { ok: boolean; reason?: string } {
  const entry = state.timelineEntries.find(item => item.id === timelineEntryId);
  if (!entry) return { ok: false, reason: '找不到这条时间线记录。' };
  const rollbackState = rollbackStateForTimelineEntry(entry);
  if (!rollbackState?.canRollback) {
    return { ok: false, reason: rollbackState?.rolledBackAt ? '这次影响已经撤销过。' : '这条记录没有可撤销影响。' };
  }
  return rollbackImpactOperation(rollbackState.operationId);
}
