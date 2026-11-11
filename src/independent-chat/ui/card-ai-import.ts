// 大注释：导入角色卡时让模型帮忙识别卡片、生成简介和主动消息节奏。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import type { CharacterCardCandidate, ParsedCharacterCardFile } from '../characters/cards';
import { characterSettingsText } from '../characters/settings';
import { saveState, state } from '../core/state';
import type { CharacterProfile, ModelMessage } from '../core/types';
import { compactText } from '../core/utils';
import { callAuthoringModel, callModel } from '../model/client';
import { buildCharacterReplyStrategyMessages, cleanGeneratedCharacterReplyStrategy } from '../model/reply-strategy';
import { cardCandidateSourceLabel } from './settings-panels';

export async function generateCharacterReplyStrategy(character: CharacterProfile): Promise<string> {
  if (!modelIsReady()) {
    throw new Error('请先到“设置 -> 模型连接”配置模型，再按人设生成回复策略。');
  }
  const content = await callAuthoringModel(buildCharacterReplyStrategyMessages(character), { countBudget: true });
  const strategy = cleanGeneratedCharacterReplyStrategy(content);
  if (!strategy) {
    throw new Error('模型没有返回可用的回复策略。');
  }
  return strategy;
}

export function modelIsReady(): boolean {
  return Boolean(state.modelConfig.apiUrl.trim() && state.modelConfig.model.trim());
}

export function cardRecognitionMessages(parsed: ParsedCharacterCardFile): ModelMessage[] {
  const { character, candidates } = parsed;
  const cardContext = compactText([
    `卡名：${character.name}`,
    characterSettingsText(character),
    character.firstMessage ? `开场白：${character.firstMessage}` : '',
    character.creatorNotes ? `作者备注：${character.creatorNotes}` : '',
  ].filter(Boolean).join('\n\n'), 2600);
  const candidateList = candidates.map(candidate => ({
    id: candidate.id,
    name: candidate.name,
    source: cardCandidateSourceLabel(candidate.source),
    confidence: candidate.confidence,
    primary: candidate.isPrimary === true,
    snippet: compactText(candidate.snippet, 220),
  }));
  return [
    {
      role: 'system',
      content: [
        '你是 SillyTavern 角色卡导入助手。',
        '任务：从候选列表里判断哪些是真正应该作为独立聊天对象导入的角色。',
        '只允许选择候选列表中已有的 id，不要创造新名字。',
        '排除章节标题、设定分类、世界观概念、关系说明、空泛标签。',
        '如果这是一张单人角色卡，只选择原卡名对应的候选。',
        '只输出 JSON，不要解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        outputSchema: { characterIds: ['候选 id'], reason: '一句话原因' },
        cardContext,
        candidates: candidateList,
      }, null, 2),
    },
  ];
}

export function parseAiCardRecognition(raw: string, candidates: CharacterCardCandidate[]): CharacterCardCandidate[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const rawIds = Array.isArray(record.characterIds)
    ? record.characterIds
    : Array.isArray(record.ids)
      ? record.ids
      : Array.isArray(record.characters)
        ? record.characters
        : [];
  const ids = new Set<string>();
  const names = new Set<string>();
  rawIds.forEach(item => {
    if (typeof item === 'string') {
      ids.add(item);
      names.add(item.trim().toLocaleLowerCase());
      return;
    }
    if (item && typeof item === 'object') {
      const itemRecord = item as Record<string, unknown>;
      if (typeof itemRecord.id === 'string') ids.add(itemRecord.id);
      if (typeof itemRecord.name === 'string') names.add(itemRecord.name.trim().toLocaleLowerCase());
    }
  });
  return candidates.filter(candidate =>
    ids.has(candidate.id) || names.has(candidate.name.trim().toLocaleLowerCase()),
  );
}

export function cleanGeneratedIntro(value: string): string {
  return compactText(
    value
      .replace(/<\/?msg>/gi, '')
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .trim(),
    220,
  );
}

export async function generateImportProfileNote(character: CharacterProfile): Promise<boolean> {
  if (!modelIsReady()) return false;
  const instruction = [
    `请只基于角色卡、人设和世界书，为「${character.name}」写一段给用户看的角色介绍。`,
    '用途：显示在角色信息和聊天页开头的浅色备注框，让用户快速知道这个角色是谁、来自哪里、主要性格/经历、当前处境，以及和 user 已有的关系背景。',
    '这不是聊天开场，不是 first_mes，不是聊天的引子；不要写“你打开聊天”“她给你发来消息”“要不要和她聊聊”等邀聊句。',
    '要求：中文，2 到 4 句，80 到 180 字；像角色小档案摘要，具体但克制。',
    '不要输出 <msg>、角色对白、标题、列表、引号、Markdown、JSON 或解释文字。',
    '不要写说话方式、语言风格或输出格式；不要代替用户行动，不要扩写成小说；设定不足时只概括已知背景和关系，不要硬编大段设定。',
  ].join('\n');
  const content = await callModel(character, instruction, true, false, undefined, { contextMessages: [] });
  const intro = cleanGeneratedIntro(content);
  if (!intro) return false;
  character.profileNote = intro;
  saveState();
  return true;
}

export function cleanGeneratedPacingStrategy(value: string): string {
  return compactText(
    value
      .replace(/<\/?msg>/gi, '')
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .trim(),
    900,
  );
}

export async function generateImportAutoMessagePacingStrategy(character: CharacterProfile): Promise<boolean> {
  if (!modelIsReady()) return false;
  const instruction = [
    `请只基于角色卡、人设、世界书和背景备注，为「${character.name}」写一段“主动消息节奏策略”。`,
    '用途：当角色每隔一段时间主动私聊 user 后，如果 user 没有回复，应用会参考这段自然语言决定试探、等待、降频或沉默的节奏。',
    '必须覆盖：正常主动联系倾向；连续 1 次未回复；连续 2 到 3 次未回复；连续 4 次以上未回复；关系亲近或紧张时如何微调。',
    '要求：中文，5 到 8 条短句；像给应用看的规则，不要写角色对白，不要写 JSON，不要写代码，不要输出 <msg> 标签。',
  ].join('\n');
  const content = await callModel(character, instruction, true, false);
  const strategy = cleanGeneratedPacingStrategy(content);
  if (!strategy) return false;
  character.autoMessage.pacingStrategy = strategy;
  saveState();
  return true;
}
