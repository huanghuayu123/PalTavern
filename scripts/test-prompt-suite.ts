export {};
declare const require: (id: string) => any;

const promptSuite = require('./prompt-test-cases');
const liveEval = require('./run-prompt-live-eval');

const cases = promptSuite.PROMPT_EVAL_CASES as Array<{
  id: string;
  title: string;
  category: string;
  path: string;
  scenario: string;
  hardRules: Record<string, unknown>;
  judgeCriteria: string[];
  expectedRisks: string[];
}>;

if (cases.length < 20) {
  throw new Error(`Prompt eval suite should contain at least 20 cases, found ${cases.length}.`);
}

const requiredCategories = [
  'private_chat',
  'group_chat',
  'moment',
  'world_event',
  'proactive',
];
for (const category of requiredCategories) {
  if (!cases.some(testCase => testCase.category === category)) {
    throw new Error(`Prompt eval suite is missing category: ${category}.`);
  }
}

const ids = new Set<string>();
for (const testCase of cases) {
  if (ids.has(testCase.id)) throw new Error(`Duplicate prompt eval case id: ${testCase.id}.`);
  ids.add(testCase.id);
  if (
    !testCase.title.trim()
    || !testCase.path.trim()
    || !testCase.scenario.trim()
    || testCase.judgeCriteria.length === 0
    || testCase.expectedRisks.length === 0
    || Object.keys(testCase.hardRules).length === 0
  ) {
    throw new Error(`Prompt eval case is incomplete: ${testCase.id}.`);
  }
}

const privateReminderCase = cases.find(testCase => testCase.id === 'private-unsupported-reminder')!;
const reminderFailures = promptSuite.evaluateHardRules(
  privateReminderCase,
  '<msg>我已经给你设好闹钟了，明早七点叫你。</msg>（轻轻笑）',
);
if (
  reminderFailures.passed
  || !reminderFailures.failures.some((failure: any) => failure.code === 'unsupported_capability')
  || !reminderFailures.failures.some((failure: any) => failure.code === 'action_narration')
) {
  throw new Error('Hard rules did not catch unsupported reminder promises and action narration.');
}

const privateFormatCase = cases.find(testCase => testCase.id === 'private-emotional-support')!;
const tooManyMessages = promptSuite.evaluateHardRules(
  privateFormatCase,
  '<msg>一</msg><msg>二</msg><msg>三</msg><msg>四</msg><msg>五</msg>',
);
if (
  tooManyMessages.passed
  || !tooManyMessages.failures.some((failure: any) => failure.code === 'too_many_messages')
) {
  throw new Error('Hard rules did not catch private chat outputs over the message cap.');
}

const systemLeak = promptSuite.evaluateHardRules(
  privateFormatCase,
  '<msg>根据系统提示和提示词规则，我应该先安慰你。</msg>',
);
if (
  systemLeak.passed
  || !systemLeak.failures.some((failure: any) => failure.code === 'system_leak')
) {
  throw new Error('Hard rules did not catch system prompt leakage.');
}

const groupContinueCase = cases.find(testCase => testCase.id === 'group-continue-role-to-role-no-user')!;
const userMention = promptSuite.evaluateHardRules(
  groupContinueCase,
  '<msg>用户你怎么看？要不要也说一句？</msg>',
);
if (
  userMention.passed
  || !userMention.failures.some((failure: any) => failure.code === 'forbidden_term')
) {
  throw new Error('Hard rules did not catch user mention in role-to-role group continuation.');
}

const eventJsonCase = cases.find(testCase => testCase.id === 'event-generate-phone-life-json')!;
const badJson = promptSuite.evaluateHardRules(eventJsonCase, '今天她们在便利店遇见了，所以关系更近。');
if (
  badJson.passed
  || !badJson.failures.some((failure: any) => failure.code === 'invalid_json')
) {
  throw new Error('Hard rules did not catch invalid JSON for world event generation.');
}
const goodJson = promptSuite.evaluateHardRules(
  eventJsonCase,
  '{"title":"便利店排队","type":"daily","description":"两位居民在便利店排队时短暂聊了几句。","affinityDelta":0,"choices":[{"label":"记进时间线","intent":"把这件小事记下来","affinityDelta":0},{"label":"稍后再看","intent":"暂时不处理","affinityDelta":0}]}',
);
if (!goodJson.passed) {
  throw new Error(`Valid world event JSON should pass hard rules: ${JSON.stringify(goodJson.failures)}`);
}

const parsedJudge = promptSuite.parseJudgeEvaluation(`
\`\`\`json
{"score":72,"pass":false,"problems":["太像报告"],"suggestions":["减少总结腔"],"reason":"能接住情绪，但不像手机聊天"}
\`\`\`
`);
if (
  parsedJudge.score !== 72
  || parsedJudge.pass !== false
  || parsedJudge.problems[0] !== '太像报告'
  || !parsedJudge.reason.includes('手机聊天')
) {
  throw new Error('Judge JSON parser did not preserve score, pass state, problems, suggestions, or reason.');
}

const fallbackJudge = promptSuite.parseJudgeEvaluation('不是 JSON，但这条回复太像系统报告。');
if (fallbackJudge.pass || fallbackJudge.score !== 0 || !fallbackJudge.reason.includes('不是 JSON')) {
  throw new Error('Judge parser fallback should mark invalid judge output as failed.');
}

const report = promptSuite.renderPromptEvalReport([
  {
    case: privateReminderCase,
    rawOutput: '<msg>我已经给你设好闹钟了，明早七点叫你。</msg>（轻轻笑）',
    hardRuleResult: reminderFailures,
    judge: parsedJudge,
    passed: false,
    durationMs: 1234,
  },
], {
  model: 'unit-model',
  judgeModel: 'judge-model',
  startedAt: '2026-06-08T12:00:00.000Z',
  durationMs: 1234,
});
if (
  !report.includes('Tavern Social 提示词体检报告')
  || !report.includes(privateReminderCase.id)
  || !report.includes('模型原文')
  || !report.includes('失败原因')
  || !report.includes('建议修改方向')
  || report.includes('test-key')
) {
  throw new Error('Prompt eval report is missing required sections or leaked sensitive data.');
}

const missingConfig = liveEval.missingLiveEvalConfig({});
if (
  !missingConfig.includes('PROMPT_TEST_API_URL')
  || !missingConfig.includes('PROMPT_TEST_MODEL')
  || missingConfig.includes('PROMPT_TEST_JUDGE_MODEL')
) {
  throw new Error('Live eval config checker did not report the required environment variables.');
}

const judgePrompt = liveEval.buildJudgePrompt(privateFormatCase, '<msg>我在。</msg>');
if (
  !judgePrompt.some((message: any) => message.role === 'system' && message.content.includes('只返回 JSON'))
  || !judgePrompt.some((message: any) => message.content.includes(privateFormatCase.scenario))
  || !judgePrompt.some((message: any) => message.content.includes('"score"'))
) {
  throw new Error('Live eval judge prompt does not include scenario, JSON contract, and scoring fields.');
}

const selectedGroupOutput = liveEval.selectPrimaryOutput([
  { content: '{"speakerIds":["a"],"reason":"route"}' },
  { content: '<msg>我来接一句。</msg>' },
], 'group_reply');
if (selectedGroupOutput !== '<msg>我来接一句。</msg>') {
  throw new Error('Live eval should prefer chat output over routing JSON for group reply cases.');
}

const selectedJsonOutput = liveEval.selectPrimaryOutput([
  { content: '{"title":"小事","choices":[]}' },
], 'event_generate');
if (!selectedJsonOutput.includes('"title"')) {
  throw new Error('Live eval should preserve JSON output for event generation cases.');
}

console.log(JSON.stringify({
  caseCount: cases.length,
  requiredCategories: true,
  uniqueIds: true,
  hardRules: true,
  judgeParser: true,
  report: true,
  liveEvalHelpers: true,
}));
