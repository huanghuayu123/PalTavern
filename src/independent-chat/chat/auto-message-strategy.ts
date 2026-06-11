/**
 * 大注释：Proactive-message pacing module.
 * Calculates interval, throttling, and pacing-state behavior for proactive messages.
 */
import type { CharacterProfile } from '../core/types';

export type AutoMessagePacingStyle = 'clingy' | 'reserved' | 'sensitive' | 'balanced';

export const DEFAULT_AUTO_MESSAGE_PACING_STRATEGY = [
  '主动消息节奏按上方的基础间隔执行。',
  '如果用户连续没有回复，不要继续用同样频率打扰；要根据关系状态和角色性格逐步放慢。',
  '第一次未回复后可以轻轻试探；多次未回复后要明显拉长间隔，必要时进入一段沉默。',
  '关系亲近时可以稍微更自然地惦记用户；关系紧张时要更克制。',
  '主动消息内容要像角色自己想起用户后发来的私聊，不要解释规则。',
].join('\n');

function characterSourceText(character?: Partial<CharacterProfile>): string {
  if (!character) return '';
  let bookText = '';
  try {
    bookText = character.characterBook ? JSON.stringify(character.characterBook).slice(0, 6000) : '';
  } catch {
    bookText = '';
  }
  return [
    character.name,
    character.nickname,
    character.description,
    character.personality,
    character.scenario,
    character.profileNote,
    character.systemPrompt,
    character.postHistoryInstructions,
    bookText,
  ].filter((item): item is string => typeof item === 'string' && item.trim().length > 0).join('\n').toLowerCase();
}

export function inferAutoMessagePacingStyle(text: string): AutoMessagePacingStyle {
  const source = text.toLowerCase();
  if (/傲娇|敏感|试探|不安|别扭|嘴硬|tsundere|sensitive/.test(source)) return 'sensitive';
  if (/克制|冷淡|理性|疏离|沉稳|沉默|少联系|不打扰|拉长|冷却|reserved/.test(source)) return 'reserved';
  if (/黏|粘人|依赖|占有|热情|主动型|忍不住|频繁|轻微放慢|clingy/.test(source)) return 'clingy';
  return 'balanced';
}

function styleLabel(style: AutoMessagePacingStyle): string {
  const labels: Record<AutoMessagePacingStyle, string> = {
    clingy: '黏人主动型',
    reserved: '克制疏离型',
    sensitive: '敏感试探型',
    balanced: '均衡自然型',
  };
  return labels[style];
}

export function createAutoMessagePacingStrategy(character?: Partial<CharacterProfile>): string {
  const name = character?.name?.trim() || '这个角色';
  const style = inferAutoMessagePacingStyle(characterSourceText(character));
  const common = [
    `节奏倾向：${styleLabel(style)}。`,
    `正常状态下，${name} 可以按基础间隔自然想起用户并主动联系。`,
    '这段策略会同时影响下次主动消息的间隔和主动消息生成时的语气。',
  ];
  const rules: Record<AutoMessagePacingStyle, string[]> = {
    clingy: [
      '用户连续 1 次未回复时，只轻微放慢；可以发一条短而有分寸的确认或撒娇式试探。',
      '用户连续 2 到 3 次未回复时，仍会惦记用户，但每次都要更短、更轻，不要连续追问。',
      '用户连续 4 次以上未回复时进入冷却，保留关心但明显拉长间隔。',
      '关系亲近时可以稍微更主动；关系紧张时不要用占有欲压迫用户。',
    ],
    reserved: [
      '用户连续 1 次未回复时，就明显拉长间隔，像是不想打扰。',
      '用户连续 2 次以上未回复时进入沉默，只在很久之后用一句很轻的消息重新开口。',
      '不要连续确认、不要追问用户为什么不回。',
      '关系亲近时可以稍微缩短沉默；关系紧张时要更克制。',
    ],
    sensitive: [
      '用户连续 1 次未回复时，可以先保留一次轻微试探，语气带一点不安或别扭。',
      '试探后仍未回复时进入较长沉默，不要继续追问。',
      '重新开口时要像忍了很久才发出的一句短消息。',
      '关系亲近时可以更柔软；关系紧张时更容易退回沉默。',
    ],
    balanced: [
      '用户连续 1 次未回复时，轻微放慢，并只发自然的短消息。',
      '用户连续 2 到 3 次未回复时，逐步拉长间隔，减少主动联系密度。',
      '用户连续 4 次以上未回复时进入冷却或沉默，避免刷屏。',
      '关系亲近时可以稍微更自然地联系；关系紧张时更谨慎。',
    ],
  };
  return [...common, ...rules[style]].join('\n');
}

export function pacingStrategyFor(character: CharacterProfile): string {
  const strategy = character.autoMessage.pacingStrategy?.trim();
  return strategy || createAutoMessagePacingStrategy(character);
}

export function pacingStyleFor(character: CharacterProfile): AutoMessagePacingStyle {
  const strategy = character.autoMessage.pacingStrategy?.trim() ?? '';
  if (strategy && strategy !== DEFAULT_AUTO_MESSAGE_PACING_STRATEGY) {
    const style = inferAutoMessagePacingStyle(strategy);
    if (style !== 'balanced' || /均衡|自然|逐步|冷却|沉默/.test(strategy)) return style;
  }
  return inferAutoMessagePacingStyle(characterSourceText(character));
}
