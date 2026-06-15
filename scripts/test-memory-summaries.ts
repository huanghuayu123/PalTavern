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
const backup = require('../src/independent-chat/data/backup');
const model = require('../src/independent-chat/model/client');
const events = require('../src/independent-chat/social/events');
const privateChat = require('../src/independent-chat/chat/private-chat');
const summaries = require('../src/independent-chat/memory/summaries');
const timeline = require('../src/independent-chat/memory/timeline');
const fs = require('fs');
const path = require('path');

stateModule.replaceState(stateModule.defaultState());
const character = stateModule.state.characters[0];
const world = stateModule.state.worlds[0];

const legacy = stateModule.normalizeState({
  worlds: [{ id: 'legacy_world', name: 'Legacy', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'legacy_world',
});
if (!Array.isArray(legacy.memorySummaries) || legacy.memorySummaries.length !== 0) {
  throw new Error('Legacy state should normalize missing memory summaries to an empty array.');
}

stateModule.state.timelineEntries.push(
  {
    id: 'timeline_micro_a',
    worldId: world.id,
    createdAt: 10,
    type: 'chat',
    characterIds: [character.id],
    characterNames: { [character.id]: character.name },
    title: '夜间私聊',
    summary: '角色问 user 是否还醒着，语气有点试探。',
    source: { type: 'message', id: 'message_a' },
    canUndo: false,
    includeInContext: true,
  },
  {
    id: 'timeline_micro_b',
    worldId: world.id,
    createdAt: 20,
    type: 'relationship',
    characterIds: [character.id],
    characterNames: { [character.id]: character.name },
    title: '关系变化',
    summary: 'user 回应得更温和，角色明显安心了一点。',
    source: { type: 'relationship', id: 'relationship_a' },
    canUndo: false,
    includeInContext: true,
  },
  {
    id: 'timeline_other_world',
    worldId: 'other_world',
    createdAt: 30,
    type: 'manual_note',
    characterIds: [],
    characterNames: {},
    title: 'Other world',
    summary: 'Should never appear.',
    source: { type: 'manual', id: 'other' },
    canUndo: false,
    includeInContext: true,
  },
);

const micro = summaries.refreshMicroSummaryForCharacter(character.id);
if (!micro || micro.layer !== 'micro' || micro.status !== 'active' || micro.includeInContext !== true) {
  throw new Error('Micro summary should auto-create as active and context-enabled.');
}
if (!micro.sourceTimelineEntryIds.includes('timeline_micro_a') || !micro.sourceTimelineEntryIds.includes('timeline_micro_b')) {
  throw new Error('Micro summary should remember its source timeline entries.');
}
if (!micro.factSummary.includes('夜间私聊') || !micro.emotionalLine.includes(character.name)) {
  throw new Error('Micro summary should preserve factual and emotional summary text.');
}

const middle = summaries.refreshMiddleSummaryForCharacter(character.id);
if (!middle || middle.layer !== 'middle' || middle.status !== 'active' || !middle.factSummary.includes('片段')) {
  throw new Error('Middle summary should roll up character micro summaries automatically.');
}

const macro = summaries.refreshMacroSummaryForWorld(world.id);
if (!macro || macro.layer !== 'macro' || macro.status !== 'pending_confirmation' || macro.includeInContext !== false) {
  throw new Error('Macro summary should be created as pending confirmation and excluded from context.');
}
let context = summaries.memorySummaryContextFor(character);
if (!context.includes('片段小结') || !context.includes('角色中结')) {
  throw new Error('Active micro and middle summaries should enter character memory context.');
}
if (context.includes('世界大结')) {
  throw new Error('Pending macro summaries must not enter model context.');
}

summaries.confirmMemorySummary(macro.id);
context = summaries.memorySummaryContextFor(character);
if (!context.includes('世界大结')) {
  throw new Error('Confirmed macro summaries should enter model context.');
}

summaries.updateMemorySummary(micro.id, { includeInContext: false, factSummary: 'Edited micro fact.' });
context = summaries.memorySummaryContextFor(character);
if (context.includes('Edited micro fact.')) {
  throw new Error('Disabled summaries should not enter model context.');
}

summaries.pauseMemorySummary(middle.id);
context = summaries.memorySummaryContextFor(character);
if (context.includes('角色中结')) {
  throw new Error('Paused middle summaries should not enter model context.');
}
summaries.pauseMemorySummary(micro.id);
summaries.refreshMicroSummaryForCharacter(character.id);
const refreshedPausedMicro = stateModule.state.memorySummaries.find((summary: any) => summary.id === micro.id);
if (!refreshedPausedMicro || refreshedPausedMicro.status !== 'paused' || refreshedPausedMicro.includeInContext !== false) {
  throw new Error('Automatic refresh should not re-enable a paused micro summary.');
}
summaries.refreshMiddleSummaryForCharacter(character.id);
const refreshedPausedMiddle = stateModule.state.memorySummaries.find((summary: any) => summary.id === middle.id);
if (!refreshedPausedMiddle || refreshedPausedMiddle.status !== 'paused' || refreshedPausedMiddle.includeInContext !== false) {
  throw new Error('Automatic refresh should not re-enable a paused summary.');
}

const text = backup.createBackupText();
const envelope = JSON.parse(text);
if (envelope.state.memorySummaries.length !== stateModule.state.memorySummaries.length) {
  throw new Error('Memory summaries should be included in backup export.');
}

stateModule.replaceState(stateModule.defaultState());
const restored = backup.restoreBackupText(text);
const restoredMacro = restored.memorySummaries.find((summary: any) => summary.id === macro.id);
if (!restoredMacro || restoredMacro.status !== 'active' || restoredMacro.includeInContext !== true) {
  throw new Error('Confirmed macro summary should survive backup restore.');
}
const restoredMicro = restored.memorySummaries.find((summary: any) => summary.id === micro.id);
if (!restoredMicro || restoredMicro.factSummary !== 'Edited micro fact.' || restoredMicro.includeInContext !== false) {
  throw new Error('Edited or disabled micro summary should survive backup restore.');
}

stateModule.replaceState(stateModule.defaultState());
const bridgeCharacter = stateModule.state.characters[0];
const bridgeWorld = stateModule.state.worlds[0];
stateModule.state.timelineEntries.push(
  {
    id: 'bridge_private_memory',
    worldId: bridgeWorld.id,
    createdAt: 100,
    type: 'chat',
    characterIds: [bridgeCharacter.id],
    characterNames: { [bridgeCharacter.id]: bridgeCharacter.name },
    title: '桥接私聊记忆',
    summary: 'CHAT_MEMORY_SHARED_TO_WORLD',
    source: { type: 'message', id: 'bridge_private_message' },
    canUndo: false,
    includeInContext: true,
  },
  {
    id: 'bridge_world_event_memory',
    worldId: bridgeWorld.id,
    createdAt: 110,
    type: 'event',
    characterIds: [bridgeCharacter.id],
    characterNames: { [bridgeCharacter.id]: bridgeCharacter.name },
    title: '桥接事件记忆',
    summary: 'EVENT_MEMORY_SHARED_TO_WORLD',
    source: { type: 'event', id: 'bridge_event_memory' },
    canUndo: false,
    includeInContext: true,
  },
);
const bridgeMicro = summaries.refreshMicroSummaryForCharacter(bridgeCharacter.id);
const bridgeMiddle = summaries.refreshMiddleSummaryForCharacter(bridgeCharacter.id);
const bridgePendingMacro = summaries.refreshMacroSummaryForWorld(bridgeWorld.id);
if (!bridgeMicro || !bridgeMiddle || !bridgePendingMacro) {
  throw new Error('Bridge setup should create micro, middle, and macro summaries.');
}
stateModule.state.memorySummaries.push(
  {
    id: 'bridge_disabled_summary',
    worldId: bridgeWorld.id,
    layer: 'micro',
    scope: 'character',
    targetId: bridgeCharacter.id,
    characterIds: [bridgeCharacter.id],
    sourceTimelineEntryIds: [],
    sourceSummaryIds: [],
    title: '禁用总结',
    factSummary: 'DISABLED_SUMMARY_SHOULD_NOT_APPEAR',
    emotionalLine: '',
    unresolvedItems: [],
    nextHook: '',
    includeInContext: false,
    status: 'active',
    createdAt: 120,
    updatedAt: 120,
  },
  {
    id: 'bridge_paused_summary',
    worldId: bridgeWorld.id,
    layer: 'middle',
    scope: 'character',
    targetId: bridgeCharacter.id,
    characterIds: [bridgeCharacter.id],
    sourceTimelineEntryIds: [],
    sourceSummaryIds: [],
    title: '暂停总结',
    factSummary: 'PAUSED_SUMMARY_SHOULD_NOT_APPEAR',
    emotionalLine: '',
    unresolvedItems: [],
    nextHook: '',
    includeInContext: true,
    status: 'paused',
    createdAt: 121,
    updatedAt: 121,
  },
  {
    id: 'bridge_pending_summary',
    worldId: bridgeWorld.id,
    layer: 'macro',
    scope: 'world',
    targetId: bridgeWorld.id,
    characterIds: [bridgeCharacter.id],
    sourceTimelineEntryIds: [],
    sourceSummaryIds: [],
    title: '待确认世界大结',
    factSummary: 'PENDING_SUMMARY_SHOULD_NOT_APPEAR',
    emotionalLine: '',
    unresolvedItems: [],
    nextHook: '',
    includeInContext: false,
    status: 'pending_confirmation',
    createdAt: 122,
    updatedAt: 122,
  },
  {
    id: 'bridge_other_world_summary',
    worldId: 'other_world',
    layer: 'macro',
    scope: 'world',
    targetId: 'other_world',
    characterIds: [bridgeCharacter.id],
    sourceTimelineEntryIds: [],
    sourceSummaryIds: [],
    title: '其他世界大结',
    factSummary: 'OTHER_WORLD_SUMMARY_SHOULD_NOT_APPEAR',
    emotionalLine: '',
    unresolvedItems: [],
    nextHook: '',
    includeInContext: true,
    status: 'active',
    createdAt: 123,
    updatedAt: 123,
  },
);
const bridgeEvent = events.createWorldEvent({
  title: '共享记忆桥接测试事件',
  description: '用于确认世界 RP 读取共同长期记忆。',
  type: 'daily',
  participantCharacterIds: [bridgeCharacter.id],
});
let worldMemoryContext = events.worldMemoryContextForEvent(bridgeEvent, bridgeCharacter);
for (const required of ['片段小结', '角色中结', 'CHAT_MEMORY_SHARED_TO_WORLD']) {
  if (!worldMemoryContext.includes(required)) {
    throw new Error(`World RP memory context should include shared active summary content: ${required}`);
  }
}
for (const forbidden of [
  '世界大结',
  'DISABLED_SUMMARY_SHOULD_NOT_APPEAR',
  'PAUSED_SUMMARY_SHOULD_NOT_APPEAR',
  'PENDING_SUMMARY_SHOULD_NOT_APPEAR',
  'OTHER_WORLD_SUMMARY_SHOULD_NOT_APPEAR',
]) {
  if (worldMemoryContext.includes(forbidden)) {
    throw new Error(`World RP memory context should not include disabled, pending, or other-world memory: ${forbidden}`);
  }
}
summaries.confirmMemorySummary(bridgePendingMacro.id);
worldMemoryContext = events.worldMemoryContextForEvent(bridgeEvent, bridgeCharacter);
if (!worldMemoryContext.includes('世界大结')) {
  throw new Error('Confirmed macro summaries should enter world RP memory context.');
}

const rpMessage = events.appendWorldEventRpMessage(bridgeEvent.id, {
  role: 'user',
  characterId: bridgeCharacter.id,
  speaker: bridgeCharacter.name,
  content: 'WORLD_RP_ORIGINAL_CONTEXT',
  source: 'manual',
});
const rpSourceId = `${bridgeEvent.id}:rp:${rpMessage.id}`;
let rpTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source?.type === 'event' && entry.source?.id === rpSourceId,
);
if (!rpTimelineEntry || !rpTimelineEntry.includeInContext || !rpTimelineEntry.summary.includes('WORLD_RP_ORIGINAL_CONTEXT')) {
  throw new Error('World RP messages should be mirrored into context-enabled timeline memory.');
}
let privatePrompt = model.buildModelMessages(bridgeCharacter).map((message: any) => message.content).join('\n');
if (!privatePrompt.includes('WORLD_RP_ORIGINAL_CONTEXT')) {
  throw new Error('Private chat prompts should see world RP memory through the shared timeline/summary layer.');
}
events.editWorldEventRpMessage(rpMessage.id, 'WORLD_RP_EDITED_CONTEXT');
rpTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source?.type === 'event' && entry.source?.id === rpSourceId,
);
if (
  !rpTimelineEntry
  || !rpTimelineEntry.summary.includes('WORLD_RP_EDITED_CONTEXT')
  || rpTimelineEntry.summary.includes('WORLD_RP_ORIGINAL_CONTEXT')
) {
  throw new Error('Editing a world RP message should update the mirrored timeline memory.');
}
privatePrompt = model.buildModelMessages(bridgeCharacter).map((message: any) => message.content).join('\n');
if (!privatePrompt.includes('WORLD_RP_EDITED_CONTEXT') || privatePrompt.includes('WORLD_RP_ORIGINAL_CONTEXT')) {
  throw new Error('Private chat prompts should use edited world RP memory instead of stale text.');
}
events.deleteWorldEvent(bridgeEvent.id);
rpTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source?.type === 'event' && entry.source?.id === rpSourceId,
);
if (!rpTimelineEntry?.revokedAt || rpTimelineEntry.includeInContext) {
  throw new Error('Deleting a world event should revoke its mirrored RP timeline memory.');
}
privatePrompt = model.buildModelMessages(bridgeCharacter).map((message: any) => message.content).join('\n');
if (privatePrompt.includes('WORLD_RP_EDITED_CONTEXT')) {
  throw new Error('Revoked world RP memory should not remain in private chat prompts.');
}

stateModule.replaceState(stateModule.defaultState());
const autoBridgeCharacter = stateModule.state.characters[0];
const autoBridgeConversation = stateModule.ensureConversation(autoBridgeCharacter);
const autoBridgeUserCreatedAt = Date.now() - 1000;
stateModule.state.messages.push({
  id: 'auto_private_confession_user',
  conversationId: autoBridgeConversation.id,
  characterId: autoBridgeCharacter.id,
  role: 'user',
  speakerType: 'user',
  content: 'AUTO_PRIVATE_CONFESSION_OFFLINE_PLAN: 我在私聊里表白，并约好线下见面。',
  variants: [{
    id: 'auto_private_confession_user_variant',
    content: 'AUTO_PRIVATE_CONFESSION_OFFLINE_PLAN: 我在私聊里表白，并约好线下见面。',
    createdAt: autoBridgeUserCreatedAt,
  }],
  activeVariantIndex: 0,
  createdAt: autoBridgeUserCreatedAt,
  source: 'user',
});
privateChat.appendAssistantReply(
  autoBridgeCharacter,
  autoBridgeConversation,
  'AUTO_PRIVATE_ACCEPTED_OFFLINE_PLAN: 我记得这次表白，也答应线下见面。',
  'model_reply',
);
const autoPrivateTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.type === 'chat'
  && entry.source?.type === 'message'
  && String(entry.source.id).startsWith(`${autoBridgeConversation.id}:private:`),
);
if (
  !autoPrivateTimelineEntry
  || !autoPrivateTimelineEntry.includeInContext
  || !autoPrivateTimelineEntry.summary.includes('AUTO_PRIVATE_CONFESSION_OFFLINE_PLAN')
  || !autoPrivateTimelineEntry.summary.includes('AUTO_PRIVATE_ACCEPTED_OFFLINE_PLAN')
) {
  throw new Error('Private chat should automatically summarize important conversation turns into shared timeline memory.');
}
const autoBridgeEvent = events.createWorldEvent({
  title: 'AUTO_PRIVATE_WORLD_MEMORY_CHECK',
  description: '检查私聊自动总结能否进入世界 RP 共同长期记忆。',
  type: 'daily',
  participantCharacterIds: [autoBridgeCharacter.id],
});
const autoBridgeWorldMemory = events.worldMemoryContextForEvent(autoBridgeEvent, autoBridgeCharacter);
if (
  !autoBridgeWorldMemory.includes('AUTO_PRIVATE_CONFESSION_OFFLINE_PLAN')
  || !autoBridgeWorldMemory.includes('AUTO_PRIVATE_ACCEPTED_OFFLINE_PLAN')
) {
  throw new Error('World RP memory context should see auto-summarized private chat memories through the shared summary layer.');
}
for (let index = 0; index < 10; index += 1) {
  timeline.addTimelineEntry({
    worldId: autoBridgeCharacter.worldId,
    type: 'event',
    characterIds: [],
    title: `RECENT_WORLD_NOISE_${index}`,
    summary: `RECENT_WORLD_NOISE_${index}`,
    source: { type: 'event', id: `recent_world_noise_${index}` },
    includeInContext: true,
    createdAt: Date.now() + index,
  });
}
const autoBridgeWorldMemoryAfterNoise = events.worldMemoryContextForEvent(autoBridgeEvent, autoBridgeCharacter);
if (
  !autoBridgeWorldMemoryAfterNoise.includes('AUTO_PRIVATE_CONFESSION_OFFLINE_PLAN')
  || !autoBridgeWorldMemoryAfterNoise.includes('AUTO_PRIVATE_ACCEPTED_OFFLINE_PLAN')
) {
  throw new Error('World RP memory context should prioritize participant private-chat auto memory even when recent world timeline entries are noisy.');
}
if (!privateChat.deleteMessage('auto_private_confession_user')) {
  throw new Error('Private chat auto-memory delete setup should remove the user message and its reply.');
}
const deletedAutoPrivateTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.type === 'chat'
  && entry.source?.type === 'message'
  && String(entry.source.id).startsWith(`${autoBridgeConversation.id}:private:`),
);
const autoBridgeWorldMemoryAfterDelete = events.worldMemoryContextForEvent(autoBridgeEvent, autoBridgeCharacter);
if (
  deletedAutoPrivateTimelineEntry
  || autoBridgeWorldMemoryAfterDelete.includes('AUTO_PRIVATE_CONFESSION_OFFLINE_PLAN')
  || autoBridgeWorldMemoryAfterDelete.includes('AUTO_PRIVATE_ACCEPTED_OFFLINE_PLAN')
) {
  throw new Error('Deleting a private chat turn should remove its auto summary from world memory context.');
}

const appSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/app.ts'), 'utf8');
if (
  !appSource.includes('renderMemorySummaryDrawer')
  || !appSource.includes('记忆抽屉')
  || !appSource.includes('data-edit-memory-summary')
  || !appSource.includes('data-pause-memory-summary')
  || !appSource.includes('data-confirm-memory-summary')
  || !appSource.includes('data-context-preview-remove-summary')
) {
  throw new Error('World UI and context preview should expose memory summary controls.');
}

console.log(JSON.stringify({
  legacyNormalize: true,
  micro: true,
  middle: true,
  macroPending: true,
  contextSafety: true,
  editPause: true,
  backup: true,
  worldRpMemoryBridge: true,
  privateChatAutoMemoryBridge: true,
  uiControls: true,
}));
