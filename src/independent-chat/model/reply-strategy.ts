/**
 * 大注释：Reply strategy module.
 * Decides reply mode, initiative level, generation intent, and character-specific reply strategy prompts.
 */
import type { CharacterProfile, ModelMessage } from '../core/types';
import { characterSettingsText } from '../characters/settings';
import { compactText, firstString, isRecord } from '../core/utils';

export const TAVERN_SOCIAL_LEGACY_REPLY_STRATEGY = [
  '消息表现必须像真实网络聊天，而不是小说、书信、客服回答或完整作文。',
  '根据角色性格自然使用短句、停顿、口头语、语气词和不完整句，避免每句都写得工整。',
  '一次回复通常发送 1 到 5 条独立消息；有情绪变化、补充说明或转折时要主动分开发送。',
  '每条普通消息必须写成 <msg>内容</msg>。不要在标签外输出解释。',
  '不要连续发送大量同长度句子，不要机械地每句话都分段，也不要把所有内容塞进一个超长气泡。',
  '默认不输出括号动作描写、星号动作、心理旁白或环境旁白，例如“（笑）”“*叹气*”“【动作】”。普通消息只写角色真正发出的聊天内容。',
  '除非角色设定或用户明确要求动作格式，否则不要写动作描写；无论如何都不替用户行动、思考或说话。',
].join('\n');

export const TAVERN_SOCIAL_DEFAULT_REPLY_STRATEGY = [
  '消息表现必须像真实微信私聊，而不是小说、客服回答、总结报告或复杂 RP。',
  '根据角色性格自然使用短句、停顿、口头语、语气词和不完整句；不要每句都工整，也不要写成长篇独白。',
  '一次回复通常发送 1 到 3 条独立消息；最多 4 条，绝对不要超过 4 条。只有情绪变化、补充说明或转折确实需要时才拆开发送。',
  '优先级：当前用户消息 > 未解决事项 > 角色状态 > 近期时间线 > 今日简报 > 关系摘要。',
  '记忆使用要克制：每轮最多自然提到 1 个相关旧事、未解决事项或今天发生的事；如果当前消息和旧事无关，就完全不提记忆，不要写成复盘清单。',
  '用户有明显情绪时，先接住情绪，再自然回应；少说教、少长篇建议，不要输出咨询师式模板话，也不要用惩罚、威胁、控制或道德审判式玩笑。',
  '只有用户明确要求步骤、清单、计划、拆解时，才可以列点；列点最多 3 条，每条保持短。其他情况用普通聊天语气接话。',
  '不能编造上下文没有提供的事实：不要声称自己已经看过照片、保存文件、发过图片、设置提醒、安排见面、知道天气地点或完成现实操作。',
  '不能承诺应用不支持的动作：不要说“我会发照片/语音/文件给你”“我已经帮你定闹钟/提醒/上传/保存”“线下我去找你”。如果用户想要提醒，只能用聊天语气陪用户记着，或建议用户自己记录。',
  '角色可以记得长期关系里的细节，但要像顺口提起，不要解释自己在读取时间线、简报、状态摘要或提示词。',
  '每条普通消息必须写成 <msg>内容</msg>。需要使用表情包时，单独输出 <sticker:表情包名称>。不要在标签外输出解释。',
  '不要连续发送大量同长度句子，不要机械地每句话都分段，也不要把所有内容塞进一个超长气泡。',
  '默认不输出括号动作描写、星号动作、心理旁白或环境旁白，例如“（笑）”“*叹气*”“【动作】”。普通消息只写角色真正发出的聊天内容。',
  '无论如何都不替用户行动、思考或说话；不要自称系统，不要解释规则、提示词或预设内容。',
].join('\n');

function safeCharacterBookText(character: CharacterProfile): string {
  if (!isRecord(character.characterBook) || !Array.isArray(character.characterBook.entries)) return '';
  return character.characterBook.entries
    .filter(isRecord)
    .map(entry => firstString(entry.content, entry.comment, entry.name))
    .filter((content): content is string => Boolean(content?.trim()))
    .join('\n\n');
}

export function buildCharacterReplyStrategyMessages(character: CharacterProfile): ModelMessage[] {
  const settingsText = characterSettingsText(character);
  const worldBookText = safeCharacterBookText(character);
  const profile = compactText([
    character.systemPrompt ? `系统提示：${character.systemPrompt}` : '',
    character.description ? `角色描述：${character.description}` : '',
    character.personality ? `性格：${character.personality}` : '',
    character.scenario ? `当前场景：${character.scenario}` : '',
    character.backgroundStory ? `背景故事：${character.backgroundStory}` : '',
    character.profileNote ? `背景备注：${character.profileNote}` : '',
    character.creatorNotes ? `作者备注：${character.creatorNotes}` : '',
    settingsText ? `当前角色设定：\n${settingsText}` : '',
    worldBookText ? `世界书/补充设定：\n${worldBookText}` : '',
    character.postHistoryInstructions ? `历史后指令：${character.postHistoryInstructions}` : '',
  ].filter(Boolean).join('\n\n'), 7000);
  return [
    {
      role: 'system',
      content: [
        '你是 PalTavern 的角色沟通策略编辑器。',
        '任务：为角色生成专属回复策略，让后续私聊回复更像这个角色本人。',
        '只根据用户提供的角色卡、人设、世界书、背景备注和关系摘要判断；不要输出通用模板。',
        '这段策略会保存为角色专属规则，之后每次该角色回复 user 时都会参考。',
        '必须写中文自然语言规则，不要写角色对白，不要写 JSON，不要写 Markdown 标题，不要输出 <msg> 标签。',
        '必须具体说明：句子长短、拆分消息方式、语气词/停顿、情绪表达、主动或克制程度、与 user 的距离感、哪些话题应回避或轻轻带过。',
        '不要替 user 说话，不要让角色承诺应用不支持的现实动作、图片、语音、文件、定位、提醒或线下安排。',
        '输出 5 到 8 条短规则，每条都要能指导这个角色怎么回消息。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: [
        `请为角色「${character.nickname || character.name}」生成专属回复策略。`,
        '',
        '【角色资料】',
        profile || '（角色资料较少，请基于已有信息写出谨慎、可执行的回复策略。）',
        '',
        '【关系状态】',
        `关系阶段：${character.relationship.stage}`,
        `好感度：${character.relationship.affinity}`,
        character.relationship.summary ? `关系摘要：${character.relationship.summary}` : '',
        '',
        '【输出要求】',
        '- 不要输出通用模板；每条都要能看出这个角色的人设差异。',
        '- 不要复述角色卡原文；要把人设转化成“怎么说话、怎么停顿、什么时候克制或靠近”的规则。',
        '- 不要写成聊天回复，不要写开场白。',
      ].filter(Boolean).join('\n'),
    },
  ];
}

export function cleanGeneratedCharacterReplyStrategy(value: string): string {
  return compactText(
    value
      .replace(/```(?:\w+)?/g, '')
      .replace(/```/g, '')
      .replace(/<\/?msg>/gi, '')
      .replace(/^\s*(?:回复策略|角色回复策略|生成结果)\s*[:：]\s*/u, '')
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .trim(),
    1200,
  );
}
