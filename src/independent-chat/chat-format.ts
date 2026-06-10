import type { CharacterProfile } from './types';
import { TAVERN_SOCIAL_DEFAULT_REPLY_STRATEGY } from './reply-strategy';
import { modelStickersFor } from './stickers';

export interface ParsedChatPart {
  content: string;
  stickerId?: string;
}

function splitLongText(value: string): string[] {
  const compact = value.trim();
  if (compact.length <= 220) return compact ? [compact] : [];
  const sentences = compact.split(/(?<=[。！？!?…])\s*/).filter(Boolean);
  const parts: string[] = [];
  let buffer = '';
  for (const sentence of sentences) {
    if (buffer && `${buffer}${sentence}`.length > 180) {
      parts.push(buffer.trim());
      buffer = sentence;
    } else {
      buffer += sentence;
    }
  }
  if (buffer.trim()) parts.push(buffer.trim());
  return parts;
}

function stickerPart(character: CharacterProfile, requestedName: string): ParsedChatPart | undefined {
  const normalized = requestedName.trim().toLocaleLowerCase();
  const sticker = modelStickersFor(character).find(item => item.name.toLocaleLowerCase() === normalized);
  return sticker ? { content: `[表情包：${sticker.name}]`, stickerId: sticker.id } : undefined;
}

function stickerLabel(sticker: { name: string; note?: string }): string {
  return sticker.note?.trim() ? `${sticker.name}（${sticker.note.trim()}）` : sticker.name;
}

export function stickerUsageContext(character: CharacterProfile): string {
  const roleStickers = character.stickers ?? [];
  const stickers = modelStickersFor(character);
  const commonStickers = stickers.filter(sticker => !roleStickers.some(role => role.id === sticker.id));
  return stickers.length > 0
    ? `角色专属表情包：${roleStickers.map(stickerLabel).join('、') || '无'}。
通用表情包：${commonStickers.map(stickerLabel).join('、') || '无'}。
需要使用时单独输出 <sticker:表情包名称>。同名时优先角色专属，不要编造列表外名称。`
    : '当前没有可用表情包，不要输出 sticker 标签。';
}

export function chatStylePreset(character: CharacterProfile): string {
  return [
    TAVERN_SOCIAL_DEFAULT_REPLY_STRATEGY,
    stickerUsageContext(character),
  ].join('\n');
}

export function parseModelChatOutput(raw: string, character: CharacterProfile): ParsedChatPart[] {
  const cleaned = raw.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '').trim();
  const tagged: ParsedChatPart[] = [];
  const tokenPattern = /<msg>([\s\S]*?)<\/msg>|<sticker:([^>]+)>/gi;
  for (const match of cleaned.matchAll(tokenPattern)) {
    if (match[1]?.trim()) {
      tagged.push(...splitLongText(match[1]).map(content => ({ content })));
    } else if (match[2]) {
      const sticker = stickerPart(character, match[2]);
      if (sticker) tagged.push(sticker);
    }
  }
  if (tagged.length > 0) return tagged.slice(0, 8);

  const fallback = cleaned
    .split(/\n\s*\n+/)
    .flatMap(splitLongText)
    .filter(Boolean)
    .map(content => ({ content }));
  return fallback.slice(0, 8);
}
