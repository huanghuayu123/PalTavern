import type { CharacterProfile } from '../core/types';
import { normalizeChatFontScale } from '../core/state';
import { escapeHtml } from '../core/utils';

export function chatSurfaceStyle(fontScale: unknown, backgroundImage?: string): string {
  const styleParts = [`--chat-font-scale:${normalizeChatFontScale(fontScale)}`];
  if (backgroundImage) {
    styleParts.push(`--chat-background-image:url(&quot;${escapeHtml(backgroundImage)}&quot;)`);
  }
  return styleParts.join(';');
}

export function renderChatBackgroundControl(config: {
  title: string;
  description: string;
  importId: string;
  clearId: string;
  backgroundImage?: string;
}): string {
  return `
    <section class="chat-background-control">
      <div class="mobile-section-label">
        <strong>${escapeHtml(config.title)}</strong>
        <span>${escapeHtml(config.description)}</span>
      </div>
      <div class="chat-background-preview ${config.backgroundImage ? 'has-image' : ''}" ${config.backgroundImage ? `style="background-image: url(&quot;${escapeHtml(config.backgroundImage)}&quot;)"` : ''}>
        <span>${config.backgroundImage ? '已设置背景' : '默认背景'}</span>
      </div>
      <div class="inline-actions chat-background-actions">
        <label class="file-button secondary-file">
          更换背景
          <input id="${escapeHtml(config.importId)}" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" />
        </label>
        <button id="${escapeHtml(config.clearId)}" class="secondary" type="button" ${config.backgroundImage ? '' : 'disabled'}>恢复默认</button>
      </div>
    </section>
  `;
}

export function readImageInputAsDataUrl(input: HTMLInputElement): Promise<string> {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return Promise.resolve('');
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('读取图片失败。'));
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.readAsDataURL(file);
  });
}

export function renderUserAvatar(userName: string): string {
  return escapeHtml((userName.trim() || '我').slice(0, 1));
}

export function renderAvatar(character: CharacterProfile): string {
  return character.avatar && /^(https?:|data:image\/)/i.test(character.avatar)
    ? `<img src="${escapeHtml(character.avatar)}" alt="" />`
    : escapeHtml(character.name.slice(0, 1));
}

type AvatarTone = 'teal' | 'sky' | 'lavender' | 'peach' | 'amber';

const AVATAR_TONES: AvatarTone[] = ['teal', 'sky', 'lavender', 'peach', 'amber'];

function avatarToneForId(id: string): AvatarTone {
  // Small comment: stable hashing keeps placeholder avatar colors from changing between renders.
  const seed = id.trim() || 'character';
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = ((hash * 31) + seed.charCodeAt(index)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function avatarToneAttribute(character?: CharacterProfile): string {
  const tone: AvatarTone | 'user' = character ? avatarToneForId(character.id) : 'user';
  return ` data-avatar-tone="${escapeHtml(tone)}"`;
}
