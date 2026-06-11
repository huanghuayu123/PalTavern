export {};
declare const require: (id: string) => any;

const exporter = require('../src/independent-chat/characters/tavern-export');

const character = {
  id: 'card_test',
  worldId: 'world_test',
  name: 'Alice/Test',
  description: 'Updated description',
  personality: 'Reserved',
  scenario: 'A quiet station',
  firstMessage: 'Hello.',
  profileNote: 'A generated opening note.',
  tags: ['test', 'export'],
  importInfo: {
    sourceFormat: 'json',
    spec: 'chara_card_v2',
    specVersion: '2.0',
    worldBookEntryCount: 1,
    importedFileName: 'alice.json',
  },
  characterBook: {
    entries: [{ keys: ['station'], content: 'World lore' }],
  },
  relationship: {
    stage: 'close',
    affinity: 70,
    summary: 'Mutual trust',
    updatedAt: 1_700_000_000_000,
  },
  autoMessage: {
    enabled: true,
    baseIntervalMin: 1,
    baseIntervalMax: 2,
  },
  rawCard: {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: {
      name: 'Old name',
      creator_notes: 'Preserve this',
      extensions: {
        third_party: { keep: true },
        tavern_social: {
          characterRelationships: [{ leaked: true }],
          characterRelationshipSuggestions: [{ leaked: true }],
        },
      },
    },
    custom_top_level: 'preserve',
  },
  importedAt: 1,
};

const exported = exporter.createSillyTavernCard(character);
const data = exported.data;

if (exported.spec !== 'chara_card_v3' || exported.spec_version !== '3.0') {
  throw new Error('Card spec was not normalized to SillyTavern V3.');
}
if (exported.custom_top_level !== 'preserve' || data.creator_notes !== 'Preserve this') {
  throw new Error('Unknown original card fields were not preserved.');
}
if (data.name !== character.name || data.description !== '' || data.personality !== '' || data.scenario !== '') {
  throw new Error('Current character name or blank profile fields were not exported correctly.');
}
if (
  !JSON.stringify(data.character_book).includes('Updated description')
  || !JSON.stringify(data.character_book).includes('Reserved')
  || !JSON.stringify(data.character_book).includes('A quiet station')
) {
  throw new Error('Character settings were not exported through the bound world book.');
}
if (data.extensions.third_party.keep !== true) {
  throw new Error('Third-party extensions were not preserved.');
}
if (data.extensions.tavern_social.relationship.affinity !== 70) {
  throw new Error('Relationship extension was not exported.');
}
if (data.extensions.tavern_social.profile_note !== character.profileNote) {
  throw new Error('Profile note was not exported.');
}
if ('autoMessage' in data || JSON.stringify(exported).includes('baseIntervalMin')) {
  throw new Error('Private scheduler settings leaked into the character card.');
}
if (
  JSON.stringify(data.extensions.tavern_social).includes('characterRelationships')
  || JSON.stringify(data.extensions.tavern_social).includes('characterRelationshipSuggestions')
) {
  throw new Error('Character-to-character relationship network leaked into a single character card export.');
}

console.log(JSON.stringify({
  v3: true,
  preservedUnknownFields: true,
  currentFieldsApplied: true,
  settingsInWorldBook: true,
  relationshipExtension: true,
  profileNoteExtension: true,
  privateSettingsExcluded: true,
  characterRelationshipsExcluded: true,
}));
