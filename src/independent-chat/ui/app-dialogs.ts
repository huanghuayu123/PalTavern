import { escapeHtml } from '../core/utils';

export type AppDialogTone = 'default' | 'danger';

type AppDialogBase = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: AppDialogTone;
  onCancel?: () => void;
};

export type AppConfirmDialogOptions = AppDialogBase & {
  onConfirm: () => void;
};

export type AppAlertDialogOptions = Omit<AppDialogBase, 'cancelLabel' | 'tone'> & {
  onConfirm?: () => void;
};

export type AppPromptDialogOptions = AppDialogBase & {
  label: string;
  initialValue?: string;
  placeholder?: string;
  multiline?: boolean;
  onConfirm: (value: string) => void;
};

type ActiveAppDialog =
  | (AppConfirmDialogOptions & { id: string; kind: 'confirm' })
  | (AppAlertDialogOptions & { id: string; kind: 'alert' })
  | (AppPromptDialogOptions & { id: string; kind: 'prompt' });

let activeDialog: ActiveAppDialog | null = null;
let dialogSerial = 0;

function nextDialogId(): string {
  dialogSerial += 1;
  return `app-dialog-${dialogSerial}`;
}

export function hasActiveAppDialog(): boolean {
  return Boolean(activeDialog);
}

export function openAppConfirm(options: AppConfirmDialogOptions, rerender: () => void): void {
  activeDialog = {
    id: nextDialogId(),
    kind: 'confirm',
    ...options,
  };
  rerender();
}

export function openAppAlert(options: AppAlertDialogOptions, rerender: () => void): void {
  activeDialog = {
    id: nextDialogId(),
    kind: 'alert',
    confirmLabel: options.confirmLabel ?? '知道了',
    ...options,
  };
  rerender();
}

export function openAppPrompt(options: AppPromptDialogOptions, rerender: () => void): void {
  activeDialog = {
    id: nextDialogId(),
    kind: 'prompt',
    cancelLabel: options.cancelLabel ?? '取消',
    confirmLabel: options.confirmLabel ?? '保存',
    ...options,
  };
  rerender();
}

function renderDialogMessage(message?: string): string {
  if (!message) return '';
  return `<p>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`;
}

function renderPromptField(dialog: Extract<ActiveAppDialog, { kind: 'prompt' }>): string {
  const inputId = `${dialog.id}-input`;
  const value = escapeHtml(dialog.initialValue ?? '');
  const placeholder = dialog.placeholder ? ` placeholder="${escapeHtml(dialog.placeholder)}"` : '';
  const control = dialog.multiline
    ? `<textarea id="${inputId}" data-app-dialog-input${placeholder}>${value}</textarea>`
    : `<input id="${inputId}" data-app-dialog-input value="${value}"${placeholder} />`;
  return `
    <label class="field app-dialog-field" for="${inputId}">
      <span>${escapeHtml(dialog.label)}</span>
      ${control}
    </label>
  `;
}

export function renderAppDialog(): string {
  const dialog = activeDialog;
  if (!dialog) return '';
  const confirmClass = dialog.kind === 'confirm' && dialog.tone === 'danger' ? 'danger' : 'primary';
  const confirmLabel = dialog.confirmLabel ?? (dialog.kind === 'confirm' ? '确认' : '知道了');
  const cancelLabel = dialog.kind === 'alert' ? '' : (dialog.cancelLabel ?? '取消');
  return `
    <div class="app-dialog-overlay" role="dialog" aria-modal="true" aria-labelledby="${dialog.id}-title" data-app-dialog-kind="${dialog.kind}">
      <button class="app-dialog-backdrop" data-app-dialog-cancel type="button" aria-label="关闭"></button>
      <section class="app-dialog">
        <header>
          <h2 id="${dialog.id}-title">${escapeHtml(dialog.title)}</h2>
          ${renderDialogMessage(dialog.message)}
        </header>
        ${dialog.kind === 'prompt' ? renderPromptField(dialog) : ''}
        <footer>
          ${cancelLabel ? `<button class="secondary" data-app-dialog-cancel type="button">${escapeHtml(cancelLabel)}</button>` : ''}
          <button class="${confirmClass}" data-app-dialog-confirm type="button">${escapeHtml(confirmLabel)}</button>
        </footer>
      </section>
    </div>
  `;
}

export function confirmAppDialog(value?: string): void {
  const dialog = activeDialog;
  if (!dialog) return;
  activeDialog = null;
  if (dialog.kind === 'prompt') {
    dialog.onConfirm(value ?? dialog.initialValue ?? '');
    return;
  }
  dialog.onConfirm?.();
}

export function cancelAppDialog(): void {
  const dialog = activeDialog;
  if (!dialog) return;
  activeDialog = null;
  dialog.onCancel?.();
}

export function bindAppDialog(rerender: () => void): void {
  if (!activeDialog) return;
  const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>('[data-app-dialog-input]');
  const confirmButton = document.querySelector<HTMLButtonElement>('[data-app-dialog-confirm]');
  const cleanup = () => {
    document.removeEventListener('keydown', handleKeydown);
  };
  const confirm = () => {
    cleanup();
    confirmAppDialog(input?.value);
    rerender();
  };
  const cancel = () => {
    cleanup();
    cancelAppDialog();
    rerender();
  };
  const handleKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    cancel();
  };
  confirmButton?.addEventListener('click', confirm);
  document.querySelectorAll<HTMLButtonElement>('[data-app-dialog-cancel]').forEach(button => {
    button.addEventListener('click', cancel);
  });
  document.addEventListener('keydown', handleKeydown);
  window.requestAnimationFrame(() => {
    (input ?? confirmButton)?.focus({ preventScroll: true });
  });
}
