/**
 * 大注释：AI memory suggestion module.
 * Keeps suggested memories pending until the user accepts them into the world timeline.
 */
import { refreshCharacterStatusSummary } from './character-status';
import { addTimelineEntry, timelineForActiveWorld } from './timeline';
import { callAuthoringModel } from '../model/client';
import { activeWorld, saveState, state } from '../core/state';
import type {
  CharacterProfile,
  MemorySuggestion,
  MemorySuggestionTrigger,
  ModelMessage,
  TimelineSourceRef,
} from '../core/types';
import { compactText, firstString, isRecord, nowId } from '../core/utils';

export interface GenerateMemorySuggestionInput {
  worldId?: string;
  trigger: MemorySuggestionTrigger;
  source: TimelineSourceRef;
  title: string;
  summary: string;
  characterIds?: string[];
}

export interface MemorySuggestionEdits {
  title?: string;
  summary?: string;
  includeInContext?: boolean;
}

function worldCharacters(worldId: string): CharacterProfile[] {
  return state.characters.filter(character => character.worldId === worldId);
}

function validCharacterIds(ids: string[] | undefined, worldId: string): string[] {
  const validIds = new Set(worldCharacters(worldId).map(character => character.id));
  return Array.from(new Set((ids ?? []).filter(id => validIds.has(id))));
}

function suggestionKey(worldId: string, source: TimelineSourceRef, title: string): string {
  return [worldId, source.type, source.id, title.trim()].join(':');
}

function existingPendingSuggestion(worldId: string, source: TimelineSourceRef, title: string): MemorySuggestion | undefined {
  const key = suggestionKey(worldId, source, title);
  return state.memorySuggestions.find(suggestion =>
    suggestion.status === 'pending'
    && suggestionKey(suggestion.worldId, suggestion.source, suggestion.title) === key,
  );
}

function memorySuggestionMessages(input: Required<GenerateMemorySuggestionInput>): ModelMessage[] {
  const world = state.worlds.find(item => item.id === input.worldId) ?? activeWorld();
  const characters = worldCharacters(world.id);
  const relatedCharacters = validCharacterIds(input.characterIds, world.id)
    .map(id => characters.find(character => character.id === id))
    .filter((character): character is CharacterProfile => Boolean(character));
  const recentTimeline = timelineForActiveWorld()
    .filter(entry => entry.worldId === world.id && !entry.revokedAt)
    .slice(0, 8)
    .map(entry => `- ${entry.title}：${compactText(entry.summary, 100)}`)
    .join('\n') || '暂无近期记忆。';
  const characterBriefs = (relatedCharacters.length > 0 ? relatedCharacters : characters.slice(0, 5))
    .map(character => [
      `角色：${character.name}`,
      character.nickname ? `昵称：${character.nickname}` : '',
      character.relationship.summary ? `关系摘要：${compactText(character.relationship.summary, 120)}` : '',
      character.profileNote ? `备注：${compactText(character.profileNote, 120)}` : '',
    ].filter(Boolean).join('\n'))
    .join('\n\n') || '暂无角色。';
  return [
    {
      role: 'system',
      content: [
        '你是 PalTavern 的记忆整理助手。',
        '你不扮演角色，不改角色卡，不改世界书，不写新剧情。',
        '你的任务是从用户已经确认发生的内容中提出 0 到 3 条“是否值得长期记住”的建议。',
        '建议必须克制、可回看、能帮助长期 RP 续写；不要把临时情绪、模型措辞、无关闲聊都存成记忆。',
        '只输出 JSON，不要解释，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `世界：${world.name}`,
        world.description ? `世界说明：${compactText(world.description, 500)}` : '',
        `触发来源：${input.trigger}`,
        `来源标题：${input.title}`,
        `来源内容：${compactText(input.summary, 800)}`,
        `相关角色：\n${characterBriefs}`,
        `近期世界记忆：\n${recentTimeline}`,
        '',
        '请输出 JSON：{"suggestions":[{"title":"短标题","summary":"40到120字记忆内容","reason":"为什么值得记住","characterIds":["角色id"],"includeInContext":true}]}',
        '硬性要求：',
        '- 如果没有真正值得长期保存的内容，输出 {"suggestions":[]}',
        '- characterIds 只能使用上面相关角色或同世界角色的 id，不确定就留空数组。',
        '- summary 写已经发生或用户确认的事实，不要续写未来，不要替用户做决定。',
        '- includeInContext 只有在这条记忆会影响后续角色表现时才用 true。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

function parseJsonObject(text: string): Record<string, unknown> | undefined {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start < 0 || end <= start) return undefined;
  try {
    const parsed = JSON.parse(source.slice(start, end + 1)) as unknown;
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function parsedSuggestions(raw: string): Array<Pick<MemorySuggestion, 'title' | 'summary' | 'reason' | 'characterIds' | 'includeInContext'>> {
  const parsed = parseJsonObject(raw);
  const source = isRecord(parsed) && Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
  return source.filter(isRecord).map(item => ({
    title: firstString(item.title, item.name, item.headline) ?? '记忆建议',
    summary: firstString(item.summary, item.content, item.description) ?? '',
    reason: firstString(item.reason, item.why) ?? '',
    characterIds: Array.isArray(item.characterIds)
      ? item.characterIds.filter((id): id is string => typeof id === 'string')
      : [],
    includeInContext: item.includeInContext !== false,
  })).filter(item => item.summary.trim());
}

export function memorySuggestionsForActiveWorld(): MemorySuggestion[] {
  const worldId = activeWorld().id;
  return state.memorySuggestions
    .filter(suggestion => suggestion.worldId === worldId)
    .sort((left, right) => right.updatedAt - left.updatedAt);
}

export function pendingMemorySuggestionsForActiveWorld(): MemorySuggestion[] {
  return memorySuggestionsForActiveWorld().filter(suggestion => suggestion.status === 'pending');
}

export async function generateMemorySuggestions(input: GenerateMemorySuggestionInput): Promise<MemorySuggestion[]> {
  const worldId = input.worldId ?? activeWorld().id;
  const raw = await callAuthoringModel(
    memorySuggestionMessages({
      ...input,
      worldId,
      characterIds: input.characterIds ?? [],
    }),
    { countBudget: true },
  );
  const now = Date.now();
  const created: MemorySuggestion[] = [];
  for (const parsed of parsedSuggestions(raw)) {
    const title = parsed.title.trim() || '记忆建议';
    if (existingPendingSuggestion(worldId, input.source, title)) continue;
    const suggestion: MemorySuggestion = {
      id: nowId('memory_suggestion'),
      worldId,
      trigger: input.trigger,
      source: input.source,
      title,
      summary: parsed.summary.trim(),
      reason: parsed.reason.trim(),
      characterIds: validCharacterIds(parsed.characterIds.length ? parsed.characterIds : input.characterIds, worldId),
      includeInContext: parsed.includeInContext,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    state.memorySuggestions.push(suggestion);
    created.push(suggestion);
  }
  if (created.length > 0) saveState();
  return created;
}

export function acceptMemorySuggestion(id: string, edits: MemorySuggestionEdits = {}): MemorySuggestion {
  const suggestion = state.memorySuggestions.find(item => item.id === id);
  if (!suggestion) throw new Error('找不到这条记忆建议。');
  if (suggestion.status !== 'pending') throw new Error('这条记忆建议已经处理过。');
  const title = edits.title?.trim() || suggestion.title;
  const summary = edits.summary?.trim() || suggestion.summary;
  if (!summary.trim()) throw new Error('记忆内容不能为空。');
  const includeInContext = edits.includeInContext ?? suggestion.includeInContext;
  const entry = addTimelineEntry({
    worldId: suggestion.worldId,
    type: 'manual_note',
    characterIds: validCharacterIds(suggestion.characterIds, suggestion.worldId),
    title,
    summary,
    source: suggestion.source,
    canUndo: false,
    includeInContext,
  });
  const now = Date.now();
  suggestion.title = title;
  suggestion.summary = summary;
  suggestion.includeInContext = includeInContext;
  suggestion.acceptedTimelineEntryId = entry.id;
  suggestion.acceptedAt = now;
  suggestion.status = 'accepted';
  suggestion.updatedAt = now;
  for (const characterId of suggestion.characterIds) {
    const character = state.characters.find(item => item.id === characterId && item.worldId === suggestion.worldId);
    if (character) refreshCharacterStatusSummary(character);
  }
  saveState();
  return suggestion;
}

export function dismissMemorySuggestion(id: string): MemorySuggestion {
  const suggestion = state.memorySuggestions.find(item => item.id === id);
  if (!suggestion) throw new Error('找不到这条记忆建议。');
  if (suggestion.status !== 'pending') throw new Error('这条记忆建议已经处理过。');
  const now = Date.now();
  suggestion.status = 'dismissed';
  suggestion.dismissedAt = now;
  suggestion.updatedAt = now;
  saveState();
  return suggestion;
}
