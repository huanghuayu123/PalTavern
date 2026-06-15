/**
 * 大注释：Backup and restore module.
 * Exports, imports, and repairs local-state backup text.
 */
import { normalizeState, replaceState, state } from '../core/state';
import { saveNativeBackup } from '../platform/runtime';
import type { AppState } from '../core/types';
import { isRecord } from '../core/utils';

interface BackupEnvelope {
  app: 'PalTavern';
  schema: 'tavern-social-backup-v1';
  exportedAt: string;
  state: AppState;
}

export interface BackupDownloadInfo {
  fileName: string;
  folderHint: string;
}

export interface BackupRestorePreview {
  worldCount: number;
  characterCount: number;
  privateMessageCount: number;
  groupMessageCount: number;
  characterDirectThreadCount: number;
  characterDirectMessageCount: number;
  momentCount: number;
  timelineCount: number;
  exportedAt: string;
  currentDataWillBeReplaced: boolean;
}

function backupPayload(rawText: string): unknown {
  const parsed = JSON.parse(rawText) as unknown;
  return isRecord(parsed) && isRecord(parsed.state) ? parsed.state : parsed;
}

export function backupFileName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `tavern-social-backup-${stamp}.json`;
}

export function backupDownloadFolderHint(): string {
  return '系统默认下载文件夹（通常是“下载/Downloads”）';
}

export function createBackupState(): AppState {
  const backupState = JSON.parse(JSON.stringify(state)) as AppState;
  backupState.modelConfig = {
    ...backupState.modelConfig,
    apiKey: '',
  };
  return backupState;
}

export function createBackupText(): string {
  const envelope: BackupEnvelope = {
    app: 'PalTavern',
    schema: 'tavern-social-backup-v1',
    exportedAt: new Date().toISOString(),
    state: createBackupState(),
  };
  return JSON.stringify(envelope, null, 2);
}

function browserDownloadBackup(fileName: string, text: string): BackupDownloadInfo {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
  return {
    fileName,
    folderHint: backupDownloadFolderHint(),
  };
}

export function downloadBackup(): BackupDownloadInfo {
  return browserDownloadBackup(backupFileName(), createBackupText());
}

export async function exportBackup(): Promise<BackupDownloadInfo> {
  const fileName = backupFileName();
  const text = createBackupText();
  const nativeResult = await saveNativeBackup(fileName, text);
  if (nativeResult) {
    return {
      fileName: nativeResult.fileName,
      folderHint: `Android 下载目录：${nativeResult.folderPath}`,
    };
  }
  return browserDownloadBackup(fileName, text);
}

export function previewBackupRestoreText(rawText: string): BackupRestorePreview {
  const parsed = JSON.parse(rawText) as unknown;
  const restored = normalizeState(backupPayload(rawText));
  return {
    worldCount: restored.worlds.length,
    characterCount: restored.characters.length,
    privateMessageCount: restored.messages.length,
    groupMessageCount: restored.groupMessages.length,
    characterDirectThreadCount: restored.characterDirectThreads.length,
    characterDirectMessageCount: restored.characterDirectMessages.length,
    momentCount: restored.moments.length,
    timelineCount: restored.timelineEntries.length,
    exportedAt: isRecord(parsed) && typeof parsed.exportedAt === 'string' ? parsed.exportedAt : '',
    currentDataWillBeReplaced: true,
  };
}

export function formatBackupRestoreWarning(preview: BackupRestorePreview): string {
  const exportedAt = preview.exportedAt
    ? `\n备份时间：${new Date(preview.exportedAt).toLocaleString()}`
    : '';
  const directChatCounts = `${preview.characterDirectThreadCount} 段角色私聊、${preview.characterDirectMessageCount} 条角色私聊消息`;
  return [
    '当前本地数据会被替换，建议先导出当前备份。',
    `将导入：${preview.worldCount} 个世界、${preview.characterCount} 个角色、${preview.privateMessageCount} 条私聊消息、${preview.groupMessageCount} 条群聊消息、${directChatCounts}、${preview.momentCount} 条动态、${preview.timelineCount} 条世界记录。${exportedAt}`,
  ].join('\n\n');
}

export function restoreBackupText(rawText: string): AppState {
  const restored = normalizeState(backupPayload(rawText));
  replaceState(restored);
  return restored;
}
