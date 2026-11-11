// 大注释：界面层共用的类型（原来在 app.ts 顶部）。
// 这里只放类型，编译后不产生任何代码。
import type { CharacterProfile, TimelineEntry, WorldEvent, WorldEventLeadActor } from '../core/types';

export type LayoutMode = 'mobile' | 'tabletLandscape' | 'desktop';

export type StickerLibraryScope = 'character' | 'common' | 'user';

export type CardImportFollowupAction = 'profile' | 'opening' | 'worldbook';

export type WorldInsightTab = 'events' | 'relationships' | 'timeline';

export type WorldTimelineTypeFilter = TimelineEntry['type'] | 'all';

export type EventComposerDraft = {
  mode: 'auto' | 'manual';
  title: string;
  description: string;
  eventType?: WorldEvent['type'];
  participantIds: string[];
  leadActor?: WorldEventLeadActor;
  affinityDelta: string;
  privateEventSuggestionId?: string;
};

export type GroupMessageInputFocusSnapshot = {
  focused: boolean;
  chatId: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

export type MomentInputFocusSnapshot = {
  focused: boolean;
  kind: 'composer' | 'comment' | '';
  momentId: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

export type WorldEventSettingsPanelContext = {
  surface: 'drawer' | 'page';
  character?: CharacterProfile;
};
