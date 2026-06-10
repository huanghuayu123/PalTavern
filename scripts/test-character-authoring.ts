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
  },
});

const stateModule = require('../src/independent-chat/state');
const authoring = require('../src/independent-chat/authoring');
const backup = require('../src/independent-chat/backup');
const exporter = require('../src/independent-chat/tavern-export');
const characterSettings = require('../src/independent-chat/character-settings');

const simple = authoring.createCharacterCardDraft('simple');
simple.name = '简单角色';
simple.concept = '一个克制但会主动照顾别人的人。';
simple.appearance = '短发，常穿深色外套。';
simple.personality = '冷静，遇到亲近的人时会用行动表达关心。';
simple.hobbies = '修理旧相机。';
simple.candidates.personality = '候选稿不应自动覆盖正文。';
authoring.touchDraft(simple);

if (simple.personality === simple.candidates.personality) {
  throw new Error('Candidate text overwrote the accepted draft content.');
}

const simpleCharacter = authoring.createCharacterFromDraft(simple);
const simpleSettings = characterSettings.characterSettingsText(simpleCharacter);
if (
  simpleCharacter.description
  || simpleCharacter.personality
  || !simpleSettings.includes(simple.appearance)
  || !simpleSettings.includes(simple.personality)
) {
  throw new Error('Simple draft fields were not mapped to the character card.');
}
if (
  simpleCharacter.importInfo.spec !== 'chara_card_v3'
  || simpleCharacter.importInfo.specVersion !== '3.0'
  || simpleCharacter.rawCard.spec !== 'chara_card_v3'
  || simpleCharacter.rawCard.spec_version !== '3.0'
) {
  throw new Error('Authored character was not stored as a V3 card.');
}

const pollutedOpening = [
  '根据现有设定，整理角色卡如下：',
  '',
  '**角色名：** 简单角色',
  '**外貌：** 短发，常穿深色外套。',
  '',
  '**开场白（first_mes）：**',
  '',
  '雨声停在窗沿时，她把旧相机放回柜台。',
  '“你来得比我预想得早。”',
].join('\n');
const cleanedOpening = authoring.cleanGeneratedOpeningMessage(pollutedOpening);
if (
  cleanedOpening.includes('角色名')
  || cleanedOpening.includes('外貌')
  || !cleanedOpening.startsWith('雨声停在窗沿时')
) {
  throw new Error('Generated opening cleanup did not extract only first_mes content.');
}

const complex = authoring.createCharacterCardDraft('complex');
complex.name = '复杂角色';
complex.appearance = '银灰长发，眼神总像在评估退路。';
complex.hobbies = '收集废弃车票。';
complex.palette = '底色：警觉。\n主色：温柔但克制。';
complex.reinterpretation = '克制不意味着冷漠，她只是不轻易替别人做决定。';
authoring.touchDraft(complex);
const characterCountBeforeDirectExport = stateModule.state.characters.length;
const directExportCharacter = authoring.characterProfileFromDraft(complex);
const directExport = exporter.createSillyTavernCard(directExportCharacter);
if (
  stateModule.state.characters.length !== characterCountBeforeDirectExport
  || directExport.spec !== 'chara_card_v3'
  || directExport.spec_version !== '3.0'
  || directExport.data.name !== complex.name
  || directExport.data.first_mes !== complex.firstMessage
) {
  throw new Error('Direct draft export was not a standard non-mutating V3 card.');
}
const complexCharacter = authoring.createCharacterFromDraft(complex);
const complexSettings = characterSettings.characterSettingsText(complexCharacter);
if (
  complexCharacter.description
  || complexCharacter.personality
  || !complexSettings.includes(complex.palette)
  || !complexSettings.includes(complex.reinterpretation)
) {
  throw new Error('Complex personality sections were not preserved.');
}

const exported = exporter.createSillyTavernCard(complexCharacter);
const authoringExtension = exported.data.extensions.tavern_social.authoring;
if (
  authoringExtension.mode !== 'complex'
  || authoringExtension.palette !== complex.palette
  || authoringExtension.reinterpretation !== complex.reinterpretation
) {
  throw new Error('Structured authoring extension was not exported.');
}

const paletteMessages = authoring.buildAuthoringTutorMessages(complex, 'palette', '', 'guide');
const paletteSystem = paletteMessages[0]?.content ?? '';
const palettePresetLabel = '\ud83d\udccb \u6027\u683c\u8c03\u8272\u76d8';
if (
  !paletteSystem.includes(palettePresetLabel)
  || !paletteSystem.includes('\u5934\u90e8\u7ea6\u675f')
  || !paletteSystem.includes('\u6253\u5f00\u8c03\u8272\u76d8\u6a21\u5757')
  || !paletteSystem.includes('\u5e95\u8272')
  || !paletteSystem.includes('\u4e3b\u8272\u8c03')
  || !paletteSystem.includes('\u70b9\u7f00')
  || !paletteSystem.includes('\u884d\u751f')
  || !paletteSystem.includes('\u624b\u5199\u4f18\u5148')
  || !paletteSystem.includes('\u4e00\u6b21\u53ea\u95ee\u4e00\u4e2a\u989c\u8272')
) {
  throw new Error('Palette tutor prompt should open the Mingyue-style palette module with focused handwriting guidance.');
}
if (
  paletteSystem.includes('<thinking>')
  || paletteSystem.includes('Write \u5de5\u5177')
  || paletteSystem.includes('\u54e5\u54e5')
) {
  throw new Error('Palette tutor prompt should adapt the preset for PalTavern without chain-of-thought, tool-write, or persona-tail leakage.');
}
const paletteOrganizeMessages = authoring.buildAuthoringTutorMessages(
  complex,
  'palette',
  '\u8bf7\u5e2e\u6211\u6574\u7406\u6210\u8c03\u8272\u76d8',
  'organize',
);
const paletteOrganizeSystem = paletteOrganizeMessages[0]?.content ?? '';
if (
  !paletteOrganizeSystem.includes('\u6700\u7ec8\u8f93\u51fa\u683c\u5f0f')
  || !paletteOrganizeSystem.includes('\u4e0d\u6539\u5199\u7528\u6237\u53e5\u5f0f')
  || !paletteOrganizeSystem.includes('\u4e0d\u81ea\u52a8\u8df3\u5230\u4e09\u9762\u6027')
) {
  throw new Error('Palette organize prompt should preserve user wording and stop after palette formatting.');
}

const originalCharacterCount = stateModule.state.characters.length;
complex.palette = '更新后的调色盘';
authoring.touchDraft(complex);
authoring.createCharacterFromDraft(complex);
if (stateModule.state.characters.length !== originalCharacterCount) {
  throw new Error('Updating a linked draft created a duplicate character.');
}

const backupText = backup.createBackupText();
stateModule.replaceState(stateModule.defaultState());
const restored = backup.restoreBackupText(backupText);
if (
  restored.characterCardDrafts.length !== 2
  || !restored.characterCardDrafts.some((draft: any) => draft.name === '复杂角色')
) {
  throw new Error('Authoring drafts did not survive backup restore.');
}

const oldState = stateModule.normalizeState({
  worlds: restored.worlds,
  characters: [],
});
if (!Array.isArray(oldState.characterCardDrafts) || oldState.characterCardDrafts.length !== 0) {
  throw new Error('Old state without drafts was not normalized safely.');
}

console.log(JSON.stringify({
  simpleFlow: true,
  complexFlow: true,
  candidateRequiresAcceptance: true,
  openingCleanup: true,
  linkedUpdate: true,
  structuredExport: true,
  directStandardExport: true,
  paletteTutorPresetGuidance: true,
  backupRestore: true,
  legacyState: true,
}));
