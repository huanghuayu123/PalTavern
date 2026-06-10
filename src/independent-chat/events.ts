import { callAuthoringModel } from './model';
import { characterSettingsText } from './character-settings';
import {
  appendEventRelationshipSummaries,
  createEventRelationshipStageSuggestions,
  groupRelationshipContextFor,
} from './character-relationships';
import { recordWorldEventInteraction } from './character-interactions';
import {
  recordImpact,
  recordTimelineEntryImpact,
  recordsForOperation,
  relationshipSnapshot,
  rollbackImpactOperation,
} from './impacts';
import { activeWorld, saveState, state } from './state';
import {
  addEventCreatedTimelineEntry,
  addEventDeletedTimelineEntry,
  addEventResolvedTimelineEntry,
  addRelationshipTimelineEntry,
  revokeTimelineSource,
} from './timeline';
import type {
  CharacterProfile,
  ModelMessage,
  WorldEvent,
  WorldEventChoice,
  WorldEventDecision,
  WorldEventType,
  TimelineEntry,
  RelationshipStage,
} from './types';
import { compactText, firstString, isRecord, localDateKey, nowId } from './utils';

interface CreateWorldEventInput {
  title: string;
  description: string;
  participantCharacterIds: string[];
  affinityDelta: number;
  type?: WorldEventType;
  choices?: WorldEventChoice[];
  source?: WorldEvent['source'];
}

const eventTypeLabels: Record<WorldEventType, string> = {
  daily: '日常',
  relationship: '关系',
  problem: '求助',
  news: '新闻',
};

function clampDelta(value: unknown): number {
  return Math.max(-20, Math.min(20, Math.round(typeof value === 'number' ? value : Number(value) || 0)));
}

function normalizeEventType(value: unknown): WorldEventType {
  return value === 'relationship' || value === 'problem' || value === 'news' ? value : 'daily';
}

function normalizeRelationshipStage(value: unknown): RelationshipStage | undefined {
  return value === 'stranger'
    || value === 'familiar'
    || value === 'close'
    || value === 'intimate'
    || value === 'strained'
    ? value
    : undefined;
}

function worldCharacters(worldId = activeWorld().id): CharacterProfile[] {
  return state.characters.filter(character => character.worldId === worldId);
}

function validParticipantIds(ids: string[], worldId: string): string[] {
  return [...new Set(ids)]
    .filter(id => state.characters.some(character => character.id === id && character.worldId === worldId));
}

function defaultChoices(type: WorldEventType, affinityDelta = 0): WorldEventChoice[] {
  const primaryDelta = affinityDelta !== 0 ? affinityDelta : type === 'relationship' || type === 'problem' ? 4 : 2;
  const choices: Record<WorldEventType, Array<[string, string, number]>> = {
    relationship: [
      ['发消息问一句', '用手机私聊轻轻问一句近况，不替任何人当场处理。', primaryDelta],
      ['先记为待观察', '只把这条关系线索记下来，暂时不打扰参与者。', 0],
      ['暂时不介入', '不立刻追问，让这件事自然留在后续关系里。', -1],
    ],
    problem: [
      ['私聊问需不需要帮忙', '只通过消息确认对方是否需要帮助，不替用户到场行动。', primaryDelta],
      ['记到待办', '把这件小麻烦记下来，之后再决定要不要处理。', Math.max(0, Math.min(3, primaryDelta))],
      ['先放一放', '暂时不打扰，让事情留作一条未解决线索。', 0],
    ],
    news: [
      ['收进今日记录', '把它作为今天发生过的轻量消息记录下来。', 0],
      ['转成动态线索', '稍后可围绕这条消息生成一条生活动态。', Math.max(1, primaryDelta)],
      ['暂时略过', '不扩大影响，只保留为一条背景小事。', 0],
    ],
    daily: [
      ['记进时间线', '只把它记成今天发生过的日常，不让用户参与现场。', Math.max(1, primaryDelta)],
      ['私聊顺口问一句', '之后可以在私聊里自然问起，不承诺线下行动。', 0],
      ['先不打扰', '不把这件小事扩大，只让它安静存在。', 0],
    ],
  };
  return choices[type].map(([label, intent, delta]) => ({
    id: nowId('choice'),
    label,
    intent,
    affinityDelta: clampDelta(delta),
  }));
}

function normalizeChoices(value: unknown, type: WorldEventType, affinityDelta: number): WorldEventChoice[] {
  if (!Array.isArray(value)) {
    return defaultChoices(type, affinityDelta);
  }
  const choices = value.filter(isRecord).slice(0, 3).map(choice => ({
    id: typeof choice.id === 'string' ? choice.id : nowId('choice'),
    label: firstString(choice.label, choice.title, choice.name) ?? '记一下',
    intent: firstString(choice.intent, choice.description, choice.effect) ?? '',
    affinityDelta: clampDelta(choice.affinityDelta ?? choice.delta ?? 0),
  })).filter(choice => choice.label.trim());
  return choices.length >= 2 ? choices : defaultChoices(type, affinityDelta);
}

export function eventTypeLabel(type: WorldEventType): string {
  return eventTypeLabels[type];
}

export function eventsForActiveWorld(): WorldEvent[] {
  const worldId = activeWorld().id;
  return state.worldEvents
    .filter(event => event.worldId === worldId)
    .sort((left, right) => right.createdAt - left.createdAt);
}

function participantNames(event: WorldEvent): string {
  return event.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join('、') || '整个世界';
}

function relationshipImpactLine(delta: number): string {
  if (delta > 0) return `好感度 +${delta}`;
  if (delta < 0) return `好感度 ${delta}`;
  return '好感度未变';
}

function appendRelationshipEvent(character: CharacterProfile, event: WorldEvent, delta: number, result: string): TimelineEntry {
  const relationship = character.relationship;
  relationship.affinity = Math.max(0, Math.round(relationship.affinity + delta));
  const impact = `岛上事件「${event.title}」结算：${compactText(result, 120)}（${relationshipImpactLine(delta)}）`;
  relationship.summary = relationship.summary
    ? `${relationship.summary}\n${impact}`.slice(-900)
    : impact;
  relationship.updatedAt = Date.now();
  return addRelationshipTimelineEntry(
    character,
    `${character.name} 的关系发生变化`,
    `岛上事件「${event.title}」结算后，${relationshipImpactLine(delta)}。${compactText(result, 100)}`,
    `${event.id}:${character.id}`,
  );
}

function removeRelationshipEventSummary(character: CharacterProfile, event: WorldEvent): void {
  const marker = `岛上事件「${event.title}」结算：`;
  if (!character.relationship.summary.includes(marker)) {
    return;
  }
  character.relationship.summary = character.relationship.summary
    .split('\n')
    .filter(line => !line.includes(marker))
    .join('\n');
  character.relationship.updatedAt = Date.now();
}

export function createWorldEvent(input: CreateWorldEventInput): WorldEvent {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) {
    throw new Error('事件标题和内容不能为空。');
  }
  const worldId = activeWorld().id;
  const type = input.type ?? 'daily';
  const affinityDelta = clampDelta(input.affinityDelta);
  const participantCharacterIds = validParticipantIds(input.participantCharacterIds, worldId);
  const createdAt = Date.now();
  const event: WorldEvent = {
    id: nowId('event'),
    worldId,
    title,
    description,
    type,
    participantCharacterIds,
    affinityDelta,
    choices: normalizeChoices(input.choices, type, affinityDelta),
    status: 'active',
    createdAt,
    updatedAt: createdAt,
    resolvedAt: null,
    source: input.source ?? 'manual',
  };
  state.worldEvents.push(event);
  addEventCreatedTimelineEntry(event);
  saveState();
  return event;
}

function companionsFor(character: CharacterProfile): CharacterProfile[] {
  const candidates = worldCharacters(character.worldId).filter(item => item.id !== character.id);
  if (candidates.length === 0) return [];
  const recentParticipantIds = state.worldEvents
    .filter(event => event.worldId === character.worldId && event.participantCharacterIds.includes(character.id))
    .flatMap(event => event.participantCharacterIds)
    .filter(id => id !== character.id);
  const recent = candidates.filter(item => recentParticipantIds.includes(item.id));
  const fresh = candidates
    .filter(item => !recent.some(recentItem => recentItem.id === item.id))
    .sort(() => Math.random() - 0.5);
  return [...recent, ...fresh];
}

function eventParticipants(character: CharacterProfile): CharacterProfile[] {
  const companions = companionsFor(character);
  const participants = [character];
  const firstCompanionChance = state.worldInteractionHighSimulation ? 0.88 : 0.72;
  if (companions[0] && Math.random() < firstCompanionChance) {
    participants.push(companions[0]);
  }
  if (state.worldInteractionHighSimulation && companions[1] && Math.random() < 0.45) {
    participants.push(companions[1]);
  }
  return participants;
}

function characterBrief(character: CharacterProfile): string {
  const settings = characterSettingsText(character);
  return [
    `姓名：${character.name}`,
    character.nickname ? `昵称：${character.nickname}` : '',
    settings ? `设定：${compactText(settings, 720)}` : '',
    `与用户关系：${character.relationship.stage}，好感度 ${character.relationship.affinity}`,
    character.relationship.summary ? `关系摘要：${compactText(character.relationship.summary, 260)}` : '',
  ].filter(Boolean).join('\n');
}

function recentEventContext(worldId: string): string {
  const events = state.worldEvents
    .filter(event => event.worldId === worldId)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 6);
  if (events.length === 0) return '暂无近期事件。';
  return events.map(event => {
    const result = event.decision ? `；结果：${compactText(event.decision.result, 80)}` : '';
    return `- ${event.title}（${eventTypeLabel(event.type)}，${event.status}，参与者：${participantNames(event)}）${result}`;
  }).join('\n');
}

function eventContextLine(event: WorldEvent): string {
  const result = event.decision ? `；结果：${compactText(event.decision.result, 80)}` : '';
  const description = event.description ? `；内容：${compactText(event.description, 90)}` : '';
  return `- ${event.title}；${eventTypeLabel(event.type)}；${event.status}；参与者：${participantNames(event)}${description}${result}`;
}

function todayEventContext(worldId: string, now = Date.now()): string {
  const today = localDateKey(now);
  const events = state.worldEvents
    .filter(event => event.worldId === worldId && localDateKey(event.createdAt) === today)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 10);
  if (events.length === 0) return '今天还没有生活线索。';
  return events.map(eventContextLine).join('\n');
}

export function eventGenerationMessages(character: CharacterProfile, participants: CharacterProfile[]): ModelMessage[] {
  const world = activeWorld();
  return [
    {
      role: 'system',
      content: [
        '你是 Tavern Social 的手机生活线索整理器。',
        '你不扮演任何聊天角色，不写小说场景，不使用角色扮演聊天格式，也不替用户做选择。',
        '你的任务是生成一条适合手机应用记录的轻量生活线索：像角色近况、世界小消息、待观察事项或可回访的小事。',
        '优先真实日常和已有上下文。只有设定或近期记录已经支持时，才写关系变化、求助或轻微问题；不要为了戏剧性制造误会、冲突或让用户线下到场。',
        '标题像手机里的简短事项标题，正文像近况记录，不要写成小剧场、新闻稿、旁白或聊天记录。',
        '同一世界同一天内要发生不同的事情：避开今日已发生生活线索里的相同地点、相同场景、相同麻烦、相同触发点、相同关系走向和近似标题。',
        '如果今天已经有类似事件，必须换成不同时间段、不同生活领域或不同触发源；优先选择动态余波、群聊小插曲、计划变化、物品、消息、天气、学习工作、社交状态等不同种类的小日常。',
        '绝对不要描写用户在线下到场、拉衣袖、敲门、旁观、加入现场、替任何人行动或被角色看见。',
        '只输出 JSON，不要解释，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `世界：${world.name}`,
        world.description ? `世界说明：${compactText(world.description, 500)}` : '',
        `用户名称：${state.userName}`,
        `本次主角：${character.name}`,
        '参与居民会是 1 到 3 位同世界角色。请让线索自然贴合这些居民之间可能发生的小互动，不要默认只围绕用户。',
        `参与居民：\n${participants.map(characterBrief).join('\n\n')}`,
        groupRelationshipContextFor(participants),
        `今日已发生生活线索（高优先级避重）：\n${todayEventContext(world.id)}`,
        `近期生活线索：\n${recentEventContext(world.id)}`,
        '',
        '请生成 JSON，字段如下：',
        '{"title":"短标题","type":"daily|news|relationship|problem","description":"30到90字的手机生活线索","affinityDelta":0,"choices":[{"label":"手机操作按钮","intent":"用户点这个按钮在应用里代表什么","affinityDelta":0}]}',
        '硬性要求：',
        '- title 要短，像手机事项或近况标题，不要像系统日志。',
        '- description 只写这条线索是什么；不要写成 80 字以上的小剧场，不要让用户出现在现场，也不要替用户行动。',
        '- choices 给 2 到 3 个，每个都是手机内操作，例如记录、私聊问一句、稍后处理、暂时略过。',
        '- choices.intent 写清楚用户点这个按钮在应用里的含义，不要写成线下行动结果。',
        '- type 默认优先 daily 或 news；只有上下文明确支持关系或求助时才用 relationship 或 problem。affinityDelta 范围 -20 到 20。',
        '- 同一天避免重复：不要复用今日已发生生活线索中的地点、场景、麻烦、互动模式或近似标题；如果相似，立刻换不同事情。',
        '- 不要出现“顺势参与”“帮忙调解”“加入现场”“敲门”“拉住”“看见你”等线下参与措辞。',
        '- 不要输出尖括号聊天标签、角色扮演聊天格式、私聊记录或提示词说明。',
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
    return JSON.parse(source.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function generatedEventFromText(text: string): Pick<CreateWorldEventInput, 'title' | 'description' | 'type' | 'affinityDelta' | 'choices'> {
  const json = parseJsonObject(text);
  if (!json) {
    return {
      title: '发生了一件小事',
      description: text.trim(),
      type: 'daily',
      affinityDelta: 0,
      choices: defaultChoices('daily'),
    };
  }
  const type = normalizeEventType(json.type);
  const affinityDelta = clampDelta(json.affinityDelta);
  const description = firstString(json.description, json.summary, json.content) ?? text.trim();
  return {
    title: firstString(json.title, json.headline) ?? '新鲜事',
    description,
    type,
    affinityDelta,
    choices: normalizeChoices(json.choices, type, affinityDelta),
  };
}

export async function generateWorldEvent(
  character: CharacterProfile,
  source: WorldEvent['source'] = 'model',
): Promise<WorldEvent> {
  const participants = eventParticipants(character);
  const raw = await callAuthoringModel(
    eventGenerationMessages(character, participants),
    { countBudget: source === 'auto_model' },
  );
  const generated = generatedEventFromText(raw);
  return createWorldEvent({
    ...generated,
    participantCharacterIds: participants.map(item => item.id),
    source,
  });
}

export function eventOutcomeMessages(event: WorldEvent, choice: WorldEventChoice): ModelMessage[] {
  const participants = event.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id))
    .filter((character): character is CharacterProfile => Boolean(character));
  return [
    {
      role: 'system',
      content: [
        '你是 Tavern Social 的手机生活线索结算器。',
        '你不扮演任何聊天角色，不输出聊天格式，不写小说场景。',
        '根据用户在应用内点下的手机操作，生成一段轻量后续记录，并给出最终关系影响。',
        '严格遵循用户选择：只写这个手机操作带来的后续，不能追加第二个选择，不能替用户继续操作。',
        '关系变化要克制、可解释，必须能从事件和选择中看出来。',
        '绝对不要描写用户线下到场、替用户敲门、拉人、劝架、移动、拥抱、观察或完成现实动作。',
        '只输出 JSON，不要解释，不要 Markdown。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `事件标题：${event.title}`,
        `事件类型：${eventTypeLabel(event.type)}`,
        `事件正文：${event.description}`,
        `参与居民：\n${participants.map(characterBrief).join('\n\n') || '整个世界'}`,
        groupRelationshipContextFor(participants),
        `用户选择：${choice.label}`,
        `选择意图：${choice.intent}`,
        `建议关系影响：${choice.affinityDelta}`,
        '',
        '请输出 JSON：{"result":"40到100字的后续记录","affinityDelta":0,"relationshipStageSuggestions":[{"fromCharacterId":"角色id","toCharacterId":"角色id","suggestedStage":"stranger|familiar|close|intimate|strained","reason":"一句理由"}]}',
        '硬性要求：',
        '- result 只写应用内操作之后能合理记录到的变化，例如被私聊问到后的回应、事项被记下后的状态、或角色关系的轻微变化。',
        '- 不要替用户继续做第二个决定，不要写用户线下行动，不要出现新的按钮选项，不要把结果写成聊天记录。',
        '- affinityDelta 范围 -20 到 20；如果关系没有明显变化就用 0。',
        '- relationshipStageSuggestions 只用于角色之间的阶段建议；它们必须来自参与居民之间，阶段不会自动生效，只会等待用户确认。没有明确阶段变化就输出空数组或省略。',
        '- 不要输出尖括号聊天标签、角色扮演聊天格式、Markdown 或解释文字。',
      ].join('\n'),
    },
  ];
}

function generatedRelationshipStageSuggestions(value: unknown): WorldEventDecision['relationshipStageSuggestions'] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord).map(item => {
    const suggestedStage = normalizeRelationshipStage(item.suggestedStage ?? item.stage);
    const fromCharacterId = firstString(item.fromCharacterId, item.from, item.sourceCharacterId) ?? '';
    const toCharacterId = firstString(item.toCharacterId, item.to, item.targetCharacterId) ?? '';
    if (!suggestedStage || !fromCharacterId || !toCharacterId || fromCharacterId === toCharacterId) return undefined;
    return {
      fromCharacterId,
      toCharacterId,
      suggestedStage,
      reason: firstString(item.reason, item.summary, item.description) ?? '',
    };
  }).filter((item): item is NonNullable<WorldEventDecision['relationshipStageSuggestions']>[number] => Boolean(item));
}

function generatedOutcomeFromText(
  text: string,
  fallbackDelta: number,
): Pick<WorldEventDecision, 'result' | 'affinityDelta' | 'relationshipStageSuggestions'> {
  const json = parseJsonObject(text);
  if (!json) {
    return {
      result: text.trim(),
      affinityDelta: clampDelta(fallbackDelta),
      relationshipStageSuggestions: [],
    };
  }
  return {
    result: firstString(json.result, json.summary, json.content) ?? text.trim(),
    affinityDelta: clampDelta(json.affinityDelta ?? fallbackDelta),
    relationshipStageSuggestions: generatedRelationshipStageSuggestions(json.relationshipStageSuggestions),
  };
}

function finishEvent(
  event: WorldEvent,
  choice: WorldEventChoice,
  result: string,
  affinityDelta: number,
  source: WorldEventDecision['source'],
  relationshipStageSuggestions: WorldEventDecision['relationshipStageSuggestions'] = [],
): WorldEvent {
  const now = Date.now();
  const finalDelta = clampDelta(affinityDelta);
  event.status = 'resolved';
  event.resolvedAt = now;
  event.updatedAt = now;
  event.resultSummary = result;
  event.modelError = undefined;
  event.decision = {
    choiceId: choice.id,
    label: choice.label,
    result,
    affinityDelta: finalDelta,
    relationshipStageSuggestions,
    createdAt: now,
    source,
  };
  const operationId = `event:${event.id}:resolved`;
  const sourceRef = { type: 'event' as const, id: `${event.id}:resolved` };
  const impactLabel = `事件结算：${event.title}`;
  const relationshipChanges: Array<{
    character: CharacterProfile;
    oldRelationship: ReturnType<typeof relationshipSnapshot>;
    newRelationship: ReturnType<typeof relationshipSnapshot>;
    timelineEntry: TimelineEntry;
  }> = [];
  for (const character of state.characters) {
    if (event.participantCharacterIds.includes(character.id)) {
      const oldRelationship = relationshipSnapshot(character);
      const timelineEntry = appendRelationshipEvent(character, event, finalDelta, result);
      relationshipChanges.push({
        character,
        oldRelationship,
        newRelationship: relationshipSnapshot(character),
        timelineEntry,
      });
    }
  }
  const characterRelationshipChanges = appendEventRelationshipSummaries(event, result);
  createEventRelationshipStageSuggestions(event, relationshipStageSuggestions.map(suggestion => ({
    worldId: event.worldId,
    fromCharacterId: suggestion.fromCharacterId,
    toCharacterId: suggestion.toCharacterId,
    suggestedStage: suggestion.suggestedStage,
    reason: suggestion.reason,
    sourceEventId: event.id,
  })));
  const resolvedTimelineEntry = addEventResolvedTimelineEntry(event);
  const timelineEntryIds = [
    resolvedTimelineEntry.id,
    ...relationshipChanges.map(change => change.timelineEntry.id),
    ...characterRelationshipChanges.map(change => change.timelineEntry.id),
  ];
  recordTimelineEntryImpact(resolvedTimelineEntry, operationId, impactLabel, sourceRef);
  for (const change of relationshipChanges) {
    recordTimelineEntryImpact(change.timelineEntry, operationId, impactLabel, sourceRef);
    recordImpact({
      worldId: event.worldId,
      operationId,
      label: impactLabel,
      source: sourceRef,
      targetType: 'relationship',
      targetId: change.character.id,
      characterId: change.character.id,
      field: 'relationship',
      oldValue: change.oldRelationship,
      newValue: change.newRelationship,
      timelineEntryIds,
      createdAt: now,
    });
  }
  for (const change of characterRelationshipChanges) {
    recordTimelineEntryImpact(change.timelineEntry, operationId, impactLabel, sourceRef);
    recordImpact({
      worldId: event.worldId,
      operationId,
      label: impactLabel,
      source: sourceRef,
      targetType: 'character_relationship',
      targetId: change.relationship.id,
      field: 'relationship',
      oldValue: change.oldRelationship,
      newValue: change.newRelationship,
      timelineEntryIds,
      createdAt: now,
    });
  }
  recordWorldEventInteraction(event);
  saveState();
  return event;
}

export async function resolveWorldEventChoice(eventId: string, choiceId: string): Promise<WorldEvent> {
  const event = state.worldEvents.find(item => item.id === eventId && item.worldId === activeWorld().id);
  if (!event || event.status === 'resolved') {
    throw new Error('找不到可处理的事件。');
  }
  const choice = event.choices.find(item => item.id === choiceId);
  if (!choice) {
    throw new Error('找不到这个事件分支。');
  }
  try {
    const raw = await callAuthoringModel(eventOutcomeMessages(event, choice));
    const outcome = generatedOutcomeFromText(raw, choice.affinityDelta || event.affinityDelta);
    return finishEvent(
      event,
      choice,
      outcome.result,
      outcome.affinityDelta,
      'model',
      outcome.relationshipStageSuggestions,
    );
  } catch (error) {
    event.modelError = error instanceof Error ? error.message : String(error);
    event.updatedAt = Date.now();
    saveState();
    throw error;
  }
}

export function finishWorldEventManually(eventId: string, result: string): WorldEvent {
  const event = state.worldEvents.find(item => item.id === eventId && item.worldId === activeWorld().id);
  if (!event || event.status === 'resolved') {
    throw new Error('找不到可处理的事件。');
  }
  const trimmed = result.trim();
  if (!trimmed) {
    throw new Error('请先写下事件结果。');
  }
  const choice = event.choices[0] ?? {
    id: nowId('choice'),
    label: '手写结果',
    intent: '用户手写了事件后续。',
    affinityDelta: event.affinityDelta,
  };
  return finishEvent(event, { ...choice, label: '手写结果' }, trimmed, choice.affinityDelta || event.affinityDelta, 'manual');
}

export function resolveWorldEvent(eventId: string): boolean {
  const event = state.worldEvents.find(item => item.id === eventId && item.worldId === activeWorld().id);
  if (!event || event.status === 'resolved') {
    return false;
  }
  const choice = event.choices[0] ?? {
    id: nowId('choice'),
    label: '标记结束',
    intent: '直接将事件记录为已经结束。',
    affinityDelta: event.affinityDelta,
  };
  finishEvent(event, { ...choice, label: '标记结束' }, '这件事被记录为已经结束，成为岛上近期生活的一部分。', event.affinityDelta, 'manual');
  return true;
}

export function deleteWorldEvent(eventId: string, options: { rollbackImpact?: boolean } = { rollbackImpact: true }): boolean {
  const index = state.worldEvents.findIndex(item => item.id === eventId && item.worldId === activeWorld().id);
  if (index < 0) {
    return false;
  }
  const [event] = state.worldEvents.slice(index, index + 1);
  revokeTimelineSource('event', event.id);
  revokeTimelineSource('event', `${event.id}:resolved`);
  const eventInteractions = state.characterInteractions.filter(record =>
    record.source.type === 'event' && record.source.id === `${event.id}:participants`,
  );
  for (const interaction of eventInteractions) {
    revokeTimelineSource('interaction', interaction.id);
  }
  if (options.rollbackImpact !== false) {
    const operationId = `event:${event.id}:resolved`;
    const activeImpact = recordsForOperation(operationId).some(record => !record.rolledBackAt);
    if (activeImpact) {
      rollbackImpactOperation(operationId);
    }
    for (const character of state.characters) {
      if (event.participantCharacterIds.includes(character.id)) {
        revokeTimelineSource('relationship', `${event.id}:${character.id}`);
        removeRelationshipEventSummary(character, event);
      }
    }
  }
  state.worldEvents.splice(index, 1);
  addEventDeletedTimelineEntry(event);
  saveState();
  return true;
}
