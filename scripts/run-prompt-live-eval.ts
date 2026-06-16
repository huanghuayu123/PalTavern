export {};
declare const require: (id: string) => any;
declare const module: { require?: unknown };
declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  exitCode?: number;
};

const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');

const promptSuite = require('./prompt-test-cases') as typeof import('./prompt-test-cases');

type ModelMessage = { role: 'system' | 'user' | 'assistant'; content: string };
type CapturedModelCall = {
  url: string;
  status: number;
  durationMs: number;
  content: string;
};
type LiveEvalConfig = {
  apiUrl: string;
  apiKey: string;
  model: string;
  judgeModel: string;
};

const REQUIRED_ENV_KEYS = [
  'PROMPT_TEST_API_URL',
  'PROMPT_TEST_API_KEY',
  'PROMPT_TEST_MODEL',
];

export function missingLiveEvalConfig(env: Record<string, string | undefined> = process.env): string[] {
  return REQUIRED_ENV_KEYS.filter(key => !env[key]?.trim());
}

function normalizeChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/\/chat\/completions$/i.test(trimmed)) return trimmed;
  return /\/v1$/i.test(trimmed) ? `${trimmed}/chat/completions` : `${trimmed}/v1/chat/completions`;
}

function modelText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value.map(item => {
      if (typeof item === 'string') return item;
      if (item && typeof item === 'object' && 'text' in item) return String((item as { text?: unknown }).text ?? '');
      return '';
    }).join('');
  }
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return modelText(record.text ?? record.content ?? record.output_text ?? '');
  }
  return '';
}

function contentFromResponseText(text: string): string {
  try {
    const json = JSON.parse(text) as Record<string, unknown>;
    const choices = Array.isArray(json.choices) ? json.choices : [];
    const first = choices[0] as Record<string, unknown> | undefined;
    const message = first?.message as Record<string, unknown> | undefined;
    return [
      modelText(message?.content),
      modelText(message?.reasoning_content),
      modelText(first?.text),
      modelText(first?.content),
      modelText(json.output),
      modelText(json.content),
      modelText(json.response),
    ].find(item => item.trim())?.trim() ?? '';
  } catch {
    return '';
  }
}

function isJsonLike(raw: string): boolean {
  return raw.trim().startsWith('{') || raw.includes('"speakerIds"') || raw.includes('"title"') || raw.includes('"result"');
}

export function selectPrimaryOutput(
  calls: Array<{ content: string }>,
  target: import('./prompt-test-cases').PromptEvalTarget,
): string {
  const outputs = calls.map(call => call.content.trim()).filter(Boolean);
  if (target === 'event_generate' || target === 'event_outcome' || target === 'group_route') {
    return outputs.find(isJsonLike) ?? outputs[0] ?? '';
  }
  if (target === 'group_reply' || target === 'group_continue' || target === 'group_active') {
    return outputs.find(output => /<msg>[\s\S]*?<\/msg>|\[?跳过\]?/i.test(output) && !output.includes('"speakerIds"'))
      ?? outputs.find(output => !isJsonLike(output))
      ?? outputs[outputs.length - 1]
      ?? '';
  }
  return outputs.find(output => !isJsonLike(output)) ?? outputs[0] ?? '';
}

export function buildJudgePrompt(testCase: import('./prompt-test-cases').PromptEvalCase, rawOutput: string): ModelMessage[] {
  return [
    {
      role: 'system',
      content: [
        '你是 Tavern Social 的提示词质检员，只判断模型输出是否符合产品体验。',
        '只返回 JSON，不要 Markdown，不要解释到 JSON 外。',
        'JSON 字段必须是 {"score":0-100,"pass":true|false,"problems":["问题"],"suggestions":["建议"],"reason":"一句理由"}。',
        '通过标准：像真实手机里的角色互动，符合病例场景，没有小说腔、客服腔、系统泄露、越权现实能力或格式错误。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `病例 ID：${testCase.id}`,
        `分类：${testCase.category}`,
        `路径：${testCase.path}`,
        `场景：${testCase.scenario}`,
        `用户输入或触发：${testCase.userInput ?? '见场景'}`,
        `评审维度：${testCase.judgeCriteria.join('；')}`,
        `预期风险：${testCase.expectedRisks.join('；')}`,
        '',
        '模型原文：',
        rawOutput || '(无输出)',
        '',
        '请严格返回 JSON，字段包括 "score"、"pass"、"problems"、"suggestions"、"reason"。',
      ].join('\n'),
    },
  ];
}

function ensureBrowserLikeGlobals(): void {
  const globalAny = globalThis as any;
  if (!globalAny.localStorage) {
    const values = new Map<string, string>();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
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
  }
  if (!globalAny.window) {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        setInterval,
        clearInterval,
        Notification: globalAny.Notification,
      },
    });
  }
  if (!globalAny.navigator) {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: { userAgent: 'node-prompt-eval' },
    });
  }
  if (!globalAny.Notification) {
    class SilentNotification {
      static permission = 'granted';
      constructor() {}
    }
    Object.defineProperty(globalThis, 'Notification', { configurable: true, value: SilentNotification });
    globalAny.window.Notification = SilentNotification;
  }
}

function installFetchCapture(calls: CapturedModelCall[]): () => void {
  const originalFetch = globalThis.fetch?.bind(globalThis);
  if (!originalFetch) throw new Error('当前 Node 运行时没有 fetch，无法运行真实模型提示词测试。');
  Object.defineProperty(globalThis, 'fetch', {
    configurable: true,
    value: async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (url.startsWith('/api/')) {
        return new Response('{}', { status: 404, headers: { 'content-type': 'application/json' } });
      }
      const started = Date.now();
      const response = await originalFetch(input, init);
      const text = await response.clone().text().catch(() => '');
      const content = contentFromResponseText(text);
      if (content) {
        calls.push({
          url,
          status: response.status,
          durationMs: Date.now() - started,
          content,
        });
      }
      return response;
    },
  });
  return () => {
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch });
  };
}

function loadAppModules() {
  ensureBrowserLikeGlobals();
  return {
    stateModule: require('../src/independent-chat/core/state'),
    groupChat: require('../src/independent-chat/chat/group-chat'),
    model: require('../src/independent-chat/model/client'),
    moments: require('../src/independent-chat/social/moments'),
    events: require('../src/independent-chat/social/events'),
    scheduler: require('../src/independent-chat/automation/scheduler'),
  };
}

function testCharacter(stateModule: any, id: string, name: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    worldId: 'world_default',
    name,
    avatar: '',
    description: `${name} 是同一现实世界里的手机联系人，日常表达自然克制。`,
    personality: `${name} 说话像真实熟人，短句，少解释，不写动作旁白。`,
    scenario: '默认世界是现实生活里的手机社交。',
    tags: [],
    importInfo: {
      sourceFormat: 'json',
      spec: 'chara_card_v2',
      specVersion: '2.0',
      worldBookEntryCount: 0,
      importedFileName: 'prompt-eval-fixture.json',
    },
    relationship: {
      ...stateModule.createDefaultRelationship(),
      stage: 'close',
      affinity: 58,
      summary: '已经长期聊天，习惯晚上互相报备。海边散步那件事还没完全定下来。',
      updatedAt: Date.now(),
    },
    autoMessage: stateModule.createDefaultAutoMessageSchedule(),
    autoMoment: stateModule.createDefaultAutoMomentSchedule(),
    autoEvent: stateModule.createDefaultAutoEventSchedule(),
    importedAt: Date.now(),
    ...extra,
  };
}

function resetFixture(config: LiveEvalConfig) {
  const modules = loadAppModules();
  const { stateModule } = modules;
  stateModule.replaceState(stateModule.defaultState());
  stateModule.state.userName = '用户';
  const world = stateModule.state.worlds[0];
  world.name = '现实世界';
  world.description = '一个贴近现实日常的小手机世界，角色会通过私聊、群聊、动态和生活线索自然出现。';
  world.userPersona = '长期使用 Tavern Social 和 OC 角色相处的用户，偏好自然短句和生活感。';
  world.location = {
    name: 'Shanghai',
    country: '中国',
    admin1: '上海',
    latitude: 31.2304,
    longitude: 121.4737,
    timezone: 'Asia/Shanghai',
  };
  world.weather = {
    temperatureC: 26,
    apparentTemperatureC: 27,
    relativeHumidity: 62,
    windSpeedKmh: 9,
    weatherText: '多云',
    isDay: true,
    observedAt: new Date().toISOString(),
    fetchedAt: Date.now(),
    source: 'open-meteo',
  };
  stateModule.state.modelConfig.apiUrl = config.apiUrl;
  stateModule.state.modelConfig.apiKey = config.apiKey;
  stateModule.state.modelConfig.model = config.model;
  stateModule.state.modelConfig.temperature = 0.72;

  const main = testCharacter(stateModule, 'prompt_eval_main', '林夏');
  const friend = testCharacter(stateModule, 'prompt_eval_friend', '周遥', {
    personality: '周遥接话很快，喜欢轻轻吐槽，但不会强行把话题拉回用户。',
  });
  const quiet = testCharacter(stateModule, 'prompt_eval_quiet', '许南', {
    personality: '许南话少，只有真的想接时才会说一句。',
  });
  stateModule.state.characters.push(main, friend, quiet);
  stateModule.state.activeCharacterId = main.id;

  const conversation = stateModule.ensureConversation(main);
  stateModule.state.messages.push({
    id: 'prompt_eval_memory_user',
    conversationId: conversation.id,
    characterId: main.id,
    role: 'user',
    content: 'PRIVATE_CHAT_LAST_USER_LINE_SHOULD_NOT_LEAK',
    createdAt: Date.now() - 120_000,
    source: 'user',
  });
  stateModule.state.characterStatuses.push({
    id: 'prompt_eval_status',
    worldId: main.worldId,
    characterId: main.id,
    mood: '还在等你回那句话',
    relationshipStage: main.relationship.stage,
    affinity: main.relationship.affinity,
    relationshipSummary: main.relationship.summary,
    recentMemoryTitles: ['海边散步'],
    unresolvedItems: ['海边散步的时间还没定下来'],
    nextInclination: '想先确认用户今晚状态',
    activeSources: [],
    summary: '这段关系里还有一句关于今晚安排的话没接上。',
    source: 'rule',
    updatedAt: Date.now() - 60_000,
  });
  stateModule.state.timelineEntries.push({
    id: 'prompt_eval_timeline',
    worldId: main.worldId,
    createdAt: Date.now() - 40_000,
    type: 'manual_note',
    characterIds: [main.id],
    characterNames: { [main.id]: main.name },
    title: '海边散步',
    summary: '两个人之前提过晚上去海边走走，但还没把时间定下来。',
    source: { type: 'manual', id: 'prompt_eval_timeline' },
    canUndo: false,
    includeInContext: true,
  });
  stateModule.state.dailyBriefs.push({
    id: 'prompt_eval_brief',
    worldId: main.worldId,
    dateKey: '2026-06-08',
    title: '今日简报',
    summary: '今天有一条和海边散步有关的未解决事项。',
    sections: ['林夏还记得海边散步这件小事。'],
    suggestedCharacterIds: [main.id],
    unreadCount: 0,
    changeCount: 1,
    createdAt: Date.now() - 30_000,
    updatedAt: Date.now() - 30_000,
  });
  return { ...modules, main, friend, quiet };
}

function latestContent(calls: CapturedModelCall[], target: import('./prompt-test-cases').PromptEvalTarget): string {
  return selectPrimaryOutput(calls, target);
}

async function runTarget(testCase: import('./prompt-test-cases').PromptEvalCase, config: LiveEvalConfig): Promise<string> {
  const calls: CapturedModelCall[] = [];
  const restoreFetch = installFetchCapture(calls);
  try {
    const fixture = resetFixture(config);
    const { stateModule, model, groupChat, moments, events, scheduler, main, friend, quiet } = fixture;
    if (testCase.target === 'private_chat') {
      const conversation = stateModule.ensureConversation(main);
      stateModule.state.messages.push({
        id: `prompt_eval_${testCase.id}`,
        conversationId: conversation.id,
        characterId: main.id,
        role: 'user',
        content: testCase.userInput ?? testCase.scenario,
        createdAt: Date.now(),
        source: 'user',
      });
      await model.callModel(main, '', true, true, undefined, { useChatPreset: true });
      return latestContent(calls, testCase.target);
    }

    if (testCase.target.startsWith('group_')) {
      const chat = groupChat.createGroupChat(`提示词体检群-${testCase.id}`, [main.id, friend.id, quiet.id]);
      groupChat.updateGroupChat(chat.id, { replyLiveliness: testCase.groupReplyLiveliness ?? 'lively' });
      if (testCase.target === 'group_active') {
        groupChat.updateGroupChat(chat.id, { allowModelInitiatedMessages: true });
        await groupChat.generateGroupReplyForLatest(chat.id, true, 'active');
        await groupChat.generateGroupReplyForLatest(chat.id, false, 'continue');
      } else if (testCase.target === 'group_continue' || testCase.id === 'group-reply-role-to-role') {
        groupChat.updateGroupChat(chat.id, { selectedSpeakerId: main.id });
        const first = groupChat.sendGroupUserMessage('我先在群里说一句，看看你们谁接。', chat.id);
        groupChat.updateGroupChat(chat.id, { selectedSpeakerId: friend.id });
        const second = groupChat.sendGroupUserMessage('我觉得这事有点好笑。', chat.id);
        await groupChat.generateGroupReplyForLatest(chat.id, false, testCase.target === 'group_continue' ? 'continue' : 'reply', second?.id ?? first?.id);
      } else {
        groupChat.updateGroupChat(chat.id, { selectedSpeakerId: 'user' });
        groupChat.sendGroupUserMessage(testCase.userInput ?? '这句看看谁想接。', chat.id);
        await groupChat.generateGroupReplyForLatest(chat.id);
      }
      return latestContent(calls, testCase.target);
    }

    if (testCase.target === 'moment_draft') {
      await moments.generateCharacterMomentDraft(main);
      return latestContent(calls, testCase.target);
    }

    if (testCase.target === 'moment_comment') {
      const moment = moments.publishMoment('今天路过便利店，突然想起有人说这里的关东煮还不错。', main, 'character');
      if (testCase.id === 'moment-user-selected-character-comment') {
        await moments.generateCharacterComment(moment, friend, { contextMessages: [] });
      } else {
        await moments.generateInterestedCharacterComment(moment, friend);
      }
      return latestContent(calls, testCase.target);
    }

    if (testCase.target === 'moment_author_reply') {
      const moment = moments.publishMoment('今天突然很想喝热的东西。', main, 'character');
      const comment = moments.addMomentComment(moment.id, '那你别又只喝冰的。', friend, 'model');
      await moments.generateAuthorReplyIfInterested(moment, main, comment.id, { contextMessages: [] });
      return latestContent(calls, testCase.target);
    }

    if (testCase.target === 'event_generate') {
      await model.callAuthoringModel(events.eventGenerationMessages(main, [main, friend]));
      return latestContent(calls, testCase.target);
    }

    if (testCase.target === 'event_outcome') {
      const event = events.createWorldEvent({
        title: '便利店排队',
        description: '林夏和周遥在便利店排队时短暂聊了几句。',
        participantCharacterIds: [main.id, friend.id],
        affinityDelta: 1,
        type: 'daily',
      });
      await model.callAuthoringModel(events.eventOutcomeMessages(event, event.choices[0]));
      return latestContent(calls, testCase.target);
    }

    if (testCase.target === 'proactive_message') {
      main.autoMessage.enabled = true;
      main.autoMessage.quietHours.enabled = false;
      main.autoMessage.nextAttemptAt = Date.now() - 1000;
      main.autoMessage.dailyLimit = 5;
      main.autoMessage.unansweredCount = testCase.id === 'proactive-unanswered-slowdown-natural' ? 3 : 0;
      main.autoMessage.pacingStrategy = '用户可编辑策略：如果用户连续没回复，主动消息要更轻、更短，不追问，不委屈，只像轻轻出现一下。';
      await scheduler.runAutoMessageCheckNow(() => {});
      return latestContent(calls, testCase.target);
    }

    throw new Error(`未支持的提示词体检目标：${testCase.target}`);
  } finally {
    restoreFetch();
  }
}

async function chatCompletion(config: LiveEvalConfig, messages: ModelMessage[], modelName: string): Promise<string> {
  const response = await fetch(normalizeChatCompletionsUrl(config.apiUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: modelName,
      messages,
      temperature: 0.2,
      stream: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`评审模型请求失败：${response.status} ${text.slice(0, 180)}`);
  }
  return contentFromResponseText(await response.text());
}

async function evaluateCase(
  testCase: import('./prompt-test-cases').PromptEvalCase,
  config: LiveEvalConfig,
): Promise<import('./prompt-test-cases').PromptEvalResult> {
  const started = Date.now();
  try {
    const rawOutput = await runTarget(testCase, config);
    const hardRuleResult = promptSuite.evaluateHardRules(testCase, rawOutput);
    const judgeRaw = await chatCompletion(config, buildJudgePrompt(testCase, rawOutput), config.judgeModel);
    const judge = promptSuite.parseJudgeEvaluation(judgeRaw);
    return {
      case: testCase,
      rawOutput,
      hardRuleResult,
      judge,
      passed: hardRuleResult.passed && judge.pass,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      case: testCase,
      rawOutput: '',
      hardRuleResult: { passed: false, failures: [{ code: 'runtime_error', message }] },
      judge: {
        score: 0,
        pass: false,
        problems: ['runtime_error'],
        suggestions: ['检查模型配置、网络或该病例运行路径。'],
        reason: message,
      },
      passed: false,
      durationMs: Date.now() - started,
      error: message,
    };
  }
}

async function runLiveEval(): Promise<void> {
  const missing = missingLiveEvalConfig();
  if (missing.length > 0) {
    throw new Error(`缺少环境变量：${missing.join(', ')}。请先设置 PROMPT_TEST_API_URL、PROMPT_TEST_API_KEY、PROMPT_TEST_MODEL。`);
  }
  const config: LiveEvalConfig = {
    apiUrl: process.env.PROMPT_TEST_API_URL!.trim(),
    apiKey: process.env.PROMPT_TEST_API_KEY!.trim(),
    model: process.env.PROMPT_TEST_MODEL!.trim(),
    judgeModel: (process.env.PROMPT_TEST_JUDGE_MODEL || process.env.PROMPT_TEST_MODEL)!.trim(),
  };
  const started = Date.now();
  const startedAt = new Date(started).toISOString();
  const results: import('./prompt-test-cases').PromptEvalResult[] = [];
  for (const testCase of promptSuite.PROMPT_EVAL_CASES) {
    console.log(`Running ${testCase.id}...`);
    results.push(await evaluateCase(testCase, config));
  }
  const durationMs = Date.now() - started;
  const report = promptSuite.renderPromptEvalReport(results, {
    model: config.model,
    judgeModel: config.judgeModel,
    startedAt,
    durationMs,
  });
  const outputRoot = path.join(process.cwd(), 'prompt-test-runs', promptSuite.safeFileNameTimestamp(new Date(started)));
  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(path.join(outputRoot, 'report.md'), report, 'utf8');
  fs.writeFileSync(path.join(outputRoot, 'result.json'), JSON.stringify({
    meta: {
      model: config.model,
      judgeModel: config.judgeModel,
      startedAt,
      durationMs,
    },
    results,
  }, null, 2), 'utf8');
  const failed = results.filter(result => !result.passed).length;
  console.log(`Prompt eval complete: ${results.length - failed}/${results.length} passed.`);
  console.log(`Report: ${path.join(outputRoot, 'report.md')}`);
  if (failed > 0) process.exitCode = 1;
}

if (require.main === module) {
  runLiveEval().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
