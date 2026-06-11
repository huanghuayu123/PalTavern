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

Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node-test' },
});

const stateModule = require('../src/independent-chat/core/state');
const groupChat = require('../src/independent-chat/chat/group-chat');
const cards = require('../src/independent-chat/characters/cards');
const timeline = require('../src/independent-chat/memory/timeline');
const characterRelationships = require('../src/independent-chat/characters/relationships');

function testCharacter(id: string, name: string) {
  return {
    id,
    worldId: 'world_default',
    name,
    avatar: '',
    description: `${name} 的设定应进入群聊生成上下文。`,
    personality: `${name} 说话自然，会接住别人抛来的话题。`,
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'test',
      specVersion: '',
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

type MockModelCall = { url: string; messages: Array<{ role: string; content: string }> };

function mockModelResponses(responses: string[]) {
  const calls: MockModelCall[] = [];
  const originalFetch = (globalThis as any).fetch;
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (url: string, init?: { body?: string }) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      calls.push({ url: String(url), messages: Array.isArray(body.messages) ? body.messages : [] });
      const content = responses.shift() ?? '<msg>默认回复</msg>';
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

(async () => {
  stateModule.replaceState(stateModule.defaultState());
  stateModule.state.userName = '测试用户';
  stateModule.state.characters.push(
    testCharacter('group_character_a', '林夏'),
    testCharacter('group_character_b', '周遥'),
    testCharacter('group_character_c', '许南'),
  );
  const groupCharacterA = stateModule.state.characters.find((character: any) => character.id === 'group_character_a');
  const groupCharacterB = stateModule.state.characters.find((character: any) => character.id === 'group_character_b');
  const groupPair = characterRelationships.ensureCharacterRelationship(groupCharacterA, groupCharacterB);
  characterRelationships.updateCharacterRelationshipSide(groupPair, 'group_character_a', {
    stage: 'close',
    summary: 'A knows B will interrupt when the group gets too quiet.',
  });
  characterRelationships.updateCharacterRelationshipSide(groupPair, 'group_character_b', {
    stage: 'strained',
    summary: 'B thinks A notices more than A says out loud.',
  });
  stateModule.saveState();

  const created = groupChat.createGroupChat('午休测试群', [
    'group_character_a',
    'group_character_b',
    'missing_character',
  ]);
  if (
    created.title !== '午休测试群'
    || created.participantCharacterIds.length !== 2
    || stateModule.state.activeGroupChatId !== created.id
    || created.allowModelInitiatedMessages !== false
  ) {
    throw new Error('Creating a group chat did not select valid participants or activate the group.');
  }

  groupChat.updateGroupChat(created.id, { selectedSpeakerId: 'group_character_a' });
  const authored = groupChat.sendGroupUserMessage('我先用林夏的身份说一句。', created.id);
  if (
    !authored
    || authored.speakerType !== 'character'
    || authored.speakerCharacterId !== 'group_character_a'
    || authored.source !== 'user'
  ) {
    throw new Error('Sending a group message as a selected character did not preserve the speaker identity.');
  }

  groupChat.updateGroupChat(created.id, { selectedSpeakerId: 'user' });
  const userMessage = groupChat.sendGroupUserMessage('这次用用户身份发言。', created.id);
  if (!userMessage || userMessage.speakerType !== 'user' || userMessage.source !== 'user') {
    throw new Error('Sending a group message as the user did not keep the user speaker identity.');
  }
  const blockedActiveReplies = await groupChat.generateGroupReply(created.id, undefined, true);
  if (
    blockedActiveReplies.length !== 0
    || stateModule.groupMessagesFor(created.id).some((message: any) => message.source === 'auto_model')
  ) {
    throw new Error('Group model-initiated messages should be disabled by default.');
  }

  const specifiedReplies = await groupChat.generateGroupReply(created.id, 'group_character_b');
  if (
    specifiedReplies.length !== 1
    || specifiedReplies[0].speakerCharacterId !== 'group_character_b'
    || specifiedReplies[0].source !== 'model'
  ) {
    throw new Error('Generating a specified character group reply failed.');
  }

  groupChat.updateGroupChat(created.id, { allowModelInitiatedMessages: true });
  const activeReplies = await groupChat.generateGroupReply(created.id, undefined, true);
  if (
    activeReplies.length !== 1
    || activeReplies[0].speakerCharacterId !== 'group_character_a'
    || activeReplies[0].source !== 'auto_model'
  ) {
    throw new Error('Active group continuation did not choose the next speaker or mark the source.');
  }

  const modelStartedGroup = groupChat.createGroupChat('主动开场测试群', [
    'group_character_b',
    'group_character_c',
  ]);
  groupChat.updateGroupChat(modelStartedGroup.id, { allowModelInitiatedMessages: true });
  const modelStartedMessages = await groupChat.generateGroupReplyForLatest(modelStartedGroup.id, true, 'active');
  const modelStartedFollowup = await groupChat.generateGroupReplyForLatest(modelStartedGroup.id, false, 'continue');
  if (
    modelStartedMessages.length !== 1
    || modelStartedMessages[0].source !== 'auto_model'
    || modelStartedFollowup.length !== 1
    || modelStartedFollowup[0].replyToId !== modelStartedMessages[0].id
    || modelStartedFollowup[0].speakerCharacterId === modelStartedMessages[0].speakerCharacterId
  ) {
    throw new Error('Enabled model-initiated group messages could not start an empty group and receive a reply.');
  }

  const messages = stateModule.groupMessagesFor(created.id);
  const groupTimelineEntries = stateModule.state.timelineEntries.filter((entry: any) =>
    entry.type === 'group_chat'
    && entry.source.type === 'group_message'
    && entry.characterIds.includes('group_character_a')
    && entry.characterIds.includes('group_character_b'),
  );
  if (messages.length !== 4 || groupTimelineEntries.length !== 4) {
    throw new Error('Group messages were not stored or mirrored into the timeline.');
  }

  const participatingCharacter = stateModule.state.characters.find((character: any) =>
    character.id === 'group_character_a',
  );
  const timelineText = timeline.timelineContextFor(participatingCharacter, 10);
  if (!timelineText.includes('午休测试群') || !timelineText.includes('我先用林夏的身份说一句')) {
    throw new Error('Group chat timeline context was not visible to participating characters.');
  }

  const createdGroupMessageIds = new Set(
    stateModule.state.groupMessages
      .filter((message: any) => message.groupChatId === created.id)
      .map((message: any) => message.id),
  );
  groupChat.updateGroupChat(created.id, { title: '午休改名群' });
  if (!stateModule.state.timelineEntries
    .filter((entry: any) => entry.source.type === 'group_message' && createdGroupMessageIds.has(entry.source.id))
    .every((entry: any) => entry.title.includes('午休改名群'))) {
    throw new Error('Renaming a group chat did not update its timeline entry titles.');
  }

  groupChat.updateGroupChat(created.id, { replyAllOnUserMessage: true });
  const roundAnchor = groupChat.sendGroupUserMessage('这一条让大家都回复。', created.id);
  const roundReplies = await groupChat.generateGroupRoundReply(created.id, false, roundAnchor.id);
  if (
    !stateModule.state.groupChats.find((chat: any) => chat.id === created.id)?.replyAllOnUserMessage
    || roundReplies.length !== 2
    || !roundReplies.every((message: any) => message.replyToId === roundAnchor.id)
  ) {
    throw new Error('Group round replies did not include every participant or preserve the user message anchor.');
  }
  const duplicateRound = await groupChat.generateGroupRoundReply(created.id, false, roundAnchor.id);
  if (duplicateRound.length !== 0) {
    throw new Error('The same user group message was allowed to trigger more than one reply round.');
  }
  const latestRoundReply = roundReplies[roundReplies.length - 1];
  const characterFollowup = await groupChat.generateGroupReplyForLatest(created.id);
  if (
    characterFollowup.length !== 1
    || characterFollowup[0].replyToId !== latestRoundReply.id
    || characterFollowup[0].speakerCharacterId === latestRoundReply.speakerCharacterId
  ) {
    throw new Error('A character could not naturally reply to the previous character message.');
  }
  const overextendedFollowup = await groupChat.generateGroupReplyForLatest(created.id);
  if (overextendedFollowup.length !== 0) {
    throw new Error('Character-to-character group replies continued without waiting for the user.');
  }

  const routedGroup = groupChat.createGroupChat('路由测试群', [
    'group_character_a',
    'group_character_b',
    'group_character_c',
  ]);
  const routedAnchor = groupChat.sendGroupUserMessage('这条消息看看谁想接。', routedGroup.id);
  let mock = mockModelResponses([
    '{"speakerIds":["group_character_b","group_character_a","group_character_c"],"reason":"前两位最想接"}',
    '<msg>我先接一句。</msg><msg>我再补一句。</msg>',
    '<msg>那我补一句。</msg><msg>这句不应该落库。</msg>',
  ]);
  const routedReplies = await groupChat.generateGroupReplyForLatest(routedGroup.id);
  if (
    routedReplies.length !== 3
    || routedReplies[0].speakerCharacterId !== 'group_character_b'
    || routedReplies[1].speakerCharacterId !== 'group_character_b'
    || routedReplies[2].speakerCharacterId !== 'group_character_a'
    || routedReplies.some((message: any) => message.content.includes('不应该落库'))
    || !routedReplies.every((message: any) => message.replyToId === routedAnchor.id)
  ) {
    throw new Error('AI-routed group replies did not cap speakers and total bubbles in returned order.');
  }
  const routedPromptText = mock.calls
    .flatMap(call => call.messages.map(message => message.content))
    .join('\n');
  if (
    !routedPromptText.includes('A knows B will interrupt when the group gets too quiet.')
    || !routedPromptText.includes('B thinks A notices more than A says out loud.')
  ) {
    throw new Error('Group prompt did not include two-way character relationship context.');
  }
  mock.restore();

  const quietAnchor = groupChat.sendGroupUserMessage('这句可以没人回。', routedGroup.id);
  mock = mockModelResponses(['{"speakerIds":[],"reason":"没人自然想接"}']);
  const quietReplies = await groupChat.generateGroupReplyForLatest(routedGroup.id);
  if (
    quietReplies.length !== 0
    || stateModule.state.groupMessages.some((message: any) =>
      message.replyToId === quietAnchor.id && (message.source === 'model' || message.source === 'auto_model'))
  ) {
    throw new Error('A valid empty speaker route should allow the group to stay silent.');
  }
  mock.restore();

  const skipAnchor = groupChat.sendGroupUserMessage('这句选中了也可以跳过。', routedGroup.id);
  mock = mockModelResponses([
    '{"speakerIds":["group_character_a"],"reason":"也许能接"}',
    '[跳过]',
  ]);
  const skippedRoutedReplies = await groupChat.generateGroupReplyForLatest(routedGroup.id);
  if (
    skippedRoutedReplies.length !== 0
    || stateModule.state.groupMessages.some((message: any) =>
      message.replyToId === skipAnchor.id && (message.source === 'model' || message.source === 'auto_model'))
  ) {
    throw new Error('A routed group speaker that outputs [跳过] should not create a message.');
  }
  mock.restore();

  const invalidRouteAnchor = groupChat.sendGroupUserMessage('这句路由坏掉也要兜底。', routedGroup.id);
  mock = mockModelResponses(['not json', '<msg>我来接一下。</msg>']);
  const fallbackReplies = await groupChat.generateGroupReplyForLatest(routedGroup.id);
  if (
    fallbackReplies.length !== 1
    || fallbackReplies[0].replyToId !== invalidRouteAnchor.id
  ) {
    throw new Error('Invalid group speaker route did not fall back to one local speaker.');
  }
  mock.restore();

  mock = mockModelResponses([
    '{"speakerIds":["group_character_c"],"reason":"接上一条角色消息"}',
    '<msg>顺着你刚才那句说。</msg>',
  ]);
  const continueReplies = await groupChat.generateGroupReplyForLatest(routedGroup.id, false, 'continue');
  const continuePromptText = mock.calls
    .flatMap(call => call.messages.map(message => message.content))
    .join('\n');
  if (
    continueReplies.length !== 1
    || continueReplies[0].content.includes('测试用户')
    || !continuePromptText.includes('不提 user')
  ) {
    throw new Error('Empty-input group continuation did not avoid mentioning user in prompt or output.');
  }
  mock.restore();

  const managedGroup = groupChat.createGroupChat('管理测试群', [
    'group_character_b',
    'group_character_c',
  ]);
  const managedFirstMessage = groupChat.sendGroupUserMessage('这条记录稍后清空。', managedGroup.id);
  const clearMessageIds = stateModule.state.groupMessages
    .filter((message: any) => message.groupChatId === managedGroup.id)
    .map((message: any) => message.id);
  if (
    !managedFirstMessage
    || clearMessageIds.length !== 1
    || !stateModule.state.timelineEntries.some((entry: any) =>
      entry.source.type === 'group_message' && entry.source.id === managedFirstMessage.id)
  ) {
    throw new Error('Group management setup did not create a message and timeline entry.');
  }
  const clearResult = groupChat.clearGroupMessages(managedGroup.id);
  const clearedGroup = stateModule.state.groupChats.find((chat: any) => chat.id === managedGroup.id);
  if (
    !clearResult.ok
    || clearResult.deletedMessages !== 1
    || !clearedGroup
    || clearedGroup.participantCharacterIds.length !== 2
    || stateModule.groupMessagesFor(managedGroup.id).length !== 0
    || stateModule.state.timelineEntries.some((entry: any) =>
      entry.source.type === 'group_message' && clearMessageIds.includes(entry.source.id))
  ) {
    throw new Error('Clearing group messages did not preserve the group while removing message context.');
  }

  const managedSecondMessage = groupChat.sendGroupUserMessage('这条记录跟着群聊一起解散。', managedGroup.id);
  const deleteMessageIds = stateModule.state.groupMessages
    .filter((message: any) => message.groupChatId === managedGroup.id)
    .map((message: any) => message.id);
  const deleteResult = groupChat.deleteGroupChat(managedGroup.id);
  if (
    !managedSecondMessage
    || !deleteResult.ok
    || deleteResult.deletedMessages !== 1
    || stateModule.state.groupChats.some((chat: any) => chat.id === managedGroup.id)
    || stateModule.state.groupMessages.some((message: any) => message.groupChatId === managedGroup.id)
    || stateModule.state.timelineEntries.some((entry: any) =>
      entry.source.type === 'group_message' && deleteMessageIds.includes(entry.source.id))
    || stateModule.state.activeGroupChatId === managedGroup.id
  ) {
    throw new Error('Deleting a group chat did not remove the group, records, timeline context, or active selection.');
  }

  cards.deleteCharacter('group_character_a');
  const updatedGroup = stateModule.state.groupChats.find((chat: any) => chat.id === created.id);
  if (
    !updatedGroup
    || updatedGroup.participantCharacterIds.includes('group_character_a')
    || updatedGroup.selectedSpeakerId === 'group_character_a'
  ) {
    throw new Error('Deleting a character did not remove it from group membership or speaker selection.');
  }

  console.log(JSON.stringify({
    createGroup: true,
    selectedCharacterSpeaker: true,
    userSpeaker: true,
    modelInitiatedDefaultOff: true,
    specifiedReply: true,
    activeReply: true,
    modelInitiatedStartAndReply: true,
    replyAllRound: true,
    replyAllDeduped: true,
    characterFollowup: true,
    characterFollowupLimited: true,
    routedReply: true,
    routedTotalBubbleCap: true,
    quietRoute: true,
    skippedRoutedSpeaker: true,
    invalidRouteFallback: true,
    noUserContinue: true,
    clearGroupMessages: true,
    deleteGroupChat: true,
    timelineContext: true,
    renamedTimeline: true,
    deleteCharacterCleanup: true,
    characterRelationshipPrompt: true,
  }));
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
