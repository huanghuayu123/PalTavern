import type { CharacterProfile, NotificationPrivacy } from './types';
import {
  hasAndroidBackgroundPlugin,
  requestNativeNotificationPermission,
  sendNativeNotification,
} from './platform';

export function notificationSupportText(): string {
  if (hasAndroidBackgroundPlugin()) {
    return 'Android 使用系统通知权限。点击下方按钮可申请或确认权限。';
  }
  if (!('Notification' in window)) {
    return '当前运行环境不支持本地通知。';
  }
  if (Notification.permission === 'granted') {
    return '通知权限已允许。';
  }
  if (Notification.permission === 'denied') {
    return '通知权限已被拒绝，需要在系统或浏览器设置中重新允许。';
  }
  return '通知权限尚未申请。';
}

export async function requestNotificationPermission(): Promise<string> {
  const nativeGranted = await requestNativeNotificationPermission();
  if (nativeGranted !== null) {
    return nativeGranted ? 'Android 通知权限已允许。' : 'Android 通知权限未允许。';
  }
  if (!('Notification' in window)) {
    return notificationSupportText();
  }
  return await Notification.requestPermission() === 'granted'
    ? '通知权限已允许。'
    : notificationSupportText();
}

export function buildNotificationText(
  character: CharacterProfile,
  content: string,
  privacy: NotificationPrivacy,
): { title: string; body: string } {
  if (privacy === 'full') {
    return { title: character.name, body: content };
  }
  if (privacy === 'hide_character') {
    return { title: '有新消息', body: '打开应用查看详情。' };
  }
  return { title: character.name, body: '有新消息。' };
}

export async function sendLocalNotification(
  character: CharacterProfile,
  content: string,
  privacy: NotificationPrivacy,
): Promise<boolean> {
  const notification = buildNotificationText(character, content, privacy);
  const nativeSent = await sendNativeNotification(notification.title, notification.body).catch(() => false);
  if (nativeSent !== null) {
    return nativeSent;
  }
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return false;
  }
  try {
    new Notification(notification.title, {
      body: notification.body,
      tag: `tavern-social-${character.id}`,
    });
    return true;
  } catch {
    return false;
  }
}
