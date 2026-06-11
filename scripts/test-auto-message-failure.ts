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
Object.defineProperty(globalThis, 'fetch', {
  value: async (_url: string, init: { body?: string }) => {
    const body = init?.body ?? '';
    if (body.includes('失败角色')) {
      return new Response('upstream unavailable', { status: 503 });
    }
    return new Response(JSON.stringify({
      choices: [{ message: { content: '第二个角色仍然成功发来了消息。' } }],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

const stateModule = require('../src/independent-chat/core/state');
const scheduler = require('../src/independent-chat/automation/scheduler');

function makeCharacter(id: string, name: string) {
  return {
    id,
    worldId: 'world_default',
    name,
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'chara_card_v2',
      specVersion: '2.0',
      worldBookEntryCount: 0,
      importedFileName: '',
    },
    relationship: stateModule.createDefaultRelationship(),
    autoMessage: {
      ...stateModule.createDefaultAutoMessageSchedule(),
      enabled: true,
      quietHours: { enabled: false, start: '23:00', end: '08:00' },
      nextAttemptAt: Date.now() - 1000,
      backgroundNotificationsEnabled: false,
    },
    importedAt: Date.now(),
  };
}

const failed = makeCharacter('failed_character', '失败角色');
const successful = makeCharacter('successful_character', '成功角色');
stateModule.state.characters.push(failed, successful);
stateModule.state.modelConfig = {
  apiUrl: 'https://example.invalid/v1',
  apiKey: '',
  model: 'test-model',
  temperature: 0.7,
  dailyRequestLimit: 10,
};

async function main(): Promise<void> {
  await scheduler.runAutoMessageCheckNow(() => {});
  const failedMessages = stateModule.state.messages.filter((message: any) => message.characterId === failed.id);
  const successfulMessages = stateModule.state.messages.filter((message: any) => message.characterId === successful.id);
  if (failedMessages.length !== 0 || !failed.autoMessage.pacingReason.includes('生成失败')) {
    throw new Error('Failed proactive generation was not safely delayed.');
  }
  if (failed.autoMessage.nextAttemptAt <= Date.now()) {
    throw new Error('Failed proactive generation was not rescheduled.');
  }
  if (successfulMessages.length !== 1 || successfulMessages[0].source !== 'auto_message') {
    throw new Error('One character failure interrupted later characters.');
  }
  console.log(JSON.stringify({
    failedCharacterDelayed: true,
    laterCharacterContinued: true,
  }));
}

void main();
