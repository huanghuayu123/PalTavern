export const MIN_MODEL_TYPING_DELAY_MS = 650;
export const MAX_MODEL_TYPING_DELAY_MS = 6_500;
export const MODEL_TYPING_DELAY_MS_PER_CHARACTER = 42;

function visibleCharacterCount(text: string): number {
  return Array.from(text.replace(/\s+/g, '')).length;
}

function shouldSkipModelTypingDelay(): boolean {
  return typeof document === 'undefined';
}

export function modelTypingDelayMs(text: string): number {
  const count = visibleCharacterCount(text);
  const scaled = count * MODEL_TYPING_DELAY_MS_PER_CHARACTER;
  return Math.max(MIN_MODEL_TYPING_DELAY_MS, Math.min(MAX_MODEL_TYPING_DELAY_MS, scaled));
}

export function waitForModelTyping(text: string, signal?: AbortSignal): Promise<void> {
  if (shouldSkipModelTypingDelay()) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new DOMException('Typing delay aborted.', 'AbortError'));

  const delayMs = modelTypingDelayMs(text);
  return new Promise((resolve, reject) => {
    let timeoutId: number | undefined;
    const cleanup = () => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      signal?.removeEventListener('abort', abort);
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Typing delay aborted.', 'AbortError'));
    };
    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve();
    }, delayMs);
    signal?.addEventListener('abort', abort, { once: true });
  });
}
