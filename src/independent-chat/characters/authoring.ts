/**
 * 大注释：Character authoring module.
 * Turns user inputs into structured character-card drafts and model generation requests.
 */
import { upsertCharacter } from './cards';
import { composeCharacterSettings, setCharacterSettingsWorldBook } from './settings';
import { callAuthoringModel } from '../model/client';
import { createAutoMessagePacingStrategy } from '../chat/auto-message-strategy';
import { SILLYTAVERN_CARD_SPEC, SILLYTAVERN_CARD_SPEC_VERSION } from './tavern-export';
import {
  createDefaultAutoEventSchedule,
  createDefaultAutoMessageSchedule,
  createDefaultAutoMomentSchedule,
  createDefaultCharacterPlan,
  createDefaultRelationship,
  saveState,
  state,
} from '../core/state';
import type {
  CharacterCardDraft,
  CharacterCardDraftMode,
  CharacterCardDraftStep,
  CharacterProfile,
  ModelMessage,
} from '../core/types';
import { isRecord, nowId } from '../core/utils';

export const SIMPLE_STEPS: CharacterCardDraftStep[] = [
  'identity', 'appearance', 'personality', 'hobbies', 'preview',
];

export const STEP_LABELS: Record<CharacterCardDraftStep, string> = {
  identity: '角色构想',
  appearance: '外貌',
  personality: '性格',
  hobbies: '爱好',
  palette: '性格细节',
  reinterpretation: '二次解释',
  preview: '完成预览',
};

const AUTHORING_FIELD_LABELS = [
  ...Object.values(STEP_LABELS),
  '角色描述',
  '角色卡正文',
  '最终内容',
  '候选稿',
  '角色名',
  '名称',
  '年龄',
  '背景故事',
  '备注',
  '外貌',
  '性格',
  '爱好',
  '性格细节',
  '补充解释',
  '开场白',
  'first_mes',
  'first message',
  'first_message',
  'opening',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanMarkdownShell(output: string): string {
  return output
    .trim()
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

function stripFieldLabelPrefix(line: string): string {
  const labels = AUTHORING_FIELD_LABELS.map(escapeRegExp).join('|');
  const labelPattern = new RegExp(
    `^\\s*(?:[-*•>]\\s*)?(?:【\\s*(?:${labels})\\s*】|(?:${labels})\\s*[:：])\\s*`,
    'iu',
  );
  const bareLabelPattern = new RegExp(`^\\s*(?:${labels})\\s*$`, 'iu');
  let next = line.trim();
  let previous = '';
  while (next && next !== previous) {
    previous = next;
    next = next.replace(labelPattern, '').trim();
  }
  return bareLabelPattern.test(next) ? '' : next;
}

export function cleanAuthoringTutorOutput(output: string): string {
  return cleanMarkdownShell(output);
}

export function cleanAuthoringCandidateText(output: string, _step?: CharacterCardDraftStep): string {
  const cleaned = cleanMarkdownShell(output);
  return cleaned
    .split(/\r?\n/)
    .map(stripFieldLabelPrefix)
    .filter(Boolean)
    .join('\n')
    .trim();
}

export function stepsFor(_draft: CharacterCardDraft): CharacterCardDraftStep[] {
  return SIMPLE_STEPS;
}

export function createCharacterCardDraft(_mode: CharacterCardDraftMode = 'simple'): CharacterCardDraft {
  const now = Date.now();
  const draft: CharacterCardDraft = {
    id: nowId('draft'),
    worldId: state.activeWorldId,
    mode: 'simple',
    currentStep: 'identity',
    name: '',
    concept: '',
    age: '',
    backgroundStory: '',
    profileNote: '',
    appearance: '',
    personality: '',
    hobbies: '',
    palette: '',
    reinterpretation: '',
    firstMessage: '',
    notes: {},
    candidates: {},
    conversations: {},
    createdAt: now,
    updatedAt: now,
  };
  state.characterCardDrafts.push(draft);
  saveState();
  return draft;
}

export function duplicateCharacterCardDraft(source: CharacterCardDraft): CharacterCardDraft {
  const copy = JSON.parse(JSON.stringify(source)) as CharacterCardDraft;
  const now = Date.now();
  copy.id = nowId('draft');
  copy.name = copy.name ? `${copy.name} 副本` : '';
  copy.mode = 'simple';
  if (copy.currentStep === 'palette' || copy.currentStep === 'reinterpretation') copy.currentStep = 'personality';
  copy.linkedCharacterId = undefined;
  copy.createdAt = now;
  copy.updatedAt = now;
  state.characterCardDrafts.push(copy);
  saveState();
  return copy;
}

export function deleteCharacterCardDraft(id: string): void {
  state.characterCardDrafts = state.characterCardDrafts.filter(draft => draft.id !== id);
  saveState();
}

export function touchDraft(draft: CharacterCardDraft): void {
  draft.updatedAt = Date.now();
  saveState();
}

function finalPersonality(draft: CharacterCardDraft): string {
  // 小注释：新草稿只走普通性格页；旧复杂草稿的补充内容仍随角色卡保存，避免用户旧素材丢失。
  return [
    draft.personality.trim(),
    draft.palette.trim() ? `【性格细节】\n${draft.palette.trim()}` : '',
    draft.reinterpretation.trim() ? `【补充解释】\n${draft.reinterpretation.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

function finalDescription(draft: CharacterCardDraft): string {
  return [
    draft.concept.trim() ? `【角色构想】\n${draft.concept.trim()}` : '',
    draft.age.trim() ? `【年龄】\n${draft.age.trim()}` : '',
    draft.backgroundStory.trim() ? `【背景故事】\n${draft.backgroundStory.trim()}` : '',
    draft.appearance.trim() ? `【外貌】\n${draft.appearance.trim()}` : '',
    draft.hobbies.trim() ? `【爱好】\n${draft.hobbies.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

function authoringExtension(draft: CharacterCardDraft): Record<string, unknown> {
  return {
    draft_id: draft.id,
    mode: draft.mode,
    concept: draft.concept,
    age: draft.age,
    background_story: draft.backgroundStory,
    profile_note: draft.profileNote,
    appearance: draft.appearance,
    hobbies: draft.hobbies,
    personality: draft.personality,
    palette: draft.palette,
    reinterpretation: draft.reinterpretation,
    updated_at: new Date(draft.updatedAt).toISOString(),
  };
}

export function characterProfileFromDraft(draft: CharacterCardDraft): CharacterProfile {
  if (!draft.name.trim()) throw new Error('请先填写角色名称。');
  const existing = draft.linkedCharacterId
    ? state.characters.find(character => character.id === draft.linkedCharacterId)
    : undefined;
  const existingRaw = isRecord(existing?.rawCard) ? existing.rawCard : {};
  const existingData = isRecord(existingRaw.data) ? existingRaw.data : {};
  const existingExtensions = isRecord(existingData.extensions) ? existingData.extensions : {};
  const existingTavernSocial = isRecord(existingExtensions.tavern_social)
    ? existingExtensions.tavern_social
    : {};
  const id = existing?.id ?? nowId('card_authored');
  const rawCard = {
    ...existingRaw,
    spec: SILLYTAVERN_CARD_SPEC,
    spec_version: SILLYTAVERN_CARD_SPEC_VERSION,
    data: {
      ...existingData,
      name: draft.name.trim(),
      description: '',
      personality: '',
      first_mes: draft.firstMessage.trim(),
      extensions: {
        ...existingExtensions,
        tavern_social: {
          ...existingTavernSocial,
          authoring: authoringExtension(draft),
        },
      },
    },
  };
  const character: CharacterProfile = {
    id,
    worldId: draft.worldId,
    name: draft.name.trim(),
    description: finalDescription(draft),
    age: draft.age.trim(),
    backgroundStory: draft.backgroundStory.trim(),
    personality: finalPersonality(draft),
    firstMessage: draft.firstMessage.trim(),
    profileNote: draft.profileNote.trim(),
    tags: existing?.tags ?? ['原创角色'],
    importInfo: {
      sourceFormat: 'json',
      spec: SILLYTAVERN_CARD_SPEC,
      specVersion: SILLYTAVERN_CARD_SPEC_VERSION,
      worldBookEntryCount: existing?.importInfo.worldBookEntryCount ?? 0,
      importedFileName: existing?.importInfo.importedFileName ?? '',
    },
    characterBook: existing?.characterBook,
    relationship: existing?.relationship ?? createDefaultRelationship(),
    autoMessage: existing?.autoMessage ?? createDefaultAutoMessageSchedule(),
    autoMoment: existing?.autoMoment ?? createDefaultAutoMomentSchedule(),
    autoEvent: existing?.autoEvent ?? createDefaultAutoEventSchedule(),
    currentPlan: existing?.currentPlan ?? createDefaultCharacterPlan(draft.name.trim()),
    avatar: existing?.avatar,
    customAvatar: existing?.customAvatar,
    stickers: existing?.stickers ?? [],
    rawCard,
    importedAt: existing?.importedAt ?? Date.now(),
  };
  setCharacterSettingsWorldBook(character, composeCharacterSettings({
    description: finalDescription(draft),
    personality: finalPersonality(draft),
  }));
  if (!existing?.autoMessage) {
    character.autoMessage.pacingStrategy = createAutoMessagePacingStrategy(character);
  }
  if (isRecord(rawCard.data)) (rawCard.data as Record<string, unknown>).character_book = character.characterBook;
  return character;
}

export function createCharacterFromDraft(draft: CharacterCardDraft): CharacterProfile {
  const character = characterProfileFromDraft(draft);
  draft.linkedCharacterId = character.id;
  touchDraft(draft);
  upsertCharacter(character);
  return character;
}

function stepGuidance(step: CharacterCardDraftStep): string {
  const guidance: Record<CharacterCardDraftStep, string> = {
    identity: '帮助用户明确角色名称和一句话核心构想。一次只问最关键的1到3个问题。',
    appearance: '引导用户写出容易辨认的外貌，包括体态、面部、发型、穿着和有区分度的细节。避免堆砌空泛形容词。',
    personality: '引导用户写出性格特征及其在具体情境中的行为表现，避免只有标签。',
    hobbies: '引导用户明确角色真正会投入时间的爱好、偏好、厌恶及其原因。',
    palette: '引导用户补充性格细节、具体场景、行为表现和矛盾点。让用户做决定，不替用户强行定稿。',
    reinterpretation: '寻找模型最容易误读或写极端的设定，询问用户“这不意味着什么、正确理解是什么、在什么条件下例外”。二次解释必须尊重用户原意。',
    preview: '检查设定是否自洽，指出缺口并提出少量修改建议，不擅自增加新设定。',
  };
  return guidance[step];
}

function draftContext(draft: CharacterCardDraft): string {
  return [
    `角色名：${draft.name || '未命名'}`,
    `核心构想：${draft.concept || '未填写'}`,
    `年龄：${draft.age || '未填写'}`,
    `背景故事：${draft.backgroundStory || '未填写'}`,
    `备注：${draft.profileNote || '未填写'}`,
    `外貌：${draft.appearance || '未填写'}`,
    `性格：${draft.personality || '未填写'}`,
    `爱好：${draft.hobbies || '未填写'}`,
    `性格细节：${draft.palette || '未填写'}`,
    `二次解释：${draft.reinterpretation || '未填写'}`,
  ].join('\n');
}

function defaultActionGuidance(action: 'guide' | 'organize' | 'opening'): string {
  if (action === 'organize') {
    return '请把现有素材整理成可直接放入角色卡的候选稿。只输出候选稿正文，不写分析和标题外说明。';
  }
  if (action === 'opening') {
    return [
      '请根据设定写一段可直接放入 first_mes 的开场白。',
      '只输出开场白正文，不要输出角色名、核心构想、外貌、性格、爱好、字段名、Markdown 标题、JSON 或解释文字。',
      '开场白要包含自然场景、动作和角色说话，不替用户行动或说话。',
    ].join('\n');
  }
  return '结合已有对话继续引导。先简短回应，再提出最多3个具体问题。';
}

export function buildAuthoringTutorMessages(
  draft: CharacterCardDraft,
  step: CharacterCardDraftStep,
  userText: string,
  action: 'guide' | 'organize' | 'opening',
): ModelMessage[] {
  const transcript = draft.conversations[step] ?? [];
  const stepInstruction = [stepGuidance(step), defaultActionGuidance(action)].join('\n\n');
  const system = [
    '你是角色卡创作导师，不扮演角色。',
    '你的任务是通过清楚、温和、具体的问题帮助用户表达自己的创作意图。',
    '不得把猜测当成用户设定，不得未经允许覆盖用户原文。',
    stepInstruction,
    `当前设定：\n${draftContext(draft)}`,
  ].join('\n\n');
  return [
    { role: 'system', content: system },
    ...transcript.slice(-10).map(exchange => ({ role: exchange.role, content: exchange.content })),
    {
      role: 'user',
      content: userText.trim()
        || (action === 'guide'
          ? '请开始引导我。'
          : action === 'opening'
            ? '请只输出 first_mes 开场白正文。'
            : '请根据现有内容整理。'),
    },
  ];
}

export function cleanGeneratedOpeningMessage(output: string): string {
  let text = output.trim();
  if (!text) return '';

  try {
    const parsed = JSON.parse(text) as unknown;
    if (isRecord(parsed)) {
      const candidate = parsed.first_mes ?? parsed.firstMessage ?? parsed.opening ?? parsed.message;
      if (typeof candidate === 'string' && candidate.trim()) {
        text = candidate.trim();
      }
    }
  } catch {
    // Plain model text is expected here.
  }

  const labelPattern = /(?:^|\n)\s*(?:#+\s*)?(?:\*\*)?\s*(?:开场白(?:\s*[（(]\s*first[_\s-]*mes\s*[）)])?|first[_\s-]*mes|first_message|first message|opening)\s*(?:\*\*)?\s*[:：]\s*(?:\*\*)?/gi;
  let lastLabelEnd = -1;
  while (labelPattern.exec(text) !== null) {
    lastLabelEnd = labelPattern.lastIndex;
  }
  if (lastLabelEnd >= 0) {
    text = text.slice(lastLabelEnd).trim();
  }

  return text
    .replace(/^```(?:\w+)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .replace(/^(?:-{3,}|—{3,})\s*/, '')
    .replace(/\s*(?:-{3,}|—{3,})\s*$/g, '')
    .trim();
}

export async function askAuthoringTutor(
  draft: CharacterCardDraft,
  step: CharacterCardDraftStep,
  userText: string,
  action: 'guide' | 'organize' | 'opening',
): Promise<string> {
  return callAuthoringModel(buildAuthoringTutorMessages(draft, step, userText, action));
}
