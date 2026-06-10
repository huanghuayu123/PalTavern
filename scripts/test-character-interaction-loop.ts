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

const stateModule = require('../src/independent-chat/state');
const moments = require('../src/independent-chat/moments');
const backgroundInteractions = require('../src/independent-chat/background-interactions');
const characterRelationships = require('../src/independent-chat/character-relationships');

function testCharacter(id: string, name: string, worldId = 'world_default') {
  return {
    id,
    worldId,
    name,
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'test',
      specVersion: '1',
      worldBookEntryCount: 0,
      importedFileName: '',
    },
    relationship: stateModule.createDefaultRelationship(),
    autoMessage: stateModule.createDefaultAutoMessageSchedule(),
    autoMoment: stateModule.createDefaultAutoMomentSchedule(),
    autoEvent: stateModule.createDefaultAutoEventSchedule(),
    currentPlan: stateModule.createDefaultCharacterPlan(name, Date.now()),
    importedAt: Date.now(),
  };
}

async function main(): Promise<void> {
  stateModule.replaceState(stateModule.defaultState());
  stateModule.state.characters = [];
  const a = testCharacter('interaction_a', 'Interaction A');
  const b = testCharacter('interaction_b', 'Interaction B');
  const otherWorld = stateModule.createWorld('Other World');
  const outsider = testCharacter('interaction_outsider', 'Outsider', otherWorld.id);
  stateModule.state.characters.push(a, b, outsider);
  stateModule.state.activeWorldId = 'world_default';
  a.currentPlan = {
    text: 'Interaction A wants to ask Interaction B about the missing notebook after class.',
    updatedAt: Date.now(),
    source: 'rule',
  };
  b.currentPlan = {
    text: 'Interaction B is avoiding crowded hallways and still thinking about yesterday.',
    updatedAt: Date.now(),
    source: 'rule',
  };
  outsider.currentPlan = {
    text: 'Outsider belongs to another world and must not enter this prompt.',
    updatedAt: Date.now(),
    source: 'rule',
  };

  const normalized = stateModule.normalizeState({
  worlds: [{ id: 'legacy_world', name: 'Legacy World', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'legacy_world',
  characters: [{
    id: 'legacy_character_with_no_plan',
    worldId: 'legacy_world',
    name: 'Legacy No Plan',
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'legacy',
      specVersion: '',
      worldBookEntryCount: 0,
      importedFileName: '',
    },
    relationship: stateModule.createDefaultRelationship(),
    autoMessage: stateModule.createDefaultAutoMessageSchedule(),
    autoMoment: stateModule.createDefaultAutoMomentSchedule(),
    autoEvent: stateModule.createDefaultAutoEventSchedule(),
    importedAt: 1,
  }],
  });
  if (
    !normalized.characters[0].currentPlan
    || !normalized.characters[0].currentPlan.text.includes('Legacy No Plan')
  ) {
    throw new Error('Legacy characters should receive a default current plan.');
  }

  const pair = characterRelationships.ensureCharacterRelationship(a, b);
  characterRelationships.updateCharacterRelationshipSide(pair, a.id, {
  stage: 'familiar',
  summary: 'Interaction A trusts Interaction B with small errands.',
  });
  characterRelationships.updateCharacterRelationshipSide(pair, b.id, {
  stage: 'stranger',
  summary: 'Interaction B is still unsure whether Interaction A is reliable.',
  });
  stateModule.state.timelineEntries.push({
  id: 'interaction_recent_timeline',
  worldId: 'world_default',
  createdAt: Date.now(),
  type: 'manual_note',
  characterIds: [a.id, b.id],
  characterNames: { [a.id]: a.name, [b.id]: b.name },
  title: 'Shared hallway memory',
  summary: 'They both noticed the notebook was missing near the stairs.',
  source: { type: 'manual', id: 'interaction_recent_timeline' },
  canUndo: false,
  includeInContext: true,
  });
  stateModule.state.timelineEntries.push({
  id: 'other_world_timeline',
  worldId: otherWorld.id,
  createdAt: Date.now(),
  type: 'manual_note',
  characterIds: [outsider.id],
  characterNames: { [outsider.id]: outsider.name },
  title: 'Other world memory should not leak',
  summary: 'This is not in the active world.',
  source: { type: 'manual', id: 'other_world_timeline' },
  canUndo: false,
  includeInContext: true,
  });
  const prompt = backgroundInteractions.buildBackgroundInteractionMessages('world_default', [a, b])
    .map((message: { content: string }) => message.content)
    .join('\n');
  if (
    !prompt.includes('Interaction A wants to ask Interaction B')
    || !prompt.includes('Interaction B is avoiding crowded hallways')
    || !prompt.includes('Interaction A trusts Interaction B with small errands')
    || !prompt.includes('Shared hallway memory')
    || !prompt.includes('只输出 JSON')
    || prompt.includes('Outsider belongs to another world')
    || prompt.includes('Other world memory should not leak')
  ) {
    throw new Error('Background interaction prompt should include current plans and same-world context only.');
  }

  stateModule.state.modelConfig.apiUrl = 'https://example.test';
  stateModule.state.modelConfig.model = 'interaction-loop-test-model';
  let fetchOutputs = [
  JSON.stringify({
    surface: 'timeline',
    type: 'help',
    title: 'Interaction A helped Interaction B find the notebook',
    summary: 'Interaction A quietly pointed out where the notebook had fallen, and Interaction B accepted the help.',
    reason: 'Their current plans both circled around the missing notebook.',
    stageSuggestions: [{
      fromCharacterId: b.id,
      toCharacterId: a.id,
      suggestedStage: 'familiar',
      reason: 'Interaction B saw that Interaction A was reliable in a small practical moment.',
    }],
  }),
  ];
  (globalThis as any).fetch = async () => new Response(JSON.stringify({
    choices: [{ message: { content: fetchOutputs.shift() ?? '{}' } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });

  const timelineResult = await backgroundInteractions.runBackgroundCharacterInteraction('world_default', {
    participantIds: [a.id, b.id],
    countBudget: true,
  });
  if (
    !timelineResult.ok
    || timelineResult.surface !== 'timeline'
    || stateModule.state.characterInteractions.length !== 1
    || !stateModule.state.timelineEntries.some((entry: any) =>
      entry.type === 'character_interaction'
      && entry.title.includes('notebook')
      && entry.includeInContext
    )
  ) {
    throw new Error('Timeline background interaction was not recorded as a character interaction.');
  }
  const updatedPair = characterRelationships.findCharacterRelationship('world_default', a.id, b.id);
  if (
    !updatedPair
    || !characterRelationships.relationshipSideFor(updatedPair, a.id).summary.includes('notebook')
    || !characterRelationships.relationshipSideFor(updatedPair, b.id).summary.includes('notebook')
    || characterRelationships.relationshipSideFor(updatedPair, b.id).stage !== 'stranger'
    || stateModule.state.characterRelationshipSuggestions.length !== 1
    || stateModule.state.characterRelationshipSuggestions[0].appliedAt
  ) {
    throw new Error('Background interaction should update relationship summaries and leave stage changes pending.');
  }

  const publicMoment = moments.publishMoment('Interaction B posted about the missing notebook.', b, 'character');
  fetchOutputs = [
  JSON.stringify({
    surface: 'moment_comment',
    type: 'followup',
    title: 'Interaction A commented on Interaction B post',
    summary: 'Interaction A left a short public reply instead of private-chatting the user.',
    reason: 'The recent post matched Interaction A current plan.',
    comment: '我刚才好像在楼梯边看到过。',
  }),
  ];
  const commentResult = await backgroundInteractions.runBackgroundCharacterInteraction('world_default', {
    participantIds: [a.id, b.id],
    preferMomentId: publicMoment.id,
    countBudget: true,
  });
  if (
    !commentResult.ok
    || commentResult.surface !== 'moment_comment'
    || publicMoment.comments.length !== 1
    || publicMoment.comments[0].characterId !== a.id
    || stateModule.state.characterInteractions.filter((item: any) => item.source.type === 'comment').length !== 1
  ) {
    throw new Error('Public background interaction should create a bounded moment comment.');
  }

  stateModule.state.characterInteractions = Array.from({ length: 8 }, (_, index) => ({
  id: `budget_default_${index}`,
  worldId: 'world_default',
  type: 'mention',
  actorCharacterId: a.id,
  targetCharacterIds: [b.id],
  title: 'Budget fixture',
  summary: 'Budget fixture',
  reason: 'Budget fixture',
  source: { type: 'manual', id: `budget_default_${index}` },
  createdAt: Date.now(),
  }));
  stateModule.state.worldInteractionHighSimulation = false;
  if (backgroundInteractions.backgroundInteractionReadiness('world_default').ok) {
    throw new Error('Default interaction mode should stop at the low daily world limit.');
  }
  stateModule.state.worldInteractionHighSimulation = true;
  if (!backgroundInteractions.backgroundInteractionReadiness('world_default').ok) {
    throw new Error('Hot world interaction mode should raise the daily world limit.');
  }

  console.log(JSON.stringify({
    currentPlanMigration: true,
    promptContext: true,
    timelineInteraction: true,
    momentCommentInteraction: true,
    relationshipSummary: true,
    pendingStageSuggestion: true,
    interactionModeBudget: true,
  }));
}

void main();
