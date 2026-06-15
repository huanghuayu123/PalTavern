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

Object.defineProperty(globalThis, 'window', {
  value: {
    setInterval,
    clearInterval,
  },
});

const fs = require('node:fs');
const path = require('node:path');
const stateModule = require('../src/independent-chat/core/state');
const cards = require('../src/independent-chat/characters/cards');
const characterRelationships = require('../src/independent-chat/characters/relationships');
const backup = require('../src/independent-chat/data/backup');
const directChat = require('../src/independent-chat/chat/character-direct-chat');
const events = require('../src/independent-chat/social/events');

function testCharacter(id: string, name: string, worldId = 'world_default') {
  return {
    id,
    worldId,
    name,
    description: `${name} has enough profile for direct character chat.`,
    personality: `${name} speaks in short, natural messages.`,
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

type MockModelCall = { messages: Array<{ role: string; content: string }> };

function mockModelResponses(responses: string[]) {
  const calls: MockModelCall[] = [];
  const originalFetch = (globalThis as any).fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (_url: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      calls.push({ messages: Array.isArray(body.messages) ? body.messages : [] });
      const content = responses.shift() ?? '<msg>fallback reply</msg>';
      return {
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
        clone() {
          return {
            text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
          };
        },
      };
    },
  });
  stateModule.state.modelConfig.apiUrl = 'https://unit.test/v1';
  stateModule.state.modelConfig.model = 'unit-model';
  stateModule.state.modelConfig.apiKey = 'test-key';
  return {
    calls,
    restore() {
      if (originalFetch) {
        Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
      } else {
        delete (globalThis as any).fetch;
      }
      stateModule.state.modelConfig.apiUrl = '';
      stateModule.state.modelConfig.model = '';
      stateModule.state.modelConfig.apiKey = '';
    },
  };
}

async function main(): Promise<void> {
  stateModule.replaceState(stateModule.defaultState());
  stateModule.state.characters = [
    testCharacter('direct_a', 'Direct A'),
    testCharacter('direct_b', 'Direct B'),
    testCharacter('direct_c', 'Direct C'),
  ];
  stateModule.state.activeWorldId = 'world_default';
  stateModule.state.worldInteractionHighSimulation = false;

  const directA = stateModule.state.characters.find((character: any) => character.id === 'direct_a');
  const directB = stateModule.state.characters.find((character: any) => character.id === 'direct_b');
  const directC = stateModule.state.characters.find((character: any) => character.id === 'direct_c');
  const pair = characterRelationships.ensureCharacterRelationship(directA, directB);
  characterRelationships.updateCharacterRelationshipSide(pair, directA.id, {
    stage: 'familiar',
    summary: 'Direct A already trusts Direct B with small errands.',
  });
  characterRelationships.updateCharacterRelationshipSide(pair, directB.id, {
    stage: 'stranger',
    summary: 'Direct B is still deciding whether Direct A is reliable.',
  });

  const thread = directChat.ensureCharacterDirectThread('world_default', directA.id, directB.id);
  const reversedThread = directChat.ensureCharacterDirectThread('world_default', directB.id, directA.id);
  if (
    thread.id !== reversedThread.id
    || stateModule.state.characterDirectThreads.length !== 1
    || thread.participantCharacterIds.join('|') !== [directA.id, directB.id].sort().join('|')
  ) {
    throw new Error('Character direct threads should be one shared symmetric thread per character pair.');
  }

  const manualMessage = directChat.appendCharacterDirectMessage(
    thread.id,
    directA.id,
    'Direct A leaves Direct B a private note.',
    'manual',
  );
  if (
    directChat.characterDirectMessagesFor(thread.id).length !== 1
    || manualMessage.speakerCharacterId !== directA.id
    || directChat.characterDirectThreadsForActor(directA.id, 'world_default')[0]?.id !== thread.id
    || directChat.characterDirectThreadsForActor(directB.id, 'world_default')[0]?.id !== thread.id
  ) {
    throw new Error('Character direct thread lists or manual messages are not visible from both character identities.');
  }

  let mock = mockModelResponses(['<msg>Direct B answers the private note.</msg>']);
  const generatedReply = await directChat.generateCharacterDirectReply(thread.id, directB.id, {
    countBudget: true,
    replyToId: manualMessage.id,
  });
  if (
    generatedReply.length !== 1
    || generatedReply[0].speakerCharacterId !== directB.id
    || generatedReply[0].source !== 'model'
    || generatedReply[0].replyToId !== manualMessage.id
  ) {
    throw new Error('Generating a direct reply should append a message from the responding character.');
  }
  const replyPrompt = mock.calls.flatMap(call => call.messages.map(message => message.content)).join('\n');
  if (!replyPrompt.includes('Direct A leaves Direct B a private note.')) {
    throw new Error('Direct reply prompt should include recent direct chat history.');
  }
  mock.restore();

  const eventSuggestionMock = mockModelResponses([
    '<msg>Then let us meet at the station tomorrow afternoon.</msg>',
    JSON.stringify({
      shouldSuggest: true,
      title: '角色约定车站碰面',
      type: 'daily',
      description: 'Direct A 和 Direct B 在角色私聊里约定明天下午到车站碰面。',
      affinityDelta: 2,
      participantCharacterIds: [directA.id, directB.id, directC.id],
      reason: '两个角色在私聊里形成了明确的线下碰面事件。',
    }),
  ]);
  await directChat.generateCharacterDirectReply(thread.id, directA.id, {
    countBudget: true,
    replyToId: generatedReply[0].id,
  });
  const directSuggestion = events.pendingPrivateChatEventSuggestionsForThread({
    sourceKind: 'character_direct',
    threadId: thread.id,
    worldId: 'world_default',
  }).find((suggestion: any) => suggestion.title === '角色约定车站碰面');
  if (
    !directSuggestion
    || directSuggestion.status !== 'pending'
    || directSuggestion.sourceKind !== 'character_direct'
    || directSuggestion.sourceMessageRole !== 'assistant'
    || !directSuggestion.participantCharacterIds.includes(directA.id)
    || !directSuggestion.participantCharacterIds.includes(directB.id)
    || directSuggestion.participantCharacterIds.includes(directC.id)
  ) {
    throw new Error('Generated character direct replies should create pending event suggestions for the two direct participants only.');
  }
  const directDetectorPrompt = eventSuggestionMock.calls.at(-1)?.messages.map(message => message.content).join('\n') ?? '';
  if (
    !directDetectorPrompt.includes('角色私聊')
    || !directDetectorPrompt.includes('只输出 JSON')
    || !directDetectorPrompt.includes('接受前不得进入世界记录/世界上下文')
  ) {
    throw new Error('Character direct event detection should use the private-event JSON detector prompt.');
  }
  eventSuggestionMock.restore();

  mock = mockModelResponses([JSON.stringify({
    reason: 'Their plans both pointed at the missing notebook.',
    relationshipSummary: 'Direct A and Direct B privately coordinated around the missing notebook.',
    messages: [
      { speakerCharacterId: directA.id, content: 'I found the notebook near the stairs.' },
      { speakerCharacterId: directB.id, content: 'You actually checked there?' },
      { speakerCharacterId: directA.id, content: 'You mentioned the hallway yesterday.' },
      { speakerCharacterId: directB.id, content: 'I did not think you remembered.' },
      { speakerCharacterId: directA.id, content: 'It sounded important.' },
      { speakerCharacterId: directB.id, content: 'Fine. Thank you.' },
      { speakerCharacterId: directC.id, content: 'I should not enter this private thread.' },
      { speakerCharacterId: directB.id, content: 'Do not make it a big deal.' },
      { speakerCharacterId: directA.id, content: 'I will not.' },
      { speakerCharacterId: directB.id, content: 'This ninth valid message should be capped.' },
    ],
    stageSuggestions: [{
      fromCharacterId: directB.id,
      toCharacterId: directA.id,
      suggestedStage: 'familiar',
      reason: 'Direct B saw Direct A follow through privately.',
    }],
  })]);
  const quietResult = await directChat.runBackgroundCharacterDirectDialogue('world_default', {
    participantIds: [directA.id, directB.id],
    now: Date.now(),
    countBudget: true,
  });
  if (quietResult.ok || mock.calls.length !== 0) {
    throw new Error('Background character direct chat should not run unless hot world mode is enabled.');
  }
  stateModule.state.worldInteractionHighSimulation = true;
  const beforeAutoMessages = directChat.characterDirectMessagesFor(thread.id).length;
  const autoResult = await directChat.runBackgroundCharacterDirectDialogue('world_default', {
    participantIds: [directA.id, directB.id],
    now: Date.now(),
    countBudget: true,
  });
  const newAutoMessages = directChat.characterDirectMessagesFor(thread.id).slice(beforeAutoMessages);
  if (
    !autoResult.ok
    || newAutoMessages.length !== 8
    || newAutoMessages.some((message: any) => message.source !== 'auto_model')
    || newAutoMessages.some((message: any) => message.speakerCharacterId === directC.id)
  ) {
    throw new Error('Background character direct chat should create one capped 5-8 message private slice for two participants only.');
  }
  if (
    stateModule.state.timelineEntries.filter((entry: any) => entry.source.type === 'direct_chat').length !== 1
    || stateModule.state.characterInteractions.filter((record: any) => record.source.type === 'direct_chat').length !== 1
  ) {
    throw new Error('Background direct chat should create one timeline/interaction record for the generated slice.');
  }
  const updatedPair = characterRelationships.findCharacterRelationship('world_default', directA.id, directB.id);
  if (
    !updatedPair
    || !characterRelationships.relationshipSideFor(updatedPair, directA.id).summary.includes('missing notebook')
    || !characterRelationships.relationshipSideFor(updatedPair, directB.id).summary.includes('missing notebook')
    || stateModule.state.characterRelationshipSuggestions.length !== 1
    || stateModule.state.characterRelationshipSuggestions[0].appliedAt
  ) {
    throw new Error('Background direct chat should update relationship summaries and leave stage changes as pending suggestions.');
  }
  mock.restore();

  const backupText = backup.createBackupText();
  const preview = backup.previewBackupRestoreText(backupText);
  if (
    preview.characterDirectThreadCount !== 1
    || preview.characterDirectMessageCount !== directChat.characterDirectMessagesFor(thread.id).length
    || !backup.formatBackupRestoreWarning(preview).includes('角色私聊')
  ) {
    throw new Error('Backup preview should count character direct chat threads and messages.');
  }

  const legacyWorld = {
    id: 'legacy_world',
    name: 'Legacy World',
    description: '',
    worldLore: '',
    userPersona: '',
    currentLocation: '',
    sceneAtmosphere: '',
    sceneSummary: '',
    createdAt: 1,
    updatedAt: 1,
  };
  const legacyA = testCharacter('legacy_a', 'Legacy A', legacyWorld.id);
  const legacyB = testCharacter('legacy_b', 'Legacy B', legacyWorld.id);
  const normalized = stateModule.normalizeState({
    worlds: [legacyWorld],
    activeWorldId: legacyWorld.id,
    characters: [legacyA, legacyB],
    conversations: [{
      id: 'legacy_conversation',
      worldId: legacyWorld.id,
      characterId: legacyB.id,
      ownerCharacterId: legacyA.id,
      createdAt: 10,
      updatedAt: 20,
      lastReadAt: 10,
    }],
    messages: [{
      id: 'legacy_direct_message',
      conversationId: 'legacy_conversation',
      characterId: legacyB.id,
      role: 'user',
      speakerType: 'character',
      speakerCharacterId: legacyA.id,
      content: 'Legacy A privately wrote Legacy B before the new direct box existed.',
      createdAt: 11,
      source: 'user',
    }],
  });
  if (
    normalized.characterDirectThreads.length !== 1
    || normalized.characterDirectMessages.length !== 1
    || normalized.characterDirectMessages[0].speakerCharacterId !== legacyA.id
    || normalized.characterDirectMessages[0].content !== 'Legacy A privately wrote Legacy B before the new direct box existed.'
    || normalized.messages.length !== 1
  ) {
    throw new Error('Legacy ownerCharacterId private chats should be mapped into direct chat while preserving original messages.');
  }

  stateModule.replaceState(stateModule.defaultState());
  stateModule.state.characters = [directA, directB, directC];
  const cleanupThread = directChat.ensureCharacterDirectThread('world_default', directA.id, directB.id);
  directChat.appendCharacterDirectMessage(cleanupThread.id, directA.id, 'This should be cleaned up.', 'manual');
  cards.deleteCharacter(directB.id);
  if (
    stateModule.state.characterDirectThreads.some((item: any) => item.id === cleanupThread.id)
    || stateModule.state.characterDirectMessages.some((item: any) => item.threadId === cleanupThread.id)
  ) {
    throw new Error('Deleting a character should remove related direct chat threads and messages.');
  }
  const otherWorld = stateModule.createWorld('Direct Cleanup World');
  const worldA = testCharacter('world_direct_a', 'World Direct A', otherWorld.id);
  const worldB = testCharacter('world_direct_b', 'World Direct B', otherWorld.id);
  stateModule.state.characters.push(worldA, worldB);
  const worldThread = directChat.ensureCharacterDirectThread(otherWorld.id, worldA.id, worldB.id);
  directChat.appendCharacterDirectMessage(worldThread.id, worldA.id, 'World cleanup message.', 'manual');
  stateModule.deleteWorld(otherWorld.id);
  if (
    stateModule.state.characterDirectThreads.some((item: any) => item.worldId === otherWorld.id)
    || stateModule.state.characterDirectMessages.some((item: any) => item.worldId === otherWorld.id)
  ) {
    throw new Error('Deleting a world should remove its direct chat threads and messages.');
  }

  const appSource = fs.readFileSync(path.join(__dirname, '../src/independent-chat/ui/app.ts'), 'utf8');
  if (
    !appSource.includes('renderCharacterDirectMessages')
    || !appSource.includes('generateCharacterDirectReply')
    || !appSource.includes('characterDirectThreadsForActor')
  ) {
    throw new Error('UI should render character identity direct chat boxes instead of hiding direct character conversations.');
  }
  const schedulerSource = fs.readFileSync(path.join(__dirname, '../src/independent-chat/automation/scheduler.ts'), 'utf8');
  if (
    !schedulerSource.includes('runBackgroundCharacterDirectDialogue')
    || !schedulerSource.includes('worldInteractionHighSimulation')
  ) {
    throw new Error('Scheduler should only run background character direct chat when hot world simulation is enabled.');
  }

  console.log(JSON.stringify({
    symmetricThread: true,
    manualIdentityMessage: true,
    generatedReply: true,
    hotWorldOnly: true,
    cappedBackgroundSlice: true,
    timelineAndInteractionRecord: true,
    relationshipSummaryAndSuggestion: true,
    backupPreviewCounts: true,
    legacyMigration: true,
    deleteCharacterCleanup: true,
    deleteWorldCleanup: true,
    uiDirectChatMarkers: true,
    schedulerHotWorldHook: true,
  }));
}

void main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
