import { state } from './state';
import type { CharacterProfile, MomentEntry, MomentVisibility, MomentVisibilityMode, TimelineSourceRef } from './types';

export function defaultMomentVisibility(): MomentVisibility {
  return { mode: 'public', characterIds: [], blockedCharacterIds: [] };
}

export function normalizeMomentVisibilityDraft(
  mode: MomentVisibilityMode,
  characterIds: string[] = [],
  blockedCharacterIds: string[] = [],
): MomentVisibility {
  return {
    mode,
    characterIds: Array.from(new Set(characterIds.filter(Boolean))),
    blockedCharacterIds: Array.from(new Set(blockedCharacterIds.filter(Boolean))),
  };
}

export function momentVisibilityLabel(visibility: MomentVisibility = defaultMomentVisibility()): string {
  if (visibility.mode === 'public' && visibility.characterIds.length > 0) return '指定角色可见';
  if (visibility.mode === 'public' && visibility.blockedCharacterIds.length > 0) return '已屏蔽部分角色';
  if (visibility.mode === 'friends') return '好友可见';
  if (visibility.mode === 'specific') return visibility.characterIds.length > 0 ? '指定角色可见' : '未指定角色';
  if (visibility.mode === 'blocked') return visibility.blockedCharacterIds.length > 0 ? '已屏蔽部分角色' : '公开';
  if (visibility.mode === 'private') return '仅自己';
  return '公开';
}

function friendCanView(character: CharacterProfile): boolean {
  return character.relationship.stage === 'familiar'
    || character.relationship.stage === 'close'
    || character.relationship.stage === 'intimate';
}

function canPassPublicAllowBlock(visibility: MomentVisibility, character: CharacterProfile): boolean {
  if (visibility.characterIds.length > 0 && !visibility.characterIds.includes(character.id)) return false;
  if (visibility.blockedCharacterIds.includes(character.id)) return false;
  return true;
}

export function canCharacterViewMoment(moment: MomentEntry, character: CharacterProfile): boolean {
  if (moment.worldId !== character.worldId) return false;
  if (moment.characterId && moment.characterId === character.id) return true;
  const visibility = moment.visibility ?? defaultMomentVisibility();
  if (visibility.mode === 'private') return false;
  if (visibility.mode === 'friends') return friendCanView(character);
  if (visibility.mode === 'specific') return visibility.characterIds.includes(character.id);
  if (visibility.mode === 'blocked') return !visibility.blockedCharacterIds.includes(character.id);
  return canPassPublicAllowBlock(visibility, character);
}

export function visibleCharactersForMoment(moment: MomentEntry): CharacterProfile[] {
  return state.characters.filter(character => canCharacterViewMoment(moment, character));
}

export function canCharacterViewMomentSource(source: TimelineSourceRef, character: CharacterProfile): boolean {
  if (source.type === 'moment') {
    const moment = state.moments.find(item => item.id === source.id);
    return moment ? canCharacterViewMoment(moment, character) : true;
  }
  if (source.type === 'comment') {
    const moment = state.moments.find(item => item.comments.some(comment => comment.id === source.id));
    return moment ? canCharacterViewMoment(moment, character) : true;
  }
  return true;
}
