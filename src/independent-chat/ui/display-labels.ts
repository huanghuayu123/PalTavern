/**
 * 大注释：界面显示文案的集中映射。
 * 业务模块继续保存稳定的英文状态码，UI 在这里把它们翻译成用户能读懂的中文。
 */
import type {
  CharacterProfile,
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

const CONTACT_FIELD_LABELS = [
  '角色描述',
  '角色构想',
  '角色卡正文',
  '最终内容',
  '候选稿',
  '年龄',
  '背景故事',
  '备注',
  '外貌',
  '性格',
  '爱好',
  '性格细节',
  '补充解释',
  '当前场景',
  '开场白',
  'first_mes',
  'first message',
  'first_message',
  'opening',
];

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function compactLine(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function stripContactFieldLabelPrefix(line: string): string {
  const labels = CONTACT_FIELD_LABELS.map(escapeRegExp).join('|');
  const labelPattern = new RegExp(
    `^\\s*(?:[-*•>]\\s*)?(?:【\\s*(?:${labels})\\s*】|(?:${labels})\\s*[:：])\\s*`,
    'iu',
  );
  const bareLabelPattern = new RegExp(`^\\s*(?:${labels})\\s*$`, 'iu');
  let next = line
    .replace(/^[ \t]*#{1,6}[ \t]+/, '')
    .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
    .replace(/__([^_\n]+?)__/g, '$1')
    .trim();
  let previous = '';
  while (next && next !== previous) {
    previous = next;
    next = next.replace(labelPattern, '').trim();
  }
  return bareLabelPattern.test(next) ? '' : next;
}

function isGenericContactLine(character: CharacterProfile, line: string): boolean {
  const name = character.name.trim();
  return (
    line === '未填写'
    || line === '暂无'
    || line === '尚未填写'
    || line.includes('最近按自己的生活节奏行动')
    || (Boolean(name) && line === `${name} 设定`)
  );
}

function firstNaturalContactLine(character: CharacterProfile, text?: string): string {
  if (!text?.trim()) return '';
  const lines = text
    .split(/\r?\n/)
    .map(stripContactFieldLabelPrefix)
    .map(line => line.replace(/^[“”"']+|[“”"']+$/g, '').trim())
    .filter(line => line && !isGenericContactLine(character, line));
  return lines[0] ?? '';
}

export function characterContactSubtitle(
  character: CharacterProfile,
  settingsText = '',
  fallback = '已导入角色卡',
): string {
  const currentPlan = character.currentPlan?.source === 'model' ? character.currentPlan.text : '';
  const candidates = [
    currentPlan,
    character.profileNote,
    character.backgroundStory,
    settingsText,
    character.description,
    character.personality,
    character.scenario,
  ];
  for (const candidate of candidates) {
    const line = firstNaturalContactLine(character, candidate);
    if (line) return compactLine(line, 48);
  }
  return fallback;
}
