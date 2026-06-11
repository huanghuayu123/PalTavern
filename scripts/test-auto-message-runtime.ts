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

const notificationLog: Array<{ title: string; body: string }> = [];
class MockNotification {
  static permission = 'granted';
  constructor(title: string, options: { body?: string } = {}) {
    notificationLog.push({ title, body: options.body ?? '' });
  }
}

Object.defineProperty(globalThis, 'Notification', { value: MockNotification });
Object.defineProperty(globalThis, 'window', {
  value: {
    Notification: MockNotification,
    setInterval,
    clearInterval,
  },
});
Object.defineProperty(globalThis, 'navigator', {
  value: { userAgent: 'node-test' },
});

let modelCallCount = 0;
let lastModelRequestText = '';
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: async (_url: string, init?: { body?: string }) => {
    modelCallCount += 1;
    const body = init?.body ? JSON.parse(init.body) : {};
    lastModelRequestText = JSON.stringify(body.messages ?? []);
    return new Response(JSON.stringify({
      choices: [{ message: { content: '今晚风很轻，你还好吗？' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

const stateModule = require('../src/independent-chat/core/state');
const scheduler = require('../src/independent-chat/automation/scheduler');
const chat = require('../src/independent-chat/chat/private-chat');
const impacts = require('../src/independent-chat/memory/impacts');
const model = require('../src/independent-chat/model/client');
const notifications = require('../src/independent-chat/platform/notifications');

const character = {
  id: 'runtime_character',
  worldId: 'world_default',
  name: '林澈',
  personality: '敏感，会先轻微试探',
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
    affinity: 60,
    summary: '彼此熟悉，但最近联系变少。',
    updatedAt: Date.now(),
  },
  autoMessage: {
    ...stateModule.createDefaultAutoMessageSchedule(),
    enabled: true,
    quietHours: { enabled: false, start: '23:00', end: '08:00' },
    nextAttemptAt: Date.now() - 1000,
    notificationPrivacy: 'full',
    pacingStrategy: '节奏倾向：敏感试探型。用户连续未回复时先轻微试探，然后进入较长沉默。',
  },
  importedAt: Date.now(),
};

stateModule.state.characters.push(character);
stateModule.state.activeCharacterId = character.id;
stateModule.state.modelConfig = {
  apiUrl: 'https://example.invalid/v1',
  apiKey: 'test-key',
  model: 'test-model',
  temperature: 0.7,
  dailyRequestLimit: 10,
};

async function main(): Promise<void> {
  let renderCount = 0;
  await scheduler.runAutoMessageCheckNow(() => {
    renderCount += 1;
  });

  const autoMessages = stateModule.state.messages.filter((message: any) => message.source === 'auto_message');
  if (modelCallCount !== 1 || autoMessages.length !== 1) {
    throw new Error('Due proactive message was not generated exactly once.');
  }
  if (stateModule.unreadCountFor(character.id) !== 1) {
    throw new Error('Background proactive message did not remain unread.');
  }
  if (autoMessages[0].content !== '今晚风很轻，你还好吗？') {
    throw new Error('Generated proactive message was not stored in the private chat.');
  }
  if (
    !lastModelRequestText.includes('用户可编辑的主动消息节奏策略')
    || !lastModelRequestText.includes('敏感试探型')
  ) {
    throw new Error('Editable proactive pacing strategy was not sent to the model prompt.');
  }
  if (!autoMessages[0].autoReason || !autoMessages[0].autoReason.includes('亲近')) {
    throw new Error('Generated proactive message did not keep a readable trigger reason.');
  }
  const autoTimelineEntry = stateModule.state.timelineEntries.find((entry: any) =>
    entry.type === 'auto_message'
    && entry.source.type === 'message'
    && entry.source.id === autoMessages[0].id,
  );
  if (!autoTimelineEntry || !autoTimelineEntry.summary.includes(autoMessages[0].autoReason)) {
    throw new Error('Generated proactive message reason was not written into the timeline.');
  }
  const autoImpactRecords = stateModule.state.impactRecords.filter((record: any) =>
    record.operationId === `auto_message:${autoMessages[0].id}`,
  );
  if (
    autoImpactRecords.length < 2
    || !autoImpactRecords.some((record: any) => record.targetType === 'message')
    || !autoImpactRecords.some((record: any) => record.targetId === autoTimelineEntry.id)
  ) {
    throw new Error('Generated proactive message did not create rollback impact records.');
  }
  if (notificationLog.length !== 1 || notificationLog[0].title !== character.name) {
    throw new Error('Successful proactive message did not send the configured local notification.');
  }
  if (character.autoMessage.unansweredCount !== 1 || character.autoMessage.nextAttemptAt <= Date.now()) {
    throw new Error('Proactive message pacing state was not advanced.');
  }
  if (renderCount !== 1 || stateModule.state.modelUsage.requestCount !== 1) {
    throw new Error('Scheduler completion or model budget accounting failed.');
  }

  // Big guard: an idle scheduler pass must stay silent so focused composers are not rebuilt every minute.
  const renderCountAfterDueMessage = renderCount;
  await scheduler.runAutoMessageCheckNow(() => {
    renderCount += 1;
  });
  if (renderCount !== renderCountAfterDueMessage) {
    throw new Error('Idle scheduler check should not re-render the UI when no automation state changed.');
  }

  const rollback = impacts.rollbackTimelineEntryImpact(autoTimelineEntry.id);
  const promptAfterRollback = model.buildModelMessages(character).map((message: any) => message.content).join('\n');
  if (
    !rollback.ok
    || !autoMessages[0].impactRevokedAt
    || stateModule.unreadCountFor(character.id) !== 0
    || !autoTimelineEntry.revokedAt
    || autoTimelineEntry.includeInContext
    || promptAfterRollback.includes('今晚风很轻')
  ) {
    throw new Error('Rolled-back proactive message still affected unread state or model context.');
  }
  stateModule.markConversationRead(character.id);
  if (stateModule.unreadCountFor(character.id) !== 0) {
    throw new Error('Opening the conversation did not clear unread messages.');
  }

  stateModule.state.modelConfig.dailyRequestLimit = 1;
  await chat.sendMessage('我在，刚刚没看到。', () => {
    renderCount += 1;
  });
  if (modelCallCount !== 2 || stateModule.state.modelUsage.requestCount !== 1) {
    throw new Error('Manual chat replies should ignore the automatic-output budget.');
  }
  if (!character.autoMessage.pendingResetDecision) {
    throw new Error('User reply did not request a pacing reset decision.');
  }
  if (character.autoMessage.unansweredCount !== 1) {
    throw new Error('User reply changed the reduced pacing before user confirmation.');
  }

  scheduler.applyResetDecision(character, 'restore');
  if (character.autoMessage.pendingResetDecision || character.autoMessage.unansweredCount !== 0) {
    throw new Error('Restore pacing decision was not applied.');
  }

  const full = notifications.buildNotificationText(character, 'secret message', 'full');
  const generic = notifications.buildNotificationText(character, 'secret message', 'generic');
  const hidden = notifications.buildNotificationText(character, 'secret message', 'hide_character');
  if (full.body !== 'secret message' || generic.body.includes('secret') || hidden.title.includes(character.name)) {
    throw new Error('Notification privacy levels leaked protected content.');
  }

  let delayedFetchStarted = false;
  let abortObserved = false;
  let markDelayedFetchStarted: (() => void) | undefined;
  const delayedFetchReady = new Promise<void>(resolve => {
    markDelayedFetchStarted = resolve;
  });
  const messagesBeforeStop = stateModule.state.messages.length;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    delayedFetchStarted = true;
    markDelayedFetchStarted?.();
    const signal = init?.signal;
    return await new Promise<Response>((resolve, reject) => {
      const abort = () => {
        abortObserved = true;
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      setTimeout(() => {
        resolve(new Response(JSON.stringify({
          choices: [{ message: { content: '这条回复不应该被写入。' } }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }, 2000);
    });
  }) as typeof fetch;
  const stoppingReply = chat.sendMessage('先停一下。', () => {
    renderCount += 1;
  });
  await delayedFetchReady;
  if (!delayedFetchStarted || !chat.isReplying()) {
    throw new Error('Reply generation did not enter the stoppable state.');
  }
  if (!chat.stopReply()) {
    throw new Error('Stop reply returned false while a reply was active.');
  }
  await stoppingReply;
  if (!abortObserved || chat.isReplying()) {
    throw new Error('Stopping a reply did not abort the active request and unlock the UI.');
  }
  if (stateModule.state.messages.length !== messagesBeforeStop + 1) {
    throw new Error('Stopped reply still wrote an assistant message.');
  }

  let backgroundFetchStarted = false;
  let backgroundAbortObserved = false;
  let markBackgroundFetchStarted: (() => void) | undefined;
  const backgroundFetchReady = new Promise<void>(resolve => {
    markBackgroundFetchStarted = resolve;
  });
  const messagesBeforeBackgroundReset = stateModule.state.messages.length;
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    backgroundFetchStarted = true;
    markBackgroundFetchStarted?.();
    const signal = init?.signal;
    return await new Promise<Response>((resolve, reject) => {
      const abort = () => {
        backgroundAbortObserved = true;
        const error = new Error('Aborted');
        error.name = 'AbortError';
        reject(error);
      };
      if (signal?.aborted) {
        abort();
        return;
      }
      signal?.addEventListener('abort', abort, { once: true });
      setTimeout(() => {
        resolve(new Response(JSON.stringify({
          choices: [{ message: { content: '这条后台回复不应该被写入。' } }],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }));
      }, 2000);
    });
  }) as typeof fetch;
  const backgroundReply = chat.sendMessage('我切一下悬浮窗。', () => {
    renderCount += 1;
  });
  await backgroundFetchReady;
  if (!backgroundFetchStarted || !chat.isReplying()) {
    throw new Error('Background recovery test did not enter the active reply state.');
  }
  if (!chat.resetReplyState('应用进入后台，已停止未完成的生成；输入内容已保留。')) {
    throw new Error('Background recovery did not reset an active reply.');
  }
  await backgroundReply;
  if (
    !backgroundAbortObserved
    || chat.isReplying()
    || !chat.statusText.includes('输入内容已保留')
    || stateModule.state.messages.length !== messagesBeforeBackgroundReset + 1
  ) {
    throw new Error('Background recovery did not abort the stuck reply cleanly.');
  }

  console.log(JSON.stringify({
    generated: true,
    storedInPrivateChat: true,
    notified: true,
    budgetCounted: true,
    manualChatBudgetIgnored: true,
    replyRequiresDecision: true,
    explicitRestore: true,
    notificationPrivacy: true,
    unreadLifecycle: true,
    stopReplyAbort: true,
    backgroundReplyReset: true,
    proactiveReason: true,
    proactiveTimeline: true,
    proactiveRollback: true,
  }));
}

void main();
