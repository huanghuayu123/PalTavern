/**
 * 大注释：Moment module.
 * Creates character moments, comments, spread interactions, and active-world filtering.
 */
import { callModel, type ModelRequestOptions } from '../model/client';
import {
  characterInteractionBudget,
  interactionReasonForMomentComment,
  recordCharacterInteraction,
} from './character-interactions';
import { recordTimelineEntryImpact } from '../memory/impacts';
import {
  canCharacterViewMoment,
  defaultMomentVisibility,
  normalizeMomentVisibilityDraft,
} from './moment-visibility';
import { activeWorld, saveState, state } from '../core/state';
import { companionNow, companionTimeContext, companionTimePeriod } from '../core/time';
import { addMomentCommentTimelineEntry, addMomentTimelineEntry, revokeTimelineSource } from '../memory/timeline';
import type { CharacterProfile, MomentComment, MomentEntry, MomentVisibility } from '../core/types';
import { nowId } from '../core/utils';

export type MomentCommentPromptMode = 'interest' | 'direct' | 'author_reply' | 'author_interest_reply';
type MomentCommentPromptOptions = {
  targetCommentId?: string;
};

type MomentInteractionSpreadOptions = {
  maxInterestedComments?: number;
  allowAuthorReplies?: boolean;
  countBudget?: boolean;
};

export type MomentInteractionSpreadResult = {
  interestedCommentCount: number;
  authorReplyCount: number;
};

export function momentsForActiveWorld(): MomentEntry[] {
  const worldId = activeWorld().id;
  return state.moments
    .filter(moment => moment.worldId === worldId)
    .sort((left, right) => right.createdAt - left.createdAt);
}

export function publishMoment(
  content: string,
  character?: CharacterProfile,
  source: MomentEntry['source'] = character ? 'character' : 'manual',
  visibility: MomentVisibility = defaultMomentVisibility(),
): MomentEntry {
  const text = content.trim();
  if (!text) {
    throw new Error('动态内容不能为空。');
  }
  const moment: MomentEntry = {
    id: nowId('moment'),
    worldId: activeWorld().id,
    characterId: character?.id ?? '',
    content: text,
    createdAt: Date.now(),
    source,
    visibility: normalizeMomentVisibilityDraft(
      visibility.mode,
      visibility.characterIds,
      visibility.blockedCharacterIds,
    ),
    comments: [],
  };
  state.moments.push(moment);
  const timelineEntry = addMomentTimelineEntry(moment, character);
  recordTimelineEntryImpact(
    timelineEntry,
    `moment:${moment.id}:timeline`,
    `动态记忆：${character?.name ?? state.userName}`,
  );
  saveState();
  return moment;
}

export function buildCharacterMomentInstruction(character: CharacterProfile, now = companionNow(state)): string {
  const recentMoments = state.moments
    .filter(moment => moment.worldId === character.worldId && moment.characterId === character.id)
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, 3)
    .map(moment => `- ${moment.content}`)
    .join('\n');

  return [
    `你就是角色“${character.name}”。现在你正拿着自己的手机，要亲自发布一条社交动态。`,
    '这不是系统记录、旁观者描述、当前状态播报，也不是给用户发送私聊。',
    companionTimeContext(state, now),
    `手机当前时段：${companionTimePeriod(now)}。`,
    '先在心里结合自己的身份、年龄、职业或学业、性格、作息、当前世界、近期事件和关系状态，判断这个时间点你最可能愿意在手机上分享什么。',
    '然后直接写出你会真正发布到朋友圈、社交平台或个人主页上的正文。',
    '必须使用角色本人的第一人称口吻，像本人打字发出来的内容，而不是描述“她正在做什么”。',
    '可以是日常分享、照片配文式文字、吐槽、心情、随口一句、隐晦表达或符合人设的网络内容。',
    '内容必须符合当前日期、星期和时段，生活安排要合理。',
    '不要把动态写成对用户的私聊回复，也不要接续、回应或改写私聊里用户说的最后一句话。',
    '除非已有角色设定、聊天或世界事件支持，否则不要凭空确定天气、地点、节日、重大事件或刚刚发生的用户互动。',
    '不要写小说段落，不要使用括号动作、舞台说明、心理旁白、聊天气泡标签、“动态：”或“当前状态：”标题。',
    '只输出最终会发布的正文，通常一到三句。不要解释自己的创作过程。',
    recentMoments ? `该角色最近已经出现过的动态如下。避免重复同一件事或近似措辞：\n${recentMoments}` : '',
  ].filter(Boolean).join('\n');
}

export async function generateCharacterMoment(
  character: CharacterProfile,
  source: 'character' | 'auto_character' = 'character',
  visibility: MomentVisibility = defaultMomentVisibility(),
): Promise<MomentEntry> {
  const normalized = await generateCharacterMomentDraft(character, source === 'auto_character');
  return publishMoment(normalized, character, source, visibility);
}

export async function generateCharacterMomentDraft(
  character: CharacterProfile,
  countBudget = false,
): Promise<string> {
  const content = await callModel(
    character,
    buildCharacterMomentInstruction(character),
    false,
    false,
    undefined,
    { countBudget, contextMessages: [] },
  );
  return content
    .replace(/<\/?msg>/gi, '')
    .replace(/^\s*[（(][\s\S]*[）)]\s*$/u, match => match.slice(1, -1))
    .trim();
}

export function addMomentComment(
  momentId: string,
  content: string,
  character?: CharacterProfile,
  source: MomentComment['source'] = character ? 'model' : 'manual',
  replyToCommentId?: string,
): MomentComment {
  const moment = state.moments.find(item => item.id === momentId && item.worldId === activeWorld().id);
  const text = content.trim();
  if (!moment) throw new Error('找不到这条动态。');
  if (!text) throw new Error('评论内容不能为空。');
  if (character && !canCharacterViewMoment(moment, character)) {
    throw new Error(`${character.name} 看不到这条动态。`);
  }
  const comment: MomentComment = {
    id: nowId('comment'),
    momentId,
    authorType: character ? 'character' : 'user',
    characterId: character?.id ?? '',
    replyToCommentId: replyToCommentId && moment.comments.some(comment => comment.id === replyToCommentId)
      ? replyToCommentId
      : undefined,
    content: text,
    createdAt: Date.now(),
    source,
  };
  moment.comments.push(comment);
  const timelineEntry = addMomentCommentTimelineEntry(moment, comment, character);
  if (character && moment.characterId) {
    if (moment.characterId !== character.id) {
      const author = state.characters.find(item => item.id === moment.characterId);
      recordCharacterInteraction({
        worldId: moment.worldId,
        type: 'moment_comment',
        actorCharacterId: character.id,
        targetCharacterIds: [moment.characterId],
        title: `${character.name} 评论了 ${author?.name ?? '角色'} 的动态`,
        summary: comment.content,
        reason: interactionReasonForMomentComment(character, moment, author),
        source: { type: 'comment', id: comment.id },
        createdAt: comment.createdAt,
      });
    } else if (comment.replyToCommentId) {
      const replied = moment.comments.find(item => item.id === comment.replyToCommentId);
      if (replied?.authorType === 'character' && replied.characterId && replied.characterId !== character.id) {
        const target = state.characters.find(item => item.id === replied.characterId);
        recordCharacterInteraction({
          worldId: moment.worldId,
          type: 'moment_comment',
          actorCharacterId: character.id,
          targetCharacterIds: [replied.characterId],
          title: `${character.name} 回复了 ${target?.name ?? '角色'} 的评论`,
          summary: comment.content,
          reason: `因为 ${target?.name ?? '对方'} 在 ${character.name} 的动态下评论，${character.name} 作为楼主接了这句话。`,
          source: { type: 'comment', id: comment.id },
          createdAt: comment.createdAt,
        });
      }
    }
  }
  recordTimelineEntryImpact(
    timelineEntry,
    `comment:${comment.id}:timeline`,
    `动态评论：${character?.name ?? state.userName}`,
  );
  saveState();
  return comment;
}

function revokeMomentCommentSideEffects(commentId: string): void {
  revokeTimelineSource('comment', commentId);
  const linkedInteractions = state.characterInteractions.filter(interaction =>
    interaction.source.type === 'comment' && interaction.source.id === commentId,
  );
  for (const interaction of linkedInteractions) {
    revokeTimelineSource('interaction', interaction.id);
  }
  if (linkedInteractions.length > 0) {
    const linkedIds = new Set(linkedInteractions.map(interaction => interaction.id));
    state.characterInteractions = state.characterInteractions.filter(interaction => !linkedIds.has(interaction.id));
  }
}

export function deleteMomentComment(momentId: string, commentId: string): boolean {
  const moment = state.moments.find(item => item.id === momentId && item.worldId === activeWorld().id);
  if (!moment) return false;
  const index = moment.comments.findIndex(comment => comment.id === commentId);
  if (index < 0) return false;
  const comment = moment.comments[index];
  const commentsToRemove = new Map<string, MomentComment>([[comment.id, comment]]);
  if (comment.authorType === 'user' && moment.characterId) {
    for (let cursor = index + 1; cursor < moment.comments.length; cursor += 1) {
      const next = moment.comments[cursor];
      if (
        next.authorType === 'character'
        && next.characterId === moment.characterId
        && next.source === 'model'
      ) {
        commentsToRemove.set(next.id, next);
        continue;
      }
      break;
    }
  }
  let foundLinkedReply = true;
  while (foundLinkedReply) {
    foundLinkedReply = false;
    const removeIds = new Set(commentsToRemove.keys());
    for (const reply of moment.comments) {
      if (reply.replyToCommentId && removeIds.has(reply.replyToCommentId) && !removeIds.has(reply.id)) {
        commentsToRemove.set(reply.id, reply);
        foundLinkedReply = true;
      }
    }
  }
  const removeIds = new Set(commentsToRemove.keys());
  moment.comments = moment.comments.filter(item => !removeIds.has(item.id));
  for (const removed of commentsToRemove.values()) {
    revokeMomentCommentSideEffects(removed.id);
  }
  saveState();
  return true;
}

function momentAuthorName(moment: MomentEntry): string {
  if (!moment.characterId) return state.userName;
  return state.characters.find(item => item.id === moment.characterId)?.name ?? '角色';
}

function commentAuthorName(comment: MomentComment): string {
  if (comment.authorType === 'user') return state.userName;
  return state.characters.find(item => item.id === comment.characterId)?.name ?? '角色';
}

export function buildMomentCommentThread(moment: MomentEntry, limit = 8): string {
  const comments = moment.comments.slice(-limit);
  if (comments.length === 0) return '暂无评论。';
  return comments
    .map(comment => {
      const replied = comment.replyToCommentId
        ? moment.comments.find(item => item.id === comment.replyToCommentId)
        : undefined;
      const replyLabel = replied ? ` 回复 ${commentAuthorName(replied)}` : '';
      return `${commentAuthorName(comment)}${replyLabel}：${comment.content}`;
    })
    .join('\n');
}

function latestUserComment(moment: MomentEntry): MomentComment | undefined {
  return [...moment.comments].reverse().find(comment => comment.authorType === 'user');
}

function targetReplyComment(moment: MomentEntry, targetCommentId?: string): MomentComment | undefined {
  return targetCommentId
    ? moment.comments.find(comment => comment.id === targetCommentId)
    : latestUserComment(moment);
}

function momentCommentOutputRules(mode: MomentCommentPromptMode): string {
  const canSkip = mode === 'interest' || mode === 'author_interest_reply';
  return [
    '输出规则：',
    canSkip
      ? '- 如果没兴趣、没话可说、关系不适合或你通常只会默默看，只输出：[跳过]'
      : '- 不允许输出 [跳过]，必须直接输出一条评论正文。',
    '- 只输出最终会发在评论区的正文，不要解释判断过程。',
    '- 不带角色名、称呼前缀、“评论：”标题、<msg> 标签、括号动作、心理旁白或舞台说明。',
    '- 评论一般 1 句，最多 2 句；可以短、口语、含蓄、冷淡，不需要热情。',
    mode === 'author_reply' || mode === 'author_interest_reply'
      ? '- 你是动态楼主时，只回复当前指定评论，不要总结整条动态，也不必每次都热情回应。'
      : '- 不能替动态发布者回复，不能把评论写成私聊长消息。',
  ].join('\n');
}

export function buildMomentCommentPrompt(
  moment: MomentEntry,
  character: CharacterProfile,
  mode: MomentCommentPromptMode,
  options: MomentCommentPromptOptions = {},
): string {
  const authorName = momentAuthorName(moment);
  const thread = buildMomentCommentThread(moment);
  const targetComment = targetReplyComment(moment, options.targetCommentId);
  const targetCommentAuthor = targetComment ? commentAuthorName(targetComment) : state.userName;
  const trigger = mode === 'author_reply'
    ? options.targetCommentId
      ? `${targetCommentAuthor} 在你的动态下评论：${targetComment ? `“${targetComment.content}”` : '（指定评论已不存在，请只做一句自然回应）'}。你只能回复这条指定评论。`
      : `${state.userName} 刚刚在你的动态下评论：${targetComment ? `“${targetComment.content}”` : '（没有找到最新评论，请只做一句自然回应）'}。你只能回复这条最新评论。`
    : mode === 'author_interest_reply'
      ? `${targetCommentAuthor} 在你的动态下评论：${targetComment ? `“${targetComment.content}”` : '（指定评论已不存在）'}。先判断你作为楼主是否自然想回这条指定评论；想回就直接输出回复正文，不想回只输出 [跳过]。`
    : mode === 'interest'
      ? `${authorName} 发布了一条动态，你只是刷到了它。先判断你是否真的会对这条内容产生评论欲望；不要为了礼貌强行评论，也不要把话题强行拉回 ${state.userName}。`
      : '用户指定你来这条动态下留一条评论；跳过兴趣判断，直接评论。';
  return [
    `你就是角色“${character.name}”，正在手机朋友圈/社交动态的评论区打字。`,
    '这不是私聊，不是小说叙事，也不是系统记录。',
    '',
    '【动态正文】',
    `发布者：${authorName}`,
    `正文：${moment.content}`,
    '',
    '【评论区记录】',
    thread,
    '',
    '【当前触发点】',
    trigger,
    '',
    '【判断方式】',
    '结合你的性格、兴趣、生活经历、当前关系和与发布者的关系，只做评论区层面的自然反应。',
    '不要接续、回应或改写你和用户私聊里的最后一句话；这里发生的是动态评论区，不是私聊。',
    '动态正文只用于理解你正在评论什么；评论区记录只来自真实评论，不要把动态正文当作已有评论。',
    '不要承诺应用没有提供的动作或附件：不能说稍后发照片、语音、文件、定位、提醒或私聊，也不能声称已经保存、上传、设置闹钟、安排线下见面。',
    '除非动态正文或真实评论里已经有明确证据，否则不要凭空确认照片、天气、地点、行程、线下互动或用户刚刚做过什么。',
    moment.characterId === character.id
      ? '这是你自己发布的动态时，只能以楼主身份回复评论区，不要假装成其他人。'
      : '这是别人发布的动态时，只能作为路过评论者留言，不要替发布者解释或回复别人。',
    momentCommentOutputRules(mode),
  ].filter(Boolean).join('\n');
}

function normalizeMomentCommentOutput(content: string): string {
  return content
    .replace(/<\/?msg>/gi, '')
    .replace(/^\s*(?:评论|回复|输出)\s*[:：]\s*/u, '')
    .trim();
}

export async function generateCharacterComment(
  moment: MomentEntry,
  character: CharacterProfile,
  options: ModelRequestOptions & MomentCommentPromptOptions = {},
): Promise<MomentComment> {
  const { targetCommentId, ...modelOptions } = options;
  if (!canCharacterViewMoment(moment, character)) {
    throw new Error(`${character.name} 看不到这条动态。`);
  }
  if (moment.characterId && moment.characterId !== character.id) {
    const budget = characterInteractionBudget(moment.worldId, character.id);
    if (!budget.ok) throw new Error(budget.reason ?? '今天角色之间的互动已经够多。');
  }
  const latestComment = moment.comments.at(-1);
  const hasTargetComment = Boolean(targetCommentId && moment.comments.some(comment => comment.id === targetCommentId));
  const replyingAsAuthor = moment.characterId === character.id
    && (hasTargetComment || latestComment?.authorType === 'user');
  const prompt = buildMomentCommentPrompt(
    moment,
    character,
    replyingAsAuthor ? 'author_reply' : 'direct',
    { targetCommentId },
  );
  let content: string;
  try {
    content = await callModel(character, prompt, false, false, undefined, {
      ...modelOptions,
      contextMessages: modelOptions.contextMessages ?? [],
    });
  } catch (error) {
    if (!(error instanceof Error) || !error.message.includes('没有可用文本')) throw error;
    try {
      content = await callModel(
        character,
        `${prompt}\n\n上一次没有得到可用文本。请重新输出一条可直接发送的评论正文。`,
        false,
        false,
        undefined,
        {
          ...modelOptions,
          contextMessages: modelOptions.contextMessages ?? [],
        },
      );
    } catch (retryError) {
      if (!(retryError instanceof Error) || !retryError.message.includes('没有可用文本')) throw retryError;
      content = character.relationship.stage === 'strained'
        ? '看到了。'
        : character.relationship.stage === 'intimate' || character.relationship.stage === 'close'
          ? '怎么了？我在呢。'
          : '发生什么了？';
    }
  }
  return addMomentComment(
    moment.id,
    normalizeMomentCommentOutput(content),
    character,
    'model',
    replyingAsAuthor ? targetCommentId : undefined,
  );
}

export async function generateAuthorReplyIfInterested(
  moment: MomentEntry,
  character: CharacterProfile,
  targetCommentId: string,
  options: ModelRequestOptions = {},
): Promise<MomentComment | null> {
  if (!moment.characterId || moment.characterId !== character.id) return null;
  const targetComment = moment.comments.find(comment => comment.id === targetCommentId);
  if (
    !targetComment
    || targetComment.authorType !== 'character'
    || !targetComment.characterId
    || targetComment.characterId === character.id
  ) {
    return null;
  }
  if (moment.comments.some(comment =>
    comment.replyToCommentId === targetCommentId
    && comment.authorType === 'character'
    && comment.characterId === character.id,
  )) {
    return null;
  }
  const content = (await callModel(
    character,
    buildMomentCommentPrompt(moment, character, 'author_interest_reply', { targetCommentId }),
    false,
    false,
    undefined,
    {
      ...options,
      contextMessages: options.contextMessages ?? [],
    },
  ))
    .replace(/<\/?msg>/gi, '')
    .trim();
  if (isSkippedMomentComment(content)) return null;
  return addMomentComment(moment.id, normalizeMomentCommentOutput(content), character, 'model', targetCommentId);
}

export async function generateInterestedCharacterComment(
  moment: MomentEntry,
  character: CharacterProfile,
): Promise<MomentComment | null> {
  if (moment.characterId === character.id) return null;
  if (!moment.characterId && moment.source !== 'manual') return null;
  if (!canCharacterViewMoment(moment, character)) return null;
  const budget = characterInteractionBudget(moment.worldId, character.id);
  if (!budget.ok) return null;
  if (moment.comments.some(comment => comment.authorType === 'character' && comment.characterId === character.id)) {
    return null;
  }
  const content = (await callModel(
    character,
    buildMomentCommentPrompt(moment, character, 'interest'),
    false,
    false,
    undefined,
    { countBudget: true, contextMessages: [] },
  ))
    .replace(/<\/?msg>/gi, '')
    .trim();
  if (isSkippedMomentComment(content)) return null;
  return addMomentComment(moment.id, normalizeMomentCommentOutput(content), character, 'model');
}

export async function spreadMomentInteractions(
  momentId: string,
  options: MomentInteractionSpreadOptions = {},
): Promise<MomentInteractionSpreadResult> {
  const maxInterestedComments = Math.max(0, Math.floor(options.maxInterestedComments ?? 2));
  const result: MomentInteractionSpreadResult = {
    interestedCommentCount: 0,
    authorReplyCount: 0,
  };
  const moment = state.moments.find(item => item.id === momentId);
  if (!moment || maxInterestedComments <= 0) return result;
  const candidates = state.characters.filter(character =>
    character.worldId === moment.worldId
    && character.id !== moment.characterId
    && canCharacterViewMoment(moment, character),
  );
  const newCharacterComments: MomentComment[] = [];
  for (const character of candidates) {
    if (!state.moments.some(item => item.id === momentId)) break;
    if (result.interestedCommentCount >= maxInterestedComments) break;
    const currentMoment = state.moments.find(item => item.id === momentId);
    if (!currentMoment) break;
    try {
      const comment = await generateInterestedCharacterComment(currentMoment, character);
      if (comment) {
        newCharacterComments.push(comment);
        result.interestedCommentCount += 1;
      }
    } catch (error) {
      console.warn(`Failed to evaluate moment interest for ${character.name}:`, error);
    }
  }
  if (!options.allowAuthorReplies || newCharacterComments.length === 0) return result;
  for (const comment of newCharacterComments) {
    const currentMoment = state.moments.find(item => item.id === momentId);
    const author = currentMoment?.characterId
      ? state.characters.find(character => character.id === currentMoment.characterId)
      : undefined;
    if (!currentMoment || !author) break;
    try {
      const reply = await generateAuthorReplyIfInterested(currentMoment, author, comment.id, {
        countBudget: options.countBudget,
        contextMessages: [],
      });
      if (reply) result.authorReplyCount += 1;
    } catch (error) {
      console.warn(`Failed to generate author reply for ${author.name}:`, error);
    }
  }
  return result;
}

export function buildMomentInterestInstruction(moment: MomentEntry, character: CharacterProfile): string {
  return buildMomentCommentPrompt(moment, character, 'interest');
}

export function isSkippedMomentComment(content: string): boolean {
  return !content.trim() || /^\s*(?:\[?跳过\]?|SKIP|不评论)\s*[。.!！]?\s*$/i.test(content);
}

export function deleteMoment(momentId: string): boolean {
  const index = state.moments.findIndex(moment => moment.id === momentId && moment.worldId === activeWorld().id);
  if (index < 0) {
    return false;
  }
  const [moment] = state.moments.slice(index, index + 1);
  revokeTimelineSource('moment', momentId);
  for (const comment of moment.comments) {
    revokeMomentCommentSideEffects(comment.id);
  }
  state.moments.splice(index, 1);
  saveState();
  return true;
}
