/**
 * 大注释：Sticker resource module.
 * Finds, groups, and falls back through built-in and user sticker assets.
 */
import type { CharacterProfile, StickerAsset } from '../core/types';
import { state } from '../core/state';

function uniqueByName(stickers: StickerAsset[]): StickerAsset[] {
  const seen = new Set<string>();
  return stickers.filter(sticker => {
    const key = sticker.name.trim().toLocaleLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function modelStickersFor(character: CharacterProfile): StickerAsset[] {
  return uniqueByName([...(character.stickers ?? []), ...state.commonStickers]);
}

export function userStickersFor(): StickerAsset[] {
  return uniqueByName([...state.userStickers, ...state.commonStickers]);
}

export function findStickerById(stickerId: string): StickerAsset | undefined {
  return [
    ...state.characters.flatMap(character => character.stickers ?? []),
    ...state.commonStickers,
    ...state.userStickers,
  ].find(sticker => sticker.id === stickerId);
}

export function findUserStickerById(stickerId: string): StickerAsset | undefined {
  return userStickersFor().find(sticker => sticker.id === stickerId);
}
