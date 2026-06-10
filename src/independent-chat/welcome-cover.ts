type WelcomeCoverStorage = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export const WELCOME_COVER_KEY = 'tavern-social-welcome-cover-v1';

function resolvedStorage(storage?: WelcomeCoverStorage): WelcomeCoverStorage | null {
  if (storage) return storage;
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function shouldShowWelcomeCover(storage?: WelcomeCoverStorage): boolean {
  const targetStorage = resolvedStorage(storage);
  if (!targetStorage) return false;
  try {
    return targetStorage.getItem(WELCOME_COVER_KEY) !== 'done';
  } catch {
    return false;
  }
}

export function markWelcomeCoverSeen(storage?: WelcomeCoverStorage): void {
  const targetStorage = resolvedStorage(storage);
  if (!targetStorage) return;
  try {
    targetStorage.setItem(WELCOME_COVER_KEY, 'done');
  } catch {
    // If storage is blocked, keep the app usable and let this be a session-only cover.
  }
}

export function renderWelcomeCover(): string {
  return `
    <div class="welcome-cover-overlay" role="dialog" aria-modal="true" aria-labelledby="welcome-cover-title">
      <section class="welcome-cover-screen">
        <div class="welcome-cover-ambient" aria-hidden="true">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="welcome-cover-brand">
          <h1 id="welcome-cover-title">PalTavern</h1>
          <p>让角色成为会主动联系你的联系人</p>
        </div>
        <button id="enter-welcome-cover" class="primary welcome-cover-enter" type="button">进入我的世界</button>
      </section>
    </div>
  `;
}
