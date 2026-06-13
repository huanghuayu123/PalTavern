/**
 * 大注释：Automation scheduler module.
 * Coordinates proactive messages, auto moments, and world events without letting the UI own timer state.
 */
import { appendAssistantReply, setStatusText } from '../chat/private-chat';
import { pacingStrategyFor, pacingStyleFor } from '../chat/auto-message-strategy';
import {
  backgroundInteractionReadiness,
  runBackgroundCharacterInteraction,
  scheduleNextBackgroundInteraction,
} from '../social/background-interactions';
import { generateWorldEvent } from '../social/events';
import { recordImpact, recordTimelineEntryImpact } from '../memory/impacts';
import { callModel } from '../model/client';
import { generateCharacterMoment, spreadMomentInteractions } from '../social/moments';
import { sendLocalNotification } from '../platform/notifications';
import { installNativeBackgroundCheckHandler, requestNativeBackgroundSchedule } from '../platform/runtime';
import {
  createDefaultAutoEventSchedule,
  createDefaultAutoMomentSchedule,
  ensureConversation,
  hasModelBudget,
  messagesFor,
  saveState,
  state,
} from '../core/state';
import { addAutoMessageTimelineEntry } from '../memory/timeline';
import { waitForModelTyping } from '../chat/typing-delay';
import type { AutoEventSchedule, AutoMomentSchedule, CharacterProfile, PacingState, QuietHours } from '../core/types';

const CHECK_INTERVAL_MS = 60 * 1000;
const WORLD_AUTO_EVENT_DAILY_MAX = 8;
const HIGH_SIM_WORLD_AUTO_EVENT_DAILY_MAX = 12;
let schedulerHandle: number | undefined;
let isTicking = false;

// 小注释：调度器只保存节奏和触发判断，真正写入聊天、动态、事件的动作仍交给对应领域模块。
function randomBetween(min: number, max: number): number {
  const floor = Math.max(1, Math.min(min, max));
  const ceiling = Math.max(floor, Math.max(min, max));
  return floor + Math.random() * (ceiling - floor);
}

function parseClock(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) {
    return null;
  }
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours <= 23 && minutes <= 59 ? hours * 60 + minutes : null;
}

export function isQuietNow(schedule: { quietHours: QuietHours }, now = new Date()): boolean {
  if (!schedule.quietHours.enabled) {
    return false;
  }
  const start = parseClock(schedule.quietHours.start);
  const end = parseClock(schedule.quietHours.end);
  if (start === null || end === null || start === end) {
    return false;
  }
  const current = now.getHours() * 60 + now.getMinutes();
  return start < end ? current >= start && current < end : current >= start || current < end;
}

function momentSchedule(character: CharacterProfile): AutoMomentSchedule {
  if (!character.autoMoment) {
    character.autoMoment = createDefaultAutoMomentSchedule();
  }
  return character.autoMoment;
}

function eventSchedule(character: CharacterProfile): AutoEventSchedule {
  if (!character.autoEvent) {
    character.autoEvent = createDefaultAutoEventSchedule();
  }
  return character.autoEvent;
}

function postedTodayCount(character: CharacterProfile, now = Date.now()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return state.moments.filter(moment =>
    moment.characterId === character.id
    && (moment.source === 'character' || moment.source === 'auto_character')
    && moment.createdAt >= start.getTime(),
  ).length;
}

function generatedEventTodayCount(character: CharacterProfile, now = Date.now()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return state.worldEvents.filter(event =>
    event.worldId === character.worldId
    && event.source === 'auto_model'
    && event.participantCharacterIds.includes(character.id)
    && event.createdAt >= start.getTime(),
  ).length;
}

function worldGeneratedEventTodayCount(worldId: string, now = Date.now()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return state.worldEvents.filter(event =>
    event.worldId === worldId
    && event.source === 'auto_model'
    && event.createdAt >= start.getTime(),
  ).length;
}

function worldAutoEventDailyLimit(worldId: string): number {
  const characterCount = state.characters.filter(character => character.worldId === worldId).length;
  return state.worldInteractionHighSimulation
    ? Math.max(3, Math.min(HIGH_SIM_WORLD_AUTO_EVENT_DAILY_MAX, Math.ceil(characterCount * 1.5)))
    : Math.max(2, Math.min(WORLD_AUTO_EVENT_DAILY_MAX, Math.ceil(characterCount * 0.75)));
}

export function scheduleNextMoment(character: CharacterProfile, from = Date.now()): void {
  const schedule = momentSchedule(character);
  schedule.nextAttemptAt = from + randomBetween(schedule.baseIntervalMin, schedule.baseIntervalMax);
  schedule.statusReason = '已按角色动态随机间隔安排下一次发布。';
}

export function scheduleNextEvent(character: CharacterProfile, from = Date.now()): void {
  const schedule = eventSchedule(character);
  schedule.nextAttemptAt = from + randomBetween(schedule.baseIntervalMin, schedule.baseIntervalMax);
  schedule.statusReason = '已按岛上生活节奏安排下一次事件检查。';
}

export function setAutoMomentEnabled(character: CharacterProfile, enabled: boolean): void {
  const schedule = momentSchedule(character);
  schedule.enabled = enabled;
  if (enabled) {
    if (!schedule.nextAttemptAt || schedule.nextAttemptAt <= Date.now()) {
      scheduleNextMoment(character);
    }
  } else {
    schedule.nextAttemptAt = null;
    schedule.statusReason = '自动动态已关闭。';
  }
}

export function setAutoEventEnabled(character: CharacterProfile, enabled: boolean): void {
  const schedule = eventSchedule(character);
  schedule.enabled = enabled;
  if (enabled) {
    if (!schedule.nextAttemptAt || schedule.nextAttemptAt <= Date.now()) {
      scheduleNextEvent(character);
    }
  } else {
    schedule.nextAttemptAt = null;
    schedule.statusReason = '自动岛上事件已关闭。';
  }
}

function sentTodayCount(character: CharacterProfile, now = Date.now()): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return state.messages.filter(message =>
    message.characterId === character.id
    && message.role === 'assistant'
    && message.source === 'auto_message'
    && message.createdAt >= start.getTime(),
  ).length;
}

export function pacingFor(character: CharacterProfile): {
  state: PacingState;
  multiplier: number;
  reason: string;
} {
  const unanswered = character.autoMessage.unansweredCount;
  if (unanswered <= 0) {
    return { state: 'normal', multiplier: 1, reason: '按基础随机间隔联系。' };
  }

  const relationshipFactor = character.relationship.stage === 'intimate'
    ? 0.85
    : character.relationship.stage === 'strained' ? 1.35 : 1;
  const profile = pacingStyleFor(character);
  if (profile === 'clingy') {
    return {
      state: unanswered >= 4 ? 'cooldown' : 'waiting',
      multiplier: Math.min((1.25 + unanswered * 0.25) * relationshipFactor, 2.8),
      reason: '角色偏黏人，未回复后只轻微放慢。',
    };
  }
  if (profile === 'reserved') {
    return {
      state: unanswered >= 2 ? 'silent' : 'cooldown',
      multiplier: Math.min((2 + unanswered * 1.1) * relationshipFactor, 6.5),
      reason: '角色偏克制，未回复后明显拉长间隔。',
    };
  }
  if (profile === 'sensitive') {
    return unanswered === 1
      ? { state: 'probe', multiplier: 1.15 * relationshipFactor, reason: '角色偏敏感，先保留一次轻微试探。' }
      : {
        state: 'silent',
        multiplier: Math.min((3 + unanswered * 1.4) * relationshipFactor, 7.5),
        reason: '试探后仍未回复，进入较长时间沉默。',
      };
  }
  return {
    state: unanswered >= 3 ? 'cooldown' : 'waiting',
    multiplier: Math.min((1.6 + unanswered * 0.7) * relationshipFactor, 5),
    reason: '根据未回复次数与关系状态逐步放慢联系。',
  };
}

export function scheduleNextAttempt(character: CharacterProfile, from = Date.now()): void {
  const schedule = character.autoMessage;
  const pacing = pacingFor(character);
  const interval = Math.min(
    randomBetween(schedule.baseIntervalMin, schedule.baseIntervalMax) * pacing.multiplier,
    schedule.maxInterval,
  );
  schedule.currentPacingState = pacing.state;
  schedule.pacingReason = pacing.reason;
  schedule.nextAttemptAt = from + interval;
}

function autoMessageTriggerReason(character: CharacterProfile, userRepliedAfterLastAuto: boolean): string {
  const schedule = character.autoMessage;
  if (!userRepliedAfterLastAuto && schedule.unansweredCount > 0) {
    return `因为你还没有回复，${character.name} 还是忍不住又确认了一次。`;
  }
  if (schedule.unansweredCount > 0) {
    return `因为上次主动联系后关系还没恢复正常节奏，${character.name} 先轻轻试探。`;
  }
  if (character.relationship.stage === 'close' || character.relationship.stage === 'intimate') {
    return `因为你们已经比较亲近，${character.name} 会更自然地想起你。`;
  }
  if (character.relationship.stage === 'strained') {
    return `因为关系有些紧绷，${character.name} 还是想确认你们之间的距离。`;
  }
  return schedule.pacingReason || `因为到了预定的主动联系时间，${character.name} 想和你说句话。`;
}

export function enableAutoMessage(character: CharacterProfile): void {
  character.autoMessage.enabled = true;
  if (!character.autoMessage.nextAttemptAt || character.autoMessage.nextAttemptAt <= Date.now()) {
    scheduleNextAttempt(character);
  }
}

export function disableAutoMessage(character: CharacterProfile): void {
  character.autoMessage.enabled = false;
  character.autoMessage.nextAttemptAt = null;
  character.autoMessage.pacingReason = '主动消息已关闭。';
}

export function applyResetDecision(character: CharacterProfile, decision: 'restore' | 'keep'): void {
  const schedule = character.autoMessage;
  schedule.pendingResetDecision = false;
  if (decision === 'restore') {
    schedule.unansweredCount = 0;
    schedule.currentPacingState = 'normal';
    schedule.pacingReason = '用户选择恢复正常主动联系频率。';
  } else {
    schedule.pacingReason = '用户选择保持当前降频节奏。';
  }
  if (schedule.enabled) {
    scheduleNextAttempt(character);
  }
  saveState();
}

export function skipMissedAttemptsOnStartup(now = Date.now()): void {
  if (state.worldInteractionNextAttemptAt !== null && state.worldInteractionNextAttemptAt < now) {
    scheduleNextBackgroundInteraction(now);
    state.worldInteractionStatusReason = '应用未运行期间错过的角色互动检查已跳过，不补发。';
  } else if (state.worldInteractionNextAttemptAt === null) {
    scheduleNextBackgroundInteraction(now);
  }
  for (const character of state.characters) {
    const schedule = character.autoMessage;
    if (schedule.enabled && schedule.nextAttemptAt !== null && schedule.nextAttemptAt < now) {
      scheduleNextAttempt(character, now);
      schedule.pacingReason = '应用未运行期间错过的尝试已跳过，不补发。';
    }
    const autoMoment = momentSchedule(character);
    if (autoMoment.enabled && autoMoment.nextAttemptAt !== null && autoMoment.nextAttemptAt < now) {
      scheduleNextMoment(character, now);
      autoMoment.statusReason = '应用未运行期间错过的自动动态已跳过，不补发。';
    } else if (autoMoment.enabled && autoMoment.nextAttemptAt === null) {
      scheduleNextMoment(character, now);
    }
    const autoEvent = eventSchedule(character);
    if (autoEvent.enabled && autoEvent.nextAttemptAt !== null && autoEvent.nextAttemptAt < now) {
      scheduleNextEvent(character, now);
      autoEvent.statusReason = '应用未运行期间错过的岛上事件已跳过，不补发。';
    } else if (autoEvent.enabled && autoEvent.nextAttemptAt === null) {
      scheduleNextEvent(character, now);
    }
  }
  saveState();
}

async function attemptWorldInteraction(): Promise<boolean> {
  const now = Date.now();
  if (state.worldInteractionNextAttemptAt === null) {
    scheduleNextBackgroundInteraction(now);
    return true;
  }
  if (state.worldInteractionNextAttemptAt !== null && state.worldInteractionNextAttemptAt > now) {
    return false;
  }
  const worldIds = [...new Set(state.worlds.map(world => world.id))];
  for (const worldId of worldIds) {
    const readiness = backgroundInteractionReadiness(worldId, undefined, now);
    if (!readiness.ok) {
      state.worldInteractionStatusReason = readiness.reason ?? '本次角色互动检查已跳过。';
      continue;
    }
    const result = await runBackgroundCharacterInteraction(worldId, { countBudget: true, now });
    state.worldInteractionStatusReason = result.reason;
    if (result.ok) break;
  }
  scheduleNextBackgroundInteraction(now);
  return true;
}

export function autoMomentReadiness(character: CharacterProfile, now = Date.now()): string {
  const schedule = momentSchedule(character);
  if (!schedule.enabled) return 'disabled';
  if (schedule.nextAttemptAt === null || schedule.nextAttemptAt > now) return 'not_due';
  if (isQuietNow(schedule, new Date(now))) return 'quiet_hours';
  if (postedTodayCount(character, now) >= schedule.dailyLimit) return 'daily_limit';
  if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) return 'model_not_configured';
  if (!hasModelBudget(now)) return 'budget_limit';
  return 'ready';
}

export function autoEventReadiness(character: CharacterProfile, now = Date.now()): string {
  const schedule = eventSchedule(character);
  if (!schedule.enabled) return 'disabled';
  if (schedule.nextAttemptAt === null || schedule.nextAttemptAt > now) return 'not_due';
  if (isQuietNow(schedule, new Date(now))) return 'quiet_hours';
  if (generatedEventTodayCount(character, now) >= schedule.dailyLimit) return 'daily_limit';
  if (worldGeneratedEventTodayCount(character.worldId, now) >= worldAutoEventDailyLimit(character.worldId)) {
    return 'world_daily_limit';
  }
  if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) return 'model_not_configured';
  if (!hasModelBudget(now)) return 'budget_limit';
  return 'ready';
}

async function attemptCharacterMoment(character: CharacterProfile): Promise<boolean> {
  const schedule = momentSchedule(character);
  const readiness = autoMomentReadiness(character);
  if (readiness !== 'ready') {
    if (readiness !== 'disabled' && readiness !== 'not_due') {
      const reasons: Record<string, string> = {
        quiet_hours: '当前处于自动动态安静时段，本次延后。',
        daily_limit: '今日该角色动态已达上限，本次跳过。',
        model_not_configured: '模型尚未配置，本次自动动态跳过。',
        budget_limit: '今日自动输出预算已用完，本次自动动态跳过。',
      };
      scheduleNextMoment(character);
      schedule.statusReason = reasons[readiness] ?? '本次自动动态未执行。';
      return true;
    }
    return false;
  }
  try {
    const moment = await generateCharacterMoment(character, 'auto_character');
    if (state.worldInteractionHighSimulation) {
      await spreadMomentInteractions(moment.id, {
        maxInterestedComments: 2,
        allowAuthorReplies: true,
        countBudget: true,
      });
    }
    schedule.lastPostedAt = Date.now();
    scheduleNextMoment(character);
    schedule.statusReason = state.worldInteractionHighSimulation
      ? '角色已自动发布动态，并让可见角色判断是否评论。'
      : '角色已自动发布动态。';
  } catch (error) {
    scheduleNextMoment(character);
    schedule.statusReason = `自动动态生成失败，已延后：${error instanceof Error ? error.message : String(error)}`;
  }
  return true;
}

async function attemptCharacterEvent(character: CharacterProfile): Promise<boolean> {
  const schedule = eventSchedule(character);
  const readiness = autoEventReadiness(character);
  if (readiness !== 'ready') {
    if (readiness !== 'disabled' && readiness !== 'not_due') {
      const reasons: Record<string, string> = {
        quiet_hours: '当前处于自动事件安静时段，本次延后。',
        daily_limit: '今日该角色自动事件已达上限，本次跳过。',
        world_daily_limit: '今日岛上自动事件已达总量保护，本次跳过。',
        model_not_configured: '模型尚未配置，本次自动事件跳过。',
        budget_limit: '今日自动输出预算已用完，本次自动事件跳过。',
      };
      scheduleNextEvent(character);
      schedule.statusReason = reasons[readiness] ?? '本次自动事件未执行。';
      return true;
    }
    return false;
  }
  try {
    await generateWorldEvent(character, 'auto_model');
    schedule.lastGeneratedAt = Date.now();
    scheduleNextEvent(character);
    schedule.statusReason = '角色身边生成了一条新的岛上事件。';
  } catch (error) {
    scheduleNextEvent(character);
    schedule.statusReason = `自动事件生成失败，已延后：${error instanceof Error ? error.message : String(error)}`;
  }
  return true;
}

export function autoMessageReadiness(character: CharacterProfile, now = Date.now()): string {
  const schedule = character.autoMessage;
  if (!schedule.enabled) return 'disabled';
  if (schedule.nextAttemptAt === null || schedule.nextAttemptAt > now) return 'not_due';
  if (isQuietNow(schedule, new Date(now))) return 'quiet_hours';
  if (sentTodayCount(character, now) >= schedule.dailyLimit) return 'daily_limit';
  if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) return 'model_not_configured';
  if (!hasModelBudget(now)) return 'budget_limit';
  return 'ready';
}

async function attemptCharacter(character: CharacterProfile): Promise<boolean> {
  const schedule = character.autoMessage;
  const readiness = autoMessageReadiness(character);
  if (readiness !== 'ready') {
    if (readiness !== 'disabled' && readiness !== 'not_due') {
      const reasons: Record<string, string> = {
        quiet_hours: '当前处于安静时段，本次主动消息延后。',
        daily_limit: '今日该角色主动消息已达上限，本次跳过。',
        model_not_configured: '模型尚未配置，本次主动消息跳过。',
        budget_limit: '今日自动输出预算已用完，本次主动消息跳过。',
      };
      scheduleNextAttempt(character);
      schedule.pacingReason = reasons[readiness] ?? '本次主动消息未执行。';
      return true;
    }
    return false;
  }

  const conversation = ensureConversation(character);
  const userRepliedAfterLastAuto = schedule.lastSentAt === null
    || (schedule.lastUserReplyAt !== null && schedule.lastUserReplyAt > schedule.lastSentAt);
  if (!userRepliedAfterLastAuto) {
    schedule.unansweredCount += 1;
  }
  let reply: string;
  try {
    reply = await callModel(character, [
      '现在是角色主动联系用户，不是回复用户刚发来的消息。',
      '结合最近聊天、关系阶段和角色性格，发一条自然、克制、不刷屏的私聊消息。',
      `用户可编辑的主动消息节奏策略：\n${pacingStrategyFor(character)}`,
      `当前未回复次数：${schedule.unansweredCount}；当前节奏状态：${schedule.currentPacingState}；当前节奏说明：${schedule.pacingReason}。`,
      '如果用户之前没有回复，要体现当前的试探、等待、降频或沉默后重新开口的节奏。',
    ].join('\n'), false, true, undefined, {
      contextMessages: messagesFor(character.id, 'user'),
      countBudget: true,
      useChatPreset: true,
    });
  } catch (error) {
    scheduleNextAttempt(character);
    schedule.pacingReason = `本次主动消息生成失败，已延后：${error instanceof Error ? error.message : String(error)}`;
    saveState();
    return true;
  }
  const triggerReason = autoMessageTriggerReason(character, userRepliedAfterLastAuto);
  await waitForModelTyping(reply);
  const generatedMessages = appendAssistantReply(character, conversation, reply, 'auto_message', triggerReason);
  schedule.lastSentAt = Date.now();
  if (userRepliedAfterLastAuto) {
    schedule.unansweredCount = 1;
  }
  scheduleNextAttempt(character);
  const timelineEntry = addAutoMessageTimelineEntry(character, generatedMessages, triggerReason);
  const operationId = `auto_message:${generatedMessages[0]?.id ?? timelineEntry.id}`;
  const impactLabel = `主动消息：${character.name}`;
  recordTimelineEntryImpact(timelineEntry, operationId, impactLabel, timelineEntry.source);
  for (const message of generatedMessages) {
    recordImpact({
      worldId: character.worldId,
      operationId,
      label: impactLabel,
      source: timelineEntry.source,
      targetType: 'message',
      targetId: message.id,
      characterId: character.id,
      oldValue: {
        impactRevokedAt: null,
        recalledAt: message.recalledAt ?? null,
      },
      newValue: {
        content: message.content,
        autoReason: message.autoReason ?? '',
        source: message.source,
      },
      timelineEntryIds: [timelineEntry.id],
      createdAt: message.createdAt,
    });
  }
  saveState();
  if (schedule.backgroundNotificationsEnabled) {
    const notificationText = generatedMessages.map(message => message.content).join(' ').slice(0, 300);
    await sendLocalNotification(character, notificationText, schedule.notificationPrivacy);
  }
  return true;
}

async function tick(onChange: () => void): Promise<void> {
  if (isTicking) return;
  isTicking = true;
  try {
    /**
     * Big guard: a timer pass that only learns "nothing is due yet" must not
     * rebuild the current screen. Rebuilding a focused composer is what made
     * drafts and virtual keyboards look like they were being refreshed away.
     */
    let hasAppVisibleChange = false;
    for (const character of state.characters) {
      // Small guard: preserve the first real change while still running every automation lane.
      hasAppVisibleChange = (await attemptCharacter(character)) || hasAppVisibleChange;
      hasAppVisibleChange = (await attemptCharacterMoment(character)) || hasAppVisibleChange;
      hasAppVisibleChange = (await attemptCharacterEvent(character)) || hasAppVisibleChange;
    }
    hasAppVisibleChange = (await attemptWorldInteraction()) || hasAppVisibleChange;
    if (!hasAppVisibleChange) {
      await requestNativeBackgroundSchedule(getNativeScheduleSummary());
      return;
    }
    setStatusText('主动消息调度检查完成。');
    saveState();
    await requestNativeBackgroundSchedule(getNativeScheduleSummary());
    onChange();
  } finally {
    isTicking = false;
  }
}

export function startAutoMessageScheduler(onChange: () => void): void {
  skipMissedAttemptsOnStartup();
  installNativeBackgroundCheckHandler(() => tick(onChange));
  void requestNativeBackgroundSchedule(getNativeScheduleSummary()).then(message => {
    if (message.includes('已请求')) {
      setStatusText(message);
      onChange();
    }
  });
  if (schedulerHandle !== undefined) {
    window.clearInterval(schedulerHandle);
  }
  schedulerHandle = window.setInterval(() => void tick(onChange), CHECK_INTERVAL_MS);
}

export function runAutoMessageCheckNow(onChange: () => void): Promise<void> {
  return tick(onChange);
}

export function messageCountForDebug(character: CharacterProfile): number {
  return messagesFor(character.id).length;
}

function getNativeScheduleSummary() {
  const enabledMessages = state.characters.filter(character => character.autoMessage.enabled);
  const enabledMoments = state.characters.filter(character => momentSchedule(character).enabled);
  const enabledEvents = state.characters.filter(character => eventSchedule(character).enabled);
  const nextAttempts = [
    ...enabledMessages.map(character => character.autoMessage.nextAttemptAt),
    ...enabledMoments.map(character => momentSchedule(character).nextAttemptAt),
    ...enabledEvents.map(character => eventSchedule(character).nextAttemptAt),
    state.worldInteractionNextAttemptAt,
  ]
    .filter((value): value is number => typeof value === 'number');
  return {
    enabledCharacters: enabledMessages.length + enabledMoments.length + enabledEvents.length,
    nextAttemptAt: nextAttempts.length > 0 ? Math.min(...nextAttempts) : null,
  };
}
