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
const timeline = require('../src/independent-chat/memory/timeline');
const characterStatus = require('../src/independent-chat/memory/character-status');
const dailyBrief = require('../src/independent-chat/memory/daily-brief');
const interactions = require('../src/independent-chat/social/character-interactions');
const model = require('../src/independent-chat/model/client');

const character = {
  id: 'status_character',
  worldId: 'world_default',
  name: 'Status Character',
  tags: [],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v2',
    specVersion: '2.0',
    worldBookEntryCount: 0,
    importedFileName: '',
  },
  relationship: {
    stage: 'close',
    affinity: 42,
    summary: '最近聊得更自然，但还有一点没说开的事。',
    updatedAt: Date.now(),
  },
  autoMessage: {
    ...stateModule.createDefaultAutoMessageSchedule(),
    enabled: true,
    nextAttemptAt: Date.now() + 60 * 60 * 1000,
  },
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
  importedAt: Date.now(),
};

stateModule.state.characters.push(character);
stateModule.state.activeCharacterId = character.id;
const conversation = stateModule.ensureConversation(character);
conversation.lastReadAt = Date.now() - 60_000;
stateModule.state.messages.push({
  id: 'status_unread_message',
  conversationId: conversation.id,
  characterId: character.id,
  role: 'assistant',
  content: '今天你还会来吗？',
  autoReason: '因为你还没有回复。',
  createdAt: Date.now(),
  source: 'auto_message',
});
timeline.addTimelineEntry({
  worldId: character.worldId,
  type: 'manual_note',
  characterIds: [character.id],
  title: '一起躲过雨',
  summary: '两个人在便利店屋檐下等雨停，这件事让关系变得更近。',
  source: { type: 'manual', id: 'status_memory' },
  includeInContext: true,
});
const event = events.createWorldEvent({
  title: '还没回复的邀约',
  description: '她发出邀约后还没有收到回应。',
  participantCharacterIds: [character.id],
  affinityDelta: 0,
});
const interactionCharacter = {
  ...character,
  id: 'status_interaction_character',
  name: 'Interaction Friend',
  relationship: stateModule.createDefaultRelationship(),
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
};
stateModule.state.characters.push(interactionCharacter);
interactions.recordCharacterInteraction({
  worldId: character.worldId,
  type: 'moment_comment',
  actorCharacterId: interactionCharacter.id,
  targetCharacterIds: [character.id],
  title: 'Interaction Friend 评论了 Status Character 的动态',
  summary: '这句评论应该进入今日简报。',
  reason: '因为看到了同世界角色的动态。',
  source: { type: 'comment', id: 'status_interaction_comment' },
  createdAt: Date.now(),
});

const status = characterStatus.refreshCharacterStatusSummary(character);
if (
  status.characterId !== character.id
  || status.relationshipStage !== 'close'
  || status.affinity !== 42
  || !status.recentMemoryTitles.includes('一起躲过雨')
  || !status.unresolvedItems.includes(event.title)
  || !stateModule.state.characterStatuses.some((item: any) => item.id === status.id)
) {
  throw new Error('Character status summary was not derived and saved correctly.');
}
const statusTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.type === 'character_status' && entry.source.type === 'status' && entry.source.id.includes(character.id),
);
const statusImpact = stateModule.state.impactRecords.find((record: any) =>
  record.operationId === statusTimeline?.source.id && record.targetType === 'character_status',
);
if (!statusTimeline || statusTimeline.includeInContext || !statusImpact) {
  throw new Error('Character status refresh did not create a rollback impact record.');
}
const statusPrompt = model.buildModelMessages(character)[0].content;
if (!statusPrompt.includes('当前角色状态摘要') || !statusPrompt.includes(status.nextInclination)) {
  throw new Error('Saved character status summary was not included in model context.');
}

const brief = dailyBrief.todayBriefForActiveWorld();
if (
  !brief
  || brief.worldId !== 'world_default'
  || brief.changeCount < 2
  || !brief.sections.some((section: string) => section.includes('未读私聊'))
  || !brief.sections.some((section: string) => section.includes('生活线索'))
  || !brief.sections.some((section: string) =>
    section.includes('角色互动') && section.includes('Interaction Friend 回应了 Status Character'),
  )
  || !brief.suggestedCharacterIds.includes(character.id)
) {
  throw new Error('Daily brief did not summarize unread messages and active events.');
}
const briefTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.type === 'daily_brief' && entry.source.type === 'brief' && entry.source.id === brief.id,
);
if (!briefTimeline || briefTimeline.includeInContext) {
  throw new Error('Daily brief was not written to the timeline as a non-authoritative summary.');
}
const secondBrief = dailyBrief.todayBriefForActiveWorld();
if (!secondBrief || secondBrief.id !== brief.id) {
  throw new Error('Daily brief was generated more than once for the same world/day.');
}

const quietWorld = stateModule.createWorld('Quiet world');
const quietBrief = dailyBrief.todayBriefForActiveWorld();
if (quietBrief || stateModule.state.dailyBriefs.some((item: any) => item.worldId === quietWorld.id)) {
  throw new Error('Quiet worlds should show an empty state without saving a blank brief.');
}

const delayedCharacter = {
  ...character,
  id: 'delayed_reason_character',
  worldId: quietWorld.id,
  name: 'Delayed Reason Character',
  relationship: {
    ...character.relationship,
    summary: 'No previous relationship summary.',
    updatedAt: Date.now(),
  },
  autoMessage: {
    ...stateModule.createDefaultAutoMessageSchedule(),
    pacingReason: '主动消息跳过：安静时段内延后。',
  },
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
  importedAt: Date.now(),
};
stateModule.state.characters.push(delayedCharacter);
const delayedBrief = dailyBrief.todayBriefForActiveWorld();
if (
  !delayedBrief
  || delayedBrief.changeCount < 1
  || !delayedBrief.sections.some((section: string) => section.includes('自动行为'))
  || !delayedBrief.suggestedCharacterIds.includes(delayedCharacter.id)
) {
  throw new Error('Delayed or skipped automation reasons should create a daily brief.');
}

console.log(JSON.stringify({
  characterStatus: true,
  statusModelContext: true,
  dailyBrief: true,
  dailyBriefTimeline: true,
  dailyBriefOncePerDay: true,
  quietWorld: true,
  delayedReasonBrief: true,
}));
