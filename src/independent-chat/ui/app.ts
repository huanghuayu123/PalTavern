/**
 * 大注释：Main UI module.
 * Keeps the original PalTavern rendering, event binding, and view switching in one UI surface.
 */
import type {
  ChatReplyMode,
  ChatMessage,
  CharacterProfile,
  CompanionTimeMode,
  GroupChatMessage,
  GroupChatProfile,
  ModelMessage,
  ModelProvider,
  MomentEntry,
  MomentVisibilityMode,
  NotificationPrivacy,
  PacingState,
  PromptPreset,
  CharacterRelationshipSide,
  RelationshipStage,
  RelationshipState,
  StickerAsset,
  TimelineEntry,
  WorldEvent,
  WorldEventLeadActor,
  WorldWeatherLocation,
} from '../core/types';
import {
  bindAuthoringUi,
  bindDraftManager,
  isAuthoringOpen,
  renderAuthoringScreen,
  renderDraftManager,
} from './authoring-ui';
import { exportBackup, restoreBackupText } from '../data/backup';
import {
  backgroundInteractionStats,
  refreshCharacterCurrentPlan,
  scheduleNextBackgroundInteraction,
} from '../social/background-interactions';
import {
  characterFromCardCandidate,
  type CharacterCardCandidate,
  deleteCharacter,
  deleteCharacterSticker,
  importStickerFiles,
  type ParsedCharacterCardFile,
  parseCharacterCardFileWithRecognition,
  setCustomCharacterAvatar,
  updateCharacterCardDetails,
  upsertCharacter,
} from '../characters/cards';
import {
  applyCharacterRelationshipSuggestion,
  characterRelationshipSnapshot,
  ensureCharacterRelationship,
  findCharacterRelationship,
  ignoreCharacterRelationshipSuggestion,
  pendingRelationshipSuggestionsForPair,
  relationshipSideFor,
  updateCharacterRelationshipSide,
} from '../characters/relationships';
import {
  appendCharacterWorldBookEntry,
  characterSettingsText,
  characterWorldBookEntryDrafts,
  deleteCharacterWorldBookEntry,
  setCharacterWorldBookEntryDrafts,
  type CharacterWorldBookEntryDraft,
} from '../characters/settings';
import { createAutoMessagePacingStrategy, DEFAULT_AUTO_MESSAGE_PACING_STRATEGY } from '../chat/auto-message-strategy';
import {
  deleteMessage,
  editUserMessageAndRegenerate,
  generateReply,
  generateOpeningMessage,
  isReplying,
  messageVariantInfo,
  recallMessage,
  regenerateAssistantMessage,
  resetReplyState,
  sendMessage,
  sendUserMessageOnly,
  sendStickerMessage,
  selectMessageVariant,
  setStatusText as setChatStatusText,
  statusText,
  stopReply,
  type PrivateChatSpeaker,
} from '../chat/private-chat';
import {
  deleteWorldEvent,
  eventTypeLabel,
  eventsForActiveWorld,
  finishWorldEventManually,
  generateWorldEvent,
  generateWorldEventRpReply,
  appendWorldEventRpMessage,
  editWorldEventRpMessage,
  ensureWorldRpEvent,
  resolveWorldEvent,
  resolveWorldEventChoice,
  worldEventRpMessages,
} from '../social/events';
import {
  clearGroupMessages,
  createGroupChat,
  deleteGroupChat,
  deleteGroupMessage,
  generateGroupReply,
  generateGroupReplyForLatest,
  generateGroupRoundReply,
  groupParticipants,
  isGroupGenerating,
  recallGroupMessage,
  resetGroupGenerationState,
  sendGroupUserMessage,
  updateGroupChat,
} from '../chat/group-chat';
import {
  recordImpact,
  recordTimelineEntryImpact,
  recordsForOperation,
  relationshipSnapshot,
  rollbackStateForTimelineEntry,
  rollbackTimelineEntryImpact,
} from '../memory/impacts';
import {
  addMomentComment,
  deleteMomentComment,
  deleteMoment,
  generateCharacterComment,
  generateCharacterMomentDraft,
  momentsForActiveWorld,
  publishMoment,
  spreadMomentInteractions,
} from '../social/moments';
import {
  canCharacterViewMoment,
  momentVisibilityLabel,
  normalizeMomentVisibilityDraft,
  visibleCharactersForMoment,
} from '../social/moment-visibility';
import {
  characterStatusFor,
  characterStatusLine,
  refreshCharacterStatusSummary,
} from '../memory/character-status';
import {
  quietBriefText,
  todayBriefForActiveWorld,
} from '../memory/daily-brief';
import {
  addTimelineEntry,
  addChatMessageTimelineEntry,
  addManualTimelineNote,
  addRelationshipTimelineEntry,
  timelineForActiveWorld,
} from '../memory/timeline';
import { notificationSupportText, requestNotificationPermission, sendLocalNotification } from '../platform/notifications';
import { backgroundRuntimeStatusText } from '../platform/runtime';
import {
  applyResetDecision,
  disableAutoMessage,
  enableAutoMessage,
  runAutoMessageCheckNow,
  scheduleNextEvent,
  scheduleNextMoment,
  scheduleNextAttempt,
  setAutoEventEnabled,
  setAutoMomentEnabled,
} from '../automation/scheduler';
import {
  activeCharacter,
  activeGroupChat,
  activeWorld,
  createWorld,
  DEEPSEEK_API_URL,
  deleteWorld,
  conversationFor,
  groupChatsForActiveWorld,
  groupMessagesFor,
  markConversationRead,
  messagesFor,
  resetDailyModelUsage,
  saveState,
  setActiveView,
  setActiveWorld,
  state,
  unreadCountFor,
} from '../core/state';
import { downloadSillyTavernCard } from '../characters/tavern-export';
import { callAuthoringModel, callModel, fetchModelList, testModelConnection } from '../model/client';
import {
  createTavernSocialDefaultGroupPromptPreset,
  createTavernSocialDefaultPromptPreset,
  createTavernSocialDefaultWorldPromptPreset,
  parseSillyTavernPromptPreset,
  resetPromptPresetDefaults,
  TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID,
  TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID,
  TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID,
} from '../model/prompt-presets';
import { findStickerById } from '../media/stickers';
import { clampVirtualTimeMinutes, companionTimeModeLabel, formatClockMinutes, formatCompanionDateTime } from '../core/time';
import { compactText, escapeHtml, nowId } from '../core/utils';
import { markWelcomeCoverSeen, renderWelcomeCover, shouldShowWelcomeCover } from './welcome-cover';
import {
  refreshWorldWeather,
  searchWeatherLocations,
  weatherLocationLabel,
  weatherSnapshotLine,
} from '../world/weather';
import {
  parseRpRenderSegments,
  type RpRenderSegment,
} from './rp-rendering';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app');
}
const appRoot = app;
// 小注释：UI 层只负责读状态、渲染和派发动作，不在这里改业务存储结构。
type SettingsSection = 'world' | 'drafts' | 'stickers' | 'model' | 'prompts' | 'relationship' | 'interactions' | 'proactive' | 'chat' | 'notifications' | 'data';
type MobileSection = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings';
type MobileHistoryLayer = 'section' | 'chat' | 'settings-detail' | 'modal';
type StickerLibraryScope = 'character' | 'common' | 'user';
type CharacterPanelPage = 'worldbook' | 'status';
type GroupSettingsMode = 'create' | 'edit';
type PendingStickerImport = {
  scope: StickerLibraryScope;
  characterId?: string;
  stickers: StickerAsset[];
};
type EventComposerDraft = {
  title: string;
  description: string;
  participantIds: string[];
  leadActor?: WorldEventLeadActor;
  affinityDelta: string;
};
type UiScrollSnapshot = {
  key: string;
  top: number;
  left: number;
  characterId: string;
  groupChatId?: string;
  activeView: 'chat' | 'groups' | 'world' | 'moments';
  mobileSection: MobileSection;
  mobileChatOpen: boolean;
  mobileGroupChatOpen?: boolean;
};
type UiSessionSnapshot = {
  savedAt: number;
  settingsOpen?: boolean;
  activeSettingsSection?: SettingsSection;
  mobileSection?: MobileSection;
  mobileChatOpen?: boolean;
  mobileGroupChatOpen?: boolean;
  desktopGroupChatOpen?: boolean;
  groupSettingsOpen?: boolean;
  groupSettingsMode?: GroupSettingsMode;
  mobileSettingsDetail?: boolean;
  characterPanelOpen?: boolean;
  characterPanelPage?: CharacterPanelPage;
  stickerPickerOpen?: boolean;
  contactQuery?: string;
  quotedMessageId?: string;
  momentComposerOpen?: boolean;
  momentComposerAuthorId?: string;
  momentComposerTextDraft?: string;
  momentVisibilityMode?: MomentVisibilityMode;
  momentVisibilityCharacterIds?: string[];
  momentVisibilityBlockedIds?: string[];
  timelineNoteDraft?: string;
  worldRpInputDraft?: string;
  activeWorldRpEventId?: string;
  worldRpRenderMode?: 'narration' | 'bubble';
  worldRpReplyMode?: ChatReplyMode;
  worldRpActorId?: string;
  privateChatSpeakerId?: string;
  eventComposerOpen?: boolean;
  eventComposerDraft?: EventComposerDraft;
  messageDrafts?: Record<string, string>;
  groupMessageDrafts?: Record<string, string>;
  momentCommentDrafts?: Record<string, string>;
  momentCommentAuthorDrafts?: Record<string, string>;
  momentCommentReplyTargetDrafts?: Record<string, string>;
  scroll?: UiScrollSnapshot;
};

const CARD_IMPORT_ACCEPT = '.json,.png,application/json,image/png,application/octet-stream,*/*';
const UI_SESSION_KEY = 'tavern-social-ui-session-v1';
const UI_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let globalStatusText = '';
let globalStatusHideTimer: number | undefined;
let settingsOpen = false;
let activeSettingsSection: SettingsSection = 'world';
let mobileSection: MobileSection = 'messages';
let mobileChatOpen = false;
let mobileGroupChatOpen = false;
let desktopGroupChatOpen = false;
let groupSettingsOpen = false;
let groupSettingsMode: GroupSettingsMode = 'create';
let editingPromptPresetId = '';
let mobileSettingsDetail = false;
let characterPanelOpen = false;
let characterPanelPage: CharacterPanelPage = 'worldbook';
let stickerPickerOpen = false;
let stickerManagerCharacterId = '';
let relationshipManagerCharacterId = '';
let relationshipPairACharacterId = '';
let relationshipPairBCharacterId = '';
let proactiveManagerCharacterId = '';
let momentGenerating = false;
let momentGenerationStatus = '';
let momentComposerOpen = false;
let eventGenerating = false;
let worldRpGenerating = false;
let eventComposerOpen = false;
let eventResolvingId = '';
let commentingMomentId = '';
const autoCommentingMomentIds = new Set<string>();
let momentComposerAuthorId = 'user';
let momentComposerTextDraft = '';
let momentVisibilityMode: MomentVisibilityMode = 'public';
let momentVisibilityPickerOpenFor: 'specific' | 'blocked' | null = null;
const momentVisibilityCharacterIds = new Set<string>();
const momentVisibilityBlockedIds = new Set<string>();
let timelineNoteDraft = '';
let worldRpInputDraft = '';
let activeWorldRpEventId = '';
let worldRpRenderMode: 'narration' | 'bubble' = 'narration';
let worldRpReplyMode: ChatReplyMode = 'auto';
let worldRpMessageEditId = '';
let worldRpActorId = 'user';
let privateChatSpeakerId = 'user';
let eventComposerDraft: EventComposerDraft = { title: '', description: '', participantIds: [], affinityDelta: '0' };
const momentCommentDrafts = new Map<string, string>();
const momentCommentAuthorDrafts = new Map<string, string>();
const momentCommentReplyTargetDrafts = new Map<string, string>();
let momentCommentActionMenu: { momentId: string; commentId: string; characterPickerOpen: boolean } | null = null;
let momentCommentSuppressTapUntil = 0;
const messageDrafts = new Map<string, string>();
const groupMessageDrafts = new Map<string, string>();
const chatStatusShelfOpenCharacterIds = new Set<string>();
let lastComposerSubmission: { characterId: string; content: string } | null = null;
const COMPOSER_FOCUS_KEEPALIVE_MS = 6000;
const COMPOSER_FOCUS_RETRY_DELAYS = [40, 120, 260, 520, 900];
let messageComposerKeyboardHoldCharacterId = '';
let focusMessageInputAfterRenderCharacterId = '';
let focusGroupInputAfterRenderChatId = '';
let messageComposerFocusKeepalive: { characterId: string; until: number } | null = null;
let groupComposerFocusKeepalive: { chatId: string; until: number } | null = null;
let focusMomentCommentAfterRenderId = '';
let contactQuery = '';
let quotedMessageId = '';
let messageActionId = '';
let messageDeleteChoiceId = '';
let messageEditId = '';
let groupMessageActionId = '';
let actionMenuAnchor: { kind: 'message' | 'group'; id: string; top: number } | null = null;
let shouldStickChatToBottom = false;
let messageProfileCharacterId = '';
let messageProfileAnchor: { left: number; top: number } | null = null;
let messageProfileOutsideCloserInstalled = false;
let discoveredModels: string[] = [];
let modelListStatus = '';
let modelListLoading = false;
let modelConnectionTesting = false;
let modelListError = false;
let worldWeatherLoading = false;
let worldWeatherStatus = '';
let serviceRestartLoading = false;
let worldLocationSearchWorldId = '';
let worldLocationCandidates: WorldWeatherLocation[] = [];
let pendingCardRecognition: ParsedCharacterCardFile | null = null;
let pendingStickerImport: PendingStickerImport | null = null;
let modelFormDraft: {
  provider: ModelProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  dailyRequestLimit: number;
} | null = null;
const MODEL_ONBOARDING_KEY = 'tavern-social-model-onboarding-v1';
const CHAT_REPLY_MODE_ONBOARDING_KEY = 'tavern-social-chat-reply-mode-onboarding-v1';
const TIME_MODE_ONBOARDING_KEY = 'tavern-social-time-mode-onboarding-v1';
const MOMENTS_TUTORIAL_KEY = 'tavern-social-moments-tutorial-v1';
let welcomeCoverOpen = shouldShowWelcomeCover();
let modelOnboardingOpen = localStorage.getItem(MODEL_ONBOARDING_KEY) !== 'done'
  && !state.modelConfig.model.trim();
let chatReplyModeOnboardingOpen = localStorage.getItem(CHAT_REPLY_MODE_ONBOARDING_KEY) !== 'done';
let timeModeOnboardingOpen = localStorage.getItem(TIME_MODE_ONBOARDING_KEY) !== 'done';
let momentsTutorialOpen = false;
let modelOnboardingDraft = {
  provider: state.modelConfig.provider,
  apiUrl: state.modelConfig.apiUrl,
  apiKey: state.modelConfig.apiKey,
  model: state.modelConfig.model,
};
const compactMedia = window.matchMedia('(max-width: 980px)');
let mediaListenerInstalled = false;
let mobileHistoryInstalled = false;
let mobileNativeBackInstalled = false;
let visualViewportListenerInstalled = false;
let uiSessionPersistenceInstalled = false;
let uiSessionSaveTimer: number | undefined;
let pendingIdleRender = false;
let pendingIdleInput: HTMLTextAreaElement | HTMLInputElement | null = null;
let pendingIdleRenderFlush: (() => void) | null = null;
let pendingScrollRestore: UiScrollSnapshot | null = null;

const SETTINGS_SECTIONS: SettingsSection[] = ['world', 'drafts', 'stickers', 'model', 'prompts', 'relationship', 'interactions', 'proactive', 'chat', 'notifications', 'data'];
const MOBILE_SECTIONS: MobileSection[] = ['messages', 'contacts', 'groups', 'world', 'moments', 'settings'];

function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && SETTINGS_SECTIONS.includes(value as SettingsSection);
}

function isMobileSection(value: unknown): value is MobileSection {
  return typeof value === 'string' && MOBILE_SECTIONS.includes(value as MobileSection);
}

function nonEmptyStringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {};
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([key, item]) => key && typeof item === 'string' && item.length > 0);
  return Object.fromEntries(entries) as Record<string, string>;
}

function isWorldEventLeadActor(value: unknown): value is WorldEventLeadActor {
  if (!value || typeof value !== 'object') return false;
  const actor = value as Record<string, unknown>;
  return (actor.type === 'user' || actor.type === 'character')
    && typeof actor.id === 'string'
    && typeof actor.name === 'string';
}

function normalizeEventDraft(value: unknown): EventComposerDraft {
  const draft = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const participantIds = Array.isArray(draft.participantIds)
    ? draft.participantIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : typeof draft.participantId === 'string' && draft.participantId
      ? [draft.participantId]
      : [];
  return {
    title: typeof draft.title === 'string' ? draft.title : '',
    description: typeof draft.description === 'string' ? draft.description : '',
    participantIds,
    leadActor: isWorldEventLeadActor(draft.leadActor) ? draft.leadActor : undefined,
    affinityDelta: typeof draft.affinityDelta === 'string' ? draft.affinityDelta : '0',
  };
}

function currentScrollContainer(): HTMLElement | null {
  if (mobileChatOpen || state.activeView === 'chat') return document.querySelector<HTMLElement>('.messages');
  if (mobileGroupChatOpen || state.activeView === 'groups') return document.querySelector<HTMLElement>('.group-messages');
  if (mobileSection === 'world' || state.activeView === 'world') return document.querySelector<HTMLElement>('.world-workbench-scroll');
  if (mobileSection === 'moments' || state.activeView === 'moments') return document.querySelector<HTMLElement>('.moments-scroll');
  return document.querySelector<HTMLElement>('.mobile-page, .settings-content');
}

function currentScrollKey(): string {
  if (mobileChatOpen || state.activeView === 'chat') return 'messages';
  if (mobileGroupChatOpen || state.activeView === 'groups') return `groups:${activeGroupChat()?.id ?? ''}`;
  if (mobileSection === 'world' || state.activeView === 'world') return 'world';
  if (mobileSection === 'moments' || state.activeView === 'moments') return 'moments';
  return `${mobileSection}:${mobileSettingsDetail ? 'detail' : 'list'}`;
}

function captureEventComposerDraftFromDom(): void {
  const participantInputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-event-participant]'));
  if (participantInputs.length > 0) {
    eventComposerDraft.participantIds = participantInputs
      .filter(input => input.checked)
      .map(input => input.value)
      .filter(Boolean);
  }
}

function captureVisibleDraftsFromDom(): void {
  const character = activeCharacter();
  const messageInput = document.querySelector<HTMLTextAreaElement>('#message-input');
  if (messageInput) {
    if (isSubmittedComposerEcho(character, messageInput.value)) {
      messageInput.value = '';
      setMessageDraft(character, '');
    } else {
      setMessageDraft(character, messageInput.value);
    }
  }
  const groupInput = document.querySelector<HTMLTextAreaElement>('#group-message-input');
  const groupChat = activeGroupChat();
  if (groupInput && groupChat) {
    setGroupMessageDraft(groupChat, groupInput.value);
  }
  updatePendingStickerImportDraftFromDom();
  const momentInput = document.querySelector<HTMLTextAreaElement>('#moment-input');
  if (momentInput) momentComposerTextDraft = momentInput.value;
  const momentAuthor = document.querySelector<HTMLSelectElement>('#moment-author-select');
  if (momentAuthor) momentComposerAuthorId = momentAuthor.value || 'user';
  const visibilityMode = document.querySelector<HTMLSelectElement>('#moment-visibility-mode');
  if (
    visibilityMode?.value === 'public'
    || visibilityMode?.value === 'private'
  ) {
    momentVisibilityMode = visibilityMode.value;
  }
  const selectedVisibilityIds = Array.from(document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-character]:checked'))
    .map(input => input.value)
    .filter(Boolean);
  if (selectedVisibilityIds.length > 0 || document.querySelector('[data-moment-visibility-character]')) {
    momentVisibilityCharacterIds.clear();
    selectedVisibilityIds.forEach(id => momentVisibilityCharacterIds.add(id));
  }
  const blockedVisibilityIds = Array.from(document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-blocked]:checked'))
    .map(input => input.value)
    .filter(Boolean);
  if (blockedVisibilityIds.length > 0 || document.querySelector('[data-moment-visibility-blocked]')) {
    momentVisibilityBlockedIds.clear();
    blockedVisibilityIds.forEach(id => momentVisibilityBlockedIds.add(id));
  }
  const timelineNote = document.querySelector<HTMLTextAreaElement>('#timeline-note-input');
  if (timelineNote) timelineNoteDraft = timelineNote.value;
  const worldRpInput = document.querySelector<HTMLTextAreaElement>('#world-rp-input');
  if (worldRpInput) worldRpInputDraft = worldRpInput.value;
  document.querySelectorAll<HTMLInputElement>('[data-comment-input]').forEach(input => {
    const momentId = input.dataset.commentInput;
    if (momentId) {
      if (input.value) momentCommentDrafts.set(momentId, input.value);
      else momentCommentDrafts.delete(momentId);
    }
  });
  document.querySelectorAll<HTMLSelectElement>('[data-comment-author-select]').forEach(select => {
    const momentId = select.dataset.commentAuthorSelect;
    if (momentId) momentCommentAuthorDrafts.set(momentId, select.value || 'user');
  });
  captureEventComposerDraftFromDom();
}

function captureScrollSnapshot(): UiScrollSnapshot | undefined {
  const container = currentScrollContainer();
  if (!container) return undefined;
  return {
    key: currentScrollKey(),
    top: container.scrollTop,
    left: container.scrollLeft,
    characterId: activeCharacter()?.id ?? '',
    groupChatId: activeGroupChat()?.id ?? '',
    activeView: state.activeView,
    mobileSection,
    mobileChatOpen,
    mobileGroupChatOpen,
  };
}

function captureUiSessionSnapshot({ captureDom = true } = {}): UiSessionSnapshot {
  if (captureDom) captureVisibleDraftsFromDom();
  return {
    savedAt: Date.now(),
    settingsOpen,
    activeSettingsSection,
    mobileSection,
    mobileChatOpen,
    mobileGroupChatOpen,
    desktopGroupChatOpen,
    groupSettingsOpen,
    groupSettingsMode,
    mobileSettingsDetail,
    characterPanelOpen,
    characterPanelPage,
    stickerPickerOpen,
    contactQuery,
    quotedMessageId,
    momentComposerOpen,
    momentComposerAuthorId,
    momentComposerTextDraft,
    momentVisibilityMode,
    momentVisibilityCharacterIds: Array.from(momentVisibilityCharacterIds),
    momentVisibilityBlockedIds: Array.from(momentVisibilityBlockedIds),
    timelineNoteDraft,
    worldRpInputDraft,
    activeWorldRpEventId,
    worldRpRenderMode,
    worldRpReplyMode,
    worldRpActorId,
    privateChatSpeakerId,
    eventComposerOpen,
    eventComposerDraft,
    messageDrafts: Object.fromEntries(messageDrafts),
    groupMessageDrafts: Object.fromEntries(groupMessageDrafts),
    momentCommentDrafts: Object.fromEntries(momentCommentDrafts),
    momentCommentAuthorDrafts: Object.fromEntries(momentCommentAuthorDrafts),
    momentCommentReplyTargetDrafts: Object.fromEntries(momentCommentReplyTargetDrafts),
    scroll: captureScrollSnapshot(),
  };
}

function saveUiSessionSnapshot(options: { captureDom?: boolean } = {}): void {
  try {
    localStorage.setItem(UI_SESSION_KEY, JSON.stringify(captureUiSessionSnapshot(options)));
  } catch {
    // Session restore is a convenience layer; the main app state is saved separately.
  }
}

function scheduleUiSessionSnapshotSave(): void {
  if (uiSessionSaveTimer !== undefined) window.clearTimeout(uiSessionSaveTimer);
  uiSessionSaveTimer = window.setTimeout(() => {
    uiSessionSaveTimer = undefined;
    saveUiSessionSnapshot();
  }, 180);
}

function resetTransientGenerationState(status: string): boolean {
  let changed = false;
  changed = resetReplyState(status) || changed;
  changed = resetGroupGenerationState(status) || changed;
  if (momentGenerating || commentingMomentId || autoCommentingMomentIds.size > 0) {
    momentGenerating = false;
    commentingMomentId = '';
    autoCommentingMomentIds.clear();
    momentGenerationStatus = status;
    changed = true;
  }
  if (eventGenerating || eventResolvingId || worldRpGenerating) {
    eventGenerating = false;
    eventResolvingId = '';
    worldRpGenerating = false;
    changed = true;
  }
  if (changed) setVisibleStatus(status);
  return changed;
}

function suspendRuntimeForBackground(): void {
  saveUiSessionSnapshot();
  resetTransientGenerationState('应用进入后台，已停止未完成的生成；输入内容已保留。');
}

function recoverRuntimeAfterForeground(): void {
  const active = document.activeElement as HTMLElement | null;
  if (active?.matches('input, textarea, select, [contenteditable="true"]')) {
    saveUiSessionSnapshot();
    return;
  }
  const changed = resetTransientGenerationState('已从后台恢复，未完成的生成已停止；可以重新发送或继续生成。');
  if (changed) render();
}

function installUiSessionPersistence(): void {
  if (uiSessionPersistenceInstalled) return;
  uiSessionPersistenceInstalled = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      suspendRuntimeForBackground();
    } else {
      recoverRuntimeAfterForeground();
    }
  });
  window.addEventListener('pagehide', suspendRuntimeForBackground);
  window.addEventListener('pageshow', recoverRuntimeAfterForeground);
  window.addEventListener('beforeunload', () => saveUiSessionSnapshot());
  window.addEventListener('blur', scheduleUiSessionSnapshotSave);
  window.addEventListener('focus', recoverRuntimeAfterForeground);
}

function restoreUiSessionSnapshot(): void {
  try {
    const raw = localStorage.getItem(UI_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as UiSessionSnapshot;
    if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > UI_SESSION_MAX_AGE) return;
    if (isSettingsSection(parsed.activeSettingsSection)) activeSettingsSection = parsed.activeSettingsSection;
    if (isMobileSection(parsed.mobileSection)) mobileSection = parsed.mobileSection;
    settingsOpen = Boolean(parsed.settingsOpen) && !compactMedia.matches;
    mobileChatOpen = Boolean(parsed.mobileChatOpen) && compactMedia.matches;
    mobileGroupChatOpen = Boolean(parsed.mobileGroupChatOpen) && compactMedia.matches;
    desktopGroupChatOpen = Boolean(parsed.desktopGroupChatOpen) && !compactMedia.matches;
    groupSettingsOpen = Boolean(parsed.groupSettingsOpen);
    groupSettingsMode = parsed.groupSettingsMode === 'edit' ? 'edit' : 'create';
    mobileSettingsDetail = Boolean(parsed.mobileSettingsDetail) && compactMedia.matches;
    characterPanelOpen = Boolean(parsed.characterPanelOpen);
    characterPanelPage = parsed.characterPanelPage === 'status' ? 'status' : 'worldbook';
    stickerPickerOpen = Boolean(parsed.stickerPickerOpen);
    contactQuery = typeof parsed.contactQuery === 'string' ? parsed.contactQuery : '';
    quotedMessageId = typeof parsed.quotedMessageId === 'string'
      && state.messages.some(message => message.id === parsed.quotedMessageId && !message.recalledAt)
      ? parsed.quotedMessageId
      : '';
    momentComposerOpen = Boolean(parsed.momentComposerOpen);
    momentComposerAuthorId = typeof parsed.momentComposerAuthorId === 'string' ? parsed.momentComposerAuthorId : 'user';
    momentComposerTextDraft = typeof parsed.momentComposerTextDraft === 'string' ? parsed.momentComposerTextDraft : '';
    momentVisibilityMode = parsed.momentVisibilityMode === 'private' ? 'private' : 'public';
    momentVisibilityCharacterIds.clear();
    if (Array.isArray(parsed.momentVisibilityCharacterIds)) {
      parsed.momentVisibilityCharacterIds
        .filter((id): id is string => typeof id === 'string')
        .forEach(id => momentVisibilityCharacterIds.add(id));
    }
    momentVisibilityBlockedIds.clear();
    if (Array.isArray(parsed.momentVisibilityBlockedIds)) {
      parsed.momentVisibilityBlockedIds
        .filter((id): id is string => typeof id === 'string')
        .forEach(id => momentVisibilityBlockedIds.add(id));
    }
    timelineNoteDraft = typeof parsed.timelineNoteDraft === 'string' ? parsed.timelineNoteDraft : '';
    worldRpInputDraft = typeof parsed.worldRpInputDraft === 'string' ? parsed.worldRpInputDraft : '';
    activeWorldRpEventId = '';
    worldRpRenderMode = parsed.worldRpRenderMode === 'bubble' ? 'bubble' : 'narration';
    // 小注释：世界 RP 的旧手动模式不再恢复，避免隐藏会话状态让“继续”只记录不生成。
    worldRpReplyMode = 'auto';
    worldRpActorId = typeof parsed.worldRpActorId === 'string'
      && (
        parsed.worldRpActorId === 'user'
        || state.characters.some(character => character.id === parsed.worldRpActorId && character.worldId === activeWorld().id)
      )
      ? parsed.worldRpActorId
      : 'user';
    privateChatSpeakerId = 'user';
    eventComposerOpen = Boolean(parsed.eventComposerOpen);
    eventComposerDraft = normalizeEventDraft(parsed.eventComposerDraft);
    messageDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.messageDrafts)).forEach(([key, value]) => messageDrafts.set(key, value));
    groupMessageDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.groupMessageDrafts)).forEach(([key, value]) => groupMessageDrafts.set(key, value));
    momentCommentDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.momentCommentDrafts)).forEach(([key, value]) => momentCommentDrafts.set(key, value));
    momentCommentAuthorDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.momentCommentAuthorDrafts)).forEach(([key, value]) => {
      momentCommentAuthorDrafts.set(key, value || 'user');
    });
    momentCommentReplyTargetDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.momentCommentReplyTargetDrafts)).forEach(([key, value]) => {
      if (value) momentCommentReplyTargetDrafts.set(key, value);
    });
    pendingScrollRestore = parsed.scroll && typeof parsed.scroll.key === 'string'
      ? parsed.scroll
      : null;
    if (!activeCharacter()) mobileChatOpen = false;
    if (!activeGroupChat()) mobileGroupChatOpen = false;
  } catch {
    localStorage.removeItem(UI_SESSION_KEY);
  }
}

function restoreScrollIfNeeded(): boolean {
  const snapshot = pendingScrollRestore;
  if (!snapshot) return false;
  pendingScrollRestore = null;
  const restored = applyScrollSnapshot(snapshot);
  if (restored) {
    // 小注释：动作菜单和图片可能在首轮布局后再改变高度，下一轮任务再按同一快照校正一次。
    window.setTimeout(() => applyScrollSnapshot(snapshot), 0);
  }
  return restored;
}

function applyScrollSnapshot(snapshot: UiScrollSnapshot | undefined | null): boolean {
  if (!snapshot) return false;
  if (
    snapshot.key !== currentScrollKey()
    || snapshot.activeView !== state.activeView
    || snapshot.mobileSection !== mobileSection
    || snapshot.mobileChatOpen !== mobileChatOpen
    || Boolean(snapshot.mobileGroupChatOpen) !== mobileGroupChatOpen
    || snapshot.characterId !== (activeCharacter()?.id ?? '')
    || (snapshot.groupChatId ?? '') !== (activeGroupChat()?.id ?? '')
  ) {
    return false;
  }
  const container = currentScrollContainer();
  if (!container) return false;
  container.scrollTop = snapshot.top;
  container.scrollLeft = snapshot.left;
  return true;
}

function captureActionMenuAnchor(kind: 'message' | 'group', id: string, element: HTMLElement): void {
  actionMenuAnchor = { kind, id, top: element.getBoundingClientRect().top };
}

function restoreActionMenuAnchorIfNeeded(): boolean {
  const anchor = actionMenuAnchor;
  if (!anchor) return false;
  actionMenuAnchor = null;
  const selector = anchor.kind === 'message' ? '[data-message-id]' : '[data-group-message-id]';
  const key = anchor.kind === 'message' ? 'messageId' : 'groupMessageId';
  const target = Array.from(document.querySelectorAll<HTMLElement>(selector))
    .find(element => element.dataset[key] === anchor.id);
  const container = currentScrollContainer();
  if (!target || !container) return false;
  const delta = target.getBoundingClientRect().top - anchor.top;
  if (Math.abs(delta) < 1) return true;
  container.scrollTop += delta;
  // 小注释：菜单向上打开会把上方消息挤开，这里锚定当前气泡，让位移被上方消息吸收。
  window.setTimeout(() => {
    const current = Array.from(document.querySelectorAll<HTMLElement>(selector))
      .find(element => element.dataset[key] === anchor.id);
    if (!current) return;
    container.scrollTop += current.getBoundingClientRect().top - anchor.top;
  }, 0);
  return true;
}

restoreUiSessionSnapshot();

type MessageInputFocusSnapshot = {
  focused: boolean;
  characterId: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

type GroupMessageInputFocusSnapshot = {
  focused: boolean;
  chatId: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

type MomentInputFocusSnapshot = {
  focused: boolean;
  kind: 'composer' | 'comment' | '';
  momentId: string;
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
};

function hasMobileBackTarget(): boolean {
  return compactMedia.matches && (
    Boolean(pendingCardRecognition)
    || Boolean(pendingStickerImport)
    || modelOnboardingOpen
    || timeModeOnboardingOpen
    || chatReplyModeOnboardingOpen
    || momentsTutorialOpen
    || characterPanelOpen
    || eventComposerOpen
    || Boolean(worldRpMessageEditId)
    || Boolean(activeWorldRpEventId)
    || momentComposerOpen
    || stickerPickerOpen
    || Boolean(messageEditId)
    || Boolean(messageDeleteChoiceId)
    || Boolean(messageProfileCharacterId)
    || Boolean(messageActionId)
    || groupSettingsOpen
    || mobileChatOpen
    || mobileGroupChatOpen
    || mobileSettingsDetail
    || mobileSection !== 'messages'
  );
}

function pushMobileHistory(layer: MobileHistoryLayer): void {
  if (!compactMedia.matches) return;
  window.history.pushState({ ...(window.history.state ?? {}), tavernSocialLayer: layer }, '');
}

function ensureMobileHistoryForState(): void {
  if (!hasMobileBackTarget()) return;
  if (window.history.state?.tavernSocialLayer) return;
  pushMobileHistory('section');
}

function closeMobileLayer(): boolean {
  captureVisibleDraftsFromDom();
  if (pendingCardRecognition) {
    pendingCardRecognition = null;
    saveUiSessionSnapshot();
    return true;
  }
  if (pendingStickerImport) {
    pendingStickerImport = null;
    saveUiSessionSnapshot();
    return true;
  }
  if (modelOnboardingOpen) {
    modelOnboardingOpen = false;
    localStorage.setItem(MODEL_ONBOARDING_KEY, 'done');
    saveUiSessionSnapshot();
    return true;
  }
  if (timeModeOnboardingOpen) {
    timeModeOnboardingOpen = false;
    localStorage.setItem(TIME_MODE_ONBOARDING_KEY, 'done');
    saveUiSessionSnapshot();
    return true;
  }
  if (chatReplyModeOnboardingOpen) {
    chatReplyModeOnboardingOpen = false;
    localStorage.setItem(CHAT_REPLY_MODE_ONBOARDING_KEY, 'done');
    saveUiSessionSnapshot();
    return true;
  }
  if (momentsTutorialOpen) {
    momentsTutorialOpen = false;
    localStorage.setItem(MOMENTS_TUTORIAL_KEY, 'done');
    saveUiSessionSnapshot();
    return true;
  }
  if (messageEditId) {
    messageEditId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (messageDeleteChoiceId) {
    messageDeleteChoiceId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (messageProfileCharacterId || messageProfileAnchor) {
    messageProfileCharacterId = '';
    messageProfileAnchor = null;
    saveUiSessionSnapshot();
    return true;
  }
  if (messageActionId) {
    messageActionId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (stickerPickerOpen) {
    stickerPickerOpen = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (characterPanelOpen) {
    characterPanelOpen = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (eventComposerOpen) {
    eventComposerOpen = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (worldRpMessageEditId) {
    worldRpMessageEditId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (activeWorldRpEventId) {
    activeWorldRpEventId = '';
    worldRpInputDraft = '';
    worldRpMessageEditId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (momentComposerOpen) {
    momentComposerOpen = false;
    momentGenerationStatus = '';
    setMomentComposerKeyboardFocus(false);
    saveUiSessionSnapshot();
    return true;
  }
  if (groupSettingsOpen) {
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    saveUiSessionSnapshot();
    return true;
  }
  if (mobileChatOpen) {
    mobileChatOpen = false;
    messageComposerKeyboardHoldCharacterId = '';
    quotedMessageId = '';
    messageActionId = '';
    clearVisibleStatus();
    saveUiSessionSnapshot();
    return true;
  }
  if (mobileGroupChatOpen) {
    mobileGroupChatOpen = false;
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    mobileSection = 'groups';
    clearVisibleStatus();
    saveUiSessionSnapshot();
    return true;
  }
  if (mobileSettingsDetail) {
    mobileSettingsDetail = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (mobileSection !== 'messages') {
    mobileSection = 'messages';
    mobileChatOpen = false;
    messageComposerKeyboardHoldCharacterId = '';
    mobileGroupChatOpen = false;
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    mobileSettingsDetail = false;
    momentComposerOpen = false;
    momentGenerationStatus = '';
    setMomentComposerKeyboardFocus(false);
    eventComposerOpen = false;
    saveUiSessionSnapshot();
    return true;
  }
  return false;
}

function backMobileLayer(): void {
  if (window.history.state?.tavernSocialLayer) {
    window.history.back();
    return;
  }
  if (closeMobileLayer()) render();
}

function forceRestartAllServices(): void {
  if (serviceRestartLoading) return;
  serviceRestartLoading = true;
  captureVisibleDraftsFromDom();
  saveUiSessionSnapshot();
  setStatusText('正在强制重启所有服务…');
  render();
  window.setTimeout(() => {
    window.location.reload();
  }, 120);
}

function fieldValue<T extends HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector: string): string {
  return document.querySelector<T>(selector)?.value.trim() ?? '';
}

function shouldShowGlobalStatus(): boolean {
  return globalStatusText.trim().length > 0;
}

function renderGlobalStatus(): string {
  if (!shouldShowGlobalStatus()) return '';
  return `<div class="global-status-toast" role="status" aria-live="polite">${escapeHtml(globalStatusText)}</div>`;
}

function clearVisibleStatus(): void {
  setChatStatusText('');
  globalStatusText = '';
  if (globalStatusHideTimer !== undefined) {
    window.clearTimeout(globalStatusHideTimer);
    globalStatusHideTimer = undefined;
  }
  appRoot.querySelector<HTMLElement>('.global-status-toast')?.remove();
}

function setVisibleStatus(value: string): void {
  setChatStatusText(value);
  globalStatusText = value;
  if (globalStatusHideTimer !== undefined) window.clearTimeout(globalStatusHideTimer);
  globalStatusHideTimer = window.setTimeout(() => {
    globalStatusText = '';
    appRoot.querySelector<HTMLElement>('.global-status-toast')?.remove();
  }, 4200);
  let toast = appRoot.querySelector<HTMLElement>('.global-status-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'global-status-toast';
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
    appRoot.append(toast);
  }
  toast.textContent = value;
}

function setStatusText(value: string): void {
  setVisibleStatus(value);
}

function checked(selector: string): boolean {
  return Boolean(document.querySelector<HTMLInputElement>(selector)?.checked);
}

async function handleCharacterAvatarInput(input: HTMLInputElement): Promise<void> {
  const file = input.files?.[0];
  const character = activeCharacter();
  if (!file || !character) return;
  try {
    await setCustomCharacterAvatar(character, file);
    setStatusText(`已更新 ${character.name} 的头像。`);
  } catch (error) {
    setStatusText(error instanceof Error ? error.message : String(error));
  } finally {
    input.value = '';
    render();
  }
}

function finiteNumber(value: string, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function companionTimeModeValue(value: string | undefined): CompanionTimeMode {
  return value === 'virtual' ? 'virtual' : 'system';
}

function selectedCompanionTimeMode(prefix: 'settings' | 'onboarding'): CompanionTimeMode {
  return companionTimeModeValue(
    document.querySelector<HTMLInputElement>(`input[name="${prefix}-companion-time-mode"]:checked`)?.value,
  );
}

function companionTimeMinutesFromFields(prefix: 'settings' | 'onboarding'): number {
  const hour = Math.max(0, Math.min(23, Math.round(finiteNumber(fieldValue(`#${prefix}-virtual-time-hour`), 0))));
  const minute = Math.max(0, Math.min(59, Math.round(finiteNumber(fieldValue(`#${prefix}-virtual-time-minute`), 0))));
  return clampVirtualTimeMinutes(hour * 60 + minute);
}

function syncVirtualClockFields(prefix: 'settings' | 'onboarding', source?: 'range' | 'parts'): void {
  const range = document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-range`);
  const hourInput = document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-hour`);
  const minuteInput = document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-minute`);
  const readout = document.querySelector<HTMLElement>(`#${prefix}-virtual-clock-readout`);
  const clock = document.querySelector<HTMLElement>(`[data-virtual-clock="${prefix}"]`);
  const mode = selectedCompanionTimeMode(prefix);
  const enabled = mode === 'virtual';
  document.querySelectorAll<HTMLInputElement>(`input[name="${prefix}-companion-time-mode"]`).forEach(input => {
    input.closest('.time-mode-option')?.classList.toggle('is-active', input.checked);
  });
  const nextMinutes = source === 'range'
    ? clampVirtualTimeMinutes(Number(range?.value ?? state.virtualTimeMinutes))
    : companionTimeMinutesFromFields(prefix);
  const hour = Math.floor(nextMinutes / 60);
  const minute = nextMinutes % 60;
  if (hourInput) {
    hourInput.disabled = !enabled;
    hourInput.value = String(hour);
  }
  if (minuteInput) {
    minuteInput.disabled = !enabled;
    minuteInput.value = String(minute);
  }
  if (range) {
    range.disabled = !enabled;
    range.value = String(nextMinutes);
  }
  if (readout) readout.textContent = formatClockMinutes(nextMinutes);
  clock?.classList.toggle('is-disabled', !enabled);
}

function bindCompanionTimeControls(prefix: 'settings' | 'onboarding'): void {
  document.querySelectorAll<HTMLInputElement>(`input[name="${prefix}-companion-time-mode"]`).forEach(radio => {
    radio.addEventListener('change', () => syncVirtualClockFields(prefix));
  });
  document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-range`)?.addEventListener('input', () => {
    syncVirtualClockFields(prefix, 'range');
  });
  document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-hour`)?.addEventListener('input', () => {
    syncVirtualClockFields(prefix, 'parts');
  });
  document.querySelector<HTMLInputElement>(`#${prefix}-virtual-time-minute`)?.addEventListener('input', () => {
    syncVirtualClockFields(prefix, 'parts');
  });
}

function modelProviderValue(value: string | undefined): ModelProvider {
  return value === 'custom' ? 'custom' : 'deepseek';
}

function modelProviderFor(apiUrl: string, provider?: ModelProvider): ModelProvider {
  if (provider === 'custom') return 'custom';
  const normalized = apiUrl.trim().replace(/\/+$/, '').toLowerCase();
  if (normalized && normalized !== DEEPSEEK_API_URL.toLowerCase()) return 'custom';
  return 'deepseek';
}

function apiUrlForProvider(provider: ModelProvider, currentUrl: string): string {
  if (provider === 'deepseek') return DEEPSEEK_API_URL;
  return currentUrl.trim().replace(/\/+$/, '').toLowerCase() === DEEPSEEK_API_URL.toLowerCase()
    ? ''
    : currentUrl;
}

function modelProviderOptions(provider: ModelProvider): string {
  return `
    <option value="deepseek" ${provider === 'deepseek' ? 'selected' : ''}>DeepSeek（默认）</option>
    <option value="custom" ${provider === 'custom' ? 'selected' : ''}>其他兼容 OpenAI</option>
  `;
}

function affinityProgress(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function characterDraftKey(character?: CharacterProfile): string {
  return character?.id ?? '__no_character__';
}

function messageDraftFor(character?: CharacterProfile): string {
  return messageDrafts.get(characterDraftKey(character)) ?? '';
}

function setMessageDraft(character: CharacterProfile | undefined, value: string): void {
  const key = characterDraftKey(character);
  if (value) {
    messageDrafts.set(key, value);
  } else {
    messageDrafts.delete(key);
  }
}

function groupDraftKey(chat?: GroupChatProfile): string {
  return chat?.id ?? '__no_group__';
}

function groupMessageDraftFor(chat?: GroupChatProfile): string {
  return groupMessageDrafts.get(groupDraftKey(chat)) ?? '';
}

function setGroupMessageDraft(chat: GroupChatProfile | undefined, value: string): void {
  const key = groupDraftKey(chat);
  if (value) {
    groupMessageDrafts.set(key, value);
  } else {
    groupMessageDrafts.delete(key);
  }
}

function isSubmittedComposerEcho(character: CharacterProfile | undefined, value: string): boolean {
  if (!lastComposerSubmission) return false;
  return lastComposerSubmission.characterId === (character?.id ?? '')
    && Boolean(value.trim())
    && value.trim() === lastComposerSubmission.content;
}

function noteComposerEditedAfterSubmit(character: CharacterProfile | undefined, value: string): void {
  if (!lastComposerSubmission) return;
  if (lastComposerSubmission.characterId !== (character?.id ?? '')) return;
  if (value.trim()) lastComposerSubmission = null;
}

function clearMessageComposerAfterSubmit(
  character: CharacterProfile | undefined,
  input: HTMLTextAreaElement | null,
  submittedContent: string,
  keepKeyboard: boolean,
): string | undefined {
  const replyToId = quotedMessageId || undefined;
  const submitted = submittedContent.trim();
  lastComposerSubmission = submitted
    ? { characterId: character?.id ?? '', content: submitted }
    : null;
  if (input) {
    input.value = '';
    resizeComposerTextarea(input);
    if (keepKeyboard) focusComposerInputForKeyboard(input);
  }
  setMessageDraft(character, '');
  messageComposerKeyboardHoldCharacterId = keepKeyboard ? character?.id ?? '' : '';
  quotedMessageId = '';
  messageActionId = '';
  messageDeleteChoiceId = '';
  stickerPickerOpen = false;
  saveUiSessionSnapshot();
  return replyToId;
}

function renderUserAvatar(): string {
  return escapeHtml((state.userName.trim() || '我').slice(0, 1));
}

function captureMessageInputFocus(): MessageInputFocusSnapshot {
  const input = document.querySelector<HTMLTextAreaElement>('#message-input');
  const character = activeCharacter();
  const focused = document.activeElement === input;
  if (input && focused) {
    if (isSubmittedComposerEcho(character, input.value)) {
      input.value = '';
      setMessageDraft(character, '');
    } else {
      setMessageDraft(character, input.value);
    }
  }
  return {
    focused,
    characterId: character?.id ?? '',
    value: input?.value ?? '',
    selectionStart: input?.selectionStart ?? null,
    selectionEnd: input?.selectionEnd ?? null,
  };
}

function restoreMessageInputFocus(snapshot: MessageInputFocusSnapshot): boolean {
  const character = activeCharacter();
  const shouldHoldKeyboard = Boolean(
    messageComposerKeyboardHoldCharacterId
      && messageComposerKeyboardHoldCharacterId === (character?.id ?? ''),
  );
  if (!snapshot.focused && !shouldHoldKeyboard) return false;
  if ((character?.id ?? '') !== snapshot.characterId) return false;
  if (state.activeView !== 'chat' && !mobileChatOpen) return false;
  const input = document.querySelector<HTMLTextAreaElement>('#message-input');
  if (!input) return false;
  if (isSubmittedComposerEcho(character, snapshot.value)) {
    input.value = '';
    setMessageDraft(character, '');
    resizeComposerTextarea(input);
    updateKeyboardOffset();
    if (!shouldHoldKeyboard) return false;
  } else if (input.value !== snapshot.value) {
    input.value = snapshot.value;
  }
  setMessageDraft(character, input.value);
  input.focus({ preventScroll: true });
  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    try {
      input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // Some mobile keyboards reject selection updates during composition.
    }
  }
  resizeComposerTextarea(input);
  updateKeyboardOffset();
  if (shouldHoldKeyboard) messageComposerKeyboardHoldCharacterId = '';
  return true;
}

function captureGroupMessageInputFocus(): GroupMessageInputFocusSnapshot {
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

function restoreGroupMessageInputFocus(snapshot: GroupMessageInputFocusSnapshot): boolean {
  if (!snapshot.focused) return false;
  const chat = activeGroupChat();
  if ((chat?.id ?? '') !== snapshot.chatId) return false;
  if (state.activeView !== 'groups' && !mobileGroupChatOpen) return false;
  const input = document.querySelector<HTMLTextAreaElement>('#group-message-input');
  if (!input) return false;
  if (input.value !== snapshot.value) input.value = snapshot.value;
  setGroupMessageDraft(chat, input.value);
  input.focus({ preventScroll: true });
  if (snapshot.selectionStart !== null && snapshot.selectionEnd !== null) {
    try {
      input.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    } catch {
      // Mobile keyboards can reject selection updates while the IME is settling.
    }
  }
  resizeComposerTextarea(input);
  updateKeyboardOffset();
  return true;
}

function captureMomentInputFocus(): MomentInputFocusSnapshot {
  const active = document.activeElement;
  if (active instanceof HTMLTextAreaElement && active.id === 'moment-input') {
    momentComposerTextDraft = active.value;
    return {
      focused: true,
      kind: 'composer',
      momentId: '',
      value: active.value,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd,
    };
  }
  if (active instanceof HTMLInputElement && active.dataset.commentInput) {
    const momentId = active.dataset.commentInput;
    momentCommentDrafts.set(momentId, active.value);
    return {
      focused: true,
      kind: 'comment',
      momentId,
      value: active.value,
      selectionStart: active.selectionStart,
      selectionEnd: active.selectionEnd,
    };
  }
  return { focused: false, kind: '', momentId: '', value: '', selectionStart: null, selectionEnd: null };
}

function restoreMomentInputFocus(snapshot: MomentInputFocusSnapshot): boolean {
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

function clearPendingIdleRender(): void {
  if (pendingIdleInput && pendingIdleRenderFlush) {
    pendingIdleInput.removeEventListener('blur', pendingIdleRenderFlush);
  }
  pendingIdleRender = false;
  pendingIdleInput = null;
  pendingIdleRenderFlush = null;
}

function applyCharacterAccent(_character?: CharacterProfile): void {
  const root = document.documentElement.style;
  root.removeProperty('--accent');
  root.removeProperty('--accent-strong');
  root.removeProperty('--accent-soft');
  root.removeProperty('--accent-rgb');
}

function renderAvatar(character: CharacterProfile): string {
  return character.avatar && /^(https?:|data:image\/)/i.test(character.avatar)
    ? `<img src="${escapeHtml(character.avatar)}" alt="" />`
    : escapeHtml(character.name.slice(0, 1));
}

type IconName = 'message' | 'contacts' | 'world' | 'moments' | 'events' | 'timeline' | 'settings' | 'search' | 'send' | 'refresh' | 'import' | 'sticker' | 'add' | 'back';

function icon(name: IconName): string {
  const paths: Record<IconName, string> = {
    message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
    contacts: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    world: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    moments: '<path d="M12 3v18M3 12h18"/><path d="m5 5 2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
    events: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M16 3.5v3M8 3.5v3M3.5 10h17"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
    timeline: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="7" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.09 14H3v-4h.09A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.09V3h4v.09A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.18.61.75 1.02 1.38 1.02H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
    send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
    import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
    sticker: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 10h.01M16 10h.01M8.5 15a5 5 0 0 0 7 0"/><path d="M15 21a6 6 0 0 1 6-6"/>',
    add: '<path d="M12 5v14M5 12h14"/>',
    back: '<path d="M15 18 9 12l6-6"/><path d="M9 12h12"/>',
  };
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${paths[name]}</svg>`;
}

function currentWorldCharacters(): CharacterProfile[] {
  const query = contactQuery.trim().toLocaleLowerCase();
  return state.characters.filter(character =>
    character.worldId === activeWorld().id
    && (!query || `${character.name} ${characterSettingsText(character)}`.toLocaleLowerCase().includes(query)),
  );
}

function stickerManagerCharacter(): CharacterProfile | undefined {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selected = characters.find(character => character.id === stickerManagerCharacterId);
  const fallback = selected ?? activeCharacter() ?? characters[0];
  if (fallback) stickerManagerCharacterId = fallback.id;
  return fallback;
}

function relationshipManagerCharacter(): CharacterProfile | undefined {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selected = characters.find(character => character.id === relationshipManagerCharacterId);
  const fallback = selected ?? activeCharacter() ?? characters[0];
  if (fallback) relationshipManagerCharacterId = fallback.id;
  return fallback;
}

function relationshipPairCharacters(): [CharacterProfile | undefined, CharacterProfile | undefined] {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  if (characters.length < 2) return [undefined, undefined];
  let first = characters.find(character => character.id === relationshipPairACharacterId)
    ?? relationshipManagerCharacter()
    ?? characters[0];
  let second = characters.find(character => character.id === relationshipPairBCharacterId && character.id !== first.id)
    ?? characters.find(character => character.id !== first.id);
  if (!second && first.id === relationshipPairBCharacterId) {
    first = characters.find(character => character.id !== relationshipPairBCharacterId) ?? first;
    second = characters.find(character => character.id === relationshipPairBCharacterId);
  }
  if (first) relationshipPairACharacterId = first.id;
  if (second) relationshipPairBCharacterId = second.id;
  return [first, second];
}

function proactiveManagerCharacter(): CharacterProfile | undefined {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selected = characters.find(character => character.id === proactiveManagerCharacterId);
  const fallback = selected ?? activeCharacter() ?? characters[0];
  if (fallback) proactiveManagerCharacterId = fallback.id;
  return fallback;
}

function lastMessageFor(character: CharacterProfile) {
  return messagesFor(character.id).reduce(
    (latest, message) => !latest || message.createdAt > latest.createdAt ? message : latest,
    undefined as ReturnType<typeof messagesFor>[number] | undefined,
  );
}

function recentCharacters(): CharacterProfile[] {
  return currentWorldCharacters().sort((left, right) => {
    const leftTime = lastMessageFor(left)?.createdAt ?? conversationFor(left.id)?.updatedAt ?? left.importedAt;
    const rightTime = lastMessageFor(right)?.createdAt ?? conversationFor(right.id)?.updatedAt ?? right.importedAt;
    return rightTime - leftTime;
  });
}

function formatConversationTime(value?: number): string {
  if (!value) return '';
  const date = new Date(value);
  const today = new Date();
  return date.toDateString() === today.toDateString()
    ? date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function relationshipStageLabel(stage: RelationshipStage): string {
  const labels: Record<RelationshipStage, string> = {
    stranger: '刚刚认识',
    familiar: '逐渐熟悉',
    close: '关系亲近',
    intimate: '彼此亲密',
    strained: '关系紧张',
  };
  return labels[stage];
}

function pacingStateLabel(state: PacingState): string {
  const labels: Record<PacingState, string> = {
    normal: '正常节奏',
    probe: '试探联系',
    waiting: '等待回应',
    cooldown: '降频冷却',
    silent: '暂时沉默',
  };
  return labels[state];
}

function relationshipLabel(character: CharacterProfile): string {
  return character.relationship.summary || relationshipStageLabel(character.relationship.stage);
}

function relationshipChanged(before: RelationshipState, after: RelationshipState): boolean {
  return before.stage !== after.stage
    || Math.round(before.affinity) !== Math.round(after.affinity)
    || before.summary.trim() !== after.summary.trim();
}

function characterRelationshipSideChanged(before: CharacterRelationshipSide, after: CharacterRelationshipSide): boolean {
  return before.stage !== after.stage || before.summary.trim() !== after.summary.trim();
}

function characterRelationshipChangeSummary(
  from: CharacterProfile,
  to: CharacterProfile,
  before: CharacterRelationshipSide,
  after: CharacterRelationshipSide,
): string {
  const lines: string[] = [];
  if (before.stage !== after.stage) {
    lines.push(`${from.name} → ${to.name}：${relationshipStageLabel(before.stage)} → ${relationshipStageLabel(after.stage)}`);
  }
  if (before.summary.trim() !== after.summary.trim()) {
    lines.push(after.summary.trim()
      ? `${from.name} 对 ${to.name} 的摘要：${compactText(after.summary.trim(), 120)}`
      : `${from.name} 对 ${to.name} 的摘要已清空`);
  }
  return lines.length > 0 ? lines.join('；') : '角色之间的关系已重新保存。';
}

function relationshipChangeSummary(before: RelationshipState, after: RelationshipState): string {
  const lines: string[] = [];
  if (before.stage !== after.stage) {
    lines.push(`关系阶段：${relationshipStageLabel(before.stage)} → ${relationshipStageLabel(after.stage)}`);
  }
  const beforeAffinity = Math.round(before.affinity);
  const afterAffinity = Math.round(after.affinity);
  if (beforeAffinity !== afterAffinity) {
    const delta = afterAffinity - beforeAffinity;
    lines.push(`好感度：${beforeAffinity} → ${afterAffinity}（${delta > 0 ? '+' : ''}${delta}）`);
  }
  if (before.summary.trim() !== after.summary.trim()) {
    lines.push(after.summary.trim()
      ? `关系摘要更新为：${compactText(after.summary.trim(), 120)}`
      : '关系摘要已清空');
  }
  return lines.length > 0 ? lines.join('；') : '关系状态已重新保存。';
}

function visibleMessagesForCharacter(character: CharacterProfile): ChatMessage[] {
  return messagesFor(character.id)
    .filter(message => !message.recalledAt && !message.impactRevokedAt);
}

function latestVisibleMessageFor(character: CharacterProfile): ChatMessage | undefined {
  const messages = visibleMessagesForCharacter(character);
  return messages[messages.length - 1];
}

function hasRecentMomentForCharacter(character: CharacterProfile): boolean {
  const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
  return state.moments.some(moment =>
    moment.worldId === character.worldId
    && moment.characterId === character.id
    && moment.createdAt >= dayAgo,
  );
}

function chatStatusShelfLine(character: CharacterProfile): string {
  const status = characterStatusFor(character);
  const latest = latestVisibleMessageFor(character);
  if (latest?.role === 'assistant') return '还在等你回那句话';
  if (status.unresolvedItems.length === 1) return '有一件事没处理';
  if (status.unresolvedItems.length > 1) return `有 ${status.unresolvedItems.length} 件事没处理`;
  if (hasRecentMomentForCharacter(character)) return '刚发了动态';
  const line = characterStatusLine(character).trim();
  return line && line !== '近况安静' ? line : '近况安静';
}

function messageTimelineHint(entry?: TimelineEntry): string {
  if (!entry || entry.revokedAt || !entry.includeInContext) return '';
  if (entry.type === 'chat') return '这句话已放进世界记录';
  if (entry.type === 'auto_message') return '这次主动联系已放进世界记录';
  return '';
}

function renderAffinityMeter(character: CharacterProfile): string {
  const value = Math.max(0, Math.round(character.relationship.affinity));
  const progress = affinityProgress(value);
  return `
    <div class="affinity-meter" style="--affinity-progress: ${progress}%">
      <div class="affinity-meter-label">
        <span>好感度</span>
        <strong>${value}</strong>
      </div>
      <div class="affinity-track" role="meter" aria-label="好感度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
        <span></span>
      </div>
      ${value > 100 ? `<small>已超过 100，进度条按 100 显示</small>` : ''}
    </div>
  `;
}

function renderCharacterIntroCard(character: CharacterProfile, compact = false): string {
  const note = character.profileNote?.trim();
  return `
    <section class="character-intro-card ${compact ? 'compact' : ''}">
      <div class="character-intro-copy">
        <strong>${escapeHtml(character.name)} 的背景故事备注</strong>
        <p>${escapeHtml(note || '还没有背景故事备注。点头像或右上角齿轮，可以补一段来历、过去经历，或这个角色和 user 之间已经发生过什么。')}</p>
      </div>
      ${renderAffinityMeter(character)}
    </section>
  `;
}

function countdownText(value?: number | null, disabledText = '未安排'): string {
  if (!value) return disabledText;
  const remaining = value - Date.now();
  if (remaining <= 0) return '等待触发';
  const minutes = Math.ceil(remaining / 60000);
  if (minutes < 60) return `${minutes} 分钟`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes > 0 ? `${hours} 小时 ${restMinutes} 分钟` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  const restHours = hours % 24;
  return restHours > 0 ? `${days} 天 ${restHours} 小时` : `${days} 天`;
}

function renderMessageProfilePopover(character?: CharacterProfile): string {
  if (!character || messageProfileCharacterId !== character.id) return '';
  const affinity = Math.max(0, Math.round(character.relationship.affinity));
  const left = Math.max(12, Math.min(messageProfileAnchor?.left ?? 18, window.innerWidth - 292));
  const top = Math.max(76, Math.min(messageProfileAnchor?.top ?? 96, window.innerHeight - 240));
  return `
    <button class="message-profile-backdrop" id="close-message-profile-popover" data-close-message-profile type="button" aria-label="关闭关系概览"></button>
    <aside class="message-profile-popover" style="left: ${left}px; top: ${top}px" role="dialog" aria-label="关系概览">
      <header>
        <span class="avatar mini-avatar">${renderAvatar(character)}</span>
        <div>
          <strong>${escapeHtml(character.name)}</strong>
          <small>和 user 的关系</small>
        </div>
      </header>
      <dl>
        <div><dt>现在关系</dt><dd>${escapeHtml(compactText(relationshipLabel(character), 46))}</dd></div>
        <div><dt>好感度</dt><dd>${affinity}</dd></div>
        <div><dt>下次主动事件</dt><dd>${escapeHtml(character.autoEvent.enabled ? countdownText(character.autoEvent.nextAttemptAt) : '未启用')}</dd></div>
        <div><dt>下次主动消息</dt><dd>${escapeHtml(character.autoMessage.enabled ? countdownText(character.autoMessage.nextAttemptAt) : '未启用')}</dd></div>
      </dl>
      <button class="secondary message-profile-status" type="button" data-open-character-status="${escapeHtml(character.id)}">查看状态页</button>
    </aside>
  `;
}

function closeMessageProfilePopover(): void {
  if (!messageProfileCharacterId && !messageProfileAnchor) return;
  messageProfileCharacterId = '';
  messageProfileAnchor = null;
  document.querySelector('.message-profile-popover')?.remove();
  document.querySelector('.message-profile-backdrop')?.remove();
  render();
}

function installMessageProfileOutsideCloser(): void {
  if (messageProfileOutsideCloserInstalled) return;
  messageProfileOutsideCloserInstalled = true;
  const closeFromOutsideEvent = (event: Event) => {
    if (!messageProfileCharacterId) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('.message-profile-popover')
      || target?.closest('[data-message-profile-character]')
    ) {
      return;
    }
    closeMessageProfilePopover();
  };
  document.addEventListener('pointerdown', closeFromOutsideEvent, true);
  document.addEventListener('mousedown', closeFromOutsideEvent, true);
  document.addEventListener('click', closeFromOutsideEvent, true);
}

function renderContacts(mode: 'contacts' | 'recent' = 'contacts'): string {
  const characters = mode === 'recent' ? recentCharacters() : currentWorldCharacters();
  if (characters.length === 0) {
    return `<div class="list-empty">${contactQuery ? '没有找到匹配的角色。' : '还没有角色。导入一张角色卡，开始第一段对话。'}</div>`;
  }
  return characters.map(character => {
    const latest = lastMessageFor(character);
    const unread = unreadCountFor(character.id);
    const statusLine = characterStatusLine(character);
    const subtitle = mode === 'recent'
      ? statusLine || (latest?.stickerId ? '[表情包]' : compactText(latest?.content, 48)) || '打开对话，和角色聊聊'
      : statusLine || compactText(characterSettingsText(character), 48) || '已导入角色卡';
    return `
    <button class="contact conversation-row ${character.id === activeCharacter()?.id ? 'is-active' : ''}" data-character-id="${escapeHtml(character.id)}">
      <span class="avatar">${renderAvatar(character)}</span>
      <span class="contact-copy">
        <span class="contact-name">${escapeHtml(character.name)}</span>
        <span class="contact-subtitle">${escapeHtml(subtitle)}</span>
      </span>
      <span class="conversation-meta">
        <time>${formatConversationTime(latest?.createdAt)}</time>
        ${unread > 0 ? `<span class="unread-badge" aria-label="${unread} 条未读">${unread > 99 ? '99+' : unread}</span>` : ''}
      </span>
    </button>
  `;
  }).join('');
}

function lastGroupMessageFor(chat: GroupChatProfile): GroupChatMessage | undefined {
  return groupMessagesFor(chat.id).reduce(
    (latest, message) => !latest || message.createdAt > latest.createdAt ? message : latest,
    undefined as GroupChatMessage | undefined,
  );
}

function groupChatSortTime(chat: GroupChatProfile): number {
  return lastGroupMessageFor(chat)?.createdAt ?? chat.updatedAt ?? chat.createdAt;
}

function renderGroupAvatarStack(chat: GroupChatProfile): string {
  const participants = groupParticipants(chat).slice(0, 3);
  if (participants.length === 0) {
    return '<span class="group-avatar-stack"><span class="avatar group-avatar-fallback">群</span></span>';
  }
  return `
    <span class="group-avatar-stack" aria-hidden="true">
      ${participants.map(character => `<span class="avatar">${renderAvatar(character)}</span>`).join('')}
    </span>
  `;
}

function renderGroupConversationRows(): string {
  const query = contactQuery.trim().toLocaleLowerCase();
  const chats = groupChatsForActiveWorld()
    .filter(chat => {
      if (!query) return true;
      const participantText = groupParticipants(chat).map(character => character.name).join(' ');
      return `${chat.title} ${participantText}`.toLocaleLowerCase().includes(query);
    })
    .sort((left, right) => groupChatSortTime(right) - groupChatSortTime(left));
  return chats.map(chat => {
    const latest = lastGroupMessageFor(chat);
    const participants = groupParticipants(chat);
    const subtitle = latest
      ? `${groupSpeakerName(latest)}：${compactText(latest.content, 48)}`
      : `${participants.length} 位成员，点开进入群聊`;
    return `
      <button class="contact conversation-row group-conversation-row ${chat.id === state.activeGroupChatId ? 'is-active' : ''}" data-group-chat-id="${escapeHtml(chat.id)}">
        ${renderGroupAvatarStack(chat)}
        <span class="contact-copy">
          <span class="contact-name">${escapeHtml(chat.title)}</span>
          <span class="contact-subtitle">${escapeHtml(subtitle)}</span>
        </span>
        <span class="conversation-meta">
          <time>${formatConversationTime(groupChatSortTime(chat))}</time>
        </span>
      </button>
    `;
  }).join('');
}

function renderGroupListPage(mobile = false): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  const rows = renderGroupConversationRows();
  const hasGroups = groupChatsForActiveWorld().length > 0;
  return `
    <main class="group-list-page ${mobile ? 'mobile-page mobile-group-list-page' : ''}">
      <header class="${mobile ? 'mobile-topbar group-list-topbar' : 'group-list-header'}">
        ${mobile ? '<button class="header-back" data-mobile-group-list-back aria-label="返回消息">‹</button>' : ''}
        <div>
          <span class="eyebrow">${escapeHtml(activeWorld().name)}</span>
          <h1>群聊</h1>
          <p>选择世界，创建群聊，或者从列表进入聊天。</p>
        </div>
        <button class="primary group-list-create" data-open-group-create type="button" aria-label="创建群聊">${icon('add')}<span>创建群聊</span></button>
      </header>
      <section class="group-list-tools">
        <label class="world-switcher">
          <span>当前世界</span>
          <select data-world-select aria-label="选择群聊世界">${worldOptions}</select>
        </label>
        <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="搜索群聊或成员" /></label>
      </section>
      <section class="group-list-surface" aria-label="群聊列表">
        ${rows
          ? `<div class="group-list-rows">${rows}</div>`
          : `<div class="list-empty group-list-empty"><strong>${hasGroups ? '没有找到匹配的群聊' : '还没有群聊'}</strong><p>${hasGroups ? '换个关键词试试。' : '先创建一个群聊，再从列表点进去聊天。'}</p>${hasGroups ? '' : '<button class="primary" data-open-group-create type="button">创建群聊</button>'}</div>`}
      </section>
      ${mobile ? renderGroupSettingsPanel(groupSettingsMode === 'edit' ? activeGroupChat() : undefined) : ''}
    </main>
  `;
}

function renderInboxConversations(): string {
  const groupRows = renderGroupConversationRows();
  const characterRows = recentCharacters().length > 0 ? renderContacts('recent') : '';
  if (!groupRows && !characterRows) return renderContacts('recent');
  return `${groupRows}${characterRows}`;
}

function renderMobileCharacterStoryStrip(): string {
  // 小注释：移动端消息页的头像横条是轻入口，点击后沿用联系人列表的私聊打开逻辑。
  const characters = currentWorldCharacters().slice(0, 8);
  if (characters.length === 0) return '';
  return `
    <section class="mobile-character-story-strip" aria-label="角色快捷入口">
      ${characters.map(character => `
        <button class="mobile-character-story" data-character-id="${escapeHtml(character.id)}" type="button">
          <span class="avatar">${renderAvatar(character)}</span>
          <small>${escapeHtml(character.name)}</small>
        </button>
      `).join('')}
    </section>
  `;
}

function openPrivateChatByCharacterId(characterId: string, options: { pushHistory?: boolean } = {}): void {
  const character = state.characters.find(item => item.id === characterId && item.worldId === activeWorld().id);
  if (!character) return;
  captureVisibleDraftsFromDom();
  state.activeCharacterId = character.id;
  privateChatSpeakerId = 'user';
  setActiveView('chat');
  markConversationRead(character.id);
  characterPanelOpen = false;
  stickerPickerOpen = false;
  quotedMessageId = '';
  messageActionId = '';
  if (compactMedia.matches) {
    mobileChatOpen = true;
    mobileGroupChatOpen = false;
    groupSettingsOpen = false;
    if (options.pushHistory !== false) pushMobileHistory('chat');
  }
  saveState();
  render();
  void generateOpeningMessage(character, render);
}

function renderChatStatusShelf(character?: CharacterProfile): string {
  if (!character) return '';
  const status = characterStatusFor(character);
  const isOpen = chatStatusShelfOpenCharacterIds.has(character.id);
  const unresolvedItems = status.unresolvedItems.slice(0, 3);
  const summary = chatStatusShelfLine(character);
  return `
    <section class="chat-status-shelf ${isOpen ? 'is-open' : ''}" aria-label="${escapeHtml(character.name)} 的当前状态">
      <button class="chat-status-shelf-toggle" type="button" data-chat-status-shelf="${escapeHtml(character.id)}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <span class="chat-status-dot" aria-hidden="true"></span>
        <span class="chat-status-summary">
          <strong>${escapeHtml(summary)}</strong>
          <small>${escapeHtml(compactText(relationshipLabel(character), 72))}</small>
        </span>
        <span class="chat-status-arrow" aria-hidden="true">${isOpen ? '⌃' : '⌄'}</span>
      </button>
      ${isOpen ? `
        <div class="chat-status-expanded">
          <div class="chat-status-metrics">
            <span><small>现在</small><strong>${escapeHtml(status.mood || '近况安静')}</strong></span>
            <span><small>关系</small><strong>${escapeHtml(relationshipStageLabel(status.relationshipStage))}</strong></span>
            <span><small>未处理</small><strong>${unresolvedItems.length > 0 ? `${unresolvedItems.length} 件` : '暂时没有'}</strong></span>
            <span><small>下一步</small><strong>${escapeHtml(compactText(status.nextInclination, 60))}</strong></span>
          </div>
          <div class="chat-status-unresolved">
            <strong>未解决事项</strong>
            ${unresolvedItems.length > 0
              ? `<ul>${unresolvedItems.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
              : '<p>暂时没有待处理事项。</p>'}
          </div>
          <button class="secondary chat-status-detail-button" type="button" data-open-character-status="${escapeHtml(character.id)}">查看完整状态</button>
        </div>
      ` : ''}
    </section>
  `;
}

function privateChatSpeaker(): PrivateChatSpeaker {
  const speakerCharacter = state.characters.find(character =>
    character.id === privateChatSpeakerId && character.worldId === activeWorld().id,
  );
  if (speakerCharacter) {
    return { speakerType: 'character', speakerCharacterId: speakerCharacter.id };
  }
  privateChatSpeakerId = 'user';
  return { speakerType: 'user' };
}

function privateChatSpeakerName(message: ChatMessage): string {
  if (message.speakerType === 'character' && message.speakerCharacterId) {
    return state.characters.find(character => character.id === message.speakerCharacterId)?.name ?? '已删除角色';
  }
  return state.userName.trim() || '我';
}

function privateChatSpeakerAvatar(message: ChatMessage): string {
  if (message.speakerType === 'character' && message.speakerCharacterId) {
    const character = state.characters.find(item => item.id === message.speakerCharacterId);
    return character ? renderAvatar(character) : escapeHtml(privateChatSpeakerName(message).slice(0, 1));
  }
  return renderUserAvatar();
}

function renderPrivateChatTargetSelector(): string {
  // 小注释：这个选择器就是左上角的角色入口；保留同一个 select，避免切换私信目标的逻辑分叉。
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selectedId = activeCharacter()?.id ?? characters[0]?.id ?? '';
  const selectedCharacter = characters.find(character => character.id === selectedId) ?? characters[0];
  if (characters.length === 0) return '';
  return `
    <label class="private-chat-identity-select">
      <span class="avatar private-chat-identity-avatar">${selectedCharacter ? renderAvatar(selectedCharacter) : renderUserAvatar()}</span>
      <span class="private-chat-identity-copy">
        <strong>${escapeHtml(selectedCharacter?.name ?? '选择角色')}</strong>
        <small>选择私信角色</small>
      </span>
      <select id="private-chat-target-select" aria-label="选择私信角色">
        ${characters.map(character => `<option value="${escapeHtml(character.id)}" ${selectedId === character.id ? 'selected' : ''}>${escapeHtml(character.name)}</option>`).join('')}
      </select>
      <span class="private-chat-identity-chevron">⌄</span>
    </label>
  `;
}

function renderMessages(character?: CharacterProfile): string {
  if (!character) {
    return `
      <div class="empty-state">
        <div class="empty-mark">${icon('message')}<span>TS</span></div>
        <h2>让角色真正住进你的消息里</h2>
        <p>导入 SillyTavern JSON 或 PNG 角色卡，建立独立私聊、关系和主动联系节奏。</p>
        <div class="empty-actions">
          <button class="primary" data-open-authoring>写角色卡</button>
          <label class="file-button">导入角色卡<input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
        </div>
      </div>
    `;
  }
  const messages = messagesFor(character.id);
  const introCard = renderCharacterIntroCard(character);
  if (messages.length === 0) {
    return `
      ${introCard}
      <div class="empty-state compact-empty">
        <span class="avatar hero-avatar">${renderAvatar(character)}</span>
        <h2>和 ${escapeHtml(character.name)} 开始聊天</h2>
        <p>${escapeHtml(compactText(characterSettingsText(character), 130) || '正在等待一条由角色设定生成的新开场消息。')}</p>
      </div>
    `;
  }
  const timelineEntriesByMessageId = new Map<string, TimelineEntry>();
  for (const entry of timelineForActiveWorld()) {
    if (entry.source.type === 'message' && !entry.revokedAt && entry.includeInContext) {
      timelineEntriesByMessageId.set(entry.source.id, entry);
    }
  }
  const rendered = messages.map((message, index) => {
    const sticker = message.stickerId ? findStickerById(message.stickerId) : undefined;
    const quoted = message.replyToId ? state.messages.find(item => item.id === message.replyToId) : undefined;
    const previous = messages[index - 1];
    const showTime = !previous || message.createdAt - previous.createdAt >= 5 * 60 * 1000;
    const variantInfo = messageVariantInfo(message);
    const memoryHint = messageTimelineHint(timelineEntriesByMessageId.get(message.id));
    const selfAuthoredCharacter = message.role === 'user' && message.speakerType === 'character';
    if (message.impactRevokedAt) {
      return `
        ${showTime ? `<div class="message-time">${formatConversationTime(message.createdAt)}</div>` : ''}
        <div class="recalled-message">${message.role === 'user' ? '你' : escapeHtml(character.name)}的一条消息影响已撤销</div>
      `;
    }
    if (message.recalledAt) {
      return `
        ${showTime ? `<div class="message-time">${formatConversationTime(message.createdAt)}</div>` : ''}
        <div class="recalled-message">${message.role === 'user' ? '你' : escapeHtml(character.name)}撤回了一条消息</div>
      `;
    }
    return `
    ${showTime ? `<div class="message-time">${formatConversationTime(message.createdAt)}</div>` : ''}
    <div class="message-row ${message.role === 'assistant' ? 'assistant' : 'user'} ${selfAuthoredCharacter ? 'is-authored-character' : ''} ${messageActionId === message.id ? 'has-actions-open-above' : ''}">
      ${message.role === 'assistant'
        ? `<button class="message-avatar assistant-avatar message-profile-trigger" type="button" data-message-profile-character="${escapeHtml(character.id)}" aria-label="查看 ${escapeHtml(character.name)} 和 user 的关系">${renderAvatar(character)}</button>`
        : `<span class="message-avatar user-avatar" aria-hidden="true">${privateChatSpeakerAvatar(message)}</span>`}
      <div class="message ${message.role === 'assistant' ? 'assistant' : 'user'} ${sticker ? 'sticker-message' : ''} ${messageActionId === message.id ? 'actions-open-above' : ''}"
        data-message-id="${escapeHtml(message.id)}" tabindex="0">
      <span class="swipe-quote-indicator" aria-hidden="true">↩</span>
      ${selfAuthoredCharacter ? `<small class="message-speaker-label">${escapeHtml(privateChatSpeakerName(message))} · 手写身份</small>` : ''}
      ${quoted ? `<div class="message-quote">${quoted.impactRevokedAt ? '原消息影响已撤销' : quoted.recalledAt ? '原消息已撤回' : escapeHtml(compactText(quoted.content, 64))}</div>` : ''}
      ${sticker
        ? `<img src="${escapeHtml(sticker.dataUrl)}" alt="${escapeHtml(sticker.name)}" title="${escapeHtml(sticker.name)}" />`
        : `<span class="message-copy">${escapeHtml(message.content)}</span>`}
      ${message.autoReason ? `<small class="message-reason">${escapeHtml(message.autoReason)}</small>` : ''}
      ${memoryHint ? `<small class="message-memory-hint">${escapeHtml(memoryHint)}</small>` : ''}
      ${messageActionId === message.id && !message.recalledAt ? `
        <div class="message-actions open-above" role="menu">
          ${message.role === 'user' ? `<button type="button" data-edit-message="${escapeHtml(message.id)}"><span>✎</span>修改</button>` : ''}
          ${message.role === 'assistant' ? `<button type="button" data-regenerate-message="${escapeHtml(message.id)}"><span>↻</span>重生</button>` : ''}
          <button type="button" data-delete-message-menu="${escapeHtml(message.id)}"><span>⌫</span>删除</button>
          <button type="button" data-quote-message="${escapeHtml(message.id)}"><span>↩</span>引用</button>
          <button type="button" data-pin-message-timeline="${escapeHtml(message.id)}"><span>◇</span>记入</button>
        </div>
      ` : ''}
      </div>
      ${variantInfo.count > 1 ? `
        <div class="message-variant-bar">
          <button type="button" data-message-variant-prev="${escapeHtml(message.id)}" aria-label="上一个版本">‹</button>
          <span>&lt;${variantInfo.index + 1}/${variantInfo.count}&gt;</span>
          <button type="button" data-message-variant-next="${escapeHtml(message.id)}" aria-label="下一个版本">›</button>
        </div>
      ` : ''}
    </div>
  `;
  }).join('');
  return `${introCard}${rendered}${isReplying() ? `
    <div class="replying-row" aria-live="polite">
      <span class="replying-dots"><i></i><i></i><i></i></span>
      <span>${escapeHtml(character.name)} 正在回复中…</span>
      <button id="stop-reply" class="secondary" type="button">停止回复</button>
    </div>
  ` : ''}`;
}

function renderStickerPicker(character?: CharacterProfile): string {
  if (!stickerPickerOpen || !character) return '';
  const userStickers = state.userStickers;
  const commonStickers = state.commonStickers;
  const renderGroup = (label: string, stickers: typeof userStickers) => `
    <section class="sticker-picker-group">
      <div class="sticker-group-label"><strong>${label}</strong><span>${stickers.length}</span></div>
      ${stickers.length > 0
        ? `<div class="sticker-picker-grid">${stickers.map(sticker => `
            <button type="button" data-send-sticker="${escapeHtml(sticker.id)}" title="${escapeHtml(sticker.name)}">
              <img src="${escapeHtml(sticker.dataUrl)}" alt="${escapeHtml(sticker.name)}" />
            </button>
          `).join('')}</div>`
        : '<p class="muted">暂无</p>'}
    </section>`;
  return `
    <div class="sticker-picker">
      <div class="sticker-picker-title"><strong>发送表情包</strong><span>${userStickers.length + commonStickers.length}/96</span></div>
      ${renderGroup('我的表情包', userStickers)}
      ${renderGroup('通用表情包', commonStickers)}
      ${userStickers.length + commonStickers.length === 0
        ? '<p class="muted">可在“设置 → 世界与角色”中导入用户或通用表情包。</p>'
        : ''}
    </div>
  `;
}

function renderStickerLibrary(
  scope: StickerLibraryScope,
  stickers: import('../core/types').StickerAsset[],
  character?: CharacterProfile,
): string {
  const config = {
    character: {
      title: '角色专属表情包',
      description: `仅供 ${character?.name ?? '当前角色'} 的模型使用，用户聊天面板不会显示。`,
      importId: 'character-sticker-import',
      empty: '导入后，当前角色会在合适的时候使用它们。',
    },
    common: {
      title: '通用表情包',
      description: '所有角色模型都可使用，用户也能从聊天面板直接发送。',
      importId: 'common-sticker-import',
      empty: '适合放所有人都能使用的常用表情。',
    },
    user: {
      title: '用户表情包',
      description: '只在你的聊天面板中显示，不会提供给角色模型。',
      importId: 'user-sticker-import',
      empty: '适合放只由你发送的个人表情。',
    },
  }[scope];
  return `
    <div class="sticker-library" data-sticker-library="${scope}">
      <div class="sticker-library-heading"><strong>${config.title}</strong><span>${stickers.length}/48</span></div>
      <p class="muted">${config.description} 导入后可以改名称并写备注，备注会帮助没有识图能力的模型理解图片。</p>
      <label class="file-button sticker-import-button">${icon('import')}<span>批量导入</span>
        <input id="${config.importId}" type="file" multiple accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" />
      </label>
      ${stickers.length > 0 ? `<div class="sticker-library-grid">${stickers.map(sticker => `
        <figure>
          <img src="${escapeHtml(sticker.dataUrl)}" alt="${escapeHtml(sticker.name)}" />
          <figcaption title="${escapeHtml(sticker.name)}">${escapeHtml(sticker.name)}</figcaption>
          ${sticker.note?.trim() ? `<small>${escapeHtml(compactText(sticker.note, 42))}</small>` : ''}
          <button type="button" data-delete-sticker="${escapeHtml(sticker.id)}" data-sticker-scope="${scope}" aria-label="删除 ${escapeHtml(sticker.name)}">×</button>
        </figure>
      `).join('')}</div>` : `<div class="sticker-empty">${config.empty}</div>`}
    </div>
  `;
}

function renderCharacterHeader(character?: CharacterProfile, backButton = false): string {
  if (!character) {
    return `
      <div class="chat-identity">
        ${backButton ? '<button class="header-back" data-mobile-back aria-label="返回">‹</button>' : ''}
        <div><strong>选择一个角色</strong><span>独立私聊会话</span></div>
      </div>
    `;
  }
  return `
    <div class="chat-identity">
      ${backButton ? '<button class="header-back" data-mobile-back aria-label="返回">‹</button>' : ''}
      <button class="avatar header-avatar avatar-button" id="open-character-profile" type="button" aria-label="查看角色状态">${renderAvatar(character)}</button>
      <div>
        <strong>${escapeHtml(character.name)}</strong>
        <span>${escapeHtml(compactText(relationshipLabel(character), 54))}</span>
      </div>
    </div>
  `;
}

function renderDesktopViewControls(character?: CharacterProfile): string {
  return `
    <nav class="view-tabs" aria-label="当前角色视图">
      <button class="${state.activeView === 'chat' ? 'is-active' : ''}" data-view="chat">消息</button>
      <button class="${state.activeView === 'world' ? 'is-active' : ''}" data-view="world">世界</button>
      <button class="${state.activeView === 'moments' ? 'is-active' : ''}" data-view="moments">动态</button>
    </nav>
    <div class="chat-header-actions">
      ${character ? `<button class="icon-button" id="open-character-panel" aria-label="打开角色设置">${icon('settings')}</button>` : ''}
      <button class="icon-button" id="open-settings-header" aria-label="打开设置">${icon('settings')}</button>
    </div>
  `;
}

function renderCharacterPanelTabs(): string {
  return `
    <nav class="character-panel-tabs" aria-label="角色面板">
      <button class="${characterPanelPage === 'status' ? 'is-active' : ''}" type="button" data-character-panel-page="status">状态</button>
      <button class="${characterPanelPage === 'worldbook' ? 'is-active' : ''}" type="button" data-character-panel-page="worldbook">设置</button>
    </nav>
  `;
}

function renderStatusList(title: string, items: string[], empty: string): string {
  return `
    <section class="character-status-block">
      <h3>${escapeHtml(title)}</h3>
      ${items.length > 0
        ? `<ul>${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`
        : `<p>${escapeHtml(empty)}</p>`}
    </section>
  `;
}

function renderCharacterStatusPage(character: CharacterProfile): string {
  const status = characterStatusFor(character);
  const updated = status.updatedAt ? new Date(status.updatedAt).toLocaleString() : '尚未保存';
  return `
    <section class="character-panel-page character-status-page">
      <div class="character-status-hero">
        <span class="avatar character-panel-avatar">${renderAvatar(character)}</span>
        <div class="character-panel-identity-copy">
          <span class="settings-kicker">角色状态</span>
          <h3>${escapeHtml(status.mood)}</h3>
          <p>${escapeHtml(status.summary)}</p>
        </div>
      </div>
      <div class="character-status-metrics">
        <span><strong>${escapeHtml(relationshipStageLabel(status.relationshipStage))}</strong><small>关系阶段</small></span>
        <span><strong>${status.affinity}</strong><small>好感度</small></span>
        <span><strong>${escapeHtml(status.source === 'model' ? '模型摘要' : '规则摘要')}</strong><small>来源</small></span>
      </div>
      ${status.relationshipSummary ? `
        <section class="character-status-block is-wide">
          <h3>关系摘要</h3>
          <p>${escapeHtml(status.relationshipSummary)}</p>
        </section>
      ` : ''}
      <section class="character-status-block is-wide">
        <h3>角色当前计划</h3>
        <p>${escapeHtml(character.currentPlan?.text ?? '')}</p>
        <p class="muted">来源：${escapeHtml(character.currentPlan?.source === 'model' ? '模型刷新' : '规则生成')}</p>
      </section>
      <div class="character-status-grid">
        ${renderStatusList('最近三件重要记忆', status.recentMemoryTitles, '还没有足够的重要记忆。')}
        ${renderStatusList('未解决事项', status.unresolvedItems, '暂时没有待处理事项。')}
        ${renderStatusList('最近活跃来源', status.activeSources, '最近还没有明显活跃来源。')}
        <section class="character-status-block">
          <h3>下一步倾向</h3>
          <p>${escapeHtml(status.nextInclination)}</p>
        </section>
      </div>
      <footer class="character-status-footer">
        <p class="muted">最后刷新：${escapeHtml(updated)}</p>
        <button class="secondary" id="refresh-character-plan" type="button">刷新当前计划</button>
        <button class="primary" id="refresh-character-status" type="button">刷新状态摘要</button>
      </footer>
    </section>
  `;
}

function renderCharacterWorldBookEntryEditor(character: CharacterProfile): string {
  const entries = characterWorldBookEntryDrafts(character);
  return `
    <section class="character-worldbook-editor" aria-label="附加世界书条目">
      <header>
        <div>
          <strong>附加世界书条目</strong>
          <p class="muted">像酒馆世界书一样维护关键词、正文和启用方式；主设定正文仍保存在上面的角色设定条目里。</p>
        </div>
        <button id="add-character-worldbook-entry" class="secondary" type="button">${icon('add')}<span>新增条目</span></button>
      </header>
      ${entries.length > 0 ? `
        <div class="character-worldbook-list">
          ${entries.map((entry, index) => `
            <article class="character-worldbook-entry" data-worldbook-entry-id="${escapeHtml(entry.id)}">
              <div class="character-worldbook-entry-head">
                <strong>条目 ${index + 1}</strong>
                <button class="danger" data-delete-character-worldbook-entry="${escapeHtml(entry.id)}" type="button">删除</button>
              </div>
              <div class="character-worldbook-grid">
                <label class="field">
                  <span>标题 / 注释</span>
                  <input data-worldbook-entry-comment value="${escapeHtml(entry.comment)}" placeholder="例如：学院旧闻、某个 NPC、隐藏规则" />
                </label>
                <label class="field">
                  <span>关键词</span>
                  <input data-worldbook-entry-keys value="${escapeHtml(entry.keys)}" placeholder="多个关键词用逗号或顿号分隔" />
                </label>
                <label class="field">
                  <span>插入顺序</span>
                  <input data-worldbook-entry-order type="number" step="1" value="${entry.insertionOrder}" />
                </label>
                <label class="field">
                  <span>位置</span>
                  <input data-worldbook-entry-position type="number" step="1" value="${entry.position}" />
                </label>
              </div>
              <label class="field">
                <span>正文</span>
                <textarea data-worldbook-entry-content placeholder="触发后要交给模型看的设定内容">${escapeHtml(entry.content)}</textarea>
              </label>
              <div class="character-worldbook-switches">
                <label><input data-worldbook-entry-enabled type="checkbox" ${entry.enabled ? 'checked' : ''} />启用</label>
                <label><input data-worldbook-entry-constant type="checkbox" ${entry.constant ? 'checked' : ''} />常驻</label>
                <label><input data-worldbook-entry-selective type="checkbox" ${entry.selective ? 'checked' : ''} />选择性</label>
              </div>
            </article>
          `).join('')}
        </div>
      ` : '<p class="muted character-worldbook-empty">还没有附加世界书条目。新增后可以像酒馆一样写关键词和正文。</p>'}
    </section>
  `;
}

function readCharacterWorldBookEntryDraftsFromPanel(): CharacterWorldBookEntryDraft[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.character-worldbook-entry')).map((entry, index) => ({
    id: entry.dataset.worldbookEntryId ?? '',
    comment: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-comment]')?.value.trim() ?? '',
    keys: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-keys]')?.value.trim() ?? '',
    content: entry.querySelector<HTMLTextAreaElement>('[data-worldbook-entry-content]')?.value.trim() ?? '',
    enabled: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-enabled]')?.checked ?? true,
    constant: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-constant]')?.checked ?? false,
    selective: entry.querySelector<HTMLInputElement>('[data-worldbook-entry-selective]')?.checked ?? false,
    insertionOrder: finiteNumber(entry.querySelector<HTMLInputElement>('[data-worldbook-entry-order]')?.value ?? '', index),
    position: finiteNumber(entry.querySelector<HTMLInputElement>('[data-worldbook-entry-position]')?.value ?? '', 0),
  }));
}

function renderCharacterSettingsPage(character: CharacterProfile): string {
  const worldBookText = characterSettingsText(character);
  return `
    <section class="character-panel-page">
      <div class="character-panel-identity">
        <span class="avatar character-panel-avatar">${renderAvatar(character)}</span>
        <div class="character-panel-identity-copy">
          <strong>头像与卡名</strong>
          <p class="muted">这里改的是当前角色卡本身，不会新建重复角色。</p>
          <label class="avatar-upload">
            ${icon('import')}<span>${character.customAvatar ? '更换头像' : '上传头像'}</span>
            <input id="character-panel-avatar-import" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" />
          </label>
        </div>
      </div>
      <label class="field character-panel-name-field">
        <span>卡名</span>
        <input id="character-panel-name" value="${escapeHtml(character.name)}" />
      </label>
      <label class="field">
        <span>背景故事备注</span>
        <textarea id="character-profile-note" placeholder="例如：她从哪里来，为什么留在这个世界里，过去和 user 发生过什么。">${escapeHtml(character.profileNote ?? '')}</textarea>
      </label>
      <label class="field">
        <span>好感度（没有上限）</span>
        <input id="character-affinity-free" type="number" min="0" step="1" value="${Math.max(0, Math.round(character.relationship.affinity))}" />
      </label>
      <p class="muted">进度条只显示 0 到 100；数值可以继续往上加。</p>
      <label class="field">
        <span>设定世界书正文</span>
        <textarea id="character-panel-worldbook" placeholder="外貌、性格、爱好、背景、说话方式等都写在这里。">${escapeHtml(worldBookText)}</textarea>
      </label>
      ${renderCharacterWorldBookEntryEditor(character)}
      <button id="save-character-panel" class="primary" type="button">保存角色设置</button>
    </section>
  `;
}

function renderCharacterPanel(character?: CharacterProfile): string {
  if (!characterPanelOpen || !character) return '';
  const statusMode = characterPanelPage === 'status';
  return `
    <div class="character-panel-overlay" role="dialog" aria-modal="true" aria-label="${statusMode ? '角色状态' : '角色设置'}">
      <button class="character-panel-backdrop" id="close-character-panel-backdrop" type="button" aria-label="关闭角色面板"></button>
      <aside class="character-panel">
        <header class="character-panel-header">
          <div>
            <span class="settings-kicker">${statusMode ? '角色状态' : '角色设置'}</span>
            <h2>${escapeHtml(character.name)}</h2>
          </div>
          <button class="icon-button" id="close-character-panel" type="button" aria-label="关闭角色面板">×</button>
        </header>
        ${renderCharacterPanelTabs()}
        ${statusMode ? renderCharacterStatusPage(character) : renderCharacterSettingsPage(character)}
      </aside>
    </div>
  `;
}

function renderMessageEditDialog(): string {
  if (!messageEditId) return '';
  const message = state.messages.find(item => item.id === messageEditId && item.role === 'user' && !item.recalledAt);
  if (!message) return '';
  return `
    <div class="message-edit-overlay" role="dialog" aria-modal="true" aria-label="修改消息">
      <button class="message-edit-backdrop" id="close-message-edit-backdrop" type="button" aria-label="关闭修改消息"></button>
      <section class="message-edit-dialog">
        <header>
          <div>
            <span>修改后重新生成</span>
            <h2>修改这条消息</h2>
            <p>保存后会清空这条消息之后的回复，并按新内容重新生成。</p>
          </div>
          <button class="icon-button" id="close-message-edit" type="button" aria-label="关闭修改消息">×</button>
        </header>
        <label class="field">
          <span>消息内容</span>
          <textarea id="message-edit-input">${escapeHtml(message.content)}</textarea>
        </label>
        <footer>
          <button class="secondary" id="cancel-message-edit" type="button">取消</button>
          <button class="primary" id="confirm-message-edit" type="button">保存并重新生成</button>
        </footer>
      </section>
    </div>
  `;
}

function groupSpeakerName(message: GroupChatMessage): string {
  if (message.speakerType === 'user') return state.userName || '我';
  if (message.speakerType === 'system') return '系统';
  return state.characters.find(character => character.id === message.speakerCharacterId)?.name ?? '已删除角色';
}

function renderGroupMessageAvatar(message: GroupChatMessage): string {
  if (message.speakerType === 'character') {
    const character = state.characters.find(item => item.id === message.speakerCharacterId);
    return character ? renderAvatar(character) : escapeHtml(groupSpeakerName(message).slice(0, 1));
  }
  return renderUserAvatar();
}

function userSelfLabel(): string {
  const name = state.userName.trim();
  return name && name !== '我' ? `我（${name}）` : '我';
}

function groupUserSpeakerLabel(): string {
  return userSelfLabel();
}

function renderGroupMessages(chat?: GroupChatProfile): string {
  const generatingHint = isGroupGenerating()
    ? '<div class="group-generation-hint">角色正在组织下一句…</div>'
    : '';
  if (!chat) {
    return '<div class="empty-chat"><strong>还没有群聊</strong><p>先创建一个群聊，再让角色们互相说话。</p></div>';
  }
  const messages = groupMessagesFor(chat.id);
  if (messages.length === 0) {
    return `<div class="empty-chat"><strong>群聊刚刚打开</strong><p>${chat.allowModelInitiatedMessages
      ? '你可以先用左上角选择身份发一句，也可以点“主动续聊”让角色先开口。'
      : '你可以先发一句。要让角色自己开口，先在右上角齿轮里开启高消耗主动发言。'}</p></div>${generatingHint}`;
  }
  return `${messages.map(message => {
    const selfAuthoredCharacter = message.speakerType === 'character' && message.source === 'user';
    if (message.recalledAt) {
      return '<div class="group-recalled-message">撤回了一条群聊消息</div>';
    }
    return `
      <article class="group-message ${message.speakerType === 'user' ? 'is-user' : 'is-character'} ${selfAuthoredCharacter ? 'is-authored-character' : ''} ${groupMessageActionId === message.id ? 'is-actions-open is-actions-open-above' : ''}" data-group-message-id="${escapeHtml(message.id)}" tabindex="0">
        <span class="avatar group-message-avatar">${renderGroupMessageAvatar(message)}</span>
        <div class="group-message-body">
          <header>
            <strong>${escapeHtml(groupSpeakerName(message))}</strong>
            ${selfAuthoredCharacter ? '<small>手写身份</small>' : message.source === 'auto_model' ? '<small>主动生成</small>' : ''}
          </header>
          <p>${escapeHtml(message.content)}</p>
          ${groupMessageActionId === message.id ? `
            <div class="group-message-actions" role="menu">
              ${message.speakerType === 'character' ? `<button type="button" data-regenerate-group-message="${escapeHtml(message.id)}">重生</button>` : ''}
              <button type="button" data-recall-group-message="${escapeHtml(message.id)}">撤回</button>
              <button type="button" data-delete-group-message="${escapeHtml(message.id)}">删除</button>
            </div>
          ` : ''}
        </div>
      </article>
    `;
  }).join('')}${generatingHint}`;
}

function renderGroupSpeakerPicker(chat?: GroupChatProfile): string {
  if (!chat) return '';
  const participants = groupParticipants(chat);
  const selected = chat.selectedSpeakerId === 'user' || participants.some(character => character.id === chat.selectedSpeakerId)
    ? chat.selectedSpeakerId
    : 'user';
  return `
    <label class="group-speaker-switch">
      <span>发言身份</span>
      <select id="group-speaker-select">
        <option value="user" ${selected === 'user' ? 'selected' : ''}>${escapeHtml(groupUserSpeakerLabel())}</option>
        ${participants.map(character => `<option value="${escapeHtml(character.id)}" ${selected === character.id ? 'selected' : ''}>${escapeHtml(character.name)}</option>`).join('')}
      </select>
    </label>
  `;
}

function renderGroupParticipantsEditor(chat?: GroupChatProfile): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  if (characters.length === 0) {
    return '<p class="muted">当前世界还没有角色。先导入或写一张角色卡，再创建群聊。</p>';
  }
  const selected = new Set(chat?.participantCharacterIds ?? characters.map(character => character.id));
  return `
    <div class="group-participant-grid">
      ${characters.map(character => `
        <label class="group-participant-option ${selected.has(character.id) ? 'is-active' : ''}">
          <input type="checkbox" data-group-participant value="${escapeHtml(character.id)}" ${selected.has(character.id) ? 'checked' : ''} />
          <span class="avatar">${renderAvatar(character)}</span>
          <strong>${escapeHtml(character.name)}</strong>
        </label>
      `).join('')}
    </div>
  `;
}

function renderGroupMemberActions(chat?: GroupChatProfile): string {
  if (!chat) return '';
  const participants = groupParticipants(chat);
  if (participants.length === 0) return '<p class="muted">这个群聊还没有角色成员。</p>';
  return `
    <div class="group-member-actions">
      ${participants.map(character => `
        <button class="secondary" type="button" data-generate-group-speaker="${escapeHtml(character.id)}" ${isGroupGenerating() ? 'disabled' : ''}>
          让 ${escapeHtml(character.name)} 说
        </button>
      `).join('')}
    </div>
  `;
}

function renderGroupHeader(chat?: GroupChatProfile, mobile = false): string {
  const participants = chat ? groupParticipants(chat) : [];
  const subtitle = chat ? `${participants.length} 位成员` : '创建或管理群聊';
  return `
    <div class="chat-identity group-chat-identity">
      <button class="header-back" ${mobile ? 'data-mobile-group-back' : 'data-group-list-back'} aria-label="返回">‹</button>
      ${chat ? renderGroupAvatarStack(chat) : '<span class="avatar group-avatar-fallback">群</span>'}
      <div>
        <strong>${escapeHtml(chat?.title ?? '群聊')}</strong>
        <span>${escapeHtml(subtitle)}</span>
      </div>
    </div>
  `;
}

function renderGroupManagementSection(chat: GroupChatProfile): string {
  const participants = groupParticipants(chat);
  const messageCount = groupMessagesFor(chat.id).length;
  const disabled = isGroupGenerating();
  return `
    <section class="group-settings-section group-management-section">
      <div class="mobile-section-label">
        <strong>群聊管理</strong>
        <span>${participants.length} 位成员 · ${messageCount} 条聊天记录</span>
      </div>
      <p class="muted">清空只删除这个群的聊天记录；解散会删除群聊和记录，角色卡不会被删除。</p>
      <div class="group-danger-actions">
        <button class="secondary" id="clear-group-messages" type="button" ${messageCount > 0 && !disabled ? '' : 'disabled'}>清空聊天记录</button>
        <button class="danger" id="delete-group-chat" type="button" ${disabled ? 'disabled' : ''}>解散群聊</button>
      </div>
    </section>
  `;
}

function renderGroupSettingsPanel(chat?: GroupChatProfile): string {
  if (!groupSettingsOpen) return '';
  const title = chat?.title ?? `${activeWorld().name} 群聊`;
  const activeGenerationDisabled = !chat?.allowModelInitiatedMessages || isGroupGenerating();
  return `
    <div class="group-settings-overlay" role="dialog" aria-modal="true" aria-label="群聊设置">
      <button class="group-settings-backdrop" id="close-group-settings-backdrop" type="button" aria-label="关闭群聊设置"></button>
      <aside class="group-settings-panel">
        <header class="group-settings-header">
          <div>
            <span class="settings-kicker">Group Settings</span>
            <h2>${escapeHtml(chat ? chat.title : '创建群聊')}</h2>
          </div>
          <button class="icon-button" id="close-group-settings" type="button" aria-label="关闭群聊设置">×</button>
        </header>
        <label class="field">
          <span>群名称</span>
          <input id="group-title-input" value="${escapeHtml(title)}" placeholder="例如：晚自习后的群聊" />
        </label>
        ${chat ? renderGroupSpeakerPicker(chat) : ''}
        <section class="group-settings-section">
          <div class="mobile-section-label">
            <strong>群成员</strong>
            <span>勾选会出现在群里的角色</span>
          </div>
          ${renderGroupParticipantsEditor(chat)}
        </section>
        <div class="group-settings-actions">
          <button class="secondary" id="cancel-group-settings" type="button">取消</button>
          <button class="primary" id="save-group-chat" type="button">${chat ? '保存设置' : '创建群聊'}</button>
        </div>
        ${chat ? `
          <section class="group-settings-section">
            <div class="mobile-section-label">
              <strong>群聊回复</strong>
              <span>指定谁说话，或让所有成员回复上一条</span>
            </div>
            <label class="group-reply-toggle">
              <span>
                <strong>每位成员回复上一条</strong>
                <small>用户发言后只自动生成一轮，避免同一条消息被反复大规模回复。</small>
              </span>
              ${renderSwitchControl('id="group-reply-all-on-user-message"', chat.replyAllOnUserMessage, '每位成员回复上一条')}
            </label>
            <label class="group-reply-toggle group-expensive-toggle">
              <span>
                <strong>允许模型主动发言</strong>
                <small>默认关闭。打开后，模型可以在群里主动开话题，并允许角色继续接这类消息；会明显增加 token 消耗。</small>
              </span>
              ${renderSwitchControl('id="group-allow-model-initiated-messages"', chat.allowModelInitiatedMessages, '允许模型主动发言')}
            </label>
            <div class="group-generation-panel">
              <button class="secondary" id="generate-group-next" type="button" ${!isGroupGenerating() ? '' : 'disabled'}>生成下一步</button>
              <button class="primary" id="generate-group-active" type="button" ${activeGenerationDisabled ? 'disabled' : ''}>主动续聊</button>
            </div>
            ${renderGroupMemberActions(chat)}
          </section>
          ${renderGroupManagementSection(chat)}
        ` : ''}
      </aside>
    </div>
  `;
}

function renderGroupChatPage(mobile = false): string {
  const chat = activeGroupChat();
  const manualReplyMode = state.chatReplyMode === 'manual';
  const generateLabel = isGroupGenerating() ? '生成中' : manualReplyMode ? '生成' : '继续';
  return `
    <main class="chat group-chat ${mobile ? 'mobile-group-chat mobile-chat-detail' : ''}">
      <header class="chat-header group-chat-header">
        ${renderGroupHeader(chat, mobile)}
        ${mobile
          ? `<button class="icon-button character-gear-button" id="open-group-settings" data-open-group-settings aria-label="打开群聊设置">${icon('settings')}</button>`
          : `<div class="chat-header-actions"><button class="icon-button" id="open-group-settings" data-open-group-settings aria-label="打开群聊设置">${icon('settings')}</button><button class="icon-button" id="open-settings-header" aria-label="打开设置">${icon('settings')}</button></div>`}
      </header>
      <section class="group-chat-main">
        <div class="group-messages">${renderGroupMessages(chat)}</div>
        <form class="composer group-composer has-generate-action ${manualReplyMode ? 'manual-reply-mode' : ''}" id="group-composer">
          <textarea id="group-message-input" rows="1" enterkeyhint="${state.enterToSend ? 'send' : 'enter'}" aria-label="群聊输入框" placeholder="${chat ? (manualReplyMode ? '发短消息，之后点生成...' : '发消息；清空输入框可点继续...') : '先创建群聊'}" ${chat ? '' : 'disabled'}>${escapeHtml(groupMessageDraftFor(chat))}</textarea>
          <button class="secondary generate-reply-button" id="generate-group-inline" type="button" aria-label="让群聊继续" ${chat && !isGroupGenerating() ? '' : 'disabled'}>${icon('refresh')}<span>${generateLabel}</span></button>
          <button class="primary send-button" type="submit" aria-label="发送群聊消息" ${chat ? '' : 'disabled'}>${icon('send')}<span>发送</span></button>
        </form>
      </section>
      ${mobile ? renderGroupSettingsPanel(groupSettingsMode === 'edit' ? chat : undefined) : ''}
    </main>
  `;
}

function renderChatPane(character?: CharacterProfile, mobile = false): string {
  const quoted = quotedMessageId ? state.messages.find(message => message.id === quotedMessageId && !message.recalledAt) : undefined;
  const manualReplyMode = state.chatReplyMode === 'manual';
  return `
    <main class="chat ${character ? 'has-status-shelf' : ''} ${mobile ? 'mobile-chat-detail' : ''}">
      <header class="chat-header">
        ${renderCharacterHeader(character, mobile)}
        ${mobile ? '' : renderDesktopViewControls(character)}
        ${mobile && character ? `<button class="icon-button character-gear-button" id="open-character-panel" aria-label="打开角色设置">${icon('settings')}</button>` : ''}
      </header>
      ${renderChatStatusShelf(character)}
      <section class="messages">${renderMessages(character)}</section>
      <div class="chat-composer-area">
        ${renderStickerPicker(character)}
        ${quoted ? `
          <div class="composer-quote">
            <div><strong>引用消息</strong><span>${escapeHtml(compactText(quoted.content, 120))}</span></div>
            <button id="cancel-quote" type="button" aria-label="取消引用">×</button>
          </div>
        ` : ''}
        <form class="composer ${manualReplyMode ? 'manual-reply-mode' : ''}" id="composer">
          <button class="sticker-trigger ${stickerPickerOpen ? 'is-active' : ''}" id="toggle-stickers" type="button" aria-label="表情包">${icon('sticker')}</button>
          <textarea id="message-input" rows="1" enterkeyhint="${state.enterToSend ? 'send' : 'enter'}" aria-label="${character ? `发消息给 ${escapeHtml(character.name)}` : '消息输入框'}" placeholder="${character ? `发消息给 ${escapeHtml(character.name)}…` : '请先导入角色卡'}">${escapeHtml(messageDraftFor(character))}</textarea>
          ${manualReplyMode ? `<button class="secondary generate-reply-button" id="generate-reply" type="button" aria-label="生成回复" ${isReplying() || !character ? 'disabled' : ''}>${icon('refresh')}<span>生成</span></button>` : ''}
          <button class="primary send-button" type="submit" aria-label="发送" ${isReplying() ? 'disabled' : ''}>${icon('send')}<span>发送</span></button>
        </form>
      </div>
      ${messageDeleteChoiceId ? `
        <div class="message-choice-overlay" role="dialog" aria-modal="true" aria-label="处理消息">
          <button class="message-choice-backdrop" id="cancel-message-choice" aria-label="取消"></button>
          <section class="message-choice-dialog">
            <h2>处理这条消息</h2>
            <p>彻底删除后，AI 不再读取；撤回会留下记录，AI 仍记得原内容。</p>
            <button id="confirm-delete-message" class="danger" type="button">彻底删除</button>
            <button id="confirm-recall-message" class="secondary" type="button">撤回并保留痕迹</button>
            <button id="close-message-choice" class="plain-button" type="button">取消</button>
          </section>
        </div>
      ` : ''}
      ${renderMessageEditDialog()}
      ${renderMessageProfilePopover(character)}
      ${renderCharacterPanel(character)}
    </main>
  `;
}

function renderMomentComposerLauncher(): string {
  return `
    <button class="moment-compose-fab" id="open-moment-composer" type="button" aria-haspopup="dialog">
      ${icon('send')}<span>发布动态</span>
    </button>
    ${momentComposerOpen ? '<button class="moment-composer-backdrop" id="close-moment-composer-backdrop" type="button" aria-label="关闭发布动态"></button>' : ''}
  `;
}

function currentMomentVisibilityDraft() {
  const mode = momentVisibilityMode === 'private' ? 'private' : 'public';
  return normalizeMomentVisibilityDraft(
    mode,
    Array.from(momentVisibilityCharacterIds),
    Array.from(momentVisibilityBlockedIds),
  );
}

function resetMomentComposerDraft(): void {
  momentComposerTextDraft = '';
  momentGenerationStatus = '';
  momentVisibilityMode = 'public';
  momentVisibilityPickerOpenFor = null;
  momentVisibilityCharacterIds.clear();
  momentVisibilityBlockedIds.clear();
}

function renderMomentVisibilityContactPicker(
  characters: CharacterProfile[],
  selectedIds: Set<string>,
  dataName: 'data-moment-visibility-character' | 'data-moment-visibility-blocked',
  mode: 'specific' | 'blocked',
): string {
  const selectedCount = selectedIds.size;
  const isOpen = momentVisibilityPickerOpenFor === mode;
  const summary = selectedCount > 0
    ? `已选择 ${selectedCount} 个角色`
    : mode === 'specific' ? '未选择角色' : '未屏蔽角色';
  const title = mode === 'specific' ? '允许角色' : '屏蔽角色';
  if (characters.length === 0) {
    return '<p class="muted">当前世界还没有可选择的角色。</p>';
  }
  return `
    <div class="moment-visibility-contact-picker">
      <button class="moment-visibility-picker-trigger" type="button" data-moment-visibility-picker="${mode}" aria-expanded="${isOpen ? 'true' : 'false'}">
        <span>${icon('contacts')}</span>
        <strong>${title}</strong>
        <small>${summary}</small>
      </button>
      ${isOpen ? `
        <div class="moment-visibility-contact-panel" role="group" aria-label="${title}">
          <div class="moment-visibility-contact-head">
            <span>
              <strong>${title}</strong>
              <small>${summary}</small>
            </span>
            <button class="icon-button" type="button" data-moment-visibility-picker="${mode}" aria-label="关闭${title}">×</button>
          </div>
          <div class="moment-visibility-contact-list">
            ${characters.map(character => `
              <label class="moment-visibility-contact-row">
                <span class="avatar mini-avatar">${renderAvatar(character)}</span>
                <span class="moment-visibility-contact-main">
                  <strong>${escapeHtml(character.name)}</strong>
                  <small>${escapeHtml(character.relationship.summary || character.relationship.stage)}</small>
                </span>
                <input ${dataName} type="checkbox" value="${escapeHtml(character.id)}" ${selectedIds.has(character.id) ? 'checked' : ''} />
              </label>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

function renderMomentVisibilityControls(): string {
  const selected = currentMomentVisibilityDraft();
  const selectedMode = selected.mode === 'private' ? 'private' : 'public';
  const hint = selectedMode === 'private'
    ? '仅作为私人状态记录，角色不会看到。'
    : '公开发布，可继续设置允许角色或屏蔽角色。';
  return `
    <div class="moment-visibility-control">
      <label class="field">
        <span>可见范围</span>
        <select id="moment-visibility-mode" aria-label="选择动态可见范围">
          ${[
            ['public', '公开'],
            ['private', '仅自己'],
          ].map(([value, label]) =>
            `<option value="${value}" ${selectedMode === value ? 'selected' : ''}>${label}</option>`,
          ).join('')}
        </select>
      </label>
      <p class="moment-visibility-hint">${escapeHtml(hint)}</p>
    </div>
  `;
}

function renderMomentVisibilityContactControls(characters: CharacterProfile[]): string {
  if (momentVisibilityMode === 'private') {
    return '<p class="moment-visibility-hint moment-visibility-private-hint">仅作为私人状态记录，角色不会看到。</p>';
  }
  return `
    <div class="moment-visibility-contact-controls">
      ${renderMomentVisibilityContactPicker(characters, momentVisibilityCharacterIds, 'data-moment-visibility-character', 'specific')}
      ${renderMomentVisibilityContactPicker(characters, momentVisibilityBlockedIds, 'data-moment-visibility-blocked', 'blocked')}
    </div>
  `;
}

function renderMomentsPage(mobile = false): string {
  const worldCharacters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selectedMomentCharacter = worldCharacters.find(character => character.id === momentComposerAuthorId);
  const selectedAuthorId = selectedMomentCharacter ? selectedMomentCharacter.id : 'user';
  const authorName = selectedMomentCharacter?.name ?? userSelfLabel();
  const authorAvatar = selectedMomentCharacter
    ? renderAvatar(selectedMomentCharacter)
    : escapeHtml(state.userName.slice(0, 1) || '我');
  const authorOptions = [
    `<option value="user" ${selectedAuthorId === 'user' ? 'selected' : ''}>${escapeHtml(userSelfLabel())}</option>`,
    ...worldCharacters.map(character =>
      `<option value="${escapeHtml(character.id)}" ${character.id === selectedAuthorId ? 'selected' : ''}>${escapeHtml(character.name)}</option>`,
    ),
  ].join('');
  return `
    <main class="chat social-page moments-page ${mobile ? 'mobile-page' : ''}">
      <header class="chat-header page-heading moments-heading">
        <div><span class="eyebrow">${escapeHtml(activeWorld().name)}</span><h2>动态</h2><p>你和角色分享的近况，都留在这里。</p></div>
        ${mobile ? '' : renderDesktopViewControls(activeCharacter())}
        <button class="icon-button moments-help" id="open-moments-tutorial" type="button" aria-label="查看动态教程">?</button>
      </header>
      <section class="moments-scroll">
        <div class="moments-column">
          ${renderMomentComposerLauncher()}
          <form class="moments-publisher ${momentComposerOpen ? 'is-open' : ''}" id="moment-composer" role="dialog" aria-modal="true" aria-label="发布动态">
            <div class="moment-composer-head">
              <div><span class="eyebrow">Moment</span><strong>发布动态</strong></div>
              <button class="icon-button" id="close-moment-composer" type="button" aria-label="关闭发布动态">×</button>
            </div>
            <div class="moment-avatar ${selectedMomentCharacter ? '' : 'user-avatar'}" aria-hidden="true">${authorAvatar}</div>
            <div class="moments-publisher-body">
              <div class="moment-compose-meta">
              <label class="field moment-author-select">
                <span>发布身份</span>
                <select id="moment-author-select" aria-label="选择发布动态的身份">${authorOptions}</select>
              </label>
              ${renderMomentVisibilityControls()}
              </div>
              ${renderMomentVisibilityContactControls(worldCharacters)}
              <textarea id="moment-input" placeholder="分享一下最近发生的事…">${escapeHtml(momentComposerTextDraft)}</textarea>
              <div class="moments-publisher-footer">
                <p class="moment-generation-status" aria-live="polite">${escapeHtml(momentGenerationStatus || `将以 ${authorName} 的身份发布。`)}</p>
                <div class="moment-actions">
                  <button class="secondary" id="generate-moment" type="button" ${!selectedMomentCharacter || momentGenerating ? 'disabled' : ''}>${momentGenerating ? '正在生成…' : selectedMomentCharacter ? `让 ${escapeHtml(selectedMomentCharacter.name)} 生成草稿` : '选角色生成'}</button>
                  <button class="primary" type="submit" ${momentGenerating ? 'disabled' : ''}>发布动态</button>
                </div>
              </div>
            </div>
          </form>
          <div class="moments-section-title"><strong>最近动态</strong><span>${momentsForActiveWorld().length} 条</span></div>
          <section class="moments-feed">${renderMoments()}</section>
        </div>
      </section>
      ${momentsTutorialOpen ? renderMomentsTutorial() : ''}
    </main>
  `;
}

function renderMomentsTutorial(): string {
  return `
    <div class="moments-tutorial-overlay" role="dialog" aria-modal="true" aria-label="动态使用教程">
      <button class="moments-tutorial-backdrop" data-close-moments-tutorial type="button" aria-label="关闭教程"></button>
      <section class="moments-tutorial-sheet">
        <button class="icon-button moments-tutorial-close" data-close-moments-tutorial type="button" aria-label="关闭动态教程">×</button>
        <div class="tutorial-handle" aria-hidden="true"></div>
        <span class="tutorial-label">第一次来动态</span>
        <h2>这里记录你和角色的生活片段</h2>
        <div class="tutorial-steps">
          <div><b>1</b><span><strong>发布近况</strong><small>在顶部输入内容，以你的身份发布。</small></span></div>
          <div><b>2</b><span><strong>角色按兴趣回应</strong><small>你发布后，每个角色都会判断自己是否想评论，不会强行回复。</small></span></div>
          <div><b>3</b><span><strong>评论会接着聊</strong><small>评论角色动态会触发作者回复，也可以指定某个角色评论你的动态。</small></span></div>
        </div>
        <button class="primary" data-close-moments-tutorial type="button">知道了，看看动态</button>
      </section>
    </div>
  `;
}

function renderEventsPage(mobile = false): string {
  return `
    <main class="chat events-page event-settings-reset-page ${mobile ? 'mobile-page' : ''}">
      <header class="chat-header events-heading event-settings-reset-heading">
        <div>
          <span class="eyebrow">${escapeHtml(activeWorld().name)}</span>
          <h2>事件设置</h2>
          <p>这里只调整日常片段的生成节奏。真正的 RP 从世界页片段列表进入，不把设置页做成管理看板。</p>
        </div>
        ${mobile ? '' : renderDesktopViewControls(activeCharacter())}
      </header>
      <section class="events-scroll">
        <div class="events-column event-settings-page-column">
          ${renderWorldEventSettingsPanel({ surface: 'page', character: activeCharacter() })}
        </div>
      </section>
      ${renderEventComposerDialog()}
    </main>
  `;
}

function currentWorldRpLeadActor(): WorldEventLeadActor {
  const actor = worldRpActor();
  if (actor.characterId) {
    return {
      type: 'character',
      id: actor.characterId,
      characterId: actor.characterId,
      name: actor.name,
    };
  }
  return {
    type: 'user',
    id: 'user',
    name: actor.name || state.userName.trim() || '我',
  };
}

function eventComposerLeadActor(): WorldEventLeadActor {
  return isWorldEventLeadActor(eventComposerDraft.leadActor)
    ? eventComposerDraft.leadActor
    : currentWorldRpLeadActor();
}

function eventComposerParticipantIds(): string[] {
  const worldId = activeWorld().id;
  const leadActor = eventComposerLeadActor();
  const selectedIds = eventComposerDraft.participantIds
    .filter(id => state.characters.some(character => character.id === id && character.worldId === worldId));
  const allIds = leadActor.type === 'character' && leadActor.characterId
    ? [leadActor.characterId, ...selectedIds]
    : selectedIds;
  return [...new Set(allIds)];
}

function renderEventComposerLeadActor(): string {
  const leadActor = eventComposerLeadActor();
  const character = leadActor.characterId
    ? state.characters.find(item => item.id === leadActor.characterId && item.worldId === activeWorld().id)
    : undefined;
  const avatar = character ? renderAvatar(character) : renderUserAvatar();
  return `
    <div class="event-lead-actor" data-event-lead-actor="${escapeHtml(leadActor.id)}">
      <span class="avatar mini-avatar">${avatar}</span>
      <span><small>当前身份</small><strong>${escapeHtml(leadActor.name)}</strong></span>
    </div>
  `;
}

function renderEventParticipantSelect(): string {
  const leadActor = eventComposerLeadActor();
  const characters = state.characters
    .filter(character => character.worldId === activeWorld().id)
    .filter(character => character.id !== leadActor.characterId);
  if (characters.length === 0) {
    return '<p class="muted">当前身份已参与；没有额外角色可选时，会按当前身份创建这件事。</p>';
  }
  const selected = new Set(eventComposerDraft.participantIds);
  return `
    <fieldset class="field event-linked-character-field event-participant-options">
      <legend>额外参与角色</legend>
      <div class="event-participant-grid">
        ${characters.map(character => `
          <label class="event-participant-option ${selected.has(character.id) ? 'is-active' : ''}">
            <input type="checkbox" data-event-participant value="${escapeHtml(character.id)}" ${selected.has(character.id) ? 'checked' : ''} />
            <span class="avatar mini-avatar">${renderAvatar(character)}</span>
            <span>${escapeHtml(character.name)}</span>
          </label>
        `).join('')}
      </div>
      <small>当前身份会自动参与；这里勾选的是额外参与的人。</small>
    </fieldset>
  `;
}

function renderEventComposerDialog(): string {
  if (!eventComposerOpen) return '';
  return `
    <div class="event-composer-overlay" role="dialog" aria-modal="true" aria-label="生成事件">
      <button class="event-composer-backdrop" id="close-event-composer-backdrop" type="button" aria-label="关闭生成窗口"></button>
      <section class="event-composer-dialog">
        <header class="event-composer-dialog-header">
          <div>
            <span>世界事件</span>
            <h2>生成一件小事件</h2>
            <p>确认当前身份和参与角色后，会直接生成一段日常片段并进入 RP 舞台。</p>
          </div>
          <button class="icon-button" id="close-event-composer" type="button" aria-label="关闭生成窗口">×</button>
        </header>
        <form id="event-composer" class="event-composer event-composer-modal">
          <div class="event-form-fields">
            ${renderEventComposerLeadActor()}
            ${renderEventParticipantSelect()}
            <p class="event-auto-hint">会按当前身份和勾选角色生成一段日常生活事件，并直接插入世界 RP 流。</p>
          </div>
          <footer class="event-composer-actions">
            <button class="secondary" id="cancel-event-composer" type="button">取消</button>
            <button class="primary" data-event-composer-submit type="submit" ${eventGenerating ? 'disabled' : ''}>${eventGenerating ? '生成中…' : '生成事件'}</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function openEventComposer(): void {
  captureVisibleDraftsFromDom();
  const leadActor = currentWorldRpLeadActor();
  eventComposerDraft = {
    ...eventComposerDraft,
    leadActor,
    participantIds: eventComposerDraft.participantIds.filter(id => id !== leadActor.characterId),
  };
  eventComposerOpen = true;
  preserveScrollForNextRender();
  saveUiSessionSnapshot();
  render();
  window.requestAnimationFrame(() => {
    document.querySelector<HTMLButtonElement>('[data-event-composer-submit]')?.focus();
  });
}

function renderSettingsItems(): string {
  const groups: Array<[string, Array<[SettingsSection, string, string]>]> = [
    ['内容管理', [
      ['world', '世界与角色', '空间、导入与导出'],
      ['drafts', '写卡草稿', '创作、续写与管理'],
      ['stickers', '表情包', '角色、通用与用户图库'],
    ]],
    ['角色运行', [
      ['model', '模型连接', 'API 与自动预算'],
      ['prompts', '提示词预设', '酒馆预设导入与开关'],
      ['relationship', '关系状态', '好感度与关系摘要'],
      ['interactions', '角色互动', '后台生活循环'],
      ['proactive', '主动消息', '频率、安静时段与降频'],
    ]],
    ['应用', [
      ['chat', '聊天与人设', '短消息、长消息与 user 人设'],
      ['notifications', '通知', '权限、隐私与后台'],
      ['data', '数据与运行', '备份与操作记录'],
    ]],
  ];
  return groups.map(([group, items]) => `
    <div class="settings-menu-group">
      <h2>${group}</h2>
      ${items.map(([id, label, description]) => `
        <button class="settings-list-item ${activeSettingsSection === id ? 'is-active' : ''}" data-settings-section="${id}">
          <span><strong>${label}</strong><small>${description}</small></span><b>›</b>
        </button>
      `).join('')}
    </div>
  `).join('');
}

function momentCommentAuthorName(comment: MomentEntry['comments'][number]): string {
  return comment.authorType === 'character'
    ? state.characters.find(item => item.id === comment.characterId)?.name ?? '角色'
    : state.userName;
}

function setMomentCommentReplyTarget(momentId: string, commentId: string): void {
  if (!momentId || !commentId) return;
  momentCommentReplyTargetDrafts.set(momentId, commentId);
  momentCommentActionMenu = null;
  focusMomentCommentAfterRenderId = momentId;
  saveUiSessionSnapshot({ captureDom: true });
}

function openMomentCommentActionMenu(momentId: string, commentId: string, characterPickerOpen = false): void {
  if (!momentId || !commentId) return;
  momentCommentActionMenu = { momentId, commentId, characterPickerOpen };
  momentCommentSuppressTapUntil = Date.now() + 700;
  saveUiSessionSnapshot({ captureDom: true });
}

function clearMomentCommentActionMenu(momentId?: string, commentId?: string): void {
  if (!momentCommentActionMenu) return;
  if (momentId && momentCommentActionMenu.momentId !== momentId) return;
  if (commentId && momentCommentActionMenu.commentId !== commentId) return;
  momentCommentActionMenu = null;
}

function renderMoments(): string {
  const moments = momentsForActiveWorld();
  const worldCharacters = state.characters.filter(character => character.worldId === activeWorld().id);
  if (moments.length === 0) {
    return '<div class="moments-empty"><strong>还没有动态</strong><span>在上方发布第一条近况，或让当前角色先说点什么。</span></div>';
  }
  return moments.map(moment => {
    const character = state.characters.find(item => item.id === moment.characterId);
    const author = character?.name ?? (moment.source === 'system' ? '系统' : state.userName);
    const comments = moment.comments ?? [];
    const commentAuthorCharacters = worldCharacters.filter(character =>
      canCharacterViewMoment(moment, character),
    );
    const selectedCommentAuthor = momentCommentAuthorDrafts.get(moment.id) ?? 'user';
    const selectedCommentAuthorValue = selectedCommentAuthor === 'user'
      || commentAuthorCharacters.some(item => item.id === selectedCommentAuthor)
      ? selectedCommentAuthor
      : 'user';
    const replyTargetId = momentCommentReplyTargetDrafts.get(moment.id) ?? '';
    const replyTarget = comments.find(comment => comment.id === replyTargetId);
    const visibleCommentCharacters = worldCharacters.filter(character =>
      canCharacterViewMoment(moment, character) && character.id !== moment.characterId,
    );
    const avatar = character
      ? renderAvatar(character)
      : escapeHtml(author.slice(0, 1));
    return `
      <article class="moment-card">
        <div class="moment-avatar ${character ? '' : 'user-avatar'}">${avatar}</div>
        <div class="moment-body">
          <div class="moment-header">
            <div>
              <strong>${escapeHtml(author)}</strong>
              <span><time>${formatConversationTime(moment.createdAt)}</time><em>${escapeHtml(momentVisibilityLabel(moment.visibility))}</em></span>
            </div>
            <button class="moment-delete" data-moment-id="${escapeHtml(moment.id)}" aria-label="删除这条动态">删除</button>
          </div>
          <div class="moment-content">${escapeHtml(moment.content)}</div>
          <div class="moment-comments ${comments.length === 0 ? 'is-empty' : ''}">
            ${comments.length > 0 ? comments.map(comment => {
              const commenter = momentCommentAuthorName(comment);
              const replied = comment.replyToCommentId
                ? comments.find(item => item.id === comment.replyToCommentId)
                : undefined;
              const replyContext = replied ? `回复 ${momentCommentAuthorName(replied)}` : '';
              const canAuthorReply = Boolean(
                moment.characterId
                && character
                && comment.characterId !== moment.characterId
                && canCharacterViewMoment(moment, character),
              );
              const commentMenuOpen = momentCommentActionMenu?.momentId === moment.id
                && momentCommentActionMenu.commentId === comment.id;
              const replyCharacters = worldCharacters.filter(character =>
                canCharacterViewMoment(moment, character) && character.id !== comment.characterId,
              );
              return `
                <div class="moment-comment ${commentMenuOpen ? 'is-menu-open' : ''}" role="button" tabindex="0" data-moment-comment-tap="${escapeHtml(comment.id)}" data-moment-comment-menu="${escapeHtml(comment.id)}" data-moment-comment-moment="${escapeHtml(moment.id)}" data-moment-comment-id="${escapeHtml(comment.id)}" aria-label="回复 ${escapeHtml(commenter)} 的评论">
                  <div class="moment-comment-copy">
                    <strong>${escapeHtml(commenter)}</strong>
                    ${replyContext ? `<small class="moment-comment-reply-context">${escapeHtml(replyContext)}</small>` : ''}
                    <span>${escapeHtml(comment.content)}</span>
                  </div>
                  ${commentMenuOpen ? `
                    <div class="moment-comment-menu" role="menu" aria-label="评论操作">
                      <div class="moment-comment-menu-actions">
                        ${canAuthorReply ? `
                          <button type="button" data-author-reply-comment="${escapeHtml(comment.id)}" data-author-reply-moment="${escapeHtml(moment.id)}" ${autoCommentingMomentIds.has(moment.id) ? 'disabled' : ''}>楼主回复</button>
                        ` : ''}
                        ${replyCharacters.length > 0 ? `
                          <button type="button" data-open-comment-character-reply="${escapeHtml(comment.id)}" data-open-comment-character-reply-moment="${escapeHtml(moment.id)}">选角色回复</button>
                        ` : ''}
                        <button class="danger" type="button" data-delete-comment="${escapeHtml(comment.id)}" data-delete-comment-moment="${escapeHtml(moment.id)}">删除</button>
                      </div>
                      ${momentCommentActionMenu?.characterPickerOpen && replyCharacters.length > 0 ? `
                        <div class="moment-comment-character-reply">
                          <select data-comment-character-reply-select="${escapeHtml(comment.id)}" data-comment-character-reply-moment="${escapeHtml(moment.id)}" aria-label="选择回复角色">
                            ${replyCharacters.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
                          </select>
                          <button type="button" data-submit-comment-character-reply="${escapeHtml(comment.id)}" data-submit-comment-character-reply-moment="${escapeHtml(moment.id)}" ${commentingMomentId === moment.id || autoCommentingMomentIds.has(moment.id) ? 'disabled' : ''}>生成回复</button>
                        </div>
                      ` : ''}
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('') : ''}
            ${replyTarget ? `
              <div class="moment-comment-reply-target">
                <span>回复 ${escapeHtml(momentCommentAuthorName(replyTarget))}</span>
                <button type="button" data-clear-comment-reply="${escapeHtml(moment.id)}" aria-label="取消回复目标">取消</button>
              </div>
            ` : ''}
            <form class="moment-comment-form moment-comment-inline-form" data-comment-form="${escapeHtml(moment.id)}">
              <select data-comment-author-select="${escapeHtml(moment.id)}" aria-label="选择评论身份">
                <option value="user" ${selectedCommentAuthorValue === 'user' ? 'selected' : ''}>${escapeHtml(userSelfLabel())}</option>
                ${commentAuthorCharacters.map(item => `<option value="${escapeHtml(item.id)}" ${selectedCommentAuthorValue === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
              </select>
              <input data-comment-input="${escapeHtml(moment.id)}" value="${escapeHtml(momentCommentDrafts.get(moment.id) ?? '')}" placeholder="${replyTarget ? `回复 ${escapeHtml(momentCommentAuthorName(replyTarget))}…` : '写评论…'}" aria-label="评论这条动态" />
              <button class="secondary moment-comment-submit" type="submit" aria-label="发送评论">${icon('send')}</button>
            </form>
            ${visibleCommentCharacters.length > 0 ? `
              <div class="moment-character-picker">
                <select data-character-select="${escapeHtml(moment.id)}" aria-label="选择评论角色">
                  ${visibleCommentCharacters.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
                </select>
                <button class="moment-character-comment" type="button" data-character-comment="${escapeHtml(moment.id)}" ${commentingMomentId === moment.id || autoCommentingMomentIds.has(moment.id) ? 'disabled' : ''}>
                  ${commentingMomentId === moment.id ? '正在生成…' : '指定角色评论'}
                </button>
              </div>
            ` : ''}
            ${autoCommentingMomentIds.has(moment.id) ? '<p class="moment-auto-status">角色们正在看看这条动态…</p>' : ''}
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function renderEventAvatars(event: WorldEvent): string {
  const participants = event.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id))
    .filter((character): character is CharacterProfile => Boolean(character));
  if (participants.length === 0) {
    return '<span class="event-avatar world-avatar">岛</span>';
  }
  return participants.slice(0, 4).map(character =>
    `<span class="event-avatar" title="${escapeHtml(character.name)}">${renderAvatar(character)}</span>`,
  ).join('');
}

function renderEventParticipantNames(event: WorldEvent): string {
  const names = event.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  const leadName = event.leadActor?.name && !names.includes(event.leadActor.name)
    ? event.leadActor.name
    : '';
  return [leadName, ...names].filter(Boolean).join('、') || '整个世界';
}

function timelineTypeLabel(type: TimelineEntry['type']): string {
  const labels: Record<TimelineEntry['type'], string> = {
    chat: '私聊记忆',
    group_chat: '群聊记忆',
    moment: '动态',
    comment: '评论',
    event: '事件',
    relationship: '关系',
    auto_message: '主动消息',
    daily_brief: '今日简报',
    character_status: '角色状态',
    character_interaction: '角色互动',
    system: '系统',
    manual_note: '手动记录',
  };
  return labels[type];
}

function timelineSourceLabel(entry: TimelineEntry): string {
  const labels: Record<TimelineEntry['source']['type'], string> = {
    message: '消息',
    group_message: '群聊消息',
    moment: '动态',
    comment: '评论',
    event: '世界事件',
    relationship: '关系状态',
    brief: '今日简报',
    status: '角色状态',
    interaction: '角色互动',
    system: '系统记录',
    manual: '手动记录',
  };
  return labels[entry.source.type];
}

function renderTimelineCharacters(entry: TimelineEntry): string {
  const names = entry.characterIds
    .map(id => entry.characterNames[id] ?? state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (names.length === 0) return '<span>整个世界</span>';
  return names.map(name => `<span>${escapeHtml(name)}</span>`).join('');
}

function timelineCharacterText(entry: TimelineEntry): string {
  return entry.characterIds
    .map(id => entry.characterNames[id] ?? state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join('、') || '整个世界';
}

function renderTimelineDetails(entry: TimelineEntry): string {
  const contextState = entry.revokedAt
    ? '已撤销影响，不进入模型上下文'
    : entry.includeInContext ? '允许进入近期模型上下文' : '仅作为世界记录保存';
  return `
    <details class="timeline-details">
      <summary>查看详情</summary>
      <dl>
        <div><dt>来源</dt><dd>${escapeHtml(timelineSourceLabel(entry))}</dd></div>
        <div><dt>关联</dt><dd>${escapeHtml(timelineCharacterText(entry))}</dd></div>
        <div><dt>记录时间</dt><dd>${escapeHtml(new Date(entry.createdAt).toLocaleString())}</dd></div>
        <div><dt>上下文状态</dt><dd>${escapeHtml(contextState)}</dd></div>
        ${entry.revokedAt ? `<div><dt>撤销时间</dt><dd>${escapeHtml(new Date(entry.revokedAt).toLocaleString())}</dd></div>` : ''}
      </dl>
    </details>
  `;
}

function renderTimeline(): string {
  const entries = timelineForActiveWorld();
  if (entries.length === 0) {
    return '<div class="moments-empty"><strong>还没有世界记录</strong><span>发布动态、创建事件，或手动记下一件应该被这个世界记住的事。</span></div>';
  }
  return entries.map(entry => {
    const rollbackState = rollbackStateForTimelineEntry(entry);
    return `
    <article class="timeline-card ${entry.revokedAt ? 'is-revoked' : ''}" data-timeline-entry="${escapeHtml(entry.id)}">
      <div class="timeline-card-head">
        <span class="timeline-type">${escapeHtml(timelineTypeLabel(entry.type))}</span>
        <time>${formatConversationTime(entry.createdAt)}</time>
      </div>
      <h3>${escapeHtml(entry.title)}</h3>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="timeline-characters">${renderTimelineCharacters(entry)}</div>
      <div class="timeline-meta">
        <span>${entry.revokedAt ? '已撤销，不再进入上下文' : entry.includeInContext ? '进入上下文' : '仅作记录'}</span>
        ${rollbackState?.canRollback ? '<span>可撤销影响</span>' : rollbackState?.rolledBackAt ? '<span>影响已撤销</span>' : ''}
      </div>
      ${renderTimelineDetails(entry)}
      ${rollbackState?.canRollback ? `
        <footer class="timeline-card-actions">
          <button class="secondary" type="button" data-rollback-timeline="${escapeHtml(entry.id)}">撤销影响</button>
        </footer>
      ` : ''}
    </article>
  `;
  }).join('');
}

function renderDailyBriefCard(): string {
  const brief = todayBriefForActiveWorld();
  if (!brief) {
    return `
      <section class="daily-brief-card is-quiet">
        <div>
          <span class="timeline-type">今日简报</span>
          <h3>今天暂时安静</h3>
          <p>${escapeHtml(quietBriefText())}</p>
        </div>
      </section>
    `;
  }
  const suggestedNames = brief.suggestedCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name));
  return `
    <section class="daily-brief-card">
      <div class="daily-brief-head">
        <span class="timeline-type">今日简报</span>
        <small>${escapeHtml(brief.dateKey)}</small>
      </div>
      <h3>${escapeHtml(brief.title)}</h3>
      <div class="daily-brief-sections">
        ${brief.sections.map(section => `<p>${escapeHtml(section)}</p>`).join('')}
      </div>
      <footer>
        <span>${brief.changeCount} 项变化</span>
        <span>${brief.unreadCount} 条未读</span>
        ${suggestedNames.length > 0 ? `<span>建议关注：${escapeHtml(suggestedNames.join('、'))}</span>` : ''}
      </footer>
    </section>
  `;
}

function renderDailyBriefBanner(): string {
  const brief = todayBriefForActiveWorld();
  const title = brief ? `${brief.changeCount} 项今日变化` : '今天暂时安静';
  const summary = brief
    ? compactText(brief.sections[0] ?? brief.summary, 86)
    : quietBriefText();
  return `
    <button class="daily-brief-banner" type="button" data-open-timeline>
      <span>${icon('timeline')}</span>
      <span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(summary)}</small></span>
    </button>
  `;
}

function renderTimelinePage(mobile = false): string {
  const briefCard = renderDailyBriefCard();
  const count = timelineForActiveWorld().length;
  return `
    <main class="chat timeline-page ${mobile ? 'mobile-page' : ''}">
      <header class="chat-header timeline-heading">
        <div>
          <span class="eyebrow">${escapeHtml(activeWorld().name)}</span>
          <h2>世界时间线</h2>
          <p>聊天、动态、事件和关系变化会在这里沉淀成可回顾的世界记录。</p>
        </div>
        ${mobile ? '' : renderDesktopViewControls(activeCharacter())}
      </header>
      <section class="timeline-scroll">
        <div class="timeline-column">
          ${briefCard}
          <form class="timeline-note-form" id="timeline-note-form">
            <label class="field">
              <span>手动记录</span>
              <textarea id="timeline-note-input" placeholder="记下一件这世界应该记住的事…">${escapeHtml(timelineNoteDraft)}</textarea>
            </label>
            <footer>
              <p class="muted">手动记录会进入模型可读的近期世界时间线。</p>
              <button class="primary" type="submit">保存记录</button>
            </footer>
          </form>
          <div class="timeline-section-title"><strong>世界记录</strong><span>${count} 条</span></div>
          <section class="timeline-feed">${renderTimeline()}</section>
        </div>
      </section>
    </main>
  `;
}

function worldRpActor(): { id: string; name: string; character?: CharacterProfile; characterId?: string } {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selectedCharacter = characters.find(character => character.id === worldRpActorId);
  if (selectedCharacter) {
    return {
      id: selectedCharacter.id,
      name: selectedCharacter.name,
      character: selectedCharacter,
      characterId: selectedCharacter.id,
    };
  }
  worldRpActorId = 'user';
  return { id: 'user', name: state.userName.trim() || '我' };
}

function worldRpActiveCharacter(): CharacterProfile | undefined {
  return worldRpActor().character
    ?? activeCharacter()
    ?? state.characters.find(character => character.worldId === activeWorld().id);
}

function renderWorldRpActorOptions(): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  return [
    `<option value="user" ${worldRpActorId === 'user' ? 'selected' : ''}>${escapeHtml(state.userName.trim() || '我')}</option>`,
    ...characters.map(character =>
      `<option value="${escapeHtml(character.id)}" ${character.id === worldRpActorId ? 'selected' : ''}>${escapeHtml(character.name)}</option>`,
    ),
  ].join('');
}

function renderWorldPersonaSelector(): string {
  const actor = worldRpActor();
  const personaName = actor.name;
  const avatar = actor.character ? renderAvatar(actor.character) : renderUserAvatar();
  return `
    <details class="world-persona-select">
      <summary>
        <span class="avatar header-avatar">${avatar}</span>
        <span class="world-persona-name">
          <strong>${escapeHtml(personaName)}</strong>
        </span>
        <span aria-hidden="true">⌄</span>
      </summary>
      <div class="world-persona-menu">
        <label class="field">
          <span>当前身份</span>
          <select data-world-rp-actor aria-label="选择世界 RP 身份">${renderWorldRpActorOptions()}</select>
        </label>
      </div>
    </details>
  `;
}

function renderWorldSettingsPanel(): string {
  const world = activeWorld();
  return `
    <details class="world-gear-panel">
      <summary class="icon-button" aria-label="世界与时间线设置">${icon('settings')}</summary>
      <section class="world-gear-card" aria-label="世界设置与时间线">
        <header>
          <div>
            <strong>${escapeHtml(world.name)}</strong>
            <span>世界资料、记忆、时间线和小事件</span>
          </div>
          <button class="small-button primary-small" data-save-world-workbench type="button">保存</button>
        </header>
        <div class="world-gear-body">
          <section class="world-drawer-section world-profile-section">
            <h3>世界资料</h3>
            <label class="field"><span>名称</span><input id="workbench-world-name" value="${escapeHtml(world.name)}" /></label>
            <label class="field"><span>说明</span><textarea id="workbench-world-description">${escapeHtml(world.description)}</textarea></label>
            <label class="field"><span>当前地点</span><input id="workbench-world-current-location" value="${escapeHtml(world.currentLocation)}" placeholder="例如：便利店靠窗座位" /></label>
            <label class="field"><span>当前氛围</span><input id="workbench-world-scene-atmosphere" value="${escapeHtml(world.sceneAtmosphere)}" placeholder="例如：雨天、放松、微妙亲近" /></label>
            <label class="field"><span>场景摘要</span><textarea id="workbench-world-scene-summary" placeholder="当前日常 RP 正在发生什么。">${escapeHtml(world.sceneSummary)}</textarea></label>
          </section>
          ${renderWorldRenderModeSetting()}
          ${renderWorldDrawerTimeline()}
          ${renderWorldEventSettingsPanel({ surface: 'drawer', character: activeCharacter() })}
        </div>
      </section>
    </details>
  `;
}

function renderWorldRenderModeSetting(): string {
  return `
    <section class="world-drawer-section world-render-mode-setting">
      <h3>阅读样式</h3>
      <div class="render-mode-switch drawer-render-mode" aria-label="世界 RP 阅读样式">
        <button class="${worldRpRenderMode === 'narration' ? 'is-active' : ''}" data-world-rp-render-mode="narration" type="button">旁白 + 对话</button>
        <button class="${worldRpRenderMode === 'bubble' ? 'is-active' : ''}" data-world-rp-render-mode="bubble" type="button">聊天气泡</button>
      </div>
    </section>
  `;
}

function renderWorldStageHeader(): string {
  const world = activeWorld();
  const location = world.currentLocation.trim() || '日常生活场景';
  const atmosphere = world.sceneAtmosphere.trim() || '轻松、自然、适合日常 RP';
  return `
    <div class="world-stage-header" aria-label="当前 RP 舞台">
      <strong>${escapeHtml(world.name)}</strong>
      <span>${escapeHtml(location)} · ${escapeHtml(atmosphere)}</span>
      <small>${escapeHtml(formatCompanionDateTime(state))}</small>
    </div>
  `;
}

function renderWorldDrawerTimeline(): string {
  const entries = timelineForActiveWorld();
  const recentEntries = entries.slice(0, 3);
  return `
    <section class="world-drawer-section world-memory-section">
      <h3>最近记忆</h3>
      <div class="world-memory-mini">
        ${recentEntries.length > 0
          ? recentEntries.map(entry => `<span><small>${escapeHtml(formatConversationTime(entry.createdAt))}</small>${escapeHtml(compactText(entry.summary || entry.title, 72))}</span>`).join('')
          : '<span><small>暂无</small>还没有世界记忆。</span>'}
      </div>
      <form class="timeline-note-form" id="timeline-note-form">
        <label class="field">
          <span>手动记录</span>
          <textarea id="timeline-note-input" placeholder="记下一件这个世界应该记住的日常小事…">${escapeHtml(timelineNoteDraft)}</textarea>
        </label>
        <footer>
          <p class="muted">保存后会进入当前世界的长期记忆。</p>
          <button class="primary" type="submit">保存记忆</button>
        </footer>
      </form>
      <details class="world-drawer-details">
        <summary>完整时间线 · ${entries.length} 条</summary>
        <div class="timeline-feed world-drawer-timeline-feed">${renderTimeline()}</div>
      </details>
    </section>
  `;
}

type WorldEventSettingsPanelContext = {
  surface: 'drawer' | 'page';
  character?: CharacterProfile;
};

function renderEventSettingsSurfaceName(surface: WorldEventSettingsPanelContext['surface']): string {
  return surface === 'drawer' ? '世界抽屉' : '独立设置页';
}

function eventSettingsCharacter(preferred?: CharacterProfile): CharacterProfile | undefined {
  const worldId = activeWorld().id;
  const actor = worldRpActor();
  const actorCharacter = actor.characterId
    ? state.characters.find(character => character.id === actor.characterId && character.worldId === worldId)
    : undefined;
  const candidate = [preferred, actorCharacter, activeCharacter()]
    .find((character): character is CharacterProfile => Boolean(character && character.worldId === worldId));
  if (candidate) {
    proactiveManagerCharacterId = candidate.id;
    return candidate;
  }
  return proactiveManagerCharacter();
}

function renderWorldEventSettingsPreview(event: WorldEvent, character?: CharacterProfile): string {
  const messageCount = worldEventRpMessages(event.id).length;
  return `
    <button class="event-settings-preview world-event-entry-card" data-open-world-event-rp="${escapeHtml(event.id)}" type="button">
      <div class="event-avatar-stack">${renderEventAvatars(event)}</div>
      <div class="world-event-entry-main">
        <strong>${escapeHtml(event.title)}</strong>
        <p>${escapeHtml(worldEventRpPreview(event, character))}</p>
        <footer class="world-event-entry-meta">
          <span>${escapeHtml(renderEventParticipantNames(event))}</span>
          <span>${messageCount > 0 ? `${messageCount} 条` : escapeHtml(eventTypeLabel(event.type))}</span>
          <span class="world-event-entry-status ${event.status === 'resolved' ? 'is-resolved' : ''}">${event.status === 'resolved' ? '已归档' : '进行中'}</span>
        </footer>
      </div>
    </button>
  `;
}

/**
 * 大注释：事件设置只做“节奏与入口”，不再把世界页变回管理面板。
 * 这里继续沿用角色级 autoEvent 数据，避免破坏旧调度、备份和 Android 后台逻辑。
 */
function renderWorldEventSettingsPanel(context: WorldEventSettingsPanelContext): string {
  const character = eventSettingsCharacter(context.character);
  const isDrawer = context.surface === 'drawer';
  if (!character) {
    return `
      <section class="world-drawer-section event-settings-panel is-${context.surface}">
        <header class="event-settings-heading">
          <div>
            <span>${escapeHtml(renderEventSettingsSurfaceName(context.surface))}</span>
            <h3>事件设置</h3>
            <p>先创建或导入角色，再开启自动生成日常片段。</p>
          </div>
        </header>
        <div class="event-settings-empty">
          <strong>还没有可用角色</strong>
          <span>小事件节奏仍沿用角色级设置，所以需要至少一个当前世界的角色。</span>
        </div>
      </section>
    `;
  }
  const events = eventsForActiveWorld();
  const recentEvents = events.slice(0, 3);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayCount = events.filter(event => event.createdAt >= todayStart.getTime()).length;
  const activeCount = events.filter(event => event.status === 'active').length;
  const schedule = character.autoEvent;
  const nextText = schedule.enabled ? countdownText(schedule.nextAttemptAt) : '未安排';
  const enabledText = schedule.enabled ? '已开启' : '未开启';
  const actor = worldRpActor();
  const identityText = actor.characterId ? actor.name : `${actor.name} · 视角`;
  return `
    <section class="world-drawer-section event-settings-panel is-${context.surface}">
      <header class="event-settings-heading">
        <div>
          <span>${escapeHtml(renderEventSettingsSurfaceName(context.surface))}</span>
          <h3>事件设置</h3>
          <p>${isDrawer ? '调整自动片段的节奏，日常列表仍留在主屏。' : '旧入口现在只保留同一套轻量设置。'}</p>
        </div>
        <span class="event-settings-role"><strong>${escapeHtml(identityText)}</strong><small>当前身份</small></span>
      </header>

      <div class="event-settings-summary">
        <label class="event-settings-toggle">
          <span>
            <strong>自动生成</strong>
            <small>${escapeHtml(character.name)} · ${escapeHtml(enabledText)}</small>
          </span>
          <input id="auto-event-enabled" type="checkbox" ${schedule.enabled ? 'checked' : ''} />
        </label>
        <div class="event-settings-stats">
          <span><small>下次触发</small><b>${escapeHtml(nextText)}</b></span>
          <span><small>今日片段</small><b>${todayCount} / ${schedule.dailyLimit}</b></span>
          <span><small>进行中</small><b>${activeCount}</b></span>
        </div>
      </div>

      <div class="event-settings-action-row">
        <button class="primary event-settings-generate" data-open-event-composer type="button" ${eventGenerating ? 'disabled' : ''}>
          ${icon('add')}<span>${eventGenerating ? '正在生成…' : '生成一段日常'}</span>
        </button>
        <span>生成后会直接进入对应片段的 RP 对话舞台。</span>
      </div>

      <section class="event-settings-recent">
        <div class="event-settings-section-title">
          <strong>最近日常片段</strong>
          <span>${events.length} 条</span>
        </div>
        <div class="event-settings-list">
          ${recentEvents.length > 0
            ? recentEvents.map(event => renderWorldEventSettingsPreview(event, character)).join('')
            : '<div class="event-settings-empty"><strong>还没有日常片段</strong><span>点“生成事件”，选择参与角色后开始一段 RP。</span></div>'}
        </div>
        ${events.length > recentEvents.length ? `
          <details class="world-drawer-details event-settings-details">
            <summary>查看全部日常片段 · ${events.length} 条</summary>
            <div class="event-settings-list world-drawer-events">${events.map(event => renderWorldEventSettingsPreview(event, character)).join('')}</div>
          </details>
        ` : ''}
      </section>

      <details class="world-drawer-details event-settings-advanced">
        <summary>节奏细项</summary>
        <div class="event-settings-grid">
          <label class="field"><span>最小间隔（小时）</span><input id="auto-event-min-hours" type="number" min="0.25" step="0.25" value="${schedule.baseIntervalMin / 3600000}" /></label>
          <label class="field"><span>最大间隔（小时）</span><input id="auto-event-max-hours" type="number" min="0.25" step="0.25" value="${schedule.baseIntervalMax / 3600000}" /></label>
          <label class="field"><span>每日上限</span><input id="auto-event-daily-limit" type="number" min="1" value="${schedule.dailyLimit}" /></label>
          <label class="field"><span>安静开始</span><input id="auto-event-quiet-start" value="${escapeHtml(schedule.quietHours.start)}" /></label>
          <label class="field"><span>安静结束</span><input id="auto-event-quiet-end" value="${escapeHtml(schedule.quietHours.end)}" /></label>
        </div>
        <footer class="event-settings-actions">
          <p class="muted">保存后只更新 ${escapeHtml(character.name)} 的小事件节奏，不影响其他角色。</p>
          <button id="save-auto-message" class="secondary" type="button">保存小事件设置</button>
        </footer>
      </details>
    </section>
  `;
}

function characterForRpSpeaker(speaker?: string): CharacterProfile | undefined {
  const normalized = speaker?.trim();
  if (!normalized) return undefined;
  return state.characters.find(character =>
    character.worldId === activeWorld().id
    && (character.name === normalized || character.nickname === normalized),
  );
}

function renderRpSegment(segment: RpRenderSegment, fallbackCharacter?: CharacterProfile): string {
  if (segment.kind === 'narration') {
    return `
      <article class="narrative-card">
        <span class="render-label">旁白</span>
        <p class="narrative-text">${escapeHtml(segment.text)}</p>
      </article>
    `;
  }
  const speakerCharacter = characterForRpSpeaker(segment.speaker) ?? fallbackCharacter;
  const speakerName = segment.speaker || speakerCharacter?.name || '角色';
  const emotion = segment.kind === 'thought' ? `内心 · ${segment.emotion ?? '日常'}` : segment.emotion ?? '日常';
  return `
    <div class="dialogue-turn">
      <span class="avatar">${speakerCharacter ? renderAvatar(speakerCharacter) : escapeHtml(speakerName.slice(0, 1))}</span>
      <div class="dialogue-bubble">
        <div class="dialogue-head">
          <span class="dialogue-name">${escapeHtml(speakerName)}</span>
          <span class="emotion-chip">${escapeHtml(emotion)}</span>
        </div>
        <p class="dialogue-line">${escapeHtml(segment.text)}</p>
      </div>
    </div>
  `;
}

function renderWorldEventNarration(event: WorldEvent): string {
  const resultText = event.decision?.result
    ? `\n\n收束：${event.decision.result}`
    : '';
  const statusText = event.status === 'resolved' ? '已写入记忆' : '正在发生';
  return `
    <article class="narrative-card world-event-narration">
      <span class="render-label">世界小事件 · ${escapeHtml(statusText)}</span>
      <h3>${escapeHtml(event.title)}</h3>
      <p class="narrative-text">${escapeHtml(`${event.description}${resultText}`)}</p>
      <footer>
        <span>${escapeHtml(renderEventParticipantNames(event))}</span>
        <span>${escapeHtml(formatConversationTime(event.createdAt))}</span>
      </footer>
    </article>
  `;
}

function selectedWorldRpEvent(): WorldEvent | undefined {
  const worldId = activeWorld().id;
  return state.worldEvents.find(event => event.id === activeWorldRpEventId && event.worldId === worldId);
}

function editableWorldRpMessage() {
  const event = selectedWorldRpEvent();
  return event?.rpMessages.find(message => message.id === worldRpMessageEditId && message.role === 'user');
}

function renderWorldRpMessageEditDialog(): string {
  const message = editableWorldRpMessage();
  if (!message) return '';
  return `
    <div class="message-edit-overlay" role="dialog" aria-modal="true" aria-label="修改世界 RP">
      <button class="message-edit-backdrop" id="close-world-rp-message-edit-backdrop" type="button" aria-label="关闭修改世界 RP"></button>
      <section class="message-edit-dialog">
        <header>
          <div>
            <span>世界事件内修改</span>
            <h2>修改这次行动</h2>
            <p>保存后只会更新当前世界事件里的这条 RP 记录，不会改动私聊内容。</p>
          </div>
          <button class="icon-button" id="close-world-rp-message-edit" type="button" aria-label="关闭修改世界 RP">×</button>
        </header>
        <label class="field">
          <span>行动内容</span>
          <textarea id="world-rp-message-edit-input">${escapeHtml(message.content)}</textarea>
        </label>
        <footer>
          <button class="secondary" id="cancel-world-rp-message-edit" type="button">取消</button>
          <button class="primary" id="confirm-world-rp-message-edit" type="button">保存修改</button>
        </footer>
      </section>
    </div>
  `;
}

function worldEventRpPreview(event: WorldEvent, character?: CharacterProfile): string {
  const latest = worldEventRpMessages(event.id).slice(-1)[0];
  const raw = latest?.content || event.decision?.result || event.description;
  const segments = parseRpRenderSegments(raw, {
    fallbackSpeaker: latest?.speaker || character?.name || '角色',
    fallbackEmotion: '日常',
    plainTextMode: 'narration',
  });
  const text = segments.map(segment => segment.text).filter(Boolean).join(' ');
  return compactText(text || event.description, 140);
}

function buildWorldEventAutoCloseSummary(event: WorldEvent): string {
  const recentRp = worldEventRpMessages(event.id)
    .slice(-4)
    .map(message => `${message.speaker || (message.role === 'assistant' ? '角色回应' : '旁白')}：${message.content}`)
    .join('\n');
  // Big comment: the end button writes a useful archive note without asking the user to fill another modal.
  return [
    event.description.trim(),
    recentRp ? `最近 RP 记录：\n${recentRp}` : '',
    `事件「${event.title}」已结束，作为当前世界的日常片段归档。`,
  ].filter(Boolean).join('\n\n');
}

function renderWorldEventLobby(events: WorldEvent[], character?: CharacterProfile): string {
  if (events.length === 0) {
    return `
      <div class="world-event-lobby">
        <div class="world-event-empty">
          <strong>没有更多片段</strong>
          <span>生成一段日常后，角色对话和旁白都会围绕这个片段展开。</span>
          <div class="world-event-empty-actions">
            <button class="primary" data-open-event-composer type="button">${icon('add')}<span>生成片段</span></button>
          </div>
        </div>
      </div>
    `;
  }
  return `
    <section class="world-event-lobby" aria-label="日常片段列表">
      <div class="world-event-lobby-heading">
        <div>
          <strong>日常片段</strong>
          <small>点击进入 RP</small>
        </div>
      </div>
      <div class="world-event-entry-list">
        ${events.map(event => {
          const messageCount = worldEventRpMessages(event.id).length;
          return `
            <button class="world-event-entry-card conversation-entry" data-open-world-event-rp="${escapeHtml(event.id)}" type="button">
              <div class="event-avatar-stack">${renderEventAvatars(event)}</div>
              <div class="world-event-entry-main">
                <strong>${escapeHtml(event.title)}</strong>
                <p>${escapeHtml(worldEventRpPreview(event, character))}</p>
                <footer class="world-event-entry-meta">
                  <span>${escapeHtml(renderEventParticipantNames(event))}</span>
                  <span>${messageCount > 0 ? `${messageCount} 条` : escapeHtml(eventTypeLabel(event.type))}</span>
                  <span class="world-event-entry-status ${event.status === 'resolved' ? 'is-resolved' : ''}">${event.status === 'resolved' ? '已归档' : '进行中'}</span>
                </footer>
              </div>
            </button>
          `;
        }).join('')}
      </div>
    </section>
  `;
}

function renderWorldDialogueStream(event: WorldEvent, character?: CharacterProfile): string {
  const world = activeWorld();
  const sceneSummary = world.sceneSummary.trim()
    || '从一个日常动作、一句闲聊，或一个很小的生活变化开始继续。';
  const messages = worldEventRpMessages(event.id);
  const activeEventItems = [{ kind: 'event' as const, createdAt: event.createdAt, event }];
  const messageItems = messages.map(message => ({ kind: 'message' as const, createdAt: message.createdAt, message }));
  const renderedItems = [...activeEventItems, ...messageItems]
    .sort((left, right) => left.createdAt - right.createdAt)
    .map(item => {
      if (item.kind === 'event') return renderWorldEventNarration(item.event);
      const message = item.message;
      if (message.role === 'user') {
        const actionLabel = message.speaker?.trim() || '你的行动';
        return `
          <article class="player-action-card" data-world-rp-message-id="${escapeHtml(message.id)}">
            <div class="player-action-head">
              <span class="render-label">${escapeHtml(actionLabel)}</span>
              <button class="plain-button" data-edit-world-rp-message="${escapeHtml(message.id)}" type="button">修改</button>
            </div>
            <p class="narrative-text">${escapeHtml(message.content)}</p>
          </article>
        `;
      }
      if (message.role === 'system') {
        return `<div class="system-note">${escapeHtml(message.content)}</div>`;
      }
      return parseRpRenderSegments(message.content, {
        fallbackSpeaker: character?.name ?? '角色',
        fallbackEmotion: '回应',
        plainTextMode: 'dialogue',
      }).map(segment => renderRpSegment(segment, character)).join('');
    }).join('');
  return `
    <article class="narrative-card world-scene-note">
      <span class="render-label">场景</span>
      <p class="narrative-text">${escapeHtml(sceneSummary)}</p>
    </article>
    ${renderedItems || `
      <div class="world-empty-rp">
        <strong>从日常片段开始</strong>
        <span>选择一个角色私聊几句，或先生成一个世界小事件，这里会以旁白 + 对话的形式承接长 RP。</span>
      </div>
    `}
  `;
}

function renderWorldEventRpDetail(event: WorldEvent, character?: CharacterProfile): string {
  return `
    <section class="world-event-rp-detail" aria-label="事件 RP 对话">
      <div class="world-event-detail-toolbar">
        <button class="icon-button world-detail-back-button" data-close-world-event-rp type="button" aria-label="返回日常" title="返回日常">${icon('back')}</button>
        <div>
          <span>${escapeHtml(eventTypeLabel(event.type))} · ${escapeHtml(renderEventParticipantNames(event))}</span>
          <strong>${escapeHtml(event.title)}</strong>
        </div>
        <button class="secondary end-event-button" data-end-world-rp-event="${escapeHtml(event.id)}" type="button" ${event.status === 'resolved' ? 'disabled' : ''}>${event.status === 'resolved' ? '已归档' : '结束事件'}</button>
      </div>
      ${renderWorldDialogueStream(event, character)}
    </section>
  `;
}

function renderWorldStageComposer(character?: CharacterProfile): string {
  const selectedEvent = selectedWorldRpEvent();
  const disabled = !character || worldRpGenerating || selectedEvent?.status === 'resolved';
  const placeholder = character
    ? `继续和 ${character.name} RP，可以写台词、动作或旁白…`
    : '先选择一个角色，再继续世界 RP';
  return `
    <form class="composer world-stage-composer" id="world-rp-composer">
      <textarea id="world-rp-input" rows="1" enterkeyhint="${state.enterToSend ? 'send' : 'enter'}" aria-label="世界 RP 输入框" placeholder="${escapeHtml(placeholder)}" ${disabled ? 'disabled' : ''}>${escapeHtml(worldRpInputDraft)}</textarea>
      <button class="primary send-button" type="submit" aria-label="继续 RP" ${disabled ? 'disabled' : ''}>${icon('send')}<span>继续</span></button>
    </form>
  `;
}

function renderWorldWorkbenchPage(mobile = false): string {
  const character = worldRpActiveCharacter();
  const selectedEvent = selectedWorldRpEvent();
  const worldEvents = eventsForActiveWorld();
  worldRpReplyMode = 'auto';
  // 小注释：事件页和时间线页不再是主入口，但保留为世界内部详情能力的渲染来源。
  const internalDetailRenderers = [renderEventsPage, renderTimelinePage, renderWorldEventNarration]
    .map(renderer => renderer.name)
    .join(',');
  return `
    <main class="chat world-workbench ${mobile ? 'mobile-page' : ''}" data-render-mode-label="旁白 + 对话" data-world-atmosphere-label="当前氛围" data-internal-detail-renderers="${escapeHtml(internalDetailRenderers)}">
      <header class="chat-header world-workbench-header">
        ${renderWorldPersonaSelector()}
        ${renderWorldStageHeader()}
        <div class="world-stage-actions">
          <button class="secondary world-generate-button" id="generate-event" type="button" aria-label="生成事件" title="生成事件" ${eventGenerating ? 'disabled' : ''}>${icon('add')}<span class="world-action-label">生成事件</span></button>
          ${renderWorldSettingsPanel()}
        </div>
      </header>
      <section class="world-workbench-scroll">
        <div class="world-workbench-column">
          ${selectedEvent
            ? renderWorldEventRpDetail(selectedEvent, character)
            : renderWorldEventLobby(worldEvents, character)}
        </div>
      </section>
      ${selectedEvent && selectedEvent.status !== 'resolved' ? renderWorldStageComposer(character) : ''}
      ${renderWorldRpMessageEditDialog()}
      ${renderEventComposerDialog()}
    </main>
  `;
}

function renderRelationship(character?: CharacterProfile): string {
  if (!character) {
    return '<p class="muted">导入角色后可设置关系状态。</p>';
  }
  const relationship = character.relationship;
  return `
    <label class="field">
      <span>关系阶段</span>
      <select id="relationship-stage">
        ${[
          ['stranger', '陌生'],
          ['familiar', '熟悉'],
          ['close', '亲近'],
          ['intimate', '亲密'],
          ['strained', '紧张'],
        ].map(([value, label]) => `<option value="${value}" ${relationship.stage === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
    </label>
    ${renderAffinityMeter(character)}
    <label class="field"><span>好感度（没有上限）</span><input id="relationship-affinity" type="number" min="0" step="1" value="${Math.max(0, Math.round(relationship.affinity))}" /></label>
    <p class="muted">进度条只显示 0 到 100；实际好感度可以继续增加。</p>
    <label class="field"><span>关系摘要</span><textarea id="relationship-summary" placeholder="例如：刚刚和好，但彼此仍有些试探。">${escapeHtml(relationship.summary)}</textarea></label>
    <button id="save-relationship" class="secondary">保存关系状态</button>
  `;
}

function renderRelationshipStageOptions(active: RelationshipStage): string {
  return [
    ['stranger', '陌生'],
    ['familiar', '熟悉'],
    ['close', '亲近'],
    ['intimate', '亲密'],
    ['strained', '紧张'],
  ].map(([value, label]) => `<option value="${value}" ${active === value ? 'selected' : ''}>${label}</option>`).join('');
}

function renderCharacterRelationshipEditor(
  first?: CharacterProfile,
  second?: CharacterProfile,
): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  if (characters.length < 2 || !first || !second) {
    return '<p class="muted">当前世界至少需要两个角色，才能设置角色之间的关系。</p>';
  }
  const relationship = findCharacterRelationship(first.worldId, first.id, second.id);
  const firstSide = relationship
    ? relationshipSideFor(relationship, first.id)
    : { stage: 'stranger' as RelationshipStage, summary: '', updatedAt: 0 };
  const secondSide = relationship
    ? relationshipSideFor(relationship, second.id)
    : { stage: 'stranger' as RelationshipStage, summary: '', updatedAt: 0 };
  const firstOptions = characters
    .map(character => `<option value="${escapeHtml(character.id)}" ${character.id === first.id ? 'selected' : ''}>${escapeHtml(character.name)}</option>`)
    .join('');
  const secondOptions = characters
    .map(character => `<option value="${escapeHtml(character.id)}" ${character.id === second.id ? 'selected' : ''} ${character.id === first.id ? 'disabled' : ''}>${escapeHtml(character.name)}</option>`)
    .join('');
  const suggestions = pendingRelationshipSuggestionsForPair(first.worldId, first.id, second.id);
  const suggestionList = suggestions.length > 0 ? `
    <div class="relationship-suggestions">
      <strong>待确认阶段建议</strong>
      ${suggestions.map(suggestion => {
        const from = state.characters.find(character => character.id === suggestion.fromCharacterId);
        const to = state.characters.find(character => character.id === suggestion.toCharacterId);
        return `
          <div class="relationship-suggestion-row">
            <span>${escapeHtml(from?.name ?? '角色')} → ${escapeHtml(to?.name ?? '角色')}：${escapeHtml(relationshipStageLabel(suggestion.suggestedStage))}</span>
            <small>${escapeHtml(suggestion.reason || '事件结算建议')}</small>
            <button class="secondary" type="button" data-apply-relationship-suggestion="${escapeHtml(suggestion.id)}">应用</button>
            <button class="secondary" type="button" data-ignore-relationship-suggestion="${escapeHtml(suggestion.id)}">忽略</button>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';
  return `
    <div class="relationship-pair-selector">
      <label class="field">
        <span>角色 A</span>
        <select id="relationship-pair-a-select">${firstOptions}</select>
      </label>
      <label class="field">
        <span>角色 B</span>
        <select id="relationship-pair-b-select">${secondOptions}</select>
      </label>
    </div>
    <div class="character-relationship-grid">
      <section class="character-relationship-side">
        <h2>${escapeHtml(first.name)} 怎么看 ${escapeHtml(second.name)}</h2>
        <label class="field">
          <span>关系阶段</span>
          <select id="relationship-pair-a-stage">${renderRelationshipStageOptions(firstSide.stage)}</select>
        </label>
        <label class="field">
          <span>视角摘要</span>
          <textarea id="relationship-pair-a-summary" placeholder="只写这个角色怎么看对方，不写数值好感度。">${escapeHtml(firstSide.summary)}</textarea>
        </label>
      </section>
      <section class="character-relationship-side">
        <h2>${escapeHtml(second.name)} 怎么看 ${escapeHtml(first.name)}</h2>
        <label class="field">
          <span>关系阶段</span>
          <select id="relationship-pair-b-stage">${renderRelationshipStageOptions(secondSide.stage)}</select>
        </label>
        <label class="field">
          <span>视角摘要</span>
          <textarea id="relationship-pair-b-summary" placeholder="另一边可以完全不同，关系不是自动对称的。">${escapeHtml(secondSide.summary)}</textarea>
        </label>
      </section>
    </div>
    ${suggestionList}
    <button id="save-character-relationship" class="secondary" type="button">保存角色之间的关系</button>
  `;
}

function renderAutoMessage(character?: CharacterProfile): string {
  if (!character) {
    return '<p class="muted">导入角色后可设置主动消息。</p>';
  }
  const schedule = character.autoMessage;
  const momentSchedule = character.autoMoment;
  const eventSchedule = character.autoEvent;
  const nextAttempt = schedule.nextAttemptAt ? new Date(schedule.nextAttemptAt).toLocaleString() : '未安排';
  const nextMoment = momentSchedule.nextAttemptAt ? new Date(momentSchedule.nextAttemptAt).toLocaleString() : '未安排';
  const nextEvent = eventSchedule.nextAttemptAt ? new Date(eventSchedule.nextAttemptAt).toLocaleString() : '未安排';
  return `
    <label class="field field-inline"><span>启用主动消息</span><input id="auto-enabled" type="checkbox" ${schedule.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>最小间隔（小时）</span><input id="auto-min-hours" type="number" min="0.05" step="0.05" value="${schedule.baseIntervalMin / 3600000}" /></label>
      <label class="field"><span>最大间隔（小时）</span><input id="auto-max-hours" type="number" min="0.05" step="0.05" value="${schedule.baseIntervalMax / 3600000}" /></label>
    </div>
    <div class="two-columns">
      <label class="field"><span>每日上限</span><input id="auto-daily-limit" type="number" min="1" value="${schedule.dailyLimit}" /></label>
      <label class="field"><span>硬性最大间隔（小时）</span><input id="auto-max-interval" type="number" min="1" value="${schedule.maxInterval / 3600000}" /></label>
    </div>
    <label class="field field-inline"><span>启用安静时段</span><input id="auto-quiet-enabled" type="checkbox" ${schedule.quietHours.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>安静开始</span><input id="auto-quiet-start" value="${escapeHtml(schedule.quietHours.start)}" /></label>
      <label class="field"><span>安静结束</span><input id="auto-quiet-end" value="${escapeHtml(schedule.quietHours.end)}" /></label>
    </div>
    <label class="field field-inline"><span>允许后台通知</span><input id="auto-background-notify" type="checkbox" ${schedule.backgroundNotificationsEnabled ? 'checked' : ''} /></label>
    <label class="field">
      <span>通知隐私</span>
      <select id="auto-notification-privacy">
        <option value="generic" ${schedule.notificationPrivacy === 'generic' ? 'selected' : ''}>显示角色名，只提示有新消息</option>
        <option value="full" ${schedule.notificationPrivacy === 'full' ? 'selected' : ''}>显示完整消息</option>
        <option value="hide_character" ${schedule.notificationPrivacy === 'hide_character' ? 'selected' : ''}>隐藏角色名和内容</option>
      </select>
    </label>
    <label class="field">
      <span>主动消息节奏策略</span>
      <textarea id="auto-pacing-strategy" rows="7" placeholder="写下这个角色在用户未回复时应该怎么试探、等待、降频或沉默。">${escapeHtml(schedule.pacingStrategy || createAutoMessagePacingStrategy(character))}</textarea>
    </label>
    <button id="regenerate-auto-pacing-strategy" class="secondary" type="button">按人设重建策略</button>
    <button id="save-auto-message" class="secondary">保存主动消息设置</button>
    <button id="run-auto-check" class="secondary secondary-gap">立即检查一次</button>
    ${schedule.pendingResetDecision ? `
      <div class="reset-decision">
        <strong>联系节奏已经变化</strong>
        <p class="muted">你回复了此前未回应的主动消息。请选择是否恢复频率。</p>
        <button id="restore-auto-pacing" class="secondary">恢复正常频率</button>
        <button id="keep-auto-pacing" class="secondary secondary-gap">保持当前降频</button>
      </div>
    ` : ''}
    <p class="muted">状态：${schedule.enabled ? '已启用' : '未启用'} · ${escapeHtml(pacingStateLabel(schedule.currentPacingState))}</p>
    <p class="muted">下次尝试：${escapeHtml(nextAttempt)}</p>
    <p class="muted">未回复次数：${schedule.unansweredCount}</p>
    <p class="muted">节奏说明：${escapeHtml(schedule.pacingReason)}</p>
    <div class="settings-divider"></div>
    <h2>世界活跃度</h2>
    <p class="muted">高模拟会让自动动态带动角色评论、楼主自由回复，并让生活线索更倾向多角色参与。会明显增加 token 消耗，默认关闭。</p>
    <label class="field field-inline"><span>高模拟世界互动</span><input id="world-high-simulation" type="checkbox" ${state.worldInteractionHighSimulation ? 'checked' : ''} /></label>
    <p class="muted">当前：${state.worldInteractionHighSimulation ? '高模拟已开启，世界会更主动运转。' : '轻量模式，自动互动保持克制。'}</p>
    <div class="settings-divider"></div>
    <h2>自动动态</h2>
    <p class="muted">角色会按自己的生活节奏在手机上发布动态。应用未运行期间错过的动态不会补发。</p>
    <label class="field field-inline"><span>启用自动动态</span><input id="auto-moment-enabled" type="checkbox" ${momentSchedule.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>最小间隔（小时）</span><input id="auto-moment-min-hours" type="number" min="0.25" step="0.25" value="${momentSchedule.baseIntervalMin / 3600000}" /></label>
      <label class="field"><span>最大间隔（小时）</span><input id="auto-moment-max-hours" type="number" min="0.25" step="0.25" value="${momentSchedule.baseIntervalMax / 3600000}" /></label>
    </div>
    <label class="field"><span>每日动态上限</span><input id="auto-moment-daily-limit" type="number" min="1" value="${momentSchedule.dailyLimit}" /></label>
    <div class="two-columns">
      <label class="field"><span>安静开始</span><input id="auto-moment-quiet-start" value="${escapeHtml(momentSchedule.quietHours.start)}" /></label>
      <label class="field"><span>安静结束</span><input id="auto-moment-quiet-end" value="${escapeHtml(momentSchedule.quietHours.end)}" /></label>
    </div>
    <p class="muted">下次自动动态：${escapeHtml(nextMoment)}</p>
    <p class="muted">状态：${escapeHtml(momentSchedule.statusReason)}</p>
    <div class="settings-divider"></div>
    <h2>自动岛上事件</h2>
    <p class="muted">每个角色都会按自己的节奏冒出生活事件。事件需要你选择分支后才会结算关系。</p>
    <label class="field field-inline"><span>启用自动事件</span><input id="auto-event-enabled" type="checkbox" ${eventSchedule.enabled ? 'checked' : ''} /></label>
    <div class="two-columns">
      <label class="field"><span>最小间隔（小时）</span><input id="auto-event-min-hours" type="number" min="0.25" step="0.25" value="${eventSchedule.baseIntervalMin / 3600000}" /></label>
      <label class="field"><span>最大间隔（小时）</span><input id="auto-event-max-hours" type="number" min="0.25" step="0.25" value="${eventSchedule.baseIntervalMax / 3600000}" /></label>
    </div>
    <label class="field"><span>每日事件上限</span><input id="auto-event-daily-limit" type="number" min="1" value="${eventSchedule.dailyLimit}" /></label>
    <div class="two-columns">
      <label class="field"><span>安静开始</span><input id="auto-event-quiet-start" value="${escapeHtml(eventSchedule.quietHours.start)}" /></label>
      <label class="field"><span>安静结束</span><input id="auto-event-quiet-end" value="${escapeHtml(eventSchedule.quietHours.end)}" /></label>
    </div>
    <p class="muted">下次自动事件：${escapeHtml(nextEvent)}</p>
    <p class="muted">状态：${escapeHtml(eventSchedule.statusReason)}</p>
  `;
}

function activePromptPreset(): PromptPreset | undefined {
  const preferredId = editingPromptPresetId
    || state.activeChatPromptPresetId
    || state.activeGroupPromptPresetId
    || state.activeWorldPromptPresetId
    || state.promptPresets[0]?.id
    || '';
  const preset = state.promptPresets.find(item => item.id === preferredId) ?? state.promptPresets[0];
  editingPromptPresetId = preset?.id ?? '';
  return preset;
}

function promptPresetById(id: string): PromptPreset | undefined {
  return state.promptPresets.find(preset => preset.id === id);
}

function renderPromptPresetOptions(activeId?: string): string {
  return state.promptPresets.map(preset =>
    `<option value="${escapeHtml(preset.id)}" ${preset.id === activeId ? 'selected' : ''}>${escapeHtml(preset.name)}</option>`,
  ).join('');
}

function renderParameterSummary(preset: PromptPreset): string {
  const entries = Object.entries(preset.parameterSummary);
  if (entries.length === 0) return '未发现可保留的模型参数。';
  return entries
    .slice(0, 10)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(' · ');
}

function renderSwitchControl(attrs: string, checked: boolean, label: string): string {
  return `
    <span class="switch-control">
      <input type="checkbox" ${attrs} ${checked ? 'checked' : ''} aria-label="${escapeHtml(label)}" />
      <span class="switch-track" aria-hidden="true"><span class="switch-thumb"></span></span>
    </span>
  `;
}

function renderPromptRoleOptions(activeRole: string): string {
  return ['system', 'user', 'assistant']
    .map(role => `<option value="${role}" ${role === activeRole ? 'selected' : ''}>${role}</option>`)
    .join('');
}

function renderPromptPresetRows(preset: PromptPreset): string {
  return preset.prompts.map(prompt => {
    const identifier = escapeHtml(prompt.identifier);
    const preview = prompt.marker
      ? '由本应用动态填充'
      : compactText(prompt.content || '空提示词', 120);
    return `
      <article class="prompt-preset-row ${prompt.enabled ? 'is-enabled' : ''}">
        ${renderSwitchControl(`data-preset-prompt="${identifier}"`, prompt.enabled, `启用 ${prompt.name}`)}
        <div class="prompt-preset-main">
          <div class="prompt-preset-line">
            <label class="prompt-preset-field prompt-title-field">
              <span>名称</span>
              <input data-preset-prompt-name="${identifier}" value="${escapeHtml(prompt.name)}" />
            </label>
            <label class="prompt-preset-field prompt-role-field">
              <span>角色</span>
              <select data-preset-prompt-role="${identifier}">${renderPromptRoleOptions(prompt.role)}</select>
            </label>
          </div>
          ${prompt.marker ? `
            <p class="prompt-preset-marker">${escapeHtml(preview)}</p>
          ` : `
            <label class="prompt-preset-field prompt-content-field">
              <span>内容</span>
              <textarea rows="3" data-preset-prompt-content="${identifier}">${escapeHtml(prompt.content)}</textarea>
            </label>
          `}
        </div>
        <span class="prompt-preset-meta">
          <em>${escapeHtml(prompt.role)}</em>
          ${prompt.marker ? '<b>动态槽位</b>' : ''}
        </span>
      </article>
    `;
  }).join('');
}

function renderPromptRegexRows(preset: PromptPreset): string {
  if (preset.regexScripts.length === 0) {
    return `
      <div class="empty-panel prompt-regex-empty">
        <strong>还没有正则脚本</strong>
        <p>可以手动新增，或导入带 regex_scripts 的 SillyTavern 预设。正则会在私聊模型输出后执行。</p>
      </div>
    `;
  }
  return preset.regexScripts.map(script => {
    const id = escapeHtml(script.id);
    const tags = [
      script.promptOnly ? 'Prompt only' : '',
      script.markdownOnly ? 'Markdown only' : '',
    ].filter(Boolean).join(' · ');
    return `
      <article class="prompt-regex-row ${script.enabled ? 'is-enabled' : ''}">
        ${renderSwitchControl(`data-preset-regex="${id}"`, script.enabled, `启用 ${script.name}`)}
        <div class="prompt-regex-main">
          <div class="prompt-regex-line">
            <label class="prompt-preset-field prompt-regex-name">
              <span>名称</span>
              <input data-preset-regex-name="${id}" value="${escapeHtml(script.name)}" />
            </label>
            <button class="plain-button danger-text" type="button" data-delete-preset-regex="${id}">删除</button>
          </div>
          <div class="prompt-regex-fields">
            <label class="prompt-preset-field">
              <span>查找正则</span>
              <textarea rows="2" data-preset-regex-find="${id}" placeholder="/pattern/g">${escapeHtml(script.findRegex)}</textarea>
            </label>
            <label class="prompt-preset-field">
              <span>替换为</span>
              <textarea rows="2" data-preset-regex-replace="${id}" placeholder="留空表示删除匹配内容">${escapeHtml(script.replaceString)}</textarea>
            </label>
          </div>
          ${tags ? `<small>${escapeHtml(tags)} 已保留；当前统一按私聊输出正则执行。</small>` : ''}
        </div>
      </article>
    `;
  }).join('');
}

function renderPromptPresetSettings(): string {
  const active = activePromptPreset();
  const chatActive = promptPresetById(state.activeChatPromptPresetId);
  const groupActive = promptPresetById(state.activeGroupPromptPresetId);
  const worldActive = promptPresetById(state.activeWorldPromptPresetId);
  return `
    <section class="settings-card prompt-preset-settings">
      <div class="settings-heading">
        <div><h2>提示词预设</h2></div>
        <p>私聊、群聊和世界 RP 可以分别选择预设；下面编辑的是当前选中的那一套。</p>
      </div>
      <div class="prompt-preset-actions">
        <label class="file-button secondary-file">
          导入 SillyTavern 预设 JSON
          <input id="prompt-preset-import" type="file" accept=".json,application/json" />
        </label>
        <button id="restore-tavern-social-prompt-preset" class="secondary" type="button">写入默认回复策略预设</button>
        <button id="restore-tavern-social-group-prompt-preset" class="secondary" type="button">写入默认群聊策略预设</button>
        <button id="restore-tavern-social-world-prompt-preset" class="secondary" type="button">写入默认世界 RP 预设</button>
      </div>
      <p class="muted">会完整保存原始 JSON、扩展字段、正则脚本和 SPreset 数据；私聊、群聊、世界 RP 分别执行自己选中的 prompts、prompt_order 和输出正则。</p>
      ${state.promptPresets.length > 0 ? `
        <div class="settings-divider"></div>
        <div class="prompt-preset-scope-grid">
          <label class="field field-inline prompt-preset-enable">
            <span>私聊启用预设</span>
            ${renderSwitchControl('id="chat-prompt-preset-enabled"', state.chatPromptPresetEnabled, '私聊启用预设')}
          </label>
          <label class="field">
            <span>私聊预设</span>
            <select id="active-chat-prompt-preset" aria-label="选择私聊预设">${renderPromptPresetOptions(chatActive?.id)}</select>
          </label>
          <label class="field field-inline prompt-preset-enable">
            <span>群聊启用预设</span>
            ${renderSwitchControl('id="group-prompt-preset-enabled"', state.groupPromptPresetEnabled, '群聊启用预设')}
          </label>
          <label class="field">
            <span>群聊预设</span>
            <select id="active-group-prompt-preset" aria-label="选择群聊预设">${renderPromptPresetOptions(groupActive?.id)}</select>
          </label>
          <label class="field field-inline prompt-preset-enable">
            <span>世界 RP 启用预设</span>
            ${renderSwitchControl('id="world-prompt-preset-enabled"', state.worldPromptPresetEnabled, '世界 RP 启用预设')}
          </label>
          <label class="field">
            <span>世界 RP 预设</span>
            <select id="active-world-prompt-preset" aria-label="选择世界 RP 预设">${renderPromptPresetOptions(worldActive?.id)}</select>
          </label>
          <label class="field prompt-preset-editor-select">
            <span>正在编辑</span>
            <select id="editing-prompt-preset" aria-label="选择要编辑的预设">${renderPromptPresetOptions(active?.id)}</select>
          </label>
        </div>
        ${active ? `
          <label class="field">
            <span>预设名称</span>
            <input id="prompt-preset-name" value="${escapeHtml(active.name)}" />
          </label>
          <div class="prompt-preset-toolbar">
            <button id="reset-prompt-preset" class="secondary" type="button">恢复默认开关</button>
            <button id="delete-prompt-preset" class="danger" type="button">删除当前预设</button>
          </div>
          <div class="prompt-preset-summary">
            <strong>${escapeHtml(active.name)}</strong>
            <span>${active.prompts.filter(prompt => prompt.enabled).length} / ${active.prompts.length} 条已启用 · 来源 ${escapeHtml(active.sourceFileName || '未知文件')}</span>
          </div>
          <div class="prompt-preset-list">${renderPromptPresetRows(active)}</div>
          <div class="settings-divider"></div>
          <div class="prompt-regex-head">
            <div>
              <h2>正则系统</h2>
              <p class="muted">${active.regexScripts.filter(script => script.enabled).length} / ${active.regexScripts.length} 条启用。会处理使用这个预设的私聊或群聊模型输出，不处理动态、事件和写卡。</p>
            </div>
            <button id="add-prompt-regex" class="secondary" type="button">新增正则</button>
          </div>
          <div class="prompt-regex-list">${renderPromptRegexRows(active)}</div>
          <div class="settings-divider"></div>
          <h2>保留的兼容数据</h2>
          <div class="prompt-preset-compat">
            <p><strong>扩展字段</strong><span>${active.extensionKeys.length > 0 ? escapeHtml(active.extensionKeys.join('、')) : '无'}</span></p>
            <p><strong>正则脚本</strong><span>导入 ${active.regexScriptCount} 条，当前 ${active.regexScripts.length} 条，已启用 ${active.regexScripts.filter(script => script.enabled).length} 条。</span></p>
            <p><strong>SPreset</strong><span>${active.hasSPreset ? '已保留，暂不执行。' : '未发现。'}</span></p>
            <p><strong>模型参数</strong><span>${escapeHtml(renderParameterSummary(active))}</span></p>
          </div>
        ` : '<p class="muted">当前预设不存在，请重新选择或导入。</p>'}
      ` : `
        <div class="empty-panel">
          <strong>还没有导入预设</strong>
          <p>导入后可以在这里逐条开关 prompt。动态、事件和写卡仍使用独立提示词。</p>
        </div>
      `}
    </section>
  `;
}

function renderSettingsContent(character?: CharacterProfile): string {
  const world = activeWorld();
  const managedStickerCharacter = stickerManagerCharacter();
  const managedRelationshipCharacter = relationshipManagerCharacter();
  const [relationshipPairA, relationshipPairB] = relationshipPairCharacters();
  const managedProactiveCharacter = proactiveManagerCharacter();
  const stickerCharacterOptions = state.characters
    .filter(item => item.worldId === world.id)
    .map(item => `<option value="${escapeHtml(item.id)}" ${item.id === managedStickerCharacter?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
    .join('');
  const relationshipCharacterOptions = state.characters
    .filter(item => item.worldId === world.id)
    .map(item => `<option value="${escapeHtml(item.id)}" ${item.id === managedRelationshipCharacter?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
    .join('');
  const proactiveCharacterOptions = state.characters
    .filter(item => item.worldId === world.id)
    .map(item => `<option value="${escapeHtml(item.id)}" ${item.id === managedProactiveCharacter?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
    .join('');
  const cardCharacterOptions = state.characters
    .filter(item => item.worldId === world.id)
    .map(item => `<option value="${escapeHtml(item.id)}" ${item.id === character?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
    .join('');
  const activeCharacterSettings = character ? characterSettingsText(character) : '';
  resetDailyModelUsage();
  if (activeSettingsSection === 'drafts') {
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">角色创作</span><h2>写卡草稿</h2></div>
        <p>继续、复制或删除尚未完成的角色卡。所有输入都已经自动保存在本机。</p>
      </div>
      ${renderDraftManager()}
    </section>`;
  }
  if (activeSettingsSection === 'world') {
    const locationLabel = weatherLocationLabel(world.location);
    const weatherSummary = world.weather ? weatherSnapshotLine(world.weather) : '当前天气：未获取。';
    const locationCandidateOptions = worldLocationSearchWorldId === world.id
      ? worldLocationCandidates.map((candidate, index) =>
        `<option value="${index}">${escapeHtml(weatherLocationLabel(candidate))} · ${candidate.latitude.toFixed(2)}, ${candidate.longitude.toFixed(2)}</option>`,
      ).join('')
      : '';
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">空间管理</span><h2>世界与角色</h2></div>
        <p>管理当前世界、创建新世界，并导入或导出角色卡。</p>
      </div>
      <h2>世界</h2>
      <label class="field"><span>名称</span><input id="world-name" value="${escapeHtml(world.name)}" /></label>
      <label class="field"><span>说明</span><textarea id="world-description">${escapeHtml(world.description)}</textarea></label>
      <label class="field"><span>当前地点</span><input id="world-current-location" value="${escapeHtml(world.currentLocation)}" placeholder="例如：便利店靠窗座位、合租公寓客厅" /></label>
      <label class="field"><span>当前氛围</span><input id="world-scene-atmosphere" value="${escapeHtml(world.sceneAtmosphere)}" placeholder="例如：雨天、放松、微妙亲近" /></label>
      <label class="field"><span>场景摘要</span><textarea id="world-scene-summary" placeholder="记下这个日常 RP 当前正在发生什么。">${escapeHtml(world.sceneSummary)}</textarea></label>
      <label class="field">
        <span>现实城市</span>
        <input id="world-location-query" value="${escapeHtml(world.location?.name ?? '')}" placeholder="例如：北京、上海、成都、New York" />
      </label>
      <div class="inline-actions">
        <button id="search-world-location" class="secondary" type="button" ${worldWeatherLoading ? 'disabled' : ''}>搜索城市</button>
        <button id="refresh-world-weather" class="secondary" type="button" ${!world.location || worldWeatherLoading ? 'disabled' : ''}>刷新天气</button>
      </div>
      ${locationCandidateOptions ? `
        <div class="inline-actions world-location-candidates">
          <select id="world-location-candidate" aria-label="选择城市候选">${locationCandidateOptions}</select>
          <button id="use-world-location" class="secondary" type="button" ${worldWeatherLoading ? 'disabled' : ''}>使用选中城市</button>
        </div>
      ` : ''}
      <p class="muted">当前城市：${escapeHtml(locationLabel)}。${escapeHtml(weatherSummary)}${world.weather ? ` 更新时间：${escapeHtml(formatConversationTime(world.weather.fetchedAt))}。` : ''}</p>
      ${worldWeatherStatus ? `<p class="muted">${escapeHtml(worldWeatherStatus)}</p>` : ''}
      <button id="save-world" class="secondary">保存世界设置</button>
      ${state.worlds.length > 1 ? '<button id="delete-world" class="danger secondary-gap">删除当前世界</button>' : ''}
      <div class="settings-divider"></div>
      <h2>新建世界</h2>
      <label class="field"><span>名称</span><input id="new-world-name" placeholder="例如：海边小城" /></label>
      <button id="create-world" class="secondary">创建并进入新世界</button>
      <div class="settings-divider"></div>
      <h2>角色卡</h2>
      <div class="character-card-actions">
        <button class="primary" data-open-authoring>写角色卡</button>
        <label class="file-button"><span>导入 JSON / PNG</span><input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
      </div>
      ${character ? `
        <label class="field character-manage-select">
          <span>正在编辑</span>
          <select id="character-manage-select">${cardCharacterOptions}</select>
        </label>
        <div class="character-summary">
          <span class="avatar settings-avatar">${renderAvatar(character)}</span>
          <div class="character-summary-copy">
            <strong>${escapeHtml(character.name)}</strong>
            <p>${escapeHtml(compactText(activeCharacterSettings || '暂无设定', 150))}</p>
            <label class="avatar-upload">
              ${icon('import')}<span>${character.customAvatar ? '更换自定义头像' : '上传自定义头像'}</span>
              <input id="character-avatar-import" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" />
            </label>
          </div>
        </div>
        <p class="muted">卡片：${escapeHtml(character.importInfo.sourceFormat.toUpperCase())} · ${escapeHtml(character.importInfo.spec)} · 世界书 ${character.importInfo.worldBookEntryCount} 条</p>
        <div class="character-edit-form">
          <label class="field"><span>卡名</span><input id="character-name" value="${escapeHtml(character.name)}" /></label>
          <label class="field">
            <span>设定世界书正文</span>
            <textarea id="character-settings-text" placeholder="外貌、性格、爱好、背景、说话方式等都写在这里。">${escapeHtml(activeCharacterSettings)}</textarea>
          </label>
          <p class="muted">保存后，设定会写入这张角色卡绑定的“${escapeHtml(character.name)} 设定”世界书条目，不再塞进角色简介。</p>
          <button id="save-character-details" class="secondary">保存卡名与设定</button>
        </div>
        <div class="character-manage-actions">
          <button id="export-tavern-card" class="secondary">导出酒馆角色卡 JSON</button>
          <button id="delete-character" class="danger">删除角色卡</button>
        </div>
      ` : '<p class="muted">选择或导入角色后，可以在这里查看并导出角色卡。</p>'}
    </section>`;
  }
  if (activeSettingsSection === 'stickers') {
    return `
    <section class="settings-card sticker-settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">图片消息</span><h2>表情包</h2></div>
        <p>分别管理角色专属、所有人共享和只由你发送的表情包。</p>
      </div>
      ${managedStickerCharacter ? `
        <div class="sticker-character-selector">
          <label class="field">
            <span>管理哪位角色的专属表情包</span>
            <select id="sticker-character-select">${stickerCharacterOptions}</select>
          </label>
          <div class="sticker-character-preview">
            <span class="avatar">${renderAvatar(managedStickerCharacter)}</span>
            <div><strong>${escapeHtml(managedStickerCharacter.name)}</strong><small>切换角色不会改变当前聊天对象</small></div>
          </div>
        </div>
        ${renderStickerLibrary('character', managedStickerCharacter.stickers ?? [], managedStickerCharacter)}
        <div class="settings-divider"></div>
      ` : '<p class="muted">当前世界还没有角色，导入角色卡后可管理专属表情包。</p><div class="settings-divider"></div>'}
      ${renderStickerLibrary('common', state.commonStickers)}
      <div class="settings-divider"></div>
      ${renderStickerLibrary('user', state.userStickers)}
    </section>`;
  }
  if (activeSettingsSection === 'model') {
    const config = modelFormDraft ?? state.modelConfig;
    const provider = modelProviderFor(config.apiUrl, config.provider);
    const apiUrl = provider === 'deepseek' ? DEEPSEEK_API_URL : config.apiUrl;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">AI 服务</span><h2>模型连接</h2></div>
        <p>配置兼容 OpenAI 接口的模型服务。预算只限制自动输出，不限制手动聊天、写卡和手动生成。</p>
      </div>
      <label class="field"><span>模型厂商</span><select id="model-provider">${modelProviderOptions(provider)}</select></label>
      <label class="field"><span>API 地址</span><input id="api-url" value="${escapeHtml(apiUrl)}" placeholder="https://example.com/v1" /></label>
      <label class="field"><span>API Key</span><input id="api-key" type="password" value="${escapeHtml(config.apiKey)}" placeholder="输入服务商提供的密钥" autocomplete="off" spellcheck="false" /></label>
      <div class="model-picker-row">
        <label class="field"><span>模型名称</span><input id="model-name" list="model-options" value="${escapeHtml(config.model)}" placeholder="可手动填写或从列表选择" /></label>
        <button id="fetch-model-list" class="secondary" type="button" ${modelListLoading || modelConnectionTesting ? 'disabled' : ''}>${modelListLoading ? '正在获取…' : '获取模型列表'}</button>
        <button id="test-model-connection" class="secondary" type="button" ${modelListLoading || modelConnectionTesting ? 'disabled' : ''}>${modelConnectionTesting ? '正在测试…' : '测试连接'}</button>
      </div>
      <datalist id="model-options">${discoveredModels.map(model => `<option value="${escapeHtml(model)}"></option>`).join('')}</datalist>
      ${discoveredModels.length > 0 ? `
        <label class="field"><span>已获取 ${discoveredModels.length} 个模型</span>
          <select id="model-list-select">
            <option value="">请选择模型</option>
            ${discoveredModels.map(model => `<option value="${escapeHtml(model)}" ${model === config.model ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('')}
          </select>
        </label>
      ` : ''}
      <p class="muted model-list-status" id="model-list-status">${escapeHtml(modelListStatus || '模型列表地址会根据 API 地址自动识别为 /v1/models。')}</p>
      <div class="two-columns">
        <label class="field"><span>温度</span><input id="temperature" type="number" min="0" max="2" step="0.05" value="${config.temperature}" /></label>
        <label class="field"><span>每日自动输出预算</span><input id="daily-request-limit" type="number" min="1" value="${config.dailyRequestLimit}" /></label>
      </div>
      <p class="muted">今日自动已使用：${state.modelUsage.requestCount} / ${state.modelConfig.dailyRequestLimit}</p>
      <button id="save-model" class="secondary">保存模型设置</button>
    </section>`;
  }
  if (activeSettingsSection === 'prompts') {
    return renderPromptPresetSettings();
  }
  if (activeSettingsSection === 'relationship') {
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">角色节奏</span><h2>关系状态</h2></div>
        <p>${managedRelationshipCharacter ? '选择角色并单独调整关系阶段、好感度与关系摘要。' : '导入角色后可设置关系状态。'}</p>
      </div>
      ${managedRelationshipCharacter ? `
        <div class="relationship-character-selector">
          <label class="field">
            <span>管理哪位角色的关系状态</span>
            <select id="relationship-character-select">${relationshipCharacterOptions}</select>
          </label>
          <div class="relationship-character-preview">
            <span class="avatar">${renderAvatar(managedRelationshipCharacter)}</span>
            <div><strong>${escapeHtml(managedRelationshipCharacter.name)}</strong><small>切换角色不会改变当前聊天对象</small></div>
          </div>
        </div>
      ` : ''}
      ${renderRelationship(managedRelationshipCharacter)}
      <div class="settings-divider"></div>
      <div class="settings-heading compact-heading">
        <div><span class="settings-kicker">角色关系网</span><h2>角色之间的关系</h2></div>
        <p>每对角色有两个独立视角，阶段建议只会先进入待确认，不会自动生效。</p>
      </div>
      ${renderCharacterRelationshipEditor(relationshipPairA, relationshipPairB)}
    </section>`;
  }
  if (activeSettingsSection === 'interactions') {
    const stats = backgroundInteractionStats(activeWorld().id);
    const nextInteraction = state.worldInteractionNextAttemptAt
      ? new Date(state.worldInteractionNextAttemptAt).toLocaleString()
      : '尚未安排';
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">世界生活循环</span><h2>角色互动</h2></div>
        <p>让同一世界里的角色根据当前计划、关系网、动态和时间线自然产生低噪音互动。默认保持克制，热闹世界会更频繁。</p>
      </div>
      <label class="field field-inline">
        <span>热闹世界</span>
        <input id="world-interaction-high-simulation" type="checkbox" ${state.worldInteractionHighSimulation ? 'checked' : ''} />
      </label>
      <p class="muted">当前：${state.worldInteractionHighSimulation ? '热闹世界已开启，角色会更频繁评论、回应和产生小交集。' : '克制自然，角色间互动会少量发生，不抢注意力。'}</p>
      <div class="settings-divider"></div>
      <div class="status-grid">
        <div><dt>今日互动</dt><dd>${stats.todayCount} / ${stats.worldDailyLimit}</dd></div>
        <div><dt>下次检查</dt><dd>${escapeHtml(nextInteraction)}</dd></div>
      </div>
      <p class="muted">最近原因：${escapeHtml(stats.recentReason)}</p>
      <button id="save-world-interactions" class="secondary" type="button">保存角色互动设置</button>
    </section>`;
  }
  if (activeSettingsSection === 'proactive') {
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">后台联系</span><h2>主动消息</h2></div>
        <p>${managedProactiveCharacter ? '选择角色并单独编辑 TA 的联系频率、未回复降频、自动动态和事件节奏。' : '导入角色后可设置主动消息。'}</p>
      </div>
      ${managedProactiveCharacter ? `
        <div class="relationship-character-selector">
          <label class="field">
            <span>管理哪位角色的主动节奏</span>
            <select id="proactive-character-select">${proactiveCharacterOptions}</select>
          </label>
          <div class="relationship-character-preview">
            <span class="avatar">${renderAvatar(managedProactiveCharacter)}</span>
            <div><strong>${escapeHtml(managedProactiveCharacter.name)}</strong><small>切换角色不会改变当前聊天对象</small></div>
          </div>
        </div>
      ` : ''}
      ${renderAutoMessage(managedProactiveCharacter)}
    </section>`;
  }
  if (activeSettingsSection === 'chat') {
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">发送习惯</span><h2>聊天与 user 人设</h2></div>
        <p>设置你在聊天里是谁，以及角色什么时候开始回复。</p>
      </div>
      <h2>我的人设</h2>
      <label class="field"><span>用户名称</span><input id="user-name" value="${escapeHtml(state.userName)}" placeholder="我" /></label>
      <label class="field">
        <span>user 人设</span>
        <textarea id="user-persona" placeholder="例如：高二学生，住在学校附近，说话偏直白，但其实很容易心软。">${escapeHtml(world.userPersona)}</textarea>
      </label>
      <p class="muted">这段绑定当前世界，会写进模型提示词，帮助角色理解“你是谁”；不会替你发言，也不会写进角色卡导出。</p>
      <div class="settings-divider"></div>
      <h2>回复方式</h2>
      <div class="reply-mode-settings" role="radiogroup" aria-label="聊天回复方式">
        <label class="reply-mode-option ${state.chatReplyMode === 'manual' ? 'is-active' : ''}">
          <input type="radio" name="chat-reply-mode" value="manual" ${state.chatReplyMode === 'manual' ? 'checked' : ''} />
          <span><strong>短消息模式</strong><small>你可以连续发几条短消息，点输入框旁边的生成键后，角色再回复。</small></span>
        </label>
        <label class="reply-mode-option ${state.chatReplyMode === 'auto' ? 'is-active' : ''}">
          <input type="radio" name="chat-reply-mode" value="auto" ${state.chatReplyMode === 'auto' ? 'checked' : ''} />
          <span><strong>长消息模式</strong><small>发送一条较完整的消息后，角色自动开始回复，保持原来的聊天方式。</small></span>
        </label>
      </div>
      <div class="settings-divider"></div>
      <h2>发送键</h2>
      <label class="group-reply-toggle">
        <span>
          <strong>回车直接发送</strong>
          <small>打开后，私聊和群聊输入框按 Enter 发送；Shift + Enter 仍然换行。</small>
        </span>
        ${renderSwitchControl('id="enter-to-send"', state.enterToSend, '回车直接发送')}
      </label>
      <div class="settings-divider"></div>
      <h2>陪伴时间</h2>
      <p class="muted">当前显示：${escapeHtml(formatCompanionDateTime(state))}（${escapeHtml(companionTimeModeLabel(state.companionTimeMode))}）。</p>
      ${renderCompanionTimeFields('settings')}
      <button id="save-chat-reply-mode" class="secondary secondary-gap" type="button">保存聊天与 user 人设</button>
    </section>`;
  }
  if (activeSettingsSection === 'notifications') {
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">系统提醒</span><h2>通知</h2></div>
        <p>主动消息成功写入私聊后，按照角色的隐私等级发送系统通知。</p>
      </div>
      <p class="muted">${escapeHtml(notificationSupportText())}</p>
      <button id="request-notification" class="secondary">申请通知权限</button>
      <button id="test-notification" class="secondary secondary-gap">发送测试通知</button>
      <div class="settings-divider"></div>
      <h2>后台宿主</h2>
      <p class="muted">${escapeHtml(backgroundRuntimeStatusText())}</p>
    </section>`;
  }
  return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">本地管理</span><h2>数据与运行</h2></div>
        <p>备份完整本地状态，并查看最近一次操作结果。</p>
      </div>
      <button id="force-restart-services" class="secondary" type="button" ${serviceRestartLoading ? 'disabled' : ''}>${serviceRestartLoading ? '正在重启…' : '强制重启所有服务'}</button>
      <p class="muted">等同重新打开应用，只重新拉起运行服务，不刷新或生成已有内容。</p>
      <button id="export-backup" class="secondary">导出备份 JSON</button>
      <label class="file-button secondary-file">导入备份 JSON<input id="backup-import" type="file" accept=".json,application/json" /></label>
      <div class="settings-divider"></div>
      <h2>运行记录</h2>
      <div class="status status-panel">${escapeHtml(statusText)}</div>
    </section>
  `;
}

function renderSettingsCenter(character?: CharacterProfile): string {
  if (!settingsOpen) return '';
  const groups: Array<[string, Array<[SettingsSection, string, string]>]> = [
    ['内容', [
      ['world', '世界与角色', '空间、导入与导出'],
      ['drafts', '写卡草稿', '创作、续写与管理'],
      ['stickers', '表情包', '角色、通用与用户图库'],
    ]],
    ['运行', [
      ['model', '模型连接', 'API 与自动预算'],
      ['prompts', '提示词预设', '酒馆预设导入与开关'],
      ['relationship', '关系状态', '好感度与关系摘要'],
      ['interactions', '角色互动', '后台生活循环'],
      ['proactive', '主动消息', '频率、安静时段与降频'],
    ]],
    ['应用', [
      ['chat', '聊天与人设', '短消息、长消息与 user 人设'],
      ['notifications', '通知', '权限、隐私与后台'],
      ['data', '数据与运行', '备份与操作记录'],
    ]],
  ];
  return `
    <div class="settings-overlay" role="dialog" aria-modal="true" aria-label="设置中心">
      <button class="settings-backdrop" id="close-settings-backdrop" tabindex="-1" aria-hidden="true"></button>
      <section class="settings-window">
        <header class="settings-topbar">
          <div><span class="settings-kicker">PalTavern</span><h1>设置中心</h1></div>
          <button class="icon-button" id="close-settings" aria-label="关闭设置">×</button>
        </header>
        <div class="settings-layout">
          <nav class="settings-nav">
            ${groups.map(([group, items]) => `
              <div class="settings-nav-group">
                <h2>${group}</h2>
                ${items.map(([id, label, description]) => `
                  <button class="${activeSettingsSection === id ? 'is-active' : ''}" data-settings-section="${id}">
                    <strong>${label}</strong><span>${description}</span>
                  </button>
                `).join('')}
              </div>
            `).join('')}
          </nav>
          <main class="settings-content">${renderSettingsContent(character)}</main>
        </div>
      </section>
    </div>
  `;
}

function renderModelOnboarding(): string {
  if (!modelOnboardingOpen) return '';
  const provider = modelProviderFor(modelOnboardingDraft.apiUrl, modelOnboardingDraft.provider);
  const apiUrl = provider === 'deepseek' ? DEEPSEEK_API_URL : modelOnboardingDraft.apiUrl;
  return `
    <div class="model-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="model-onboarding-title">
      <section class="model-onboarding-window">
        <header class="model-onboarding-header">
          <div class="model-onboarding-mark" aria-hidden="true">${icon('message')}</div>
          <div>
            <span class="model-onboarding-step">首次设置</span>
            <h1 id="model-onboarding-title">连接模型，开始和角色聊天</h1>
            <p>填写兼容 OpenAI 的接口信息，读取可用模型并保存。配置只保存在当前设备。</p>
          </div>
        </header>
        <div class="model-onboarding-form">
          <label class="field">
            <span>模型厂商</span>
            <select id="onboarding-model-provider">${modelProviderOptions(provider)}</select>
          </label>
          <label class="field">
            <span>API 地址</span>
            <input id="onboarding-api-url" value="${escapeHtml(apiUrl)}" placeholder="https://example.com/v1" autocomplete="url" />
          </label>
          <label class="field">
            <span>API Key</span>
            <input id="onboarding-api-key" type="password" value="${escapeHtml(modelOnboardingDraft.apiKey)}" placeholder="输入服务商提供的密钥" autocomplete="off" spellcheck="false" />
          </label>
          <div class="model-onboarding-model-row">
            <label class="field">
              <span>模型名称</span>
              <input id="onboarding-model-name" list="onboarding-model-options" value="${escapeHtml(modelOnboardingDraft.model)}" placeholder="读取后选择，也可以手动填写" />
            </label>
            <button id="onboarding-fetch-models" class="secondary" type="button" ${modelListLoading || modelConnectionTesting ? 'disabled' : ''}>
              ${modelListLoading ? '正在读取…' : '读取模型'}
            </button>
            <button id="onboarding-test-model-connection" class="secondary" type="button" ${modelListLoading || modelConnectionTesting ? 'disabled' : ''}>
              ${modelConnectionTesting ? '正在测试…' : '测试连接'}
            </button>
          </div>
          <datalist id="onboarding-model-options">
            ${discoveredModels.map(model => `<option value="${escapeHtml(model)}"></option>`).join('')}
          </datalist>
          ${discoveredModels.length > 0 ? `
            <label class="field model-onboarding-select">
              <span>可用模型（${discoveredModels.length}）</span>
              <select id="onboarding-model-select">
                <option value="">选择一个模型</option>
                ${discoveredModels.map(model => `<option value="${escapeHtml(model)}" ${model === modelOnboardingDraft.model ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('')}
              </select>
            </label>
          ` : ''}
          <p class="model-onboarding-status ${modelListError ? 'is-error' : ''}" id="onboarding-model-status">
            ${escapeHtml(modelListStatus || '先填写 API 地址和密钥，再读取服务商提供的模型列表。')}
          </p>
        </div>
        <footer class="model-onboarding-actions">
          <button id="skip-model-onboarding" class="secondary" type="button">暂时跳过</button>
          <button id="save-model-onboarding" class="primary" type="button">保存并开始</button>
        </footer>
      </section>
    </div>
  `;
}

function renderCompanionTimeFields(prefix: 'settings' | 'onboarding'): string {
  const minutes = clampVirtualTimeMinutes(state.virtualTimeMinutes);
  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const mode = state.companionTimeMode;
  const radioName = `${prefix}-companion-time-mode`;
  return `
    <div class="time-mode-settings" role="radiogroup" aria-label="陪伴时间模式">
      <label class="time-mode-option ${mode === 'system' ? 'is-active' : ''}">
        <input type="radio" name="${radioName}" value="system" ${mode === 'system' ? 'checked' : ''} />
        <span><strong>读取系统时间</strong><small>角色按这台设备的真实日期和时间理解早晚、作息和动态。</small></span>
      </label>
      <label class="time-mode-option ${mode === 'virtual' ? 'is-active' : ''}">
        <input type="radio" name="${radioName}" value="virtual" ${mode === 'virtual' ? 'checked' : ''} />
        <span><strong>使用虚拟时间</strong><small>你手动拨一个角色世界里的手机时间，聊天和动态都会按它来写。</small></span>
      </label>
    </div>
    <div class="virtual-clock-control ${mode === 'virtual' ? '' : 'is-disabled'}" data-virtual-clock="${prefix}">
      <div class="virtual-clock-readout">
        <strong id="${prefix}-virtual-clock-readout">${formatClockMinutes(minutes)}</strong>
        <span>${mode === 'virtual' ? '当前虚拟时间' : '选择虚拟时间后启用'}</span>
      </div>
      <div class="virtual-clock-fields">
        <label class="field">
          <span>小时</span>
          <input id="${prefix}-virtual-time-hour" type="number" min="0" max="23" step="1" value="${hour}" ${mode === 'virtual' ? '' : 'disabled'} />
        </label>
        <label class="field">
          <span>分钟</span>
          <input id="${prefix}-virtual-time-minute" type="number" min="0" max="59" step="1" value="${minute}" ${mode === 'virtual' ? '' : 'disabled'} />
        </label>
      </div>
      <input class="virtual-clock-range" id="${prefix}-virtual-time-range" type="range" min="0" max="1439" step="5" value="${minutes}" aria-label="调整虚拟时间" ${mode === 'virtual' ? '' : 'disabled'} />
    </div>
  `;
}

function renderTimeModeOnboarding(): string {
  if (!timeModeOnboardingOpen) return '';
  return `
    <div class="time-mode-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="time-mode-title">
      <section class="time-mode-onboarding-window">
        <header class="time-mode-onboarding-header">
          <div class="time-mode-mark" aria-hidden="true">${icon('timeline')}</div>
          <div>
            <span>陪伴时间</span>
            <h1 id="time-mode-title">角色要按哪个时间陪你？</h1>
            <p>这会写进模型提示词。虚拟时间适合把故事固定在你想要的早晨、深夜或某个作息节奏里。</p>
          </div>
        </header>
        <div class="time-mode-onboarding-body">
          ${renderCompanionTimeFields('onboarding')}
        </div>
        <footer class="time-mode-onboarding-actions">
          <button id="save-time-mode-onboarding" class="primary" type="button">保存时间模式</button>
        </footer>
      </section>
    </div>
  `;
}

function renderChatReplyModeOnboarding(): string {
  if (!chatReplyModeOnboardingOpen || modelOnboardingOpen || timeModeOnboardingOpen) return '';
  return `
    <div class="reply-mode-onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="reply-mode-title">
      <section class="reply-mode-onboarding-window">
        <header class="reply-mode-onboarding-header">
          <div class="reply-mode-mark" aria-hidden="true">${icon('message')}</div>
          <div>
            <span>聊天方式</span>
            <h1 id="reply-mode-title">你想让角色什么时候回复？</h1>
            <p>以后可以在“设置 -> 聊天与人设”里改。短消息模式会在发送旁边显示生成键。</p>
          </div>
        </header>
        <div class="reply-mode-onboarding-options">
          <button class="reply-mode-choice" data-chat-reply-mode-choice="manual" type="button">
            <strong>短消息模式</strong>
            <span>先连续发几条短消息，再点生成键让角色一次回复。</span>
          </button>
          <button class="reply-mode-choice" data-chat-reply-mode-choice="auto" type="button">
            <strong>长消息模式</strong>
            <span>发送一条完整消息后，角色自动开始回复。</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function cardCandidateSourceLabel(source: CharacterCardCandidate['source']): string {
  const labels: Record<CharacterCardCandidate['source'], string> = {
    card_name: '卡名',
    description: '正文',
    world_book: '世界书',
    structured: '结构字段',
  };
  return labels[source];
}

function renderCardRecognitionDialog(): string {
  if (!pendingCardRecognition || pendingCardRecognition.candidates.length <= 1) return '';
  const { character, candidates } = pendingCardRecognition;
  return `
    <div class="card-recognition-overlay" role="dialog" aria-modal="true" aria-label="识别角色卡">
      <button class="card-recognition-backdrop" id="cancel-card-recognition" type="button" aria-label="取消导入"></button>
      <section class="card-recognition-dialog">
        <header>
          <span>导入前识别</span>
          <h2>这张卡里可能有多个角色</h2>
          <p>原卡名是“${escapeHtml(character.name)}”。你可以按整张卡导入，也可以挑出里面的角色分别导入。</p>
        </header>
        <div class="card-recognition-list">
          ${candidates.map((candidate, index) => `
            <label class="card-recognition-item">
              <input type="checkbox" name="recognized-character" value="${escapeHtml(candidate.id)}" ${index === 0 ? 'checked' : ''} />
              <span>
                <strong>${escapeHtml(candidate.name)}${candidate.isPrimary ? '（原卡名）' : ''}</strong>
                <small>${cardCandidateSourceLabel(candidate.source)} · 置信度 ${candidate.confidence}</small>
                ${candidate.snippet ? `<em>${escapeHtml(compactText(candidate.snippet, 150))}</em>` : ''}
              </span>
            </label>
          `).join('')}
        </div>
        <footer>
          <button id="import-original-card" class="secondary" type="button">按整张卡导入</button>
          <button id="import-all-recognized" class="secondary" type="button">全部导入</button>
          <button id="import-selected-recognized" class="primary" type="button">导入选中</button>
        </footer>
      </section>
    </div>
  `;
}

function stickerScopeLabel(scope: StickerLibraryScope): string {
  return scope === 'character' ? '角色专属'
    : scope === 'common' ? '通用'
      : '用户';
}

function renderStickerImportDialog(): string {
  if (!pendingStickerImport) return '';
  const character = pendingStickerImport.characterId
    ? state.characters.find(item => item.id === pendingStickerImport?.characterId)
    : undefined;
  return `
    <div class="sticker-import-overlay" role="dialog" aria-modal="true" aria-label="导入表情包备注">
      <button class="sticker-import-backdrop" id="cancel-sticker-import" type="button" aria-label="取消导入"></button>
      <section class="sticker-import-dialog">
        <header>
          <span>${stickerScopeLabel(pendingStickerImport.scope)}表情包</span>
          <h2>给模型一点图片说明</h2>
          <p>${pendingStickerImport.scope === 'user'
            ? '用户表情不会提供给角色模型，但备注会保存在本机，方便你自己管理。'
            : `备注会写入模型可读的表情包清单${character ? `，当前绑定给 ${escapeHtml(character.name)}` : ''}。`}</p>
        </header>
        <div class="sticker-import-list">
          ${pendingStickerImport.stickers.map((sticker, index) => `
            <article class="sticker-import-item">
              <img src="${escapeHtml(sticker.dataUrl)}" alt="" />
              <div>
                <label class="field">
                  <span>名称</span>
                  <input data-sticker-name-index="${index}" value="${escapeHtml(sticker.name)}" />
                </label>
                <label class="field">
                  <span>备注</span>
                  <textarea data-sticker-note-index="${index}" placeholder="例如：害羞捂脸、得意挑眉、冷淡点头">${escapeHtml(sticker.note ?? '')}</textarea>
                </label>
              </div>
            </article>
          `).join('')}
        </div>
        <footer>
          <button id="cancel-sticker-import-button" class="secondary" type="button">取消</button>
          <button id="confirm-sticker-import" class="primary" type="button">确认导入</button>
        </footer>
      </section>
    </div>
  `;
}

function updatePendingStickerImportDraftFromDom(): void {
  const pending = pendingStickerImport;
  if (!pending) return;
  pending.stickers = pending.stickers.map((sticker, index) => ({
    ...sticker,
    name: fieldValue<HTMLInputElement>(`[data-sticker-name-index="${index}"]`) || sticker.name,
    note: fieldValue<HTMLTextAreaElement>(`[data-sticker-note-index="${index}"]`),
  }));
}

function renderDesktop(character?: CharacterProfile): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  const content = state.activeView === 'moments'
    ? renderMomentsPage()
    : state.activeView === 'groups'
      ? (desktopGroupChatOpen ? renderGroupChatPage() : renderGroupListPage())
    : state.activeView === 'world'
      ? renderWorldWorkbenchPage()
      : renderChatPane(character);
  return `
    <div class="app-shell desktop-shell">
      <aside class="sidebar">
        <div class="brand-row">
          <div class="brand"><h1>PalTavern</h1><span>和角色保持联系</span></div>
          <div class="brand-actions">
            <button class="icon-button" data-open-groups aria-label="打开群聊">${icon('add')}</button>
            <button class="icon-button" id="open-settings" aria-label="打开设置">${icon('settings')}</button>
          </div>
        </div>
        <label class="world-switcher"><span>当前世界</span><select id="world-select">${worldOptions}</select></label>
        <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="搜索角色" /></label>
        ${renderPrivateChatTargetSelector()}
        ${renderDailyBriefBanner()}
        <div class="sidebar-actions">
          <button class="primary compact-file-button" data-open-authoring>写角色卡</button>
          <label class="file-button compact-file-button card-import-button">${icon('import')}<span>导入角色卡</span><input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
        </div>
        <section class="contacts-section"><div class="section-label">最近联系</div><div class="contact-list">${renderInboxConversations()}</div></section>
      </aside>
      ${content}
      ${renderGroupSettingsPanel(groupSettingsMode === 'edit' ? activeGroupChat() : undefined)}
    </div>
    ${renderSettingsCenter(character)}
  `;
}

function renderMobileSettings(character?: CharacterProfile): string {
  if (mobileSettingsDetail) {
    return `
      <main class="mobile-page mobile-settings-detail">
        <header class="mobile-topbar">
          <button class="header-back" data-settings-back aria-label="返回设置">‹</button>
          <strong>设置</strong><span></span>
        </header>
        <div class="mobile-settings-content">${renderSettingsContent(character)}</div>
      </main>
    `;
  }
  return `
      <main class="mobile-page mobile-list-page">
        <header class="mobile-page-header"><span class="eyebrow">PalTavern</span><h1>设置</h1><p>让这个世界按照你的方式运转。</p></header>
      <section class="mobile-settings-list">${renderSettingsItems()}</section>
    </main>
  `;
}

function renderMobile(character?: CharacterProfile): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  let content = '';
  if (mobileChatOpen) {
    content = renderChatPane(character, true);
  } else if (mobileGroupChatOpen) {
    content = renderGroupChatPage(true);
  } else if (mobileSection === 'groups') {
    content = renderGroupListPage(true);
  } else if (mobileSection === 'contacts') {
    content = `
      <main class="mobile-page mobile-list-page">
        <header class="mobile-page-header"><span class="eyebrow">${escapeHtml(activeWorld().name)}</span><h1>联系人</h1><p>选择一个角色，进入独立私聊。</p></header>
        <div class="mobile-list-tools">
          <label class="world-switcher"><span>当前世界</span><select id="world-select">${worldOptions}</select></label>
          <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="搜索角色" /></label>
          ${renderPrivateChatTargetSelector()}
          <button class="primary" data-open-authoring>写角色卡</button>
          <label class="file-button card-import-button">${icon('import')}<span>导入角色卡</span><input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
        </div>
        <section class="mobile-conversation-list">${renderContacts('contacts')}</section>
      </main>
    `;
  } else if (mobileSection === 'moments') {
    content = renderMomentsPage(true);
  } else if (mobileSection === 'world') {
    content = renderWorldWorkbenchPage(true);
  } else if (mobileSection === 'settings') {
    content = renderMobileSettings(character);
  } else {
    content = `
      <main class="mobile-page mobile-list-page">
        <header class="mobile-page-header mobile-inbox-header">
          ${renderPrivateChatTargetSelector() || `<div><span class="eyebrow">${escapeHtml(activeWorld().name)}</span><h1>消息</h1><p>那些想说的话，都在这里。</p></div>`}
          <div class="mobile-inbox-header-tools">
            <button class="icon-button" data-mobile-section="contacts" type="button" aria-label="搜索角色">${icon('search')}</button>
            <button class="icon-button inbox-create-group" data-open-groups type="button" aria-label="打开群聊">${icon('add')}</button>
          </div>
        </header>
        ${renderMobileCharacterStoryStrip()}
        <section class="mobile-inbox-panel mobile-inbox-private-panel">
          <div class="mobile-section-label">
            <strong>私信</strong>
            <span>今天</span>
          </div>
          <div class="mobile-conversation-list">${renderInboxConversations()}</div>
        </section>
        ${state.characters.length === 0 ? `
          <div class="mobile-empty-action">
            <button class="primary" data-open-authoring>写第一张角色卡</button>
            <label class="file-button">导入第一张角色卡<input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
          </div>
        ` : ''}
      </main>
      ${renderGroupSettingsPanel(groupSettingsMode === 'edit' ? activeGroupChat() : undefined)}
    `;
  }
  const hideNavigation = mobileChatOpen || mobileGroupChatOpen || (mobileSection === 'settings' && mobileSettingsDetail);
  return `
    <div class="mobile-shell ${hideNavigation ? 'without-bottom-nav' : ''}">
      ${content}
      ${hideNavigation ? '' : `
        <nav class="bottom-nav" aria-label="主导航">
          ${[
            ['messages', '消息', 'message'],
            ['contacts', '角色', 'contacts'],
            ['world', '世界', 'world'],
            ['moments', '动态', 'moments'],
            ['settings', '设置', 'settings'],
          ].map(([id, label, iconName]) => `
            <button class="${mobileSection === id || (mobileSection === 'groups' && id === 'messages') ? 'is-active' : ''}" data-mobile-section="${id}">
              <span class="nav-icon">${icon(iconName as IconName)}</span><small>${label}</small>
            </button>
          `).join('')}
        </nav>
      `}
    </div>
  `;
}

function modelIsReady(): boolean {
  return Boolean(state.modelConfig.apiUrl.trim() && state.modelConfig.model.trim());
}

function cardRecognitionMessages(parsed: ParsedCharacterCardFile): ModelMessage[] {
  const { character, candidates } = parsed;
  const cardContext = compactText([
    `卡名：${character.name}`,
    characterSettingsText(character),
    character.firstMessage ? `开场白：${character.firstMessage}` : '',
    character.creatorNotes ? `作者备注：${character.creatorNotes}` : '',
  ].filter(Boolean).join('\n\n'), 2600);
  const candidateList = candidates.map(candidate => ({
    id: candidate.id,
    name: candidate.name,
    source: cardCandidateSourceLabel(candidate.source),
    confidence: candidate.confidence,
    primary: candidate.isPrimary === true,
    snippet: compactText(candidate.snippet, 220),
  }));
  return [
    {
      role: 'system',
      content: [
        '你是 SillyTavern 角色卡导入助手。',
        '任务：从候选列表里判断哪些是真正应该作为独立聊天对象导入的角色。',
        '只允许选择候选列表中已有的 id，不要创造新名字。',
        '排除章节标题、设定分类、世界观概念、关系说明、空泛标签。',
        '如果这是一张单人角色卡，只选择原卡名对应的候选。',
        '只输出 JSON，不要解释。',
      ].join('\n'),
    },
    {
      role: 'user',
      content: JSON.stringify({
        outputSchema: { characterIds: ['候选 id'], reason: '一句话原因' },
        cardContext,
        candidates: candidateList,
      }, null, 2),
    },
  ];
}

function parseAiCardRecognition(raw: string, candidates: CharacterCardCandidate[]): CharacterCardCandidate[] {
  const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return [];
  }
  if (!parsed || typeof parsed !== 'object') return [];
  const record = parsed as Record<string, unknown>;
  const rawIds = Array.isArray(record.characterIds)
    ? record.characterIds
    : Array.isArray(record.ids)
      ? record.ids
      : Array.isArray(record.characters)
        ? record.characters
        : [];
  const ids = new Set<string>();
  const names = new Set<string>();
  rawIds.forEach(item => {
    if (typeof item === 'string') {
      ids.add(item);
      names.add(item.trim().toLocaleLowerCase());
      return;
    }
    if (item && typeof item === 'object') {
      const itemRecord = item as Record<string, unknown>;
      if (typeof itemRecord.id === 'string') ids.add(itemRecord.id);
      if (typeof itemRecord.name === 'string') names.add(itemRecord.name.trim().toLocaleLowerCase());
    }
  });
  return candidates.filter(candidate =>
    ids.has(candidate.id) || names.has(candidate.name.trim().toLocaleLowerCase()),
  );
}

async function importCardRecognitionWithAi(parsed: ParsedCharacterCardFile): Promise<boolean> {
  if (!modelIsReady()) return false;
  try {
    const raw = await callAuthoringModel(cardRecognitionMessages(parsed), { countBudget: true });
    const selected = parseAiCardRecognition(raw, parsed.candidates);
    if (selected.length === 0) return false;
    const characters = selected.map(candidate => characterFromCardCandidate(parsed.character, candidate));
    await importCharactersWithOpening(
      characters,
      `AI 已识别并导入 ${characters.length} 个角色：${characters.map(character => character.name).join('、')}`,
    );
    return true;
  } catch (error) {
    console.warn('AI card recognition failed:', error);
    return false;
  }
}

function cleanGeneratedIntro(value: string): string {
  return compactText(
    value
      .replace(/<\/?msg>/gi, '')
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .trim(),
    220,
  );
}

async function generateImportProfileNote(character: CharacterProfile): Promise<boolean> {
  if (!modelIsReady()) return false;
  const instruction = [
    `请只基于角色卡、人设和世界书，为「${character.name}」写一段给用户看的角色介绍。`,
    '用途：显示在角色信息和聊天页开头的浅色备注框，让用户快速知道这个角色是谁、来自哪里、主要性格/经历、当前处境，以及和 user 已有的关系背景。',
    '这不是聊天开场，不是 first_mes，不是聊天的引子；不要写“你打开聊天”“她给你发来消息”“要不要和她聊聊”等邀聊句。',
    '要求：中文，2 到 4 句，80 到 180 字；像角色小档案摘要，具体但克制。',
    '不要输出 <msg>、角色对白、标题、列表、引号、Markdown、JSON 或解释文字。',
    '不要写说话方式、语言风格或输出格式；不要代替用户行动，不要扩写成小说；设定不足时只概括已知背景和关系，不要硬编大段设定。',
  ].join('\n');
  const content = await callModel(character, instruction, true, false, undefined, { contextMessages: [] });
  const intro = cleanGeneratedIntro(content);
  if (!intro) return false;
  character.profileNote = intro;
  saveState();
  return true;
}

function cleanGeneratedPacingStrategy(value: string): string {
  return compactText(
    value
      .replace(/<\/?msg>/gi, '')
      .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
      .trim(),
    900,
  );
}

async function generateImportAutoMessagePacingStrategy(character: CharacterProfile): Promise<boolean> {
  if (!modelIsReady()) return false;
  const instruction = [
    `请只基于角色卡、人设、世界书和背景备注，为「${character.name}」写一段“主动消息节奏策略”。`,
    '用途：当角色每隔一段时间主动私聊 user 后，如果 user 没有回复，应用会参考这段自然语言决定试探、等待、降频或沉默的节奏。',
    '必须覆盖：正常主动联系倾向；连续 1 次未回复；连续 2 到 3 次未回复；连续 4 次以上未回复；关系亲近或紧张时如何微调。',
    '要求：中文，5 到 8 条短句；像给应用看的规则，不要写角色对白，不要写 JSON，不要写代码，不要输出 <msg> 标签。',
  ].join('\n');
  const content = await callModel(character, instruction, true, false);
  const strategy = cleanGeneratedPacingStrategy(content);
  if (!strategy) return false;
  character.autoMessage.pacingStrategy = strategy;
  saveState();
  return true;
}

async function importCharactersWithOpening(characters: CharacterProfile[], status: string): Promise<void> {
  if (characters.length === 0) {
    setVisibleStatus('没有选择要导入的角色。');
    render();
    return;
  }
  const importedCharacters: CharacterProfile[] = [];
  const freshCharacterIds = new Set<string>();
  for (const character of characters) {
    const existed = state.characters.some(item =>
      item.worldId === character.worldId && (item.id === character.id || item.name === character.name),
    );
    upsertCharacter(character);
    const imported = state.characters.find(item =>
      item.worldId === character.worldId && (item.id === character.id || item.name === character.name),
    );
    const stored = imported ?? character;
    if (!existed) freshCharacterIds.add(stored.id);
    importedCharacters.push(stored);
  }
  state.activeCharacterId = importedCharacters[0]?.id ?? characters[0].id;
  saveState();
  setVisibleStatus(status);
  render();
  if (modelIsReady()) {
    for (const character of importedCharacters) {
      if (character.profileNote?.trim()) continue;
      try {
        setVisibleStatus(`正在为 ${character.name} 生成背景故事备注…`);
        render();
        await generateImportProfileNote(character);
      } catch (error) {
        console.warn(`Failed to generate import profile note for ${character.name}:`, error);
      }
    }
    for (const character of importedCharacters) {
      const shouldGenerate = freshCharacterIds.has(character.id)
        || !character.autoMessage.pacingStrategy?.trim()
        || character.autoMessage.pacingStrategy === DEFAULT_AUTO_MESSAGE_PACING_STRATEGY;
      if (!shouldGenerate) continue;
      try {
        setVisibleStatus(`正在为 ${character.name} 生成主动消息节奏策略…`);
        render();
        await generateImportAutoMessagePacingStrategy(character);
      } catch (error) {
        console.warn(`Failed to generate auto message pacing strategy for ${character.name}:`, error);
      }
    }
  }
  await generateOpeningMessage(importedCharacters[0] ?? characters[0], render);
}

async function inviteInterestedCharacters(momentId: string): Promise<void> {
  const moment = state.moments.find(item => item.id === momentId);
  if (!moment || !modelIsReady()) return;
  const visibleCharacters = state.characters.filter(character =>
    character.worldId === moment.worldId
    && character.id !== moment.characterId
    && canCharacterViewMoment(moment, character),
  );
  if (visibleCharacters.length === 0) return;
  autoCommentingMomentIds.add(momentId);
  render();
  const result = await spreadMomentInteractions(momentId, {
    maxInterestedComments: 2,
    allowAuthorReplies: true,
    countBudget: true,
  });
  autoCommentingMomentIds.delete(momentId);
  momentGenerationStatus = result.interestedCommentCount > 0
    ? `${result.interestedCommentCount} 位角色回应了这条动态${result.authorReplyCount > 0 ? `，楼主回了 ${result.authorReplyCount} 条。` : '。'}`
    : '角色们看过了，暂时没人想评论。';
  setStatusText(momentGenerationStatus);
  render();
}

async function replyToUserComment(momentId: string, commentId?: string): Promise<void> {
  const moment = state.moments.find(item => item.id === momentId);
  const character = moment?.characterId
    ? state.characters.find(item => item.id === moment.characterId)
    : undefined;
  if (!moment || !character || !modelIsReady() || autoCommentingMomentIds.has(momentId)) return;
  autoCommentingMomentIds.add(momentId);
  render();
  try {
    await generateCharacterComment(moment, character, { countBudget: true, targetCommentId: commentId });
    setStatusText(`${character.name} 回复了你的评论。`);
  } catch (error) {
    setStatusText(`${character.name} 回复失败：${error instanceof Error ? error.message : String(error)}`);
  } finally {
    autoCommentingMomentIds.delete(momentId);
    render();
  }
}

function scrollMessagesToBottom(): void {
  const messages = document.querySelector<HTMLElement>('.messages, .group-messages, .world-workbench-scroll');
  if (!messages) return;
  messages.scrollTop = messages.scrollHeight;
}

function isChatScrollNearBottom(container = document.querySelector<HTMLElement>('.messages, .group-messages, .world-workbench-scroll')): boolean {
  if (!container) return true;
  return container.scrollHeight - container.scrollTop - container.clientHeight < 140;
}

function requestChatStickToBottom(): void {
  shouldStickChatToBottom = true;
}

function preserveScrollForNextRender(): void {
  pendingScrollRestore = captureScrollSnapshot() ?? pendingScrollRestore;
}

function closeMessageActionMenuInPlace(): void {
  messageActionId = '';
  document.querySelectorAll<HTMLElement>('.message.actions-open-above, .message.actions-open-below').forEach(message => {
    message.classList.remove('actions-open-above', 'actions-open-below');
  });
  document.querySelectorAll<HTMLElement>('.message-actions').forEach(menu => {
    menu.remove();
  });
}

function closeGroupMessageActionMenuInPlace(): void {
  groupMessageActionId = '';
  document.querySelectorAll<HTMLElement>('.group-message.is-actions-open').forEach(message => {
    message.classList.remove('is-actions-open');
  });
  document.querySelectorAll<HTMLElement>('.group-message-actions').forEach(menu => {
    menu.remove();
  });
}

function resizeComposerTextarea(textarea = document.querySelector<HTMLTextAreaElement>('#message-input')): void {
  if (!textarea) return;
  textarea.style.height = '0px';
  const nextHeight = Math.min(Math.max(textarea.scrollHeight, 42), 126);
  textarea.style.height = `${nextHeight}px`;
  textarea.style.overflowY = textarea.scrollHeight > 126 ? 'auto' : 'hidden';
}

function shouldSubmitTextareaOnEnter(event: KeyboardEvent): boolean {
  return state.enterToSend
    && event.key === 'Enter'
    && !event.shiftKey
    && !event.ctrlKey
    && !event.altKey
    && !event.metaKey
    && !event.isComposing;
}

function requestTextareaFormSubmit(textarea: HTMLTextAreaElement, event: KeyboardEvent): void {
  if (!shouldSubmitTextareaOnEnter(event)) return;
  event.preventDefault();
  textarea.form?.requestSubmit();
}

function requestTextareaFormSubmitFromBeforeInput(textarea: HTMLTextAreaElement, event: InputEvent): void {
  if (!state.enterToSend || event.inputType !== 'insertLineBreak' || event.isComposing) return;
  event.preventDefault();
  textarea.form?.requestSubmit();
}

function canRefocusComposerInput(input: HTMLTextAreaElement): boolean {
  const active = document.activeElement as HTMLElement | null;
  if (!active || active === document.body || active === input) return true;
  return Boolean(active.closest('#composer, #group-composer, #world-rp-composer, .chat-composer-area'));
}

function focusComposerInputForKeyboard(input: HTMLTextAreaElement): void {
  input.focus({ preventScroll: true });
  try {
    input.setSelectionRange(input.value.length, input.value.length);
  } catch {
    // Mobile browsers can reject selection updates while the IME is settling.
  }
  resizeComposerTextarea(input);
  updateKeyboardOffset();
}

function runDelayedMessageComposerFocus(characterId: string): void {
  if (!messageComposerFocusKeepalive || messageComposerFocusKeepalive.characterId !== characterId) return;
  if (Date.now() > messageComposerFocusKeepalive.until) {
    messageComposerFocusKeepalive = null;
    return;
  }
  if ((activeCharacter()?.id ?? '') !== characterId) return;
  const input = document.querySelector<HTMLTextAreaElement>('#message-input, #world-rp-input');
  if (!input || !canRefocusComposerInput(input)) return;
  focusComposerInputForKeyboard(input);
}

function runDelayedGroupComposerFocus(chatId: string): void {
  if (!groupComposerFocusKeepalive || groupComposerFocusKeepalive.chatId !== chatId) return;
  if (Date.now() > groupComposerFocusKeepalive.until) {
    groupComposerFocusKeepalive = null;
    return;
  }
  if ((activeGroupChat()?.id ?? '') !== chatId) return;
  const input = document.querySelector<HTMLTextAreaElement>('#group-message-input');
  if (!input || !canRefocusComposerInput(input)) return;
  focusComposerInputForKeyboard(input);
}

function requestMessageComposerFocusAfterSubmit(characterId: string): void {
  if (!characterId) return;
  focusMessageInputAfterRenderCharacterId = characterId;
  messageComposerFocusKeepalive = { characterId, until: Date.now() + COMPOSER_FOCUS_KEEPALIVE_MS };
  COMPOSER_FOCUS_RETRY_DELAYS.forEach(delay => {
    window.setTimeout(() => runDelayedMessageComposerFocus(characterId), delay);
  });
}

function requestGroupComposerFocusAfterSubmit(chatId: string): void {
  if (!chatId) return;
  focusGroupInputAfterRenderChatId = chatId;
  groupComposerFocusKeepalive = { chatId, until: Date.now() + COMPOSER_FOCUS_KEEPALIVE_MS };
  COMPOSER_FOCUS_RETRY_DELAYS.forEach(delay => {
    window.setTimeout(() => runDelayedGroupComposerFocus(chatId), delay);
  });
}

function focusPendingMessageComposer(): boolean {
  const keepaliveCharacterId = messageComposerFocusKeepalive && Date.now() <= messageComposerFocusKeepalive.until
    ? messageComposerFocusKeepalive.characterId
    : '';
  const targetCharacterId = focusMessageInputAfterRenderCharacterId || keepaliveCharacterId;
  if (!targetCharacterId) return false;
  const character = activeCharacter();
  if ((character?.id ?? '') !== targetCharacterId) {
    focusMessageInputAfterRenderCharacterId = '';
    messageComposerFocusKeepalive = null;
    return false;
  }
  const input = document.querySelector<HTMLTextAreaElement>('#message-input, #world-rp-input');
  const keepaliveActive = Boolean(messageComposerFocusKeepalive && Date.now() <= messageComposerFocusKeepalive.until);
  if (!keepaliveActive) focusMessageInputAfterRenderCharacterId = '';
  if (!input) return false;
  if (!canRefocusComposerInput(input)) {
    focusMessageInputAfterRenderCharacterId = '';
    messageComposerFocusKeepalive = null;
    return false;
  }
  focusComposerInputForKeyboard(input);
  if (keepaliveActive) {
    focusMessageInputAfterRenderCharacterId = targetCharacterId;
    COMPOSER_FOCUS_RETRY_DELAYS.forEach(delay => {
      window.setTimeout(() => runDelayedMessageComposerFocus(targetCharacterId), delay);
    });
  }
  return true;
}

function focusPendingGroupComposer(): boolean {
  const keepaliveChatId = groupComposerFocusKeepalive && Date.now() <= groupComposerFocusKeepalive.until
    ? groupComposerFocusKeepalive.chatId
    : '';
  const targetChatId = focusGroupInputAfterRenderChatId || keepaliveChatId;
  if (!targetChatId) return false;
  const chat = activeGroupChat();
  if ((chat?.id ?? '') !== targetChatId) {
    focusGroupInputAfterRenderChatId = '';
    groupComposerFocusKeepalive = null;
    return false;
  }
  const input = document.querySelector<HTMLTextAreaElement>('#group-message-input');
  const keepaliveActive = Boolean(groupComposerFocusKeepalive && Date.now() <= groupComposerFocusKeepalive.until);
  if (!keepaliveActive) focusGroupInputAfterRenderChatId = '';
  if (!input) return false;
  if (!canRefocusComposerInput(input)) {
    focusGroupInputAfterRenderChatId = '';
    groupComposerFocusKeepalive = null;
    return false;
  }
  focusComposerInputForKeyboard(input);
  if (keepaliveActive) {
    focusGroupInputAfterRenderChatId = targetChatId;
    COMPOSER_FOCUS_RETRY_DELAYS.forEach(delay => {
      window.setTimeout(() => runDelayedGroupComposerFocus(targetChatId), delay);
    });
  }
  return true;
}

function focusPendingMomentComment(): boolean {
  if (!focusMomentCommentAfterRenderId) return false;
  const momentId = focusMomentCommentAfterRenderId;
  focusMomentCommentAfterRenderId = '';
  const input = Array.from(document.querySelectorAll<HTMLInputElement>('[data-comment-input]'))
    .find(item => item.dataset.commentInput === momentId);
  if (!input) return false;
  input.focus({ preventScroll: true });
  input.setSelectionRange(input.value.length, input.value.length);
  return true;
}

function keepMomentComposerVisible(): void {
  const composer = document.querySelector<HTMLElement>('.moments-publisher.is-open');
  if (!composer) return;
  window.requestAnimationFrame(() => {
    composer.dataset.keyboardAdjustedAt = String(Date.now());
  });
}

function setMomentComposerKeyboardFocus(active: boolean): void {
  const touchLike = window.matchMedia('(pointer: coarse)').matches;
  document.documentElement.classList.toggle(
    'moment-composer-keyboard-focus',
    active && (compactMedia.matches || touchLike),
  );
}

function updateKeyboardOffset(): void {
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

function installVisualViewportListener(): void {
  if (visualViewportListenerInstalled) return;
  visualViewportListenerInstalled = true;
  window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
  window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);
  window.addEventListener('resize', updateKeyboardOffset);
  updateKeyboardOffset();
}

export function render(): void {
  clearPendingIdleRender();
  const inputSnapshot = captureMessageInputFocus();
  const groupInputSnapshot = captureGroupMessageInputFocus();
  const momentInputSnapshot = captureMomentInputFocus();
  const wasNearChatBottom = isChatScrollNearBottom();
  const preRenderScroll = captureScrollSnapshot();
  if (isAuthoringOpen()) {
    appRoot.innerHTML = renderAuthoringScreen();
    bindAuthoringUi(render);
    return;
  }
  if (state.activeView === 'groups' && !compactMedia.matches && !activeGroupChat()) {
    desktopGroupChatOpen = false;
  }
  if (mobileGroupChatOpen && !activeGroupChat()) mobileGroupChatOpen = false;
  const character = activeCharacter();
  const onboardingLayer = welcomeCoverOpen
    ? renderWelcomeCover()
    : `${renderModelOnboarding()}${renderTimeModeOnboarding()}${renderChatReplyModeOnboarding()}`;
  appRoot.innerHTML = `${compactMedia.matches ? renderMobile(character) : renderDesktop(character)}${renderGlobalStatus()}${onboardingLayer}${renderCardRecognitionDialog()}${renderStickerImportDialog()}`;
  applyCharacterAccent(character);
  bindUi();
  installVisualViewportListener();
  installUiSessionPersistence();
  const immediateForcedMessageFocus = focusPendingMessageComposer();
  const immediateForcedGroupFocus = focusPendingGroupComposer();
  window.requestAnimationFrame(() => {
    const restoredInput = restoreMessageInputFocus(inputSnapshot);
    const restoredGroupInput = restoreGroupMessageInputFocus(groupInputSnapshot);
    const restoredMomentInput = restoreMomentInputFocus(momentInputSnapshot);
    resizeComposerTextarea();
    const forcedMessageFocus = immediateForcedMessageFocus || focusPendingMessageComposer();
    const forcedGroupFocus = immediateForcedGroupFocus || focusPendingGroupComposer();
    focusPendingMomentComment();
    const restoredScroll = restoreScrollIfNeeded() || restoreActionMenuAnchorIfNeeded();
    if (state.activeView === 'chat' || mobileChatOpen || state.activeView === 'groups' || mobileGroupChatOpen || state.activeView === 'world' || mobileSection === 'world') {
      if (!restoredScroll) {
        const shouldScrollToBottom = shouldStickChatToBottom
          || (wasNearChatBottom && !messageActionId && !groupMessageActionId);
        shouldStickChatToBottom = false;
        if (shouldScrollToBottom) {
          scrollMessagesToBottom();
          if (restoredInput || restoredGroupInput || forcedMessageFocus || forcedGroupFocus) window.setTimeout(scrollMessagesToBottom, 80);
        } else {
          applyScrollSnapshot(preRenderScroll);
        }
      }
    }
    if (restoredMomentInput) window.setTimeout(keepMomentComposerVisible, 80);
    scheduleUiSessionSnapshotSave();
  });
  if (!mediaListenerInstalled) {
    compactMedia.addEventListener('change', () => render());
    mediaListenerInstalled = true;
  }
  if (!mobileHistoryInstalled) {
    window.history.replaceState({ ...(window.history.state ?? {}), tavernSocialRoot: true }, '');
    window.addEventListener('popstate', () => {
      if (closeMobileLayer()) {
        render();
        window.setTimeout(ensureMobileHistoryForState, 0);
      }
    });
    mobileHistoryInstalled = true;
  }
  if (!mobileNativeBackInstalled) {
    window.addEventListener('tavern-social-android-back', event => {
      if (hasMobileBackTarget()) {
        event.preventDefault();
        backMobileLayer();
        return;
      }
      if (closeMobileLayer()) {
        event.preventDefault();
        render();
        window.setTimeout(ensureMobileHistoryForState, 0);
      }
    });
    mobileNativeBackInstalled = true;
  }
  ensureMobileHistoryForState();
}

// 大注释：后台调度只能在输入框空闲时刷新界面；否则手机键盘会被重建的 DOM 打断，未保存的文字也可能被旧状态覆盖。
export function renderWhenChatInputIdle(): void {
  const active = document.activeElement;
  const input = active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement ? active : null;
  const protectedUnsavedForm = input?.closest(
    '.authoring-screen, .sticker-import-dialog, .settings-dialog, .settings-content, .mobile-settings-content, .world-gear-panel, .world-persona-select, .event-composer-dialog, .message-edit-dialog, .event-manual-result, .timeline-note-form, .group-settings-panel, .character-panel',
  );
  const isProtectedInput = input
    && (
      input.id === 'message-input'
      || input.id === 'group-message-input'
      || input.id === 'world-rp-input'
      || input.id === 'moment-input'
      || input.id === 'timeline-note-input'
      || Boolean(input.dataset.commentInput)
      || Boolean(input.dataset.eventManualInput)
      || Boolean(protectedUnsavedForm)
    );
  if (!input || !isProtectedInput) {
    render();
    return;
  }
  if (input.id === 'message-input') {
    setMessageDraft(activeCharacter(), input.value);
  } else if (input.id === 'group-message-input') {
    setGroupMessageDraft(activeGroupChat(), input.value);
  } else if (input.id === 'world-rp-input') {
    worldRpInputDraft = input.value;
  } else if (input.id === 'moment-input') {
    momentComposerTextDraft = input.value;
  } else if (input.id === 'timeline-note-input') {
    timelineNoteDraft = input.value;
    return;
    // 小注释：世界记忆表单保存时会直接读取 DOM，后台调度不需要在失焦后补一轮刷新。
    return;
  } else if (input.dataset.commentInput) {
    momentCommentDrafts.set(input.dataset.commentInput, input.value);
  } else if (input.closest('.sticker-import-dialog')) {
    updatePendingStickerImportDraftFromDom();
  } else if (input.closest('.event-composer-dialog')) {
    captureEventComposerDraftFromDom();
    return;
    // 小注释：事件弹窗是未提交表单，调度刷新必须被吞掉，否则移动端键盘会被弹窗重建打断。
    return;
  } else if (input.dataset.eventManualInput) {
    return;
    // 小注释：事件结果框尚未落盘前没有安全草稿缓存，所以输入时只阻止调度刷新。
    return;
  } else {
    return;
    // 小注释：设置、角色、事件等表单没有统一草稿缓存，窗口失焦时不能让后台调度触发重渲染清空内容。
    return;
  }
  if (pendingIdleRender) return;
  pendingIdleRender = true;
  pendingIdleInput = input;
  pendingIdleRenderFlush = () => {
    clearPendingIdleRender();
    render();
  };
  input.addEventListener('blur', pendingIdleRenderFlush, { once: true });
}

function bindUi(): void {
  installMessageProfileOutsideCloser();
  appRoot.onclick = event => {
    if (!messageProfileCharacterId) return;
    const target = event.target as HTMLElement | null;
    if (
      target?.closest('.message-profile-popover')
      || target?.closest('[data-message-profile-character]')
    ) {
      return;
    }
    closeMessageProfilePopover();
  };
  const openMomentsTutorialIfNeeded = () => {
    if (localStorage.getItem(MOMENTS_TUTORIAL_KEY) !== 'done') momentsTutorialOpen = true;
  };
  const closeMomentsTutorial = () => {
    localStorage.setItem(MOMENTS_TUTORIAL_KEY, 'done');
    momentsTutorialOpen = false;
    render();
  };
  document.querySelector<HTMLButtonElement>('#open-moments-tutorial')?.addEventListener('click', () => {
    momentsTutorialOpen = true;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-close-moments-tutorial]').forEach(button => {
    button.addEventListener('click', closeMomentsTutorial);
  });
  document.querySelector<HTMLButtonElement>('#open-moment-composer')?.addEventListener('click', () => {
    momentGenerationStatus = '';
    momentComposerOpen = true;
    render();
    document.querySelector<HTMLTextAreaElement>('#moment-input')?.focus();
    window.setTimeout(keepMomentComposerVisible, 80);
  });
  const closeMomentComposer = () => {
    captureVisibleDraftsFromDom();
    momentComposerOpen = false;
    momentGenerationStatus = '';
    setMomentComposerKeyboardFocus(false);
    saveUiSessionSnapshot();
    render();
  };
  document.querySelector<HTMLButtonElement>('#close-moment-composer')?.addEventListener('click', closeMomentComposer);
  document.querySelector<HTMLButtonElement>('#close-moment-composer-backdrop')?.addEventListener('click', closeMomentComposer);
  if (messageActionId) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.message-actions')) return;
      closeMessageActionMenuInPlace();
    }, { capture: true, once: true });
  }
  document.querySelectorAll<HTMLElement>('.message').forEach(message => {
    const copy = message.querySelector<HTMLElement>('.message-copy');
    const quote = message.querySelector<HTMLElement>('.message-quote');
    const sticker = message.querySelector<HTMLImageElement>('img');
    const applyContentHeight = () => {
      const copyHeight = copy?.getBoundingClientRect().height ?? 0;
      const quoteHeight = quote?.getBoundingClientRect().height ?? 0;
      const stickerHeight = sticker?.getBoundingClientRect().height ?? 0;
      const contentHeight = stickerHeight || copyHeight;
      const quoteGap = quoteHeight > 0 && contentHeight > 0 ? 7 : 0;
      const verticalPadding = message.classList.contains('sticker-message') ? 8 : 16;
      message.style.height = `${Math.ceil(quoteHeight + quoteGap + contentHeight + verticalPadding)}px`;
    };
    applyContentHeight();
    if (sticker && !sticker.complete) sticker.addEventListener('load', applyContentHeight, { once: true });
  });
  bindDraftManager(render);
  document.querySelector<HTMLButtonElement>('#enter-welcome-cover')?.addEventListener('click', () => {
    markWelcomeCoverSeen();
    welcomeCoverOpen = false;
    render();
  });
  const completeModelOnboarding = () => {
    localStorage.setItem(MODEL_ONBOARDING_KEY, 'done');
    modelOnboardingOpen = false;
    modelListStatus = '';
    modelListError = false;
  };
  const bindModelProviderFields = (
    providerSelector: string,
    apiUrlSelector: string,
    onChange: (provider: ModelProvider, apiUrl: string) => void,
  ) => {
    const providerSelect = document.querySelector<HTMLSelectElement>(providerSelector);
    const apiUrlInput = document.querySelector<HTMLInputElement>(apiUrlSelector);
    providerSelect?.addEventListener('change', () => {
      const provider = modelProviderValue(providerSelect.value);
      const apiUrl = apiUrlForProvider(provider, apiUrlInput?.value ?? '');
      if (apiUrlInput) apiUrlInput.value = apiUrl;
      onChange(provider, apiUrl);
    });
    apiUrlInput?.addEventListener('input', () => {
      const apiUrl = apiUrlInput.value;
      if (providerSelect?.value === 'deepseek' && modelProviderFor(apiUrl) === 'custom') {
        providerSelect.value = 'custom';
      }
      onChange(modelProviderValue(providerSelect?.value), apiUrl);
    });
  };
  bindModelProviderFields('#onboarding-model-provider', '#onboarding-api-url', (provider, apiUrl) => {
    modelOnboardingDraft.provider = provider;
    modelOnboardingDraft.apiUrl = apiUrl;
  });
  bindModelProviderFields('#model-provider', '#api-url', (provider, apiUrl) => {
    const config = modelFormDraft ?? state.modelConfig;
    modelFormDraft = {
      provider,
      apiUrl,
      apiKey: document.querySelector<HTMLInputElement>('#api-key')?.value ?? config.apiKey,
      model: document.querySelector<HTMLInputElement>('#model-name')?.value ?? config.model,
      temperature: Number(document.querySelector<HTMLInputElement>('#temperature')?.value || config.temperature || 0.75),
      dailyRequestLimit: Math.max(1, Math.floor(Number(document.querySelector<HTMLInputElement>('#daily-request-limit')?.value || config.dailyRequestLimit || 100))),
    };
  });
  bindCompanionTimeControls('settings');
  bindCompanionTimeControls('onboarding');
  document.querySelector<HTMLButtonElement>('#skip-model-onboarding')?.addEventListener('click', () => {
    completeModelOnboarding();
    render();
  });
  document.querySelector<HTMLButtonElement>('#onboarding-fetch-models')?.addEventListener('click', () => {
    if (modelListLoading) return;
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#onboarding-model-provider')?.value);
    modelOnboardingDraft = {
      provider,
      apiUrl: apiUrlForProvider(provider, fieldValue('#onboarding-api-url')),
      apiKey: fieldValue('#onboarding-api-key'),
      model: fieldValue('#onboarding-model-name'),
    };
    if (!modelOnboardingDraft.apiUrl) {
      modelListStatus = '请先填写 API 地址。';
      modelListError = true;
      render();
      return;
    }
    modelListLoading = true;
    modelListError = false;
    modelListStatus = '正在连接服务并读取模型列表…';
    render();
    void fetchModelList(modelOnboardingDraft.apiUrl, modelOnboardingDraft.apiKey)
      .then(models => {
        discoveredModels = models;
        modelOnboardingDraft.model = models.includes(modelOnboardingDraft.model)
          ? modelOnboardingDraft.model
          : models[0] ?? '';
        modelListStatus = `已读取 ${models.length} 个模型，请确认选择后保存。`;
        modelListError = false;
      })
      .catch(error => {
        discoveredModels = [];
        modelListStatus = error instanceof Error ? error.message : String(error);
        modelListError = true;
      })
      .finally(() => {
        modelListLoading = false;
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#onboarding-test-model-connection')?.addEventListener('click', () => {
    if (modelConnectionTesting || modelListLoading) return;
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#onboarding-model-provider')?.value);
    modelOnboardingDraft = {
      provider,
      apiUrl: apiUrlForProvider(provider, fieldValue('#onboarding-api-url')),
      apiKey: fieldValue('#onboarding-api-key'),
      model: fieldValue('#onboarding-model-name'),
    };
    const apiUrlInput = document.querySelector<HTMLInputElement>('#onboarding-api-url');
    if (apiUrlInput) apiUrlInput.value = modelOnboardingDraft.apiUrl;
    modelConnectionTesting = true;
    modelListError = false;
    modelListStatus = '正在测试模型连接…';
    const fetchButton = document.querySelector<HTMLButtonElement>('#onboarding-fetch-models');
    const button = document.querySelector<HTMLButtonElement>('#onboarding-test-model-connection');
    const status = document.querySelector<HTMLElement>('#onboarding-model-status');
    if (fetchButton) fetchButton.disabled = true;
    if (button) {
      button.disabled = true;
      button.textContent = '正在测试…';
    }
    if (status) status.textContent = modelListStatus;
    void testModelConnection({
      apiUrl: apiUrlForProvider(provider, fieldValue('#onboarding-api-url')),
      apiKey: fieldValue('#onboarding-api-key'),
      model: fieldValue('#onboarding-model-name'),
    })
      .then(result => {
        modelListStatus = `连接成功：模型已返回「${result.preview}」。`;
        modelListError = false;
      })
      .catch(error => {
        modelListStatus = error instanceof Error ? error.message : String(error);
        modelListError = true;
      })
      .finally(() => {
        modelConnectionTesting = false;
        render();
      });
  });
  document.querySelector<HTMLSelectElement>('#onboarding-model-select')?.addEventListener('change', event => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (!value) return;
    modelOnboardingDraft.model = value;
    const input = document.querySelector<HTMLInputElement>('#onboarding-model-name');
    if (input) input.value = value;
  });
  document.querySelector<HTMLButtonElement>('#save-model-onboarding')?.addEventListener('click', () => {
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#onboarding-model-provider')?.value);
    modelOnboardingDraft = {
      provider,
      apiUrl: apiUrlForProvider(provider, fieldValue('#onboarding-api-url')),
      apiKey: fieldValue('#onboarding-api-key'),
      model: fieldValue('#onboarding-model-name'),
    };
    if (!modelOnboardingDraft.apiUrl || !modelOnboardingDraft.model) {
      modelListStatus = '请填写 API 地址并选择或输入模型名称。';
      modelListError = true;
      render();
      return;
    }
    state.modelConfig = {
      ...state.modelConfig,
      ...modelOnboardingDraft,
    };
    saveState();
    completeModelOnboarding();
    setStatusText('模型连接已保存，可以开始聊天了。');
    render();
    const character = activeCharacter();
    if (character) void generateOpeningMessage(character, render);
  });
  document.querySelector<HTMLButtonElement>('#save-time-mode-onboarding')?.addEventListener('click', () => {
    state.companionTimeMode = selectedCompanionTimeMode('onboarding');
    state.virtualTimeMinutes = companionTimeMinutesFromFields('onboarding');
    localStorage.setItem(TIME_MODE_ONBOARDING_KEY, 'done');
    timeModeOnboardingOpen = false;
    saveState();
    setStatusText(state.companionTimeMode === 'virtual'
      ? `已启用虚拟时间：${formatClockMinutes(state.virtualTimeMinutes)}。`
      : '已启用系统时间陪伴。');
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-chat-reply-mode-choice]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.chatReplyModeChoice === 'manual' ? 'manual' : 'auto';
      state.chatReplyMode = mode;
      localStorage.setItem(CHAT_REPLY_MODE_ONBOARDING_KEY, 'done');
      chatReplyModeOnboardingOpen = false;
      saveState();
      setStatusText(mode === 'manual'
        ? '已切到短消息模式：连发几条后，点生成让角色回复。'
        : '已切到长消息模式：发送后角色会自动回复。');
      render();
    });
  });
  const closeCardRecognition = () => {
    pendingCardRecognition = null;
    setStatusText('已取消这次角色卡导入。');
    render();
  };
  document.querySelector<HTMLButtonElement>('#cancel-card-recognition')?.addEventListener('click', closeCardRecognition);
  document.querySelector<HTMLButtonElement>('#import-original-card')?.addEventListener('click', () => {
    const pending = pendingCardRecognition;
    if (!pending) return;
    pendingCardRecognition = null;
    void importCharactersWithOpening([pending.character], `已按整张卡导入：${pending.character.name}`);
  });
  document.querySelector<HTMLButtonElement>('#import-all-recognized')?.addEventListener('click', () => {
    const pending = pendingCardRecognition;
    if (!pending) return;
    const characters = pending.candidates.map(candidate => characterFromCardCandidate(pending.character, candidate));
    pendingCardRecognition = null;
    void importCharactersWithOpening(
      characters,
      `已导入 ${characters.length} 个识别角色：${characters.map(character => character.name).join('、')}`,
    );
  });
  document.querySelector<HTMLButtonElement>('#import-selected-recognized')?.addEventListener('click', () => {
    const pending = pendingCardRecognition;
    if (!pending) return;
    const selectedIds = new Set(Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="recognized-character"]:checked'),
    ).map(input => input.value));
    const selected = pending.candidates.filter(candidate => selectedIds.has(candidate.id));
    if (selected.length === 0) {
      setStatusText('请至少选择一个要导入的角色。');
      render();
      return;
    }
    const characters = selected.map(candidate => characterFromCardCandidate(pending.character, candidate));
    pendingCardRecognition = null;
    void importCharactersWithOpening(
      characters,
      `已导入 ${characters.length} 个识别角色：${characters.map(character => character.name).join('、')}`,
    );
  });
  const closeStickerImport = () => {
    pendingStickerImport = null;
    setStatusText('已取消这次表情包导入。');
    render();
  };
  document.querySelector<HTMLButtonElement>('#cancel-sticker-import')?.addEventListener('click', closeStickerImport);
  document.querySelector<HTMLButtonElement>('#cancel-sticker-import-button')?.addEventListener('click', closeStickerImport);
  document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('[data-sticker-name-index], [data-sticker-note-index]').forEach(input => {
    input.addEventListener('input', () => {
      updatePendingStickerImportDraftFromDom();
      scheduleUiSessionSnapshotSave();
    });
  });
  document.querySelector<HTMLButtonElement>('#confirm-sticker-import')?.addEventListener('click', () => {
    const pending = pendingStickerImport;
    if (!pending) return;
    updatePendingStickerImportDraftFromDom();
    const stickers = pending.stickers.map((sticker, index) => ({
      ...sticker,
      name: fieldValue<HTMLInputElement>(`[data-sticker-name-index="${index}"]`) || sticker.name,
      note: fieldValue<HTMLTextAreaElement>(`[data-sticker-note-index="${index}"]`),
    }));
    if (pending.scope === 'character') {
      const character = state.characters.find(item => item.id === pending.characterId);
      if (!character) {
        pendingStickerImport = null;
        setStatusText('找不到要绑定表情包的角色。');
        render();
        return;
      }
      character.stickers = [...(character.stickers ?? []), ...stickers];
      saveState();
      setStatusText(`已为 ${character.name} 导入 ${stickers.length} 个角色专属表情包。`);
    } else {
      const target = pending.scope === 'common' ? state.commonStickers : state.userStickers;
      target.push(...stickers);
      saveState();
      setStatusText(`已导入 ${stickers.length} 个${pending.scope === 'common' ? '通用' : '用户'}表情包。`);
    }
    pendingStickerImport = null;
    render();
  });
  const openSettings = () => {
    momentComposerOpen = false;
    momentGenerationStatus = '';
    if (compactMedia.matches) {
      mobileSection = 'settings';
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      desktopGroupChatOpen = false;
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      mobileSettingsDetail = false;
      pushMobileHistory('section');
    } else {
      settingsOpen = true;
    }
    render();
  };
  document.querySelector<HTMLButtonElement>('#open-settings')?.addEventListener('click', openSettings);
  document.querySelector<HTMLButtonElement>('#open-settings-bottom')?.addEventListener('click', openSettings);
  document.querySelector<HTMLButtonElement>('#open-settings-header')?.addEventListener('click', openSettings);
  const openCharacterPanel = (page: CharacterPanelPage = 'worldbook') => {
    if (!activeCharacter()) return;
    characterPanelOpen = true;
    characterPanelPage = page;
    render();
  };
  document.querySelector<HTMLButtonElement>('#open-character-profile')?.addEventListener('click', () => openCharacterPanel('status'));
  document.querySelector<HTMLButtonElement>('#open-character-panel')?.addEventListener('click', () => openCharacterPanel('worldbook'));
  document.querySelectorAll<HTMLButtonElement>('[data-chat-status-shelf]').forEach(button => {
    button.addEventListener('click', () => {
      const characterId = button.dataset.chatStatusShelf ?? '';
      if (!characterId) return;
      if (chatStatusShelfOpenCharacterIds.has(characterId)) {
        chatStatusShelfOpenCharacterIds.delete(characterId);
      } else {
        chatStatusShelfOpenCharacterIds.add(characterId);
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-character-status]').forEach(button => {
    button.addEventListener('click', () => {
      const characterId = button.dataset.openCharacterStatus ?? '';
      const character = state.characters.find(item => item.id === characterId && item.worldId === activeWorld().id);
      if (character) {
        state.activeCharacterId = character.id;
        characterPanelOpen = true;
        characterPanelPage = 'status';
        closeMessageProfilePopover();
      }
      render();
    });
  });
  const closeCharacterPanel = () => {
    characterPanelOpen = false;
    render();
  };
  document.querySelector<HTMLButtonElement>('#close-character-panel')?.addEventListener('click', closeCharacterPanel);
  document.querySelector<HTMLButtonElement>('#close-character-panel-backdrop')?.addEventListener('click', closeCharacterPanel);
  document.querySelectorAll<HTMLButtonElement>('[data-character-panel-page]').forEach(button => {
    button.addEventListener('click', () => {
      characterPanelPage = (button.dataset.characterPanelPage as CharacterPanelPage | undefined) ?? 'worldbook';
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#add-character-worldbook-entry')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    appendCharacterWorldBookEntry(character);
    saveState();
    setStatusText(`已为 ${character.name} 新增世界书条目。`);
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-character-worldbook-entry]').forEach(button => {
    button.addEventListener('click', () => {
      const character = activeCharacter();
      const entryId = button.dataset.deleteCharacterWorldbookEntry;
      if (!character || !entryId) return;
      deleteCharacterWorldBookEntry(character, entryId);
      saveState();
      setStatusText(`已删除 ${character.name} 的这个世界书条目。`);
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#refresh-character-status')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    refreshCharacterStatusSummary(character);
    setStatusText(`${character.name} 的状态摘要已刷新。`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#refresh-character-plan')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    if (!modelIsReady()) {
      setStatusText('请先到“设置 -> 模型连接”配置模型，再刷新角色当前计划。');
      render();
      return;
    }
    setStatusText(`正在刷新 ${character.name} 的当前计划…`);
    render();
    void refreshCharacterCurrentPlan(character, true)
      .then(() => {
        setStatusText(`${character.name} 的当前计划已刷新。`);
      })
      .catch(error => {
        setStatusText(error instanceof Error ? error.message : String(error));
      })
      .finally(() => render());
  });
  document.querySelector<HTMLButtonElement>('#save-character-panel')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    character.profileNote = fieldValue<HTMLTextAreaElement>('#character-profile-note');
    character.relationship.affinity = Math.max(0, Math.round(finiteNumber(fieldValue('#character-affinity-free'), character.relationship.affinity)));
    character.relationship.updatedAt = Date.now();
    updateCharacterCardDetails(character, {
      name: fieldValue('#character-panel-name'),
      settings: fieldValue<HTMLTextAreaElement>('#character-panel-worldbook'),
    });
    setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());
    saveState();
    state.activeCharacterId = character.id;
    setStatusText(`${character.name} 的背景故事备注、好感度和世界书已保存。`);
    render();
  });
  document.querySelector<HTMLInputElement>('#character-panel-avatar-import')?.addEventListener('change', event => {
    void handleCharacterAvatarInput(event.currentTarget as HTMLInputElement);
  });
  document.querySelector<HTMLButtonElement>('#close-settings')?.addEventListener('click', () => {
    settingsOpen = false;
    render();
  });
  document.querySelector<HTMLButtonElement>('#close-settings-backdrop')?.addEventListener('click', () => {
    settingsOpen = false;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-settings-section]').forEach(button => {
    button.addEventListener('click', () => {
      const section = button.dataset.settingsSection as SettingsSection | undefined;
      if (section) activeSettingsSection = section;
      if (compactMedia.matches) {
        mobileSettingsDetail = true;
        pushMobileHistory('settings-detail');
      }
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('[data-settings-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mobile-section]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      const nextSection = button.dataset.mobileSection;
      mobileSection = isMobileSection(nextSection) ? nextSection : 'messages';
      setActiveView(
        mobileSection === 'moments' ? 'moments'
          : mobileSection === 'world' ? 'world'
            : 'chat',
      );
      if (mobileSection === 'world') {
        activeWorldRpEventId = '';
        worldRpMessageEditId = '';
      }
      if (mobileSection === 'moments') openMomentsTutorialIfNeeded();
      if (mobileSection !== 'moments') {
        momentComposerOpen = false;
        momentGenerationStatus = '';
      }
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      desktopGroupChatOpen = false;
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      mobileSettingsDetail = false;
      if (mobileSection !== 'messages') pushMobileHistory('section');
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-timeline]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      setActiveView('world');
      mobileSection = 'world';
      activeWorldRpEventId = '';
      worldRpMessageEditId = '';
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      groupSettingsOpen = false;
      mobileSettingsDetail = false;
      momentComposerOpen = false;
      if (compactMedia.matches) pushMobileHistory('section');
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('[data-mobile-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-model-settings]').forEach(button => {
    button.addEventListener('click', () => {
      activeSettingsSection = 'model';
      if (compactMedia.matches) {
        mobileSection = 'settings';
        mobileSettingsDetail = true;
        pushMobileHistory('settings-detail');
      } else {
        settingsOpen = true;
      }
      render();
    });
  });
  document.onkeydown = event => {
    if (event.key === 'Escape' && momentsTutorialOpen) {
      localStorage.setItem(MOMENTS_TUTORIAL_KEY, 'done');
      momentsTutorialOpen = false;
      render();
      return;
    }
    if (event.key === 'Escape' && momentComposerOpen) {
      momentComposerOpen = false;
      momentGenerationStatus = '';
      render();
      return;
    }
    if (event.key === 'Escape' && groupSettingsOpen) {
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      render();
      return;
    }
    if (event.key === 'Escape' && settingsOpen) {
      settingsOpen = false;
      render();
    }
  };
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      const nextView = button.dataset.view === 'moments'
        ? 'moments'
        : button.dataset.view === 'groups'
          ? 'groups'
        : button.dataset.view === 'world'
          ? 'world'
          : 'chat';
      setActiveView(nextView);
      if (nextView === 'world') {
        activeWorldRpEventId = '';
        worldRpMessageEditId = '';
      }
      if (nextView === 'groups') desktopGroupChatOpen = false;
      if (nextView === 'moments') openMomentsTutorialIfNeeded();
      if (nextView !== 'moments') {
        momentComposerOpen = false;
        momentGenerationStatus = '';
      }
      if (nextView !== 'groups') {
        desktopGroupChatOpen = false;
        mobileGroupChatOpen = false;
        groupSettingsOpen = false;
        groupSettingsMode = 'create';
      }
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-groups]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      setActiveView('groups');
      desktopGroupChatOpen = false;
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      if (compactMedia.matches) {
        mobileSection = 'groups';
        mobileChatOpen = false;
        mobileGroupChatOpen = false;
        mobileSettingsDetail = false;
      }
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-group-create]').forEach(button => {
    button.addEventListener('click', () => {
      groupSettingsMode = 'create';
      groupSettingsOpen = true;
      mobileSettingsDetail = false;
      if (compactMedia.matches) pushMobileHistory('modal');
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('#open-group-settings, [data-open-group-settings]').forEach(button => {
    button.addEventListener('click', () => {
      groupSettingsMode = 'edit';
      groupSettingsOpen = true;
      mobileSettingsDetail = false;
      if (compactMedia.matches) pushMobileHistory('modal');
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#close-group-settings')?.addEventListener('click', () => {
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    saveUiSessionSnapshot();
    render();
  });
  document.querySelector<HTMLButtonElement>('#close-group-settings-backdrop')?.addEventListener('click', () => {
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    saveUiSessionSnapshot();
    render();
  });
  document.querySelector<HTMLButtonElement>('#cancel-group-settings')?.addEventListener('click', () => {
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    saveUiSessionSnapshot();
    render();
  });
  document.querySelector<HTMLButtonElement>('[data-mobile-group-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelector<HTMLButtonElement>('[data-group-list-back]')?.addEventListener('click', () => {
    captureVisibleDraftsFromDom();
    desktopGroupChatOpen = false;
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    saveUiSessionSnapshot();
    render();
  });
  document.querySelector<HTMLButtonElement>('[data-mobile-group-list-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-group-chat-id]').forEach(button => {
    button.addEventListener('click', () => {
      const groupChatId = button.dataset.groupChatId ?? '';
      if (!groupChatId) return;
      captureVisibleDraftsFromDom();
      state.activeGroupChatId = groupChatId;
      setActiveView('groups');
      desktopGroupChatOpen = true;
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      if (compactMedia.matches) {
        mobileSection = 'groups';
        mobileChatOpen = false;
        mobileGroupChatOpen = true;
        pushMobileHistory('chat');
      }
      saveState();
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#create-group-chat')?.addEventListener('click', () => {
    const participantIds = Array.from(document.querySelectorAll<HTMLInputElement>('[data-group-participant]:checked'))
      .map(input => input.value)
      .filter(Boolean);
    const group = createGroupChat(fieldValue('#group-title-input') || undefined, participantIds);
    state.activeGroupChatId = group.id;
    setActiveView('groups');
    desktopGroupChatOpen = false;
    if (compactMedia.matches) {
      mobileSection = 'groups';
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
    }
    groupSettingsOpen = false;
    groupSettingsMode = 'create';
    setVisibleStatus(`已创建群聊：${group.title}`);
    render();
  });
  document.querySelector<HTMLSelectElement>('#group-speaker-select')?.addEventListener('change', event => {
    const chat = activeGroupChat();
    if (!chat) return;
    const select = event.currentTarget as HTMLSelectElement;
    updateGroupChat(chat.id, { selectedSpeakerId: select.value });
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-group-chat')?.addEventListener('click', () => {
    const participantIds = Array.from(document.querySelectorAll<HTMLInputElement>('[data-group-participant]:checked'))
      .map(input => input.value)
      .filter(Boolean);
    const editingChat = groupSettingsMode === 'edit' ? activeGroupChat() : undefined;
    const saved = editingChat
      ? updateGroupChat(editingChat.id, {
        title: fieldValue('#group-title-input'),
        participantCharacterIds: participantIds,
        selectedSpeakerId: document.querySelector<HTMLSelectElement>('#group-speaker-select')?.value,
        replyAllOnUserMessage: checked('#group-reply-all-on-user-message'),
        allowModelInitiatedMessages: checked('#group-allow-model-initiated-messages'),
      })
      : createGroupChat(fieldValue('#group-title-input') || undefined, participantIds);
    if (saved) {
      state.activeGroupChatId = saved.id;
      setActiveView('groups');
      desktopGroupChatOpen = Boolean(editingChat);
      if (compactMedia.matches) {
        mobileSection = 'groups';
        mobileChatOpen = false;
        mobileGroupChatOpen = Boolean(editingChat);
      }
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      saveState();
      saveUiSessionSnapshot();
      setVisibleStatus(`${editingChat ? '群聊已保存' : '已创建群聊'}：${saved.title}`);
    }
    render();
  });
  document.querySelector<HTMLButtonElement>('#clear-group-messages')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat || isGroupGenerating()) return;
    const messageCount = groupMessagesFor(chat.id).length;
    if (messageCount === 0) {
      setVisibleStatus('这个群聊还没有聊天记录。');
      render();
      return;
    }
    if (!window.confirm(`确定清空“${chat.title}”的 ${messageCount} 条聊天记录吗？群聊和成员会保留。`)) return;
    const result = clearGroupMessages(chat.id);
    saveUiSessionSnapshot();
    setVisibleStatus(result.ok
      ? `已清空“${chat.title}”的聊天记录。`
      : result.reason ?? '清空聊天记录失败。');
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-group-chat')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat || isGroupGenerating()) return;
    const title = chat.title;
    const messageCount = groupMessagesFor(chat.id).length;
    const detail = messageCount > 0
      ? `会删除 ${messageCount} 条聊天记录，并让这些记录不再进入后续 AI 上下文。`
      : '这个群还没有聊天记录。';
    if (!window.confirm(`确定解散“${title}”吗？${detail}角色卡不会被删除。`)) return;
    const result = deleteGroupChat(chat.id);
    setGroupMessageDraft(chat, '');
    if (result.ok) {
      setActiveView('groups');
      desktopGroupChatOpen = false;
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      if (compactMedia.matches) {
        mobileSection = 'groups';
        mobileChatOpen = false;
        mobileGroupChatOpen = false;
      }
      saveUiSessionSnapshot({ captureDom: false });
    }
    setVisibleStatus(result.ok ? `已解散群聊：${title}` : result.reason ?? '解散群聊失败。');
    render();
  });
  const groupInput = document.querySelector<HTMLTextAreaElement>('#group-message-input');
  if (groupInput) {
    resizeComposerTextarea(groupInput);
    groupInput.addEventListener('input', event => {
      const chat = activeGroupChat();
      const textarea = event.currentTarget as HTMLTextAreaElement;
      setGroupMessageDraft(chat, textarea.value);
      resizeComposerTextarea(textarea);
      scheduleUiSessionSnapshotSave();
    });
    groupInput.addEventListener('keydown', event => requestTextareaFormSubmit(groupInput, event));
    groupInput.addEventListener('beforeinput', event => requestTextareaFormSubmitFromBeforeInput(groupInput, event));
  }
  document.querySelector<HTMLFormElement>('#group-composer')?.addEventListener('submit', event => {
    event.preventDefault();
    const chat = activeGroupChat();
    const input = document.querySelector<HTMLTextAreaElement>('#group-message-input');
    const content = input?.value ?? groupMessageDraftFor(chat);
    if (!content.trim() || !chat) return;
    const sent = sendGroupUserMessage(content, chat.id);
    if (input) {
      input.value = '';
      resizeComposerTextarea(input);
    }
    setGroupMessageDraft(chat, '');
    if (sent) {
      requestChatStickToBottom();
      requestGroupComposerFocusAfterSubmit(chat.id);
    }
    if (sent && state.chatReplyMode !== 'manual') {
      render();
      const replyTask = chat.replyAllOnUserMessage
        ? generateGroupRoundReply(chat.id, false, sent.id)
        : generateGroupReplyForLatest(chat.id);
      void replyTask.then(() => render());
      return;
    }
    render();
  });
  document.querySelector<HTMLButtonElement>('#generate-group-inline')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat || isGroupGenerating()) return;
    const input = document.querySelector<HTMLTextAreaElement>('#group-message-input');
    if ((input?.value ?? '').trim()) {
      setStatusText('先发送输入框里的内容，或清空后让角色继续聊。');
      render();
      return;
    }
    const hasMessages = groupMessagesFor(chat.id).length > 0;
    if (!hasMessages && !chat.allowModelInitiatedMessages) {
      setStatusText('群聊还没有消息。先发一句，或在群聊设置里开启高消耗主动发言。');
      render();
      return;
    }
    requestChatStickToBottom();
    void generateGroupReplyForLatest(chat.id, !hasMessages, hasMessages ? 'continue' : 'active').then(() => render());
    render();
  });
  document.querySelector<HTMLButtonElement>('#generate-group-next')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat || isGroupGenerating()) return;
    requestChatStickToBottom();
    void generateGroupReplyForLatest(chat.id, false, 'continue').then(() => render());
    render();
  });
  document.querySelector<HTMLButtonElement>('#generate-group-active')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat || isGroupGenerating()) return;
    if (!chat.allowModelInitiatedMessages) {
      setStatusText('先在群聊设置里开启“允许模型主动发言”。这个功能会明显增加 token 消耗。');
      render();
      return;
    }
    requestChatStickToBottom();
    void generateGroupReplyForLatest(chat.id, true, 'active').then(() => render());
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-generate-group-speaker]').forEach(button => {
    button.addEventListener('click', () => {
      const chat = activeGroupChat();
      const speakerId = button.dataset.generateGroupSpeaker ?? '';
      if (!chat || !speakerId || isGroupGenerating()) return;
      requestChatStickToBottom();
      void generateGroupReply(chat.id, speakerId).then(() => render());
      render();
    });
  });
  if (groupMessageActionId) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.group-message-actions')) return;
      closeGroupMessageActionMenuInPlace();
    }, { capture: true, once: true });
  }
  document.querySelectorAll<HTMLElement>('[data-group-message-id]').forEach(message => {
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerId = -1;
    const openActions = () => {
      const messageId = message.dataset.groupMessageId ?? '';
      const target = state.groupMessages.find(item => item.id === messageId);
      if (!target || target.recalledAt) return;
      shouldStickChatToBottom = false;
      captureActionMenuAnchor('group', messageId, message);
      groupMessageActionId = messageId;
      render();
    };
    const cancelLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = undefined;
    };
    message.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      cancelLongPress();
      pointerId = event.pointerId;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      longPressTimer = setTimeout(openActions, 360);
    });
    message.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      if (Math.abs(event.clientX - pointerStartX) > 18 || Math.abs(event.clientY - pointerStartY) > 18) {
        cancelLongPress();
      }
    });
    message.addEventListener('pointerup', cancelLongPress);
    message.addEventListener('pointercancel', cancelLongPress);
    message.addEventListener('contextmenu', event => {
      event.preventDefault();
      openActions();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-regenerate-group-message]').forEach(button => {
    button.addEventListener('click', () => {
      const messageId = button.dataset.regenerateGroupMessage ?? '';
      const message = state.groupMessages.find(item => item.id === messageId);
      if (!message || message.speakerType !== 'character' || !message.speakerCharacterId) return;
      recallGroupMessage(message.id);
      groupMessageActionId = '';
      requestChatStickToBottom();
      void generateGroupReply(message.groupChatId, message.speakerCharacterId, message.source === 'auto_model', message.replyToId, 'reply').then(() => render());
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-recall-group-message]').forEach(button => {
    button.addEventListener('click', () => {
      if (recallGroupMessage(button.dataset.recallGroupMessage ?? '')) groupMessageActionId = '';
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-group-message]').forEach(button => {
    button.addEventListener('click', () => {
      if (deleteGroupMessage(button.dataset.deleteGroupMessage ?? '')) groupMessageActionId = '';
      render();
    });
  });
  document.querySelectorAll<HTMLSelectElement>('#world-select, [data-world-select]').forEach(select => {
    select.addEventListener('change', event => {
      setActiveWorld((event.currentTarget as HTMLSelectElement).value);
      desktopGroupChatOpen = false;
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      groupSettingsOpen = false;
      groupSettingsMode = 'create';
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#search-world-location')?.addEventListener('click', () => {
    const world = activeWorld();
    const query = fieldValue<HTMLInputElement>('#world-location-query') || world.location?.name || world.name;
    worldWeatherLoading = true;
    worldWeatherStatus = '正在搜索城市…';
    worldLocationSearchWorldId = world.id;
    setStatusText(worldWeatherStatus);
    render();
    void searchWeatherLocations(query)
      .then(candidates => {
        worldLocationCandidates = candidates;
        worldWeatherStatus = candidates.length > 0
          ? `找到 ${candidates.length} 个城市，请选择最接近你的位置。`
          : '没有找到这个城市，换一个更具体的名称试试。';
        setStatusText(worldWeatherStatus);
      })
      .catch(error => {
        worldLocationCandidates = [];
        worldWeatherStatus = error instanceof Error ? error.message : String(error);
        setStatusText(worldWeatherStatus);
      })
      .finally(() => {
        worldWeatherLoading = false;
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#use-world-location')?.addEventListener('click', () => {
    const world = activeWorld();
    const index = Number(fieldValue<HTMLSelectElement>('#world-location-candidate') || '0');
    const location = worldLocationSearchWorldId === world.id ? worldLocationCandidates[index] : undefined;
    if (!location) {
      setStatusText('请先搜索并选择一个城市。');
      render();
      return;
    }
    world.location = location;
    world.weather = undefined;
    world.updatedAt = Date.now();
    saveState();
    worldWeatherLoading = true;
    worldWeatherStatus = `已选择 ${weatherLocationLabel(location)}，正在刷新天气…`;
    setStatusText(worldWeatherStatus);
    render();
    void refreshWorldWeather(world, true)
      .then(snapshot => {
        saveState();
        worldWeatherStatus = snapshot
          ? `${weatherLocationLabel(location)} 天气已更新：${weatherSnapshotLine(snapshot)}`
          : '城市已保存，但还没有天气。';
        setStatusText(worldWeatherStatus);
      })
      .catch(error => {
        worldWeatherStatus = `城市已保存，天气刷新失败：${error instanceof Error ? error.message : String(error)}`;
        setStatusText(worldWeatherStatus);
      })
      .finally(() => {
        worldWeatherLoading = false;
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#refresh-world-weather')?.addEventListener('click', () => {
    const world = activeWorld();
    if (!world.location) {
      setStatusText('请先搜索并选择当前城市。');
      render();
      return;
    }
    worldWeatherLoading = true;
    worldWeatherStatus = `正在刷新 ${weatherLocationLabel(world.location)} 的天气…`;
    setStatusText(worldWeatherStatus);
    render();
    void refreshWorldWeather(world, true)
      .then(snapshot => {
        saveState();
        worldWeatherStatus = snapshot
          ? `${weatherLocationLabel(world.location)} 天气已更新：${weatherSnapshotLine(snapshot)}`
          : '没有可刷新的天气。';
        setStatusText(worldWeatherStatus);
      })
      .catch(error => {
        worldWeatherStatus = `天气刷新失败：${error instanceof Error ? error.message : String(error)}`;
        setStatusText(worldWeatherStatus);
      })
      .finally(() => {
        worldWeatherLoading = false;
        render();
      });
  });
  document.querySelectorAll<HTMLInputElement>('#contact-search').forEach(searchInput => {
    searchInput.addEventListener('input', event => {
      const target = event.currentTarget as HTMLInputElement;
      const preferGroupSearch = Boolean(target.closest('.group-list-page'));
      contactQuery = target.value;
      render();
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('#contact-search'));
      const input = inputs.find(item => Boolean(item.closest('.group-list-page')) === preferGroupSearch) ?? inputs[0];
      input?.focus();
      input?.setSelectionRange(contactQuery.length, contactQuery.length);
    });
  });
  document.querySelector<HTMLButtonElement>('#create-world')?.addEventListener('click', () => {
    const world = createWorld(fieldValue('#new-world-name'));
    setStatusText(`已创建世界：${world.name}`);
    render();
  });
  document.querySelectorAll<HTMLInputElement>('.card-import').forEach(input => {
    input.addEventListener('change', async event => {
      const input = event.currentTarget as HTMLInputElement;
      const file = input.files?.[0];
      if (!file) {
        setVisibleStatus('没有选择文件。');
        return;
      }
      setVisibleStatus(`正在读取角色卡：${file.name || '未命名文件'}…`);
      try {
        const parsed = await parseCharacterCardFileWithRecognition(file);
        if (parsed.candidates.length > 1) {
          if (modelIsReady()) {
            setVisibleStatus(`正在用 AI 识别多人角色卡：${file.name || '未命名文件'}…`);
            render();
            if (await importCardRecognitionWithAi(parsed)) return;
          }
          pendingCardRecognition = parsed;
          setVisibleStatus(`识别到 ${parsed.candidates.length} 个可能角色，请选择导入方式。`);
          render();
          return;
        }
        const label = parsed.character.importInfo.spec === 'chara_card_v3'
          ? `已导入 V3 PNG 角色卡：${parsed.character.name}`
          : `已导入角色卡：${parsed.character.name}`;
        await importCharactersWithOpening([parsed.character], label);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setVisibleStatus(`角色卡导入失败：${message}`);
      } finally {
        input.value = '';
      }
      render();
    });
  });
  document.querySelector<HTMLInputElement>('#character-avatar-import')?.addEventListener('change', event => {
    void handleCharacterAvatarInput(event.currentTarget as HTMLInputElement);
  });
  document.querySelector<HTMLSelectElement>('#sticker-character-select')?.addEventListener('change', event => {
    stickerManagerCharacterId = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLSelectElement>('#relationship-character-select')?.addEventListener('change', event => {
    relationshipManagerCharacterId = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLSelectElement>('#relationship-pair-a-select')?.addEventListener('change', event => {
    relationshipPairACharacterId = (event.currentTarget as HTMLSelectElement).value;
    if (relationshipPairACharacterId === relationshipPairBCharacterId) {
      relationshipPairBCharacterId = state.characters.find(character =>
        character.worldId === activeWorld().id && character.id !== relationshipPairACharacterId,
      )?.id ?? '';
    }
    render();
  });
  document.querySelector<HTMLSelectElement>('#relationship-pair-b-select')?.addEventListener('change', event => {
    relationshipPairBCharacterId = (event.currentTarget as HTMLSelectElement).value;
    if (relationshipPairACharacterId === relationshipPairBCharacterId) {
      relationshipPairACharacterId = state.characters.find(character =>
        character.worldId === activeWorld().id && character.id !== relationshipPairBCharacterId,
      )?.id ?? '';
    }
    render();
  });
  document.querySelector<HTMLSelectElement>('#proactive-character-select')?.addEventListener('change', event => {
    proactiveManagerCharacterId = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  const bindStickerImport = (
    selector: string,
    scope: StickerLibraryScope,
  ) => document.querySelector<HTMLInputElement>(selector)?.addEventListener('change', async event => {
    const input = event.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length === 0) return;
    try {
      if (scope === 'character') {
        const character = stickerManagerCharacter();
        if (!character) return;
        const imported = await importStickerFiles(files, character.stickers?.length ?? 0);
        pendingStickerImport = { scope, characterId: character.id, stickers: imported };
        setStatusText(`已读取 ${imported.length} 个表情包，请补充备注后确认导入。`);
      } else {
        const target = scope === 'common' ? state.commonStickers : state.userStickers;
        const imported = await importStickerFiles(files, target.length);
        pendingStickerImport = { scope, stickers: imported };
        setStatusText(`已读取 ${imported.length} 个${scope === 'common' ? '通用' : '用户'}表情包，请补充备注后确认导入。`);
      }
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
    render();
  });
  bindStickerImport('#character-sticker-import', 'character');
  bindStickerImport('#common-sticker-import', 'common');
  bindStickerImport('#user-sticker-import', 'user');
  document.querySelectorAll<HTMLButtonElement>('[data-delete-sticker]').forEach(button => {
    button.addEventListener('click', () => {
      const stickerId = button.dataset.deleteSticker ?? '';
      const scope = button.dataset.stickerScope as StickerLibraryScope | undefined;
      if (scope === 'character') {
        const character = stickerManagerCharacter();
        if (!character) return;
        deleteCharacterSticker(character, stickerId);
      } else if (scope === 'common') {
        state.commonStickers = state.commonStickers.filter(sticker => sticker.id !== stickerId);
        saveState();
      } else if (scope === 'user') {
        state.userStickers = state.userStickers.filter(sticker => sticker.id !== stickerId);
        saveState();
      }
      setStatusText('已删除表情包。');
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-character-id]').forEach(button => {
    button.addEventListener('click', () => {
      openPrivateChatByCharacterId(button.dataset.characterId ?? '');
    });
  });
  document.querySelector<HTMLButtonElement>('#save-world')?.addEventListener('click', () => {
    const world = activeWorld();
    world.name = fieldValue('#world-name') || world.name;
    world.description = fieldValue('#world-description');
    world.currentLocation = fieldValue('#world-current-location') || world.currentLocation;
    world.sceneAtmosphere = fieldValue('#world-scene-atmosphere') || world.sceneAtmosphere;
    world.sceneSummary = fieldValue('#world-scene-summary');
    world.updatedAt = Date.now();
    saveState();
    setStatusText('世界设置已保存。');
    render();
  });
  document.querySelector<HTMLButtonElement>('[data-save-world-workbench]')?.addEventListener('click', () => {
    const world = activeWorld();
    world.name = fieldValue('#workbench-world-name') || world.name;
    world.description = fieldValue('#workbench-world-description');
    world.currentLocation = fieldValue('#workbench-world-current-location') || world.currentLocation;
    world.sceneAtmosphere = fieldValue('#workbench-world-scene-atmosphere') || world.sceneAtmosphere;
    world.sceneSummary = fieldValue('#workbench-world-scene-summary');
    world.updatedAt = Date.now();
    saveState();
    setStatusText('世界工作台设置已保存。');
    render();
  });
  document.querySelector<HTMLButtonElement>('[data-save-workbench-user]')?.addEventListener('click', () => {
    const world = activeWorld();
    state.userName = fieldValue('#workbench-user-name') || '我';
    world.userPersona = fieldValue<HTMLTextAreaElement>('#workbench-user-persona');
    world.updatedAt = Date.now();
    state.userPersona = world.userPersona;
    saveState();
    setStatusText('当前身份已保存。');
    render();
  });
  document.querySelector<HTMLSelectElement>('[data-world-rp-actor]')?.addEventListener('change', event => {
    const actorId = (event.currentTarget as HTMLSelectElement).value || 'user';
    worldRpActorId = actorId === 'user'
      || state.characters.some(character => character.id === actorId && character.worldId === activeWorld().id)
      ? actorId
      : 'user';
    saveUiSessionSnapshot();
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-world')?.addEventListener('click', () => {
    const world = activeWorld();
    if (!window.confirm(`确定删除世界“${world.name}”及其中全部数据吗？`)) return;
    const result = deleteWorld(world.id);
    setStatusText(result.ok ? `已删除世界：${world.name}` : result.reason ?? '删除失败。');
    render();
  });
  document.querySelector<HTMLSelectElement>('#character-manage-select')?.addEventListener('change', event => {
    state.activeCharacterId = (event.currentTarget as HTMLSelectElement).value;
    saveState();
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-character-details')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    updateCharacterCardDetails(character, {
      name: fieldValue('#character-name'),
      settings: fieldValue<HTMLTextAreaElement>('#character-settings-text'),
    });
    state.activeCharacterId = character.id;
    saveState();
    setStatusText(`${character.name} 的卡名和设定世界书已保存。`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-character')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character || !window.confirm(`确定删除角色“${character.name}”及其全部聊天记录吗？`)) return;
    const deleted = deleteCharacter(character.id);
    if (!deleted) return;
    quotedMessageId = '';
    messageActionId = '';
    stickerManagerCharacterId = '';
    relationshipManagerCharacterId = '';
    relationshipPairACharacterId = '';
    relationshipPairBCharacterId = '';
    proactiveManagerCharacterId = '';
    if (compactMedia.matches) {
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      groupSettingsOpen = false;
    }
    setStatusText(`已删除角色：${deleted.name}`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-model')?.addEventListener('click', () => {
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#model-provider')?.value);
    state.modelConfig = {
      provider,
      apiUrl: apiUrlForProvider(provider, fieldValue('#api-url')),
      apiKey: fieldValue('#api-key'),
      model: fieldValue('#model-name'),
      temperature: Number(fieldValue('#temperature') || '0.75'),
      dailyRequestLimit: Math.max(1, Math.floor(Number(fieldValue('#daily-request-limit') || '100'))),
    };
    modelFormDraft = null;
    saveState();
    setStatusText('模型设置已保存。');
    render();
    const character = activeCharacter();
    if (character) void generateOpeningMessage(character, render);
  });
  document.querySelector<HTMLButtonElement>('#fetch-model-list')?.addEventListener('click', () => {
    if (modelListLoading) return;
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#model-provider')?.value);
    const apiUrl = apiUrlForProvider(provider, fieldValue('#api-url'));
    const apiUrlInput = document.querySelector<HTMLInputElement>('#api-url');
    if (apiUrlInput) apiUrlInput.value = apiUrl;
    const apiKey = fieldValue('#api-key');
    modelFormDraft = {
      provider,
      apiUrl,
      apiKey,
      model: fieldValue('#model-name'),
      temperature: Number(fieldValue('#temperature') || '0.75'),
      dailyRequestLimit: Math.max(1, Math.floor(Number(fieldValue('#daily-request-limit') || '100'))),
    };
    modelListLoading = true;
    modelListError = false;
    modelListStatus = '正在连接服务并读取模型列表…';
    const button = document.querySelector<HTMLButtonElement>('#fetch-model-list');
    const status = document.querySelector<HTMLElement>('#model-list-status');
    if (button) {
      button.disabled = true;
      button.textContent = '正在获取…';
    }
    if (status) status.textContent = modelListStatus;
    void fetchModelList(apiUrl, apiKey)
      .then(models => {
        discoveredModels = models;
        modelListStatus = `已获取 ${models.length} 个模型，请从下拉列表选择。`;
        modelListError = false;
      })
      .catch(error => {
        discoveredModels = [];
        modelListStatus = error instanceof Error ? error.message : String(error);
        modelListError = true;
      })
      .finally(() => {
        modelListLoading = false;
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#test-model-connection')?.addEventListener('click', () => {
    if (modelConnectionTesting || modelListLoading) return;
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#model-provider')?.value);
    const apiUrl = apiUrlForProvider(provider, fieldValue('#api-url'));
    const apiUrlInput = document.querySelector<HTMLInputElement>('#api-url');
    if (apiUrlInput) apiUrlInput.value = apiUrl;
    const apiKey = fieldValue('#api-key');
    const temperature = Number(fieldValue('#temperature') || '0.75');
    modelFormDraft = {
      provider,
      apiUrl,
      apiKey,
      model: fieldValue('#model-name'),
      temperature,
      dailyRequestLimit: Math.max(1, Math.floor(Number(fieldValue('#daily-request-limit') || '100'))),
    };
    modelConnectionTesting = true;
    modelListError = false;
    modelListStatus = '正在测试模型连接…';
    const fetchButton = document.querySelector<HTMLButtonElement>('#fetch-model-list');
    const button = document.querySelector<HTMLButtonElement>('#test-model-connection');
    const status = document.querySelector<HTMLElement>('#model-list-status');
    if (fetchButton) fetchButton.disabled = true;
    if (button) {
      button.disabled = true;
      button.textContent = '正在测试…';
    }
    if (status) status.textContent = modelListStatus;
    void testModelConnection({
      apiUrl: apiUrlForProvider(provider, fieldValue('#api-url')),
      apiKey,
      model: fieldValue('#model-name'),
      temperature,
    })
      .then(result => {
        modelListStatus = `连接成功：模型已返回「${result.preview}」。`;
        modelListError = false;
      })
      .catch(error => {
        modelListStatus = error instanceof Error ? error.message : String(error);
        modelListError = true;
      })
      .finally(() => {
        modelConnectionTesting = false;
        render();
      });
  });
  document.querySelector<HTMLSelectElement>('#model-list-select')?.addEventListener('change', event => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    const input = document.querySelector<HTMLInputElement>('#model-name');
    if (input && value) {
      input.value = value;
      if (modelFormDraft) modelFormDraft.model = value;
    }
  });
  document.querySelector<HTMLInputElement>('#prompt-preset-import')?.addEventListener('change', async event => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    try {
      const preset = parseSillyTavernPromptPreset(await file.text(), file.name);
      state.promptPresets.push(preset);
      state.activeChatPromptPresetId = preset.id;
      state.chatPromptPresetEnabled = true;
      state.activeWorldPromptPresetId = preset.id;
      state.worldPromptPresetEnabled = true;
      editingPromptPresetId = preset.id;
      saveState();
      setStatusText(`已导入提示词预设：${preset.name}`);
    } catch (error) {
      setStatusText(error instanceof Error ? `预设导入失败：${error.message}` : String(error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>('#restore-tavern-social-prompt-preset')?.addEventListener('click', () => {
    const existingIndex = state.promptPresets.findIndex(item => item.id === TAVERN_SOCIAL_DEFAULT_PROMPT_PRESET_ID);
    if (
      existingIndex >= 0
      && !window.confirm('这会用 Tavern Social 默认内容覆盖当前默认回复策略预设。继续吗？')
    ) {
      return;
    }
    const preset = createTavernSocialDefaultPromptPreset();
    if (existingIndex >= 0) {
      state.promptPresets.splice(existingIndex, 1, preset);
    } else {
      state.promptPresets.push(preset);
    }
    state.activeChatPromptPresetId = preset.id;
    state.chatPromptPresetEnabled = true;
    editingPromptPresetId = preset.id;
    saveState();
    setStatusText('已写入 Tavern Social 默认回复策略预设，可以在下方直接编辑“回复策略”。');
    render();
  });
  document.querySelector<HTMLButtonElement>('#restore-tavern-social-group-prompt-preset')?.addEventListener('click', () => {
    const existingIndex = state.promptPresets.findIndex(item => item.id === TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID);
    if (
      existingIndex >= 0
      && !window.confirm('这会用 Tavern Social 默认内容覆盖当前默认群聊策略预设。继续吗？')
    ) {
      return;
    }
    const preset = createTavernSocialDefaultGroupPromptPreset();
    if (existingIndex >= 0) {
      state.promptPresets.splice(existingIndex, 1, preset);
    } else {
      state.promptPresets.push(preset);
    }
    state.activeGroupPromptPresetId = preset.id;
    state.groupPromptPresetEnabled = true;
    editingPromptPresetId = preset.id;
    saveState();
    setStatusText('已写入 Tavern Social 默认群聊策略预设，可以在下方直接编辑群聊规则。');
    render();
  });
  document.querySelector<HTMLButtonElement>('#restore-tavern-social-world-prompt-preset')?.addEventListener('click', () => {
    const existingIndex = state.promptPresets.findIndex(item => item.id === TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID);
    if (
      existingIndex >= 0
      && !window.confirm('这会用 Tavern Social 默认内容覆盖当前默认世界 RP 预设。继续吗？')
    ) {
      return;
    }
    const preset = createTavernSocialDefaultWorldPromptPreset();
    if (existingIndex >= 0) {
      state.promptPresets.splice(existingIndex, 1, preset);
    } else {
      state.promptPresets.push(preset);
    }
    state.activeWorldPromptPresetId = preset.id;
    state.worldPromptPresetEnabled = true;
    editingPromptPresetId = preset.id;
    saveState();
    setStatusText('已写入 Tavern Social 默认世界 RP 预设，可以在下方直接编辑世界舞台规则。');
    render();
  });
  document.querySelector<HTMLInputElement>('#chat-prompt-preset-enabled')?.addEventListener('change', event => {
    state.chatPromptPresetEnabled = (event.currentTarget as HTMLInputElement).checked
      && Boolean(promptPresetById(state.activeChatPromptPresetId));
    saveState();
    preserveScrollForNextRender();
    setStatusText(state.chatPromptPresetEnabled ? '私聊已启用当前提示词预设。' : '私聊已关闭提示词预设。');
    render();
  });
  document.querySelector<HTMLInputElement>('#group-prompt-preset-enabled')?.addEventListener('change', event => {
    state.groupPromptPresetEnabled = (event.currentTarget as HTMLInputElement).checked
      && Boolean(promptPresetById(state.activeGroupPromptPresetId));
    saveState();
    preserveScrollForNextRender();
    setStatusText(state.groupPromptPresetEnabled ? '群聊已启用当前提示词预设。' : '群聊已关闭提示词预设。');
    render();
  });
  document.querySelector<HTMLInputElement>('#world-prompt-preset-enabled')?.addEventListener('change', event => {
    state.worldPromptPresetEnabled = (event.currentTarget as HTMLInputElement).checked
      && Boolean(promptPresetById(state.activeWorldPromptPresetId));
    saveState();
    preserveScrollForNextRender();
    setStatusText(state.worldPromptPresetEnabled ? '世界 RP 已启用当前提示词预设。' : '世界 RP 已关闭提示词预设。');
    render();
  });
  document.querySelector<HTMLSelectElement>('#active-chat-prompt-preset')?.addEventListener('change', event => {
    state.activeChatPromptPresetId = (event.currentTarget as HTMLSelectElement).value;
    state.chatPromptPresetEnabled = Boolean(promptPresetById(state.activeChatPromptPresetId));
    saveState();
    preserveScrollForNextRender();
    setStatusText('已切换私聊提示词预设。');
    render();
  });
  document.querySelector<HTMLSelectElement>('#active-group-prompt-preset')?.addEventListener('change', event => {
    state.activeGroupPromptPresetId = (event.currentTarget as HTMLSelectElement).value;
    state.groupPromptPresetEnabled = Boolean(promptPresetById(state.activeGroupPromptPresetId));
    saveState();
    preserveScrollForNextRender();
    setStatusText('已切换群聊提示词预设。');
    render();
  });
  document.querySelector<HTMLSelectElement>('#active-world-prompt-preset')?.addEventListener('change', event => {
    state.activeWorldPromptPresetId = (event.currentTarget as HTMLSelectElement).value;
    state.worldPromptPresetEnabled = Boolean(promptPresetById(state.activeWorldPromptPresetId));
    saveState();
    preserveScrollForNextRender();
    setStatusText('已切换世界 RP 提示词预设。');
    render();
  });
  document.querySelector<HTMLSelectElement>('#editing-prompt-preset')?.addEventListener('change', event => {
    editingPromptPresetId = (event.currentTarget as HTMLSelectElement).value;
    preserveScrollForNextRender();
    setStatusText('已切换正在编辑的提示词预设。');
    render();
  });
  document.querySelector<HTMLInputElement>('#prompt-preset-name')?.addEventListener('input', event => {
    const preset = activePromptPreset();
    if (!preset) return;
    preset.name = (event.currentTarget as HTMLInputElement).value.trim() || '未命名预设';
    saveState();
  });
  document.querySelectorAll<HTMLInputElement>('[data-preset-prompt]').forEach(input => {
    input.addEventListener('change', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const identifier = (event.currentTarget as HTMLInputElement).dataset.presetPrompt ?? '';
      const prompt = preset.prompts.find(item => item.identifier === identifier);
      if (!prompt) return;
      prompt.enabled = (event.currentTarget as HTMLInputElement).checked;
      saveState();
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-preset-prompt-name]').forEach(input => {
    input.addEventListener('input', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const identifier = (event.currentTarget as HTMLInputElement).dataset.presetPromptName ?? '';
      const prompt = preset.prompts.find(item => item.identifier === identifier);
      if (!prompt) return;
      prompt.name = (event.currentTarget as HTMLInputElement).value.trim() || prompt.identifier;
      saveState();
    });
  });
  document.querySelectorAll<HTMLSelectElement>('[data-preset-prompt-role]').forEach(select => {
    select.addEventListener('change', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const identifier = (event.currentTarget as HTMLSelectElement).dataset.presetPromptRole ?? '';
      const prompt = preset.prompts.find(item => item.identifier === identifier);
      if (!prompt) return;
      const role = (event.currentTarget as HTMLSelectElement).value;
      prompt.role = role === 'assistant' || role === 'user' ? role : 'system';
      saveState();
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLTextAreaElement>('[data-preset-prompt-content]').forEach(textarea => {
    textarea.addEventListener('input', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const identifier = (event.currentTarget as HTMLTextAreaElement).dataset.presetPromptContent ?? '';
      const prompt = preset.prompts.find(item => item.identifier === identifier);
      if (!prompt) return;
      prompt.content = (event.currentTarget as HTMLTextAreaElement).value;
      saveState();
    });
  });
  document.querySelector<HTMLButtonElement>('#add-prompt-regex')?.addEventListener('click', () => {
    const preset = activePromptPreset();
    if (!preset) return;
    preset.regexScripts.push({
      id: nowId('regex'),
      name: '新正则',
      enabled: true,
      findRegex: '',
      replaceString: '',
      promptOnly: false,
      markdownOnly: false,
    });
    preset.regexScriptCount = preset.regexScripts.length;
    saveState();
    preserveScrollForNextRender();
    render();
  });
  document.querySelectorAll<HTMLInputElement>('[data-preset-regex]').forEach(input => {
    input.addEventListener('change', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const id = (event.currentTarget as HTMLInputElement).dataset.presetRegex ?? '';
      const script = preset.regexScripts.find(item => item.id === id);
      if (!script) return;
      script.enabled = (event.currentTarget as HTMLInputElement).checked;
      saveState();
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-preset-regex-name]').forEach(input => {
    input.addEventListener('input', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const id = (event.currentTarget as HTMLInputElement).dataset.presetRegexName ?? '';
      const script = preset.regexScripts.find(item => item.id === id);
      if (!script) return;
      script.name = (event.currentTarget as HTMLInputElement).value.trim() || script.id;
      saveState();
    });
  });
  document.querySelectorAll<HTMLTextAreaElement>('[data-preset-regex-find]').forEach(textarea => {
    textarea.addEventListener('input', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const id = (event.currentTarget as HTMLTextAreaElement).dataset.presetRegexFind ?? '';
      const script = preset.regexScripts.find(item => item.id === id);
      if (!script) return;
      script.findRegex = (event.currentTarget as HTMLTextAreaElement).value;
      saveState();
    });
  });
  document.querySelectorAll<HTMLTextAreaElement>('[data-preset-regex-replace]').forEach(textarea => {
    textarea.addEventListener('input', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const id = (event.currentTarget as HTMLTextAreaElement).dataset.presetRegexReplace ?? '';
      const script = preset.regexScripts.find(item => item.id === id);
      if (!script) return;
      script.replaceString = (event.currentTarget as HTMLTextAreaElement).value;
      saveState();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-preset-regex]').forEach(button => {
    button.addEventListener('click', event => {
      const preset = activePromptPreset();
      if (!preset) return;
      const id = (event.currentTarget as HTMLButtonElement).dataset.deletePresetRegex ?? '';
      preset.regexScripts = preset.regexScripts.filter(script => script.id !== id);
      preset.regexScriptCount = preset.regexScripts.length;
      saveState();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#reset-prompt-preset')?.addEventListener('click', () => {
    const preset = activePromptPreset();
    if (!preset) return;
    resetPromptPresetDefaults(preset);
    saveState();
    setStatusText('已恢复当前预设的默认开关。');
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-prompt-preset')?.addEventListener('click', () => {
    const preset = activePromptPreset();
    if (!preset || !window.confirm(`确定删除提示词预设“${preset.name}”吗？`)) return;
    state.promptPresets = state.promptPresets.filter(item => item.id !== preset.id);
    if (state.activeChatPromptPresetId === preset.id) {
      state.activeChatPromptPresetId = state.promptPresets[0]?.id ?? '';
    }
    if (state.activeGroupPromptPresetId === preset.id) {
      state.activeGroupPromptPresetId = state.promptPresets.find(item => item.id === TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID)?.id
        ?? state.promptPresets[0]?.id
        ?? '';
    }
    if (state.activeWorldPromptPresetId === preset.id) {
      state.activeWorldPromptPresetId = state.promptPresets.find(item => item.id === TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID)?.id
        ?? state.promptPresets[0]?.id
        ?? '';
    }
    editingPromptPresetId = state.promptPresets[0]?.id ?? '';
    state.chatPromptPresetEnabled = state.chatPromptPresetEnabled && Boolean(state.activeChatPromptPresetId);
    state.groupPromptPresetEnabled = state.groupPromptPresetEnabled && Boolean(state.activeGroupPromptPresetId);
    state.worldPromptPresetEnabled = state.worldPromptPresetEnabled && Boolean(state.activeWorldPromptPresetId);
    saveState();
    setStatusText(`已删除提示词预设：${preset.name}`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-chat-reply-mode')?.addEventListener('click', () => {
    const selected = document.querySelector<HTMLInputElement>('input[name="chat-reply-mode"]:checked')?.value;
    const world = activeWorld();
    state.userName = fieldValue('#user-name') || '我';
    world.userPersona = fieldValue<HTMLTextAreaElement>('#user-persona');
    world.updatedAt = Date.now();
    state.userPersona = world.userPersona;
    state.chatReplyMode = selected === 'manual' ? 'manual' : 'auto';
    state.enterToSend = checked('#enter-to-send');
    state.companionTimeMode = selectedCompanionTimeMode('settings');
    state.virtualTimeMinutes = companionTimeMinutesFromFields('settings');
    localStorage.setItem(CHAT_REPLY_MODE_ONBOARDING_KEY, 'done');
    localStorage.setItem(TIME_MODE_ONBOARDING_KEY, 'done');
    chatReplyModeOnboardingOpen = false;
    timeModeOnboardingOpen = false;
    saveState();
    const replyModeText = state.chatReplyMode === 'manual' ? '短消息模式' : '长消息模式';
    const enterText = state.enterToSend ? '回车发送已开启' : '回车发送已关闭';
    const timeModeText = state.companionTimeMode === 'virtual'
      ? `虚拟时间 ${formatClockMinutes(state.virtualTimeMinutes)}`
      : '系统时间';
    setStatusText(`聊天与 user 人设已保存：${replyModeText}，${enterText}，${timeModeText}。`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-relationship')?.addEventListener('click', () => {
    const character = relationshipManagerCharacter();
    if (!character) return;
    const before = relationshipSnapshot(character);
    const nextRelationship: RelationshipState = {
      stage: fieldValue<HTMLSelectElement>('#relationship-stage') as RelationshipStage,
      affinity: Math.max(0, Math.round(finiteNumber(fieldValue('#relationship-affinity'), 0))),
      summary: fieldValue('#relationship-summary'),
      updatedAt: Date.now(),
    };
    character.relationship = nextRelationship;
    if (relationshipChanged(before, nextRelationship)) {
      const operationId = nowId('relationship_manual');
      const summary = relationshipChangeSummary(before, nextRelationship);
      const entry = addRelationshipTimelineEntry(
        character,
        `${character.name} 的关系状态被手动更新`,
        summary,
        operationId,
      );
      recordTimelineEntryImpact(
        entry,
        operationId,
        `撤销 ${character.name} 的手动关系更新`,
        { type: 'relationship', id: operationId },
      );
      recordImpact({
        worldId: character.worldId,
        operationId,
        label: `撤销 ${character.name} 的手动关系更新`,
        source: { type: 'relationship', id: operationId },
        targetType: 'relationship',
        targetId: character.id,
        characterId: character.id,
        field: 'relationship',
        oldValue: before,
        newValue: relationshipSnapshot(character),
        timelineEntryIds: [entry.id],
        createdAt: entry.createdAt,
      });
    }
    saveState();
    setStatusText(`${character.name} 的关系状态已保存，并会参与聊天与主动消息节奏。`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-character-relationship')?.addEventListener('click', () => {
    const [first, second] = relationshipPairCharacters();
    if (!first || !second) return;
    const relationship = ensureCharacterRelationship(first, second);
    const before = characterRelationshipSnapshot(relationship);
    const firstBefore = before ? relationshipSideFor(before, first.id) : relationshipSideFor(relationship, first.id);
    const secondBefore = before ? relationshipSideFor(before, second.id) : relationshipSideFor(relationship, second.id);
    const firstNext: CharacterRelationshipSide = {
      stage: fieldValue<HTMLSelectElement>('#relationship-pair-a-stage') as RelationshipStage,
      summary: fieldValue<HTMLTextAreaElement>('#relationship-pair-a-summary'),
      updatedAt: Date.now(),
    };
    const secondNext: CharacterRelationshipSide = {
      stage: fieldValue<HTMLSelectElement>('#relationship-pair-b-stage') as RelationshipStage,
      summary: fieldValue<HTMLTextAreaElement>('#relationship-pair-b-summary'),
      updatedAt: Date.now(),
    };
    updateCharacterRelationshipSide(relationship, first.id, firstNext);
    updateCharacterRelationshipSide(relationship, second.id, secondNext);
    const changed = characterRelationshipSideChanged(firstBefore, firstNext)
      || characterRelationshipSideChanged(secondBefore, secondNext);
    if (changed) {
      const operationId = nowId('character_relationship_manual');
      const summary = [
        characterRelationshipChangeSummary(first, second, firstBefore, firstNext),
        characterRelationshipChangeSummary(second, first, secondBefore, secondNext),
      ].join('；');
      const entry = addTimelineEntry({
        worldId: first.worldId,
        type: 'relationship',
        characterIds: [first.id, second.id],
        title: `${first.name} 与 ${second.name} 的关系被手动更新`,
        summary,
        source: { type: 'relationship', id: operationId },
        canUndo: true,
        includeInContext: true,
      });
      const label = `撤销 ${first.name} 与 ${second.name} 的手动关系更新`;
      recordTimelineEntryImpact(entry, operationId, label, { type: 'relationship', id: operationId });
      recordImpact({
        worldId: first.worldId,
        operationId,
        label,
        source: { type: 'relationship', id: operationId },
        targetType: 'character_relationship',
        targetId: relationship.id,
        field: 'relationship',
        oldValue: before,
        newValue: characterRelationshipSnapshot(relationship),
        timelineEntryIds: [entry.id],
        createdAt: entry.createdAt,
      });
    }
    saveState();
    setStatusText(`${first.name} 与 ${second.name} 的双向关系已保存。`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-world-interactions')?.addEventListener('click', () => {
    state.worldInteractionHighSimulation = checked('#world-interaction-high-simulation');
    scheduleNextBackgroundInteraction();
    saveState();
    setStatusText(state.worldInteractionHighSimulation
      ? '热闹世界已开启，角色之间会更频繁地产生自然互动。'
      : '角色互动已切回克制自然。');
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-apply-relationship-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const result = applyCharacterRelationshipSuggestion(button.dataset.applyRelationshipSuggestion ?? '');
      setStatusText(result.ok ? '关系阶段建议已应用，可在时间线里撤销。' : result.reason ?? '应用失败。');
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-ignore-relationship-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const result = ignoreCharacterRelationshipSuggestion(button.dataset.ignoreRelationshipSuggestion ?? '');
      setStatusText(result.ok ? '已忽略这条关系阶段建议。' : result.reason ?? '忽略失败。');
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#export-tavern-card')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    void downloadSillyTavernCard(character)
      .then(() => {
        setStatusText(`已导出 ${character.name} 的 SillyTavern V3 角色卡。`);
        render();
      })
      .catch(error => {
        setStatusText(error instanceof DOMException && error.name === 'AbortError'
          ? '已取消导出。'
          : error instanceof Error ? error.message : String(error));
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#export-tavern-card')?.addEventListener('click', event => {
    event.preventDefault();
    event.stopImmediatePropagation();
    const character = activeCharacter();
    if (!character) return;
    void downloadSillyTavernCard(character)
      .then(downloadInfo => {
        const message = `已导出 ${character.name} 的 SillyTavern V3 角色卡。\n文件名：${downloadInfo.fileName}\n保存位置：${downloadInfo.folderHint}`;
        window.alert(message);
        setStatusText(message.replace(/\n/g, ' '));
        render();
      })
      .catch(error => {
        setStatusText(error instanceof DOMException && error.name === 'AbortError'
          ? '已取消导出。'
          : error instanceof Error ? error.message : String(error));
        render();
      });
  }, { capture: true });
  document.querySelector<HTMLButtonElement>('#save-auto-message')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (!character) return;
    const hasAutoMessageSettings = Boolean(document.querySelector<HTMLInputElement>('#auto-enabled'));
    const hasAutoMomentSettings = Boolean(document.querySelector<HTMLInputElement>('#auto-moment-enabled'));
    const hasAutoEventSettings = Boolean(document.querySelector<HTMLInputElement>('#auto-event-enabled'));
    const highSimulationInput = document.querySelector<HTMLInputElement>('#world-high-simulation');
    const savedParts: string[] = [];
    if (highSimulationInput) {
      state.worldInteractionHighSimulation = highSimulationInput.checked;
      savedParts.push('世界活跃度');
    }
    if (hasAutoMessageSettings) {
      const schedule = character.autoMessage;
      schedule.baseIntervalMin = Math.max(0.05, Number(fieldValue('#auto-min-hours') || '2')) * 3600000;
      schedule.baseIntervalMax = Math.max(0.05, Number(fieldValue('#auto-max-hours') || '6')) * 3600000;
      schedule.dailyLimit = Math.max(1, Math.floor(Number(fieldValue('#auto-daily-limit') || '3')));
      schedule.maxInterval = Math.max(1, Number(fieldValue('#auto-max-interval') || '48')) * 3600000;
      schedule.quietHours = {
        enabled: checked('#auto-quiet-enabled'),
        start: fieldValue('#auto-quiet-start') || '23:00',
        end: fieldValue('#auto-quiet-end') || '08:00',
      };
      schedule.backgroundNotificationsEnabled = checked('#auto-background-notify');
      const privacy = fieldValue<HTMLSelectElement>('#auto-notification-privacy');
      schedule.notificationPrivacy = (privacy === 'full' || privacy === 'hide_character' ? privacy : 'generic') as NotificationPrivacy;
      schedule.pacingStrategy = fieldValue<HTMLTextAreaElement>('#auto-pacing-strategy')
        || createAutoMessagePacingStrategy(character);
      if (checked('#auto-enabled')) {
        enableAutoMessage(character);
        scheduleNextAttempt(character);
      } else {
        disableAutoMessage(character);
      }
      savedParts.push('主动消息');
    }
    if (hasAutoMomentSettings) {
      const autoMoment = character.autoMoment;
      autoMoment.baseIntervalMin = Math.max(0.25, Number(fieldValue('#auto-moment-min-hours') || '4')) * 3600000;
      autoMoment.baseIntervalMax = Math.max(
        autoMoment.baseIntervalMin,
        Math.max(0.25, Number(fieldValue('#auto-moment-max-hours') || '10')) * 3600000,
      );
      autoMoment.dailyLimit = Math.max(1, Math.floor(Number(fieldValue('#auto-moment-daily-limit') || '2')));
      autoMoment.quietHours = {
        enabled: true,
        start: fieldValue('#auto-moment-quiet-start') || '00:00',
        end: fieldValue('#auto-moment-quiet-end') || '07:00',
      };
      setAutoMomentEnabled(character, checked('#auto-moment-enabled'));
      if (autoMoment.enabled) scheduleNextMoment(character);
      savedParts.push('自动动态');
    }
    if (hasAutoEventSettings) {
      const autoEvent = character.autoEvent;
      autoEvent.baseIntervalMin = Math.max(0.25, Number(fieldValue('#auto-event-min-hours') || '6')) * 3600000;
      autoEvent.baseIntervalMax = Math.max(
        autoEvent.baseIntervalMin,
        Math.max(0.25, Number(fieldValue('#auto-event-max-hours') || '16')) * 3600000,
      );
      autoEvent.dailyLimit = Math.max(1, Math.floor(Number(fieldValue('#auto-event-daily-limit') || '1')));
      autoEvent.quietHours = {
        enabled: true,
        start: fieldValue('#auto-event-quiet-start') || '00:00',
        end: fieldValue('#auto-event-quiet-end') || '07:00',
      };
      setAutoEventEnabled(character, checked('#auto-event-enabled'));
      if (autoEvent.enabled) scheduleNextEvent(character);
      savedParts.push('小事件');
    }
    saveState();
    setStatusText(savedParts.length > 0 ? `${savedParts.join('、')}设置已保存。` : '设置已保存。');
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#regenerate-auto-pacing-strategy')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (!character) return;
    character.autoMessage.pacingStrategy = createAutoMessagePacingStrategy(character);
    saveState();
    setStatusText('已按当前人设重建主动消息节奏策略。');
    render();
  });
  document.querySelector<HTMLButtonElement>('#run-auto-check')?.addEventListener('click', () => {
    setStatusText('正在检查主动消息、自动动态和岛上事件…');
    render();
    void runAutoMessageCheckNow(render)
      .then(() => {
        setStatusText('已完成一次主动检查；如果没有新内容，说明当前未到触发条件或仍在安静时段。');
        render();
      })
      .catch(error => {
        setStatusText(error instanceof Error ? `主动检查失败：${error.message}` : String(error));
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#restore-auto-pacing')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (character) applyResetDecision(character, 'restore');
    render();
  });
  document.querySelector<HTMLButtonElement>('#keep-auto-pacing')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (character) applyResetDecision(character, 'keep');
    render();
  });
  document.querySelector<HTMLButtonElement>('#request-notification')?.addEventListener('click', () => {
    void requestNotificationPermission().then(message => {
      setStatusText(message);
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#test-notification')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (!character) {
      setStatusText('通知未发送：请先导入角色并允许通知权限。');
      render();
      return;
    }
    void sendLocalNotification(character, '这是一条本地通知测试。', character.autoMessage.notificationPrivacy)
      .then(sent => {
        setStatusText(sent ? '测试通知已发送。' : '通知未发送：请允许通知权限。');
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#force-restart-services')?.addEventListener('click', () => {
    forceRestartAllServices();
  });
  document.querySelector<HTMLButtonElement>('#export-backup')?.addEventListener('click', () => {
    setStatusText('正在导出本地备份…');
    render();
    void exportBackup()
      .then(backupInfo => {
        setStatusText(`已导出本地备份：${backupInfo.fileName}。保存位置：${backupInfo.folderHint}。`);
      })
      .catch(error => {
        setStatusText(error instanceof Error ? `备份导出失败：${error.message}` : String(error));
      })
      .finally(() => {
        render();
      });
  });
  document.querySelector<HTMLInputElement>('#backup-import')?.addEventListener('change', async event => {
    const file = (event.currentTarget as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      const restored = restoreBackupText(await file.text());
      setStatusText(`已导入备份：${restored.characters.length} 个角色，${restored.messages.length} 条消息。`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
    render();
  });
  const messageInput = document.querySelector<HTMLTextAreaElement>('#message-input');
  if (messageInput) {
    resizeComposerTextarea(messageInput);
    messageInput.addEventListener('input', event => {
      const character = activeCharacter();
      const textarea = event.currentTarget as HTMLTextAreaElement;
      noteComposerEditedAfterSubmit(character, textarea.value);
      setMessageDraft(character, textarea.value);
      resizeComposerTextarea(textarea);
      scheduleUiSessionSnapshotSave();
    });
    messageInput.addEventListener('focus', () => {
      updateKeyboardOffset();
      window.setTimeout(scrollMessagesToBottom, 80);
      window.setTimeout(scrollMessagesToBottom, 240);
    });
    messageInput.addEventListener('keydown', event => requestTextareaFormSubmit(messageInput, event));
    messageInput.addEventListener('beforeinput', event => requestTextareaFormSubmitFromBeforeInput(messageInput, event));
  }
  document.querySelector<HTMLSelectElement>('#private-chat-target-select')?.addEventListener('change', event => {
    openPrivateChatByCharacterId((event.currentTarget as HTMLSelectElement).value || '', { pushHistory: true });
  });
  document.querySelector<HTMLFormElement>('#composer')?.addEventListener('submit', event => {
    event.preventDefault();
    const character = activeCharacter();
    const input = document.querySelector<HTMLTextAreaElement>('#message-input');
    const content = input?.value ?? messageDraftFor(character);
    if (!content.trim()) return;
    if (isReplying()) {
      setStatusText('上一条消息仍在回复中。');
      return;
    }
    const shouldKeepKeyboard = Boolean(
      input
        && (
          document.activeElement === input
          || document.documentElement.classList.contains('keyboard-open')
        ),
    );
    if (shouldKeepKeyboard) requestMessageComposerFocusAfterSubmit(character?.id ?? '');
    const replyToId = clearMessageComposerAfterSubmit(character, input, content, shouldKeepKeyboard);
    requestChatStickToBottom();
    const speaker = privateChatSpeaker();
    if (state.chatReplyMode === 'manual') {
      void sendUserMessageOnly(content, render, replyToId, speaker);
    } else {
      void sendMessage(content, render, replyToId, speaker);
    }
  });
  const worldRpInput = document.querySelector<HTMLTextAreaElement>('#world-rp-input');
  if (worldRpInput) {
    resizeComposerTextarea(worldRpInput);
    worldRpInput.addEventListener('input', event => {
      const textarea = event.currentTarget as HTMLTextAreaElement;
      worldRpInputDraft = textarea.value;
      resizeComposerTextarea(textarea);
      scheduleUiSessionSnapshotSave();
    });
    worldRpInput.addEventListener('focus', () => {
      updateKeyboardOffset();
      window.setTimeout(scrollMessagesToBottom, 80);
      window.setTimeout(scrollMessagesToBottom, 240);
    });
    worldRpInput.addEventListener('keydown', event => requestTextareaFormSubmit(worldRpInput, event));
    worldRpInput.addEventListener('beforeinput', event => requestTextareaFormSubmitFromBeforeInput(worldRpInput, event));
  }
  document.querySelectorAll<HTMLButtonElement>('[data-world-rp-render-mode]').forEach(button => {
    button.addEventListener('click', () => {
      worldRpRenderMode = button.dataset.worldRpRenderMode === 'bubble' ? 'bubble' : 'narration';
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-world-event-rp]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.openWorldEventRp ?? '';
      const worldEvent = state.worldEvents.find(event => event.id === eventId && event.worldId === activeWorld().id);
      if (!worldEvent) return;
      captureVisibleDraftsFromDom();
      setActiveView('world');
      mobileSection = 'world';
      activeWorldRpEventId = worldEvent.id;
      worldRpInputDraft = '';
      saveUiSessionSnapshot({ captureDom: false });
      requestChatStickToBottom();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('[data-close-world-event-rp]')?.addEventListener('click', () => {
    activeWorldRpEventId = '';
    worldRpInputDraft = '';
    worldRpMessageEditId = '';
    saveUiSessionSnapshot({ captureDom: false });
    render();
  });
  document.querySelector<HTMLButtonElement>('[data-end-world-rp-event]')?.addEventListener('click', buttonEvent => {
    const button = buttonEvent.currentTarget as HTMLButtonElement;
    const eventId = button.dataset.endWorldRpEvent ?? '';
    const worldEvent = state.worldEvents.find(event => event.id === eventId && event.worldId === activeWorld().id);
    if (!worldEvent || worldEvent.status === 'resolved') return;
    try {
      const archived = finishWorldEventManually(eventId, buildWorldEventAutoCloseSummary(worldEvent));
      activeWorldRpEventId = '';
      worldRpInputDraft = '';
      worldRpMessageEditId = '';
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      setStatusText(`事件已结束并写入时间线：${archived.title}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-edit-world-rp-message]').forEach(button => {
    button.addEventListener('click', () => {
      worldRpMessageEditId = button.dataset.editWorldRpMessage ?? '';
      render();
      window.requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>('#world-rp-message-edit-input');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    });
  });
  const closeWorldRpMessageEdit = () => {
    worldRpMessageEditId = '';
    render();
  };
  document.querySelector<HTMLButtonElement>('#close-world-rp-message-edit')?.addEventListener('click', closeWorldRpMessageEdit);
  document.querySelector<HTMLButtonElement>('#close-world-rp-message-edit-backdrop')?.addEventListener('click', closeWorldRpMessageEdit);
  document.querySelector<HTMLButtonElement>('#cancel-world-rp-message-edit')?.addEventListener('click', closeWorldRpMessageEdit);
  document.querySelector<HTMLButtonElement>('#confirm-world-rp-message-edit')?.addEventListener('click', () => {
    const messageId = worldRpMessageEditId;
    const content = document.querySelector<HTMLTextAreaElement>('#world-rp-message-edit-input')?.value ?? '';
    if (editWorldEventRpMessage(messageId, content)) {
      setStatusText('世界 RP 记录已修改。');
    }
    worldRpMessageEditId = '';
    render();
  });
  document.querySelector<HTMLFormElement>('#world-rp-composer')?.addEventListener('submit', event => {
    event.preventDefault();
    const actor = worldRpActor();
    const character = worldRpActiveCharacter();
    const input = document.querySelector<HTMLTextAreaElement>('#world-rp-input');
    const content = input?.value ?? worldRpInputDraft;
    if (!character || !content.trim()) return;
    if (worldRpGenerating) {
      setStatusText('上一条回复还在生成中。');
      return;
    }
    const shouldKeepKeyboard = Boolean(
      input
        && (
          document.activeElement === input
          || document.documentElement.classList.contains('keyboard-open')
        ),
    );
    if (shouldKeepKeyboard) requestMessageComposerFocusAfterSubmit(character.id);
    const worldEvent = selectedWorldRpEvent() ?? ensureWorldRpEvent(character);
    activeWorldRpEventId = worldEvent.id;
    appendWorldEventRpMessage(worldEvent.id, {
      role: 'user',
      content,
      characterId: actor.characterId,
      speaker: actor.name,
      source: 'manual',
    });
    worldRpInputDraft = '';
    if (input) {
      input.value = '';
      resizeComposerTextarea(input);
    }
    requestChatStickToBottom();
    saveUiSessionSnapshot({ captureDom: false });
    // 小注释：世界 RP 不再暴露手动记录模式，发送后始终尝试围绕当前事件自动续写。
    worldRpReplyMode = 'auto';
    if (!modelIsReady()) {
      setStatusText('已写入当前事件记录；配置模型后可以自动续写。');
      render();
      return;
    }
    worldRpGenerating = true;
    setStatusText('正在围绕当前事件续写 RP…');
    render();
    void generateWorldEventRpReply(worldEvent.id, character)
      .then(() => {
        setStatusText('世界 RP 已续写。');
      })
      .catch(error => {
        setStatusText(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        worldRpGenerating = false;
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#generate-reply')?.addEventListener('click', () => {
    if (isReplying()) {
      setStatusText('上一条消息仍在回复中。');
      return;
    }
    stickerPickerOpen = false;
    messageActionId = '';
    requestChatStickToBottom();
    void generateReply(render);
  });
  document.querySelector<HTMLButtonElement>('#cancel-quote')?.addEventListener('click', () => {
    quotedMessageId = '';
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#stop-reply')?.addEventListener('click', () => {
    if (stopReply()) {
      setStatusText('正在停止回复…');
      render();
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-quote-message]').forEach(button => {
    button.addEventListener('click', () => {
      quotedMessageId = button.dataset.quoteMessage ?? '';
      messageActionId = '';
      preserveScrollForNextRender();
      render();
      document.querySelector<HTMLTextAreaElement>('#message-input')?.focus();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-pin-message-timeline]').forEach(button => {
    button.addEventListener('click', () => {
      const messageId = button.dataset.pinMessageTimeline ?? '';
      const message = state.messages.find(item => item.id === messageId);
      const character = message ? state.characters.find(item => item.id === message.characterId) : undefined;
      if (message && character) {
        const timelineEntry = addChatMessageTimelineEntry(message, character);
        recordTimelineEntryImpact(
          timelineEntry,
          `chat_memory:${message.id}`,
          `重要聊天记忆：${character.name}`,
        );
        setStatusText('这句话已放进世界记录。');
      }
      messageActionId = '';
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-message-menu]').forEach(button => {
    button.addEventListener('click', () => {
      messageDeleteChoiceId = button.dataset.deleteMessageMenu ?? '';
      messageActionId = '';
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-edit-message]').forEach(button => {
    button.addEventListener('click', () => {
      messageEditId = button.dataset.editMessage ?? '';
      messageActionId = '';
      preserveScrollForNextRender();
      render();
      window.requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>('#message-edit-input');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-regenerate-message]').forEach(button => {
    button.addEventListener('click', () => {
      const messageId = button.dataset.regenerateMessage ?? '';
      messageActionId = '';
      requestChatStickToBottom();
      void regenerateAssistantMessage(messageId, render);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-message-variant-prev]').forEach(button => {
    button.addEventListener('click', () => {
      if (selectMessageVariant(button.dataset.messageVariantPrev ?? '', -1)) render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-message-variant-next]').forEach(button => {
    button.addEventListener('click', () => {
      if (selectMessageVariant(button.dataset.messageVariantNext ?? '', 1)) render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-message-profile-character]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const rect = button.getBoundingClientRect();
      const popoverWidth = 280;
      messageProfileCharacterId = button.dataset.messageProfileCharacter ?? '';
      messageProfileAnchor = {
        left: compactMedia.matches
          ? Math.min(Math.max(12, rect.left), window.innerWidth - popoverWidth - 12)
          : Math.min(rect.right + 10, window.innerWidth - popoverWidth - 12),
        top: Math.min(Math.max(76, rect.top - 8), window.innerHeight - 220),
      };
      messageActionId = '';
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-close-message-profile]').forEach(button => {
    button.addEventListener('pointerdown', event => {
      event.preventDefault();
      closeMessageProfilePopover();
    });
    button.addEventListener('click', closeMessageProfilePopover);
  });
  const closeMessageEdit = () => {
    messageEditId = '';
    render();
  };
  document.querySelector<HTMLButtonElement>('#close-message-edit')?.addEventListener('click', closeMessageEdit);
  document.querySelector<HTMLButtonElement>('#close-message-edit-backdrop')?.addEventListener('click', closeMessageEdit);
  document.querySelector<HTMLButtonElement>('#cancel-message-edit')?.addEventListener('click', closeMessageEdit);
  document.querySelector<HTMLButtonElement>('#confirm-message-edit')?.addEventListener('click', () => {
    const messageId = messageEditId;
    const content = document.querySelector<HTMLTextAreaElement>('#message-edit-input')?.value ?? '';
    messageEditId = '';
    void editUserMessageAndRegenerate(messageId, content, render);
  });
  const closeMessageChoice = () => {
    messageDeleteChoiceId = '';
    render();
  };
  document.querySelector<HTMLButtonElement>('#cancel-message-choice')?.addEventListener('click', closeMessageChoice);
  document.querySelector<HTMLButtonElement>('#close-message-choice')?.addEventListener('click', closeMessageChoice);
  document.querySelector<HTMLButtonElement>('#confirm-delete-message')?.addEventListener('click', () => {
    const messageId = messageDeleteChoiceId;
    if (deleteMessage(messageId)) {
      if (quotedMessageId === messageId || !state.messages.some(message => message.id === quotedMessageId)) quotedMessageId = '';
      setStatusText('消息已彻底删除，后续不会提供给 AI。');
    }
    messageDeleteChoiceId = '';
    render();
  });
  document.querySelector<HTMLButtonElement>('#confirm-recall-message')?.addEventListener('click', () => {
    const messageId = messageDeleteChoiceId;
    if (recallMessage(messageId)) {
      if (quotedMessageId === messageId) quotedMessageId = '';
      setStatusText('消息已撤回，聊天中保留痕迹。');
    }
    messageDeleteChoiceId = '';
    render();
  });
  document.querySelectorAll<HTMLElement>('[data-message-id]').forEach(message => {
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let pointerId = -1;
    let swipeDistance = 0;
    let gestureAxis: 'pending' | 'horizontal' | 'vertical' = 'pending';
    let swipeReady = false;
    const row = message.closest<HTMLElement>('.message-row');
    const openActions = () => {
      const messageId = message.dataset.messageId ?? '';
      const target = state.messages.find(item => item.id === messageId);
      if (!target || target.recalledAt) return;
      shouldStickChatToBottom = false;
      captureActionMenuAnchor('message', messageId, message);
      messageActionId = messageId;
      render();
    };
    const cancelLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = undefined;
    };
    message.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('button')) return;
      cancelLongPress();
      pointerId = event.pointerId;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      swipeDistance = 0;
      swipeReady = false;
      gestureAxis = 'pending';
      message.classList.remove('is-returning');
      longPressTimer = setTimeout(openActions, 360);
    });
    message.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      const deltaX = event.clientX - pointerStartX;
      const deltaY = event.clientY - pointerStartY;
      if (Math.abs(deltaX) > 18 || Math.abs(deltaY) > 18) cancelLongPress();
      if (gestureAxis === 'pending' && Math.max(Math.abs(deltaX), Math.abs(deltaY)) >= 8) {
        gestureAxis = Math.abs(deltaX) > Math.abs(deltaY) * 1.2 ? 'horizontal' : 'vertical';
        if (gestureAxis === 'horizontal') {
          message.setPointerCapture(event.pointerId);
          message.classList.add('is-swiping');
        }
      }
      if (gestureAxis !== 'horizontal') return;
      event.preventDefault();
      const rawDistance = Math.max(0, -deltaX);
      swipeDistance = rawDistance <= 56
        ? rawDistance
        : Math.min(76, 56 + (rawDistance - 56) * 0.28);
      const nextReady = rawDistance >= 56;
      if (nextReady && !swipeReady && navigator.vibrate) navigator.vibrate(8);
      swipeReady = nextReady;
      message.style.setProperty('--message-swipe-x', `${-swipeDistance}px`);
      message.style.setProperty('--swipe-progress', `${Math.min(1, rawDistance / 56)}`);
      row?.classList.toggle('is-swipe-ready', swipeReady);
    });
    const finishSwipe = (activateQuote: boolean) => {
      cancelLongPress();
      if (pointerId >= 0 && message.hasPointerCapture(pointerId)) message.releasePointerCapture(pointerId);
      message.classList.remove('is-swiping');
      message.classList.add('is-returning');
      row?.classList.remove('is-swipe-ready');
      message.style.setProperty('--message-swipe-x', '0px');
      message.style.setProperty('--swipe-progress', '0');
      pointerId = -1;
      swipeDistance = 0;
      swipeReady = false;
      window.setTimeout(() => {
        message.classList.remove('is-returning');
        message.style.removeProperty('--message-swipe-x');
        message.style.removeProperty('--swipe-progress');
        if (!activateQuote) return;
        quotedMessageId = message.dataset.messageId ?? '';
        messageActionId = '';
        render();
        document.querySelector<HTMLTextAreaElement>('#message-input')?.focus();
      }, 190);
    };
    message.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      finishSwipe(gestureAxis === 'horizontal' && swipeReady);
    });
    message.addEventListener('pointercancel', () => {
      finishSwipe(false);
    });
    message.addEventListener('contextmenu', event => {
      event.preventDefault();
      openActions();
    });
  });
  document.querySelector<HTMLButtonElement>('#toggle-stickers')?.addEventListener('click', () => {
    stickerPickerOpen = !stickerPickerOpen;
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-send-sticker]').forEach(button => {
    button.addEventListener('click', () => {
      stickerPickerOpen = false;
      void sendStickerMessage(button.dataset.sendSticker ?? '', render, privateChatSpeaker());
    });
  });
  document.querySelector<HTMLSelectElement>('#moment-author-select')?.addEventListener('change', event => {
    momentComposerAuthorId = (event.currentTarget as HTMLSelectElement).value || 'user';
    momentComposerTextDraft = document.querySelector<HTMLTextAreaElement>('#moment-input')?.value ?? '';
    momentGenerationStatus = '';
    render();
  });
  document.querySelector<HTMLSelectElement>('#moment-visibility-mode')?.addEventListener('change', event => {
    momentVisibilityMode = (event.currentTarget as HTMLSelectElement).value as MomentVisibilityMode;
    if (momentVisibilityMode === 'private') momentVisibilityPickerOpenFor = null;
    scheduleUiSessionSnapshotSave();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-moment-visibility-picker]').forEach(button => {
    button.addEventListener('click', () => {
      const mode = button.dataset.momentVisibilityPicker === 'blocked' ? 'blocked' : 'specific';
      momentVisibilityPickerOpenFor = momentVisibilityPickerOpenFor === mode ? null : mode;
      scheduleUiSessionSnapshotSave();
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-character]').forEach(input => {
    input.addEventListener('change', event => {
      const target = event.currentTarget as HTMLInputElement;
      if (target.checked) momentVisibilityCharacterIds.add(target.value);
      else momentVisibilityCharacterIds.delete(target.value);
      scheduleUiSessionSnapshotSave();
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-blocked]').forEach(input => {
    input.addEventListener('change', event => {
      const target = event.currentTarget as HTMLInputElement;
      if (target.checked) momentVisibilityBlockedIds.add(target.value);
      else momentVisibilityBlockedIds.delete(target.value);
      scheduleUiSessionSnapshotSave();
      render();
    });
  });
  document.querySelector<HTMLTextAreaElement>('#moment-input')?.addEventListener('input', event => {
    momentComposerTextDraft = (event.currentTarget as HTMLTextAreaElement).value;
    scheduleUiSessionSnapshotSave();
  });
  document.querySelector<HTMLTextAreaElement>('#moment-input')?.addEventListener('focus', () => {
    setMomentComposerKeyboardFocus(true);
    keepMomentComposerVisible();
  });
  document.querySelector<HTMLTextAreaElement>('#moment-input')?.addEventListener('blur', () => {
    window.setTimeout(() => setMomentComposerKeyboardFocus(false), 120);
  });
  document.querySelector<HTMLTextAreaElement>('#timeline-note-input')?.addEventListener('input', event => {
    timelineNoteDraft = (event.currentTarget as HTMLTextAreaElement).value;
    scheduleUiSessionSnapshotSave();
  });
  document.querySelector<HTMLFormElement>('#timeline-note-form')?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      addManualTimelineNote(fieldValue<HTMLTextAreaElement>('#timeline-note-input'));
      timelineNoteDraft = '';
      saveUiSessionSnapshot({ captureDom: false });
      setStatusText('这件事已写入世界时间线。');
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-rollback-timeline]').forEach(button => {
    button.addEventListener('click', () => {
      const result = rollbackTimelineEntryImpact(button.dataset.rollbackTimeline ?? '');
      setStatusText(result.ok ? '这次影响已撤销。' : result.reason ?? '撤销失败。');
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-comment-input]').forEach(input => {
    input.addEventListener('input', event => {
      const target = event.currentTarget as HTMLInputElement;
      const momentId = target.dataset.commentInput ?? '';
      if (momentId) momentCommentDrafts.set(momentId, target.value);
      scheduleUiSessionSnapshotSave();
    });
  });
  document.querySelectorAll<HTMLSelectElement>('[data-comment-author-select]').forEach(select => {
    select.addEventListener('change', event => {
      const target = event.currentTarget as HTMLSelectElement;
      const momentId = target.dataset.commentAuthorSelect ?? '';
      if (momentId) momentCommentAuthorDrafts.set(momentId, target.value || 'user');
      scheduleUiSessionSnapshotSave();
    });
  });
  document.querySelectorAll<HTMLElement>('[data-moment-comment-tap]').forEach(comment => {
    let longPressTimer: number | undefined;
    const momentId = comment.dataset.momentCommentMoment ?? '';
    const commentId = comment.dataset.momentCommentTap ?? '';
    const clearLongPress = () => {
      if (longPressTimer) window.clearTimeout(longPressTimer);
      longPressTimer = undefined;
    };
    const openMenu = () => {
      clearLongPress();
      openMomentCommentActionMenu(momentId, commentId);
      render();
    };
    comment.addEventListener('click', event => {
      if ((event.target as HTMLElement).closest('button, select, option')) return;
      if (Date.now() < momentCommentSuppressTapUntil) return;
      setMomentCommentReplyTarget(momentId, commentId);
      render();
    });
    comment.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setMomentCommentReplyTarget(momentId, commentId);
      render();
    });
    comment.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement).closest('button, select, option')) return;
      clearLongPress();
      longPressTimer = window.setTimeout(openMenu, 520);
    });
    comment.addEventListener('pointerup', clearLongPress);
    comment.addEventListener('pointercancel', clearLongPress);
    comment.addEventListener('pointerleave', clearLongPress);
    comment.addEventListener('contextmenu', event => {
      event.preventDefault();
      openMenu();
    });
  });
  if (momentCommentActionMenu) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.moment-comment-menu, [data-moment-comment-menu]')) return;
      momentCommentActionMenu = null;
      render();
    }, { capture: true, once: true });
  }
  document.querySelectorAll<HTMLButtonElement>('[data-clear-comment-reply]').forEach(button => {
    button.addEventListener('click', () => {
      const momentId = button.dataset.clearCommentReply ?? '';
      if (momentId) {
        momentCommentReplyTargetDrafts.delete(momentId);
        clearMomentCommentActionMenu(momentId);
        focusMomentCommentAfterRenderId = momentId;
        saveUiSessionSnapshot({ captureDom: true });
      }
      render();
    });
  });
  document.querySelector<HTMLFormElement>('#moment-composer')?.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const content = fieldValue<HTMLTextAreaElement>('#moment-input');
      if (!content.trim()) {
        momentGenerationStatus = '动态至少要写一个字。';
        setVisibleStatus(momentGenerationStatus);
        render();
        return;
      }
      const author = state.characters.find(character =>
        character.id === momentComposerAuthorId && character.worldId === activeWorld().id,
      );
      const moment = publishMoment(content, author, author ? 'character' : 'manual', currentMomentVisibilityDraft());
      const hasVisibleCharacters = visibleCharactersForMoment(moment).length > 0;
      resetMomentComposerDraft();
      saveUiSessionSnapshot({ captureDom: false });
      momentGenerationStatus = author
        ? `${author.name} 的动态已发布。`
        : modelIsReady() && hasVisibleCharacters
          ? '动态已发布，正在看看哪些角色感兴趣…'
          : modelIsReady()
            ? '动态已发布。没有角色会看到这条动态。'
            : '动态已发布。配置模型后，角色会自动判断是否评论。';
      momentComposerOpen = false;
      setMomentComposerKeyboardFocus(false);
      setVisibleStatus(momentGenerationStatus);
      render();
      if (hasVisibleCharacters) void inviteInterestedCharacters(moment.id);
      return;
    } catch (error) {
      setVisibleStatus(error instanceof Error ? error.message : String(error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>('#generate-moment')?.addEventListener('click', () => {
    const character = state.characters.find(item =>
      item.id === momentComposerAuthorId && item.worldId === activeWorld().id,
    );
    if (!character) {
      momentGenerationStatus = '请先在发布身份里选择一个角色。';
      setVisibleStatus(momentGenerationStatus);
      render();
      return;
    }
    if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
      momentGenerationStatus = '还没有配置模型，请先到“设置 -> 模型连接”填写 API 地址和模型名称。';
      setVisibleStatus(momentGenerationStatus);
      render();
      return;
    }
    momentGenerating = true;
    momentGenerationStatus = `正在让 ${character.name} 生成动态草稿…`;
    setVisibleStatus(momentGenerationStatus);
    render();
    void generateCharacterMomentDraft(character)
      .then(content => {
        momentComposerTextDraft = content;
        momentGenerationStatus = `${character.name} 已写好草稿，确认后点“发布动态”。`;
        saveUiSessionSnapshot({ captureDom: false });
        setVisibleStatus(momentGenerationStatus);
        render();
      })
      .catch(error => {
        momentGenerationStatus = error instanceof Error ? error.message : String(error);
        setVisibleStatus(momentGenerationStatus);
        render();
      })
      .finally(() => {
        momentGenerating = false;
        render();
      });
  });
  document.querySelectorAll<HTMLFormElement>('[data-comment-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const momentId = form.dataset.commentForm ?? '';
      try {
        const input = document.querySelector<HTMLInputElement>(`[data-comment-input="${momentId}"]`);
        const authorId = document.querySelector<HTMLSelectElement>(
          `[data-comment-author-select="${momentId}"]`,
        )?.value ?? momentCommentAuthorDrafts.get(momentId) ?? 'user';
        const commentCharacter = authorId === 'user'
          ? undefined
          : state.characters.find(item => item.id === authorId && item.worldId === activeWorld().id);
        const replyToCommentId = momentCommentReplyTargetDrafts.get(momentId);
        const comment = addMomentComment(
          momentId,
          input?.value ?? momentCommentDrafts.get(momentId) ?? '',
          commentCharacter,
          'manual',
          replyToCommentId,
        );
        if (input) input.value = '';
        momentCommentDrafts.delete(momentId);
        momentCommentReplyTargetDrafts.delete(momentId);
        clearMomentCommentActionMenu(momentId);
        momentCommentAuthorDrafts.set(momentId, authorId || 'user');
        const moment = state.moments.find(item => item.id === momentId);
        const willReply = Boolean(moment?.characterId && !commentCharacter && modelIsReady());
        setStatusText(willReply ? '评论已发送，对方正在回复…' : '评论已发送。');
        render();
        if (willReply) void replyToUserComment(momentId, comment.id);
        return;
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : String(error));
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-character-comment]').forEach(button => {
    button.addEventListener('click', () => {
      const momentId = button.dataset.characterComment ?? '';
      const moment = state.moments.find(item => item.id === momentId);
      const selectedCharacterId = document.querySelector<HTMLSelectElement>(
        `[data-character-select="${momentId}"]`,
      )?.value ?? '';
      const character = state.characters.find(item =>
        item.id === selectedCharacterId && item.worldId === activeWorld().id,
      );
      if (!moment || !character) return;
      if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再让角色评论。');
        render();
        return;
      }
      commentingMomentId = momentId;
      momentGenerationStatus = `正在生成 ${character.name} 的评论…`;
      setStatusText(momentGenerationStatus);
      render();
      void generateCharacterComment(moment, character)
        .then(() => {
          momentGenerationStatus = `${character.name} 已评论你的动态。`;
          setStatusText(momentGenerationStatus);
        })
        .catch(error => {
          momentGenerationStatus = `角色评论失败：${error instanceof Error ? error.message : String(error)}`;
          setStatusText(momentGenerationStatus);
        })
        .finally(() => {
          commentingMomentId = '';
          render();
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-comment-character-reply]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const momentId = button.dataset.openCommentCharacterReplyMoment ?? '';
      const commentId = button.dataset.openCommentCharacterReply ?? '';
      openMomentCommentActionMenu(momentId, commentId, true);
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-submit-comment-character-reply]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const momentId = button.dataset.submitCommentCharacterReplyMoment ?? '';
      const commentId = button.dataset.submitCommentCharacterReply ?? '';
      const moment = state.moments.find(item => item.id === momentId);
      const selectedCharacterId = document.querySelector<HTMLSelectElement>(
        `[data-comment-character-reply-select="${commentId}"][data-comment-character-reply-moment="${momentId}"]`,
      )?.value ?? '';
      const character = state.characters.find(item =>
        item.id === selectedCharacterId && item.worldId === activeWorld().id,
      );
      if (!moment || !character || !commentId) return;
      if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再让角色回复评论。');
        render();
        return;
      }
      commentingMomentId = momentId;
      momentGenerationStatus = `正在生成 ${character.name} 的回复…`;
      setStatusText(momentGenerationStatus);
      clearMomentCommentActionMenu(momentId, commentId);
      render();
      void generateCharacterComment(moment, character, { targetCommentId: commentId })
        .then(() => {
          momentGenerationStatus = `${character.name} 已回复这条评论。`;
          setStatusText(momentGenerationStatus);
        })
        .catch(error => {
          momentGenerationStatus = `角色回复失败：${error instanceof Error ? error.message : String(error)}`;
          setStatusText(momentGenerationStatus);
        })
        .finally(() => {
          commentingMomentId = '';
          render();
        });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-author-reply-comment]').forEach(button => {
    button.addEventListener('click', () => {
      const momentId = button.dataset.authorReplyMoment ?? '';
      const commentId = button.dataset.authorReplyComment ?? '';
      const moment = state.moments.find(item => item.id === momentId);
      const character = moment?.characterId
        ? state.characters.find(item => item.id === moment.characterId && item.worldId === activeWorld().id)
        : undefined;
      if (!moment || !character || !commentId) return;
      if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再让楼主回复评论。');
        render();
        return;
      }
      autoCommentingMomentIds.add(momentId);
      momentGenerationStatus = `正在让 ${character.name} 回复这条评论…`;
      setStatusText(momentGenerationStatus);
      clearMomentCommentActionMenu(momentId, commentId);
      render();
      void generateCharacterComment(moment, character, { countBudget: true, targetCommentId: commentId })
        .then(() => {
          momentGenerationStatus = `${character.name} 已回复这条评论。`;
          setStatusText(momentGenerationStatus);
        })
        .catch(error => {
          momentGenerationStatus = `楼主回复失败：${error instanceof Error ? error.message : String(error)}`;
          setStatusText(momentGenerationStatus);
        })
        .finally(() => {
          autoCommentingMomentIds.delete(momentId);
          render();
        });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-comment]').forEach(button => {
    button.addEventListener('click', () => {
      const momentId = button.dataset.deleteCommentMoment ?? '';
      const commentId = button.dataset.deleteComment ?? '';
      if (deleteMomentComment(momentId, commentId)) {
        momentCommentReplyTargetDrafts.delete(momentId);
        clearMomentCommentActionMenu(momentId);
        setStatusText('评论已删除。');
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-moment-id]').forEach(button => {
    button.addEventListener('click', () => {
      if (deleteMoment(button.dataset.momentId ?? '')) setStatusText('动态已删除。');
      render();
    });
  });
  const closeEventComposer = () => {
    captureEventComposerDraftFromDom();
    eventComposerOpen = false;
    preserveScrollForNextRender();
    saveUiSessionSnapshot();
    render();
  };
  document.querySelector<HTMLButtonElement>('#close-event-composer')?.addEventListener('click', closeEventComposer);
  document.querySelector<HTMLButtonElement>('#close-event-composer-backdrop')?.addEventListener('click', closeEventComposer);
  document.querySelector<HTMLButtonElement>('#cancel-event-composer')?.addEventListener('click', closeEventComposer);
  document.querySelectorAll<HTMLInputElement>('[data-event-participant]').forEach(input => {
    input.addEventListener('change', () => {
      eventComposerDraft.participantIds = Array.from(document.querySelectorAll<HTMLInputElement>('[data-event-participant]:checked'))
        .map(item => item.value)
        .filter(Boolean);
      scheduleUiSessionSnapshotSave();
    });
  });
  document.querySelector<HTMLFormElement>('#event-composer')?.addEventListener('submit', event => {
    event.preventDefault();
    captureEventComposerDraftFromDom();
    const leadActor = eventComposerLeadActor();
    const participantIds = eventComposerParticipantIds();
    try {
      if (!modelIsReady()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再生成生活线索。');
        preserveScrollForNextRender();
        render();
        return;
      }
      const leadCharacter = leadActor.characterId
        ? state.characters.find(character => character.id === leadActor.characterId && character.worldId === activeWorld().id)
        : undefined;
      eventGenerating = true;
      setStatusText(`正在生成 ${leadActor.name} 发起的生活线索…`);
      preserveScrollForNextRender();
      render();
      void generateWorldEvent(leadCharacter, 'model', { leadActor, participantCharacterIds: participantIds })
        .then(worldEvent => {
          activeWorldRpEventId = worldEvent.id;
          eventComposerOpen = false;
          eventComposerDraft = { title: '', description: '', participantIds: [], affinityDelta: '0' };
          saveUiSessionSnapshot();
          setStatusText(`生活线索已生成：${worldEvent.title}`);
        })
        .catch(error => {
          setStatusText(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          eventGenerating = false;
          preserveScrollForNextRender();
          render();
        });
      return;
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
    render();
  });
  document.querySelector<HTMLButtonElement>('#generate-event')?.addEventListener('click', () => {
    openEventComposer();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-event-composer]').forEach(button => {
    button.addEventListener('click', () => {
      openEventComposer();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.eventChoice ?? '';
      const choiceId = button.dataset.eventChoiceId ?? '';
      if (!modelIsReady()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再生成事件后续。');
        render();
        return;
      }
      eventResolvingId = eventId;
      setStatusText('正在生成这条分支的后续结果…');
      render();
      void resolveWorldEventChoice(eventId, choiceId)
        .then(worldEvent => {
          setStatusText(`事件已结算：${worldEvent.title}`);
        })
        .catch(error => {
          setStatusText(`后续生成失败：${error instanceof Error ? error.message : String(error)}`);
        })
        .finally(() => {
          eventResolvingId = '';
          render();
        });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-event-manual-finish]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.eventManualFinish ?? '';
      const input = document.querySelector<HTMLTextAreaElement>(`[data-event-manual-input="${eventId}"]`);
      try {
        const worldEvent = finishWorldEventManually(eventId, input?.value ?? '');
        setStatusText(`已保存手写事件结果：${worldEvent.title}`);
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : String(error));
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-resolve-event]').forEach(button => {
    button.addEventListener('click', () => {
      if (resolveWorldEvent(button.dataset.resolveEvent ?? '')) {
        setStatusText('事件已直接记为结束，并写入近期生活记忆。');
      }
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-event]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.deleteEvent ?? '';
      const hasActiveImpact = recordsForOperation(`event:${eventId}:resolved`).some(record => !record.rolledBackAt);
      const event = state.worldEvents.find(item => item.id === eventId);
      if (!window.confirm(`确定删除事件“${event?.title ?? '这条事件'}”吗？删除后会从生活线索流移除，时间线会保留一条删除记录。`)) {
        return;
      }
      const rollbackImpact = hasActiveImpact
        ? window.confirm('这条事件已经影响关系。是否同时撤销这些关系影响？选择“取消”会删除事件，但保留已经发生的关系变化。')
        : true;
      if (deleteWorldEvent(eventId, { rollbackImpact })) {
        setStatusText(rollbackImpact ? '事件已删除，相关影响也已撤销。' : '事件已删除，已保留既有关系影响。');
      }
      render();
    });
  });
}
