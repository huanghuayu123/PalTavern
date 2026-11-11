/**
 * 大注释：Chat formatting module.
 * Cleans model output and centralizes sticker syntax plus chat-style prompt snippets.
 */
import type { CharacterProfile } from '../core/types';
import { TAVERN_SOCIAL_DEFAULT_REPLY_STRATEGY } from '../model/reply-strategy';
import { modelStickersFor } from '../media/stickers';

export interface ParsedChatPart {
  content: string;
  stickerId?: string;
}

const MODEL_THINKING_PATTERN = /[<＜]thinking[>＞][\s\S]*?[<＜]\/thinking[>＞]/gi;
const MODEL_STICKER_TOKEN_PATTERN = /[<＜]sticker[：:][^>＞]+[>＞]/gi;
const MODEL_CONTROL_TAG_PATTERN = /[<＜]\/?msg[>＞]/gi;
const MODEL_OUTPUT_TOKEN_PATTERN = /[<＜]msg[>＞]([\s\S]*?)[<＜]\/msg[>＞]|[<＜]sticker[：:]([^>＞]+)[>＞]/gi;

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
需要使用时单独输出 <sticker:表情包名称>。同名时优先角色专属，不要编造列表外名称。
只有确实要发送已列出的表情包时才输出 sticker 标签；不要输出 xxx、表情包名称或其他占位符，不确定时直接发送普通文字。`
    : '当前没有可用表情包，不要输出 sticker 标签。';
}

export function chatStylePreset(character: CharacterProfile): string {
  return [
    TAVERN_SOCIAL_DEFAULT_REPLY_STRATEGY,
    stickerUsageContext(character),
  ].join('\n');
}

export function cleanModelChatFallback(raw: string): string {
  return raw
    .replace(MODEL_THINKING_PATTERN, '')
    .replace(MODEL_STICKER_TOKEN_PATTERN, '')
    .replace(MODEL_CONTROL_TAG_PATTERN, '')
    .trim();
}

export function parseModelChatOutput(raw: string, character: CharacterProfile): ParsedChatPart[] {
  const cleaned = raw.replace(MODEL_THINKING_PATTERN, '').trim();
  const tagged: ParsedChatPart[] = [];
  for (const match of cleaned.matchAll(MODEL_OUTPUT_TOKEN_PATTERN)) {
    if (match[1]?.trim()) {
      tagged.push(...splitLongText(match[1]).map(content => ({ content })));
    } else if (match[2]) {
      const sticker = stickerPart(character, match[2]);
      if (sticker) tagged.push(sticker);
    }
  }
  if (tagged.length > 0) return tagged.slice(0, 8);

  const fallback = cleanModelChatFallback(cleaned)
    .split(/\n\s*\n+/)
    .flatMap(splitLongText)
    .filter(Boolean)
    .map(content => ({ content }));
  return fallback.slice(0, 8);
}

// 小注释：流式预览用的拆分。规则和 parseModelChatOutput 一致，但允许最后一段还没收完：
// 已经出现 <msg> 标签时，只显示完整的段落和正在写的最后一段；没用标签时按空行分段。
// 写了一半的标签（比如刚收到 "<stic"）和没闭合的思考内容先藏起来，收完后再交给正式解析。
export function parseModelChatPreview(raw: string, character: CharacterProfile): ParsedChatPart[] {
  const cleaned = raw
    .replace(MODEL_THINKING_PATTERN, '')
    .replace(/[<＜]thinking[>＞][\s\S]*$/i, '');
  if (/[<＜]msg[>＞]/i.test(cleaned)) {
    const parts: ParsedChatPart[] = [];
    let consumed = 0;
    for (const match of cleaned.matchAll(MODEL_OUTPUT_TOKEN_PATTERN)) {
      if (match[1]?.trim()) {
        parts.push(...splitLongText(match[1]).map(content => ({ content })));
      } else if (match[2]) {
        const sticker = stickerPart(character, match[2]);
        if (sticker) parts.push(sticker);
      }
      consumed = (match.index ?? 0) + match[0].length;
    }
    const tail = cleaned.slice(consumed);
    const open = tail.search(/[<＜]msg[>＞]/i);
    if (open >= 0) {
      const partial = tail.slice(open).replace(/^[<＜]msg[>＞]/i, '').replace(/[<＜][^>＞]*$/, '');
      parts.push(...splitLongText(partial).map(content => ({ content })));
    }
    return parts.slice(0, 8);
  }
  return cleanModelChatFallback(cleaned.replace(/[<＜][^>＞\n]*$/, ''))
    .split(/\n\s*\n+/)
    .flatMap(splitLongText)
    .filter(Boolean)
    .map(content => ({ content }))
    .slice(0, 8);
}
