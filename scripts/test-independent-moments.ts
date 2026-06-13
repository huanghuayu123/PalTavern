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

// Load application modules only after the browser storage substitute exists.
const moments = require('../src/independent-chat/social/moments');
const interactions = require('../src/independent-chat/social/character-interactions');
const momentVisibility = require('../src/independent-chat/social/moment-visibility');
const stateModule = require('../src/independent-chat/core/state');
const timeline = require('../src/independent-chat/memory/timeline');

async function main() {
const promptCharacter = {
  id: 'character_prompt_test',
  worldId: 'world_default',
  name: '测试角色',
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
const friendCharacter = {
  ...promptCharacter,
  id: 'character_friend_test',
  name: '好友角色',
  relationship: {
    ...stateModule.createDefaultRelationship(),
    stage: 'familiar',
    affinity: 12,
    updatedAt: Date.now(),
  },
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
};
const blockedCharacter = {
  ...promptCharacter,
  id: 'character_blocked_test',
  name: '屏蔽角色',
  relationship: stateModule.createDefaultRelationship(),
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
};
stateModule.state.characters.push(promptCharacter, friendCharacter, blockedCharacter);
const prompt = moments.buildCharacterMomentInstruction(promptCharacter, new Date(2026, 5, 6, 13, 30));
if (
  !prompt.includes('2026年6月6日')
  || !prompt.includes('13:30')
  || !prompt.includes('你就是角色“测试角色”')
  || !prompt.includes('拿着自己的手机')
  || !prompt.includes('第一人称口吻')
  || !prompt.includes('不是系统记录')
) {
  throw new Error('Character phone-post prompt is incomplete.');
}

const first = moments.publishMoment('default world moment');
if (first.visibility.mode !== 'public') {
  throw new Error('New moments should default to public visibility.');
}
const firstTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'moment' && entry.source.id === first.id,
);
if (
  !firstTimelineEntry
  || firstTimelineEntry.worldId !== 'world_default'
  || !firstTimelineEntry.includeInContext
  || !timeline.timelineForActiveWorld().some((entry: any) => entry.id === firstTimelineEntry.id)
) {
  throw new Error('Published moment was not written into the active world timeline.');
}
const characterPost = moments.publishMoment('character-authored moment', promptCharacter, 'character');
if (characterPost.characterId !== promptCharacter.id || characterPost.source !== 'character') {
  throw new Error('Character-authored moment did not keep the selected author.');
}
const characterPostTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'moment' && entry.source.id === characterPost.id,
);
if (!characterPostTimelineEntry || characterPostTimelineEntry.characterIds[0] !== promptCharacter.id) {
  throw new Error('Character-authored moment did not keep its timeline character link.');
}
const crossCharacterComment = moments.addMomentComment(characterPost.id, '另一位角色路过评论。', friendCharacter, 'model');
const crossInteraction = stateModule.state.characterInteractions.find((record: any) =>
  record.source.type === 'comment' && record.source.id === crossCharacterComment.id,
);
const crossInteractionTimeline = crossInteraction
  ? stateModule.state.timelineEntries.find((entry: any) => entry.source.type === 'interaction' && entry.source.id === crossInteraction.id)
  : undefined;
if (
  !crossInteraction
  || crossInteraction.actorCharacterId !== friendCharacter.id
  || crossInteraction.targetCharacterIds[0] !== promptCharacter.id
  || !crossInteraction.reason.includes('可见动态')
  || !crossInteractionTimeline
  || crossInteractionTimeline.type !== 'character_interaction'
  || !crossInteractionTimeline.includeInContext
) {
  throw new Error('Character-to-character moment comments were not recorded as interactions.');
}
const selfReplyComment = moments.addMomentComment(characterPost.id, '作者回复了动态下面的评论。', promptCharacter, 'model');
const selfReplyTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'comment' && entry.source.id === selfReplyComment.id,
);
if (!selfReplyTimeline || selfReplyTimeline.title !== '测试角色 回复了动态评论') {
  throw new Error('Self replies on a character moment should not be titled as commenting on their own moment.');
}
const removableComment = moments.addMomentComment(characterPost.id, '手写角色评论，稍后删除。', friendCharacter, 'manual');
const removableTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'comment' && entry.source.id === removableComment.id,
);
const removableInteraction = stateModule.state.characterInteractions.find((record: any) =>
  record.source.type === 'comment' && record.source.id === removableComment.id,
);
if (
  removableComment.authorType !== 'character'
  || removableComment.source !== 'manual'
  || !removableTimeline
  || !removableInteraction
) {
  throw new Error('Manual character comments were not stored as character-authored comments.');
}
if (!moments.deleteMomentComment(characterPost.id, removableComment.id)) {
  throw new Error('Manual character comment could not be deleted.');
}
if (
  characterPost.comments.some((comment: any) => comment.id === removableComment.id)
  || !removableTimeline.revokedAt
  || removableTimeline.includeInContext
  || stateModule.state.characterInteractions.some((record: any) => record.source.type === 'comment' && record.source.id === removableComment.id)
) {
  throw new Error('Deleting a moment comment did not remove the comment and revoke its side effects.');
}
interactions.recordCharacterInteraction({
  worldId: 'world_default',
  type: 'moment_comment',
  actorCharacterId: friendCharacter.id,
  targetCharacterIds: [promptCharacter.id],
  title: 'Frequency fixture 1',
  summary: 'Fixture interaction.',
  reason: 'Fixture reason.',
  source: { type: 'system', id: 'frequency_fixture_1' },
  createdAt: Date.now(),
});
interactions.recordCharacterInteraction({
  worldId: 'world_default',
  type: 'moment_comment',
  actorCharacterId: friendCharacter.id,
  targetCharacterIds: [promptCharacter.id],
  title: 'Frequency fixture 2',
  summary: 'Fixture interaction.',
  reason: 'Fixture reason.',
  source: { type: 'system', id: 'frequency_fixture_2' },
  createdAt: Date.now(),
});
if (interactions.characterInteractionBudget('world_default', friendCharacter.id).ok) {
  throw new Error('Character interaction daily frequency guard did not activate.');
}
if (!moments.deleteMoment(characterPost.id)) {
  throw new Error('Character-authored moment could not be deleted.');
}
if (
  !characterPostTimelineEntry.revokedAt
  || characterPostTimelineEntry.includeInContext
  || !crossInteractionTimeline.revokedAt
  || crossInteractionTimeline.includeInContext
) {
  throw new Error('Deleting a moment did not revoke its timeline influence.');
}
const undoableMoment = moments.publishMoment('undoable character moment', promptCharacter, 'character');
const undoableComment = moments.addMomentComment(
  undoableMoment.id,
  'friend comment that should come back with undo',
  friendCharacter,
  'model',
);
const undoableMomentTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'moment' && entry.source.id === undoableMoment.id,
);
const undoableCommentTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'comment' && entry.source.id === undoableComment.id,
);
const undoSnapshot = moments.deleteMomentForUndo(undoableMoment.id);
if (!undoSnapshot || stateModule.state.moments.some((item: any) => item.id === undoableMoment.id)) {
  throw new Error('Undoable moment deletion did not remove the moment and return a snapshot.');
}
if (!undoableMomentTimeline?.revokedAt || !undoableCommentTimeline?.revokedAt) {
  throw new Error('Undoable moment deletion did not revoke timeline side effects.');
}
if (!moments.restoreDeletedMoment(undoSnapshot)) {
  throw new Error('Undoable moment snapshot could not be restored.');
}
const restoredUndoableMoment = stateModule.state.moments.find((item: any) => item.id === undoableMoment.id);
if (
  !restoredUndoableMoment
  || restoredUndoableMoment.comments[0]?.id !== undoableComment.id
  || undoableMomentTimeline.revokedAt
  || undoableCommentTimeline.revokedAt
) {
  throw new Error('Restoring a deleted moment did not restore the moment and timeline state.');
}
if (!moments.deleteMoment(undoableMoment.id)) {
  throw new Error('Restored undoable moment fixture could not be cleaned up.');
}
const privateMoment = moments.publishMoment('private user note', undefined, 'manual', {
  mode: 'private',
  characterIds: [],
  blockedCharacterIds: [],
});
const friendsMoment = moments.publishMoment('friends-only note', undefined, 'manual', {
  mode: 'friends',
  characterIds: [],
  blockedCharacterIds: [],
});
const specificMoment = moments.publishMoment('specific visible secret', undefined, 'manual', {
  mode: 'specific',
  characterIds: [promptCharacter.id],
  blockedCharacterIds: [],
});
const blockedMoment = moments.publishMoment('blocked secret should stay hidden', undefined, 'manual', {
  mode: 'blocked',
  characterIds: [],
  blockedCharacterIds: [promptCharacter.id],
});
const publicScopedMoment = moments.publishMoment('public scoped note', undefined, 'manual', {
  mode: 'public',
  characterIds: [promptCharacter.id, friendCharacter.id],
  blockedCharacterIds: [promptCharacter.id],
});
if (
  momentVisibility.canCharacterViewMoment(privateMoment, promptCharacter)
  || momentVisibility.canCharacterViewMoment(friendsMoment, promptCharacter)
  || !momentVisibility.canCharacterViewMoment(friendsMoment, friendCharacter)
  || !momentVisibility.canCharacterViewMoment(specificMoment, promptCharacter)
  || momentVisibility.canCharacterViewMoment(specificMoment, blockedCharacter)
  || momentVisibility.canCharacterViewMoment(blockedMoment, promptCharacter)
  || !momentVisibility.canCharacterViewMoment(blockedMoment, friendCharacter)
  || momentVisibility.canCharacterViewMoment(publicScopedMoment, promptCharacter)
  || !momentVisibility.canCharacterViewMoment(publicScopedMoment, friendCharacter)
  || momentVisibility.canCharacterViewMoment(publicScopedMoment, blockedCharacter)
) {
  throw new Error('Moment visibility rules were not enforced correctly.');
}
const specificComment = moments.addMomentComment(specificMoment.id, 'visible character comment', promptCharacter, 'model');
if (!specificComment || specificMoment.comments.length !== 1) {
  throw new Error('Visible characters should be able to comment on specific moments.');
}
let invisibleCommentBlocked = false;
try {
  moments.addMomentComment(specificMoment.id, 'invisible character comment', blockedCharacter, 'model');
} catch {
  invisibleCommentBlocked = true;
}
if (!invisibleCommentBlocked) {
  throw new Error('Invisible characters should not be able to comment on hidden moments.');
}
const hiddenContext = timeline.timelineContextFor(promptCharacter, 20);
if (hiddenContext.includes('private user note') || hiddenContext.includes('blocked secret should stay hidden')) {
  throw new Error('Invisible moments leaked into character timeline context.');
}
const friendContext = timeline.timelineContextFor(friendCharacter, 20);
if (!friendContext.includes('friends-only note') || !friendContext.includes('blocked secret should stay hidden')) {
  throw new Error('Visible scoped moments were missing from an allowed character timeline context.');
}
moments.deleteMoment(privateMoment.id);
moments.deleteMoment(friendsMoment.id);
moments.deleteMoment(specificMoment.id);
moments.deleteMoment(blockedMoment.id);
moments.deleteMoment(publicScopedMoment.id);
const interestPrompt = moments.buildMomentInterestInstruction(first, promptCharacter);
const emptyThread = moments.buildMomentCommentThread(first);
const interestCommentBlock = interestPrompt.split('【评论区记录】')[1]?.split('【当前触发点】')[0] ?? '';
if (
  !interestPrompt.includes('【动态正文】')
  || !interestPrompt.includes('【评论区记录】')
  || !interestPrompt.includes('【当前触发点】')
  || !emptyThread.includes('暂无评论')
  || interestCommentBlock.includes(first.content)
  || !interestPrompt.includes('判断你是否真的会对这条内容产生评论欲望')
  || !interestPrompt.includes('[跳过]')
  || !interestPrompt.includes('不要为了礼貌强行评论')
  || !interestPrompt.includes('不能把评论写成私聊长消息')
  || !moments.isSkippedMomentComment('[跳过]')
  || !moments.isSkippedMomentComment('SKIP')
  || moments.isSkippedMomentComment('这件事我也很感兴趣。')
) {
  throw new Error('Moment interest prompt or filtering is incomplete.');
}
const comment = moments.addMomentComment(first.id, 'user comment');
if (comment.authorType !== 'user' || first.comments.length !== 1) {
  throw new Error('Moment comment was not stored.');
}
const commentTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'comment' && entry.source.id === comment.id,
);
if (!commentTimelineEntry || !commentTimelineEntry.includeInContext) {
  throw new Error('Moment comment was not written into the world timeline.');
}
const commentThread = moments.buildMomentCommentThread(first);
const directPrompt = moments.buildMomentCommentPrompt(first, promptCharacter, 'direct');
const directCommentBlock = directPrompt.split('【评论区记录】')[1]?.split('【当前触发点】')[0] ?? '';
if (
  !commentThread.includes('user comment')
  || commentThread.includes(first.content)
  || !directPrompt.includes('用户指定你来这条动态下留一条评论')
  || !directPrompt.includes('不允许输出 [跳过]')
  || !directCommentBlock.includes('user comment')
  || directCommentBlock.includes(first.content)
  || directPrompt.includes('Tavern Social 运行格式保护')
) {
  throw new Error('Moment direct comment prompt mixed post body with the comment thread.');
}
const authorMoment = moments.publishMoment('author-owned moment body', promptCharacter, 'character');
const authorReplyUserComment = moments.addMomentComment(authorMoment.id, 'reply to this latest user comment');
const authorReplyPrompt = moments.buildMomentCommentPrompt(authorMoment, promptCharacter, 'author_reply');
const authorReplyCommentBlock = authorReplyPrompt.split('【评论区记录】')[1]?.split('【当前触发点】')[0] ?? '';
if (
  !authorReplyPrompt.includes('你只能回复这条最新评论')
  || !authorReplyPrompt.includes('只能以楼主身份回复评论区')
  || !authorReplyPrompt.includes('不要承诺应用没有提供的动作或附件')
  || !authorReplyPrompt.includes('不要凭空确认照片')
  || !authorReplyCommentBlock.includes('reply to this latest user comment')
  || authorReplyCommentBlock.includes(authorMoment.content)
) {
  throw new Error('Moment author reply prompt did not isolate the latest user comment.');
}
const olderUserComment = moments.addMomentComment(authorMoment.id, 'older user comment should be targetable');
const friendTargetComment = moments.addMomentComment(authorMoment.id, 'friend comment should be targetable too', friendCharacter, 'model');
const manualReplyToCharacterComment = moments.addMomentComment(
  authorMoment.id,
  'user can reply to a character comment',
  undefined,
  'manual',
  friendTargetComment.id,
);
const replyThread = moments.buildMomentCommentThread(authorMoment);
if (
  manualReplyToCharacterComment.replyToCommentId !== friendTargetComment.id
  || !replyThread.includes('我 回复 好友角色：user can reply to a character comment')
) {
  throw new Error('Moment comments cannot target and display replies to character comments.');
}
const targetedAuthorReplyPrompt = moments.buildMomentCommentPrompt(authorMoment, promptCharacter, 'author_reply', {
  targetCommentId: olderUserComment.id,
});
const targetedAuthorReplyTrigger = targetedAuthorReplyPrompt.split('【当前触发点】')[1]?.split('【判断方式】')[0] ?? '';
if (
  !targetedAuthorReplyPrompt.includes('你只能回复这条指定评论')
  || !targetedAuthorReplyPrompt.includes('older user comment should be targetable')
  || targetedAuthorReplyTrigger.includes('friend comment should be targetable too')
) {
  throw new Error('Moment author reply prompt did not target the selected comment.');
}
const authorInterestReplyPrompt = moments.buildMomentCommentPrompt(authorMoment, promptCharacter, 'author_interest_reply', {
  targetCommentId: friendTargetComment.id,
});
if (
  !authorInterestReplyPrompt.includes('先判断你作为楼主是否自然想回这条指定评论')
  || !authorInterestReplyPrompt.includes('[跳过]')
  || !authorInterestReplyPrompt.includes('不要总结整条动态')
) {
  throw new Error('Moment author free-reply prompt should allow the author to skip or reply naturally.');
}
stateModule.state.modelConfig.apiUrl = 'https://example.test';
stateModule.state.modelConfig.model = 'moment-test-model';
const secondFriendTargetComment = moments.addMomentComment(authorMoment.id, 'second character comment should also be replyable', blockedCharacter, 'model');
const authorReplyOutputs = ['楼主回第一条角色评论。', '楼主回第二条角色评论。'];
(globalThis as any).fetch = async () => new Response(JSON.stringify({
  choices: [{ message: { content: authorReplyOutputs.shift() ?? '[跳过]' } }],
}), { status: 200, headers: { 'content-type': 'application/json' } });
const firstFreeAuthorReply = await moments.generateAuthorReplyIfInterested(
  authorMoment,
  promptCharacter,
  friendTargetComment.id,
  { countBudget: true },
);
const secondFreeAuthorReply = await moments.generateAuthorReplyIfInterested(
  authorMoment,
  promptCharacter,
  secondFriendTargetComment.id,
  { countBudget: true },
);
if (
  !firstFreeAuthorReply
  || !secondFreeAuthorReply
  || firstFreeAuthorReply.replyToCommentId !== friendTargetComment.id
  || secondFreeAuthorReply.replyToCommentId !== secondFriendTargetComment.id
  || !stateModule.state.characterInteractions.some((record: any) =>
    record.source.type === 'comment'
    && record.source.id === firstFreeAuthorReply.id
    && record.actorCharacterId === promptCharacter.id
    && record.targetCharacterIds[0] === friendCharacter.id
  )
  || !stateModule.state.characterInteractions.some((record: any) =>
    record.source.type === 'comment'
    && record.source.id === secondFreeAuthorReply.id
    && record.actorCharacterId === promptCharacter.id
    && record.targetCharacterIds[0] === blockedCharacter.id
  )
) {
  throw new Error('Moment author should be able to freely reply to multiple character comments.');
}
const authorModelReply = moments.addMomentComment(
  authorMoment.id,
  '楼主模型回复这条评论。',
  promptCharacter,
  'model',
  authorReplyUserComment.id,
);
const authorModelReplyTimeline = stateModule.state.timelineEntries.find((entry: any) =>
  entry.source.type === 'comment' && entry.source.id === authorModelReply.id,
);
const targetedModelReply = moments.addMomentComment(
  authorMoment.id,
  '楼主稍后单独回复另一条。',
  promptCharacter,
  'model',
  olderUserComment.id,
);
const adjacentFriendComment = moments.addMomentComment(authorMoment.id, '旁边角色留下的独立评论。', friendCharacter, 'model');
if (!moments.deleteMomentComment(authorMoment.id, friendTargetComment.id)) {
  throw new Error('Character comment with a user reply could not be deleted.');
}
if (
  authorMoment.comments.some((commentItem: any) => commentItem.id === friendTargetComment.id)
  || authorMoment.comments.some((commentItem: any) => commentItem.id === manualReplyToCharacterComment.id)
  || !authorMoment.comments.some((commentItem: any) => commentItem.id === adjacentFriendComment.id)
) {
  throw new Error('Deleting a character comment did not remove its targeted reply safely.');
}
if (!moments.deleteMomentComment(authorMoment.id, authorReplyUserComment.id)) {
  throw new Error('Author moment user comment could not be deleted.');
}
if (
  authorMoment.comments.some((commentItem: any) => commentItem.id === authorReplyUserComment.id)
  || authorMoment.comments.some((commentItem: any) => commentItem.id === authorModelReply.id)
  || !authorMoment.comments.some((commentItem: any) => commentItem.id === targetedModelReply.id)
  || !authorMoment.comments.some((commentItem: any) => commentItem.id === adjacentFriendComment.id)
  || !authorModelReplyTimeline?.revokedAt
  || authorModelReplyTimeline?.includeInContext
) {
  throw new Error('Deleting a user moment comment did not remove the adjacent author model reply safely.');
}
if (!moments.deleteMomentComment(authorMoment.id, olderUserComment.id)) {
  throw new Error('Targeted author reply source comment could not be deleted.');
}
if (authorMoment.comments.some((commentItem: any) => commentItem.id === targetedModelReply.id)) {
  throw new Error('Deleting a targeted moment comment did not remove the linked author reply.');
}
if (!moments.deleteMoment(authorMoment.id)) {
  throw new Error('Author reply prompt fixture could not be deleted.');
}
stateModule.state.modelConfig.apiUrl = 'https://example.test';
stateModule.state.modelConfig.model = 'moment-test-model';
const conversation = stateModule.ensureConversation(promptCharacter);
stateModule.state.messages.push({
  id: 'private_user_last_line',
  conversationId: conversation.id,
  characterId: promptCharacter.id,
  role: 'user',
  content: 'PRIVATE_CHAT_LAST_USER_LINE_SHOULD_NOT_LEAK',
  createdAt: Date.now(),
  source: 'user',
});
let capturedMomentPayload: any;
(globalThis as any).fetch = async (_url: string, init?: { body?: string }) => {
  capturedMomentPayload = init?.body ? JSON.parse(init.body) : undefined;
  return new Response(JSON.stringify({
    choices: [{ message: { content: '午后的光有点好，想把这一刻存一下。' } }],
  }), { status: 200, headers: { 'content-type': 'application/json' } });
};
const generatedMoment = await moments.generateCharacterMoment(promptCharacter);
const capturedMomentPrompt = JSON.stringify(capturedMomentPayload?.messages ?? []);
if (
  capturedMomentPrompt.includes('PRIVATE_CHAT_LAST_USER_LINE_SHOULD_NOT_LEAK')
  || !capturedMomentPrompt.includes('不要接续、回应或改写私聊里用户说的最后一句话')
) {
  throw new Error('Character moment generation still leaked private chat context.');
}
if (!moments.deleteMoment(generatedMoment.id)) {
  throw new Error('Generated moment fixture could not be deleted.');
}
stateModule.state.worldInteractionHighSimulation = true;
const spreadMoment = moments.publishMoment('auto world interaction moment', promptCharacter, 'auto_character');
const spreadOutputs = [
  '好友角色看到后评论一句。',
  '屏蔽角色也评论一句。',
  '楼主回好友角色。',
  '楼主回屏蔽角色。',
];
(globalThis as any).fetch = async () => new Response(JSON.stringify({
  choices: [{ message: { content: spreadOutputs.shift() ?? '[跳过]' } }],
}), { status: 200, headers: { 'content-type': 'application/json' } });
const spreadResult = await moments.spreadMomentInteractions(spreadMoment.id, {
  maxInterestedComments: 2,
  allowAuthorReplies: true,
  countBudget: true,
});
if (
  spreadResult.interestedCommentCount !== 2
  || spreadResult.authorReplyCount !== 2
  || spreadMoment.comments.length !== 4
  || spreadMoment.comments.filter((item: any) => item.characterId === promptCharacter.id).length !== 2
) {
  throw new Error('Automatic moment interaction spread did not create bounded comments and free author replies.');
}
if (!moments.deleteMoment(spreadMoment.id)) {
  throw new Error('Automatic moment interaction spread fixture could not be deleted.');
}
if (moments.momentsForActiveWorld().length !== 1) {
  throw new Error('Default world moment was not visible.');
}

const secondWorld = stateModule.createWorld('second world');
const secondWorldCharacter = {
  ...promptCharacter,
  id: 'character_second_world_test',
  worldId: secondWorld.id,
  name: 'Second World Character',
  relationship: {
    ...stateModule.createDefaultRelationship(),
    stage: 'familiar',
    affinity: 10,
    updatedAt: Date.now(),
  },
  autoMessage: stateModule.createDefaultAutoMessageSchedule(),
  autoMoment: stateModule.createDefaultAutoMomentSchedule(),
  autoEvent: stateModule.createDefaultAutoEventSchedule(),
};
stateModule.state.characters.push(secondWorldCharacter);
const second = moments.publishMoment('second world moment');
stateModule.setActiveWorld('world_default');
const combinedWorldMoments = moments.momentsForActiveWorld();
if (
  combinedWorldMoments.length !== 2
  || !combinedWorldMoments.some((moment: any) => moment.id === first.id)
  || !combinedWorldMoments.some((moment: any) => moment.id === second.id)
) {
  throw new Error('Dynamic feed should not switch or split by active world.');
}
const secondUserComment = moments.addMomentComment(second.id, 'user can comment without switching world');
const secondCharacterComment = moments.addMomentComment(
  second.id,
  'same world character can comment without switching world',
  secondWorldCharacter,
  'model',
);
let crossWorldCommentBlocked = false;
try {
  moments.addMomentComment(second.id, 'default world character should not comment across worlds', promptCharacter, 'model');
} catch {
  crossWorldCommentBlocked = true;
}
if (
  secondUserComment.authorType !== 'user'
  || secondCharacterComment.characterId !== secondWorldCharacter.id
  || !crossWorldCommentBlocked
) {
  throw new Error('Dynamic comments should allow the user and same-world characters, but block cross-world characters.');
}
if (!moments.deleteMoment(second.id)) {
  throw new Error('Deleting a non-active-world moment from the global dynamic feed failed.');
}

if (!moments.deleteMoment(first.id) || moments.momentsForActiveWorld().length !== 0) {
  throw new Error('Moment deletion failed.');
}
if (
  !firstTimelineEntry.revokedAt
  || firstTimelineEntry.includeInContext
  || !commentTimelineEntry.revokedAt
  || commentTimelineEntry.includeInContext
) {
  throw new Error('Deleting a moment did not revoke its moment and comment timeline entries.');
}

console.log(
  JSON.stringify({
    published: 2,
    isolatedWorldId: secondWorld.id,
    deleted: true,
    phonePostPrompt: true,
    selectedAuthor: true,
    comments: true,
    commentPromptBlocks: true,
    authorReplyDeletedWithTrigger: true,
    interestFiltering: true,
    characterInteraction: true,
    interactionFrequencyGuard: true,
    visibilityRules: true,
    visibilityContext: true,
    privateChatContextBlocked: true,
    momentTimeline: true,
    commentTimeline: true,
    momentTimelineRevoked: true,
  }),
);
}

void main();
