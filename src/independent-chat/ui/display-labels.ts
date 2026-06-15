/**
 * 大注释：界面显示文案的集中映射。
 * 业务模块继续保存稳定的英文状态码，UI 在这里把它们翻译成用户能读懂的中文。
 */
import type {
  PacingState,
  RelationshipStage,
  TimelineEntry,
} from '../core/types';

export function formatConversationTime(value?: number): string {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function relationshipStageLabel(stage: RelationshipStage): string {
  const labels: Record<RelationshipStage, string> = {
    stranger: '刚刚认识',
    familiar: '逐渐熟悉',
    close: '关系亲近',
    intimate: '彼此亲密',
    strained: '关系紧张',
  };
  return labels[stage];
}

export function pacingStateLabel(state: PacingState): string {
  const labels: Record<PacingState, string> = {
    normal: '正常节奏',
    probe: '试探联系',
    waiting: '等待回应',
    cooldown: '降频冷却',
    silent: '暂时沉默',
  };
  return labels[state];
}

export function messageTimelineHint(entry?: TimelineEntry): string {
  if (!entry || entry.revokedAt || !entry.includeInContext) return '';
  if (entry.type === 'chat') return '这句话已放进世界记录';
  if (entry.type === 'auto_message') return '这次主动联系已放进世界记录';
  return '';
}

export function countdownText(value?: number | null, disabledText = '未安排'): string {
  if (!value) return disabledText;
  const remaining = value - Date.now();
  if (remaining <= 0) return '等待触发';
  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`;
}

export function timelineTypeLabel(type: TimelineEntry['type']): string {
  const labels: Record<TimelineEntry['type'], string> = {
    chat: '私聊记忆',
    group_chat: '群聊记忆',
    moment: '动态',
    comment: '评论',
    event: '事件',
    relationship: '关系',
    auto_message: '主动消息',
    daily_brief: '今日简报',
    character_status: '角色状态',
    character_interaction: '角色互动',
    system: '系统',
    manual_note: '手动记录',
  };
  return labels[type];
}

export function timelineSourceLabel(entry: TimelineEntry): string {
  const labels: Record<TimelineEntry['source']['type'], string> = {
    message: '消息',
    group_message: '群聊消息',
    direct_chat: '角色私聊',
    moment: '动态',
    comment: '评论',
    event: '世界事件',
    relationship: '关系状态',
    brief: '今日简报',
    status: '角色状态',
    interaction: '角色互动',
    system: '系统记录',
    manual: '手动记录',
  };
  return labels[entry.source.type];
}
