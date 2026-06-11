/**
 * 大注释：Runtime platform module.
 * Adapts WebView, desktop, Android bridge, and background runtime capabilities.
 */
import { Capacitor, registerPlugin } from '@capacitor/core';

export type RuntimePlatform = 'web' | 'desktop' | 'android' | 'ios';

export interface BackgroundRuntimeInfo {
  platform: RuntimePlatform;
  canRunWhileHidden: boolean;
  needsNativeScheduler: boolean;
  description: string;
}

export interface NativeBackgroundScheduleSummary {
  enabledCharacters: number;
  nextAttemptAt: number | null;
}

interface NativeBackgroundPlugin {
  requestSchedule(summary: NativeBackgroundScheduleSummary): Promise<{
    ok: boolean;
    reason?: string;
    cancelled?: boolean;
  }>;
  requestNotifications(): Promise<{ granted: boolean }>;
  notifyMessage(options: { title: string; body: string }): Promise<{ ok: boolean; reason?: string }>;
  saveBackup(options: { fileName: string; content: string }): Promise<{
    ok: boolean;
    fileName?: string;
    folderPath?: string;
    uri?: string;
  }>;
}

const nativeBackground = registerPlugin<NativeBackgroundPlugin>('TavernSocialBackground');

function detectPlatform(): RuntimePlatform {
  const platform = Capacitor.getPlatform();
  if (platform === 'android' || platform === 'ios') {
    return platform;
  }
  return /Electron/i.test(navigator.userAgent) ? 'desktop' : 'web';
}

export function hasAndroidBackgroundPlugin(): boolean {
  return detectPlatform() === 'android' && Capacitor.isPluginAvailable('TavernSocialBackground');
}

export function getBackgroundRuntimeInfo(): BackgroundRuntimeInfo {
  const platform = detectPlatform();
  if (platform === 'desktop') {
    return {
      platform,
      canRunWhileHidden: true,
      needsNativeScheduler: false,
      description: 'Windows 桌面版可最小化到托盘。应用保持运行时，主动消息调度会继续检查。',
    };
  }
  if (platform === 'android') {
    const connected = hasAndroidBackgroundPlugin();
    return {
      platform,
      canRunWhileHidden: connected,
      needsNativeScheduler: true,
      description: connected
        ? 'Android WorkManager 后台桥已连接。系统可延迟或跳过任务；应用不会补发错过的消息。'
        : 'Android 原生后台插件不可用，当前只在应用运行时检查。',
    };
  }
  if (platform === 'ios') {
    return {
      platform,
      canRunWhileHidden: false,
      needsNativeScheduler: true,
      description: '当前尚未接入 iOS 原生后台任务。',
    };
  }
  return {
    platform,
    canRunWhileHidden: false,
    needsNativeScheduler: false,
    description: '普通 Web 环境只在页面运行时检查；页面关闭后不会补算或补发。',
  };
}

export function backgroundRuntimeStatusText(): string {
  const info = getBackgroundRuntimeInfo();
  return `${info.canRunWhileHidden ? '可后台驻留' : '仅运行期检查'}：${info.description}`;
}

export async function requestNativeBackgroundSchedule(
  summary: NativeBackgroundScheduleSummary,
): Promise<string> {
  if (!hasAndroidBackgroundPlugin()) {
    return '没有可用的 Android 原生后台任务插件。';
  }
  const result = await nativeBackground.requestSchedule(summary);
  if (result.cancelled) {
    return 'Android 后台任务已取消：当前没有启用主动消息的角色。';
  }
  return result.ok
    ? 'Android 后台任务已请求系统调度。'
    : `Android 后台任务未安排：${result.reason ?? '系统或权限限制'}`;
}

export async function requestNativeNotificationPermission(): Promise<boolean | null> {
  if (!hasAndroidBackgroundPlugin()) {
    return null;
  }
  return (await nativeBackground.requestNotifications()).granted;
}

export async function sendNativeNotification(title: string, body: string): Promise<boolean | null> {
  if (!hasAndroidBackgroundPlugin()) {
    return null;
  }
  return (await nativeBackground.notifyMessage({ title, body })).ok;
}

async function saveNativeFile(
  fileName: string,
  content: string,
  failureMessage: string,
): Promise<{ fileName: string; folderPath: string; uri?: string } | null> {
  if (!hasAndroidBackgroundPlugin()) {
    return null;
  }
  const result = await nativeBackground.saveBackup({ fileName, content });
  if (!result.ok) {
    throw new Error(failureMessage);
  }
  return {
    fileName: result.fileName ?? fileName,
    folderPath: result.folderPath ?? 'Download/TavernSocial',
    uri: result.uri,
  };
}

export async function saveNativeBackup(
  fileName: string,
  content: string,
): Promise<{ fileName: string; folderPath: string; uri?: string } | null> {
  return saveNativeFile(fileName, content, 'Android 原生备份保存失败。');
}

export async function saveNativeJsonFile(
  fileName: string,
  content: string,
): Promise<{ fileName: string; folderPath: string; uri?: string } | null> {
  return saveNativeFile(fileName, content, 'Android 原生文件保存失败。');
}

export function installNativeBackgroundCheckHandler(runCheck: () => Promise<void>): void {
  window.addEventListener('tavern-social-background-check', () => {
    void runCheck();
  });
}
