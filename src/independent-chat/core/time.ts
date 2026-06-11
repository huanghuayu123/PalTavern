/**
 * 大注释：Time utility module.
 * Centralizes virtual time, companion-time modes, and date/time formatting.
 */
import type { AppState, CompanionTimeMode } from './types';

type TimeState = Pick<AppState, 'companionTimeMode' | 'virtualTimeMinutes'>;

const MINUTES_PER_DAY = 24 * 60;

const fullDateTimeFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function minutesFromDate(date = new Date()): number {
  return date.getHours() * 60 + date.getMinutes();
}

export function normalizeCompanionTimeMode(value: unknown): CompanionTimeMode {
  return value === 'virtual' ? 'virtual' : 'system';
}

export function clampVirtualTimeMinutes(value: unknown, fallback = minutesFromDate()): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(fallback)));
  }
  return Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(value)));
}

export function formatClockMinutes(minutes: number): string {
  const safeMinutes = clampVirtualTimeMinutes(minutes);
  const hour = Math.floor(safeMinutes / 60);
  const minute = safeMinutes % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function companionTimeModeLabel(mode: CompanionTimeMode): string {
  return mode === 'virtual' ? '虚拟时间' : '系统时间';
}

export function companionNow(timeState: TimeState, now = new Date()): Date {
  const current = new Date(now);
  if (timeState.companionTimeMode !== 'virtual') return current;
  const minutes = clampVirtualTimeMinutes(timeState.virtualTimeMinutes);
  current.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return current;
}

export function companionTimePeriod(date: Date): string {
  const hour = date.getHours();
  if (hour < 5) return '深夜';
  if (hour < 8) return '清晨';
  if (hour < 12) return '上午';
  if (hour < 14) return '中午';
  if (hour < 18) return '下午';
  if (hour < 22) return '晚上';
  return '深夜';
}

export function formatCompanionDateTime(timeState: TimeState, now = new Date()): string {
  return fullDateTimeFormatter.format(companionNow(timeState, now));
}

export function companionTimeContext(timeState: TimeState, now = new Date()): string {
  const mode = normalizeCompanionTimeMode(timeState.companionTimeMode);
  const date = companionNow(timeState, now);
  const period = companionTimePeriod(date);
  return [
    `当前陪伴时间：<time mode="${mode}">${fullDateTimeFormatter.format(date)}（${companionTimeModeLabel(mode)}）</time>。`,
    `今天日历：${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日，星期${'日一二三四五六'[date.getDay()]}，当前时段：${period}。`,
    mode === 'virtual'
      ? '请把这个虚拟时间当作角色此刻看到的手机时间，不要按真实系统时间推断早晚、日期或作息。'
      : '请按这个系统时间理解早晚、日期和作息。',
  ].join('\n');
}
