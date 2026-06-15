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

const stateModule = require('../src/independent-chat/core/state');
const authoring = require('../src/independent-chat/characters/authoring');
const backup = require('../src/independent-chat/data/backup');
const exporter = require('../src/independent-chat/characters/tavern-export');
const characterSettings = require('../src/independent-chat/characters/settings');

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

const cleanedTutorText = authoring.cleanAuthoringTutorOutput([
  '**可以先抓住一个核心反差。**',
  '',
  '她不是真的冷漠，只是不擅长开口。',
].join('\n'));
if (cleanedTutorText.includes('**') || !cleanedTutorText.startsWith('可以先抓住')) {
  throw new Error('Authoring tutor cleanup should remove visible Markdown emphasis markers.');
}

const cleanedAppearanceCandidate = authoring.cleanAuthoringCandidateText([
  '【外貌】',
  '**外貌：** 在旧潮书店值夜班，袖口总沾着一点纸灰。',
].join('\n'), 'appearance');
if (
  cleanedAppearanceCandidate.includes('【外貌】')
  || cleanedAppearanceCandidate.includes('外貌：')
  || cleanedAppearanceCandidate.includes('**')
  || !cleanedAppearanceCandidate.startsWith('在旧潮书店值夜班')
) {
  throw new Error('Authoring candidate cleanup should remove field headings before adoption.');
}

const forcedComplex = authoring.createCharacterCardDraft('complex');
const forcedComplexSteps = authoring.stepsFor(forcedComplex);
if (
  forcedComplex.mode !== 'simple'
  || forcedComplexSteps.join('>') !== 'identity>appearance>personality>hobbies>preview'
  || forcedComplexSteps.includes('palette')
  || forcedComplexSteps.includes('reinterpretation')
) {
  throw new Error('Complex authoring mode should be removed and forced back to the simple flow.');
}
forcedComplex.name = '旧复杂角色';
forcedComplex.appearance = 'Silver hair and a guarded look.';
forcedComplex.personality = 'Alert but gentle with trusted people.';
forcedComplex.hobbies = 'Collecting old tickets.';
forcedComplex.palette = 'Legacy personality detail from an old complex draft.';
forcedComplex.reinterpretation = 'Legacy reinterpretation from an old complex draft.';
authoring.touchDraft(forcedComplex);
const characterCountBeforeDirectExport = stateModule.state.characters.length;
const directExportCharacter = authoring.characterProfileFromDraft(forcedComplex);
const directExport = exporter.createSillyTavernCard(directExportCharacter);
if (
  stateModule.state.characters.length !== characterCountBeforeDirectExport
  || directExport.spec !== 'chara_card_v3'
  || directExport.spec_version !== '3.0'
  || directExport.data.name !== forcedComplex.name
  || directExport.data.first_mes !== forcedComplex.firstMessage
) {
  throw new Error('Direct draft export was not a standard non-mutating V3 card.');
}
const complexCharacter = authoring.createCharacterFromDraft(forcedComplex);
const complexSettings = characterSettings.characterSettingsText(complexCharacter);
if (
  complexCharacter.description
  || complexCharacter.personality
  || !complexSettings.includes(forcedComplex.personality)
  || !complexSettings.includes(forcedComplex.palette)
  || !complexSettings.includes(forcedComplex.reinterpretation)
) {
  throw new Error('Legacy complex draft content was not preserved in the simple card.');
}

const exported = exporter.createSillyTavernCard(complexCharacter);
const authoringExtension = exported.data.extensions.tavern_social.authoring;
if (
  authoringExtension.mode !== 'simple'
  || authoringExtension.personality !== forcedComplex.personality
  || authoringExtension.palette !== forcedComplex.palette
  || authoringExtension.reinterpretation !== forcedComplex.reinterpretation
) {
  throw new Error('Structured authoring extension was not exported.');
}
const authoringUiSource = require('node:fs').readFileSync('src/independent-chat/ui/authoring-ui.ts', 'utf8');
const stylesSource = require('node:fs').readFileSync('src/independent-chat/styles.css', 'utf8');
if (
  authoringUiSource.includes('性格调色盘')
  || authoringUiSource.includes('data-authoring-step="palette"')
  || authoringUiSource.includes('data-create-draft="complex"')
  || authoringUiSource.includes('复杂版')
  || authoringUiSource.includes('复杂人设')
  || authoringUiSource.includes('选择创作方式')
) {
  throw new Error('Authoring UI should not expose complex persona controls.');
}
if (
  !authoringUiSource.includes('authoring-identity-fields')
  || !authoringUiSource.includes('class="authoring-age-input"')
  || !authoringUiSource.includes('data-authoring-autogrow')
  || !authoringUiSource.includes('resizeAuthoringTextarea')
  || !stylesSource.includes('.authoring-identity-fields')
  || !stylesSource.includes('.authoring-age-input')
  || !stylesSource.includes('min-inline-size: min(100%, 12rem)')
  || !stylesSource.includes('#draft-background-story')
  || !stylesSource.includes('.authoring-progress button > span')
  || !stylesSource.includes('inline-size: 28px')
) {
  throw new Error('Authoring identity fields should keep numeric controls horizontal and auto-grow long text areas.');
}
const authoringSource = require('node:fs').readFileSync('src/independent-chat/characters/authoring.ts', 'utf8');
const typeSource = require('node:fs').readFileSync('src/independent-chat/core/types.ts', 'utf8');
if (authoringSource.includes('COMPLEX_STEPS') || typeSource.includes("| 'complex'")) {
  throw new Error('Complex authoring should not remain as a first-class code path.');
}

const originalCharacterCount = stateModule.state.characters.length;
forcedComplex.personality = 'Updated personality detail';
authoring.touchDraft(forcedComplex);
authoring.createCharacterFromDraft(forcedComplex);
if (stateModule.state.characters.length !== originalCharacterCount) {
  throw new Error('Updating a linked draft created a duplicate character.');
}

const backupText = backup.createBackupText();
stateModule.replaceState(stateModule.defaultState());
const restored = backup.restoreBackupText(backupText);
if (
  restored.characterCardDrafts.length !== 2
  || !restored.characterCardDrafts.some((draft: any) => draft.name === '旧复杂角色' && draft.mode === 'simple')
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

const normalizedLegacyComplex = stateModule.normalizeState({
  worlds: restored.worlds,
  characterCardDrafts: [{
    id: 'legacy-complex-draft',
    worldId: 'default-world',
    mode: 'complex',
    currentStep: 'reinterpretation',
    name: 'Legacy Complex',
    personality: 'Base personality',
    palette: 'Legacy palette detail',
    reinterpretation: 'Legacy reinterpretation detail',
    createdAt: 1,
    updatedAt: 2,
  }],
});
const legacyDraft = normalizedLegacyComplex.characterCardDrafts[0];
if (
  legacyDraft.mode !== 'simple'
  || legacyDraft.currentStep !== 'personality'
  || legacyDraft.palette !== 'Legacy palette detail'
  || legacyDraft.reinterpretation !== 'Legacy reinterpretation detail'
) {
  throw new Error('Legacy complex drafts were not normalized into the simple authoring flow.');
}

console.log(JSON.stringify({
  simpleFlow: true,
  complexModeRemoved: true,
  candidateRequiresAcceptance: true,
  openingCleanup: true,
  tutorCleanup: true,
  candidateFieldCleanup: true,
  linkedUpdate: true,
  structuredExport: true,
  directStandardExport: true,
  complexAuthoringRemoved: true,
  backupRestore: true,
  legacyState: true,
}));
