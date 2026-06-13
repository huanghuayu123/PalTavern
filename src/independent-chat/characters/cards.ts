/**
 * 大注释：Character card management module.
 * Handles import, update, avatar, sticker, and normalized character-card fields.
 */
import type { CharacterImportInfo, CharacterProfile, StickerAsset } from '../core/types';
import { createAutoMessagePacingStrategy } from '../chat/auto-message-strategy';
import {
  characterSettingsText,
  composeCharacterSettings,
  renameCharacterSettingsWorldBook,
  setCharacterSettingsWorldBook,
} from './settings';
import {
  createDefaultAutoEventSchedule,
  createDefaultAutoMessageSchedule,
  createDefaultAutoMomentSchedule,
  createDefaultCharacterPlan,
  createDefaultRelationship,
  ensureConversation,
  ensureWorldExists,
  saveState,
  state,
} from '../core/state';
import { SILLYTAVERN_CARD_SPEC, SILLYTAVERN_CARD_SPEC_VERSION } from './tavern-export';
import { firstString, isRecord, nowId, stableHash } from '../core/utils';

interface ParseCardOptions {
  sourceFormat?: CharacterImportInfo['sourceFormat'];
  fileName?: string;
  avatar?: string;
}

export interface CharacterCardCandidate {
  id: string;
  name: string;
  source: 'card_name' | 'description' | 'world_book' | 'structured';
  snippet: string;
  confidence: number;
  isPrimary: boolean;
}

export interface ParsedCharacterCardFile {
  character: CharacterProfile;
  candidates: CharacterCardCandidate[];
}

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

async function fileHasPngSignature(file: File): Promise<boolean> {
  const bytes = new Uint8Array(await file.slice(0, PNG_SIGNATURE.length).arrayBuffer());
  return bytes.length === PNG_SIGNATURE.length
    && PNG_SIGNATURE.every((value, index) => bytes[index] === value);
}

function worldBookEntryCount(characterBook: unknown): number {
  return isRecord(characterBook) && Array.isArray(characterBook.entries) ? characterBook.entries.length : 0;
}

async function createAvatarThumbnail(file: File): Promise<string | undefined> {
  if (!('createImageBitmap' in window)) {
    return undefined;
  }
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, (bitmap.width - side) / 2);
  const sourceY = Math.max(0, (bitmap.height - side) / 2);
  const targetSize = Math.min(640, side);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(targetSize));
  canvas.height = Math.max(1, Math.round(targetSize));
  canvas.getContext('2d')?.drawImage(
    bitmap,
    sourceX,
    sourceY,
    side,
    side,
    0,
    0,
    canvas.width,
    canvas.height,
  );
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.86);
}

export async function setCustomCharacterAvatar(character: CharacterProfile, file: File): Promise<void> {
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
    throw new Error('请选择 PNG、JPG 或 WebP 图片。');
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('头像图片不能超过 12 MB。');
  }
  const avatar = await createAvatarThumbnail(file);
  if (!avatar) {
    throw new Error('当前设备无法处理这张头像图片。');
  }
  character.avatar = avatar;
  character.customAvatar = true;
  saveState();
}

async function createStickerDataUrl(file: File): Promise<string> {
  if (!('createImageBitmap' in window)) {
    throw new Error('当前设备无法处理表情包图片。');
  }
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 512 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/webp', 0.84);
}

function stickerName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '').trim().slice(0, 40) || '表情包';
}

export async function importStickerFiles(
  files: File[],
  currentCount = 0,
  limit = 48,
): Promise<StickerAsset[]> {
  const remaining = Math.max(0, limit - currentCount);
  if (remaining === 0) {
    throw new Error(`这个表情包分类最多保存 ${limit} 个表情包。`);
  }
  const selected = files.slice(0, remaining);
  const imported: StickerAsset[] = [];
  for (const file of selected) {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.type) && !/\.(png|jpe?g|webp)$/i.test(file.name)) {
      continue;
    }
    if (file.size > 8 * 1024 * 1024) {
      throw new Error(`“${file.name}”超过 8 MB。`);
    }
    imported.push({
      id: nowId('sticker'),
      name: stickerName(file.name),
      note: '',
      dataUrl: await createStickerDataUrl(file),
      importedAt: Date.now(),
    });
  }
  if (imported.length === 0) {
    throw new Error('没有找到可导入的表情包图片。');
  }
  return imported;
}

export async function importCharacterStickers(
  character: CharacterProfile,
  files: File[],
): Promise<StickerAsset[]> {
  const current = character.stickers ?? [];
  const imported = await importStickerFiles(files, current.length);
  character.stickers = [...current, ...imported];
  saveState();
  return imported;
}

export function deleteCharacterSticker(character: CharacterProfile, stickerId: string): void {
  character.stickers = (character.stickers ?? []).filter(sticker => sticker.id !== stickerId);
  saveState();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : [];
}

function cloneRecord(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function stripNameDecorations(value: string): string {
  return value
    .replace(/\{\{char\}\}/gi, '')
    .replace(/\{\{user\}\}/gi, '')
    .replace(/^[\s"'“”‘’《》【】\[\]（）()<>#：:]+/, '')
    .replace(/[\s"'“”‘’《》【】\[\]（）()<>：:。；;，,、]+$/, '')
    .trim();
}

const nonCharacterNames = new Set([
  '角色', '人物', '成员', '姓名', '名字', '主角', '女主', '男主', '用户', '玩家', '旁白', '系统',
  '世界观', '设定', '背景', '外貌', '性格', '人格', '爱好', '关系', '场景', '规则', '回复',
  '开场白', '示例', '动态', '事件', '世界书', '作者', '说明', '格式', '禁止事项', '注意事项',
  '角色速览', '速览', '调色盘', '性格调色盘', '二次解释', '理解与思考', '补充解释',
  'character', 'characters', 'name', 'user', 'system', 'assistant', 'narrator', 'scenario',
]);

function cleanCandidateName(value: string): string | undefined {
  const firstPart = stripNameDecorations(value)
    .split(/[：:：\-—=|]/)[0]
    .replace(/\s+(?:是|为|has|is)\s+.*$/i, '')
    .replace(/[（(].*?[）)]/g, '')
    .trim();
  const name = stripNameDecorations(firstPart);
  if (!name || name.length > 24) return undefined;
  if (nonCharacterNames.has(name.toLowerCase())) return undefined;
  if (/^\d+$/.test(name)) return undefined;
  if (/[。！？!?]/.test(name)) return undefined;
  if (!/[\p{L}\p{N}_\-\u4e00-\u9fff]/u.test(name)) return undefined;
  return name;
}

function splitCandidateList(value: string): string[] {
  const normalized = value
    .replace(/、/g, ',')
    .replace(/[；;]/g, ',')
    .replace(/\s+\/\s+/g, ',')
    .replace(/\s+\|\s+/g, ',');
  return normalized
    .split(',')
    .map(item => cleanCandidateName(item))
    .filter((name): name is string => Boolean(name));
}

function textSnippet(text: string, name: string): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const index = normalized.indexOf(name);
  if (index < 0) return normalized.slice(0, 180);
  return normalized.slice(Math.max(0, index - 55), Math.min(normalized.length, index + 145));
}

function stableCandidateId(name: string, source: CharacterCardCandidate['source'], snippet: string): string {
  return `candidate_${stableHash(`${source}:${name}:${snippet.slice(0, 120)}`)}`;
}

function collectStructuredCandidateValues(value: unknown, output: Array<{ name: string; snippet: string }>, depth = 0): void {
  if (depth > 4) return;
  if (Array.isArray(value)) {
    for (const item of value) collectStructuredCandidateValues(item, output, depth + 1);
    return;
  }
  if (!isRecord(value)) return;
  const rawName = firstString(value.name, value.char_name, value.character, value.nickname, value.姓名, value.名字);
  const name = rawName ? cleanCandidateName(rawName) : undefined;
  if (name) {
    const snippet = firstString(value.description, value.desc, value.personality, value.content, value.设定, value.描述)
      ?? JSON.stringify(value).slice(0, 220);
    output.push({ name, snippet });
  }
  for (const [key, child] of Object.entries(value)) {
    if (/^(characters|character_list|cast|members|npcs|roles|角色|角色列表|人物|人物列表|成员)$/i.test(key)) {
      collectStructuredCandidateValues(child, output, depth + 1);
    }
  }
}

function candidateSourceText(character: CharacterProfile): Array<{
  source: CharacterCardCandidate['source'];
  text: string;
  confidence: number;
}> {
  const sources: Array<{ source: CharacterCardCandidate['source']; text: string; confidence: number }> = [
    {
      source: 'description',
      text: [
        character.description,
        character.personality,
        character.scenario,
        characterSettingsText(character),
        character.firstMessage,
        character.creatorNotes,
      ].filter(Boolean).join('\n'),
      confidence: 68,
    },
  ];
  if (isRecord(character.characterBook) && Array.isArray(character.characterBook.entries)) {
    for (const entry of character.characterBook.entries.filter(isRecord)) {
      const keys = [
        ...(Array.isArray(entry.keys) ? entry.keys : []),
        ...(Array.isArray(entry.key) ? entry.key : []),
      ].filter((item): item is string => typeof item === 'string');
      sources.push({
        source: 'world_book',
        text: [
          firstString(entry.name, entry.comment),
          keys.join('、'),
          firstString(entry.content, entry.comment),
        ].filter(Boolean).join('\n'),
        confidence: 78,
      });
    }
  }
  return sources.filter(source => source.text.trim());
}

export function recognizeCharacterCard(character: CharacterProfile): CharacterCardCandidate[] {
  const candidates = new Map<string, CharacterCardCandidate>();
  const push = (
    nameValue: string | undefined,
    source: CharacterCardCandidate['source'],
    snippet: string,
    confidence: number,
    isPrimary = false,
  ) => {
    if (!nameValue) return;
    const names = splitCandidateList(nameValue);
    for (const name of names.length > 0 ? names : [cleanCandidateName(nameValue)].filter(Boolean) as string[]) {
      const key = name.toLocaleLowerCase();
      const existing = candidates.get(key);
      const next: CharacterCardCandidate = {
        id: stableCandidateId(name, source, snippet),
        name,
        source,
        snippet: snippet.trim().slice(0, 220),
        confidence,
        isPrimary,
      };
      if (!existing || existing.confidence < confidence || isPrimary) {
        candidates.set(key, {
          ...next,
          isPrimary: isPrimary || existing?.isPrimary === true,
          confidence: Math.max(existing?.confidence ?? 0, confidence),
        });
      }
    }
  };

  push(character.name, 'card_name', '角色卡顶层名称。', 96, true);

  const listPatterns = [
    /(?:角色列表|人物列表|登场人物|主要角色|可扮演角色|角色|人物|成员|NPC|姓名|名字|name)\s*[:：]\s*([^\n]{1,180})/gi,
    /^\s*(?:[-*•·]|\d+[.、])\s*([^:\n：\-—]{1,28})\s*(?:[:：\-—]|$)/gm,
  ];
  for (const source of candidateSourceText(character)) {
    for (const pattern of listPatterns) {
      for (const match of source.text.matchAll(pattern)) {
        push(match[1], source.source, textSnippet(source.text, match[1]), source.confidence);
      }
    }
    if (source.source === 'world_book') {
      const firstLine = source.text.split('\n').find(line => line.trim());
      if (firstLine && /角色|人物|NPC|姓名|性格|外貌|身份|关系/.test(source.text)) {
        push(firstLine, 'world_book', textSnippet(source.text, firstLine), source.confidence + 8);
      }
    }
  }

  const structured: Array<{ name: string; snippet: string }> = [];
  collectStructuredCandidateValues(character.rawCard, structured);
  for (const item of structured) {
    push(item.name, 'structured', item.snippet, 86);
  }

  return [...candidates.values()]
    .filter(candidate => candidate.isPrimary || candidate.confidence >= 62)
    .sort((left, right) =>
      Number(right.isPrimary) - Number(left.isPrimary)
      || right.confidence - left.confidence
      || left.name.localeCompare(right.name),
    )
    .slice(0, 12);
}

export function parseCharacterCard(rawText: string, options: ParseCardOptions = {}): CharacterProfile {
  const raw = JSON.parse(rawText) as Record<string, unknown>;
  const data = isRecord(raw.data) ? raw.data : raw;
  const extensions = isRecord(data.extensions) ? data.extensions : {};
  const chub = isRecord(extensions.chub) ? extensions.chub : {};
  const name = firstString(data.name, raw.name, data.char_name, raw.char_name);
  if (!name) {
    throw new Error('角色卡缺少 name 字段。');
  }
  const tags = [data.tags, raw.tags, chub.tags]
    .flatMap(value => Array.isArray(value) ? value : [])
    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0);
  const characterBook = data.character_book ?? raw.character_book;
  const description = firstString(data.description, raw.description);
  const personality = firstString(data.personality, raw.personality);
  const scenario = firstString(data.scenario, raw.scenario);
  const tavernSocial = isRecord(extensions.tavern_social) ? extensions.tavern_social : {};

  const character: CharacterProfile = {
    id: `card_${stableHash(`${state.activeWorldId}:${rawText}`)}`,
    worldId: state.activeWorldId,
    name,
    avatar: options.avatar ?? firstString(data.avatar, raw.avatar, data.avatar_url, raw.avatar_url),
    description,
    age: firstString(tavernSocial.age, data.age, raw.age),
    backgroundStory: firstString(tavernSocial.background_story, data.background_story, raw.background_story),
    personality,
    scenario,
    firstMessage: firstString(data.first_mes, raw.first_mes, data.first_message, raw.first_message),
    alternateGreetings: stringArray(data.alternate_greetings ?? raw.alternate_greetings),
    groupOnlyGreetings: stringArray(data.group_only_greetings ?? raw.group_only_greetings),
    nickname: firstString(data.nickname, raw.nickname),
    profileNote: firstString(tavernSocial.profile_note, data.profile_note, raw.profile_note),
    replyStrategy: firstString(tavernSocial.reply_strategy, data.reply_strategy, raw.reply_strategy),
    creator: firstString(data.creator, raw.creator),
    creatorNotes: firstString(data.creator_notes, raw.creator_notes),
    characterVersion: firstString(data.character_version, raw.character_version),
    systemPrompt: firstString(data.system_prompt, raw.system_prompt),
    postHistoryInstructions: firstString(data.post_history_instructions, raw.post_history_instructions),
    cardAssets: Array.isArray(data.assets) ? data.assets : Array.isArray(raw.assets) ? raw.assets : [],
    cardSources: stringArray(data.source ?? raw.source),
    stickers: [],
    tags: [...new Set(tags)],
    importInfo: {
      sourceFormat: options.sourceFormat ?? 'json',
      spec: firstString(raw.spec, data.spec) ?? (isRecord(raw.data) ? 'chara_card_v2' : 'legacy'),
      specVersion: firstString(raw.spec_version, data.spec_version) ?? '',
      worldBookEntryCount: worldBookEntryCount(characterBook),
      importedFileName: options.fileName ?? '',
    },
    characterBook,
    relationship: createDefaultRelationship(),
    autoMessage: createDefaultAutoMessageSchedule(),
    autoMoment: createDefaultAutoMomentSchedule(),
    autoEvent: createDefaultAutoEventSchedule(),
    currentPlan: createDefaultCharacterPlan(name),
    rawCard: raw,
    importedAt: Date.now(),
  };
  character.autoMessage.pacingStrategy = createAutoMessagePacingStrategy(character);
  const settingsText = composeCharacterSettings({ description, personality, scenario });
  if (settingsText) setCharacterSettingsWorldBook(character, settingsText);
  return character;
}

export async function parseCharacterCardFileWithRecognition(file: File): Promise<ParsedCharacterCardFile> {
  const isPng = file.type === 'image/png'
    || file.name.toLowerCase().endsWith('.png')
    || await fileHasPngSignature(file);
  if (!isPng) {
    const character = parseCharacterCard(await file.text(), { sourceFormat: 'json', fileName: file.name });
    return { character, candidates: recognizeCharacterCard(character) };
  }
  const { extractPngCharacterJson } = await import('./png-card-parser.mjs');
  const rawText = extractPngCharacterJson(await file.arrayBuffer());
  const avatar = await createAvatarThumbnail(file).catch(() => undefined);
  const character = parseCharacterCard(rawText, { sourceFormat: 'png', fileName: file.name, avatar });
  return { character, candidates: recognizeCharacterCard(character) };
}

export async function parseCharacterCardFile(file: File): Promise<CharacterProfile> {
  return (await parseCharacterCardFileWithRecognition(file)).character;
}

export function characterFromCardCandidate(
  base: CharacterProfile,
  candidate: CharacterCardCandidate,
): CharacterProfile {
  if (candidate.isPrimary && candidate.name === base.name) {
    return base;
  }
  const rawCard = cloneRecord(base.rawCard);
  const rawData = isRecord(rawCard.data) ? cloneRecord(rawCard.data) : rawCard;
  rawData.name = candidate.name;
  const extensions = isRecord(rawData.extensions) ? cloneRecord(rawData.extensions) : {};
  const tavernSocial = isRecord(extensions.tavern_social) ? cloneRecord(extensions.tavern_social) : {};
  tavernSocial.recognition = {
    source_card_name: base.name,
    candidate_name: candidate.name,
    candidate_source: candidate.source,
    confidence: candidate.confidence,
    snippet: candidate.snippet,
  };
  extensions.tavern_social = tavernSocial;
  rawData.extensions = extensions;
  if (isRecord(rawCard.data)) {
    rawCard.data = rawData;
  }
  rawCard.spec = SILLYTAVERN_CARD_SPEC;
  rawCard.spec_version = SILLYTAVERN_CARD_SPEC_VERSION;
  const character: CharacterProfile = {
    ...base,
    id: `card_${stableHash(`${base.worldId}:${base.id}:${candidate.id}:${candidate.name}`)}`,
    name: candidate.name,
    importInfo: {
      ...base.importInfo,
      spec: SILLYTAVERN_CARD_SPEC,
      specVersion: SILLYTAVERN_CARD_SPEC_VERSION,
    },
    relationship: createDefaultRelationship(),
    autoMessage: createDefaultAutoMessageSchedule(),
    autoMoment: createDefaultAutoMomentSchedule(),
    autoEvent: createDefaultAutoEventSchedule(),
    currentPlan: createDefaultCharacterPlan(candidate.name),
    rawCard,
    importedAt: Date.now(),
  };
  setCharacterSettingsWorldBook(character, [
    candidate.snippet ? `识别片段\n${candidate.snippet}` : '',
    characterSettingsText(base) ? `原卡设定\n${characterSettingsText(base)}` : '',
  ].filter(Boolean).join('\n\n'));
  character.autoMessage.pacingStrategy = createAutoMessagePacingStrategy(character);
  return character;
}

export function updateCharacterCardDetails(character: CharacterProfile, input: {
  name: string;
  settings: string;
}): void {
  const nextName = input.name.trim() || character.name;
  character.name = nextName;
  setCharacterSettingsWorldBook(character, input.settings);
  renameCharacterSettingsWorldBook(character);

  if (isRecord(character.rawCard)) {
    const raw = character.rawCard;
    const data = isRecord(raw.data) ? raw.data : raw;
    raw.spec = SILLYTAVERN_CARD_SPEC;
    raw.spec_version = SILLYTAVERN_CARD_SPEC_VERSION;
    raw.name = nextName;
    raw.char_name = nextName;
    data.name = nextName;
    data.char_name = nextName;
    data.description = '';
    data.personality = '';
    data.scenario = '';
  }
  saveState();
}

export function upsertCharacter(character: CharacterProfile): void {
  ensureWorldExists(character.worldId);
  const existingIndex = state.characters.findIndex(item =>
    item.worldId === character.worldId && (item.id === character.id || item.name === character.name),
  );
  if (existingIndex >= 0) {
    const existing = state.characters[existingIndex];
    state.characters[existingIndex] = {
      ...existing,
      ...character,
      avatar: existing.customAvatar ? existing.avatar : character.avatar,
      customAvatar: existing.customAvatar,
      profileNote: existing.profileNote ?? character.profileNote,
      replyStrategy: existing.replyStrategy ?? character.replyStrategy,
      stickers: existing.stickers,
      relationship: existing.relationship,
      autoMessage: existing.autoMessage,
      autoMoment: existing.autoMoment,
      autoEvent: existing.autoEvent,
      currentPlan: existing.currentPlan ?? character.currentPlan,
    };
  } else {
    state.characters.push(character);
  }

  state.activeCharacterId = character.id;
  ensureConversation(character);
  saveState();
}

export function deleteCharacter(characterId: string): CharacterProfile | undefined {
  const character = state.characters.find(item => item.id === characterId);
  if (!character) return undefined;
  const conversationIds = new Set(
    state.conversations
      .filter(item => item.characterId === characterId || item.ownerCharacterId === characterId)
      .map(item => item.id),
  );
  const removedMomentIds = new Set(state.moments
    .filter(moment => moment.characterId === characterId)
    .map(moment => moment.id));
  const removedMomentCommentIds = new Set<string>();
  const removedInteractionIds = new Set(
    state.characterInteractions
      .filter(interaction =>
        interaction.actorCharacterId === characterId || interaction.targetCharacterIds.includes(characterId),
      )
      .map(interaction => interaction.id),
  );
  state.characters = state.characters.filter(item => item.id !== characterId);
  if (state.communicationIdentityByWorldId[character.worldId] === characterId) {
    state.communicationIdentityByWorldId[character.worldId] = 'user';
  }
  state.characterRelationships = state.characterRelationships.filter(item =>
    item.characterAId !== characterId && item.characterBId !== characterId,
  );
  state.characterRelationshipSuggestions = state.characterRelationshipSuggestions.filter(item =>
    item.fromCharacterId !== characterId && item.toCharacterId !== characterId,
  );
  state.conversations = state.conversations.filter(item =>
    item.characterId !== characterId && item.ownerCharacterId !== characterId,
  );
  state.messages = state.messages.filter(message =>
    message.characterId !== characterId && !conversationIds.has(message.conversationId),
  );
  state.moments = state.moments
    .filter(moment => moment.characterId !== characterId)
    .map(moment => {
      const commentIdsToRemove = new Set(
        moment.comments
          .filter(comment => comment.characterId === characterId)
          .map(comment => comment.id),
      );
      let foundLinkedReply = commentIdsToRemove.size > 0;
      while (foundLinkedReply) {
        foundLinkedReply = false;
        for (const comment of moment.comments) {
          if (
            comment.replyToCommentId
            && commentIdsToRemove.has(comment.replyToCommentId)
            && !commentIdsToRemove.has(comment.id)
          ) {
            commentIdsToRemove.add(comment.id);
            foundLinkedReply = true;
          }
        }
      }
      if (commentIdsToRemove.size === 0) return moment;
      commentIdsToRemove.forEach(id => removedMomentCommentIds.add(id));
      return {
        ...moment,
        comments: moment.comments.filter(comment => !commentIdsToRemove.has(comment.id)),
      };
    });
  state.characterStatuses = state.characterStatuses.filter(status => status.characterId !== characterId);
  state.characterInteractions = state.characterInteractions.filter(interaction =>
    interaction.actorCharacterId !== characterId && !interaction.targetCharacterIds.includes(characterId),
  );
  state.timelineEntries = state.timelineEntries.filter(entry =>
    !entry.characterIds.includes(characterId)
    && !(entry.source.type === 'moment' && removedMomentIds.has(entry.source.id))
    && !(entry.source.type === 'comment' && removedMomentCommentIds.has(entry.source.id))
    && !(entry.source.type === 'interaction' && removedInteractionIds.has(entry.source.id)),
  );
  state.dailyBriefs = state.dailyBriefs.map(brief => ({
    ...brief,
    suggestedCharacterIds: brief.suggestedCharacterIds.filter(id => id !== characterId),
  }));
  state.worldEvents = state.worldEvents.map(event => ({
    ...event,
    participantCharacterIds: event.participantCharacterIds.filter(id => id !== characterId),
  }));
  state.groupChats = state.groupChats.map(chat => ({
    ...chat,
    participantCharacterIds: chat.participantCharacterIds.filter(id => id !== characterId),
    selectedSpeakerId: chat.selectedSpeakerId === characterId ? 'user' : chat.selectedSpeakerId,
  }));
  state.characterCardDrafts = state.characterCardDrafts.map(draft =>
    draft.linkedCharacterId === characterId ? { ...draft, linkedCharacterId: undefined } : draft,
  );
  if (state.activeCharacterId === characterId) {
    state.activeCharacterId = state.characters.find(item => item.worldId === character.worldId)?.id ?? '';
  }
  saveState();
  return character;
}
