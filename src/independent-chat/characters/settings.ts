/**
 * 大注释：Character settings module.
 * Normalizes character world-book entries, reply preferences, and editable setting text.
 */
import type { CharacterProfile } from '../core/types';
import { firstString, isRecord, nowId, stableHash } from '../core/utils';

const SETTINGS_MARKER = 'tavern_social_character_settings';

export interface CharacterWorldBookEntryDraft {
  id: string;
  comment: string;
  keys: string;
  content: string;
  enabled: boolean;
  constant: boolean;
  selective: boolean;
  insertionOrder: number;
  position: number;
}

function characterBookEntries(character: CharacterProfile): Record<string, unknown>[] {
  const book = isRecord(character.characterBook) ? character.characterBook : {};
  const entries = Array.isArray(book.entries) ? book.entries.filter(isRecord) : [];
  book.entries = entries;
  character.characterBook = book;
  return entries;
}

function readCharacterBookEntries(character: CharacterProfile): Record<string, unknown>[] {
  if (!isRecord(character.characterBook) || !Array.isArray(character.characterBook.entries)) return [];
  return character.characterBook.entries.filter(isRecord);
}

function markerFor(character: CharacterProfile): string {
  return `${SETTINGS_MARKER}:${character.id}`;
}

function entryMarker(entry: Record<string, unknown>): string {
  const extensions = isRecord(entry.extensions) ? entry.extensions : {};
  const tavernSocial = isRecord(extensions.tavern_social) ? extensions.tavern_social : {};
  return typeof tavernSocial.settings_marker === 'string' ? tavernSocial.settings_marker : '';
}

function findSettingsEntry(character: CharacterProfile): Record<string, unknown> | undefined {
  return readCharacterBookEntries(character).find(entry => entryMarker(entry) === markerFor(character));
}

function stringList(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map(value => value.trim()).filter(Boolean)));
}

function entryKeys(entry: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...stringList(entry.keys),
    ...stringList(entry.key),
  ]);
}

function splitKeys(value: string): string[] {
  return uniqueStrings(value.split(/[,，、\n]/g));
}

function numericEntryValue(value: unknown, fallback: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function entryId(entry: Record<string, unknown>, fallbackIndex: number): string {
  if (typeof entry.uid === 'string' || typeof entry.uid === 'number') return String(entry.uid);
  const seed = [
    firstString(entry.comment, entry.name) ?? '',
    firstString(entry.content) ?? '',
    entryKeys(entry).join('|'),
    String(fallbackIndex),
  ].join('\n');
  return `wb_${stableHash(seed)}`;
}

function entryDraft(entry: Record<string, unknown>, index: number): CharacterWorldBookEntryDraft {
  const enabled = entry.enabled === false || entry.disable === true ? false : true;
  return {
    id: entryId(entry, index),
    comment: firstString(entry.comment, entry.name) ?? '',
    keys: entryKeys(entry).join('、'),
    content: firstString(entry.content) ?? '',
    enabled,
    constant: entry.constant === true,
    selective: entry.selective === true,
    insertionOrder: numericEntryValue(entry.insertion_order, index),
    position: numericEntryValue(entry.position, 0),
  };
}

function updateWorldBookEntryCount(character: CharacterProfile): void {
  const book = isRecord(character.characterBook) ? character.characterBook : {};
  character.importInfo.worldBookEntryCount = Array.isArray(book.entries) ? book.entries.length : 0;
}

export function composeCharacterSettings(parts: {
  description?: string;
  personality?: string;
  scenario?: string;
}): string {
  return [
    parts.description?.trim() ? `角色描述\n${parts.description.trim()}` : '',
    parts.personality?.trim() ? `性格\n${parts.personality.trim()}` : '',
    parts.scenario?.trim() ? `当前场景\n${parts.scenario.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

export function characterSettingsText(character: CharacterProfile): string {
  const entry = findSettingsEntry(character);
  const worldBookText = isRecord(entry) ? firstString(entry.content) : undefined;
  return worldBookText ?? composeCharacterSettings({
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
  });
}

export function characterWorldBookEntryDrafts(character: CharacterProfile): CharacterWorldBookEntryDraft[] {
  return readCharacterBookEntries(character)
    .filter(entry => entryMarker(entry) !== markerFor(character))
    .map((entry, index) => entryDraft(entry, index));
}

export function appendCharacterWorldBookEntry(character: CharacterProfile): CharacterWorldBookEntryDraft {
  const entries = characterBookEntries(character);
  const id = nowId('worldbook');
  const entry: Record<string, unknown> = {
    uid: parseInt(stableHash(`${character.id}:${id}`), 16),
    key: [],
    keys: [],
    comment: '新世界书条目',
    content: '',
    constant: false,
    enabled: true,
    disable: false,
    selective: false,
    insertion_order: entries.length,
    position: 0,
    extensions: {
      tavern_social: {
        kind: 'worldbook_entry',
        character_id: character.id,
        character_name: character.name,
      },
    },
  };
  entries.push(entry);
  updateWorldBookEntryCount(character);
  return entryDraft(entry, entries.length - 1);
}

export function deleteCharacterWorldBookEntry(character: CharacterProfile, id: string): void {
  const entries = characterBookEntries(character);
  const index = entries.findIndex((entry, entryIndex) =>
    entryMarker(entry) !== markerFor(character) && entryId(entry, entryIndex) === id,
  );
  if (index >= 0) entries.splice(index, 1);
  updateWorldBookEntryCount(character);
}

export function setCharacterWorldBookEntryDrafts(
  character: CharacterProfile,
  drafts: CharacterWorldBookEntryDraft[],
): void {
  const entries = characterBookEntries(character);
  const settingsEntries = entries.filter(entry => entryMarker(entry) === markerFor(character));
  const existingEntries = new Map<string, Record<string, unknown>>();
  entries.forEach((entry, index) => {
    if (entryMarker(entry) !== markerFor(character)) existingEntries.set(entryId(entry, index), entry);
  });
  const nextEntries = drafts.flatMap((draft, index) => {
    const keys = splitKeys(draft.keys);
    const comment = draft.comment.trim();
    const content = draft.content.trim();
    if (!comment && !content && keys.length === 0) return [];
    const entry = existingEntries.get(draft.id) ?? {};
    if (typeof entry.uid !== 'string' && typeof entry.uid !== 'number') {
      entry.uid = parseInt(stableHash(`${character.id}:${draft.id}:${index}`), 16);
    }
    entry.key = keys;
    entry.keys = keys;
    entry.comment = comment || keys[0] || `世界书条目 ${index + 1}`;
    entry.content = content;
    entry.constant = draft.constant;
    entry.enabled = draft.enabled;
    entry.disable = !draft.enabled;
    entry.selective = draft.selective;
    entry.insertion_order = Number.isFinite(draft.insertionOrder) ? draft.insertionOrder : index;
    entry.position = Number.isFinite(draft.position) ? draft.position : 0;
    const extensions = isRecord(entry.extensions) ? entry.extensions : {};
    const tavernSocial = isRecord(extensions.tavern_social) ? extensions.tavern_social : {};
    delete tavernSocial.settings_marker;
    tavernSocial.kind = 'worldbook_entry';
    tavernSocial.character_id = character.id;
    tavernSocial.character_name = character.name;
    extensions.tavern_social = tavernSocial;
    entry.extensions = extensions;
    return [entry];
  });
  const book = isRecord(character.characterBook) ? character.characterBook : {};
  book.entries = [...settingsEntries, ...nextEntries];
  character.characterBook = book;
  updateWorldBookEntryCount(character);
}

export function setCharacterSettingsWorldBook(character: CharacterProfile, text: string): void {
  const entries = characterBookEntries(character);
  const existingIndex = entries.findIndex(entry => entryMarker(entry) === markerFor(character));
  const trimmed = text.trim();
  if (!trimmed) {
    if (existingIndex >= 0) entries.splice(existingIndex, 1);
    character.description = '';
    character.personality = '';
    character.scenario = '';
    updateWorldBookEntryCount(character);
    return;
  }

  const extensions = {
    tavern_social: {
      settings_marker: markerFor(character),
      kind: SETTINGS_MARKER,
      character_id: character.id,
      character_name: character.name,
    },
  };
  const entry: Record<string, unknown> = existingIndex >= 0 ? entries[existingIndex] : {};
  entry.uid = typeof entry.uid === 'number' ? entry.uid : parseInt(stableHash(markerFor(character)), 16);
  entry.key = [character.name];
  entry.keys = [character.name];
  entry.comment = `${character.name} 设定`;
  entry.content = trimmed;
  entry.constant = true;
  entry.enabled = true;
  entry.disable = false;
  entry.selective = false;
  entry.insertion_order = typeof entry.insertion_order === 'number' ? entry.insertion_order : 0;
  entry.position = typeof entry.position === 'number' ? entry.position : 0;
  entry.extensions = extensions;
  if (existingIndex < 0) entries.unshift(entry);

  character.description = '';
  character.personality = '';
  character.scenario = '';
  updateWorldBookEntryCount(character);
}

export function renameCharacterSettingsWorldBook(character: CharacterProfile): void {
  const entry = findSettingsEntry(character);
  if (!entry) return;
  entry.key = [character.name];
  entry.keys = [character.name];
  entry.comment = `${character.name} 设定`;
  const extensions = isRecord(entry.extensions) ? entry.extensions : {};
  const tavernSocial = isRecord(extensions.tavern_social) ? extensions.tavern_social : {};
  tavernSocial.character_name = character.name;
  extensions.tavern_social = tavernSocial;
  entry.extensions = extensions;
}

export function migrateInlineSettingsToWorldBook(character: CharacterProfile): void {
  const text = composeCharacterSettings({
    description: character.description,
    personality: character.personality,
    scenario: character.scenario,
  });
  if (text) setCharacterSettingsWorldBook(character, text);
}
