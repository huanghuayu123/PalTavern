// 大注释：输入框相关：草稿、拼音输入保护、回车发送、聚焦与键盘避让、滚到底部。
// 这些函数从 app.ts 原样拆出，不读写 app.ts 里的界面状态变量，挪出来不改变任何行为。
import { activeGroupChat, state } from '../core/state';
import type { CharacterProfile, GroupChatProfile } from '../core/types';
import { privateConversationActorId } from './private-chat-identity';
import type { GroupMessageInputFocusSnapshot, MomentInputFocusSnapshot } from './ui-types';
import { isCompactViewport } from './viewport-layout';

export const messageDrafts = new Map<string, string>();

export const groupMessageDrafts = new Map<string, string>();

export function characterDraftKey(character?: CharacterProfile): string {
  return character ? `${privateConversationActorId(character)}:${character.id}` : '__no_character__';
}

export function messageDraftFor(character?: CharacterProfile): string {
  return messageDrafts.get(characterDraftKey(character))
    ?? (character ? messageDrafts.get(character.id) : undefined)
    ?? '';
}

export function setMessageDraft(character: CharacterProfile | undefined, value: string): void {
  const key = characterDraftKey(character);
  if (value) {
    messageDrafts.set(key, value);
    if (character) messageDrafts.delete(character.id);
  } else {
    messageDrafts.delete(key);
    if (character) messageDrafts.delete(character.id);
  }
}

export function groupDraftKey(chat?: GroupChatProfile): string {
  return chat?.id ?? '__no_group__';
}

export function groupMessageDraftFor(chat?: GroupChatProfile): string {
  return groupMessageDrafts.get(groupDraftKey(chat)) ?? '';
}

export function setGroupMessageDraft(chat: GroupChatProfile | undefined, value: string): void {
  const key = groupDraftKey(chat);
  if (value) {
    groupMessageDrafts.set(key, value);
  } else {
    groupMessageDrafts.delete(key);
  }
}

export function captureGroupMessageInputFocus(): GroupMessageInputFocusSnapshot {
  const input = document.querySelector<HTMLTextAreaElement>('#group-message-input');
  const chat = activeGroupChat();
  const focused = document.activeElement === input;
  if (input && focused) {
    setGroupMessageDraft(chat, input.value);
  }
  return {
    focused,
    chatId: chat?.id ?? '',
    value: input?.value ?? '',
    selectionStart: input?.selectionStart ?? null,
    selectionEnd: input?.selectionEnd ?? null,
  };
}

export function restoreMomentInputFocus(snapshot: MomentInputFocusSnapshot): boolean {
  if (!snapshot.focused) return false;
  const input = snapshot.kind === 'composer'
    ? document.querySelector<HTMLTextAreaElement>('#moment-input')
    : Array.from(document.querySelectorAll<HTMLInputElement>('[data-comment-input]'))
      .find(item => item.dataset.commentInput === snapshot.momentId);
  if (!input) return false;
  if (input.value !== snapshot.value) input.value = snapshot.value;
  input.focus({ preventScroll: true });
  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    try {
      input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // Mobile browsers may reject selection updates while the keyboard is settling.
    }
  }
  return true;
}

export function scrollMessagesToBottom(): void {
  const messages = document.querySelector<HTMLElement>('.messages, .group-messages, .world-workbench-scroll');
  if (!messages) return;
  const previousBehavior = messages.style.scrollBehavior;
  messages.style.scrollBehavior = 'auto';
  try {
    messages.scrollTop = messages.scrollHeight;
  } finally {
    messages.style.scrollBehavior = previousBehavior;
  }
}

export function isChatScrollNearBottom(container = document.querySelector<HTMLElement>('.messages, .group-messages, .world-workbench-scroll')): boolean {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight < 140;
}

export function resizeComposerTextarea(textarea = document.querySelector<HTMLTextAreaElement>('#message-input')): void {
  if (!textarea) return;
  textarea.style.height = '0px';
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 42), 126);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > 126 ? 'auto' : 'hidden';
}

export function isImeComposing(event: Event): boolean {
  return 'isComposing' in event && Boolean((event as InputEvent).isComposing);
}

export function shouldSubmitTextareaOnEnter(event: KeyboardEvent): boolean {
  return state.enterToSend
    && event.key === 'Enter'
    && !event.shiftKey
    && !event.ctrlKey
    && !event.altKey
    && !event.metaKey
    && !event.isComposing;
}

export function requestTextareaFormSubmit(textarea: HTMLTextAreaElement, event: KeyboardEvent): void {
  if (!shouldSubmitTextareaOnEnter(event)) return;
  event.preventDefault();
  textarea.form?.requestSubmit();
}

export function requestTextareaFormSubmitFromBeforeInput(textarea: HTMLTextAreaElement, event: InputEvent): void {
  if (!state.enterToSend || event.inputType !== 'insertLineBreak' || event.isComposing) return;
  event.preventDefault();
  textarea.form?.requestSubmit();
}

export function canRefocusComposerInput(input: HTMLTextAreaElement): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || active === input) return true;
  return Boolean(active.closest('#composer, #group-composer, #world-rp-composer, .chat-composer-area'));
}

export function focusComposerInputForKeyboard(input: HTMLTextAreaElement): void {
  input.focus({ preventScroll: true });
  try {
    input.setSelectionRange(input.value.length, input.value.length);
  } catch {
    // Mobile browsers can reject selection updates while the IME is settling.
  }
  resizeComposerTextarea(input);
  updateKeyboardOffset();
}

export function keepMomentComposerVisible(): void {
  const composer = document.querySelector<HTMLElement>('.moments-publisher.is-open');
  if (!composer) return;
  window.requestAnimationFrame(() => {
    composer.dataset.keyboardAdjustedAt = String(Date.now());
  });
}

export function setMomentComposerKeyboardFocus(active: boolean): void {
  const touchLike = window.matchMedia('(pointer: coarse)').matches;
  document.documentElement.classList.toggle(
    'moment-composer-keyboard-focus',
    active && (isCompactViewport() || touchLike),
  );
}

export function updateKeyboardOffset(): void {
  const viewport = window.visualViewport;
  const offset = viewport
    ? Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop)
    : 0;
  const rounded = Math.round(offset);
  document.documentElement.style.setProperty('--keyboard-offset', `${rounded}px`);
  document.documentElement.classList.toggle('keyboard-open', rounded > 80);
  if (rounded > 80 && isChatScrollNearBottom()) {
    window.setTimeout(scrollMessagesToBottom, 80);
    window.setTimeout(scrollMessagesToBottom, 220);
    window.setTimeout(keepMomentComposerVisible, 80);
    window.setTimeout(keepMomentComposerVisible, 220);
  }
}
