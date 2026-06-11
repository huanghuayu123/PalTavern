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
const characterRelationships = require('../src/independent-chat/characters/relationships');
const rpRendering = require('../src/independent-chat/ui/rp-rendering');

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
if (!Array.isArray(created.rpMessages) || created.rpMessages.length !== 0) {
  throw new Error('New world events should start with their own empty RP message log.');
}
if (
  typeof events.ensureWorldRpEvent !== 'function'
  || typeof events.appendWorldEventRpMessage !== 'function'
  || typeof events.worldEventRpMessages !== 'function'
) {
  throw new Error('World event RP log helpers are missing.');
}
const worldRpEvent = events.ensureWorldRpEvent(character);
const userWorldTurn = events.appendWorldEventRpMessage(worldRpEvent.id, {
  role: 'user',
  content: 'I leave a note beside the umbrella.',
  source: 'manual',
});
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
  || worldRpLog[1].id !== assistantWorldTurn.id
  || worldRpLog[1].characterId !== character.id
) {
  throw new Error('World event RP turns were not stored on the event log.');
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

(globalThis as any).fetch = async () => new Response(JSON.stringify({
  choices: [{
    message: {
      content: '{"result":"They talked it out under the umbrella and became more comfortable with each other.","affinityDelta":5}',
    },
  }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

async function main() {
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
    bracketlessBubbleRendering: true,
    secondWorldId: secondWorld.id,
  }));
}

void main();
