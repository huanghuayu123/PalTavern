/**
 * 大注释：Tavern export module.
 * Packages local character data into a downloadable SillyTavern card.
 */
import type { CharacterProfile } from '../core/types';
import { migrateInlineSettingsToWorldBook } from './settings';
import { saveNativeJsonFile } from '../platform/runtime';
import { isRecord } from '../core/utils';

export const SILLYTAVERN_CARD_SPEC = 'chara_card_v3';
export const SILLYTAVERN_CARD_SPEC_VERSION = '3.0';

export interface SillyTavernCardDownloadInfo {
  fileName: string;
  folderHint: string;
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function safeFileName(name: string): string {
  const cleaned = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[.\s]+$/g, '')
    .trim();
  return cleaned || 'character';
}

export function createSillyTavernCard(character: CharacterProfile): Record<string, unknown> {
  migrateInlineSettingsToWorldBook(character);
  const raw = cloneRecord(character.rawCard);
  const rawData = isRecord(raw.data) ? cloneRecord(raw.data) : cloneRecord(raw);
  const extensions = isRecord(rawData.extensions) ? cloneRecord(rawData.extensions) : {};

  const existingTavernSocial = isRecord(extensions.tavern_social)
    ? cloneRecord(extensions.tavern_social)
    : {};
  delete existingTavernSocial.characterRelationships;
  delete existingTavernSocial.characterRelationshipSuggestions;
  delete existingTavernSocial.relationships;
  delete existingTavernSocial.relationship_network;
  extensions.tavern_social = {
    ...existingTavernSocial,
    relationship: {
      stage: character.relationship.stage,
      affinity: character.relationship.affinity,
      summary: character.relationship.summary,
      updated_at: new Date(character.relationship.updatedAt).toISOString(),
    },
    age: character.age ?? '',
    background_story: character.backgroundStory ?? '',
    profile_note: character.profileNote ?? '',
    reply_strategy: character.replyStrategy ?? '',
    exported_at: new Date().toISOString(),
  };

  const data: Record<string, unknown> = {
    ...rawData,
    name: character.name,
    description: '',
    personality: '',
    scenario: '',
    first_mes: character.firstMessage ?? '',
    tags: [...character.tags],
    extensions,
  };
  if (character.characterBook !== undefined) {
    data.character_book = character.characterBook;
  }

  return {
    ...raw,
    spec: SILLYTAVERN_CARD_SPEC,
    spec_version: SILLYTAVERN_CARD_SPEC_VERSION,
    data,
  };
}

export function createSillyTavernCardText(character: CharacterProfile): string {
  return JSON.stringify(createSillyTavernCard(character), null, 2);
}

function cardDownloadFolderHint(): string {
  return '系统默认下载文件夹（通常是“下载/Downloads”）';
}

function browserDownloadSillyTavernCard(fileName: string, text: string): SillyTavernCardDownloadInfo {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return {
    fileName,
    folderHint: cardDownloadFolderHint(),
  };
}

export async function downloadSillyTavernCard(character: CharacterProfile): Promise<SillyTavernCardDownloadInfo> {
  const fileName = `${safeFileName(character.name)}.json`;
  const text = createSillyTavernCardText(character);
  const nativeResult = await saveNativeJsonFile(fileName, text);
  if (nativeResult) {
    return {
      fileName: nativeResult.fileName,
      folderHint: `Android 下载目录：${nativeResult.folderPath}`,
    };
  }

  const file = new File([text], fileName, {
    type: 'application/json;charset=utf-8',
  });
  if (
    /Android/i.test(navigator.userAgent)
    && typeof navigator.share === 'function'
    && typeof navigator.canShare === 'function'
    && navigator.canShare({ files: [file] })
  ) {
    await navigator.share({
      title: `${character.name} 角色卡`,
      text: 'SillyTavern V3 角色卡 JSON',
      files: [file],
    });
    return {
      fileName,
      folderHint: '已打开系统分享面板，保存位置以你选择的应用为准',
    };
  }

  return browserDownloadSillyTavernCard(fileName, text);
}
