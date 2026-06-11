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
const model = require('../src/independent-chat/model/client');
const cards = require('../src/independent-chat/characters/cards');
const promptPresets = require('../src/independent-chat/model/prompt-presets');
const replyStrategy = require('../src/independent-chat/model/reply-strategy');

const preset = promptPresets.parseSillyTavernPromptPreset(JSON.stringify({
  temperature: 0.82,
  top_p: 0.91,
  extensions: {
    regex_scripts: [
      {
        id: 'regex_one',
        scriptName: 'Drop bracketed noise',
        findRegex: '/\\[drop\\]([\\s\\S]*?)\\[\\/drop\\]/g',
        replaceString: '',
      },
      {
        id: 'regex_two',
        scriptName: 'Normalize token',
        findRegex: 'OLD_TOKEN',
        replaceString: 'NEW_TOKEN',
        disabled: true,
      },
    ],
    SPreset: { ChatSquash: { enabled: false } },
  },
  prompts: [
    { identifier: 'main', name: '作者声明', role: 'system', content: 'DISABLED_PRESET_CONTENT', enabled: false },
    { identifier: 'rules', name: '聊天规则', role: 'system', content: '预设规则：{{char}} 和 {{user}} 私聊。{{trim}}', enabled: true },
    { identifier: 'charDescription', name: '角色描述', role: 'system', marker: true, content: '' },
    { identifier: 'personaDescription', name: '玩家描述', role: 'system', marker: true, content: '' },
    { identifier: 'worldInfoAfter', name: '世界后置', role: 'system', marker: true, content: '' },
    { identifier: 'chatHistory', name: '聊天记录', role: 'system', marker: true, content: '' },
    { identifier: 'after', name: '后置', role: 'assistant', content: '最后用户说：{{lastUserMessage}}' },
  ],
  prompt_order: [{
    character_id: 100001,
    order: [
      { identifier: 'main', enabled: false },
      { identifier: 'rules', enabled: true },
      { identifier: 'charDescription', enabled: true },
      { identifier: 'personaDescription', enabled: true },
      { identifier: 'worldInfoAfter', enabled: true },
      { identifier: 'chatHistory', enabled: true },
      { identifier: 'after', enabled: true },
    ],
  }],
}), 'sample-preset.json', 1000);

if (
  preset.prompts.length !== 7
  || preset.prompts[0].identifier !== 'main'
  || preset.prompts[0].enabled !== false
  || preset.regexScriptCount !== 2
  || preset.regexScripts.length !== 2
  || preset.regexScripts[0].findRegex !== '/\\[drop\\]([\\s\\S]*?)\\[\\/drop\\]/g'
  || preset.regexScripts[1].enabled !== false
  || !preset.hasSPreset
  || preset.parameterSummary.temperature !== 0.82
) {
  throw new Error('SillyTavern preset import did not preserve order, disabled state, or compatibility metadata.');
}

const regexOutput = promptPresets.applyPromptPresetRegexScripts('保留[drop]删除[/drop] OLD_TOKEN', preset);
if (regexOutput !== '保留 OLD_TOKEN') {
  throw new Error('Prompt preset regex scripts were not applied or disabled correctly.');
}

const defaultPreset = promptPresets.createTavernSocialDefaultPromptPreset(2000);
const defaultReplyPrompt = defaultPreset.prompts.find((prompt: { identifier: string }) =>
  prompt.identifier === 'tavern_social_reply_strategy',
);
const defaultMemoryPrompt = defaultPreset.prompts.find((prompt: { identifier: string }) =>
  prompt.identifier === 'tavernSocialMemorySummary',
);
if (
  defaultPreset.id !== promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID
  || defaultPreset.name !== 'Tavern Social 默认回复策略'
  || defaultPreset.sourceFileName !== 'tavern-social-default-preset.json'
  || !defaultReplyPrompt
  || defaultReplyPrompt.marker
  || !defaultReplyPrompt.content.includes('真实微信私聊')
  || !defaultReplyPrompt.content.includes('当前用户消息 > 未解决事项')
  || !defaultReplyPrompt.content.includes('先接住情绪')
  || !defaultReplyPrompt.content.includes('最多自然提到 1 个')
  || !defaultReplyPrompt.content.includes('最多 4 条')
  || !defaultReplyPrompt.content.includes('不能编造上下文没有提供的事实')
  || !defaultReplyPrompt.content.includes('不能承诺应用不支持的动作')
  || !defaultReplyPrompt.content.includes('只有用户明确要求步骤')
  || !defaultMemoryPrompt
  || !defaultMemoryPrompt.marker
  || !defaultPreset.order.some((item: { identifier: string }) => item.identifier === 'tavernSocialMemorySummary')
  || defaultPreset.order.length !== defaultPreset.prompts.length
  || !defaultPreset.raw.prompt_order?.[0]?.order?.every((item: { identifier?: string }) => item.identifier)
) {
  throw new Error('Tavern Social default prompt preset was not created in editable SillyTavern-like shape.');
}

const defaultGroupPreset = promptPresets.createTavernSocialDefaultGroupPromptPreset(2001);
const defaultGroupStrategy = defaultGroupPreset.prompts.find((prompt: { identifier: string }) =>
  prompt.identifier === 'tavern_social_group_strategy',
);
if (
  defaultGroupPreset.id !== promptPresets.TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID
  || defaultGroupPreset.name !== 'Tavern Social 默认群聊策略'
  || defaultGroupPreset.sourceFileName !== 'tavern-social-default-group-preset.json'
  || !defaultGroupStrategy
  || defaultGroupStrategy.marker
  || !defaultGroupStrategy.content.includes('真实手机群聊')
  || !defaultGroupStrategy.content.includes('总共最多 3 个气泡')
  || !defaultGroupStrategy.content.includes('[跳过]')
  || !defaultGroupStrategy.content.includes('不要承诺应用不支持的动作')
  || !defaultGroupPreset.prompts.some((prompt: { identifier: string; marker: boolean }) =>
    prompt.identifier === 'groupReplyTarget' && prompt.marker)
  || !defaultGroupPreset.prompts.some((prompt: { identifier: string; marker: boolean }) =>
    prompt.identifier === 'groupHistory' && prompt.marker)
  || defaultGroupPreset.order.length !== defaultGroupPreset.prompts.length
) {
  throw new Error('Tavern Social default group prompt preset was not created in editable shape.');
}

const defaultWorldPreset = promptPresets.createTavernSocialDefaultWorldPromptPreset(2002);
if (
  defaultWorldPreset.id !== promptPresets.TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID
  || defaultWorldPreset.sourceFileName !== 'tavern-social-default-world-preset.json'
  || !defaultWorldPreset.prompts.some((prompt: { identifier: string; marker: boolean }) =>
    prompt.identifier === 'worldInfoBefore' && prompt.marker)
  || !defaultWorldPreset.prompts.some((prompt: { identifier: string; marker: boolean }) =>
    prompt.identifier === 'chatHistory' && prompt.marker)
  || !defaultWorldPreset.prompts.some((prompt: { identifier: string; marker: boolean }) =>
    prompt.identifier === 'tavernSocialWorldRpRules' && !prompt.marker)
  || defaultWorldPreset.order.length !== defaultWorldPreset.prompts.length
) {
  throw new Error('Tavern Social default world RP prompt preset was not created in editable SillyTavern-like shape.');
}

const migrated = stateModule.normalizeState({
  worlds: [{ id: 'preset_world', name: 'Preset World', description: 'World description', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'preset_world',
});
if (
  migrated.promptPresets.length !== 3
  || migrated.activeChatPromptPresetId !== promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID
  || !migrated.chatPromptPresetEnabled
  || migrated.activeGroupPromptPresetId !== promptPresets.TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID
  || !migrated.groupPromptPresetEnabled
  || migrated.activeWorldPromptPresetId !== promptPresets.TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID
  || !migrated.worldPromptPresetEnabled
) {
  throw new Error('Legacy state did not install the editable Tavern Social default prompt presets safely.');
}

const legacyDefaultPreset = promptPresets.createTavernSocialDefaultPromptPreset(2100);
legacyDefaultPreset.prompts = legacyDefaultPreset.prompts
  .filter((prompt: { identifier: string }) => prompt.identifier !== 'tavernSocialMemorySummary')
  .map((prompt: any) => prompt.identifier === 'tavern_social_reply_strategy'
    ? { ...prompt, content: replyStrategy.TAVERN_SOCIAL_LEGACY_REPLY_STRATEGY }
    : prompt);
legacyDefaultPreset.order = legacyDefaultPreset.order
  .filter((item: { identifier: string }) => item.identifier !== 'tavernSocialMemorySummary');
const upgradedPresetState = stateModule.normalizeState({
  worlds: [{ id: 'upgrade_world', name: 'Upgrade World', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'upgrade_world',
  promptPresets: [legacyDefaultPreset],
  activeChatPromptPresetId: promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
});
const upgradedDefaultPreset = upgradedPresetState.promptPresets.find((item: { id: string }) =>
  item.id === promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
);
if (
  !upgradedDefaultPreset
  || !upgradedDefaultPreset.prompts.some((prompt: { identifier: string }) =>
    prompt.identifier === 'tavernSocialMemorySummary')
  || !upgradedDefaultPreset.order.some((item: { identifier: string }) =>
    item.identifier === 'tavernSocialMemorySummary')
  || !upgradedDefaultPreset.prompts.find((prompt: { identifier: string }) =>
    prompt.identifier === 'tavern_social_reply_strategy')?.content.includes('真实微信私聊')
) {
  throw new Error('Legacy default chat preset did not receive the new memory marker and reply strategy migration.');
}

const oldNewDefaultPreset = promptPresets.createTavernSocialDefaultPromptPreset(2150);
oldNewDefaultPreset.prompts = oldNewDefaultPreset.prompts.map((prompt: any) => prompt.identifier === 'tavern_social_reply_strategy'
  ? { ...prompt, content: [
    '消息表现必须像真实微信私聊，而不是小说、客服回答、总结报告或复杂 RP。',
    '一次回复通常发送 1 到 4 条独立消息；有情绪变化、补充说明或转折时可以自然拆开发送。',
    '优先级：当前用户消息 > 未解决事项 > 角色状态 > 近期时间线 > 今日简报 > 关系摘要。',
    '用户有明显情绪时，先接住情绪，再自然回应；少说教、少长篇建议，不要输出咨询师式模板话。',
  ].join('\n') }
  : prompt);
const oldNewPresetState = stateModule.normalizeState({
  worlds: [{ id: 'old_new_world', name: 'Old New World', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'old_new_world',
  promptPresets: [oldNewDefaultPreset],
  activeChatPromptPresetId: promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
});
const migratedOldNewPrompt = oldNewPresetState.promptPresets
  .find((item: { id: string }) => item.id === promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID)
  ?.prompts.find((prompt: { identifier: string }) => prompt.identifier === 'tavern_social_reply_strategy');
if (
  !migratedOldNewPrompt
  || !migratedOldNewPrompt.content.includes('不能编造上下文没有提供的事实')
  || !migratedOldNewPrompt.content.includes('最多 4 条')
) {
  throw new Error('Previously installed Tavern Social default chat strategy was not upgraded safely.');
}

const oldGroupPreset = promptPresets.createTavernSocialDefaultGroupPromptPreset(2160);
oldGroupPreset.prompts = oldGroupPreset.prompts.map((prompt: any) => prompt.identifier === 'tavern_social_group_strategy'
  ? { ...prompt, content: [
    '消息表现必须像真实手机群聊：短、自然、接上一条话，不要写成长篇独白。',
    '可以只发一句，也可以拆成两条短消息；不要为了热闹强行展开。',
    '如果当前角色没有必要发言，前置的意愿判断会让本轮沉默；一旦轮到你发言，就输出一条自然群消息。',
  ].join('\n') }
  : prompt);
oldGroupPreset.prompts = oldGroupPreset.prompts.map((prompt: any) => prompt.identifier === 'tavern_social_group_output_format'
  ? { ...prompt, content: '普通消息写成 <msg>内容</msg>。' }
  : prompt);
const oldGroupPresetState = stateModule.normalizeState({
  worlds: [{ id: 'old_group_world', name: 'Old Group World', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'old_group_world',
  promptPresets: [oldGroupPreset],
  activeGroupPromptPresetId: promptPresets.TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID,
});
const migratedGroupPreset = oldGroupPresetState.promptPresets.find((item: { id: string }) =>
  item.id === promptPresets.TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID);
if (
  !migratedGroupPreset
  || !migratedGroupPreset.prompts.find((prompt: { identifier: string }) =>
    prompt.identifier === 'tavern_social_group_strategy')?.content.includes('[跳过]')
  || !migratedGroupPreset.prompts.find((prompt: { identifier: string }) =>
    prompt.identifier === 'tavern_social_group_output_format')?.content.includes('[跳过]')
) {
  throw new Error('Previously installed Tavern Social default group strategy was not upgraded safely.');
}

const editedDefaultPreset = promptPresets.createTavernSocialDefaultPromptPreset(2200);
editedDefaultPreset.prompts = editedDefaultPreset.prompts
  .filter((prompt: { identifier: string }) => prompt.identifier !== 'tavernSocialMemorySummary')
  .map((prompt: any) => prompt.identifier === 'tavern_social_reply_strategy'
    ? { ...prompt, content: '用户改过的默认回复策略，迁移时必须保留。' }
    : prompt);
editedDefaultPreset.order = editedDefaultPreset.order
  .filter((item: { identifier: string }) => item.identifier !== 'tavernSocialMemorySummary');
const editedPresetState = stateModule.normalizeState({
  worlds: [{ id: 'edited_world', name: 'Edited World', description: '', createdAt: 1, updatedAt: 1 }],
  activeWorldId: 'edited_world',
  promptPresets: [editedDefaultPreset],
  activeChatPromptPresetId: promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
});
const editedMigratedPreset = editedPresetState.promptPresets.find((item: { id: string }) =>
  item.id === promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
);
if (
  !editedMigratedPreset
  || !editedMigratedPreset.prompts.some((prompt: { identifier: string }) =>
    prompt.identifier === 'tavernSocialMemorySummary')
  || editedMigratedPreset.prompts.find((prompt: { identifier: string }) =>
    prompt.identifier === 'tavern_social_reply_strategy')?.content !== '用户改过的默认回复策略，迁移时必须保留。'
) {
  throw new Error('User-edited default chat strategy was overwritten during migration.');
}

stateModule.replaceState(migrated);
stateModule.state.userName = '玩家甲';
stateModule.state.worlds[0].userPersona = '住在海边小城，回复很直接。';
stateModule.state.promptPresets.push(preset);
stateModule.state.activeChatPromptPresetId = preset.id;
stateModule.state.chatPromptPresetEnabled = true;

const character = cards.parseCharacterCard(JSON.stringify({
  spec: 'chara_card_v2',
  data: {
    name: '叶昀',
    description: '角色描述正文',
    personality: '角色性格正文',
    scenario: '当前场景正文',
    character_book: { entries: [{ keys: ['海边'], content: '角色世界书正文', constant: true }] },
  },
}));
character.worldId = 'preset_world';
character.relationship.summary = '关系摘要测试：两个人已经习惯晚上互相报备。';
stateModule.state.characters.push(character);
stateModule.state.activeCharacterId = character.id;
const conversation = stateModule.ensureConversation(character);
stateModule.state.messages.push({
  id: 'preset_user_message',
  conversationId: conversation.id,
  characterId: character.id,
  role: 'user',
  content: '今晚还去海边吗',
  createdAt: 10,
  source: 'user',
});
stateModule.state.characterStatuses.push({
  id: 'status_prompt_memory',
  worldId: character.worldId,
  characterId: character.id,
  mood: '还在等你回那句话',
  relationshipStage: character.relationship.stage,
  affinity: character.relationship.affinity,
  relationshipSummary: character.relationship.summary,
  recentMemoryTitles: ['海边夜风'],
  unresolvedItems: ['海边约定还没定下来'],
  nextInclination: '想先确认用户今晚有没有空',
  activeSources: [],
  summary: '这段关系里还有一句关于海边的话没接上。',
  source: 'rule',
  updatedAt: 11,
});
stateModule.state.timelineEntries.push({
  id: 'timeline_preset_memory',
  worldId: character.worldId,
  createdAt: 12,
  type: 'manual_note',
  characterIds: [character.id],
  characterNames: { [character.id]: character.name },
  title: '海边约定',
  summary: 'TIMELINE_FOR_PRESET_SHOULD_APPEAR',
  source: { type: 'manual', id: 'timeline_preset_memory' },
  canUndo: false,
  includeInContext: true,
});
stateModule.state.timelineEntries.push({
  id: 'timeline_preset_revoked',
  worldId: character.worldId,
  createdAt: 13,
  type: 'manual_note',
  characterIds: [character.id],
  characterNames: { [character.id]: character.name },
  title: '撤销的约定',
  summary: 'TIMELINE_FOR_PRESET_SHOULD_NOT_APPEAR',
  source: { type: 'manual', id: 'timeline_preset_revoked' },
  canUndo: true,
  includeInContext: true,
  revokedAt: 14,
});
stateModule.state.dailyBriefs.push({
  id: 'brief_prompt_memory',
  worldId: character.worldId,
  dateKey: '2026-06-08',
  title: '今日简报',
  summary: 'DAILY_BRIEF_FOR_PRESET_SHOULD_APPEAR',
  sections: ['今天有一条和海边有关的未读。'],
  suggestedCharacterIds: [character.id],
  unreadCount: 1,
  changeCount: 1,
  createdAt: 15,
  updatedAt: 15,
});

stateModule.state.activeChatPromptPresetId = promptPresets.TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID;
const defaultPresetMessages = model.buildModelMessages(character, '', true, true, undefined, true);
const defaultPresetText = defaultPresetMessages.map((message: { content: string }) => message.content).join('\n');
if (
  !defaultPresetText.includes('你正在 Tavern Social 的私聊中扮演 叶昀')
  || !defaultPresetText.includes('真实微信私聊')
  || !defaultPresetText.includes('长期记忆摘要')
  || !defaultPresetText.includes('当前角色状态摘要')
  || !defaultPresetText.includes('海边约定还没定下来')
  || !defaultPresetText.includes('TIMELINE_FOR_PRESET_SHOULD_APPEAR')
  || !defaultPresetText.includes('今日简报（大总结，参考总结，不覆盖真实时间线）')
  || !defaultPresetText.includes('DAILY_BRIEF_FOR_PRESET_SHOULD_APPEAR')
  || !defaultPresetText.includes('关系摘要测试')
  || !defaultPresetText.includes('当前没有可用表情包')
  || !defaultPresetText.includes('Tavern Social 运行格式保护')
  || !defaultPresetText.includes('今晚还去海边吗')
  || defaultPresetText.includes('TIMELINE_FOR_PRESET_SHOULD_NOT_APPEAR')
) {
  throw new Error('Default Tavern Social preset did not build editable reply strategy context.');
}

stateModule.state.activeChatPromptPresetId = preset.id;
const presetMessages = model.buildModelMessages(character, '', true, true, undefined, true);
const presetText = presetMessages.map((message: { content: string }) => message.content).join('\n');
if (
  presetText.includes('DISABLED_PRESET_CONTENT')
  || !presetText.includes('预设规则：叶昀 和 玩家甲 私聊。')
  || !presetText.includes('角色描述正文')
  || !presetText.includes('住在海边小城')
  || !presetText.includes('TIMELINE_FOR_PRESET_SHOULD_APPEAR')
  || !presetText.includes('DAILY_BRIEF_FOR_PRESET_SHOULD_APPEAR')
  || !presetText.includes('今晚还去海边吗')
  || !presetText.includes('Tavern Social 运行格式保护')
  || !presetText.includes('<msg>内容</msg>')
) {
  throw new Error('Enabled chat preset did not build the expected prompt context.');
}

stateModule.state.chatPromptPresetEnabled = false;
const defaultPrompt = model.buildModelMessages(character)[0].content;
if (!defaultPrompt.includes('你正在一款独立聊天软件中扮演角色') || defaultPrompt.includes('预设规则')) {
  throw new Error('Disabling chat preset did not restore the built-in prompt.');
}

stateModule.state.chatPromptPresetEnabled = true;
preset.prompts.find((prompt: { identifier: string }) => prompt.identifier === 'rules').enabled = false;
const toggledPrompt = model.buildModelMessages(character, '', true, true, undefined, true)
  .map((message: { content: string }) => message.content)
  .join('\n');
if (toggledPrompt.includes('预设规则')) {
  throw new Error('Prompt-level toggle did not remove the disabled prompt.');
}
promptPresets.resetPromptPresetDefaults(preset);
if (!preset.prompts.find((prompt: { identifier: string }) => prompt.identifier === 'rules').enabled) {
  throw new Error('Resetting prompt preset defaults did not restore default enabled state.');
}

const authoringLikePrompt = model.buildModelMessages(character, '写卡请求不应吃聊天预设', true, false, undefined, false)[0].content;
if (authoringLikePrompt.includes('预设规则')) {
  throw new Error('Non-chat prompt path unexpectedly used the chat preset.');
}

console.log(JSON.stringify({
  importPreset: true,
  defaultPreset: true,
  defaultGroupPreset: true,
  migrationDefaults: true,
  defaultPresetUpgrade: true,
  oldDefaultStrategyUpgrade: true,
  oldGroupStrategyUpgrade: true,
  defaultPresetUserEditsPreserved: true,
  memorySummaryMarker: true,
  promptBuild: true,
  toggle: true,
  scopeIsolation: true,
}));
