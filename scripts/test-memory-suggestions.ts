export {};
declare const require: (id: string) => any;
const fs = require('fs');
const path = require('path');

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
const timeline = require('../src/independent-chat/memory/timeline');
const suggestions = require('../src/independent-chat/memory/suggestions');
const model = require('../src/independent-chat/model/client');

function createCharacter(id: string, worldId = 'world_default') {
  return {
    id,
    worldId,
    name: id === 'memory_character' ? 'Memory Character' : 'Other Character',
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
}

async function main() {
  const legacy = stateModule.normalizeState({
    worlds: [{ id: 'legacy_world', name: 'Legacy', description: '', createdAt: 1, updatedAt: 1 }],
    activeWorldId: 'legacy_world',
  });
  if (!Array.isArray(legacy.memorySuggestions) || legacy.memorySuggestions.length !== 0) {
    throw new Error('Legacy state should normalize memorySuggestions to an empty array.');
  }

  const character = createCharacter('memory_character');
  const otherCharacter = createCharacter('other_character', 'other_world');
  stateModule.state.characters.push(character, otherCharacter);
  stateModule.state.activeCharacterId = character.id;
  stateModule.state.modelConfig.apiUrl = 'https://example.test';
  stateModule.state.modelConfig.model = 'memory-model';
  stateModule.state.modelConfig.dailyRequestLimit = 10;

  stateModule.state.timelineEntries.push({
    id: 'existing_memory',
    worldId: 'world_default',
    createdAt: Date.now() - 1000,
    type: 'manual_note',
    characterIds: [character.id],
    characterNames: { [character.id]: character.name },
    title: '旧记忆',
    summary: '这是生成建议时可以参考的旧记忆。',
    source: { type: 'manual', id: 'existing_memory' },
    canUndo: false,
    includeInContext: true,
  });

  let requestCount = 0;
  (globalThis as any).fetch = async () => {
    requestCount += 1;
    return new Response(JSON.stringify({
      choices: [{
        message: {
          content: JSON.stringify({
            suggestions: [
              {
                title: '雨夜约定',
                summary: 'Memory Character 记得和用户约好下次雨停后再聊。',
                reason: '这会影响之后的日常续写。',
                characterIds: [character.id, otherCharacter.id, 'missing_character'],
                includeInContext: true,
              },
            ],
          }),
        },
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };

  const created = await suggestions.generateMemorySuggestions({
    trigger: 'manual_note',
    source: { type: 'manual', id: 'memory_source' },
    title: '手动记录：雨夜约定',
    summary: '他们说好下次雨停后继续聊。',
    characterIds: [character.id],
  });

  if (
    created.length !== 1
    || created[0].worldId !== 'world_default'
    || created[0].status !== 'pending'
    || created[0].characterIds.length !== 1
    || created[0].characterIds[0] !== character.id
    || !created[0].includeInContext
    || requestCount !== 1
  ) {
    throw new Error('AI memory suggestion was not created, filtered, and scoped correctly.');
  }

  const duplicate = await suggestions.generateMemorySuggestions({
    trigger: 'manual_note',
    source: { type: 'manual', id: 'memory_source' },
    title: '手动记录：雨夜约定',
    summary: '重复触发不应该制造第二条 pending。',
    characterIds: [character.id],
  });
  if (duplicate.length !== 0 || stateModule.state.memorySuggestions.filter((item: any) => item.status === 'pending').length !== 1) {
    throw new Error('Duplicate memory suggestions should not create a second pending item.');
  }

  const pendingPrompt = model.buildModelMessages(character)[0].content;
  if (pendingPrompt.includes('雨夜约定')) {
    throw new Error('Pending memory suggestions must not enter model context.');
  }

  const accepted = suggestions.acceptMemorySuggestion(created[0].id, {
    title: '雨夜约定已确认',
    summary: 'Memory Character 记得下次雨停后再聊。',
  });
  const acceptedEntry = stateModule.state.timelineEntries.find((entry: any) => entry.id === accepted.acceptedTimelineEntryId);
  const status = stateModule.state.characterStatuses.find((item: any) => item.characterId === character.id);
  if (
    accepted.status !== 'accepted'
    || !acceptedEntry
    || acceptedEntry.type !== 'manual_note'
    || !acceptedEntry.includeInContext
    || !status
    || !status.recentMemoryTitles.includes('雨夜约定已确认')
  ) {
    throw new Error('Accepting a memory suggestion should create timeline memory and refresh character status.');
  }

  const acceptedPrompt = model.buildModelMessages(character)[0].content;
  if (!acceptedPrompt.includes('雨夜约定已确认')) {
    throw new Error('Accepted memory suggestions should enter model context.');
  }

  stateModule.state.memorySuggestions.push({
    id: 'dismiss_me',
    worldId: 'world_default',
    trigger: 'manual_tidy',
    source: { type: 'manual', id: 'dismiss_source' },
    title: '不要保存',
    summary: '这条建议应该被忽略。',
    reason: '测试忽略。',
    characterIds: [character.id],
    includeInContext: true,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  const beforeDismissTimelineCount = stateModule.state.timelineEntries.length;
  const dismissed = suggestions.dismissMemorySuggestion('dismiss_me');
  if (
    dismissed.status !== 'dismissed'
    || stateModule.state.timelineEntries.length !== beforeDismissTimelineCount
    || model.buildModelMessages(character)[0].content.includes('不要保存')
  ) {
    throw new Error('Dismissing a memory suggestion should not create timeline memory or model context.');
  }

  const secondWorld = stateModule.createWorld('Suggestion cleanup world');
  stateModule.state.memorySuggestions.push({
    id: 'cleanup_suggestion',
    worldId: secondWorld.id,
    trigger: 'manual_tidy',
    source: { type: 'manual', id: 'cleanup_source' },
    title: '待清理',
    summary: '删除世界时应清理。',
    reason: '',
    characterIds: [],
    includeInContext: true,
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });
  stateModule.deleteWorld(secondWorld.id);
  if (stateModule.state.memorySuggestions.some((item: any) => item.worldId === secondWorld.id)) {
    throw new Error('Deleting a world should remove its memory suggestions.');
  }

  const appSource = fs.readFileSync(path.join(__dirname, '../src/independent-chat/ui/app.ts'), 'utf8');
  const styleSource = fs.readFileSync(path.join(__dirname, '../src/independent-chat/styles.css'), 'utf8');
  if (
    !appSource.includes('pendingMemorySuggestionsForActiveWorld')
    || !appSource.includes('renderWorldContinuePanel')
    || !appSource.includes('renderMemorySuggestionQueue')
    || !appSource.includes('acceptMemorySuggestion')
    || !appSource.includes('dismissMemorySuggestion')
    || !appSource.includes('data-accept-memory-suggestion')
    || !appSource.includes('data-dismiss-memory-suggestion')
    || !appSource.includes("trigger: 'event_resolved'")
    || !appSource.includes("trigger: 'manual_note'")
    || !appSource.includes("trigger: 'chat_message'")
    || appSource.includes('memorySuggestions.push(')
  ) {
    throw new Error('World UI should expose the memory suggestion queue through the memory module, not direct state mutation.');
  }
  if (
    !styleSource.includes('.world-continue-panel')
    || !styleSource.includes('.memory-suggestion-item')
    || !styleSource.includes('.memory-vault-section')
  ) {
    throw new Error('Memory suggestion UI styles were not added.');
  }

  console.log(JSON.stringify({
    legacyNormalize: true,
    generatedSuggestion: true,
    duplicateGuard: true,
    pendingContextIsolation: true,
    acceptCreatesTimeline: true,
    acceptRefreshesStatus: true,
    dismissNoContext: true,
    deleteWorldCleanup: true,
    worldUiHooks: true,
  }));
}

void main();
