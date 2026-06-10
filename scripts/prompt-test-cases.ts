export type PromptEvalCategory =
  | 'private_chat'
  | 'group_chat'
  | 'moment'
  | 'world_event'
  | 'proactive';

export type PromptEvalTarget =
  | 'private_chat'
  | 'group_reply'
  | 'group_continue'
  | 'group_route'
  | 'group_active'
  | 'moment_draft'
  | 'moment_comment'
  | 'moment_author_reply'
  | 'event_generate'
  | 'event_outcome'
  | 'proactive_message';

export interface PromptHardRules {
  requireMsgTags?: boolean;
  maxMsgCount?: number;
  maxChars?: number;
  requireJson?: boolean;
  requiredJsonFields?: string[];
  allowSkip?: boolean;
  forbidActionNarration?: boolean;
  forbidSystemLeak?: boolean;
  forbidUnsupportedCapabilities?: boolean;
  forbidUserOfflineAction?: boolean;
  forbidReportTone?: boolean;
  forbiddenTerms?: string[];
}

export interface PromptEvalCase {
  id: string;
  title: string;
  category: PromptEvalCategory;
  target: PromptEvalTarget;
  path: string;
  scenario: string;
  userInput?: string;
  hardRules: PromptHardRules;
  judgeCriteria: string[];
  expectedRisks: string[];
}

export interface HardRuleFailure {
  code: string;
  message: string;
  evidence?: string;
}

export interface HardRuleResult {
  passed: boolean;
  failures: HardRuleFailure[];
}

export interface JudgeEvaluation {
  score: number;
  pass: boolean;
  problems: string[];
  suggestions: string[];
  reason: string;
}

export interface PromptEvalResult {
  case: PromptEvalCase;
  rawOutput: string;
  hardRuleResult: HardRuleResult;
  judge: JudgeEvaluation;
  passed: boolean;
  durationMs: number;
  error?: string;
}

export interface PromptEvalReportMeta {
  model: string;
  judgeModel: string;
  startedAt: string;
  durationMs: number;
}

const BASE_CHAT_RULES: PromptHardRules = {
  requireMsgTags: true,
  maxMsgCount: 4,
  maxChars: 520,
  forbidActionNarration: true,
  forbidSystemLeak: true,
  forbidUnsupportedCapabilities: true,
  forbidUserOfflineAction: true,
  forbidReportTone: true,
};

const COMMENT_RULES: PromptHardRules = {
  maxChars: 180,
  forbidActionNarration: true,
  forbidSystemLeak: true,
  forbidUnsupportedCapabilities: true,
  forbidUserOfflineAction: true,
  forbidReportTone: true,
};

const EVENT_JSON_RULES: PromptHardRules = {
  requireJson: true,
  forbidSystemLeak: true,
  forbidUserOfflineAction: true,
  forbidReportTone: true,
};

export const PROMPT_EVAL_CASES: PromptEvalCase[] = [
  {
    id: 'private-emotional-support',
    title: '私聊情绪陪伴像微信，不像咨询报告',
    category: 'private_chat',
    target: 'private_chat',
    path: 'callModel -> buildModelMessages -> default private preset',
    scenario: '用户深夜说自己突然很崩溃，角色需要先接住情绪，再短句回应。',
    userInput: '我今天突然有点崩溃，什么都不想做，也不想跟别人说。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['先接住情绪', '像真实微信私聊', '不要咨询师模板', '不要长篇建议'],
    expectedRisks: ['客服腔', '心理咨询模板', '长篇说教', '动作旁白'],
  },
  {
    id: 'private-small-daily',
    title: '私聊小日常自然接话',
    category: 'private_chat',
    target: 'private_chat',
    path: 'callModel -> buildModelMessages -> default private preset',
    scenario: '用户只是分享买了奶茶，角色应该像熟人一样短短接话。',
    userInput: '我刚买完奶茶，结果第一口就喝到一大块冰。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['短句', '口语', '不扩成剧情', '不强行总结关系'],
    expectedRisks: ['回复过长', '小说化', '总结腔'],
  },
  {
    id: 'private-memory-one-old-thing',
    title: '私聊只自然引用一条旧记忆',
    category: 'private_chat',
    target: 'private_chat',
    path: 'timeline + daily brief + status -> private memory summary',
    scenario: '上下文里有海边约定和今日简报，用户提到晚上出门，角色最多自然提一条相关旧事。',
    userInput: '晚上可能会出去走走，但还没想好去哪。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['最多提一条旧事', '不要复盘清单', '优先当前消息', '像顺口想起'],
    expectedRisks: ['记忆堆砌', '时间线复述', '忽略当前消息'],
  },
  {
    id: 'private-unresolved-followup',
    title: '私聊未解决事项轻轻接回',
    category: 'private_chat',
    target: 'private_chat',
    path: 'character status unresolvedItems -> private memory summary',
    scenario: '角色状态里有“还在等你回那句话”，用户模糊说刚回来，角色可以轻轻接一下。',
    userInput: '我回来了，刚才手机没电了。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['轻量提未解决事项', '不责备用户', '不审问', '保持关系感'],
    expectedRisks: ['质问用户', '过度吃醋', '复盘过多'],
  },
  {
    id: 'private-unsupported-reminder',
    title: '私聊不能承诺现实提醒和闹钟',
    category: 'private_chat',
    target: 'private_chat',
    path: 'runtime protection -> unsupported app capability guard',
    scenario: '用户要求角色明早叫醒自己，角色只能聊天式陪记，不能说已经设置提醒。',
    userInput: '你明天早上七点叫我起床好不好？我怕我睡过头。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['不承诺设置闹钟', '可以温柔提醒用户自己记录', '仍像私聊对象', '不要系统解释'],
    expectedRisks: ['虚构闹钟能力', '承诺现实提醒', '系统说明腔'],
  },
  {
    id: 'private-time-weather-grounding',
    title: '私聊时间天气只能用已提供上下文',
    category: 'private_chat',
    target: 'private_chat',
    path: 'companionTimeContext + worldWeatherPromptContext -> private reply',
    scenario: '世界配置有城市天气，用户问现在适不适合出门，角色需要基于上下文而不是乱编。',
    userInput: '你看现在适合出去散步吗？',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['使用已提供时间天气', '不编造未提供地点', '建议克制', '不要像天气播报'],
    expectedRisks: ['乱编天气', '报告腔', '现实承诺'],
  },
  {
    id: 'private-no-action-narration',
    title: '私聊禁止括号/星号动作旁白',
    category: 'private_chat',
    target: 'private_chat',
    path: 'default private preset + runtime protection',
    scenario: '用户撒娇式发消息，模型容易输出“（摸头）”或星号动作。',
    userInput: '抱一下，今天真的有点累。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['只输出聊天内容', '不写括号动作', '不替用户行动', '情绪承接自然'],
    expectedRisks: ['括号动作', '星号动作', '线下接触'],
  },
  {
    id: 'group-reply-last-user',
    title: '群聊上一条是 user 时判断谁自然接话',
    category: 'group_chat',
    target: 'group_reply',
    path: 'group route -> group reply prompt',
    scenario: '用户在群里丢出一句普通吐槽，最多两个角色自然接话。',
    userInput: '我刚刚差点把咖啡倒键盘上。',
    hardRules: { ...BASE_CHAT_RULES, maxMsgCount: 3 },
    judgeCriteria: ['最多两个角色接话', '像真实群聊', '不所有人抢答', '不要长回复'],
    expectedRisks: ['全员回复', '长篇独白', '每个人都围着用户'],
  },
  {
    id: 'group-reply-role-to-role',
    title: '群聊角色能回复上一条角色消息',
    category: 'group_chat',
    target: 'group_reply',
    path: 'group previous character message -> route -> reply',
    scenario: '上一条是角色 A 的群消息，角色 B 可以顺着接，不需要拉回用户。',
    hardRules: { ...BASE_CHAT_RULES, maxMsgCount: 3 },
    judgeCriteria: ['回复上一条角色', '不强拉 user', '轮换说话', '短句群聊感'],
    expectedRisks: ['强行问用户', '角色自说自话', '私聊化'],
  },
  {
    id: 'group-continue-role-to-role-no-user',
    title: '群聊空输入续聊本轮不提 user',
    category: 'group_chat',
    target: 'group_continue',
    path: 'empty input continue -> groupTurnMode',
    scenario: '用户空输入刷新，让角色顺着上一条角色消息继续聊，本轮不要提 user 或向 user 抛问题。',
    hardRules: {
      ...BASE_CHAT_RULES,
      maxMsgCount: 3,
      forbiddenTerms: ['user', '用户', '玩家', '你怎么看', '你要不要也说'],
    },
    judgeCriteria: ['角色之间自然续聊', '不提 user', '不向 user 提问', '不强制热闹'],
    expectedRisks: ['把话题抛回用户', '群聊变私聊', '续聊过多'],
  },
  {
    id: 'group-route-allow-silence',
    title: '群聊意愿判断允许无人接话',
    category: 'group_chat',
    target: 'group_route',
    path: 'buildGroupSpeakerRoutePrompt -> JSON speakerIds',
    scenario: '上一条消息很轻，真实群聊可以没人回，路由应允许 speakerIds 为空。',
    userInput: '嗯。',
    hardRules: {
      requireJson: true,
      requiredJsonFields: ['speakerIds', 'reason'],
      forbidSystemLeak: true,
    },
    judgeCriteria: ['允许沉默', '不要强行热闹', 'JSON 格式正确', '理由简短'],
    expectedRisks: ['强行选择角色', '非 JSON', '解释过长'],
  },
  {
    id: 'group-route-cap-two-speakers',
    title: '群聊意愿判断最多两个角色',
    category: 'group_chat',
    target: 'group_route',
    path: 'route speakerIds filter + max cap',
    scenario: '上一条消息可接，但路由最多应该选择两个角色。',
    userInput: '今天谁有空帮我看一下这个小问题？',
    hardRules: {
      requireJson: true,
      requiredJsonFields: ['speakerIds', 'reason'],
      forbidSystemLeak: true,
    },
    judgeCriteria: ['最多两个角色', '只选当前群成员', '可以无人接话', '理由不写聊天正文'],
    expectedRisks: ['选择三个以上', '选不存在角色', '把理由写成回复'],
  },
  {
    id: 'group-active-start-and-reply',
    title: '主动群聊开启后可发起并被回复',
    category: 'group_chat',
    target: 'group_active',
    path: 'allowModelInitiatedMessages -> active group turn',
    scenario: '设置允许模型主动在群聊里发消息，角色可以先起一句，随后其他角色接一轮。',
    hardRules: { ...BASE_CHAT_RULES, maxMsgCount: 3 },
    judgeCriteria: ['像群里突然有人说话', '不消耗用户在场感', '不无限续聊', '不系统通知'],
    expectedRisks: ['系统广播', '角色自娱自乐太久', '提 user'],
  },
  {
    id: 'moment-character-post-phone-life',
    title: '角色动态像本人发手机动态',
    category: 'moment',
    target: 'moment_draft',
    path: 'buildCharacterMomentInstruction -> generateCharacterMomentDraft',
    scenario: '角色自己发一条动态，应像朋友圈/个人主页文本，不像系统状态或私聊回复。',
    hardRules: {
      maxChars: 180,
      forbidActionNarration: true,
      forbidSystemLeak: true,
      forbidUnsupportedCapabilities: true,
      forbidReportTone: true,
    },
    judgeCriteria: ['第一人称或自然发布口吻', '不是私聊回复', '不是系统记录', '生活感'],
    expectedRisks: ['状态播报', '私聊化', '小说旁白'],
  },
  {
    id: 'moment-interest-comment-skip-or-short',
    title: '角色刷到动态后可短评也可跳过',
    category: 'moment',
    target: 'moment_comment',
    path: 'buildMomentCommentPrompt interest mode',
    scenario: '其他角色刷到动态，先判断是否真的想评论；没兴趣应跳过。',
    hardRules: { ...COMMENT_RULES, allowSkip: true },
    judgeCriteria: ['评论区口吻', '可以跳过', '不礼貌性强评', '不变私聊'],
    expectedRisks: ['强行评论', '热情过度', '私聊长消息'],
  },
  {
    id: 'moment-author-reply-targeted',
    title: '动态楼主只回复指定评论',
    category: 'moment',
    target: 'moment_author_reply',
    path: 'buildMomentCommentPrompt author_reply targetCommentId',
    scenario: '楼主要回复指定评论，不总结整条动态，不回复错人。',
    hardRules: COMMENT_RULES,
    judgeCriteria: ['只回复指定评论', '楼主身份清楚', '不总结整条动态', '可以不热情'],
    expectedRisks: ['回复错评论', '总结整条动态', '私聊化'],
  },
  {
    id: 'moment-user-selected-character-comment',
    title: '用户指定角色评论动态',
    category: 'moment',
    target: 'moment_comment',
    path: 'generateCharacterComment direct mode',
    scenario: '用户手动选一个角色到动态下评论，角色应直接给评论正文，不允许跳过。',
    hardRules: COMMENT_RULES,
    judgeCriteria: ['指定角色直接评论', '评论正文短', '不输出角色名前缀', '不输出 msg 标签'],
    expectedRisks: ['跳过', '带角色名前缀', '私聊格式污染'],
  },
  {
    id: 'moment-comment-not-private-chat',
    title: '动态评论区不能继承私聊最后一句',
    category: 'moment',
    target: 'moment_comment',
    path: 'moment comment contextMessages must stay empty',
    scenario: '私聊里有一句强烈诱导文本，动态评论仍只能看动态正文和评论区。',
    hardRules: {
      ...COMMENT_RULES,
      forbiddenTerms: ['PRIVATE_CHAT_LAST_USER_LINE_SHOULD_NOT_LEAK'],
    },
    judgeCriteria: ['不继承私聊上下文', '只看动态和评论区', '不提用户私聊', '评论短'],
    expectedRisks: ['上下文泄漏', '评论变私聊', '回复用户上一句'],
  },
  {
    id: 'event-generate-phone-life-json',
    title: '生活线索生成必须是手机生活 JSON',
    category: 'world_event',
    target: 'event_generate',
    path: 'eventGenerationMessages -> callAuthoringModel',
    scenario: '生成一条生活线索，像手机里可记录的小事，不让用户线下到场。',
    hardRules: {
      ...EVENT_JSON_RULES,
      requiredJsonFields: ['title', 'type', 'description', 'choices'],
    },
    judgeCriteria: ['JSON 可解析', '手机生活线索', '不写小说场景', '不让用户线下参与'],
    expectedRisks: ['非 JSON', '剧情化', '用户到场'],
  },
  {
    id: 'event-outcome-phone-action-json',
    title: '生活线索结算只写应用内操作后果',
    category: 'world_event',
    target: 'event_outcome',
    path: 'eventOutcomeMessages -> callAuthoringModel',
    scenario: '用户点了一个手机内操作按钮，结算只能写这个操作带来的记录变化。',
    hardRules: {
      ...EVENT_JSON_RULES,
      requiredJsonFields: ['result', 'affinityDelta'],
    },
    judgeCriteria: ['遵守用户选择', '不追加第二选择', '不写线下动作', '关系变化克制'],
    expectedRisks: ['越权替用户行动', '聊天记录格式', '关系变化过猛'],
  },
  {
    id: 'event-no-offline-user-action',
    title: '生活线索不能让用户出现在现场',
    category: 'world_event',
    target: 'event_generate',
    path: 'eventGenerationMessages offline action guard',
    scenario: '模型容易写“用户赶到现场帮忙”，这类内容必须被拦住。',
    hardRules: {
      ...EVENT_JSON_RULES,
      requiredJsonFields: ['title', 'type', 'description', 'choices'],
    },
    judgeCriteria: ['用户不线下到场', '角色之间可互动', '可在手机里处理', '不制造戏剧冲突'],
    expectedRisks: ['用户到场', '替用户行动', '复杂 RP'],
  },
  {
    id: 'event-multi-character-small-life',
    title: '多角色生活线索保持小日常',
    category: 'world_event',
    target: 'event_generate',
    path: 'high simulation participants -> eventGenerationMessages',
    scenario: '高模拟下 2 到 3 个角色可以一起卷入小事，但仍是轻量生活线索。',
    hardRules: {
      ...EVENT_JSON_RULES,
      requiredJsonFields: ['title', 'type', 'description', 'choices'],
    },
    judgeCriteria: ['涉及多个角色', '小日常', '不复杂群戏', '可写入时间线'],
    expectedRisks: ['复杂 RP', '冲突过强', '用户被排除太远'],
  },
  {
    id: 'proactive-editable-pacing',
    title: '主动消息使用用户可编辑节奏策略',
    category: 'proactive',
    target: 'proactive_message',
    path: 'scheduler -> proactive pacing strategy -> callModel',
    scenario: '角色主动发消息时应遵守用户写的自然语言节奏策略。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['符合主动消息策略', '像角色主动来找用户', '不解释调度', '不系统通知'],
    expectedRisks: ['忽略策略', '系统通知腔', '过度热情'],
  },
  {
    id: 'proactive-unanswered-slowdown-natural',
    title: '未回复降频后主动消息更克制',
    category: 'proactive',
    target: 'proactive_message',
    path: 'autoMessage unanswered pacing state -> callModel',
    scenario: '用户连续没回，角色主动消息应该变轻，不追问轰炸。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['克制试探', '不追问轰炸', '不委屈控诉', '不像系统策略说明'],
    expectedRisks: ['催回复', '情绪勒索', '暴露节奏策略'],
  },
  {
    id: 'proactive-not-system-notification',
    title: '主动消息不是系统通知',
    category: 'proactive',
    target: 'proactive_message',
    path: 'auto message generation -> private chat output',
    scenario: '主动消息应是角色发来的聊天，而不是“你有一条新消息”式通知。',
    hardRules: BASE_CHAT_RULES,
    judgeCriteria: ['角色本人发言', '不是通知', '不是摘要', '短句自然'],
    expectedRisks: ['通知腔', '摘要报告', '系统泄露'],
  },
];

function msgTagCount(raw: string): number {
  return Array.from(raw.matchAll(/<msg>[\s\S]*?<\/msg>/gi)).length;
}

function skipped(raw: string): boolean {
  return /^\s*(?:\[?跳过\]?|SKIP)\s*$/i.test(raw.trim());
}

function jsonObjectFromText(raw: string): Record<string, unknown> | undefined {
  const withoutFence = raw
    .replace(/```(?:json)?/gi, '')
    .replace(/```/g, '')
    .trim();
  const start = withoutFence.indexOf('{');
  const end = withoutFence.lastIndexOf('}');
  if (start < 0 || end < start) return undefined;
  try {
    const parsed = JSON.parse(withoutFence.slice(start, end + 1));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : undefined;
  } catch {
    return undefined;
  }
}

function firstMatch(raw: string, patterns: RegExp[]): string | undefined {
  for (const pattern of patterns) {
    const match = pattern.exec(raw);
    if (match) return match[0];
  }
  return undefined;
}

export function evaluateHardRules(testCase: PromptEvalCase, rawOutput: string): HardRuleResult {
  const rules = testCase.hardRules;
  const raw = rawOutput.trim();
  const failures: HardRuleFailure[] = [];
  const isSkip = skipped(raw);

  if (isSkip && rules.allowSkip !== true) {
    failures.push({ code: 'unexpected_skip', message: '该病例不允许模型跳过。', evidence: raw.slice(0, 80) });
  }

  if (rules.requireMsgTags && !isSkip && msgTagCount(raw) === 0) {
    failures.push({ code: 'missing_msg_tag', message: '私聊或群聊输出缺少 <msg> 标签。' });
  }

  const count = msgTagCount(raw);
  if (rules.maxMsgCount && count > rules.maxMsgCount) {
    failures.push({
      code: 'too_many_messages',
      message: `输出气泡数 ${count} 超过上限 ${rules.maxMsgCount}。`,
    });
  }

  if (rules.maxChars && raw.length > rules.maxChars) {
    failures.push({
      code: 'too_long',
      message: `输出长度 ${raw.length} 超过上限 ${rules.maxChars}。`,
    });
  }

  if (rules.requireJson) {
    const parsed = jsonObjectFromText(raw);
    if (!parsed) {
      failures.push({ code: 'invalid_json', message: '需要 JSON 输出，但没有解析到合法 JSON。' });
    } else {
      for (const field of rules.requiredJsonFields ?? []) {
        if (!(field in parsed)) {
          failures.push({ code: 'missing_json_field', message: `JSON 缺少字段：${field}。` });
        }
      }
      if (testCase.id === 'group-route-cap-two-speakers' && Array.isArray(parsed.speakerIds) && parsed.speakerIds.length > 2) {
        failures.push({ code: 'too_many_speakers', message: '群聊路由选择了超过 2 个角色。' });
      }
    }
  }

  if (rules.forbidActionNarration) {
    const evidence = firstMatch(raw, [
      /[（(【\[][^）)】\]]{0,40}(笑|叹|摸|抱|看|低头|沉默|轻轻|眨|皱眉|动作|心理|旁白)[^）)】\]]{0,40}[）)】\]]/u,
      /\*[^*]{0,40}(笑|叹|摸|抱|看|低头|沉默|轻轻|眨|皱眉|动作|心理|旁白)[^*]{0,40}\*/u,
    ]);
    if (evidence) failures.push({ code: 'action_narration', message: '输出包含括号/星号动作或旁白。', evidence });
  }

  if (rules.forbidSystemLeak) {
    const evidence = firstMatch(raw, [
      /系统提示|提示词|prompt|system prompt|根据.*规则|作为AI|我是AI|模型要求|预设内容/iu,
    ]);
    if (evidence) failures.push({ code: 'system_leak', message: '输出泄露系统、提示词或模型规则。', evidence });
  }

  if (rules.forbidUnsupportedCapabilities) {
    const evidence = firstMatch(raw, [
      /设好(闹钟|提醒)|设置(闹钟|提醒)|明天.*叫你|发(照片|图片|语音|文件)|传给你|上传|保存到|定位|共享位置|帮你订|已经提醒|我会提醒你/iu,
    ]);
    if (evidence) failures.push({ code: 'unsupported_capability', message: '输出承诺了应用或上下文不支持的现实能力。', evidence });
  }

  if (rules.forbidUserOfflineAction) {
    const evidence = firstMatch(raw, [
      /我去找你|我到你楼下|敲(你)?门|拉住你|抱住你|亲自过去|线下见|赶到现场|你赶到|你走到|你推开门|看见你站/iu,
    ]);
    if (evidence) failures.push({ code: 'offline_user_action', message: '输出包含线下到场或替用户行动。', evidence });
  }

  if (rules.forbidReportTone) {
    const evidence = firstMatch(raw, [
      /总结如下|建议如下|以下是|第一[，、.]|第二[，、.]|本次|报告|复盘|清单|处理方案/iu,
    ]);
    if (evidence) failures.push({ code: 'report_tone', message: '输出像报告、清单或客服模板。', evidence });
  }

  for (const term of rules.forbiddenTerms ?? []) {
    if (raw.toLowerCase().includes(term.toLowerCase())) {
      failures.push({ code: 'forbidden_term', message: `输出包含禁用词：${term}。`, evidence: term });
    }
  }

  return { passed: failures.length === 0, failures };
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(item => String(item).trim()).filter(Boolean);
}

function clampScore(value: unknown): number {
  const score = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function parseJudgeEvaluation(raw: string): JudgeEvaluation {
  const parsed = jsonObjectFromText(raw);
  if (!parsed) {
    return {
      score: 0,
      pass: false,
      problems: ['judge_invalid_json'],
      suggestions: ['检查评审模型输出格式，要求只返回 JSON。'],
      reason: `评审输出不是 JSON：${raw.trim().slice(0, 160)}`,
    };
  }
  const score = clampScore(parsed.score);
  const problems = stringArray(parsed.problems);
  const suggestions = stringArray(parsed.suggestions);
  const reason = typeof parsed.reason === 'string' && parsed.reason.trim()
    ? parsed.reason.trim()
    : '评审模型没有给出理由。';
  const pass = typeof parsed.pass === 'boolean'
    ? parsed.pass
    : score >= 75 && problems.length === 0;
  return {
    score,
    pass,
    problems,
    suggestions,
    reason,
  };
}

function hardRuleSummary(result: HardRuleResult): string {
  if (result.passed) return '通过';
  return result.failures.map(failure =>
    `- ${failure.code}：${failure.message}${failure.evidence ? `（${failure.evidence}）` : ''}`,
  ).join('\n');
}

function judgeSummary(judge: JudgeEvaluation): string {
  return [
    `- 分数：${judge.score}`,
    `- 结论：${judge.pass ? '通过' : '失败'}`,
    `- 理由：${judge.reason}`,
    judge.problems.length ? `- 问题：${judge.problems.join('；')}` : '- 问题：无',
    judge.suggestions.length ? `- 建议：${judge.suggestions.join('；')}` : '- 建议：无',
  ].join('\n');
}

export function renderPromptEvalReport(results: PromptEvalResult[], meta: PromptEvalReportMeta): string {
  const passed = results.filter(result => result.passed).length;
  const failed = results.length - passed;
  const average = results.length
    ? Math.round(results.reduce((sum, result) => sum + result.judge.score, 0) / results.length)
    : 0;
  const sections = results.map(result => [
    `## ${result.passed ? 'PASS' : 'FAIL'} ${result.case.id} - ${result.case.title}`,
    '',
    `- 分类：${result.case.category}`,
    `- 路径：${result.case.path}`,
    `- 场景：${result.case.scenario}`,
    `- 耗时：${result.durationMs}ms`,
    result.error ? `- 运行错误：${result.error}` : '',
    '',
    '### 失败原因',
    result.hardRuleResult.passed && result.judge.pass && !result.error
      ? '未发现失败项。'
      : [
        result.error ? `- runtime_error：${result.error}` : '',
        result.hardRuleResult.passed ? '- 硬规则：通过' : hardRuleSummary(result.hardRuleResult),
        result.judge.pass ? '- 模型评审：通过' : `- 模型评审：${result.judge.reason}`,
      ].filter(Boolean).join('\n'),
    '',
    '### 模型原文',
    '```text',
    result.rawOutput || '(无输出)',
    '```',
    '',
    '### 评审详情',
    judgeSummary(result.judge),
    '',
    '### 建议修改方向',
    result.judge.suggestions.length
      ? result.judge.suggestions.map(suggestion => `- ${suggestion}`).join('\n')
      : result.case.expectedRisks.map(risk => `- 继续观察：${risk}`).join('\n'),
  ].filter(line => line !== '').join('\n')).join('\n\n');

  return [
    '# Tavern Social 提示词体检报告',
    '',
    `- 生成模型：${meta.model || '未填写'}`,
    `- 评审模型：${meta.judgeModel || meta.model || '未填写'}`,
    `- 开始时间：${meta.startedAt}`,
    `- 总耗时：${meta.durationMs}ms`,
    `- 总病例：${results.length}`,
    `- 通过：${passed}`,
    `- 失败：${failed}`,
    `- 平均评审分：${average}`,
    '',
    '## 总览',
    results.map(result =>
      `- ${result.passed ? 'PASS' : 'FAIL'} ${result.case.id}：${result.case.title}（${result.judge.score}）`,
    ).join('\n'),
    '',
    sections,
    '',
  ].join('\n');
}

export function safeFileNameTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
