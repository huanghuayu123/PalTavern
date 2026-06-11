/**
 * 大注释：Daily brief module.
 * Summarizes today?s world activity for quiet context and brief text.
 */
import { activeWorld, saveState, state, unreadCountFor } from '../core/state';
import { addTimelineEntry } from './timeline';
import { visibleCharactersForMoment } from '../social/moment-visibility';
import type { CharacterInteractionRecord, CharacterProfile, DailyBrief } from '../core/types';
import { compactText, localDateKey, nowId } from '../core/utils';

type BriefDraft = {
  sections: string[];
  suggestedCharacterIds: string[];
  unreadCount: number;
  changeCount: number;
};

function dayStart(now = Date.now()): number {
  const date = new Date(now);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function worldCharacters(worldId: string): CharacterProfile[] {
  return state.characters.filter(character => character.worldId === worldId);
}

function characterName(id: string): string {
  return state.characters.find(character => character.id === id)?.name ?? '已删除角色';
}

function characterInteractionLine(interaction: CharacterInteractionRecord): string {
  const actor = characterName(interaction.actorCharacterId);
  const targets = interaction.targetCharacterIds.map(characterName).filter(Boolean);
  if (interaction.type === 'world_event' && targets.length > 0) {
    return `${actor} 和 ${targets.join('、')} 一起经历了 ${compactText(interaction.title, 34)}`;
  }
  if (targets.length > 0) {
    return `${actor} 回应了 ${targets.join('、')}：${compactText(interaction.summary, 34)}`;
  }
  return compactText(interaction.title || interaction.summary, 48);
}

function collectBriefDraft(worldId: string, now = Date.now()): BriefDraft {
  const start = dayStart(now);
  const characters = worldCharacters(worldId);
  const suggested = new Set<string>();
  const sections: string[] = [];

  const unreadRows = characters
    .map(character => ({ character, count: unreadCountFor(character.id) }))
    .filter(row => row.count > 0);
  const unreadCount = unreadRows.reduce((sum, row) => sum + row.count, 0);
  if (unreadRows.length > 0) {
    unreadRows.forEach(row => suggested.add(row.character.id));
    sections.push(`未读私聊：${unreadRows.map(row => `${row.character.name} ${row.count} 条`).join('，')}。`);
  }

  const todayMoments = state.moments.filter(moment => moment.worldId === worldId && moment.createdAt >= start);
  const todayComments = todayMoments.flatMap(moment => moment.comments.filter(comment => comment.createdAt >= start));
  if (todayMoments.length > 0 || todayComments.length > 0) {
    const authors = Array.from(new Set(todayMoments.map(moment =>
      moment.characterId ? characterName(moment.characterId) : state.userName,
    ))).slice(0, 4);
    sections.push(`动态：今天有 ${todayMoments.length} 条新动态、${todayComments.length} 条评论${authors.length ? `，来自 ${authors.join('、')}` : ''}。`);
    todayMoments.forEach(moment => {
      if (moment.characterId) suggested.add(moment.characterId);
      visibleCharactersForMoment(moment).forEach(character => suggested.add(character.id));
      moment.comments.forEach(comment => {
        if (comment.characterId) suggested.add(comment.characterId);
      });
    });
  }

  const todayInteractions = state.characterInteractions.filter(interaction =>
    interaction.worldId === worldId && interaction.createdAt >= start,
  );
  if (todayInteractions.length > 0) {
    const lines = todayInteractions
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, 3)
      .map(characterInteractionLine);
    const extra = todayInteractions.length > lines.length ? `，还有 ${todayInteractions.length - lines.length} 件` : '';
    sections.push(`角色互动：${lines.join('；')}${extra}。`);
    todayInteractions.forEach(interaction => {
      if (interaction.actorCharacterId) suggested.add(interaction.actorCharacterId);
      interaction.targetCharacterIds.forEach(id => suggested.add(id));
    });
  }

  const todayEvents = state.worldEvents.filter(event =>
    event.worldId === worldId && (event.createdAt >= start || (event.resolvedAt ?? 0) >= start),
  );
  const activeEvents = todayEvents.filter(event => event.status === 'active');
  const resolvedEvents = todayEvents.filter(event => event.status === 'resolved');
  if (todayEvents.length > 0) {
    sections.push(`生活线索：${activeEvents.length} 件待处理，${resolvedEvents.length} 件已结算。`);
    todayEvents.flatMap(event => event.participantCharacterIds).forEach(id => suggested.add(id));
  }

  const relationshipEntries = state.timelineEntries.filter(entry =>
    entry.worldId === worldId
    && entry.type === 'relationship'
    && !entry.revokedAt
    && entry.createdAt >= start,
  );
  if (relationshipEntries.length > 0) {
    sections.push(`关系变化：${relationshipEntries.slice(0, 3).map(entry => entry.title).join('；')}。`);
    relationshipEntries.flatMap(entry => entry.characterIds).forEach(id => suggested.add(id));
  }

  const delayedReasons = characters.flatMap(character => {
    const reasons = [
      character.autoMessage.pacingReason,
      character.autoMoment.statusReason,
      character.autoEvent.statusReason,
    ].filter(reason =>
      /跳过|延后|失败|预算|安静时段|未配置/.test(reason),
    );
    if (reasons.length > 0) suggested.add(character.id);
    return reasons.map(reason => `${character.name}：${compactText(reason, 52)}`);
  });
  if (delayedReasons.length > 0) {
    sections.push(`自动行为：${delayedReasons.slice(0, 3).join('；')}。`);
  }

  const recentTimeline = state.timelineEntries
    .filter(entry => entry.worldId === worldId && !entry.revokedAt && entry.createdAt >= start)
    .sort((left, right) => right.createdAt - left.createdAt);
  recentTimeline.flatMap(entry => entry.characterIds).forEach(id => suggested.add(id));

  return {
    sections,
    suggestedCharacterIds: Array.from(suggested).filter(id => characters.some(character => character.id === id)).slice(0, 5),
    unreadCount,
    changeCount: unreadCount + todayMoments.length + todayComments.length + todayInteractions.length + todayEvents.length + relationshipEntries.length + delayedReasons.length,
  };
}

function briefSummary(sections: string[]): string {
  return sections.map(section => compactText(section, 120)).join('\n');
}

function existingBrief(worldId: string, dateKey: string): DailyBrief | undefined {
  return state.dailyBriefs.find(brief => brief.worldId === worldId && brief.dateKey === dateKey);
}

export function quietBriefText(): string {
  return '今天暂时没有新的未读、动态、事件或关系变化。';
}

export function todayBriefForActiveWorld(now = Date.now()): DailyBrief | undefined {
  const world = activeWorld();
  const dateKey = localDateKey(now);
  const existing = existingBrief(world.id, dateKey);
  const draft = collectBriefDraft(world.id, now);
  if (draft.changeCount === 0 && !existing) return undefined;

  const createdAt = existing?.createdAt ?? now;
  const brief: DailyBrief = {
    id: existing?.id ?? nowId('brief'),
    worldId: world.id,
    dateKey,
    title: draft.changeCount > 0 ? '今日简报' : '今日安静',
    summary: draft.changeCount > 0 ? briefSummary(draft.sections) : quietBriefText(),
    sections: draft.changeCount > 0 ? draft.sections : [quietBriefText()],
    suggestedCharacterIds: draft.suggestedCharacterIds,
    unreadCount: draft.unreadCount,
    changeCount: draft.changeCount,
    timelineEntryId: existing?.timelineEntryId,
    createdAt,
    updatedAt: now,
  };

  const index = state.dailyBriefs.findIndex(item => item.id === brief.id);
  if (index >= 0) state.dailyBriefs[index] = brief;
  else state.dailyBriefs.push(brief);

  const timelineEntry = addTimelineEntry({
    worldId: world.id,
    type: 'daily_brief',
    title: `${brief.title}：${world.name}`,
    summary: brief.summary,
    source: { type: 'brief', id: brief.id },
    canUndo: false,
    includeInContext: false,
    createdAt: brief.createdAt,
  });
  timelineEntry.summary = brief.summary;
  timelineEntry.includeInContext = false;
  brief.timelineEntryId = timelineEntry.id;
  saveState();
  return brief;
}

export function latestBriefForActiveWorld(): DailyBrief | undefined {
  const worldId = activeWorld().id;
  return state.dailyBriefs
    .filter(brief => brief.worldId === worldId)
    .sort((left, right) => right.updatedAt - left.updatedAt)[0];
}
