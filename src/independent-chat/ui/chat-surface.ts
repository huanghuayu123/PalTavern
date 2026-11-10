import type { CharacterProfile } from '../core/types';
import { normalizeChatFontScale } from '../core/state';
import { escapeHtml } from '../core/utils';
import { displayImageUrl } from './image-urls';

export function chatSurfaceStyle(fontScale: unknown, backgroundImage?: string): string {
  const styleParts = [`--chat-font-scale:${normalizeChatFontScale(fontScale)}`];
  if (backgroundImage) {
    styleParts.push(`--chat-background-image:url(&quot;${escapeHtml(displayImageUrl(backgroundImage))}&quot;)`);
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
      <div class="chat-background-preview ${config.backgroundImage ? 'has-image' : ''}" ${config.backgroundImage ? `style="background-image: url(&quot;${escapeHtml(displayImageUrl(config.backgroundImage))}&quot;)"` : ''}>
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

const CHAT_BACKGROUND_MAX_SIDE = 1600;
const CHAT_BACKGROUND_QUALITY = 0.8;
const CHAT_BACKGROUND_TYPE_PATTERN = /^image\/(png|jpe?g|webp)$/i;
const CHAT_BACKGROUND_NAME_PATTERN = /\.(png|jpe?g|webp)$/i;

type DecodedImage = { source: CanvasImageSource; width: number; height: number; release: () => void };

async function decodeImageFile(file: File): Promise<DecodedImage> {
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return { source: bitmap, width: bitmap.width, height: bitmap.height, release: () => bitmap.close() };
    } catch {
      // 小注释：个别旧 WebView 的 createImageBitmap 不认某些格式，退回 <img> 解码。
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('读取图片失败。'));
      element.src = url;
    });
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, release: () => undefined };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// 大注释：聊天背景以前是原图直接转文字存进本地存储，一张手机照片就能把 5MB 左右的存储上限撑爆。
// 现在先缩到最长边 1600px 再转 WebP，背景上本来就叠了一层半透明底色，肉眼看不出差别，体积通常只剩几百 KB。
export async function readImageInputAsDataUrl(input: HTMLInputElement): Promise<string> {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return '';
  if (!CHAT_BACKGROUND_TYPE_PATTERN.test(file.type) && !CHAT_BACKGROUND_NAME_PATTERN.test(file.name)) return '';
  const decoded = await decodeImageFile(file);
  try {
    const scale = Math.min(1, CHAT_BACKGROUND_MAX_SIDE / Math.max(decoded.width, decoded.height, 1));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(decoded.width * scale));
    canvas.height = Math.max(1, Math.round(decoded.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('当前设备无法处理这张图片。');
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', CHAT_BACKGROUND_QUALITY);
    // 小注释：不支持 WebP 编码的环境会悄悄返回 PNG，PNG 照片体积很大，改用 JPEG。
    return webp.startsWith('data:image/webp')
      ? webp
      : canvas.toDataURL('image/jpeg', CHAT_BACKGROUND_QUALITY);
  } finally {
    decoded.release();
  }
}

export function renderUserAvatar(userName: string): string {
  return escapeHtml((userName.trim() || '我').slice(0, 1));
}

export function renderAvatar(character: CharacterProfile): string {
  return character.avatar && /^(https?:|data:image\/)/i.test(character.avatar)
    ? `<img src="${escapeHtml(displayImageUrl(character.avatar))}" alt="" decoding="async" />`
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
