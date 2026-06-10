import { callAuthoringModel } from './model';
import { characterSettingsText } from './character-settings';
import {
  createCharacterRelationshipStageSuggestion,
  ensureCharacterRelationship,
  groupRelationshipContextFor,
} from './character-relationships';
import { recordCharacterInteraction } from './character-interactions';
import { canCharacterViewMoment } from './moment-visibility';
import { addMomentComment } from './moments';
import { createDefaultCharacterPlan, saveState, state } from './state';
import type {
  CharacterInteractionRecord,
  CharacterProfile,
  ModelMessage,
  MomentComment,
  MomentEntry,
  RelationshipStage,
} from './types';
import { compactText, firstString, isRecord, localDateKey, nowId } from './utils';

export type BackgroundInteractionSurface = 'timeline' | 'moment_comment';

export interface BackgroundInteractionRunOptions {
  participantIds?: string[];
  preferMomentId?: string;
  countBudget?: boolean;
  now?: number;
}

export interface BackgroundInteractionRunResult {
  ok: boolean;
  reason: string;
  surface?: BackgroundInteractionSurface;
  interaction?: CharacterInteractionRecord;
  comment?: MomentComment;
  suggestionCount?: number;
}

interface BackgroundInteractionAction {
  surface: BackgroundInteractionSurface;
  type: string;
  title: string;
  summary: string;
  reason: string;
  comment?: string;
  stageSuggestions: Array<{
    fromCharacterId: string;
    toCharacterId: string;
    suggestedStage: RelationshipStage;
    reason: string;
  }>;
}

interface PromptOptions {
  candidateMoment?: MomentEntry;
}

const DEFAULT_WORLD_DAILY_LIMIT = 8;
const DEFAULT_CHARACTER_DAILY_LIMIT = 3;
const HOT_WORLD_DAILY_LIMIT = 16;
const HOT_CHARACTER_DAILY_LIMIT = 6;

function todayKey(now = Date.now()): string {
  return localDateKey(now);
}

function sameDay(timestamp: number, now = Date.now()): boolean {
  return localDateKey(timestamp) === todayKey(now);
}

function worldCharacters(worldId: string): CharacterProfile[] {
  return state.characters.filter(character => character.worldId === worldId);
}

function todayInteractions(worldId: string, now = Date.now()): CharacterInteractionRecord[] {
  return state.characterInteractions.filter(record =>
    record.worldId === worldId && sameDay(record.createdAt, now),
  );
}

function characterInteractionCount(characterId: string, now = Date.now()): number {
  return state.characterInteractions.filter(record =>
    sameDay(record.createdAt, now)
    && (record.actorCharacterId === characterId || record.targetCharacterIds.includes(characterId)),
  ).length;
}

export function backgroundInteractionLimits(): { worldDailyLimit: number; characterDailyLimit: number } {
  return state.worldInteractionHighSimulation
    ? { worldDailyLimit: HOT_WORLD_DAILY_LIMIT, characterDailyLimit: HOT_CHARACTER_DAILY_LIMIT }
    : { worldDailyLimit: DEFAULT_WORLD_DAILY_LIMIT, characterDailyLimit: DEFAULT_CHARACTER_DAILY_LIMIT };
}

export function backgroundInteractionReadiness(
  worldId: string,
  actorCharacterId?: string,
  now = Date.now(),
): { ok: boolean; reason?: string } {
  if (worldCharacters(worldId).length < 2) {
    return { ok: false, reason: '当前世界至少需要两个角色，才能生成角色之间的互动。' };
  }
  if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
    return { ok: false, reason: '模型尚未配置，角色间互动循环暂时跳过。' };
  }
  const limits = backgroundInteractionLimits();
  if (todayInteractions(worldId, now).length >= limits.worldDailyLimit) {
    return { ok: false, reason: '今天角色之间的互动已经足够多，先保持安静。' };
  }
  if (actorCharacterId && characterInteractionCount(actorCharacterId, now) >= limits.characterDailyLimit) {
    return { ok: false, reason: '这个角色今天已经参与过几次互动，先不继续打扰。' };
  }
  return { ok: true };
}

export function backgroundInteractionStats(worldId: string, now = Date.now()): {
  todayCount: number;
  worldDailyLimit: number;
  recentReason: string;
} {
  const limits = backgroundInteractionLimits();
  const recent = state.characterInteractions
    .filter(record => record.worldId === worldId)
    .sort((left, right) => right.createdAt - left.createdAt)[0];
  return {
    todayCount: todayInteractions(worldId, now).length,
    worldDailyLimit: limits.worldDailyLimit,
    recentReason: recent?.reason || state.worldInteractionStatusReason || '角色互动循环保持克制，等待下一次自然检查。',
  };
}

function participantBrief(character: CharacterProfile): string {
  const settings = characterSettingsText(character);
  return [
    `角色ID：${character.id}`,
    `姓名：${character.name}`,
    character.currentPlan?.text ? `角色当前计划：${character.currentPlan.text}` : '',
    settings ? `角色设定摘要：${compactText(settings, 360)}` : '',
    `与 user 的关系：${character.relationship.stage}，好感度 ${character.relationship.affinity}`,
    character.relationship.summary ? `与 user 关系摘要：${compactText(character.relationship.summary, 160)}` : '',
  ].filter(Boolean).join('\n');
}

function recentTimelineContext(worldId: string, participantIds: Set<string>): string {
  const entries = state.timelineEntries
    .filter(entry =>
      entry.worldId === worldId
      && !entry.revokedAt
      && entry.includeInContext
      && (
        entry.characterIds.length === 0
        || entry.characterIds.some(id => participantIds.has(id))
      ),
    )
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 6);
  return entries.length > 0
    ? entries.map(entry => `- ${entry.title}：${compactText(entry.summary, 140)}`).join('\n')
    : '暂无相关时间线记忆。';
}

function candidateMomentContext(moment?: MomentEntry): string {
  if (!moment) return '暂无适合公开评论的动态候选；如果要互动，请写成时间线生活记录。';
  const authorName = state.characters.find(character => character.id === moment.characterId)?.name ?? state.userName;
  const comments = moment.comments.slice(-4).map(comment => {
    const name = comment.authorType === 'user'
      ? state.userName
      : state.characters.find(character => character.id === comment.characterId)?.name ?? '角色';
    return `  - ${name}：${comment.content}`;
  });
  return [
    `动态ID：${moment.id}`,
    `发布者：${authorName}`,
    `正文：${moment.content}`,
    comments.length > 0 ? `已有评论：\n${comments.join('\n')}` : '已有评论：暂无',
  ].join('\n');
}

export function buildBackgroundInteractionMessages(
  worldId: string,
  participants: CharacterProfile[],
  options: PromptOptions = {},
): ModelMessage[] {
  const participantIds = new Set(participants.map(character => character.id));
  const world = state.worlds.find(item => item.id === worldId);
  return [
    {
      role: 'system',
      content: [
        '你是 PalTavern 的角色间后台互动编排器。',
        '目标：让同一世界内的角色像有自己的生活一样，产生克制、自然、低噪音的小互动。',
        '互动主要落在世界时间线或动态评论区，不要生成私聊窗口，不要替 user 行动。',
        '只输出 JSON，不要解释，不要 Markdown，不要 <msg>。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `当前世界：${world?.name ?? worldId}`,
        `互动模式：${state.worldInteractionHighSimulation ? '热闹世界' : '克制自然'}`,
        '',
        '【参与角色】',
        participants.map(participantBrief).join('\n\n'),
        '',
        '【这些角色之间的关系网】',
        groupRelationshipContextFor(participants, 12) || '暂无显式角色间关系。',
        '',
        '【最近相关时间线】',
        recentTimelineContext(worldId, participantIds),
        '',
        '【可选动态评论落点】',
        candidateMomentContext(options.candidateMoment),
        '',
        '【输出 JSON 结构】',
        JSON.stringify({
          surface: 'timeline 或 moment_comment',
          type: 'comment/followup/help/misunderstanding/avoidance/casual',
          title: '一句短标题',
          summary: '实际发生的互动摘要',
          reason: '为什么这次互动自然发生',
          comment: '如果 surface 是 moment_comment，这里写要发布的评论正文；否则留空',
          stageSuggestions: [{
            fromCharacterId: '只允许参与角色 ID',
            toCharacterId: '只允许参与角色 ID',
            suggestedStage: 'stranger/familiar/close/intimate/strained',
            reason: '为什么建议变化；不确定就给空数组',
          }],
        }),
        '',
        '约束：',
        '- 优先使用角色当前计划、关系网、近期动态和时间线，避免凭空随机。',
        '- 如果没有合适的公开表达，就选择 timeline。',
        '- moment_comment 只能评论上面给出的动态候选，评论 1 句即可。',
        '- stageSuggestions 只给建议，不要假装已经改变关系阶段。',
      ].join('\n'),
    },
  ];
}

function relationshipStage(value: unknown): RelationshipStage | undefined {
  return value === 'stranger'
    || value === 'familiar'
    || value === 'close'
    || value === 'intimate'
    || value === 'strained'
    ? value
    : undefined;
}

function parseJsonObject(raw: string): Record<string, unknown> {
  const trimmed = raw.trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();
  const match = /\{[\s\S]*\}/.exec(trimmed);
  const jsonText = match ? match[0] : trimmed;
  const parsed = JSON.parse(jsonText) as unknown;
  if (!isRecord(parsed)) throw new Error('角色互动模型没有返回 JSON 对象。');
  return parsed;
}

function parseAction(raw: string, participantIds: Set<string>): BackgroundInteractionAction {
  const parsed = parseJsonObject(raw);
  const surface = parsed.surface === 'moment_comment' ? 'moment_comment' : 'timeline';
  const stageSuggestions = Array.isArray(parsed.stageSuggestions)
    ? parsed.stageSuggestions.filter(isRecord).flatMap(suggestion => {
      const stage = relationshipStage(suggestion.suggestedStage);
      const fromCharacterId = firstString(suggestion.fromCharacterId);
      const toCharacterId = firstString(suggestion.toCharacterId);
      if (
        !stage
        || !fromCharacterId
        || !toCharacterId
        || fromCharacterId === toCharacterId
        || !participantIds.has(fromCharacterId)
        || !participantIds.has(toCharacterId)
      ) {
        return [];
      }
      return [{
        fromCharacterId,
        toCharacterId,
        suggestedStage: stage,
        reason: firstString(suggestion.reason) ?? '后台互动后产生的关系阶段建议。',
      }];
    })
    : [];
  return {
    surface,
    type: firstString(parsed.type) ?? 'casual',
    title: firstString(parsed.title) ?? '角色之间发生了一次小互动',
    summary: firstString(parsed.summary, parsed.description) ?? '角色之间产生了一次短暂交集。',
    reason: firstString(parsed.reason) ?? '基于角色当前计划和关系状态自然发生。',
    comment: firstString(parsed.comment, parsed.content),
    stageSuggestions,
  };
}

function chooseParticipants(worldId: string, options: BackgroundInteractionRunOptions): CharacterProfile[] {
  if (options.participantIds?.length) {
    return options.participantIds
      .map(id => state.characters.find(character => character.id === id && character.worldId === worldId))
      .filter((character): character is CharacterProfile => Boolean(character))
      .slice(0, state.worldInteractionHighSimulation ? 3 : 2);
  }
  return worldCharacters(worldId)
    .sort((left, right) =>
      characterInteractionCount(left.id, options.now) - characterInteractionCount(right.id, options.now),
    )
    .slice(0, state.worldInteractionHighSimulation ? 3 : 2);
}

function candidateMomentFor(
  actor: CharacterProfile,
  targetIds: Set<string>,
  preferMomentId?: string,
): MomentEntry | undefined {
  const moments = state.moments
    .filter(moment =>
      moment.worldId === actor.worldId
      && moment.characterId
      && targetIds.has(moment.characterId)
      && canCharacterViewMoment(moment, actor)
      && !moment.comments.some(comment => comment.authorType === 'character' && comment.characterId === actor.id),
    )
    .sort((left, right) => right.createdAt - left.createdAt);
  return preferMomentId
    ? moments.find(moment => moment.id === preferMomentId) ?? moments[0]
    : moments[0];
}

function createStageSuggestions(
  worldId: string,
  interaction: CharacterInteractionRecord,
  suggestions: BackgroundInteractionAction['stageSuggestions'],
): number {
  let count = 0;
  for (const suggestion of suggestions) {
    const from = state.characters.find(character => character.id === suggestion.fromCharacterId && character.worldId === worldId);
    const to = state.characters.find(character => character.id === suggestion.toCharacterId && character.worldId === worldId);
    if (!from || !to) continue;
    const relationship = ensureCharacterRelationship(from, to);
    createCharacterRelationshipStageSuggestion({
      worldId,
      relationshipId: relationship.id,
      fromCharacterId: from.id,
      toCharacterId: to.id,
      suggestedStage: suggestion.suggestedStage,
      reason: suggestion.reason,
      sourceEventId: `interaction:${interaction.id}`,
    });
    count += 1;
  }
  return count;
}

export async function refreshCharacterCurrentPlan(
  character: CharacterProfile,
  countBudget = false,
): Promise<string> {
  const raw = await callAuthoringModel([
    {
      role: 'system',
      content: '你是 PalTavern 的角色当前计划整理器。只输出一句短文本，不要解释。',
    },
    {
      role: 'user',
      content: [
        `角色：${character.name}`,
        characterSettingsText(character) ? `设定：${compactText(characterSettingsText(character), 520)}` : '',
        character.relationship.summary ? `与 user 关系摘要：${compactText(character.relationship.summary, 180)}` : '',
        groupRelationshipContextFor([character], 6),
        '请写出这个角色最近在忙什么、想做什么，或对谁有未完成的念头。不要超过 60 字。',
      ].filter(Boolean).join('\n'),
    },
  ], { countBudget });
  const text = compactText(raw.replace(/<\/?msg>/gi, '').trim(), 90);
  character.currentPlan = {
    text: text || createDefaultCharacterPlan(character.name).text,
    updatedAt: Date.now(),
    source: 'model',
  };
  saveState();
  return character.currentPlan.text;
}

export async function runBackgroundCharacterInteraction(
  worldId: string,
  options: BackgroundInteractionRunOptions = {},
): Promise<BackgroundInteractionRunResult> {
  const participants = chooseParticipants(worldId, options);
  if (participants.length < 2) {
    return { ok: false, reason: '当前世界至少需要两个角色，才能生成角色之间的互动。' };
  }
  const actor = participants[0];
  const targets = participants.slice(1);
  const readiness = backgroundInteractionReadiness(worldId, actor.id, options.now);
  if (!readiness.ok) return { ok: false, reason: readiness.reason ?? '角色互动循环暂时跳过。' };
  const targetIds = new Set(targets.map(character => character.id));
  const candidateMoment = candidateMomentFor(actor, targetIds, options.preferMomentId);
  const raw = await callAuthoringModel(
    buildBackgroundInteractionMessages(worldId, participants, { candidateMoment }),
    { countBudget: options.countBudget },
  );
  const action = parseAction(raw, new Set(participants.map(character => character.id)));
  const source = { type: 'manual' as const, id: nowId('background_interaction') };
  if (action.surface === 'moment_comment' && candidateMoment && action.comment?.trim()) {
    const comment = addMomentComment(
      candidateMoment.id,
      action.comment,
      actor,
      'model',
    );
    const interaction = state.characterInteractions.find(record =>
      record.source.type === 'comment' && record.source.id === comment.id,
    );
    state.worldInteractionStatusReason = action.reason;
    saveState();
    return {
      ok: true,
      reason: action.reason,
      surface: 'moment_comment',
      interaction,
      comment,
      suggestionCount: 0,
    };
  }
  const interaction = recordCharacterInteraction({
    worldId,
    type: 'background_scene',
    actorCharacterId: actor.id,
    targetCharacterIds: targets.map(character => character.id),
    title: action.title,
    summary: action.summary,
    reason: action.reason,
    source,
  });
  const suggestionCount = createStageSuggestions(worldId, interaction, action.stageSuggestions);
  state.worldInteractionStatusReason = action.reason;
  saveState();
  return {
    ok: true,
    reason: action.reason,
    surface: 'timeline',
    interaction,
    suggestionCount,
  };
}

export function scheduleNextBackgroundInteraction(from = Date.now()): void {
  const min = state.worldInteractionHighSimulation ? 60 * 60 * 1000 : 3 * 60 * 60 * 1000;
  const max = state.worldInteractionHighSimulation ? 3 * 60 * 60 * 1000 : 7 * 60 * 60 * 1000;
  state.worldInteractionNextAttemptAt = from + min + Math.random() * (max - min);
  state.worldInteractionStatusReason = state.worldInteractionHighSimulation
    ? '热闹世界已开启，下一次角色互动检查会更频繁。'
    : '角色互动循环保持克制，已安排下一次自然检查。';
}
