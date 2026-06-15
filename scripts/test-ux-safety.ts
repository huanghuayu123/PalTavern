export {};
declare const require: (id: string) => any;

const fs = require('node:fs');
const path = require('node:path');

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

const backup = require('../src/independent-chat/data/backup');
const timeline = require('../src/independent-chat/memory/timeline');
const cardDiagnostics = require('../src/independent-chat/ui/card-import-diagnostics');
const displayLabels = require('../src/independent-chat/ui/display-labels');

const appSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/ui/app.ts'), 'utf8');
const styleSource = fs.readFileSync(path.join(process.cwd(), 'src/independent-chat/styles.css'), 'utf8');

const backupText = JSON.stringify({
  app: 'PalTavern',
  schema: 'tavern-social-backup-v1',
  exportedAt: '2026-06-14T00:00:00.000Z',
  state: {
    worlds: [{ id: 'world_a', name: '现实世界', description: '', createdAt: 1, updatedAt: 2 }],
    characters: [{
      id: 'lin',
      worldId: 'world_a',
      name: '林芷',
      tags: [],
      importInfo: {
        sourceFormat: 'json',
        spec: 'chara_card_v2',
        specVersion: '2.0',
        worldBookEntryCount: 0,
        importedFileName: 'lin.json',
      },
      importedAt: 1,
    }],
    messages: [{ id: 'message_a', conversationId: 'conversation_a', characterId: 'lin', role: 'assistant', content: '下午好。', createdAt: 3, source: 'model_reply' }],
    groupMessages: [{ id: 'group_message_a', groupChatId: 'group_a', worldId: 'world_a', speakerType: 'character', speakerCharacterId: 'lin', content: '群聊消息。', source: 'model', createdAt: 4 }],
    moments: [{ id: 'moment_a', worldId: 'world_a', characterId: 'lin', content: '动态内容。', createdAt: 5, source: 'character', visibility: { mode: 'public', characterIds: [], blockedCharacterIds: [] }, comments: [] }],
    timelineEntries: [],
    modelConfig: { provider: 'custom', apiUrl: 'https://api.example.test/v1', apiKey: 'SECRET', model: 'model-a', temperature: 0.8, dailyRequestLimit: 20 },
  },
});

const preview = backup.previewBackupRestoreText(backupText);
if (
  preview.characterCount !== 1
  || preview.privateMessageCount !== 1
  || preview.groupMessageCount !== 1
  || preview.momentCount !== 1
  || !preview.currentDataWillBeReplaced
  || !backup.formatBackupRestoreWarning(preview).includes('当前本地数据会被替换')
  || !backup.formatBackupRestoreWarning(preview).includes('建议先导出当前备份')
) {
  throw new Error('Backup import should provide a clear destructive preview before restore.');
}
if (
  !appSource.includes('previewBackupRestoreText')
  || !appSource.includes('formatBackupRestoreWarning')
  || !appSource.includes('openConfirmDialog({')
  || !appSource.includes('confirmLabel: \'导入并覆盖\'')
  || !appSource.includes('tone: \'danger\'')
) {
  throw new Error('Backup import UI should confirm before replacing local data.');
}

const entries = [
  {
    id: 'timeline_cafe',
    worldId: 'world_a',
    createdAt: 30,
    type: 'event',
    characterIds: ['lin'],
    characterNames: { lin: '林芷' },
    title: '午后的咖啡馆',
    summary: '林芷和用户整理照片。',
    source: { type: 'event', id: 'event_a' },
    canUndo: false,
    includeInContext: true,
  },
  {
    id: 'timeline_rain',
    worldId: 'world_a',
    createdAt: 20,
    type: 'moment',
    characterIds: ['xiao'],
    characterNames: { xiao: '小肩包' },
    title: '海边散步',
    summary: '小肩包问你要不要听歌。',
    source: { type: 'moment', id: 'moment_b' },
    canUndo: false,
    includeInContext: true,
  },
] as const;
const timelineResults = timeline.filterTimelineEntries(entries, {
  type: 'all',
  query: '咖啡',
  characterId: 'lin',
});
if (timelineResults.length !== 1 || timelineResults[0].id !== 'timeline_cafe') {
  throw new Error('Timeline search should combine text query and character filter.');
}
if (
  !appSource.includes('worldTimelineSearchQuery')
  || !appSource.includes('worldTimelineCharacterFilter')
  || !appSource.includes('data-world-timeline-search')
  || !appSource.includes('data-world-timeline-character')
) {
  throw new Error('World timeline UI should expose search and character filters.');
}

const diagnosticsHtml = cardDiagnostics.renderCardImportDiagnostics({
  id: 'character_missing',
  worldId: 'world_a',
  name: '缺项角色',
  description: '',
  personality: '',
  firstMessage: '',
  tags: [],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v2',
    specVersion: '2.0',
    worldBookEntryCount: 0,
    importedFileName: 'missing.json',
  },
  relationship: { stage: 'stranger', affinity: 0, summary: '', updatedAt: 1 },
  autoMessage: {},
  autoMoment: {},
  autoEvent: {},
  currentPlan: { text: '', updatedAt: 1, source: 'rule' },
  importedAt: 1,
}, [{ id: 'candidate', name: '缺项角色', source: 'card_name', confidence: 'high', snippet: '', isPrimary: true }]);
if (
  !diagnosticsHtml.includes('data-card-import-action="profile"')
  || !diagnosticsHtml.includes('data-card-import-action="opening"')
  || !diagnosticsHtml.includes('data-card-import-action="worldbook"')
) {
  throw new Error('Card import diagnostics should offer direct completion actions for missing fields.');
}

const contactSubtitle = displayLabels.characterContactSubtitle({
  id: 'bookshop_keeper',
  worldId: 'world_a',
  name: '许灯',
  tags: [],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v3',
    specVersion: '3.0',
    worldBookEntryCount: 1,
    importedFileName: '',
  },
  profileNote: '',
  relationship: { stage: 'stranger', affinity: 0, summary: '', updatedAt: 1 },
  autoMessage: {},
  autoMoment: {},
  autoEvent: {},
  currentPlan: {
    text: '许灯 最近按自己的生活节奏行动，偶尔会因为动态、关系或身边小事和其他角色产生交集。',
    updatedAt: 1,
    source: 'rule',
  },
  importedAt: 1,
}, [
  '角色描述',
  '【角色构想】',
  '在旧潮书店值夜班，正在整理旧画册。',
  '【外貌】',
  '总戴着一副旧圆框眼镜。',
].join('\n'));
if (
  contactSubtitle.includes('角色描述')
  || contactSubtitle.includes('【角色构想】')
  || contactSubtitle.includes('【外貌】')
  || !contactSubtitle.startsWith('在旧潮书店值夜班')
) {
  throw new Error('Contact subtitles should read like natural status lines, not leaked card field labels.');
}

if (
  !appSource.includes('data-context-preview-remove-timeline')
  || !appSource.includes('从上下文移除')
  || !appSource.includes('contextPreviewCharacterId = character.id')
) {
  throw new Error('Context preview should allow users to remove a mistaken timeline entry from model context.');
}

const groupStackBlock = styleSource.match(/\.group-conversation-row\s+\.group-avatar-stack\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (
  !groupStackBlock.includes('width: 72px')
  || !groupStackBlock.includes('min-width: 72px')
  || !groupStackBlock.includes('overflow: visible')
) {
  throw new Error('Group conversation rows should reserve enough fixed avatar-stack width so names never overlap.');
}

const authoringProgressBlocks = Array.from(styleSource.matchAll(/\.authoring-progress\s*\{[^}]*\}/g), (match) => match[0]);
const authoringProgressMobileGridOverride = authoringProgressBlocks.some((block) => (
  block.includes('display: grid')
  || /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/.test(block)
));
const authoringProgressSingleColumnOverride = authoringProgressBlocks.some((block) => (
  /grid-template-columns:\s*1fr/.test(block)
));
if (authoringProgressMobileGridOverride || authoringProgressSingleColumnOverride) {
  throw new Error('Authoring progress should stay as a horizontal step rail on narrow screens.');
}

const momentHeaderActionsBlock = styleSource.match(/\.moment-header-actions\s*\{[\s\S]*?\}/)?.[0] ?? '';
const specificMomentHeaderActionsBlock = styleSource.match(/\.moment-header\s*>\s*\.moment-header-actions\s*\{[\s\S]*?\}/)?.[0] ?? '';
if (
  !momentHeaderActionsBlock.includes('display: inline-flex')
  || !momentHeaderActionsBlock.includes('flex-wrap: nowrap')
  || !momentHeaderActionsBlock.includes('white-space: nowrap')
  || !specificMomentHeaderActionsBlock.includes('display: inline-flex')
  || !styleSource.includes('.moment-header-actions .small-button')
  || !styleSource.includes('.moment-header-actions .moment-delete')
) {
  throw new Error('Moment detail and delete actions should stay side by side in the card header.');
}

console.log(JSON.stringify({
  backupImportConfirm: true,
  timelineSearch: true,
  cardCompletionActions: true,
  contextPreviewCorrection: true,
  groupAvatarLayout: true,
  authoringProgressRail: true,
  momentHeaderActions: true,
  naturalContactSubtitle: true,
}));
