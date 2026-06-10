import { upsertCharacter } from './cards';
import { composeCharacterSettings, setCharacterSettingsWorldBook } from './character-settings';
import { callAuthoringModel } from './model';
import { createAutoMessagePacingStrategy } from './auto-message-strategy';
import { SILLYTAVERN_CARD_SPEC, SILLYTAVERN_CARD_SPEC_VERSION } from './tavern-export';
import {
  createDefaultAutoEventSchedule,
  createDefaultAutoMessageSchedule,
  createDefaultAutoMomentSchedule,
  createDefaultCharacterPlan,
  createDefaultRelationship,
  saveState,
  state,
} from './state';
import type {
  CharacterCardDraft,
  CharacterCardDraftMode,
  CharacterCardDraftStep,
  CharacterProfile,
  ModelMessage,
} from './types';
import { isRecord, nowId } from './utils';

export const SIMPLE_STEPS: CharacterCardDraftStep[] = [
  'identity', 'appearance', 'personality', 'hobbies', 'preview',
];
export const COMPLEX_STEPS: CharacterCardDraftStep[] = [
  'identity', 'appearance', 'hobbies', 'palette', 'reinterpretation', 'preview',
];

export const STEP_LABELS: Record<CharacterCardDraftStep, string> = {
  identity: '角色构想',
  appearance: '外貌',
  personality: '性格',
  hobbies: '爱好',
  palette: '性格调色盘',
  reinterpretation: '二次解释',
  preview: '完成预览',
};

export function stepsFor(draft: CharacterCardDraft): CharacterCardDraftStep[] {
  return draft.mode === 'complex' ? COMPLEX_STEPS : SIMPLE_STEPS;
}

export function createCharacterCardDraft(mode: CharacterCardDraftMode): CharacterCardDraft {
  const now = Date.now();
  const draft: CharacterCardDraft = {
    id: nowId('draft'),
    worldId: state.activeWorldId,
    mode,
    currentStep: 'identity',
    name: '',
    concept: '',
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
  if (draft.mode === 'simple') return draft.personality.trim();
  return [
    draft.palette.trim() ? `【性格调色盘】\n${draft.palette.trim()}` : '',
    draft.reinterpretation.trim() ? `【二次解释】\n${draft.reinterpretation.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

function finalDescription(draft: CharacterCardDraft): string {
  return [
    draft.concept.trim() ? `【角色构想】\n${draft.concept.trim()}` : '',
    draft.appearance.trim() ? `【外貌】\n${draft.appearance.trim()}` : '',
    draft.hobbies.trim() ? `【爱好】\n${draft.hobbies.trim()}` : '',
  ].filter(Boolean).join('\n\n');
}

function authoringExtension(draft: CharacterCardDraft): Record<string, unknown> {
  return {
    draft_id: draft.id,
    mode: draft.mode,
    concept: draft.concept,
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
    personality: finalPersonality(draft),
    firstMessage: draft.firstMessage.trim(),
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
    palette: '按性格调色盘引导：底色、1到2个主色、点缀色，以及每种颜色在具体场景中的衍生表现。让用户做决定，不替用户强行定稿。',
    reinterpretation: '寻找模型最容易误读或写极端的设定，询问用户“这不意味着什么、正确理解是什么、在什么条件下例外”。二次解释必须尊重用户原意。',
    preview: '检查设定是否自洽，指出缺口并提出少量修改建议，不擅自增加新设定。',
  };
  return guidance[step];
}

function draftContext(draft: CharacterCardDraft): string {
  return [
    `角色名：${draft.name || '未命名'}`,
    `核心构想：${draft.concept || '未填写'}`,
    `外貌：${draft.appearance || '未填写'}`,
    `性格：${draft.personality || '未填写'}`,
    `爱好：${draft.hobbies || '未填写'}`,
    `性格调色盘：${draft.palette || '未填写'}`,
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

function palettePresetGuidance(action: 'guide' | 'organize' | 'opening'): string {
  const shared = [
    '【头部约束】保留明月秋青写卡预设的工作方式：角色卡创作要具体、去标签化、反八股；不要把性格写成“温柔、冷淡、傲娇”这种孤立标签。',
    '【打开调色盘模块】当前只开启「📋 性格调色盘」：引导用户写底色、主色调、点缀、衍生。基础信息、三面性、二次解释、NSFW、世界观等模板都先关闭。',
    '【手写优先】衍生必须由用户自己想，导师只能提问、举例、拆步骤、整理格式。不要替用户凭空补完角色性格，不要把猜测当设定。',
    '调色盘结构：',
    '- 底色：角色最深层、始终存在的性格基调。',
    '- 主色调：日常最突出的性格，别人对角色的第一印象，通常 1 到 2 个。',
    '- 点缀：特定条件、特定对象、压力或亲密关系下才会出现的隐藏性格。',
    '- 衍生：每个颜色在具体场景中的行为、台词、本能反应、矛盾表现或跨性格关联。衍生不是解释“这个性格是什么”，而是写“它在生活里怎么发生”。',
    '引导原则：一次只问一个颜色；先确认颜色，再逐个追问衍生；如果用户卡住，就给一个短例子后追问“你的角色会怎么做”。',
    '好问题范式：这个颜色在什么场景会出现？它会让角色做什么具体动作？它会不会和另一个颜色打架？它会不会只对某个人出现？崩溃、放松、被误解、被需要时会怎么变形？',
    '保留用户的怪句子、重复、笨拙表达和不通顺处；这些往往是手写人设的味道。只能修明显错别字，不改写用户句式。',
    '【尾部收束】本阶段只完成性格调色盘。不要输出思维链，不要要求写入世界书路径，不要调用工具，不自动跳到三面性；完成后提醒用户可以继续去二次解释或自己再补衍生。',
  ];
  if (action === 'organize') {
    return [
      ...shared,
      '最终输出格式：',
      '性格调色盘：人的性格就像调色盘，[底色]是底色，[主色调]是主色调，由多种性格衍生组合而成才是活生生的人',
      '主色调：[主色调1]、[主色调2]',
      '底色：[底色]',
      '性格点缀：[点缀]',
      '[颜色]衍生一：[保留用户原句或轻微整理后的具体场景和行为]',
      '[颜色]衍生二：[保留用户原句或轻微整理后的具体场景和行为]',
      '[跨性格衍生（如果用户写了）]：[具体场景和行为]',
      '整理时不添加用户没说过的新颜色；不改写用户句式；不自动跳到三面性。',
    ].join('\n');
  }
  return [
    ...shared,
    '当前引导顺序：',
    '1. 如果用户还没定颜色，只问底色、主色调、点缀分别是什么，并给一个很短的示例。',
    '2. 如果颜色已经定了，挑一个最缺衍生的颜色追问。一次只问一个颜色，最多给 2 个启发问题。',
    '3. 如果衍生已经很多，帮用户检查有没有生活场景、矛盾关联、特定对象、本能反应这四类缺口。',
    '回复方式：先用一句话确认用户已有素材，再问下一步；不要一次塞完整教程。',
  ].join('\n');
}

export function buildAuthoringTutorMessages(
  draft: CharacterCardDraft,
  step: CharacterCardDraftStep,
  userText: string,
  action: 'guide' | 'organize' | 'opening',
): ModelMessage[] {
  const transcript = draft.conversations[step] ?? [];
  const stepInstruction = step === 'palette'
    ? palettePresetGuidance(action)
    : [stepGuidance(step), defaultActionGuidance(action)].join('\n\n');
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
