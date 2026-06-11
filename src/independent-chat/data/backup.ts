/**
 * 大注释：Backup and restore module.
 * Exports, imports, and repairs local-state backup text.
 */
import { normalizeState, replaceState, state } from '../core/state';
import { saveNativeBackup } from '../platform/runtime';
import type { AppState } from '../core/types';
import { isRecord } from '../core/utils';

interface BackupEnvelope {
  app: 'Tavern Social';
  schema: 'tavern-social-backup-v1';
  exportedAt: string;
  state: AppState;
}

export interface BackupDownloadInfo {
  fileName: string;
  folderHint: string;
}

export function backupFileName(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `tavern-social-backup-${stamp}.json`;
}

export function backupDownloadFolderHint(): string {
  return '系统默认下载文件夹（通常是“下载/Downloads”）';
}

export function createBackupText(): string {
  const envelope: BackupEnvelope = {
    app: 'Tavern Social',
    schema: 'tavern-social-backup-v1',
    exportedAt: new Date().toISOString(),
    state,
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

export function restoreBackupText(rawText: string): AppState {
  const parsed = JSON.parse(rawText) as unknown;
  const payload = isRecord(parsed) && isRecord(parsed.state) ? parsed.state : parsed;
  const restored = normalizeState(payload);
  replaceState(restored);
  return restored;
}
