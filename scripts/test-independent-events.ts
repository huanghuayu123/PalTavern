export {};
declare const require: (id: string) => any;

const values = new Map<string, string>();
Object.defineProperty(globalThis, 'localStorage', {
  value: {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
    removeItem(key: string) {
      values.delete(key);
    },
    clear() {
      values.clear();
    },
  },
});

const stateModule = require('../src/independent-chat/core/state');
const events = require('../src/independent-chat/social/events');
const impacts = require('../src/independent-chat/memory/impacts');
const model = require('../src/independent-chat/model/client');
const privateChat = require('../src/independent-chat/chat/private-chat');
const characterRelationships = require('../src/independent-chat/characters/relationships');
const rpRendering = require('../src/independent-chat/ui/rp-rendering');
const promptPresets = require('../src/independent-chat/model/prompt-presets');

const character = {
  id: 'character_event_test',
  worldId: 'world_default',
  name: 'Event Character',
  tags: [],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v2',
    specVersion: '2.0',
    worldBookEntryCount: 0,
    importedFileName: '',
  },
  relationship: stateModule.createDefaultRelationship(),
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
  importedAt: Date.now(),
};
const companion = {
  ...character,
  id: 'character_event_companion',
  name: 'Event Companion',
  relationship: stateModule.createDefaultRelationship(),
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
};
stateModule.state.characters.push(character, companion);
stateModule.state.activeCharacterId = character.id;
stateModule.state.modelConfig.apiUrl = 'https://example.test';
stateModule.state.modelConfig.model = 'event-test-model';
const initialPair = characterRelationships.ensureCharacterRelationship(character, companion);
characterRelationships.updateCharacterRelationshipSide(initialPair, character.id, {
  stage: 'familiar',
  summary: 'Event Character trusts Event Companion during storms.',
});
characterRelationships.updateCharacterRelationshipSide(initialPair, companion.id, {
  stage: 'familiar',
  summary: 'Event Companion watches Event Character for signs of overthinking.',
});

const created = events.createWorldEvent({
  title: 'Unexpected rain',
  description: 'They shared one umbrella on the way home.',
  participantCharacterIds: [character.id, 'missing_character'],
  affinityDelta: 8,
  type: 'relationship',
});
const userLedManualEvent = events.createWorldEvent({
  title: 'User-led cafe thread',
  description: 'The current user identity starts a small cafe moment.',
  participantCharacterIds: [companion.id, 'user', 'missing_character'],
  leadActor: {
    type: 'user',
    id: 'user',
    name: 'Event User',
  },
  affinityDelta: 0,
  type: 'daily',
});
if (
  userLedManualEvent.leadActor?.type !== 'user'
  || userLedManualEvent.leadActor?.name !== 'Event User'
  || userLedManualEvent.participantCharacterIds.length !== 1
  || userLedManualEvent.participantCharacterIds[0] !== companion.id
  || userLedManualEvent.participantCharacterIds.includes('user')
) {
  throw new Error('User-led events should keep user identity as leadActor without storing user as a character participant.');
}
if (!Array.isArray(created.rpMessages) || created.rpMessages.length !== 0) {
  throw new Error('New world events should start with their own empty RP message log.');
}
if (
  typeof events.ensureWorldRpEvent !== 'function'
  || typeof events.appendWorldEventRpMessage !== 'function'
  || typeof events.worldEventRpMessages !== 'function'
  || typeof events.editWorldEventRpMessage !== 'function'
) {
  throw new Error('World event RP log helpers are missing.');
}
const worldRpEvent = events.ensureWorldRpEvent(character);
const userWorldTurn = events.appendWorldEventRpMessage(worldRpEvent.id, {
  role: 'user',
  characterId: companion.id,
  speaker: companion.name,
  content: 'I leave a note beside the umbrella.',
  source: 'manual',
});
if (!events.editWorldEventRpMessage(userWorldTurn.id, 'I revise the note beside the umbrella.')) {
  throw new Error('World event RP user turns should be editable.');
}
const assistantWorldTurn = events.appendWorldEventRpMessage(worldRpEvent.id, {
  role: 'assistant',
  characterId: character.id,
  speaker: character.name,
  content: '@bubble:Event Character|gentle|I saw the note.',
  source: 'model',
});
const worldRpLog = events.worldEventRpMessages(worldRpEvent.id);
if (
  worldRpLog.length !== 2
  || worldRpLog[0].id !== userWorldTurn.id
  || worldRpLog[0].content !== 'I revise the note beside the umbrella.'
  || worldRpLog[0].speaker !== companion.name
  || worldRpLog[0].characterId !== companion.id
  || worldRpLog[1].id !== assistantWorldTurn.id
  || worldRpLog[1].characterId !== character.id
) {
  throw new Error('World event RP turns were not stored on the event log.');
}

const worldPromptPreset = promptPresets.parseSillyTavernPromptPreset(JSON.stringify({
  regex_scripts: [{
    id: 'world_regex_remove',
    scriptName: 'Remove world test token',
    findRegex: 'DROP_WORLD_TOKEN',
    replaceString: '',
  }],
  prompts: [
    {
      identifier: 'world_rules',
      name: 'World preset rules',
      role: 'system',
      content: 'WORLD_PRESET_RULE {{char}} {{user}} {{lastUserMessage}}',
    },
    { identifier: 'worldInfoBefore', name: 'World info', role: 'system', marker: true, content: '' },
    { identifier: 'charDescription', name: 'Character info', role: 'system', marker: true, content: '' },
    { identifier: 'chatHistory', name: 'World RP history', role: 'system', marker: true, content: '' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'world_rules', enabled: true },
      { identifier: 'worldInfoBefore', enabled: true },
      { identifier: 'charDescription', enabled: true },
      { identifier: 'chatHistory', enabled: true },
    ],
  }],
}), 'world-preset.json', 1200);
stateModule.state.promptPresets.push(worldPromptPreset);
stateModule.state.activeWorldPromptPresetId = worldPromptPreset.id;
stateModule.state.worldPromptPresetEnabled = true;
let worldRpPayload: any;
async function assertWorldPresetGeneration() {
  (globalThis as any).fetch = async (_input: string, init?: { body?: string }) => {
    worldRpPayload = init?.body ? JSON.parse(init.body) : undefined;
    return new Response(JSON.stringify({
      choices: [{ message: { content: [
        '<thinking>hidden planning</thinking>',
        'DROP_WORLD_TOKEN ```md',
        '# 世界 RP',
        '<msg>@bubble:Event Character|gentle|Preset reply.</msg>',
        '<sticker:smile>',
        '```',
      ].join('\n') } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const generated = await events.generateWorldEventRpReply(worldRpEvent.id, character);
  const promptText = worldRpPayload?.messages?.map((message: { content: string }) => message.content).join('\n') ?? '';
  if (
    !promptText.includes('WORLD_PRESET_RULE Event Character')
    || !promptText.includes('I revise the note beside the umbrella.')
    || !promptText.includes('Event Companion')
    || !promptText.includes('World RP history')
    || generated.content.includes('DROP_WORLD_TOKEN')
    || generated.content.includes('<thinking>')
    || generated.content.includes('<msg>')
    || generated.content.includes('<sticker:')
    || generated.content.includes('```')
    || generated.content.includes('# 世界 RP')
    || !generated.content.includes('Preset reply.')
  ) {
    throw new Error('World RP generation did not use the selected preset or clean wrapper formatting from model output.');
  }
}
let explicitEventPayload: any;
async function assertExplicitEventGeneration() {
  (globalThis as any).fetch = async (_input: string, init?: { body?: string }) => {
    explicitEventPayload = init?.body ? JSON.parse(init.body) : undefined;
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: '{"title":"User-led generated thread","type":"daily","description":"A small cafe update is ready for the selected companion.","affinityDelta":0,"choices":[{"label":"Record it","intent":"Keep the update in the world event flow.","affinityDelta":0}]}',
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  const generated = await events.generateWorldEvent(undefined, 'model', {
    leadActor: {
      type: 'user',
      id: 'user',
      name: 'Event User',
    },
    participantCharacterIds: [companion.id],
  });
  const promptText = explicitEventPayload?.messages?.map((message: { content: string }) => message.content).join('\n') ?? '';
  if (
    generated.leadActor?.type !== 'user'
    || generated.participantCharacterIds.length !== 1
    || generated.participantCharacterIds[0] !== companion.id
    || promptText.includes('Event Character trusts Event Companion during storms.')
    || !promptText.includes('Event User')
    || !promptText.includes('Event Companion')
  ) {
    throw new Error('Explicit user-led event generation should use the chosen lead actor and selected participants only.');
  }
}

async function assertPrivateChatEventSuggestions() {
  const responses = [
    JSON.stringify({
      shouldSuggest: true,
      title: '线下咖啡碰面',
      type: 'daily',
      description: '你和 Event Character 在私聊里约定明天下午到线下咖啡店碰面。',
      affinityDelta: 3,
      participantCharacterIds: [character.id, 'missing_character', companion.id],
      reason: '私聊中出现明确的线下见面安排。',
    }),
    JSON.stringify({ shouldSuggest: false, reason: '只是普通问候。' }),
    JSON.stringify({ shouldSuggest: false, reason: '用户只是确认时间。' }),
    '<msg>那我们明天下午就在线下咖啡店见。</msg>',
    JSON.stringify({
      shouldSuggest: true,
      title: '角色确认线下见面',
      type: 'daily',
      description: 'Event Character 在回复中确认明天下午的线下咖啡店碰面。',
      affinityDelta: 2,
      participantCharacterIds: [character.id],
      reason: '角色回复确认了线下见面安排。',
    }),
  ];
  const detectorPayloads: any[] = [];
  (globalThis as any).fetch = async (_input: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (Array.isArray(body.messages)) detectorPayloads.push(body);
    const content = responses.shift() ?? JSON.stringify({ shouldSuggest: false });
    return new Response(JSON.stringify({
      choices: [{ message: { content } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  await privateChat.sendUserMessageOnly('那我们明天下午在线下咖啡店见。', () => {});
  const userSuggestion = stateModule.state.privateChatEventSuggestions.find((suggestion: any) =>
    suggestion.title === '线下咖啡碰面'
  );
  if (
    !userSuggestion
    || userSuggestion.status !== 'pending'
    || userSuggestion.sourceKind !== 'private_chat'
    || userSuggestion.sourceMessageRole !== 'user'
    || userSuggestion.participantCharacterIds.includes('missing_character')
    || !userSuggestion.participantCharacterIds.includes(character.id)
    || !userSuggestion.participantCharacterIds.includes(companion.id)
    || stateModule.state.worldEvents.some((event: any) => event.title === '线下咖啡碰面')
  ) {
    throw new Error('User private chat event detection should create a pending suggestion without creating a world event.');
  }
  const detectorPrompt = detectorPayloads[0]?.messages?.map((message: { content: string }) => message.content).join('\n') ?? '';
  if (
    !detectorPrompt.includes('只输出 JSON')
    || !detectorPrompt.includes('接受前不得进入世界记录/世界上下文')
    || !detectorPrompt.includes('触发消息')
  ) {
    throw new Error('Private chat event detection prompt should be structured, narrow, and explicit about pre-acceptance isolation.');
  }
  const createdFromSuggestion = events.createWorldEventFromPrivateChatSuggestion(userSuggestion.id);
  if (
    createdFromSuggestion.title !== '线下咖啡碰面'
    || createdFromSuggestion.source !== 'manual'
    || userSuggestion.status !== 'accepted'
    || userSuggestion.createdEventId !== createdFromSuggestion.id
    || !stateModule.state.timelineEntries.some((entry: any) =>
      entry.source.type === 'event' && entry.source.id === createdFromSuggestion.id
    )
  ) {
    throw new Error('Accepting a private chat suggestion should create a manual world event and mark the suggestion accepted.');
  }

  const beforeQuiet = stateModule.state.privateChatEventSuggestions.length;
  await privateChat.sendUserMessageOnly('今天只是普通聊聊天。', () => {});
  if (stateModule.state.privateChatEventSuggestions.length !== beforeQuiet) {
    throw new Error('AI shouldSuggest:false responses must not create private chat event suggestions.');
  }

  await privateChat.sendMessage('你觉得明天下午还方便吗？', () => {});
  const assistantSuggestion = stateModule.state.privateChatEventSuggestions.find((suggestion: any) =>
    suggestion.title === '角色确认线下见面'
  );
  if (
    !assistantSuggestion
    || assistantSuggestion.sourceMessageRole !== 'assistant'
    || assistantSuggestion.status !== 'pending'
  ) {
    throw new Error('Assistant private chat replies should also be checked for event suggestions.');
  }
  if (!events.dismissPrivateChatEventSuggestion(assistantSuggestion.id) || assistantSuggestion.status !== 'dismissed') {
    throw new Error('Private chat event suggestions should be dismissible.');
  }

  const beforeFailure = stateModule.state.privateChatEventSuggestions.length;
  (globalThis as any).fetch = async () => {
    throw new Error('detector unavailable');
  };
  await privateChat.sendUserMessageOnly('失败时也不该打断聊天，哪怕我说今晚见。', () => {});
  if (stateModule.state.privateChatEventSuggestions.length !== beforeFailure) {
    throw new Error('Detector failures should be silent and should not create suggestions.');
  }
}
const bracketlessBubbleSegments = rpRendering.parseRpRenderSegments('@bubble:Event Character|gentle|I saw the note.', {
  fallbackSpeaker: 'Event Character',
  fallbackEmotion: 'reply',
  plainTextMode: 'dialogue',
});
if (
  bracketlessBubbleSegments.length !== 1
  || bracketlessBubbleSegments[0].kind !== 'dialogue'
  || bracketlessBubbleSegments[0].speaker !== 'Event Character'
  || bracketlessBubbleSegments[0].emotion !== 'gentle'
  || bracketlessBubbleSegments[0].text !== 'I saw the note.'
) {
  throw new Error('World RP renderer should parse bracketless @bubble lines instead of showing raw markup.');
}
stateModule.state.worldEvents.push({
  id: 'other_world_today_event',
  worldId: 'other_world',
  title: 'Other world duplicate bait',
  description: 'This event belongs to another world and must not enter generation context.',
  type: 'daily',
  participantCharacterIds: [],
  affinityDelta: 0,
  choices: [],
  status: 'active',
  createdAt: Date.now(),
  updatedAt: Date.now(),
  resolvedAt: null,
  source: 'model',
});
const createdTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'event' && entry.source.id === created.id,
);
if (
  !createdTimelineEntry
  || createdTimelineEntry.worldId !== 'world_default'
  || createdTimelineEntry.characterIds[0] !== character.id
  || !createdTimelineEntry.includeInContext
) {
  throw new Error('Created world event was not written into the timeline.');
}
const generationPrompt = events.eventGenerationMessages(character, [character, companion])
  .map((message: { content: string }) => message.content)
  .join('\n');
if (
  !generationPrompt.includes('手机生活线索整理器')
  || !generationPrompt.includes('Event Character trusts Event Companion during storms.')
  || !generationPrompt.includes('Event Companion watches Event Character for signs of overthinking.')
  || !generationPrompt.includes('只输出 JSON')
  || !generationPrompt.includes('"title"')
  || !generationPrompt.includes('"choices"')
  || !generationPrompt.includes('不要让用户出现在现场')
  || !generationPrompt.includes('默认优先 daily 或 news')
  || !generationPrompt.includes('参与居民会是 1 到 3 位同世界角色')
  || !generationPrompt.includes('今日已发生生活线索')
  || !generationPrompt.includes('同一天避免重复')
  || !generationPrompt.includes('换不同事情')
  || !generationPrompt.includes('Unexpected rain')
  || !generationPrompt.includes('They shared one umbrella on the way home.')
  || generationPrompt.includes('Other world duplicate bait')
  || generationPrompt.includes('岛上新闻 + 居民小剧场')
  || generationPrompt.includes('玩家介入')
  || generationPrompt.includes('<msg>')
  || generationPrompt.includes('Tavern Social 运行格式保护')
) {
  throw new Error('Event generation prompt is missing phone-life constraints or leaked RP/chat formatting.');
}
if (created.participantCharacterIds.length !== 1 || created.participantCharacterIds[0] !== character.id) {
  throw new Error('Invalid event participants were not filtered.');
}
if (character.relationship.affinity !== 0 || !created.choices.length) {
  throw new Error('Event creation should wait for branch resolution before changing relationships.');
}
const outcomePrompt = events.eventOutcomeMessages(created, created.choices[0])
  .map((message: { content: string }) => message.content)
  .join('\n');
if (
  !outcomePrompt.includes('严格遵循用户选择')
  || !outcomePrompt.includes('不能追加第二个选择')
  || !outcomePrompt.includes('"result"')
  || !outcomePrompt.includes('"affinityDelta"')
  || !outcomePrompt.includes('"relationshipStageSuggestions"')
  || !outcomePrompt.includes('不要写用户线下行动')
  || outcomePrompt.includes('<msg>')
  || outcomePrompt.includes('Tavern Social 运行格式保护')
) {
  throw new Error('Event outcome prompt is missing phone-action constraints or leaked chat formatting.');
}

const eventOutcomeFetch = async () => new Response(JSON.stringify({
  choices: [{
    message: {
      content: '{"result":"They talked it out under the umbrella and became more comfortable with each other.","affinityDelta":5}',
    },
  }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

async function main() {
  await assertExplicitEventGeneration();
  await assertWorldPresetGeneration();
  await assertPrivateChatEventSuggestions();
  stateModule.state.activeWorldPromptPresetId = promptPresets.TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID;
  stateModule.state.worldPromptPresetEnabled = true;
  (globalThis as any).fetch = eventOutcomeFetch;

  await events.resolveWorldEventChoice(created.id, created.choices[0].id);
  if (character.relationship.affinity !== 5 || !character.relationship.summary.includes('Unexpected rain')) {
    throw new Error('Event branch resolution did not update the participant relationship.');
  }
  const resolvedTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
    entry.source.type === 'event' && entry.source.id === `${created.id}:resolved`,
  );
  const relationshipTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
    entry.source.type === 'relationship' && entry.source.id === `${created.id}:${character.id}`,
  );
  if (
    !resolvedTimelineEntry
    || !resolvedTimelineEntry.canUndo
    || !relationshipTimelineEntry
    || !relationshipTimelineEntry.summary.includes('好感度 +5')
  ) {
    throw new Error('Resolved event relationship impact was not written into the timeline.');
  }

  const prompt = model.buildModelMessages(character)[0].content;
  if (
    !prompt.includes('近期世界事件')
    || !prompt.includes('Unexpected rain')
    || !prompt.includes('They talked it out')
  ) {
    throw new Error('Resolved world event was not added to the model context.');
  }
  const eventImpactRecords = stateModule.state.impactRecords.filter((record: any) =>
    record.operationId === `event:${created.id}:resolved`,
  );
  if (
    eventImpactRecords.length < 3
    || !eventImpactRecords.some((record: any) => record.targetType === 'relationship')
    || !eventImpactRecords.some((record: any) => record.targetId === resolvedTimelineEntry.id)
  ) {
    throw new Error('Resolved event did not create traceable impact records.');
  }
  const rollback = impacts.rollbackTimelineEntryImpact(resolvedTimelineEntry.id);
  if (
    !rollback.ok
    || character.relationship.affinity !== 0
    || character.relationship.summary.includes('Unexpected rain')
    || !resolvedTimelineEntry.revokedAt
    || resolvedTimelineEntry.includeInContext
    || !relationshipTimelineEntry.revokedAt
    || relationshipTimelineEntry.includeInContext
    || !eventImpactRecords.every((record: any) => record.rolledBackAt)
  ) {
    throw new Error('Resolved event relationship impact was not rolled back correctly.');
  }
  const rollbackPrompt = model.buildModelMessages(character)[0].content;
  if (rollbackPrompt.includes('They talked it out')) {
    throw new Error('Rolled-back event result remained in model context.');
  }

  const secondWorld = stateModule.createWorld('Second world');
  events.createWorldEvent({
    title: 'Second event',
    description: 'This belongs to another world.',
    participantCharacterIds: [],
    affinityDelta: 0,
  });
  if (events.eventsForActiveWorld().length !== 1 || events.eventsForActiveWorld()[0].title !== 'Second event') {
    throw new Error('World event isolation failed.');
  }

  stateModule.setActiveWorld('world_default');
  const manual = events.createWorldEvent({
    title: 'Manual result',
    description: 'A resident needed a handwritten ending.',
    participantCharacterIds: [character.id],
    affinityDelta: 3,
  });
  events.finishWorldEventManually(manual.id, 'The user wrote a calm ending.');
  if (manual.status !== 'resolved' || character.relationship.affinity !== 3) {
    throw new Error('Manual event resolution failed.');
  }

  const direct = events.createWorldEvent({
    title: 'Direct resolve',
    description: 'This event is closed without a generated result.',
    participantCharacterIds: [character.id],
    affinityDelta: 1,
  });
  if (!events.resolveWorldEvent(direct.id)) {
    throw new Error('Event could not be resolved directly.');
  }
  if (direct.status !== 'resolved') {
    throw new Error('Resolved event status was not persisted.');
  }
  const directResolvedTimeline = stateModule.state.timelineEntries.find((entry: any) =>
    entry.source.type === 'event' && entry.source.id === `${direct.id}:resolved`,
  );
  if (
    !directResolvedTimeline
    || directResolvedTimeline.type !== 'event'
    || !directResolvedTimeline.includeInContext
    || !directResolvedTimeline.summary.includes('This event is closed')
  ) {
    throw new Error('Directly ended events should be archived into the world timeline with an event-specific summary.');
  }

  const multi = events.createWorldEvent({
    title: 'Shared errand',
    description: 'Two residents had to handle one small problem together.',
    participantCharacterIds: [character.id, companion.id],
    affinityDelta: 2,
  });
  if (!events.resolveWorldEvent(multi.id)) {
    throw new Error('Multi-character event could not be resolved directly.');
  }
  const multiInteraction = stateModule.state.characterInteractions.find((record: any) =>
    record.type === 'world_event' && record.source.type === 'event' && record.source.id === `${multi.id}:participants`,
  );
  const multiInteractionTimeline = multiInteraction
    ? stateModule.state.timelineEntries.find((entry: any) => entry.source.type === 'interaction' && entry.source.id === multiInteraction.id)
    : undefined;
  if (
    !multiInteraction
    || multiInteraction.actorCharacterId !== character.id
    || !multiInteraction.targetCharacterIds.includes(companion.id)
    || !multiInteractionTimeline
    || multiInteractionTimeline.type !== 'character_interaction'
    || !multiInteractionTimeline.includeInContext
  ) {
    throw new Error('Multi-character event did not create a character interaction record.');
  }
  const multiPair = characterRelationships.findCharacterRelationship(character.worldId, character.id, companion.id);
  if (
    !multiPair
    || !multiPair.aToB.summary.includes('Shared errand')
    || !multiPair.bToA.summary.includes('Shared errand')
    || multiPair.aToB.stage !== 'familiar'
    || multiPair.bToA.stage !== 'familiar'
  ) {
    throw new Error('Multi-character event did not append two-way relationship summaries without changing stages.');
  }

  (globalThis as any).fetch = async () => new Response(JSON.stringify({
    choices: [{
      message: {
        content: JSON.stringify({
          result: 'They compared notes afterward and understood why the other reacted that way.',
          affinityDelta: 0,
          relationshipStageSuggestions: [{
            fromCharacterId: character.id,
            toCharacterId: companion.id,
            suggestedStage: 'close',
            reason: 'The follow-up made their trust clearer.',
          }],
        }),
      },
    }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
  const suggestionEvent = events.createWorldEvent({
    title: 'Late notes',
    description: 'Two residents needed to compare notes after a confusing day.',
    participantCharacterIds: [character.id, companion.id],
    affinityDelta: 0,
    type: 'relationship',
  });
  await events.resolveWorldEventChoice(suggestionEvent.id, suggestionEvent.choices[0].id);
  const pendingSuggestion = stateModule.state.characterRelationshipSuggestions.find((suggestion: any) =>
    suggestion.sourceEventId === suggestionEvent.id
    && suggestion.fromCharacterId === character.id
    && suggestion.toCharacterId === companion.id,
  );
  const pairAfterSuggestion = characterRelationships.findCharacterRelationship(character.worldId, character.id, companion.id);
  const characterSideAfterSuggestion = pairAfterSuggestion
    ? characterRelationships.relationshipSideFor(pairAfterSuggestion, character.id)
    : undefined;
  if (
    !pendingSuggestion
    || pendingSuggestion.suggestedStage !== 'close'
    || pendingSuggestion.appliedAt
    || !pairAfterSuggestion
    || characterSideAfterSuggestion.stage !== 'familiar'
    || !characterSideAfterSuggestion.summary.includes('Late notes')
  ) {
    throw new Error('Event stage suggestions should remain pending while relationship summaries are appended.');
  }
  const appliedSuggestion = characterRelationships.applyCharacterRelationshipSuggestion(pendingSuggestion.id);
  const characterSideAfterApply = characterRelationships.relationshipSideFor(pairAfterSuggestion, character.id);
  if (
    !appliedSuggestion.ok
    || !appliedSuggestion.timelineEntry
    || characterSideAfterApply.stage !== 'close'
    || !pendingSuggestion.appliedAt
  ) {
    throw new Error('Applying a relationship stage suggestion did not update the directional stage.');
  }
  const suggestionRollback = impacts.rollbackTimelineEntryImpact(appliedSuggestion.timelineEntry.id);
  const restoredPairAfterSuggestion = characterRelationships.findCharacterRelationship(character.worldId, character.id, companion.id);
  const restoredCharacterSide = restoredPairAfterSuggestion
    ? characterRelationships.relationshipSideFor(restoredPairAfterSuggestion, character.id)
    : undefined;
  const restoredSuggestion = stateModule.state.characterRelationshipSuggestions.find((suggestion: any) =>
    suggestion.id === pendingSuggestion.id,
  );
  if (!suggestionRollback.ok || restoredCharacterSide?.stage !== 'familiar' || restoredSuggestion?.appliedAt) {
    throw new Error('Rolling back an applied relationship stage suggestion did not restore the old stage.');
  }
  const ignoredSuggestion = characterRelationships.createCharacterRelationshipStageSuggestion({
    worldId: character.worldId,
    relationshipId: pairAfterSuggestion.id,
    fromCharacterId: companion.id,
    toCharacterId: character.id,
    suggestedStage: 'strained',
    reason: 'This suggestion should be ignored.',
    sourceEventId: suggestionEvent.id,
  });
  if (!characterRelationships.ignoreCharacterRelationshipSuggestion(ignoredSuggestion.id).ok || !ignoredSuggestion.ignoredAt) {
    throw new Error('Ignoring a pending character relationship suggestion failed.');
  }

  if (!events.deleteWorldEvent(created.id)) {
    throw new Error('Event deletion failed.');
  }
  const deletedTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
    entry.source.type === 'event' && entry.source.id === `${created.id}:deleted`,
  );
  if (
    !createdTimelineEntry.revokedAt
    || createdTimelineEntry.includeInContext
    || !resolvedTimelineEntry.revokedAt
    || resolvedTimelineEntry.includeInContext
    || !relationshipTimelineEntry.revokedAt
    || relationshipTimelineEntry.includeInContext
    || !deletedTimelineEntry
    || deletedTimelineEntry.includeInContext
  ) {
    throw new Error('Deleting an event did not revoke prior timeline influence and add a deletion record.');
  }
  const afterDeletePrompt = model.buildModelMessages(character)[0].content;
  if (afterDeletePrompt.includes('Unexpected rain')) {
    throw new Error('Deleted event remained in model context.');
  }

  console.log(JSON.stringify({
    branchResolution: true,
    generationPrompt: true,
    outcomePrompt: true,
    promptContext: true,
    worldIsolation: true,
    manualResolve: true,
    directResolve: true,
    impactRollback: true,
    multiCharacterInteraction: true,
    characterRelationshipSummary: true,
    characterRelationshipSuggestion: true,
    characterRelationshipSuggestionRollback: true,
    deleteContext: true,
    eventTimeline: true,
    eventTimelineRevoked: true,
    userLeadActor: true,
    explicitEventGeneration: true,
    bracketlessBubbleRendering: true,
    secondWorldId: secondWorld.id,
  }));
}

void main();
