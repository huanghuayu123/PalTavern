/**
 * 大注释：Main UI module.
 * Keeps the original PalTavern rendering, event binding, and view switching in one UI surface.
 */
import type {
  ChatReplyMode,
  CharacterProfile,
  GroupChatProfile,
  ModelProvider,
  MomentEntry,
  MomentVisibilityMode,
  NotificationPrivacy,
  PrivateChatEventSuggestion,
  PromptPreset,
  CharacterRelationshipSide,
  RelationshipStage,
  RelationshipState,
  StickerAsset,
  TimelineEntry,
  WorldEvent,
  WorldEventLeadActor,
  WorldEventRpMessage,
  WorldWeatherLocation,
} from '../core/types';
import {
  bindAuthoringUi,
  bindDraftManager,
  isAuthoringOpen,
  renderAuthoringScreen,
  renderDraftManager,
} from './authoring-ui';
import {
  exportBackup,
  formatBackupRestoreWarning,
  previewBackupRestoreText,
  restoreBackupText,
} from '../data/backup';
import {
  downloadWorldBundle,
  importWorldBundlePreview,
  previewWorldBundleText,
  type WorldBundleImportSelection,
  type WorldBundlePreview,
} from '../data/world-bundle';
import {
  backgroundInteractionStats,
  refreshCharacterCurrentPlan,
  scheduleNextBackgroundInteraction,
} from '../social/background-interactions';
import {
  characterFromCardCandidate,
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
  ignoreCharacterRelationshipSuggestion,
  relationshipSideFor,
  updateCharacterRelationshipSide,
} from '../characters/relationships';
import {
  appendCharacterWorldBookEntry,
  characterSettingsText,
  characterWorldBookEntryDrafts,
  deleteCharacterWorldBookEntry,
  setCharacterWorldBookEntryDrafts,
} from '../characters/settings';
import { createAutoMessagePacingStrategy, DEFAULT_AUTO_MESSAGE_PACING_STRATEGY } from '../chat/auto-message-strategy';
import {
  currentReplyStreamPreview,
  deleteMessage,
  editUserMessageAndRegenerate,
  generateReply,
  generateOpeningMessage,
  isReplying,
  isOpeningMessageGenerating,
  messageVariantInfo,
  onReplyStreamChange,
  recallMessage,
  regenerateAssistantMessage,
  rebuildPrivateChatAutoMemoryForCharacter,
  resetReplyState,
  sendMessage,
  sendUserMessageOnly,
  sendStickerMessage,
  selectMessageVariant,
  setStatusText as setChatStatusText,
  statusText,
  stopReply,
} from '../chat/private-chat';
import type { ParsedChatPart } from '../chat/format';
import {
  appendCharacterDirectMessage,
  characterDirectMessagesFor,
  characterDirectThreadsForActor,
  detectCharacterDirectMessageEventSuggestion,
  ensureCharacterDirectThread,
  generateCharacterDirectReply,
  markCharacterDirectThreadRead,
} from '../chat/character-direct-chat';
import {
  createWorldEvent,
  createWorldEventFromPrivateChatSuggestion,
  deleteWorldEvent,
  dismissPrivateChatEventSuggestion,
  eventTypeLabel,
  eventsForActiveWorld,
  finishWorldEventManually,
  generateWorldEvent,
  generateWorldEventRpReply,
  appendWorldEventRpMessage,
  deleteWorldEventRpMessage,
  editWorldEventRpMessage,
  ensureWorldRpEvent,
  markPrivateChatEventSuggestionAccepted,
  regenerateWorldEventRpMessage,
  resolveWorldEvent,
  resolveWorldEventChoice,
  selectWorldEventRpMessageVariant,
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
  relationshipSnapshot,
  rollbackTimelineEntryImpact,
} from '../memory/impacts';
import {
  addMomentComment,
  deleteMomentComment,
  deleteMomentForUndo,
  generateCharacterComment,
  generateCharacterMomentDraft,
  momentsForFeed,
  publishMoment,
  restoreDeletedMoment,
  spreadMomentInteractions,
  type DeletedMomentSnapshot,
} from '../social/moments';
import {
  canCharacterViewMoment,
  momentVisibilityLabel,
  normalizeMomentVisibilityDraft,
  visibleCharactersForMoment,
} from '../social/moment-visibility';
import {
  characterStatusLine,
  refreshCharacterStatusSummary,
} from '../memory/character-status';
import {
  confirmMemorySummary,
  contextMemorySummariesFor,
  discardMemorySummary,
  memorySummariesForWorld,
  pauseMemorySummary,
  refreshMacroSummaryForWorld,
  refreshMiddleSummaryForCharacter,
  refreshMicroSummaryForCharacter,
  resumeMemorySummary,
  summaryLayerLabel,
  updateMemorySummary,
} from '../memory/summaries';
import {
  addTimelineEntry,
  addChatMessageTimelineEntry,
  addManualTimelineNote,
  addRelationshipTimelineEntry,
  filterTimelineEntries,
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
  communicationActor,
  communicationActorId,
  createWorld,
  deleteWorld,
  conversationFor,
  ensureConversation,
  groupMessagesFor,
  isStorageSaveFailing,
  markConversationRead,
  messagesFor,
  normalizeChatBackgroundImage,
  normalizeChatFontScale,
  onStorageSaveStatusChange,
  resetDailyModelUsage,
  saveState,
  setCommunicationActor,
  setActiveView,
  setActiveWorld,
  state,
  unreadCountFor,
} from '../core/state';
import { downloadSillyTavernCard } from '../characters/tavern-export';
import { callAuthoringModel, fetchModelList, testModelConnection } from '../model/client';
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
import { companionTimeModeLabel, formatClockMinutes, formatCompanionDateTime } from '../core/time';
import { compactText, escapeHtml, nowId } from '../core/utils';
import { markWelcomeCoverSeen, renderWelcomeCover, shouldShowWelcomeCover } from './welcome-cover';
import { renderCardImportDiagnostics } from './card-import-diagnostics';
import {
  isFirstRunGuideDismissed,
  markFirstRunGuideDismissed,
  renderFirstRunGuide,
  type FirstRunGuideState,
} from './first-run-guide';
import {
  refreshWorldWeather,
  searchWeatherLocations,
  weatherLocationLabel,
  weatherSnapshotLine,
} from '../world/weather';
import {
  parseRpRenderSegments,
} from './rp-rendering';
import {
  desktopViewTransition,
  mainSectionTransition,
  prepareActionExpandFromElement,
  prepareChatRevealFromElement,
  renderWithUiTransition as runUiTransition,
  type UiTransitionKind,
} from './transitions';
import { icon, type IconName } from './icons';
import {
  avatarToneAttribute,
  chatSurfaceStyle,
  readImageInputAsDataUrl,
  renderAvatar,
  renderChatBackgroundControl,
  renderUserAvatar,
} from './chat-surface';
import { displayImageUrl } from './image-urls';
import {
  apiUrlForProvider,
  modelProviderFor,
  modelProviderOptions,
  modelProviderValue,
} from './model-settings';
import {
  renderParameterSummary,
  renderSettingsFold,
  renderSwitchControl,
} from './settings-ui';
import {
  characterContactSubtitle,
  countdownText,
  formatConversationTime,
  messageTimelineHint,
} from './display-labels';
import {
  bindAppDialog,
  openAppAlert,
  openAppConfirm,
  openAppPrompt,
  renderAppDialog,
} from './app-dialogs';
import {
  renderWorldDrawerTimeline,
  type WorldWorkbenchPanelContext,
} from './world-workbench-panels';
import {
  cardRecognitionMessages,
  generateCharacterReplyStrategy,
  generateImportAutoMessagePacingStrategy,
  generateImportProfileNote,
  modelIsReady,
  parseAiCardRecognition,
} from './card-ai-import';
import {
  characterRelationshipChangeSummary,
  characterRelationshipSideChanged,
  chatStatusShelfOpenCharacterIds,
  readCharacterWorldBookEntryDraftsFromPanel,
  relationshipChangeSummary,
  relationshipChanged,
  relationshipLabel,
  renderCharacterHeader,
  renderCharacterIntroCard,
  renderCharacterStatusPage,
  renderCharacterWorldBookPage,
  renderChatStatusShelf,
} from './character-pages';
import {
  canRefocusComposerInput,
  captureGroupMessageInputFocus,
  focusComposerInputForKeyboard,
  groupMessageDraftFor,
  groupMessageDrafts,
  isChatScrollNearBottom,
  isImeComposing,
  keepMomentComposerVisible,
  messageDraftFor,
  messageDrafts,
  requestTextareaFormSubmit,
  requestTextareaFormSubmitFromBeforeInput,
  resizeComposerTextarea,
  restoreMomentInputFocus,
  scrollMessagesToBottom,
  setGroupMessageDraft,
  setMessageDraft,
  setMomentComposerKeyboardFocus,
  updateKeyboardOffset,
} from './composer-input';
import {
  ensureGroupChatForSpeaker,
  groupChatBackgroundImage,
  groupChatSortTime,
  groupChatsForPrivateIdentity,
  groupReplyLivelinessDescription,
  groupReplyLivelinessValue,
  groupSpeakerName,
  lastGroupMessageFor,
  renderGroupAvatarStack,
  renderGroupHeader,
  renderGroupManagementSection,
  renderGroupMemberActions,
  renderGroupMessageAvatar,
  renderGroupParticipantsEditor,
  renderGroupReplyLivelinessOptions,
  renderGroupSpeakerPicker,
  userSelfLabel,
} from './group-chat-view';
import {
  activePrivateChatEventSuggestion,
  activePrivateChatTarget,
  characterDirectPeerThread,
  characterDirectSourceLabel,
  characterDirectSpeakerName,
  characterDirectThreadForTarget,
  characterDirectUnreadCount,
  closePrivateIdentityMenus,
  contactActivityTimeFor,
  isCharacterDirectChat,
  lastMessageFor,
  privateChatBackgroundImage,
  privateChatIdentityCharacter,
  privateChatSpeaker,
  privateChatSpeakerAvatar,
  privateChatSpeakerName,
  privateConversationActorId,
  renderPrivateChatTargetSelector,
} from './private-chat-identity';
import {
  bindCompanionTimeControls,
  cardCandidateSourceLabel,
  cardImportFollowupLabel,
  checked,
  companionTimeMinutesFromFields,
  fieldValue,
  finiteNumber,
  fontScaleLabel,
  isCardImportFollowupAction,
  promptPresetById,
  renderAutoMessage,
  renderCharacterRelationshipEditor,
  renderCompanionTimeFields,
  renderPromptPresetOptions,
  renderPromptPresetRows,
  renderPromptRegexRows,
  renderRelationship,
  renderStickerLibrary,
  selectedCompanionTimeMode,
  stickerScopeLabel,
  worldBundleExportedAtLabel,
  worldBundleImportRows,
} from './settings-panels';
import type {
  CardImportFollowupAction,
  EventComposerDraft,
  GroupMessageInputFocusSnapshot,
  MomentInputFocusSnapshot,
  StickerLibraryScope,
  WorldEventSettingsPanelContext,
  WorldInsightTab,
  WorldTimelineTypeFilter,
} from './ui-types';
import {
  compactMedia,
  getViewportLayoutMode,
  isCompactViewport,
  tabletLandscapeMedia,
} from './viewport-layout';
import {
  WORLD_INSIGHT_TABS,
  WORLD_TIMELINE_FILTERS,
  buildWorldEventAutoCloseSummary,
  isWorldEventLeadActor,
  isWorldInsightTab,
  isWorldTimelineTypeFilter,
  nonEmptyStringMap,
  normalizeEventDraft,
  relationshipInsightStrokeWidth,
  relationshipInsightTone,
  relationshipInsightVisibleCharacterIds,
  relationshipInsightVisibleRelationships,
  relationshipNetworkPosition,
  relationshipPairIsSelected,
  renderDailyBriefBanner,
  renderDailyBriefCard,
  renderEventParticipantNames,
  renderEventSettingsSurfaceName,
  renderMemorySummaryGroup,
  renderRelationshipOverviewList,
  renderRpSegment,
  renderTimeline,
  renderTimelineTrackEntry,
  renderWorldEventLobby,
  renderWorldEventNarration,
  renderWorldEventSettingsPreview,
  renderWorldRpVariantBar,
  renderWorldStageHeader,
  timelineInsightDateKey,
  timelineInsightDateLabel,
  worldInsightCharacters,
  worldInsightRelationships,
  worldInsightTransition,
} from './world-view';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) {
  throw new Error('Missing #app');
}
const appRoot = app;
// 小注释：UI 层只负责读状态、渲染和派发动作，不在这里改业务存储结构。
type SettingsSection = 'world' | 'drafts' | 'stickers' | 'model' | 'prompts' | 'relationship' | 'interactions' | 'proactive' | 'chat' | 'notifications' | 'data';
type MobileSection = 'messages' | 'contacts' | 'groups' | 'world' | 'moments' | 'settings';
type MobileHistoryLayer = 'section' | 'chat' | 'settings-detail' | 'modal';
type CharacterPanelPage = 'worldbook' | 'worldbook-editor' | 'status';
type GroupSettingsMode = 'create' | 'edit';
type PendingStickerImport = {
  scope: StickerLibraryScope;
  characterId?: string;
  stickers: StickerAsset[];
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
type MobileListScrollSnapshot = {
  section: Extract<MobileSection, 'messages' | 'contacts'>;
  top: number;
  left: number;
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
  worldInsightTab?: WorldInsightTab;
  worldTimelineTypeFilter?: WorldTimelineTypeFilter;
  worldTimelineSearchQuery?: string;
  worldTimelineCharacterFilter?: string;
  worldInsightRelationshipFirstId?: string;
  worldInsightRelationshipSecondId?: string;
  privateChatSpeakerId?: string;
  eventComposerOpen?: boolean;
  eventComposerDraft?: EventComposerDraft;
  messageDrafts?: Record<string, string>;
  groupMessageDrafts?: Record<string, string>;
  momentCommentDrafts?: Record<string, string>;
  momentCommentReplyTargetDrafts?: Record<string, string>;
  scroll?: UiScrollSnapshot;
  mobileListScroll?: MobileListScrollSnapshot;
};

const CARD_IMPORT_ACCEPT = '.json,.png,application/json,image/png,application/octet-stream,*/*';
const UI_SESSION_KEY = 'tavern-social-ui-session-v1';
const UI_SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

let globalStatusText = '';
let globalStatusHideTimer: number | undefined;
let settingsOpen = false;
let activeSettingsSection: SettingsSection = 'world';
let mobileSection: MobileSection = 'messages';
let bottomNavPressedSection: MobileSection | '' = '';
let bottomNavLiftSection: MobileSection | '' = '';
let bottomNavPressTimer: number | undefined;
let bottomNavLiftTimer: number | undefined;
let mobileChatOpen = false;
let mobileGroupChatOpen = false;
let mobileGroupListClosing = false;
let mobileGroupListCloseTimer: number | undefined;
let desktopGroupChatOpen = false;
let groupSettingsOpen = false;
let groupSettingsMode: GroupSettingsMode = 'create';
let groupSettingsOpening = false;
let groupSettingsClosing = false;
let groupSettingsOpeningTimer: number | undefined;
let groupSettingsCloseTimer: number | undefined;
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
let replyStrategyManagerCharacterId = '';
let replyStrategyGeneratingCharacterId = '';
let momentGenerating = false;
let momentGenerationStatus = '';
let momentComposerOpen = false;
let momentComposerClosing = false;
let momentComposerDropClosing = false;
let momentComposerOpening = false;
let momentComposerOpeningTimer: number | undefined;
let momentComposerKeyboardBlurTimer: number | undefined;
let momentComposerCloseKeyboardTimer: number | undefined;
let momentComposerLayoutTransition: 'expand' | null = null;
let eventGenerating = false;
let creatingPrivateEventSuggestionId = '';
let worldRpGenerating = false;
let eventComposerOpen = false;
let eventComposerDropClosing = false;
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
let worldInsightTab: WorldInsightTab = 'events';
let worldGearPanelOpen = false;
let worldGearPanelClosing = false;
let worldGearPanelCloseTimer: number | undefined;
let memorySummaryDrawerExpanded = false;
let worldTimelineTypeFilter: WorldTimelineTypeFilter = 'all';
let worldTimelineSearchQuery = '';
let worldTimelineCharacterFilter = 'all';
let worldRpInputDraft = '';
let activeWorldRpEventId = '';
let worldRpRenderMode: 'narration' | 'bubble' = 'narration';
let worldRpReplyMode: ChatReplyMode = 'auto';
let worldRpMessageEditId = '';
let worldRpMessageActionId = '';
let worldRpActorId = 'user';
let eventComposerDraft: EventComposerDraft = { mode: 'auto', title: '', description: '', participantIds: [], affinityDelta: '0' };
const momentCommentDrafts = new Map<string, string>();
const momentCommentReplyTargetDrafts = new Map<string, string>();
let momentCommentActionMenu: { momentId: string; commentId: string; characterPickerOpen: boolean } | null = null;
let momentCommentSuppressTapUntil = 0;
let lastDeletedMomentSnapshot: DeletedMomentSnapshot | null = null;
let lastDeletedMomentUndoTimer: number | undefined;
let activeMomentDetailId = '';
let contextPreviewCharacterId = '';
let lastComposerSubmission: { characterId: string; content: string } | null = null;
const COMPOSER_FOCUS_KEEPALIVE_MS = 6000;
const COMPOSER_FOCUS_RETRY_DELAYS = [40, 120, 260, 520, 900];
const MOMENT_COMPOSER_CLOSE_KEYBOARD_MS = 360;
const MOMENT_COMPOSER_LAYOUT_TRANSITION_MS = 260;
const EVENT_COMPOSER_DROP_CLOSE_MS = 360;
const WORLD_GEAR_CLOSE_MS = 180;
const GROUP_SETTINGS_CLOSE_MS = 180;
const MOBILE_GROUP_LIST_CLOSE_MS = 180;
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
let pendingWorldBundleImport: WorldBundlePreview | null = null;
let pendingCardImportFollowup: CardImportFollowupAction | null = null;
let pendingStickerImport: PendingStickerImport | null = null;
let modelFormDraft: {
  provider: ModelProvider;
  apiUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  dailyRequestLimit: number;
  streamReplies?: boolean;
} | null = null;
function streamRepliesFieldValue(fallback: boolean | undefined): boolean {
  const input = document.querySelector<HTMLInputElement>('#stream-replies');
  return input ? input.checked : fallback !== false;
}

const MODEL_ONBOARDING_KEY = 'tavern-social-model-onboarding-v1';
const CHAT_REPLY_MODE_ONBOARDING_KEY = 'tavern-social-chat-reply-mode-onboarding-v1';
const TIME_MODE_ONBOARDING_KEY = 'tavern-social-time-mode-onboarding-v1';
const MOMENTS_TUTORIAL_KEY = 'tavern-social-moments-tutorial-v1';
const STORAGE_FULL_IMAGE_MESSAGE = '这张图片存不下了：本地存储空间已满。可以先在设置里导出备份，再删掉一些不用的聊天背景或表情包。';
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
let mediaListenerInstalled = false;
let mobileHistoryInstalled = false;
let mobileNativeBackInstalled = false;
let visualViewportListenerInstalled = false;
let uiSessionPersistenceInstalled = false;
let privateIdentityMenuOutsideListenerInstalled = false;
let uiSessionSaveTimer: number | undefined;
let pendingIdleRender = false;
let pendingIdleInput: HTMLTextAreaElement | HTMLInputElement | null = null;
let pendingIdleRenderFlush: (() => void) | null = null;
let pendingScrollRestore: UiScrollSnapshot | null = null;
let mobileListScrollRestore: MobileListScrollSnapshot | null = null;
let scrollCharacterPanelToTopAfterRender = false;

const SETTINGS_SECTIONS: SettingsSection[] = ['world', 'drafts', 'stickers', 'model', 'prompts', 'relationship', 'interactions', 'proactive', 'chat', 'notifications', 'data'];
const MOBILE_SECTIONS: MobileSection[] = ['messages', 'contacts', 'groups', 'world', 'moments', 'settings'];
const MAIN_NAV_ITEMS: Array<{ id: MobileSection; label: string; iconName: IconName }> = [
  { id: 'messages', label: '消息', iconName: 'message' },
  { id: 'contacts', label: '角色', iconName: 'contacts' },
  { id: 'world', label: '世界', iconName: 'world' },
  { id: 'moments', label: '动态', iconName: 'moments' },
  { id: 'settings', label: '设置', iconName: 'settings' },
];
const BOTTOM_NAV_PRESS_MS = 100;
const BOTTOM_NAV_LIFT_MS = 240;

function isSettingsSection(value: unknown): value is SettingsSection {
  return typeof value === 'string' && SETTINGS_SECTIONS.includes(value as SettingsSection);
}

function isMobileSection(value: unknown): value is MobileSection {
  return typeof value === 'string' && MOBILE_SECTIONS.includes(value as MobileSection);
}

function visibleMobileSection(): MobileSection {
  const activeSection = document.querySelector<HTMLButtonElement>('.bottom-nav button.is-active')?.dataset.mobileSection;
  return isMobileSection(activeSection) ? activeSection : mobileSection;
}

function clearBottomNavMotionTimers(): void {
  if (bottomNavPressTimer !== undefined) {
    window.clearTimeout(bottomNavPressTimer);
    bottomNavPressTimer = undefined;
  }
  if (bottomNavLiftTimer !== undefined) {
    window.clearTimeout(bottomNavLiftTimer);
    bottomNavLiftTimer = undefined;
  }
}

function clearBottomNavMotionClasses(): void {
  document.querySelectorAll<HTMLButtonElement>('.bottom-nav button[data-mobile-section]').forEach(button => {
    button.classList.remove('is-pressing', 'is-lifting');
  });
}

function clearBottomNavMotion(renderAfter = false): void {
  clearBottomNavMotionTimers();
  const hadMotion = Boolean(bottomNavPressedSection || bottomNavLiftSection);
  bottomNavPressedSection = '';
  bottomNavLiftSection = '';
  clearBottomNavMotionClasses();
  if (renderAfter && hadMotion) render();
}

function startBottomNavLiftMotion(section: MobileSection): void {
  if (bottomNavLiftTimer !== undefined) {
    window.clearTimeout(bottomNavLiftTimer);
    bottomNavLiftTimer = undefined;
  }
  bottomNavPressedSection = '';
  bottomNavLiftSection = section;
  clearBottomNavMotionClasses();
  const button = document.querySelector<HTMLButtonElement>(`.bottom-nav button[data-mobile-section="${section}"]`);
  if (!button) return;
  void button.offsetWidth;
  button.classList.add('is-lifting');
  bottomNavLiftTimer = window.setTimeout(() => {
    bottomNavLiftTimer = undefined;
    if (bottomNavLiftSection !== section) return;
    bottomNavLiftSection = '';
    clearBottomNavMotionClasses();
  }, BOTTOM_NAV_LIFT_MS);
}

function currentScrollContainer(): HTMLElement | null {
  if (settingsOpen || mobileSection === 'settings') {
    return document.querySelector<HTMLElement>('.settings-content, .mobile-settings-content, .mobile-page');
  }
  if (characterPanelOpen) return document.querySelector<HTMLElement>('.character-panel');
  if (groupSettingsOpen) return document.querySelector<HTMLElement>('.group-settings-panel');
  if (eventComposerOpen) return document.querySelector<HTMLElement>('.event-composer-dialog');
  if (mobileChatOpen || state.activeView === 'chat') return document.querySelector<HTMLElement>('.messages');
  if (mobileGroupChatOpen || state.activeView === 'groups') return document.querySelector<HTMLElement>('.group-messages');
  if (mobileSection === 'world' || state.activeView === 'world') return document.querySelector<HTMLElement>('.world-workbench-scroll');
  if (mobileSection === 'moments' || state.activeView === 'moments') return document.querySelector<HTMLElement>('.moments-scroll');
  return document.querySelector<HTMLElement>('.mobile-page, .settings-content');
}

function currentScrollKey(): string {
  if (settingsOpen || mobileSection === 'settings') return `settings:${mobileSettingsDetail ? 'detail' : 'list'}`;
  if (characterPanelOpen) return `character-panel:${activeCharacter()?.id ?? ''}`;
  if (groupSettingsOpen) return `group-settings:${activeGroupChat()?.id ?? groupSettingsMode}`;
  if (eventComposerOpen) return 'event-composer';
  if (mobileChatOpen || state.activeView === 'chat') return 'messages';
  if (mobileGroupChatOpen || state.activeView === 'groups') return `groups:${activeGroupChat()?.id ?? ''}`;
  if (mobileSection === 'world' || state.activeView === 'world') return 'world';
  if (mobileSection === 'moments' || state.activeView === 'moments') return 'moments';
  return `${mobileSection}:${mobileSettingsDetail ? 'detail' : 'list'}`;
}

function captureEventComposerDraftFromDom(): void {
  const mode = document.querySelector<HTMLButtonElement>('[data-event-composer-mode].is-active')?.dataset.eventComposerMode;
  if (mode === 'manual' || mode === 'auto') eventComposerDraft.mode = mode;
  const titleInput = document.querySelector<HTMLInputElement>('#event-manual-title');
  if (titleInput) eventComposerDraft.title = titleInput.value;
  const descriptionInput = document.querySelector<HTMLTextAreaElement>('#event-manual-description');
  if (descriptionInput) eventComposerDraft.description = descriptionInput.value;
  const affinityInput = document.querySelector<HTMLInputElement>('#event-manual-affinity');
  if (affinityInput) eventComposerDraft.affinityDelta = affinityInput.value;
  const participantInputs = Array.from(document.querySelectorAll<HTMLInputElement>('[data-event-participant]'));
  if (participantInputs.length > 0) {
    eventComposerDraft.participantIds = participantInputs
      .filter(input => input.checked)
      .map(input => input.value)
      .filter(Boolean);
  }
}

function captureVisibleDraftsFromDom(): void {
  const character = activePrivateChatTarget();
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

function currentMobileListScrollSection(): MobileListScrollSnapshot['section'] | null {
  if (!isCompactViewport()) return null;
  if (getViewportLayoutMode() !== 'tabletLandscape' && (mobileChatOpen || mobileGroupChatOpen)) return null;
  return mobileSection === 'messages' || mobileSection === 'contacts' ? mobileSection : null;
}

function captureMobileListScrollSnapshot(): MobileListScrollSnapshot | null {
  const section = currentMobileListScrollSection();
  const container = document.querySelector<HTMLElement>('.mobile-shell > .mobile-list-page, .tablet-landscape-list-scroll');
  if (!section || !container) return null;
  return {
    section,
    top: container.scrollTop,
    left: container.scrollLeft,
  };
}

function rememberMobileListScroll(): void {
  mobileListScrollRestore = captureMobileListScrollSnapshot() ?? mobileListScrollRestore;
}

function clearMobileListScrollRestore(): void {
  mobileListScrollRestore = null;
}

function restoreMobileListScrollIfNeeded(): boolean {
  const snapshot = mobileListScrollRestore;
  if (!snapshot || currentMobileListScrollSection() !== snapshot.section) return false;
  const container = document.querySelector<HTMLElement>('.mobile-shell > .mobile-list-page, .tablet-landscape-list-scroll');
  if (!container) return false;
  mobileListScrollRestore = null;
  container.scrollTop = snapshot.top;
  container.scrollLeft = snapshot.left;
  window.setTimeout(() => {
    if (currentMobileListScrollSection() !== snapshot.section) return;
    const current = document.querySelector<HTMLElement>('.mobile-shell > .mobile-list-page, .tablet-landscape-list-scroll');
    if (!current) return;
    current.scrollTop = snapshot.top;
    current.scrollLeft = snapshot.left;
  }, 0);
  return true;
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
    worldInsightTab,
    worldTimelineTypeFilter,
    worldTimelineSearchQuery,
    worldTimelineCharacterFilter,
    worldInsightRelationshipFirstId: relationshipPairACharacterId,
    worldInsightRelationshipSecondId: relationshipPairBCharacterId,
    eventComposerOpen,
    eventComposerDraft,
    messageDrafts: Object.fromEntries(messageDrafts),
    groupMessageDrafts: Object.fromEntries(groupMessageDrafts),
    momentCommentDrafts: Object.fromEntries(momentCommentDrafts),
    momentCommentReplyTargetDrafts: Object.fromEntries(momentCommentReplyTargetDrafts),
    scroll: captureScrollSnapshot(),
    mobileListScroll: mobileListScrollRestore ?? captureMobileListScrollSnapshot() ?? undefined,
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
  if (eventGenerating || eventResolvingId || worldRpGenerating || creatingPrivateEventSuggestionId) {
    eventGenerating = false;
    eventResolvingId = '';
    creatingPrivateEventSuggestionId = '';
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

function isSessionScrollSnapshotRestorable(snapshot: UiScrollSnapshot | undefined | null): snapshot is UiScrollSnapshot {
  if (!snapshot || typeof snapshot.key !== 'string') return false;
  return snapshot.key !== 'messages' && !snapshot.key.startsWith('groups:');
}

function isMobileListScrollSnapshot(value: unknown): value is MobileListScrollSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<MobileListScrollSnapshot>;
  return (snapshot.section === 'messages' || snapshot.section === 'contacts')
    && typeof snapshot.top === 'number'
    && Number.isFinite(snapshot.top)
    && typeof snapshot.left === 'number'
    && Number.isFinite(snapshot.left);
}

function requestConversationOpenAtBottom(): void {
  pendingScrollRestore = null;
  requestChatStickToBottom();
}

function restoreUiSessionSnapshot(): void {
  try {
    const raw = localStorage.getItem(UI_SESSION_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as UiSessionSnapshot;
    if (!parsed || typeof parsed.savedAt !== 'number' || Date.now() - parsed.savedAt > UI_SESSION_MAX_AGE) return;
    if (isSettingsSection(parsed.activeSettingsSection)) activeSettingsSection = parsed.activeSettingsSection;
    if (isMobileSection(parsed.mobileSection)) mobileSection = parsed.mobileSection;
    settingsOpen = Boolean(parsed.settingsOpen) && !isCompactViewport();
    mobileChatOpen = Boolean(parsed.mobileChatOpen) && isCompactViewport();
    mobileGroupChatOpen = Boolean(parsed.mobileGroupChatOpen) && isCompactViewport();
    desktopGroupChatOpen = Boolean(parsed.desktopGroupChatOpen) && !isCompactViewport();
    groupSettingsOpen = Boolean(parsed.groupSettingsOpen);
    groupSettingsMode = parsed.groupSettingsMode === 'edit' ? 'edit' : 'create';
    mobileSettingsDetail = Boolean(parsed.mobileSettingsDetail) && isCompactViewport();
    characterPanelOpen = Boolean(parsed.characterPanelOpen);
    characterPanelPage = parsed.characterPanelPage === 'status'
      ? 'status'
      : parsed.characterPanelPage === 'worldbook-editor'
        ? 'worldbook-editor'
        : 'worldbook';
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
    worldInsightTab = isWorldInsightTab(parsed.worldInsightTab) ? parsed.worldInsightTab : 'events';
    worldTimelineTypeFilter = isWorldTimelineTypeFilter(parsed.worldTimelineTypeFilter)
      ? parsed.worldTimelineTypeFilter
      : 'all';
    worldTimelineSearchQuery = typeof parsed.worldTimelineSearchQuery === 'string'
      ? parsed.worldTimelineSearchQuery
      : '';
    worldTimelineCharacterFilter = typeof parsed.worldTimelineCharacterFilter === 'string'
      && (
        parsed.worldTimelineCharacterFilter === 'all'
        || state.characters.some(character =>
          character.id === parsed.worldTimelineCharacterFilter && character.worldId === activeWorld().id,
        )
      )
      ? parsed.worldTimelineCharacterFilter
      : 'all';
    const currentWorldCharacterIds = new Set(
      state.characters
        .filter(character => character.worldId === activeWorld().id)
        .map(character => character.id),
    );
    relationshipPairACharacterId = typeof parsed.worldInsightRelationshipFirstId === 'string'
      && currentWorldCharacterIds.has(parsed.worldInsightRelationshipFirstId)
      ? parsed.worldInsightRelationshipFirstId
      : '';
    relationshipPairBCharacterId = typeof parsed.worldInsightRelationshipSecondId === 'string'
      && currentWorldCharacterIds.has(parsed.worldInsightRelationshipSecondId)
      && parsed.worldInsightRelationshipSecondId !== relationshipPairACharacterId
      ? parsed.worldInsightRelationshipSecondId
      : '';
    if (
      typeof parsed.privateChatSpeakerId === 'string'
      && (
        parsed.privateChatSpeakerId === 'user'
        || state.characters.some(character => character.id === parsed.privateChatSpeakerId && character.worldId === activeWorld().id)
      )
    ) {
      setCommunicationActor(activeWorld().id, parsed.privateChatSpeakerId);
    }
    ensureCommunicationIdentityViewState();
    eventComposerOpen = Boolean(parsed.eventComposerOpen);
    eventComposerDraft = normalizeEventDraft(parsed.eventComposerDraft);
    messageDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.messageDrafts)).forEach(([key, value]) => messageDrafts.set(key, value));
    groupMessageDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.groupMessageDrafts)).forEach(([key, value]) => groupMessageDrafts.set(key, value));
    momentCommentDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.momentCommentDrafts)).forEach(([key, value]) => momentCommentDrafts.set(key, value));
    momentCommentReplyTargetDrafts.clear();
    Object.entries(nonEmptyStringMap(parsed.momentCommentReplyTargetDrafts)).forEach(([key, value]) => {
      if (value) momentCommentReplyTargetDrafts.set(key, value);
    });
    pendingScrollRestore = isSessionScrollSnapshotRestorable(parsed.scroll) ? parsed.scroll : null;
    mobileListScrollRestore = isMobileListScrollSnapshot(parsed.mobileListScroll) ? parsed.mobileListScroll : null;
    if (parsed.scroll && typeof parsed.scroll.key === 'string' && !isSessionScrollSnapshotRestorable(parsed.scroll)) {
      requestChatStickToBottom();
    }
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

type ChatScrollSettleResult = 'none' | 'restored' | 'bottom' | 'snapshot';

function hasMobileBackTarget(): boolean {
  return isCompactViewport() && (
    Boolean(pendingCardRecognition)
    || Boolean(pendingWorldBundleImport)
    || Boolean(pendingStickerImport)
    || modelOnboardingOpen
    || timeModeOnboardingOpen
    || chatReplyModeOnboardingOpen
    || momentsTutorialOpen
    || characterPanelOpen
    || eventComposerOpen
    || Boolean(worldRpMessageEditId)
    || Boolean(worldRpMessageActionId)
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
  if (!isCompactViewport()) return;
  window.history.pushState({ ...(window.history.state ?? {}), tavernSocialLayer: layer }, '');
}

function clearMobileHistoryLayer(): void {
  if (!isCompactViewport() || !window.history.state?.tavernSocialLayer) return;
  const { tavernSocialLayer: _layer, ...rest } = window.history.state;
  window.history.replaceState(rest, '');
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
  if (pendingWorldBundleImport) {
    pendingWorldBundleImport = null;
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
    if (characterPanelPage === 'worldbook-editor') {
      const character = activeCharacter();
      if (character) {
        setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());
        saveState();
      }
      characterPanelPage = 'worldbook';
      saveUiSessionSnapshot();
      return true;
    }
    characterPanelOpen = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (eventComposerOpen) {
    eventComposerOpen = false;
    eventComposerDropClosing = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (worldRpMessageEditId) {
    worldRpMessageEditId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (worldRpMessageActionId) {
    worldRpMessageActionId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (activeWorldRpEventId) {
    activeWorldRpEventId = '';
    worldRpInputDraft = '';
    worldRpMessageEditId = '';
    worldRpMessageActionId = '';
    saveUiSessionSnapshot();
    return true;
  }
  if (momentComposerOpen) {
    closeMomentComposerWithTransition(false);
    return true;
  }
  if (groupSettingsOpen) {
    closeGroupSettingsPanel(true);
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
    resetGroupSettingsState();
    if (mobileSection !== 'groups') setActiveView('chat');
    clearVisibleStatus();
    saveUiSessionSnapshot();
    return true;
  }
  if (mobileSettingsDetail) {
    mobileSettingsDetail = false;
    saveUiSessionSnapshot();
    return true;
  }
  if (mobileSection === 'groups') {
    closeMobileGroupListWithTransition();
    return false;
  }
  if (mobileSection !== 'messages') {
    mobileSection = 'messages';
    mobileChatOpen = false;
    messageComposerKeyboardHoldCharacterId = '';
    mobileGroupChatOpen = false;
    resetGroupSettingsState();
    mobileSettingsDetail = false;
    momentComposerOpen = false;
    momentGenerationStatus = '';
    resetMomentComposerKeyboardState();
    eventComposerOpen = false;
    eventComposerDropClosing = false;
    worldGearPanelOpen = false;
    worldGearPanelClosing = false;
    window.clearTimeout(worldGearPanelCloseTimer);
    worldGearPanelCloseTimer = undefined;
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
  if (mobileSection === 'groups' && !mobileGroupChatOpen && !groupSettingsOpen) {
    closeMobileGroupListWithTransition();
    return;
  }
  if (closeMobileLayer()) renderWithUiTransition('detail-out');
}

function closeMobileGroupListWithTransition(): void {
  if (mobileGroupListClosing) return;
  captureVisibleDraftsFromDom();
  clearMobileHistoryLayer();
  mobileChatOpen = false;
  mobileGroupChatOpen = false;
  desktopGroupChatOpen = false;
  resetGroupSettingsState();
  mobileSettingsDetail = false;
  mobileGroupListClosing = true;
  render();
  window.clearTimeout(mobileGroupListCloseTimer);
  mobileGroupListCloseTimer = window.setTimeout(() => {
    mobileGroupListCloseTimer = undefined;
    mobileGroupListClosing = false;
    mobileSection = 'messages';
    setActiveView('chat');
    saveUiSessionSnapshot();
    render();
  }, MOBILE_GROUP_LIST_CLOSE_MS);
}

function resetMobileGroupListClosing(): void {
  window.clearTimeout(mobileGroupListCloseTimer);
  mobileGroupListCloseTimer = undefined;
  mobileGroupListClosing = false;
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

function renderOnboardingLayer(): string {
  if (modelOnboardingOpen) return renderModelOnboarding();
  if (timeModeOnboardingOpen) return renderTimeModeOnboarding();
  if (chatReplyModeOnboardingOpen) return renderChatReplyModeOnboarding();
  return '';
}

function shouldShowGlobalStatus(): boolean {
  return globalStatusText.trim().length > 0;
}

function renderGlobalStatus(): string {
  if (!shouldShowGlobalStatus()) return '';
  return `<div class="global-status-toast" role="status" aria-live="polite">${escapeHtml(globalStatusText)}</div>`;
}

const STORAGE_WARNING_TEXT = '本地存储空间已满，最近的改动没有保存。请先在设置里导出备份，再删掉一些聊天背景、表情包或旧聊天，腾出空间后会自动恢复保存。';
let storageWarningListenerInstalled = false;

// 大注释：存储写满是持续状态，不能只弹一次会自动消失的提示，否则用户会以为内容都存好了。
function renderStorageWarning(): string {
  if (!isStorageSaveFailing()) return '';
  return `<div class="storage-warning-banner" role="alert">${escapeHtml(STORAGE_WARNING_TEXT)}</div>`;
}

function installStorageWarningListener(): void {
  if (storageWarningListenerInstalled) return;
  storageWarningListenerInstalled = true;
  onStorageSaveStatusChange(failing => {
    const existing = appRoot.querySelector<HTMLElement>('.storage-warning-banner');
    if (!failing) {
      existing?.remove();
      return;
    }
    if (!existing) appRoot.insertAdjacentHTML('beforeend', renderStorageWarning());
  });
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

function clearMomentDeleteUndo(): void {
  lastDeletedMomentSnapshot = null;
  if (lastDeletedMomentUndoTimer !== undefined) {
    window.clearTimeout(lastDeletedMomentUndoTimer);
    lastDeletedMomentUndoTimer = undefined;
  }
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

function currentWorldCharacters(): CharacterProfile[] {
  const query = contactQuery.trim().toLocaleLowerCase();
  return state.characters.filter(character =>
    character.worldId === activeWorld().id
    && (!query || `${character.name} ${characterSettingsText(character)}`.toLocaleLowerCase().includes(query)),
  );
}

function privateChatContactCharacters(mode: 'contacts' | 'recent' = 'contacts'): CharacterProfile[] {
  const speaker = privateChatIdentityCharacter();
  // 大注释：通讯录世界内共享，但当前通讯身份本人没有自己的私聊窗口；A 视角只能看到 B/C 等联系人和群聊。
  return (mode === 'recent' ? recentCharacters() : currentWorldCharacters())
    .filter(character => !speaker || character.id !== speaker.id);
}

function ensureCommunicationIdentityViewState(): void {
  const speaker = privateChatIdentityCharacter();
  if (!speaker || activeCharacter()?.id !== speaker.id) return;
  // 大注释：切换成某个角色身份后，如果当前私聊对象就是这个角色本人，按产品语义退回消息列表，不自动跳到别的联系人。
  mobileChatOpen = false;
  messageComposerKeyboardHoldCharacterId = '';
  quotedMessageId = '';
  messageActionId = '';
  clearVisibleStatus();
}

function closeMessageDetailAfterCommunicationIdentityChange(): void {
  // 大注释：通讯身份是消息页外层状态；切换后统一回到列表，避免停留在“自己给自己发消息”或旧群发言人界面。
  mobileSection = 'messages';
  mobileChatOpen = false;
  mobileGroupChatOpen = false;
  desktopGroupChatOpen = false;
  resetGroupSettingsState();
  messageComposerKeyboardHoldCharacterId = '';
  quotedMessageId = '';
  messageActionId = '';
  groupMessageActionId = '';
  clearVisibleStatus();
}

function selectPrivateChatIdentity(selectedId: string): void {
  captureVisibleDraftsFromDom();
  const nextActorId = setCommunicationActor(activeWorld().id, selectedId || 'user');
  closeMessageDetailAfterCommunicationIdentityChange();
  ensureCommunicationIdentityViewState();
  ensureGroupChatForSpeaker();
  saveUiSessionSnapshot({ captureDom: false });
  const nextCharacter = state.characters.find(character => character.id === nextActorId);
  setStatusText(nextCharacter ? `已切换为 ${nextCharacter.name} 通讯身份。` : '已切换为 user 通讯身份。');
  renderWithUiTransition('detail-out');
  const character = activePrivateChatTarget();
  if (character && !privateChatIdentityCharacter()) {
    void generateOpeningMessage(character, render, privateConversationActorId(character));
  }
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

function replyStrategyManagerCharacter(): CharacterProfile | undefined {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  const selected = characters.find(character => character.id === replyStrategyManagerCharacterId);
  const fallback = selected ?? activeCharacter() ?? characters[0];
  if (fallback) replyStrategyManagerCharacterId = fallback.id;
  return fallback;
}

async function regenerateReplyStrategyForCharacter(character: CharacterProfile, inputSelector: string): Promise<void> {
  replyStrategyGeneratingCharacterId = character.id;
  setStatusText(`正在让 AI 按 ${character.name} 的人设生成回复策略…`);
  preserveScrollForNextRender();
  render();
  try {
    const generated = await generateCharacterReplyStrategy(character);
    character.replyStrategy = generated;
    saveState();
    const input = document.querySelector<HTMLTextAreaElement>(inputSelector);
    if (input) input.value = generated;
    setStatusText(`${character.name} 的回复策略已由 AI 按人设生成，可继续微调。`);
  } catch (error) {
    setStatusText(error instanceof Error ? error.message : String(error));
  } finally {
    replyStrategyGeneratingCharacterId = '';
    preserveScrollForNextRender();
    render();
  }
}

function recentCharacters(): CharacterProfile[] {
  return currentWorldCharacters().sort((left, right) => {
    return contactActivityTimeFor(right) - contactActivityTimeFor(left);
  });
}

// 大注释：聊天记录分段渲染。界面每次刷新都会整页重画，聊得越久消息越多，打开聊天和每次刷新都越慢。
// 这里只渲染最近一段消息，顶部放“查看更早的消息”按钮，按需往前加载；切换到别的会话时窗口自动回到最近一段。
const MESSAGE_RENDER_WINDOW = 120;
type MessageWindowKind = 'private' | 'direct' | 'group';
const messageWindows: Record<MessageWindowKind, { key: string; size: number }> = {
  private: { key: '', size: MESSAGE_RENDER_WINDOW },
  direct: { key: '', size: MESSAGE_RENDER_WINDOW },
  group: { key: '', size: MESSAGE_RENDER_WINDOW },
};

function messageWindowStart(kind: MessageWindowKind, key: string, total: number): number {
  const windowState = messageWindows[kind];
  if (windowState.key !== key) {
    windowState.key = key;
    windowState.size = MESSAGE_RENDER_WINDOW;
  }
  return Math.max(0, total - windowState.size);
}

function renderLoadEarlierMessages(kind: MessageWindowKind, hiddenCount: number): string {
  if (hiddenCount <= 0) return '';
  return `
    <div class="message-history-more">
      <button type="button" data-load-earlier-messages="${kind}">查看更早的消息<span>还有 ${hiddenCount} 条</span></button>
    </div>
  `;
}

function isMessageWindowKind(value: string | undefined): value is MessageWindowKind {
  return value === 'private' || value === 'direct' || value === 'group';
}

// 大注释：新消息入场动效。整页重画会重建所有气泡，所以不能给气泡统一挂动画，否则每次刷新都满屏闪。
// 这里记住上一次渲染时每个会话最新一条消息的时间，只有比它更新、并且上一次渲染时这个会话就在屏幕上的消息才标记为“刚到达”。
// 刚打开会话、加载更早的消息、后台定时刷新都不会触发动效。
const messageArrivalNewest = new Map<string, number>();
let messageArrivalKeysRendered = new Set<string>();
let messageArrivalKeysPrevious = new Set<string>();

function beginMessageArrivalTracking(): void {
  messageArrivalKeysPrevious = messageArrivalKeysRendered;
  messageArrivalKeysRendered = new Set();
}

function messageArrivalThreshold(key: string, newestCreatedAt: number): number {
  const previousNewest = messageArrivalNewest.get(key);
  const wasOnScreen = messageArrivalKeysPrevious.has(key);
  messageArrivalKeysRendered.add(key);
  messageArrivalNewest.set(key, Math.max(newestCreatedAt, previousNewest ?? 0));
  return wasOnScreen && previousNewest !== undefined ? previousNewest : Number.POSITIVE_INFINITY;
}

// 小注释：发送消息时界面常会在几毫秒内连续刷新两三次。记住每条新消息动画开始的时间，
// 再次刷新时用负的延迟让动画从中断处接着播，既不会被打断，也不会从头重播。
const MESSAGE_ARRIVAL_MS = 220;
const messageArrivalStartedAt = new Map<string, number>();

function messageArrivalMarkup(messageId: string, createdAt: number, threshold: number): { className: string; style: string } {
  // 小注释：逐字显示过的回复已经在屏幕上了，换成正式消息时不再播一次“新消息”动画。
  if (streamedReplyMessageIds.delete(messageId)) return { className: '', style: '' };
  const now = performance.now();
  if (createdAt > threshold && !messageArrivalStartedAt.has(messageId)) {
    if (messageArrivalStartedAt.size > 200) messageArrivalStartedAt.clear();
    messageArrivalStartedAt.set(messageId, now);
  }
  const startedAt = messageArrivalStartedAt.get(messageId);
  if (startedAt === undefined) return { className: '', style: '' };
  const elapsed = now - startedAt;
  if (elapsed >= MESSAGE_ARRIVAL_MS) {
    messageArrivalStartedAt.delete(messageId);
    return { className: '', style: '' };
  }
  return {
    className: 'is-arriving',
    style: elapsed >= 1 ? ` style="--message-arrival-delay: -${Math.round(elapsed)}ms"` : '',
  };
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
        <span class="avatar mini-avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
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
  renderWithUiTransition('overlay-out');
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

// 小注释：列表和聊天同屏显示时（电脑、平板横屏），只高亮正在打开的那一个会话；
// 手机上列表和聊天不同屏，保持原来的高亮方式。
type OpenConversationKind = 'private' | 'group' | 'none' | 'any';

function openConversationKind(): OpenConversationKind {
  const mode = getViewportLayoutMode();
  if (mode === 'desktop') {
    if (state.activeView !== 'groups') return 'private';
    return desktopGroupChatOpen ? 'group' : 'none';
  }
  if (mode === 'tabletLandscape') return mobileGroupChatOpen ? 'group' : mobileChatOpen ? 'private' : 'none';
  return 'any';
}

function renderContacts(mode: 'contacts' | 'recent' = 'contacts'): string {
  const characters = privateChatContactCharacters(mode);
  if (characters.length === 0) {
    return `<div class="list-empty">${contactQuery ? '没有找到匹配的角色。' : '还没有角色。导入一张角色卡，开始第一段对话。'}</div>`;
  }
  const speaker = privateChatIdentityCharacter();
  const directThreads = speaker ? characterDirectThreadsForActor(speaker.id, activeWorld().id) : [];
  const openKind = openConversationKind();
  const highlightPrivate = openKind === 'private' || openKind === 'any';
  return characters.map(character => {
    const directThread = speaker ? characterDirectPeerThread(speaker, character, directThreads) : undefined;
    const directMessages = directThread ? characterDirectMessagesFor(directThread.id) : [];
    const directLatest = directMessages[directMessages.length - 1];
    const latest = lastMessageFor(character);
    const unread = speaker
      ? characterDirectUnreadCount(directThread, speaker.id)
      : unreadCountFor(character.id, privateConversationActorId(character));
    const statusLine = characterStatusLine(character);
    const naturalSubtitle = characterContactSubtitle(character, characterSettingsText(character));
    let subtitle = mode === 'recent'
      ? statusLine || (latest?.stickerId ? '[表情包]' : compactText(latest?.content, 48)) || naturalSubtitle || '打开对话，和角色聊聊'
      : statusLine || naturalSubtitle || '已导入角色卡';
    if (speaker) {
      subtitle = directLatest
        ? `${characterDirectSpeakerName(directLatest)}: ${compactText(directLatest.content, 48)}`
        : statusLine || `以 ${speaker.name} 身份打开私聊`;
    }
    const activityAt = directLatest?.createdAt ?? directThread?.updatedAt ?? latest?.createdAt;
    return `
    <button class="contact conversation-row ${highlightPrivate && character.id === activeCharacter()?.id ? 'is-active' : ''}" data-character-id="${escapeHtml(character.id)}">
      <span class="avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
      <span class="contact-copy">
        <span class="contact-name">${escapeHtml(character.name)}</span>
        <span class="contact-subtitle">${escapeHtml(subtitle)}</span>
      </span>
      <span class="conversation-meta">
        <time>${formatConversationTime(activityAt)}</time>
        ${unread > 0 ? `<span class="unread-badge" aria-label="${unread} 条未读">${unread > 99 ? '99+' : unread}</span>` : ''}
      </span>
    </button>
  `;
  }).join('');
}

function renderGroupConversationRows(): string {
  const query = contactQuery.trim().toLocaleLowerCase();
  const chats = groupChatsForPrivateIdentity()
    .filter(chat => {
      if (!query) return true;
      const participantText = groupParticipants(chat).map(character => character.name).join(' ');
      return `${chat.title} ${participantText}`.toLocaleLowerCase().includes(query);
    })
    .sort((left, right) => groupChatSortTime(right) - groupChatSortTime(left));
  const openKind = openConversationKind();
  const highlightGroup = openKind === 'group' || openKind === 'any';
  return chats.map(chat => {
    const latest = lastGroupMessageFor(chat);
    const participants = groupParticipants(chat);
    const subtitle = latest
      ? `${groupSpeakerName(latest)}：${compactText(latest.content, 48)}`
      : `${participants.length} 位成员，点开进入群聊`;
    return `
      <button class="contact conversation-row group-conversation-row ${highlightGroup && chat.id === state.activeGroupChatId ? 'is-active' : ''}" data-group-chat-id="${escapeHtml(chat.id)}">
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
  const hasGroups = groupChatsForPrivateIdentity().length > 0;
  const pageClass = [
    'group-list-page',
    mobile ? 'mobile-page mobile-group-list-page' : '',
    mobile && mobileGroupListClosing ? 'is-closing' : '',
  ].filter(Boolean).join(' ');
  return `
    <main class="${pageClass}">
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
  const characterRows = privateChatContactCharacters('recent').length > 0 ? renderContacts('recent') : '';
  if (!groupRows && !characterRows) return renderContacts('recent');
  return `${groupRows}${characterRows}`;
}

function openPrivateChatByCharacterId(characterId: string, options: { pushHistory?: boolean } = {}): void {
  const character = state.characters.find(item => item.id === characterId && item.worldId === activeWorld().id);
  if (!character) return;
  if (privateChatIdentityCharacter()?.id === character.id) {
    closeMessageDetailAfterCommunicationIdentityChange();
    saveUiSessionSnapshot({ captureDom: false });
    renderWithUiTransition('detail-out');
    return;
  }
  rememberMobileListScroll();
  captureVisibleDraftsFromDom();
  state.activeCharacterId = character.id;
  setActiveView('chat');
  const directSpeaker = privateChatIdentityCharacter();
  if (directSpeaker) {
    const thread = ensureCharacterDirectThread(character.worldId, directSpeaker.id, character.id);
    const directMessages = characterDirectMessagesFor(thread.id);
    const latest = directMessages[directMessages.length - 1];
    markCharacterDirectThreadRead(thread.id, directSpeaker.id, latest?.createdAt ?? Date.now());
  } else {
    markConversationRead(character.id, Date.now(), privateConversationActorId(character));
  }
  characterPanelOpen = false;
  stickerPickerOpen = false;
  quotedMessageId = '';
  messageActionId = '';
  requestConversationOpenAtBottom();
  if (isCompactViewport()) {
    mobileChatOpen = true;
    mobileGroupChatOpen = false;
    resetGroupSettingsState();
    if (options.pushHistory !== false) pushMobileHistory('chat');
  }
  saveState();
  renderWithUiTransition('detail-in');
  if (!directSpeaker) void generateOpeningMessage(character, render, privateConversationActorId(character));
}

function renderContextPreviewPanel(character?: CharacterProfile): string {
  if (!character || contextPreviewCharacterId !== character.id) return '';
  const actorId = privateConversationActorId(character);
  const recentMessages = messagesFor(character.id, actorId).slice(-6);
  const contextEntries = timelineForActiveWorld()
    .filter(entry => !entry.revokedAt && entry.includeInContext)
    .slice(0, 6);
  const contextSummaries = contextMemorySummariesFor(character);
  return `
    <aside class="context-preview-panel" role="dialog" aria-label="上下文预览">
      <header>
        <div>
          <span>上下文预览</span>
          <strong>${escapeHtml(character.name)}</strong>
        </div>
        <button class="icon-button" data-close-context-preview type="button" aria-label="关闭上下文预览">×</button>
      </header>
      <section>
        <h3>最近聊天</h3>
        ${recentMessages.length > 0
          ? recentMessages.map(message => `<p><b>${message.role === 'assistant' ? escapeHtml(character.name) : escapeHtml(privateChatSpeakerName(message))}</b>${escapeHtml(compactText(message.content, 110))}</p>`).join('')
          : '<p class="muted">还没有聊天记录。</p>'}
      </section>
      <section>
        <h3>会进入上下文的世界记录</h3>
        ${contextEntries.length > 0
          ? `<div class="context-preview-list">${contextEntries.map(entry => `
            <div class="context-preview-row">
              <span>
                <strong>${escapeHtml(entry.title)}</strong>
                <small>${escapeHtml(compactText(entry.summary, 120))}</small>
              </span>
              <button class="secondary small-button" type="button" data-context-preview-remove-timeline="${escapeHtml(entry.id)}">从上下文移除</button>
            </div>
          `).join('')}</div>`
          : '<p class="muted">暂无启用的世界记录。</p>'}
      </section>
      <section>
        <h3>会进入上下文的三层总结</h3>
        ${contextSummaries.length > 0
          ? `<div class="context-preview-list">${contextSummaries.map(summary => `
            <div class="context-preview-row">
              <span>
                <strong>${escapeHtml(summaryLayerLabel(summary.layer))}｜${escapeHtml(summary.title)}</strong>
                <small>${escapeHtml(compactText(summary.factSummary, 120))}</small>
              </span>
              <button class="secondary small-button" type="button" data-context-preview-remove-summary="${escapeHtml(summary.id)}">从上下文移除</button>
            </div>
          `).join('')}</div>`
          : '<p class="muted">暂无启用的三层总结。</p>'}
      </section>
      <section>
        <h3>关系</h3>
        <p><b>关系</b>${escapeHtml(relationshipLabel(character))}</p>
      </section>
    </aside>
  `;
}

function renderPrivateChatEventSuggestionCard(
  character?: CharacterProfile,
  directSpeaker?: CharacterProfile,
): string {
  const suggestion = activePrivateChatEventSuggestion(character, directSpeaker);
  if (!suggestion) return '';
  const participantNames = suggestion.participantCharacterIds
    .map(id => state.characters.find(character => character.id === id)?.name)
    .filter((name): name is string => Boolean(name))
    .join('、');
  const isCreating = creatingPrivateEventSuggestionId === suggestion.id;
  return `
    <section class="private-event-suggestion-card" aria-label="岛上事件草稿">
      <div class="private-event-suggestion-copy">
        <div class="private-event-suggestion-meta">
          <span class="private-event-suggestion-label">${icon('events')}<span>岛上事件草稿</span></span>
          ${participantNames ? `<small>${escapeHtml(participantNames)}</small>` : ''}
        </div>
        <strong>${escapeHtml(suggestion.title)}</strong>
        <small class="private-event-suggestion-description">${escapeHtml(isCreating ? '正在生成事件，请稍等…' : compactText(suggestion.description, 112))}</small>
      </div>
      <div class="private-event-suggestion-actions">
        <button class="primary small-button" type="button" data-create-private-event-suggestion="${escapeHtml(suggestion.id)}" ${isCreating ? 'disabled' : ''}>${icon('add')}<span>${isCreating ? '正在生成事件…' : '生成事件'}</span></button>
        <button class="secondary small-button" type="button" data-edit-private-event-suggestion="${escapeHtml(suggestion.id)}" ${isCreating ? 'disabled' : ''}>编辑</button>
        <button class="secondary small-button" type="button" data-dismiss-private-event-suggestion="${escapeHtml(suggestion.id)}" ${isCreating ? 'disabled' : ''}>忽略</button>
      </div>
    </section>
  `;
}

function openEventComposerFromPrivateSuggestion(suggestion: PrivateChatEventSuggestion): void {
  captureVisibleDraftsFromDom();
  eventComposerDraft = {
    mode: 'manual',
    title: suggestion.title,
    description: suggestion.description,
    eventType: suggestion.eventType,
    participantIds: suggestion.participantCharacterIds.filter(id => id !== suggestion.leadActor?.characterId),
    leadActor: suggestion.leadActor,
    affinityDelta: String(suggestion.affinityDelta),
    privateEventSuggestionId: suggestion.id,
  };
  eventComposerOpen = true;
  preserveScrollForNextRender();
  saveUiSessionSnapshot();
  renderWithUiTransition('overlay-in');
}

function renderCharacterDirectMessages(character: CharacterProfile): string {
  const speaker = privateChatIdentityCharacter();
  const thread = speaker ? characterDirectThreadForTarget(character, true) : undefined;
  if (!speaker || !thread) {
    return '<div class="empty-chat"><strong>请选择通讯身份</strong><p>切换为某个角色后，可以查看 TA 与其他角色的私聊。</p></div>';
  }
  const messages = characterDirectMessagesFor(thread.id);
  const latest = messages[messages.length - 1];
  if (latest) markCharacterDirectThreadRead(thread.id, speaker.id, latest.createdAt);
  if (messages.length === 0) {
    return `
      <div class="empty-state compact-empty">
        <span class="avatar hero-avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
        <h2>${escapeHtml(speaker.name)} 和 ${escapeHtml(character.name)} 的私聊</h2>
        <p>还没有记录。你可以先用 ${escapeHtml(speaker.name)} 的身份说一句，或等“热闹世界”自然生成一段片段。</p>
      </div>
    `;
  }
  const windowStart = messageWindowStart('direct', thread.id, messages.length);
  const arrivalThreshold = messageArrivalThreshold(`direct:${thread.id}`, latest?.createdAt ?? 0);
  return renderLoadEarlierMessages('direct', windowStart) + messages.slice(windowStart).map((message, visibleIndex) => {
    const index = windowStart + visibleIndex;
    const speakerCharacter = state.characters.find(item => item.id === message.speakerCharacterId);
    const previous = messages[index - 1];
    const showTime = !previous || message.createdAt - previous.createdAt >= 5 * 60 * 1000;
    const authoredByCurrentIdentity = message.speakerCharacterId === speaker.id;
    const rowRole = authoredByCurrentIdentity ? 'user' : 'assistant';
    const avatar = speakerCharacter ? renderAvatar(speakerCharacter) : escapeHtml(characterDirectSpeakerName(message).slice(0, 1));
    const arrival = messageArrivalMarkup(message.id, message.createdAt, arrivalThreshold);
    return `
      ${showTime ? `<div class="message-time">${formatConversationTime(message.createdAt)}</div>` : ''}
      <div class="message-row ${rowRole} is-character-direct ${arrival.className}"${arrival.style}>
        ${authoredByCurrentIdentity
          ? `<span class="message-avatar user-avatar" aria-hidden="true">${avatar}</span>`
          : `<button class="message-avatar assistant-avatar message-profile-trigger" type="button" data-message-profile-character="${escapeHtml(message.speakerCharacterId)}" aria-label="查看 ${escapeHtml(characterDirectSpeakerName(message))} 的角色资料"${avatarToneAttribute(speakerCharacter)}>${avatar}</button>`}
        <div class="message ${rowRole}" data-direct-message-id="${escapeHtml(message.id)}" tabindex="0">
          <small class="message-speaker-label">${escapeHtml(characterDirectSpeakerName(message))} · ${characterDirectSourceLabel(message)}</small>
          <span class="message-copy">${escapeHtml(message.content)}</span>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * 大注释：逐字显示中的回复气泡。
 * 整页重画时按当前预览画出来；两次重画之间，新文字只就地改这几个气泡，不重画整页。
 */
const streamedReplyMessageIds = new Set<string>();
let replyStreamFrame = 0;

function renderReplyStreamRow(character: CharacterProfile, part: ParsedChatPart, arriving = false): string {
  const sticker = part.stickerId ? findStickerById(part.stickerId) : undefined;
  return `<div class="message-row assistant is-streaming${arriving ? ' is-arriving' : ''}" data-stream-kind="${escapeHtml(sticker ? `sticker:${sticker.id}` : 'text')}">`
    + `<span class="message-avatar assistant-avatar" aria-hidden="true"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>`
    + `<div class="message assistant${sticker ? ' sticker-message' : ''}">`
    + (sticker
      ? `<img src="${escapeHtml(displayImageUrl(sticker.dataUrl))}" alt="${escapeHtml(sticker.name)}" title="${escapeHtml(sticker.name)}" />`
      : `<span class="message-copy">${escapeHtml(part.content)}</span>`)
    + '</div></div>';
}

function replyStreamPartsFor(character: CharacterProfile): ParsedChatPart[] {
  const preview = currentReplyStreamPreview();
  if (!preview || preview.characterId !== character.id || preview.actorId !== privateConversationActorId(character)) return [];
  return preview.parts;
}

function renderReplyStreamPreview(character: CharacterProfile): string {
  const parts = replyStreamPartsFor(character);
  return `<div class="reply-stream-preview" data-reply-stream-preview aria-live="off">${parts.map(part => renderReplyStreamRow(character, part)).join('')}</div>`;
}

function syncReplyStreamPreview(): void {
  const container = document.querySelector<HTMLElement>('[data-reply-stream-preview]');
  const character = activePrivateChatTarget();
  if (!container || !character) return;
  const parts = replyStreamPartsFor(character);
  if (parts.length === 0) return;
  const scroller = container.closest<HTMLElement>('.messages');
  const wasNearBottom = isChatScrollNearBottom(scroller);
  const rows = Array.from(container.children) as HTMLElement[];
  rows.slice(parts.length).forEach(row => row.remove());
  parts.forEach((part, index) => {
    const kind = part.stickerId ? `sticker:${part.stickerId}` : 'text';
    const existing = rows[index];
    if (existing?.isConnected && existing.dataset.streamKind === kind) {
      const copy = existing.querySelector<HTMLElement>('.message-copy');
      if (copy && copy.textContent !== part.content) copy.textContent = part.content;
      return;
    }
    const template = document.createElement('template');
    template.innerHTML = renderReplyStreamRow(character, part, true);
    const row = template.content.firstElementChild;
    if (!row) return;
    if (existing?.isConnected) existing.replaceWith(row);
    else container.append(row);
  });
  const label = document.querySelector<HTMLElement>('[data-replying-label]');
  if (label) label.textContent = `${character.name} 正在输入…`;
  if (wasNearBottom) scrollMessagesToBottom();
}

onReplyStreamChange(finishedMessageIds => {
  finishedMessageIds.forEach(id => streamedReplyMessageIds.add(id));
  if (streamedReplyMessageIds.size > 50) streamedReplyMessageIds.clear();
  if (replyStreamFrame || typeof window === 'undefined') return;
  replyStreamFrame = window.requestAnimationFrame(() => {
    replyStreamFrame = 0;
    syncReplyStreamPreview();
  });
});

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
  if (isCharacterDirectChat(character)) return renderCharacterDirectMessages(character);
  const messages = messagesFor(character.id, privateConversationActorId(character));
  const introCard = renderCharacterIntroCard(character);
  if (messages.length === 0) {
    return `
      ${introCard}
      <div class="empty-state compact-empty">
        <span class="avatar hero-avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
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
  const windowStart = messageWindowStart('private', `${character.id}:${privateConversationActorId(character)}`, messages.length);
  const arrivalThreshold = messageArrivalThreshold(
    `private:${character.id}:${privateConversationActorId(character)}`,
    messages[messages.length - 1]?.createdAt ?? 0,
  );
  const rendered = messages.slice(windowStart).map((message, visibleIndex) => {
    const index = windowStart + visibleIndex;
    const sticker = message.stickerId ? findStickerById(message.stickerId) : undefined;
    const quoted = message.replyToId ? state.messages.find(item => item.id === message.replyToId) : undefined;
    const previous = messages[index - 1];
    const showTime = !previous || message.createdAt - previous.createdAt >= 5 * 60 * 1000;
    const variantInfo = messageVariantInfo(message);
    const memoryHint = messageTimelineHint(timelineEntriesByMessageId.get(message.id));
    const selfAuthoredCharacter = message.role === 'user' && message.speakerType === 'character';
    const arrival = messageArrivalMarkup(message.id, message.createdAt, arrivalThreshold);
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
    <div class="message-row ${message.role === 'assistant' ? 'assistant' : 'user'} ${selfAuthoredCharacter ? 'is-authored-character' : ''} ${messageActionId === message.id ? 'has-actions-open-above' : ''} ${arrival.className}"${arrival.style}>
      ${message.role === 'assistant'
        ? `<button class="message-avatar assistant-avatar message-profile-trigger" type="button" data-message-profile-character="${escapeHtml(character.id)}" aria-label="查看 ${escapeHtml(character.name)} 和 user 的关系"${avatarToneAttribute(character)}>${renderAvatar(character)}</button>`
        : `<span class="message-avatar user-avatar" aria-hidden="true">${privateChatSpeakerAvatar(message)}</span>`}
      <div class="message ${message.role === 'assistant' ? 'assistant' : 'user'} ${sticker ? 'sticker-message' : ''} ${messageActionId === message.id ? 'actions-open-above' : ''}"
        data-message-id="${escapeHtml(message.id)}" tabindex="0">
      <span class="swipe-quote-indicator" aria-hidden="true">↩</span>
      ${selfAuthoredCharacter ? `<small class="message-speaker-label">${escapeHtml(privateChatSpeakerName(message))} · 手写身份</small>` : ''}
      ${quoted ? `<div class="message-quote">${quoted.impactRevokedAt ? '原消息影响已撤销' : quoted.recalledAt ? '原消息已撤回' : escapeHtml(compactText(quoted.content, 64))}</div>` : ''}
      ${sticker
        ? `<img src="${escapeHtml(displayImageUrl(sticker.dataUrl))}" alt="${escapeHtml(sticker.name)}" title="${escapeHtml(sticker.name)}" />`
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
  const openingGenerating = isOpeningMessageGenerating(character, privateConversationActorId(character));
  // 小注释：角色背景卡在整段记录的最上方，只有加载到最早的消息时才显示。
  return `${windowStart === 0 ? introCard : renderLoadEarlierMessages('private', windowStart)}${rendered}${openingGenerating ? `
    <div class="replying-row" aria-live="polite">
      <span class="replying-dots"><i></i><i></i><i></i></span>
      <span>${escapeHtml(character.name)} 正在生成新消息…</span>
    </div>
  ` : isReplying() ? `
    ${renderReplyStreamPreview(character)}
    <div class="replying-row" aria-live="polite">
      <span class="replying-dots"><i></i><i></i><i></i></span>
      <span data-replying-label>${escapeHtml(character.name)} ${replyStreamPartsFor(character).length ? '正在输入…' : '正在回复中…'}</span>
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
              <img src="${escapeHtml(displayImageUrl(sticker.dataUrl))}" alt="${escapeHtml(sticker.name)}" />
              </button>
            </div>
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

// 小注释：电脑版分区切换交给左侧导航栏，头部只留当前角色的设置入口。
function renderDesktopHeaderActions(character?: CharacterProfile): string {
  if (!character) return '';
  return `
    <div class="chat-header-actions">
      <button class="icon-button" id="open-character-panel" aria-label="打开角色设置" title="角色设置">${icon('settings')}</button>
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

function renderCharacterSettingsPage(character: CharacterProfile): string {
  const backgroundImage = privateChatBackgroundImage(character);
  const worldBookEntryCount = characterWorldBookEntryDrafts(character).length;
  const replyStrategyGenerating = replyStrategyGeneratingCharacterId === character.id;
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
        <span>回复策略</span>
        <textarea id="character-panel-reply-strategy" placeholder="例如：回复更短，偏口语；紧张时会停顿；不要替 user 做决定。">${escapeHtml(character.replyStrategy ?? '')}</textarea>
      </label>
      <button id="regenerate-character-panel-reply-strategy" class="secondary character-panel-reply-strategy-generate" type="button" ${replyStrategyGenerating ? 'disabled' : ''}>${replyStrategyGenerating ? 'AI 正在生成人设策略…' : '按人设生成回复策略'}</button>
      <label class="field">
        <span>好感度（没有上限）</span>
        <input id="character-affinity-free" type="number" min="0" step="1" value="${Math.max(0, Math.round(character.relationship.affinity))}" />
      </label>
      <p class="muted">进度条只显示 0 到 100；数值可以继续往上加。</p>
      <button id="jump-character-worldbook" class="secondary character-worldbook-jump" type="button">
        ${icon('world')}
        <span><strong>编辑角色世界书</strong><small>${worldBookEntryCount} 条，进入独立页面编辑关键词、正文和触发方式</small></span>
      </button>
      ${renderChatBackgroundControl({
        title: '私聊背景',
        description: '只影响这个角色的私信窗口。',
        importId: 'private-chat-background-import',
        clearId: 'clear-private-chat-background',
        backgroundImage,
      })}
      <button id="save-character-panel" class="primary" type="button">保存角色设置</button>
      <div class="character-panel-danger-actions">
        <button id="delete-character-panel" class="danger" type="button">删除角色卡</button>
      </div>
    </section>
  `;
}

function renderCharacterPanel(character?: CharacterProfile): string {
  if (!characterPanelOpen || !character) return '';
  const statusMode = characterPanelPage === 'status';
  const worldbookEditorMode = characterPanelPage === 'worldbook-editor';
  const title = worldbookEditorMode ? '角色世界书' : statusMode ? '角色状态' : '角色设置';
  return `
    <main class="character-panel character-page ${worldbookEditorMode ? 'character-worldbook-shell' : statusMode ? 'character-status-shell' : 'character-settings-shell'}" aria-label="${escapeHtml(title)}">
      <header class="character-panel-header">
        <button class="header-back" id="${worldbookEditorMode ? 'back-character-settings' : 'close-character-panel'}" type="button" aria-label="${worldbookEditorMode ? '返回角色设置' : '返回私聊'}">‹</button>
        <div>
          <span class="settings-kicker">${escapeHtml(character.name)}</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
      </header>
      ${worldbookEditorMode ? '' : renderCharacterPanelTabs()}
      ${worldbookEditorMode ? renderCharacterWorldBookPage(character) : statusMode ? renderCharacterStatusPage(character) : renderCharacterSettingsPage(character)}
    </main>
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
  const windowStart = messageWindowStart('group', chat.id, messages.length);
  const arrivalThreshold = messageArrivalThreshold(`group:${chat.id}`, messages[messages.length - 1]?.createdAt ?? 0);
  return `${renderLoadEarlierMessages('group', windowStart)}${messages.slice(windowStart).map(message => {
    const selfAuthoredCharacter = message.speakerType === 'character' && message.source === 'user';
    if (message.recalledAt) {
      return '<div class="group-recalled-message">撤回了一条群聊消息</div>';
    }
    const arrival = messageArrivalMarkup(message.id, message.createdAt, arrivalThreshold);
    return `
      <article class="group-message ${message.speakerType === 'user' ? 'is-user' : 'is-character'} ${selfAuthoredCharacter ? 'is-authored-character' : ''} ${groupMessageActionId === message.id ? 'is-actions-open is-actions-open-above' : ''} ${arrival.className}"${arrival.style} data-group-message-id="${escapeHtml(message.id)}" tabindex="0">
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

function renderGroupSettingsPanel(chat?: GroupChatProfile): string {
  if (!groupSettingsOpen && !groupSettingsClosing) return '';
  const title = chat?.title ?? `${activeWorld().name} 群聊`;
  const activeGenerationDisabled = !chat?.allowModelInitiatedMessages || isGroupGenerating();
  const replyLiveliness = groupReplyLivelinessValue(chat?.replyLiveliness);
  const mode = chat ? 'edit' : 'create';
  const panelClasses = [
    'group-settings-panel',
    mode === 'create' && groupSettingsOpening ? 'is-entering' : '',
    groupSettingsClosing ? 'is-exiting' : '',
  ].filter(Boolean).join(' ');
  return `
    <div class="group-settings-overlay" role="dialog" aria-modal="true" aria-label="群聊设置">
      <button class="group-settings-backdrop" id="close-group-settings-backdrop" type="button" aria-label="关闭群聊设置"></button>
      <aside class="${panelClasses}" data-group-settings-mode="${mode}">
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
        ${chat ? renderChatBackgroundControl({
          title: '群聊背景',
          description: '只影响这个群的聊天窗口。',
          importId: 'group-chat-background-import',
          clearId: 'clear-group-chat-background',
          backgroundImage: groupChatBackgroundImage(chat),
        }) : ''}
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
            <label class="field">
              <span>群聊热闹度</span>
              <select id="group-reply-liveliness">
                ${renderGroupReplyLivelinessOptions(replyLiveliness)}
              </select>
              <small>${escapeHtml(groupReplyLivelinessDescription(replyLiveliness))}</small>
            </label>
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
    <main class="chat group-chat ${mobile ? 'mobile-group-chat mobile-chat-detail' : ''}" style="${chatSurfaceStyle(state.chatFontScale, groupChatBackgroundImage(chat))}">
      <header class="chat-header group-chat-header">
        ${renderGroupHeader(chat, mobile)}
        ${mobile
          ? `<button class="icon-button character-gear-button" id="open-group-settings" data-open-group-settings aria-label="打开群聊设置">${icon('settings')}</button>`
          : `<div class="chat-header-actions"><button class="icon-button" id="open-group-settings" data-open-group-settings aria-label="打开群聊设置" title="群聊设置">${icon('settings')}</button></div>`}
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
  if (character && privateChatIdentityCharacter()?.id === character.id) {
    character = undefined;
  }
  const directSpeaker = character && isCharacterDirectChat(character) ? privateChatIdentityCharacter() : undefined;
  const quoted = directSpeaker
    ? undefined
    : quotedMessageId ? state.messages.find(message => message.id === quotedMessageId && !message.recalledAt) : undefined;
  const manualReplyMode = state.chatReplyMode === 'manual';
  const composerPlaceholder = character
    ? directSpeaker
      ? `以 ${directSpeaker.name} 身份发给 ${character.name}...`
      : `发消息给 ${character.name}…`
    : '请先导入角色卡';
  return `
    <main class="chat ${character ? 'has-status-shelf' : ''} ${mobile ? 'mobile-chat-detail' : ''}" style="${chatSurfaceStyle(state.chatFontScale, privateChatBackgroundImage(character))}">
      <header class="chat-header">
        ${renderCharacterHeader(character, mobile)}
        ${mobile ? '' : renderDesktopHeaderActions(character)}
        ${mobile && character ? `<button class="icon-button character-gear-button" id="open-character-panel" aria-label="打开角色设置">${icon('settings')}</button>` : ''}
      </header>
      ${renderChatStatusShelf(character)}
      ${renderContextPreviewPanel(character)}
      <section class="messages">${renderMessages(character)}</section>
      <div class="chat-composer-area">
        ${renderPrivateChatEventSuggestionCard(character, directSpeaker)}
        ${renderStickerPicker(directSpeaker ? undefined : character)}
        ${quoted ? `
          <div class="composer-quote">
            <div><strong>引用消息</strong><span>${escapeHtml(compactText(quoted.content, 120))}</span></div>
            <button id="cancel-quote" type="button" aria-label="取消引用">×</button>
          </div>
        ` : ''}
        <form class="composer ${manualReplyMode ? 'manual-reply-mode' : ''}" id="composer">
          <button class="sticker-trigger ${stickerPickerOpen ? 'is-active' : ''}" id="toggle-stickers" type="button" aria-label="表情包" ${directSpeaker ? 'disabled' : ''}>${icon('sticker')}</button>
          <textarea id="message-input" rows="1" enterkeyhint="${state.enterToSend ? 'send' : 'enter'}" aria-label="${escapeHtml(composerPlaceholder)}" placeholder="${escapeHtml(composerPlaceholder)}">${escapeHtml(messageDraftFor(character))}</textarea>
          ${manualReplyMode ? `<button class="secondary generate-reply-button" id="generate-reply" type="button" aria-label="生成回复" ${isReplying() || !character ? 'disabled' : ''}>${icon('refresh')}<span>生成</span></button>` : ''}
          <button class="primary send-button" type="submit" aria-label="发送" ${isReplying() || !character ? 'disabled' : ''}>${icon('send')}<span>发送</span></button>
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
    </main>
  `;
}

function renderMomentComposerLauncher(): string {
  const composerVisible = momentComposerOpen || momentComposerDropClosing;
  return `
    <button class="moment-compose-fab" id="open-moment-composer" type="button" aria-haspopup="dialog">
      ${icon('send')}<span>发布动态</span>
    </button>
    ${composerVisible ? '<button class="moment-composer-backdrop" id="close-moment-composer-backdrop" type="button" aria-label="关闭发布动态"></button>' : ''}
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
                <span class="avatar mini-avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
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
  const composerVisible = momentComposerOpen || momentComposerDropClosing;
  const composerClasses = [
    'moments-publisher',
    composerVisible ? 'is-open' : '',
    momentComposerOpening ? 'is-entering' : '',
    momentComposerDropClosing ? 'is-exiting moment-composer-drop-closing' : '',
    momentComposerLayoutTransition === 'expand' ? 'moment-composer-layout-expanding' : '',
  ].filter(Boolean).join(' ');
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
        <div><span class="eyebrow">全局动态</span><h2>动态</h2><p>你和角色分享的近况，都留在这里。</p></div>
        <button class="icon-button moments-help" id="open-moments-tutorial" type="button" aria-label="查看动态教程">?</button>
      </header>
      <section class="moments-scroll">
        <div class="moments-column">
          <form class="${composerClasses}" id="moment-composer" role="dialog" aria-modal="true" aria-label="发布动态">
            <div class="moment-composer-head">
              <div><span class="eyebrow">Moment</span><strong>发布动态</strong></div>
              <button class="icon-button" id="close-moment-composer" type="button" aria-label="关闭发布动态">×</button>
            </div>
            <div class="moment-avatar ${selectedMomentCharacter ? '' : 'user-avatar'}"${selectedMomentCharacter ? avatarToneAttribute(selectedMomentCharacter) : ' data-avatar-tone="user"'} aria-hidden="true">${authorAvatar}</div>
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
          <div class="moments-section-title"><strong>最近动态</strong><span>${momentsForFeed().length} 条</span></div>
          ${lastDeletedMomentSnapshot ? `
            <div class="moment-undo-banner" role="status" aria-live="polite">
              <span>刚刚删除了一条动态。</span>
              <button class="secondary small-button" data-undo-moment-delete type="button">撤销</button>
            </div>
          ` : ''}
          <section class="moments-feed">${renderMoments()}</section>
        </div>
      </section>
      ${renderMomentComposerLauncher()}
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
  const avatar = character ? renderAvatar(character) : renderUserAvatar(state.userName);
  return `
    <div class="event-lead-actor" data-event-lead-actor="${escapeHtml(leadActor.id)}">
      <span class="avatar mini-avatar"${avatarToneAttribute(character)}>${avatar}</span>
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
            <span class="avatar mini-avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
            <span>${escapeHtml(character.name)}</span>
          </label>
        `).join('')}
      </div>
      <small>当前身份会自动参与；这里勾选的是额外参与的人。</small>
    </fieldset>
  `;
}

function renderEventComposerDialog(): string {
  if (!eventComposerOpen && !eventComposerDropClosing) return '';
  const manualMode = eventComposerDraft.mode === 'manual';
  return `
    <div class="event-composer-overlay" role="dialog" aria-modal="true" aria-label="生成事件">
      <button class="event-composer-backdrop" id="close-event-composer-backdrop" type="button" aria-label="关闭生成窗口"></button>
      <section class="event-composer-dialog ${eventComposerDropClosing ? 'is-exiting event-composer-drop-closing' : ''}">
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
            <div class="event-composer-mode" aria-label="事件创建方式">
              <button class="${manualMode ? '' : 'is-active'}" data-event-composer-mode="auto" type="button">自动生成</button>
              <button class="${manualMode ? 'is-active' : ''}" data-event-composer-mode="manual" type="button">手写事件</button>
            </div>
            ${renderEventParticipantSelect()}
            ${manualMode ? `
              <label class="field">
                <span>事件标题</span>
                <input id="event-manual-title" value="${escapeHtml(eventComposerDraft.title)}" placeholder="例如：午后的咖啡馆" />
              </label>
              <label class="field">
                <span>事件内容</span>
                <textarea id="event-manual-description" placeholder="写下这段日常发生了什么。">${escapeHtml(eventComposerDraft.description)}</textarea>
              </label>
              <label class="field">
                <span>关系变化</span>
                <input id="event-manual-affinity" type="number" step="1" value="${escapeHtml(eventComposerDraft.affinityDelta)}" />
              </label>
            ` : '<p class="event-auto-hint">会按当前身份和勾选角色生成一段日常生活事件，并直接插入世界 RP 流。</p>'}
          </div>
          <footer class="event-composer-actions">
            <button class="secondary" id="cancel-event-composer" type="button">取消</button>
            <button class="primary" data-event-composer-submit type="submit" ${eventGenerating ? 'disabled' : ''}>${eventGenerating ? '生成中…' : manualMode ? '创建事件' : '生成事件'}</button>
          </footer>
        </form>
      </section>
    </div>
  `;
}

function openEventComposer(mode: 'auto' | 'manual' = 'auto'): void {
  captureVisibleDraftsFromDom();
  const leadActor = currentWorldRpLeadActor();
  eventComposerDraft = {
    ...eventComposerDraft,
    mode,
    leadActor,
    participantIds: eventComposerDraft.participantIds.filter(id => id !== leadActor.characterId),
  };
  eventComposerOpen = true;
  eventComposerDropClosing = false;
  preserveScrollForNextRender();
  saveUiSessionSnapshot();
  renderWithUiTransition('overlay-in');
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

function momentCommentCharacterFromCommunicationIdentity(moment: MomentEntry): CharacterProfile | undefined {
  const actor = communicationActor(moment.worldId);
  if (actor.type !== 'character') return undefined;
  if (!canCharacterViewMoment(moment, actor.character)) {
    throw new Error(`${actor.character.name} 看不到这条动态。`);
  }
  return actor.character;
}

function renderMoments(): string {
  const moments = momentsForFeed();
  if (moments.length === 0) {
    return '<div class="moments-empty"><strong>还没有动态</strong><span>在上方发布第一条近况，或让当前角色先说点什么。</span></div>';
  }
  return moments.map(moment => {
    const character = state.characters.find(item => item.id === moment.characterId);
    const momentWorld = state.worlds.find(item => item.id === moment.worldId);
    const momentWorldCharacters = state.characters.filter(item => item.worldId === moment.worldId);
    const author = character?.name ?? (moment.source === 'system' ? '系统' : state.userName);
    const comments = moment.comments ?? [];
    const detailOpen = activeMomentDetailId === moment.id;
    const renderedComments = detailOpen ? comments : comments.slice(0, 2);
    const commentActorId = communicationActorId(moment.worldId);
    const commentActorCharacters = momentWorldCharacters.filter(character => canCharacterViewMoment(moment, character));
    const commentActorSelectedId = commentActorId !== 'user'
      && commentActorCharacters.some(character => character.id === commentActorId)
      ? commentActorId
      : 'user';
    const commentActorCanView = commentActorSelectedId === 'user'
      || commentActorCharacters.some(character => character.id === commentActorSelectedId);
    const replyTargetId = momentCommentReplyTargetDrafts.get(moment.id) ?? '';
    const replyTarget = comments.find(comment => comment.id === replyTargetId);
    const visibleCommentCharacters = momentWorldCharacters.filter(character =>
      canCharacterViewMoment(moment, character) && character.id !== moment.characterId,
    );
    const avatar = character
      ? renderAvatar(character)
      : escapeHtml(author.slice(0, 1));
    return `
      <article class="moment-card">
        <div class="moment-avatar ${character ? '' : 'user-avatar'}"${character ? avatarToneAttribute(character) : ' data-avatar-tone="user"'}>${avatar}</div>
        <div class="moment-body">
          <div class="moment-header">
            <div>
              <strong>${escapeHtml(author)}</strong>
              <span><time>${formatConversationTime(moment.createdAt)}</time><em>${escapeHtml(momentWorld?.name ?? '未知世界')}</em><em>${escapeHtml(momentVisibilityLabel(moment.visibility))}</em></span>
            </div>
            <div class="moment-header-actions">
              <button class="secondary small-button" data-open-moment-detail="${escapeHtml(moment.id)}" type="button">${detailOpen ? '收起' : '详情'}</button>
              <button class="moment-delete" data-moment-id="${escapeHtml(moment.id)}" aria-label="删除这条动态">删除</button>
            </div>
          </div>
          <div class="moment-content">${escapeHtml(moment.content)}</div>
          <div class="moment-comments ${comments.length === 0 ? 'is-empty' : ''}">
            ${comments.length > 0 ? renderedComments.map(comment => {
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
              const characterPickerOpen = Boolean(commentMenuOpen && momentCommentActionMenu?.characterPickerOpen);
              const replyCharacters = momentWorldCharacters.filter(character =>
                canCharacterViewMoment(moment, character) && character.id !== comment.characterId,
              );
              return `
                <div class="moment-comment ${commentMenuOpen ? 'is-menu-open' : ''}" data-moment-comment-moment="${escapeHtml(moment.id)}" data-moment-comment-id="${escapeHtml(comment.id)}">
                  <div class="moment-comment-copy">
                    <strong>${escapeHtml(commenter)}</strong>
                    ${replyContext ? `<small class="moment-comment-reply-context">${escapeHtml(replyContext)}</small>` : ''}
                    <span>${escapeHtml(comment.content)}</span>
                  </div>
                  <div class="moment-comment-actions" aria-label="评论操作">
                    <button class="moment-comment-action moment-comment-action-primary" type="button" data-moment-comment-tap="${escapeHtml(comment.id)}" data-moment-comment-reply-action data-moment-comment-moment="${escapeHtml(moment.id)}" aria-label="回复 ${escapeHtml(commenter)} 的评论">回复</button>
                    ${canAuthorReply ? `
                      <button class="moment-comment-action moment-comment-action-muted" type="button" data-author-reply-comment="${escapeHtml(comment.id)}" data-author-reply-moment="${escapeHtml(moment.id)}" ${autoCommentingMomentIds.has(moment.id) ? 'disabled' : ''}>楼主</button>
                    ` : ''}
                    ${replyCharacters.length > 0 ? `
                      <button class="moment-comment-action moment-comment-action-muted" type="button" data-open-comment-character-reply="${escapeHtml(comment.id)}" data-open-comment-character-reply-moment="${escapeHtml(moment.id)}" aria-expanded="${characterPickerOpen ? 'true' : 'false'}">选角色</button>
                    ` : ''}
                    <button class="moment-comment-action moment-comment-action-danger danger" type="button" data-delete-comment="${escapeHtml(comment.id)}" data-delete-comment-moment="${escapeHtml(moment.id)}">删除</button>
                  </div>
                  ${characterPickerOpen && replyCharacters.length > 0 ? `
                    <div class="moment-comment-character-reply">
                      <select class="moment-comment-reply-select" data-comment-character-reply-select="${escapeHtml(comment.id)}" data-comment-character-reply-moment="${escapeHtml(moment.id)}" aria-label="选择回复角色">
                        ${replyCharacters.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}
                      </select>
                      <button class="moment-comment-reply-submit" type="button" data-submit-comment-character-reply="${escapeHtml(comment.id)}" data-submit-comment-character-reply-moment="${escapeHtml(moment.id)}" ${commentingMomentId === moment.id || autoCommentingMomentIds.has(moment.id) ? 'disabled' : ''}>生成</button>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('') : ''}
            ${!detailOpen && comments.length > renderedComments.length ? `
              <button class="moment-detail-link" data-open-moment-detail="${escapeHtml(moment.id)}" type="button">
                查看全部 ${comments.length} 条评论和角色互动
              </button>
            ` : ''}
            ${replyTarget ? `
              <div class="moment-comment-reply-target">
                <span>回复 ${escapeHtml(momentCommentAuthorName(replyTarget))}</span>
                <button type="button" data-clear-comment-reply="${escapeHtml(moment.id)}" aria-label="取消回复目标">取消</button>
              </div>
            ` : ''}
            <form class="moment-comment-form moment-comment-inline-form" data-comment-form="${escapeHtml(moment.id)}">
              <select class="moment-comment-author-select" data-comment-actor-select="${escapeHtml(moment.id)}" aria-label="选择评论身份">
                <option value="user" ${commentActorSelectedId === 'user' ? 'selected' : ''}>${escapeHtml(userSelfLabel())}</option>
                ${commentActorCharacters.map(item => `<option value="${escapeHtml(item.id)}" ${commentActorSelectedId === item.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`).join('')}
              </select>
              <input data-comment-input="${escapeHtml(moment.id)}" value="${escapeHtml(momentCommentDrafts.get(moment.id) ?? '')}" placeholder="${replyTarget ? `回复 ${escapeHtml(momentCommentAuthorName(replyTarget))}…` : '写评论…'}" aria-label="评论这条动态" />
              <button class="secondary moment-comment-submit" type="submit" aria-label="发送评论" ${commentActorCanView ? '' : 'disabled'}>${icon('send')}</button>
            </form>
            ${detailOpen && visibleCommentCharacters.length > 0 ? `
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
  const avatar = actor.character ? renderAvatar(actor.character) : renderUserAvatar(state.userName);
  return `
    <details class="world-persona-select world-persona-avatar-only">
      <summary aria-label="当前身份：${escapeHtml(personaName)}" title="${escapeHtml(personaName)}">
        <span class="avatar header-avatar"${avatarToneAttribute(actor.character)}>${avatar}</span>
        <span class="world-persona-chevron" aria-hidden="true">⌄</span>
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
  const panelClasses = ['world-gear-panel', worldGearPanelClosing ? 'is-closing' : ''].filter(Boolean).join(' ');
  const panelOpen = worldGearPanelOpen || worldGearPanelClosing;
  const trigger = isCompactViewport()
    ? `<button class="icon-button world-gear-trigger" data-open-world-gear type="button" aria-label="涓栫晫涓庢椂闂寸嚎璁剧疆">${icon('settings')}</button>`
    : '';
  return `
    ${trigger}
    <details class="${panelClasses}" ${panelOpen ? 'open' : ''}>
      ${trigger}
      <summary class="icon-button" data-open-world-gear aria-label="世界与时间线设置">${icon('settings')}</summary>
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
            <label class="field"><span>世界观说明</span><textarea id="workbench-world-lore" placeholder="写这个世界共同遵循的世界观、规则、地点常识和关系背景。">${escapeHtml(world.worldLore)}</textarea></label>
            <label class="field"><span>当前地点</span><input id="workbench-world-current-location" value="${escapeHtml(world.currentLocation)}" placeholder="例如：便利店靠窗座位" /></label>
            <label class="field"><span>当前氛围</span><input id="workbench-world-scene-atmosphere" value="${escapeHtml(world.sceneAtmosphere)}" placeholder="例如：雨天、放松、微妙亲近" /></label>
            <label class="field"><span>场景摘要</span><textarea id="workbench-world-scene-summary" placeholder="当前日常 RP 正在发生什么。">${escapeHtml(world.sceneSummary)}</textarea></label>
          </section>
          ${renderWorldRenderModeSetting()}
          ${renderWorldDrawerTimeline(worldWorkbenchPanelContext())}
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

function worldWorkbenchPanelContext(): WorldWorkbenchPanelContext {
  return {
    timelineNoteDraft,
    renderTimeline,
  };
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
        <button class="secondary event-settings-manual" data-open-event-composer-mode="manual" type="button">${icon('world')}<span>手写事件</span></button>
        <span>创建后会直接进入对应片段的 RP 对话舞台。</span>
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

function selectedWorldRpEvent(): WorldEvent | undefined {
  const worldId = activeWorld().id;
  return state.worldEvents.find(event => event.id === activeWorldRpEventId && event.worldId === worldId);
}

function editableWorldRpMessage() {
  const event = selectedWorldRpEvent();
  return event?.rpMessages.find(message => message.id === worldRpMessageEditId && message.role === 'user');
}

function worldRpRerollTarget(messageId: string): WorldEventRpMessage | undefined {
  const event = selectedWorldRpEvent();
  if (!event) return undefined;
  const messages = worldEventRpMessages(event.id);
  const index = messages.findIndex(message => message.id === messageId);
  if (index < 0) return undefined;
  const message = messages[index];
  if (message.role === 'assistant') return message;
  return messages.slice(index + 1).find(item => item.role === 'assistant');
}

function renderWorldRpMessageActions(message: WorldEventRpMessage): string {
  if (worldRpMessageActionId !== message.id || message.role === 'system') return '';
  const canEdit = message.role === 'user';
  const canReroll = Boolean(worldRpRerollTarget(message.id));
  return `
    <div class="world-rp-message-actions" role="menu">
      ${canEdit ? `<button type="button" data-edit-world-rp-message="${escapeHtml(message.id)}"><span>✎</span>修改</button>` : ''}
      ${canReroll ? `<button type="button" data-regenerate-world-rp-message="${escapeHtml(message.id)}"><span>↻</span>重roll</button>` : ''}
      <button type="button" data-delete-world-rp-message="${escapeHtml(message.id)}"><span>⌫</span>删除</button>
    </div>
  `;
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
          <article class="player-action-card world-rp-action-message ${worldRpMessageActionId === message.id ? 'is-actions-open' : ''}"
            data-world-rp-action-message="${escapeHtml(message.id)}" data-world-rp-message-id="${escapeHtml(message.id)}" tabindex="0">
            ${renderWorldRpMessageActions(message)}
            <div class="player-action-head">
              <span class="render-label">${escapeHtml(actionLabel)}</span>
            </div>
            <p class="narrative-text">${escapeHtml(message.content)}</p>
          </article>
          ${renderWorldRpVariantBar(message)}
        `;
      }
      if (message.role === 'system') {
        return `<div class="system-note">${escapeHtml(message.content)}</div>`;
      }
      const renderedSegments = parseRpRenderSegments(message.content, {
        fallbackSpeaker: character?.name ?? '角色',
        fallbackEmotion: '回应',
        plainTextMode: 'narration',
      }).map(segment => renderRpSegment(segment, character)).join('');
      return `
        <div class="world-rp-assistant-turn world-rp-action-message ${worldRpMessageActionId === message.id ? 'is-actions-open' : ''}"
          data-world-rp-action-message="${escapeHtml(message.id)}" data-world-rp-message-id="${escapeHtml(message.id)}" tabindex="0">
          ${renderWorldRpMessageActions(message)}
          ${renderedSegments}
        </div>
        ${renderWorldRpVariantBar(message)}
      `;
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

function selectedRelationshipPairForInsight(characters: CharacterProfile[]): [CharacterProfile | undefined, CharacterProfile | undefined] {
  const first = characters.find(character => character.id === relationshipPairACharacterId);
  const second = characters.find(character => character.id === relationshipPairBCharacterId && character.id !== first?.id);
  if (!first) relationshipPairACharacterId = '';
  if (!second) relationshipPairBCharacterId = '';
  return [first, second];
}

function renderWorldInsightTabs(): string {
  return `
    <nav class="world-insight-tabs" aria-label="世界洞察">
      ${WORLD_INSIGHT_TABS.map(tab => `
        <button class="${worldInsightTab === tab.value ? 'is-active' : ''}" data-world-insight-tab="${escapeHtml(tab.value)}" type="button">${escapeHtml(tab.label)}</button>
      `).join('')}
    </nav>
  `;
}

function renderWorldRelationshipInsight(): string {
  const characters = worldInsightCharacters();
  if (characters.length < 2) {
    return `
      <section class="relationship-network-empty">
        <strong>至少需要两个角色</strong>
        <span>先导入或创建角色，再在这里查看关系图、建立角色之间的双向关系。</span>
      </section>
    `;
  }
  const characterById = new Map(characters.map(character => [character.id, character]));
  const relationships = worldInsightRelationships(new Set(characterById.keys()));
  const [first, second] = selectedRelationshipPairForInsight(characters);
  const visibleRelationships = relationshipInsightVisibleRelationships(relationships, first, second);
  const visibleRelationshipIds = new Set(visibleRelationships.map(relationship => relationship.id));
  const visibleCharacterIds = relationshipInsightVisibleCharacterIds(characters, visibleRelationships, first, second);
  const positions = new Map(characters.map((character, index) => [character.id, relationshipNetworkPosition(index, characters.length)]));
  const selectedIds = new Set([first?.id ?? '', second?.id ?? ''].filter(Boolean));
  const highlightedIds = selectedIds.size > 0
    ? new Set(
      visibleRelationships
        .filter(relationship =>
          selectedIds.has(relationship.characterAId)
          || selectedIds.has(relationship.characterBId)
          || relationshipPairIsSelected(relationship, first, second),
        )
        .flatMap(relationship => [relationship.characterAId, relationship.characterBId]),
    )
    : new Set<string>();
  selectedIds.forEach(id => highlightedIds.add(id));
  const lines = relationships.map(relationship => {
    const left = characterById.get(relationship.characterAId);
    const right = characterById.get(relationship.characterBId);
    const leftPosition = positions.get(relationship.characterAId);
    const rightPosition = positions.get(relationship.characterBId);
    if (!left || !right || !leftPosition || !rightPosition) return '';
    const selected = relationshipPairIsSelected(relationship, first, second);
    const visible = visibleRelationshipIds.has(relationship.id);
    const tone = relationshipInsightTone(relationship);
    return `
      <line
        class="relationship-network-line stage-${tone} ${selected ? 'is-selected' : ''} ${visible ? '' : 'is-hidden'}"
        data-world-relationship-line="${escapeHtml(relationship.id)}"
        x1="${leftPosition.x.toFixed(2)}" y1="${leftPosition.y.toFixed(2)}"
        x2="${rightPosition.x.toFixed(2)}" y2="${rightPosition.y.toFixed(2)}"
        stroke-width="${relationshipInsightStrokeWidth(relationship)}"
      />
    `;
  }).join('');
  const nodes = characters.map((character, index) => {
    const position = positions.get(character.id) ?? relationshipNetworkPosition(index, characters.length);
    const selected = selectedIds.has(character.id);
    const highlighted = highlightedIds.has(character.id);
    const visible = visibleCharacterIds.has(character.id);
    return `
      <button
        class="relationship-network-node ${selected ? 'is-selected' : ''} ${highlighted ? 'is-highlighted' : ''} ${visible ? '' : 'is-hidden'}"
        data-world-relationship-character="${escapeHtml(character.id)}"
        style="left:${position.x.toFixed(2)}%;top:${position.y.toFixed(2)}%"
        title="${escapeHtml(character.name)}"
        type="button"
      >
        <span class="relationship-network-avatar"${avatarToneAttribute(character)}>${renderAvatar(character)}</span>
        <strong>${escapeHtml(compactText(character.name, 8))}</strong>
      </button>
    `;
  }).join('');
  return `
    <section class="world-relationship-insight">
      <div class="relationship-network-panel">
        <div class="relationship-network-canvas" data-world-relationship-canvas aria-label="角色关系图">
          <svg class="relationship-network-svg" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            ${lines}
          </svg>
          ${nodes}
        </div>
        ${relationships.length === 0 ? `
          <p class="relationship-network-hint">当前还没有关系线。点选两个角色后，可以在右侧建立第一条关系。</p>
        ` : ''}
      </div>
      <aside class="relationship-inspector">
        <header>
          <span>关系检查器</span>
          <strong>${first && second ? `${escapeHtml(first.name)} ↔ ${escapeHtml(second.name)}` : first ? `${escapeHtml(first.name)} ↔ 选择另一位` : '关系概览'}</strong>
        </header>
        ${first && second ? renderCharacterRelationshipEditor(first, second) : renderRelationshipOverviewList(visibleRelationships, characterById)}
      </aside>
    </section>
  `;
}

function renderWorldTimelineFilterButtons(entries: TimelineEntry[]): string {
  const counts = entries.reduce((map, entry) => map.set(entry.type, (map.get(entry.type) ?? 0) + 1), new Map<TimelineEntry['type'], number>());
  return `
    <div class="timeline-type-filter" aria-label="时间线类型筛选">
      ${WORLD_TIMELINE_FILTERS
        .filter(filter => filter.value === 'all' || counts.has(filter.value as TimelineEntry['type']) || worldTimelineTypeFilter === filter.value)
        .map(filter => {
          const count = filter.value === 'all' ? entries.length : counts.get(filter.value as TimelineEntry['type']) ?? 0;
          return `
            <button class="${worldTimelineTypeFilter === filter.value ? 'is-active' : ''}" data-world-timeline-type="${escapeHtml(filter.value)}" type="button">
              <span>${escapeHtml(filter.label)}</span>
              <small>${count}</small>
            </button>
          `;
        }).join('')}
    </div>
  `;
}

function renderWorldTimelineSearchControls(): string {
  const characters = state.characters.filter(character => character.worldId === activeWorld().id);
  return `
    <div class="timeline-search-controls">
      <label class="contact-search timeline-search-field">
        ${icon('search')}
        <input data-world-timeline-search value="${escapeHtml(worldTimelineSearchQuery)}" placeholder="搜索世界记录" />
      </label>
      <select data-world-timeline-character aria-label="按角色筛选世界记录">
        <option value="all" ${worldTimelineCharacterFilter === 'all' ? 'selected' : ''}>全部角色</option>
        ${characters.map(character => `
          <option value="${escapeHtml(character.id)}" ${worldTimelineCharacterFilter === character.id ? 'selected' : ''}>${escapeHtml(character.name)}</option>
        `).join('')}
      </select>
    </div>
  `;
}

function renderWorldTimelineInsight(): string {
  const entries = timelineForActiveWorld();
  const filteredEntries = filterTimelineEntries(entries, {
    type: worldTimelineTypeFilter,
    query: worldTimelineSearchQuery,
    characterId: worldTimelineCharacterFilter === 'all' ? '' : worldTimelineCharacterFilter,
  })
    .sort((left, right) => right.createdAt - left.createdAt);
  const grouped = filteredEntries.reduce((map, entry) => {
    const key = timelineInsightDateKey(entry);
    const group = map.get(key) ?? { label: timelineInsightDateLabel(entry), entries: [] as TimelineEntry[] };
    group.entries.push(entry);
    map.set(key, group);
    return map;
  }, new Map<string, { label: string; entries: TimelineEntry[] }>());
  return `
    <section class="world-timeline-insight">
      ${renderWorldTimelineSearchControls()}
      ${renderWorldTimelineFilterButtons(entries)}
      ${entries.length === 0 ? `
        <div class="moments-empty">
          <strong>还没有世界记录</strong>
          <span>聊天、动态、小事件、关系变化和手动记录会在这里按日期汇总。</span>
        </div>
      ` : filteredEntries.length === 0 ? `
        <div class="moments-empty">
          <strong>没有匹配的世界记录</strong>
          <span>换个关键词、角色或类型筛选，或者继续推进世界内容后再回来查看。</span>
        </div>
      ` : `
        <div class="timeline-track-list">
          ${Array.from(grouped.entries()).map(([key, group]) => `
            <section class="timeline-track-day" data-world-timeline-day="${escapeHtml(key)}">
              <header>
                <strong>${escapeHtml(group.label)}</strong>
                <span>${group.entries.length} 条记录</span>
              </header>
              <div class="timeline-track-entries">
                ${group.entries.map(renderTimelineTrackEntry).join('')}
              </div>
            </section>
          `).join('')}
        </div>
      `}
    </section>
  `;
}

function renderMemorySummaryDrawer(): string {
  const summaries = memorySummariesForWorld();
  const character = worldRpActiveCharacter() ?? activeCharacter();
  const drawerClass = memorySummaryDrawerExpanded
    ? 'memory-summary-drawer is-expanded'
    : 'memory-summary-drawer';
  const totalCount = summaries.length;
  return `
    <section class="${drawerClass}" aria-label="记忆抽屉">
      <header class="memory-summary-drawer-head">
        <div>
          <span>记忆抽屉</span>
          <strong>三层长期记忆</strong>
          <small>${totalCount} 条启用/保存的总结</small>
        </div>
        <div class="memory-summary-tools">
          ${character ? `<button class="secondary" type="button" data-refresh-character-memory-summaries="${escapeHtml(character.id)}">刷新角色总结</button>` : ''}
          <button class="secondary" type="button" data-refresh-macro-summary>生成世界大结</button>
          <button class="secondary" type="button" data-toggle-memory-summary-drawer aria-expanded="${memorySummaryDrawerExpanded ? 'true' : 'false'}">${memorySummaryDrawerExpanded ? '收起' : '展开'}</button>
        </div>
      </header>
      <div class="memory-summary-drawer-body">
      <div class="memory-summary-grid">
        ${renderMemorySummaryGroup('micro', '片段', '聊天、事件或动态积累后会形成片段小结。', summaries)}
        ${renderMemorySummaryGroup('middle', '角色与事件', '片段小结积累后会形成角色或事件中结。', summaries)}
        ${renderMemorySummaryGroup('macro', '世界大结', '生成后的世界大结需要确认后才进入长期上下文。', summaries)}
      </div>
      </div>
    </section>
  `;
}

function renderWorldWorkbenchPage(mobile = false): string {
  const character = worldRpActiveCharacter();
  const selectedEvent = selectedWorldRpEvent();
  const worldEvents = eventsForActiveWorld();
  const memorySummaryDrawer = worldInsightTab === 'events' && selectedEvent ? '' : renderMemorySummaryDrawer();
  const insightBody = worldInsightTab === 'relationships'
    ? renderWorldRelationshipInsight()
    : worldInsightTab === 'timeline'
      ? renderWorldTimelineInsight()
      : selectedEvent
        ? renderWorldEventRpDetail(selectedEvent, character)
        : renderWorldEventLobby(worldEvents, character);
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
        <div class="world-topbar-tabs">
          ${renderWorldInsightTabs()}
        </div>
        <div class="world-stage-actions">
          <button class="secondary world-generate-button" id="generate-event" type="button" aria-label="生成事件" title="生成事件" ${eventGenerating ? 'disabled' : ''}>${icon('add')}<span class="world-action-label">生成事件</span></button>
          ${renderWorldSettingsPanel()}
        </div>
      </header>
      <section class="world-workbench-scroll">
        <div class="world-workbench-column">
          ${memorySummaryDrawer}
          <div class="world-insight-transition-frame" data-world-insight-transition="${worldInsightTab}">
            ${insightBody}
          </div>
        </div>
      </section>
      ${worldInsightTab === 'events' && selectedEvent && selectedEvent.status !== 'resolved' ? renderWorldStageComposer(character) : ''}
      ${renderWorldRpMessageEditDialog()}
      ${renderEventComposerDialog()}
    </main>
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
      ${renderSettingsFold('导入与默认预设', '导入酒馆预设，或写入 PalTavern 默认策略。', `
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
      `)}
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
  const managedReplyStrategyCharacter = replyStrategyManagerCharacter();
  const replyStrategyGenerating = Boolean(
    managedReplyStrategyCharacter && replyStrategyGeneratingCharacterId === managedReplyStrategyCharacter.id,
  );
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
  const replyStrategyCharacterOptions = state.characters
    .filter(item => item.worldId === world.id)
    .map(item => `<option value="${escapeHtml(item.id)}" ${item.id === managedReplyStrategyCharacter?.id ? 'selected' : ''}>${escapeHtml(item.name)}</option>`)
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
    const worldProfileSettings = `
      <label class="field"><span>名称</span><input id="world-name" value="${escapeHtml(world.name)}" /></label>
      <label class="field"><span>说明</span><textarea id="world-description">${escapeHtml(world.description)}</textarea></label>
      <label class="field"><span>世界观说明</span><textarea id="world-lore" placeholder="同世界角色共享的世界观、规则、地点常识和关系背景。">${escapeHtml(world.worldLore)}</textarea></label>
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
      <button id="export-world-bundle" class="secondary secondary-gap" type="button">导出完整世界包 JSON</button>
      ${state.worlds.length > 1 ? '<button id="delete-world" class="danger secondary-gap">删除当前世界</button>' : ''}
    `;
    const newWorldSettings = `
      <label class="field"><span>名称</span><input id="new-world-name" placeholder="例如：海边小城" /></label>
      <button id="create-world" class="secondary">创建并进入新世界</button>
    `;
    const characterCardSettings = `
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
        <p class="muted">卡片：${escapeHtml(character.importInfo.sourceFormat.toUpperCase())} · ${escapeHtml(character.importInfo.spec)} · 世界书 ${character.importInfo.worldBookEntryCount} 条。正文请到角色私信设置里的世界书折叠项编辑。</p>
        <div class="character-edit-form">
          <label class="field"><span>卡名</span><input id="character-name" value="${escapeHtml(character.name)}" /></label>
          <button id="save-character-details" class="secondary">保存卡名</button>
        </div>
        <div class="character-manage-actions">
          <button id="export-tavern-card" class="secondary">导出酒馆角色卡 JSON</button>
          <button id="delete-character" class="danger">删除角色卡</button>
        </div>
      ` : '<p class="muted">选择或导入角色后，可以在这里查看并导出角色卡。</p>'}
    `;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">空间管理</span><h2>世界与角色</h2></div>
        <p>管理当前世界、创建新世界，并导入或导出角色卡。</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('世界资料', world.currentLocation.trim() || locationLabel, worldProfileSettings, true)}
        ${renderSettingsFold('新建世界', '创建一个独立日常空间。', newWorldSettings)}
        ${renderSettingsFold('角色卡', character ? `${character.name} · ${character.importInfo.worldBookEntryCount} 条世界书` : '导入、写卡和导出。', characterCardSettings)}
      </div>
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
    const apiUrl = apiUrlForProvider(provider, config.apiUrl);
    const modelConnectionSettings = `
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
    `;
    const modelBudgetSettings = `
      <div class="two-columns">
        <label class="field"><span>温度</span><input id="temperature" type="number" min="0" max="2" step="0.05" value="${config.temperature}" /></label>
        <label class="field"><span>每日自动输出预算</span><input id="daily-request-limit" type="number" min="1" value="${config.dailyRequestLimit}" /></label>
      </div>
      <p class="muted">今日自动已使用：${state.modelUsage.requestCount} / ${state.modelConfig.dailyRequestLimit}</p>
      <label class="field field-inline">
        <span>逐字显示回复</span>
        <input id="stream-replies" type="checkbox" ${config.streamReplies !== false ? 'checked' : ''} />
      </label>
      <p class="muted">私聊时边生成边显示，不用等整段回复写完。个别中转服务不支持时可以关掉；安卓版的网络层会一次性收完整段，效果和关闭时一样。</p>
    `;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">AI 服务</span><h2>模型连接</h2></div>
        <p>配置兼容 OpenAI 接口的模型服务。预算只限制自动输出，不限制手动聊天、写卡和手动生成。</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('连接信息', `${provider} · ${config.model || '未选择模型'}`, modelConnectionSettings, true)}
        ${renderSettingsFold('参数与预算', `今日 ${state.modelUsage.requestCount} / ${state.modelConfig.dailyRequestLimit}`, modelBudgetSettings)}
      </div>
      <button id="save-model" class="secondary">保存模型设置</button>
    </section>`;
  }
  if (activeSettingsSection === 'prompts') {
    return renderPromptPresetSettings();
  }
  if (activeSettingsSection === 'relationship') {
    const characterRelationshipSettings = `
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
    `;
    const relationshipNetworkSettings = `
      <div class="settings-heading compact-heading">
        <div><span class="settings-kicker">角色关系网</span><h2>角色之间的关系</h2></div>
        <p>每对角色有两个独立视角，阶段建议只会先进入待确认，不会自动生效。</p>
      </div>
      ${renderCharacterRelationshipEditor(relationshipPairA, relationshipPairB)}
    `;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">角色节奏</span><h2>关系状态</h2></div>
        <p>${managedRelationshipCharacter ? '选择角色并单独调整关系阶段、好感度与关系摘要。' : '导入角色后可设置关系状态。'}</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('当前角色关系', managedRelationshipCharacter ? managedRelationshipCharacter.name : '暂无角色', characterRelationshipSettings, true)}
        ${renderSettingsFold('角色关系网', '编辑角色之间的双向关系。', relationshipNetworkSettings)}
      </div>
    </section>`;
  }
  if (activeSettingsSection === 'interactions') {
    const stats = backgroundInteractionStats(activeWorld().id);
    const nextInteraction = state.worldInteractionNextAttemptAt
      ? new Date(state.worldInteractionNextAttemptAt).toLocaleString()
      : '尚未安排';
    const worldInteractionSettings = `
      <label class="field field-inline">
        <span>热闹世界</span>
        <input id="world-interaction-high-simulation" type="checkbox" ${state.worldInteractionHighSimulation ? 'checked' : ''} />
      </label>
      <p class="muted">当前：${state.worldInteractionHighSimulation ? '热闹世界已开启，角色会更频繁评论、回应和产生小交集。' : '克制自然，角色间互动会少量发生，不抢注意力。'}</p>
      <div class="status-grid">
        <div><dt>今日互动</dt><dd>${stats.todayCount} / ${stats.worldDailyLimit}</dd></div>
        <div><dt>下次检查</dt><dd>${escapeHtml(nextInteraction)}</dd></div>
      </div>
      <p class="muted">最近原因：${escapeHtml(stats.recentReason)}</p>
      <button id="save-world-interactions" class="secondary" type="button">保存角色互动设置</button>
    `;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">世界生活循环</span><h2>角色互动</h2></div>
        <p>让同一世界里的角色根据当前计划、关系网、动态和时间线自然产生低噪音互动。默认保持克制，热闹世界会更频繁。</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('互动频率', `${state.worldInteractionHighSimulation ? '热闹世界' : '克制自然'} · 今日 ${stats.todayCount} / ${stats.worldDailyLimit}`, worldInteractionSettings, true)}
      </div>
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
    const userPersonaSettings = `
      <label class="field"><span>用户名称</span><input id="user-name" value="${escapeHtml(state.userName)}" placeholder="我" /></label>
      <label class="field">
        <span>user 人设</span>
        <textarea id="user-persona" placeholder="例如：高二学生，住在学校附近，说话偏直白，但其实很容易心软。">${escapeHtml(world.userPersona)}</textarea>
      </label>
      <p class="muted">这段绑定当前世界，会写进模型提示词，帮助角色理解“你是谁”；不会替你发言，也不会写进角色卡导出。</p>
    `;
    const replyStrategySettings = `
      ${managedReplyStrategyCharacter ? `
        <div class="relationship-character-selector">
          <label class="field">
            <span>编辑哪位角色的回复策略</span>
            <select id="reply-strategy-character-select">${replyStrategyCharacterOptions}</select>
          </label>
          <div class="relationship-character-preview">
            <span class="avatar">${renderAvatar(managedReplyStrategyCharacter)}</span>
            <div><strong>${escapeHtml(managedReplyStrategyCharacter.name)}</strong><small>这里只保存这个角色自己的说话策略</small></div>
          </div>
        </div>
        <label class="field">
          <span>${escapeHtml(managedReplyStrategyCharacter.name)} 的回复策略</span>
          <textarea id="character-reply-strategy" rows="6" placeholder="例如：回复更短，偏口语；开心时会连发两三条，紧张时会停顿；不要替 user 做决定。">${escapeHtml(managedReplyStrategyCharacter.replyStrategy ?? '')}</textarea>
        </label>
        <p class="muted">这段只跟随 ${escapeHtml(managedReplyStrategyCharacter.name)}，私聊和群聊轮到 TA 发言时才会使用，不会覆盖其他角色。</p>
        <button id="regenerate-character-reply-strategy" class="secondary" type="button" ${replyStrategyGenerating ? 'disabled' : ''}>${replyStrategyGenerating ? 'AI 正在生成人设策略…' : '按人设生成回复策略'}</button>
        <button id="save-character-reply-strategy" class="secondary" type="button">保存 ${escapeHtml(managedReplyStrategyCharacter.name)} 的回复策略</button>
      ` : '<p class="muted">导入角色后，可以给每个角色单独写回复策略。</p>'}
    `;
    const replyModeSettings = `
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
      <label class="group-reply-toggle">
        <span>
          <strong>回车直接发送</strong>
          <small>打开后，私聊和群聊输入框按 Enter 发送；Shift + Enter 仍然换行。</small>
        </span>
        ${renderSwitchControl('id="enter-to-send"', state.enterToSend, '回车直接发送')}
      </label>
    `;
    const companionTimeSettings = `
      <p class="muted">当前显示：${escapeHtml(formatCompanionDateTime(state))}（${escapeHtml(companionTimeModeLabel(state.companionTimeMode))}）。</p>
      ${renderCompanionTimeFields('settings')}
    `;
    const displaySettings = `
      <label class="field chat-font-scale-field">
        <span>聊天字体大小</span>
        <input id="chat-font-scale" type="range" min="0.85" max="1.25" step="0.05" value="${normalizeChatFontScale(state.chatFontScale)}" />
      </label>
      <div class="chat-font-preview" style="--chat-font-scale:${normalizeChatFontScale(state.chatFontScale)}">
        <strong>${escapeHtml(fontScaleLabel(state.chatFontScale))}</strong>
        <span>这是一段聊天预览，私聊和群聊会按这个大小显示。</span>
      </div>
      <p class="muted">只调整聊天阅读和输入区域，不改变设置中心自己的密度。</p>
    `;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">发送习惯</span><h2>聊天与 user 人设</h2></div>
        <p>设置你在聊天里是谁，以及角色什么时候开始回复。</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('我的人设', state.userName || '我', userPersonaSettings, true)}
        ${renderSettingsFold('角色回复策略', managedReplyStrategyCharacter ? managedReplyStrategyCharacter.name : '按角色分别保存', replyStrategySettings, true)}
        ${renderSettingsFold('回复方式与发送键', state.chatReplyMode === 'manual' ? '短消息模式' : '长消息模式', replyModeSettings)}
        ${renderSettingsFold('显示字号', fontScaleLabel(state.chatFontScale), displaySettings)}
        ${renderSettingsFold('陪伴时间', companionTimeModeLabel(state.companionTimeMode), companionTimeSettings)}
      </div>
      <button id="save-chat-reply-mode" class="secondary secondary-gap" type="button">保存聊天与 user 人设</button>
    </section>`;
  }
  if (activeSettingsSection === 'notifications') {
    const notificationPermissionSettings = `
      <p class="muted">${escapeHtml(notificationSupportText())}</p>
      <button id="request-notification" class="secondary">申请通知权限</button>
      <button id="test-notification" class="secondary secondary-gap">发送测试通知</button>
    `;
    const backgroundHostSettings = `
      <p class="muted">${escapeHtml(backgroundRuntimeStatusText())}</p>
    `;
    return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">系统提醒</span><h2>通知</h2></div>
        <p>主动消息成功写入私聊后，按照角色的隐私等级发送系统通知。</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('通知权限', '系统提醒和测试通知。', notificationPermissionSettings, true)}
        ${renderSettingsFold('后台宿主', '查看本机后台状态。', backgroundHostSettings)}
      </div>
    </section>`;
  }
  const runtimeActionSettings = `
    <button id="force-restart-services" class="secondary" type="button" ${serviceRestartLoading ? 'disabled' : ''}>${serviceRestartLoading ? '正在重启…' : '强制重启所有服务'}</button>
    <p class="muted">等同重新打开应用，只重新拉起运行服务，不刷新或生成已有内容。</p>
  `;
  const backupSettings = `
    <button id="export-backup" class="secondary">导出备份 JSON</button>
    <label class="file-button secondary-file">导入备份 JSON<input id="backup-import" type="file" accept=".json,application/json" /></label>
  `;
  const runtimeLogSettings = `
    <div class="status status-panel">${escapeHtml(statusText)}</div>
  `;
  return `
    <section class="settings-card">
      <div class="settings-heading">
        <div><span class="settings-kicker">本地管理</span><h2>数据与运行</h2></div>
        <p>备份完整本地状态，并查看最近一次操作结果。</p>
      </div>
      <div class="settings-fold-list">
        ${renderSettingsFold('运行操作', serviceRestartLoading ? '正在重启服务。' : '重启后台服务。', runtimeActionSettings)}
        ${renderSettingsFold('备份恢复', '导出或导入完整本地数据。', backupSettings, true)}
        ${renderSettingsFold('运行记录', statusText ? compactText(statusText, 80) : '暂无新的操作记录。', runtimeLogSettings)}
      </div>
    </section>
  `;
}

function renderDesktopSettingsPage(character?: CharacterProfile): string {
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
    <main class="settings-window desktop-settings-page" aria-label="设置中心">
      <header class="settings-topbar">
        <div><span class="settings-kicker">PalTavern</span><h1>设置中心</h1></div>
        <button class="icon-button" id="close-settings" aria-label="返回">×</button>
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
        <section class="settings-content">${renderSettingsContent(character)}</section>
      </div>
    </main>
  `;
}

function renderModelOnboarding(): string {
  if (!modelOnboardingOpen) return '';
  const provider = modelProviderFor(modelOnboardingDraft.apiUrl, modelOnboardingDraft.provider);
  const apiUrl = apiUrlForProvider(provider, modelOnboardingDraft.apiUrl);
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

function renderWorldBundleImportDialog(): string {
  if (!pendingWorldBundleImport) return '';
  const preview = pendingWorldBundleImport;
  return `
    <div class="card-recognition-overlay" role="dialog" aria-modal="true" aria-label="导入完整世界包">
      <button class="card-recognition-backdrop" id="cancel-world-bundle-import" type="button" aria-label="取消导入"></button>
      <section class="card-recognition-dialog">
        <header>
          <span>完整世界包</span>
          <h2>${escapeHtml(preview.worldName)}</h2>
          <p>导出时间：${escapeHtml(worldBundleExportedAtLabel(preview.exportedAt))}。请选择这次要导入的部分。</p>
        </header>
        <div class="card-recognition-list">
          ${worldBundleImportRows(preview).map(row => `
            <label class="card-recognition-item">
              <input type="checkbox" name="world-bundle-section" value="${escapeHtml(row.section)}" checked ${row.disabled ? 'disabled' : ''} />
              <span>
                <strong>${escapeHtml(row.title)}${row.disabled ? '（必选）' : ''}</strong>
                <small>${escapeHtml(row.detail)}</small>
              </span>
            </label>
          `).join('')}
        </div>
        <footer>
          <button id="cancel-world-bundle-import-button" class="secondary" type="button">取消</button>
          <button id="import-world-bundle-selected" class="primary" type="button">导入选中部分</button>
        </footer>
      </section>
    </div>
  `;
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
        ${renderCardImportDiagnostics(character, candidates)}
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
              <img src="${escapeHtml(displayImageUrl(sticker.dataUrl))}" alt="" />
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

function firstRunGuideState(compact = false): FirstRunGuideState {
  const characterDone = state.characters.some(character => character.worldId === activeWorld().id);
  const contentDone = state.messages.length > 0
    || state.groupMessages.length > 0
    || state.moments.length > 0
    || state.worldEvents.length > 0;
  return {
    modelDone: modelIsReady(),
    characterDone,
    contentDone,
    dismissed: isFirstRunGuideDismissed(),
    compact,
  };
}

// 大注释：电脑版三栏布局。
// 最左是窄导航栏（消息/角色/世界/动态/设置，和手机底栏同一套入口），
// 中间列表只在消息和角色两个分区出现，世界、动态、设置直接占满右侧主区。
type DesktopListMode = 'messages' | 'contacts';
let desktopListMode: DesktopListMode = 'messages';

function desktopActiveNavId(): MobileSection {
  if (settingsOpen) return 'settings';
  if (state.activeView === 'world') return 'world';
  if (state.activeView === 'moments') return 'moments';
  return desktopListMode;
}

function desktopListPaneVisible(): boolean {
  return !settingsOpen && (state.activeView === 'chat' || state.activeView === 'groups');
}

function renderDesktopRail(): string {
  const activeId = desktopActiveNavId();
  const navTarget = (id: MobileSection): string => {
    if (id === 'settings') return 'id="open-settings"';
    if (id === 'world') return 'data-view="world"';
    if (id === 'moments') return 'data-view="moments"';
    return `data-view="chat" data-desktop-list="${id}"`;
  };
  const navButton = ({ id, label, iconName }: typeof MAIN_NAV_ITEMS[number]): string => `
    <button class="desktop-rail-button ${activeId === id ? 'is-active' : ''}" ${navTarget(id)} type="button" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"${activeId === id ? ' aria-current="page"' : ''}>
      <span class="nav-icon">${icon(iconName)}</span>
      <small>${escapeHtml(label)}</small>
    </button>
  `;
  return `
    <nav class="desktop-rail" aria-label="主导航">
      <div class="desktop-rail-brand" aria-label="PalTavern" title="PalTavern">PT</div>
      <div class="desktop-rail-items">
        ${MAIN_NAV_ITEMS.filter(item => item.id !== 'settings').map(navButton).join('')}
      </div>
      <div class="desktop-rail-footer">
        ${MAIN_NAV_ITEMS.filter(item => item.id === 'settings').map(navButton).join('')}
      </div>
    </nav>
  `;
}

function renderDesktopListPane(): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  const contactsMode = desktopListMode === 'contacts';
  const cardActions = `
    <div class="desktop-list-card-actions">
      <button class="primary" data-open-authoring type="button">写角色卡</button>
      <label class="file-button card-import-button">${icon('import')}<span>导入角色卡</span><input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
    </div>
  `;
  return `
    <aside class="sidebar desktop-list-pane" aria-label="${contactsMode ? '角色列表' : '会话列表'}">
      <header class="desktop-list-header">
        ${renderPrivateChatTargetSelector()}
        ${contactsMode ? '' : `<button class="icon-button" data-open-group-create type="button" aria-label="新建群聊" title="新建群聊">${icon('add')}</button>`}
      </header>
      <div class="desktop-list-tools">
        <label class="world-switcher"><span>当前世界</span><select id="world-select" aria-label="切换世界">${worldOptions}</select></label>
        <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="${contactsMode ? '搜索角色' : '搜索会话'}" /></label>
        ${contactsMode ? cardActions : ''}
      </div>
      <div class="desktop-list-scroll">
        ${contactsMode ? '' : renderDailyBriefBanner()}
        ${contactsMode ? '' : renderFirstRunGuide(firstRunGuideState(true))}
        <section class="contacts-section">
          <div class="section-label">${contactsMode ? '全部角色' : '最近联系'}</div>
          <div class="contact-list">${contactsMode ? renderContacts('contacts') : renderInboxConversations()}</div>
        </section>
      </div>
    </aside>
  `;
}

function renderDesktop(character?: CharacterProfile): string {
  const content = characterPanelOpen ? renderCharacterPanel(character)
    : settingsOpen ? renderDesktopSettingsPage(character)
    : state.activeView === 'moments'
    ? renderMomentsPage()
    : state.activeView === 'groups'
      ? (desktopGroupChatOpen ? renderGroupChatPage() : renderGroupListPage())
    : state.activeView === 'world'
      ? renderWorldWorkbenchPage()
      : renderChatPane(character);
  const listVisible = desktopListPaneVisible();
  return `
    <div class="app-shell desktop-shell ${listVisible ? 'has-list-pane' : 'without-list-pane'}">
      ${renderDesktopRail()}
      ${listVisible ? renderDesktopListPane() : ''}
      ${content}
      ${renderGroupSettingsPanel(groupSettingsMode === 'edit' ? activeGroupChat() : undefined)}
    </div>
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

function renderTabletLandscapeNav(): string {
  return `
    <nav class="tablet-landscape-nav" aria-label="平板横屏主导航">
      <div class="tablet-landscape-brand" aria-label="PalTavern">PT</div>
      <div class="tablet-landscape-nav-items">
        ${MAIN_NAV_ITEMS.map(({ id, label, iconName }) => {
          const active = mobileSection === id || (mobileSection === 'groups' && id === 'messages');
          return `
            <button class="tablet-landscape-nav-button ${active ? 'is-active' : ''}" data-mobile-section="${id}" type="button" aria-label="${escapeHtml(label)}">
              <span class="nav-icon">${icon(iconName)}</span>
              <small>${escapeHtml(label)}</small>
            </button>
          `;
        }).join('')}
      </div>
    </nav>
  `;
}

function renderTabletLandscapeEmptyDetail(title: string, body: string, action = ''): string {
  return `
    <section class="tablet-landscape-empty-detail">
      <div>
        <span class="eyebrow">PalTavern</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(body)}</p>
        ${action}
      </div>
    </section>
  `;
}

function renderTabletLandscapeInbox(): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  const detail = mobileGroupChatOpen
    ? renderGroupChatPage(true)
    : mobileChatOpen
      ? renderChatPane(activePrivateChatTarget(), true)
      : renderTabletLandscapeEmptyDetail('选择一个会话', '从左侧列表打开私聊或群聊，横屏下会在这里继续对话。');
  return `
    <section class="tablet-landscape-page tablet-landscape-split tablet-landscape-messages" aria-label="消息">
      <aside class="tablet-landscape-list tablet-landscape-inbox-list">
        <header class="tablet-landscape-list-header">
          ${renderPrivateChatTargetSelector() || `<div><span class="eyebrow">${escapeHtml(activeWorld().name)}</span><h1>消息</h1><p>私聊和群聊会话。</p></div>`}
          <button class="icon-button inbox-create-group" data-open-groups type="button" aria-label="新建群聊">${icon('add')}</button>
        </header>
        <div class="tablet-landscape-list-tools">
          <label class="world-switcher"><span>当前世界</span><select data-world-select aria-label="选择消息世界">${worldOptions}</select></label>
          <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="搜索会话" /></label>
        </div>
        ${renderFirstRunGuide(firstRunGuideState(true))}
        <section class="tablet-landscape-list-scroll mobile-conversation-list">${renderInboxConversations()}</section>
      </aside>
      <section class="tablet-landscape-detail">${detail}</section>
    </section>
  `;
}

function renderTabletLandscapeContacts(): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  const detail = mobileChatOpen
    ? renderChatPane(activePrivateChatTarget(), true)
    : renderTabletLandscapeEmptyDetail(
      '选择一个角色',
      '从左侧联系人打开独立私聊；角色卡写作和导入入口也保留在这里。',
      state.characters.length === 0
        ? '<button class="primary" data-open-authoring type="button">写第一张角色卡</button>'
        : '',
    );
  return `
    <section class="tablet-landscape-page tablet-landscape-split tablet-landscape-contacts" aria-label="角色">
      <aside class="tablet-landscape-list">
        <header class="tablet-landscape-list-header">
          <div><span class="eyebrow">${escapeHtml(activeWorld().name)}</span><h1>角色</h1><p>选择一个角色进入私聊。</p></div>
        </header>
        <div class="tablet-landscape-list-tools">
          <label class="world-switcher"><span>当前世界</span><select data-world-select aria-label="选择联系人世界">${worldOptions}</select></label>
          <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="搜索角色" /></label>
          ${renderPrivateChatTargetSelector()}
          <div class="tablet-landscape-inline-actions">
            <button class="primary" data-open-authoring type="button">写角色卡</button>
            <label class="file-button card-import-button">${icon('import')}<span>导入角色卡</span><input class="card-import" type="file" accept="${CARD_IMPORT_ACCEPT}" /></label>
          </div>
        </div>
        <section class="tablet-landscape-list-scroll mobile-conversation-list">${renderContacts('contacts')}</section>
      </aside>
      <section class="tablet-landscape-detail">${detail}</section>
    </section>
  `;
}

function renderTabletLandscapeGroups(): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  const rows = renderGroupConversationRows();
  const hasGroups = groupChatsForPrivateIdentity().length > 0;
  const detail = mobileGroupChatOpen
    ? renderGroupChatPage(true)
    : renderTabletLandscapeEmptyDetail(
      hasGroups ? '选择一个群聊' : '还没有群聊',
      hasGroups ? '从左侧打开群聊，或创建新的多人频道。' : '先创建一个群聊，再把角色拉进来。',
      '<button class="primary" data-open-group-create type="button">创建群聊</button>',
    );
  return `
    <section class="tablet-landscape-page tablet-landscape-split tablet-landscape-groups" aria-label="群聊">
      <aside class="tablet-landscape-list">
        <header class="tablet-landscape-list-header">
          <div><span class="eyebrow">${escapeHtml(activeWorld().name)}</span><h1>群聊</h1><p>多人频道和群聊设置。</p></div>
          <button class="icon-button" data-open-group-create type="button" aria-label="创建群聊">${icon('add')}</button>
        </header>
        <div class="tablet-landscape-list-tools">
          <label class="world-switcher"><span>当前世界</span><select data-world-select aria-label="选择群聊世界">${worldOptions}</select></label>
          <label class="contact-search">${icon('search')}<input id="contact-search" value="${escapeHtml(contactQuery)}" placeholder="搜索群聊或成员" /></label>
        </div>
        <section class="tablet-landscape-list-scroll group-list-rows">
          ${rows || `<div class="list-empty group-list-empty"><strong>${hasGroups ? '没有找到匹配的群聊' : '还没有群聊'}</strong><p>${hasGroups ? '换个关键词试试。' : '先创建一个群聊，再从列表点进去聊天。'}</p></div>`}
        </section>
      </aside>
      <section class="tablet-landscape-detail">${detail}</section>
      ${mobileGroupChatOpen ? '' : renderGroupSettingsPanel(groupSettingsMode === 'edit' ? activeGroupChat() : undefined)}
    </section>
  `;
}

function renderTabletLandscapeContent(character?: CharacterProfile): string {
  if (characterPanelOpen && character) {
    return `<section class="tablet-landscape-page tablet-landscape-single">${renderCharacterPanel(character)}</section>`;
  }
  if (mobileSection === 'groups') return renderTabletLandscapeGroups();
  if (mobileSection === 'contacts') return renderTabletLandscapeContacts();
  if (mobileSection === 'moments') return `<section class="tablet-landscape-page tablet-landscape-single">${renderMomentsPage(true)}</section>`;
  if (mobileSection === 'world') return `<section class="tablet-landscape-page tablet-landscape-single">${renderWorldWorkbenchPage(true)}</section>`;
  if (mobileSection === 'settings') return `<section class="tablet-landscape-page tablet-landscape-single">${renderMobileSettings(character)}</section>`;
  return renderTabletLandscapeInbox();
}

function renderTabletLandscape(character?: CharacterProfile): string {
  return `
    <div class="tablet-landscape-shell">
      ${renderTabletLandscapeNav()}
      <div class="tablet-landscape-content">
        ${renderTabletLandscapeContent(character)}
      </div>
    </div>
  `;
}

function renderMobile(character?: CharacterProfile): string {
  const worldOptions = state.worlds.map(world =>
    `<option value="${escapeHtml(world.id)}" ${world.id === activeWorld().id ? 'selected' : ''}>${escapeHtml(world.name)}</option>`,
  ).join('');
  let content = '';
  if (characterPanelOpen && character) {
    content = renderCharacterPanel(character);
  } else if (mobileChatOpen) {
    content = renderChatPane(activePrivateChatTarget(), true);
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
            <button class="icon-button inbox-create-group" data-open-groups type="button" aria-label="新建群聊">${icon('add')}</button>
          </div>
        </header>
        ${renderFirstRunGuide(firstRunGuideState())}
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
  const hideNavigation = characterPanelOpen || mobileChatOpen || mobileGroupChatOpen || (mobileSection === 'settings' && mobileSettingsDetail);
  return `
    <div class="mobile-shell ${hideNavigation ? 'without-bottom-nav' : ''}">
      ${content}
      ${hideNavigation ? '' : `
        <nav class="bottom-nav" aria-label="主导航">
          ${MAIN_NAV_ITEMS.map(({ id, label, iconName }) => {
            const navSection = id;
            const classes = [
              mobileSection === id || (mobileSection === 'groups' && id === 'messages') ? 'is-active' : '',
              bottomNavPressedSection === navSection ? 'is-pressing' : '',
            ].filter(Boolean).join(' ');
            return `
              <button class="${classes}" data-mobile-section="${id}">
                <span class="nav-icon">${icon(iconName)}</span><small>${label}</small>
              </button>
            `;
          }).join('')}
        </nav>
      `}
    </div>
  `;
}

function renderWithUiTransition(kind: UiTransitionKind, afterRender?: () => void): void {
  // Small comment: app.ts keeps the old one-argument call shape while transitions.ts owns the browser mechanics.
  runUiTransition(kind, () => {
    render();
    afterRender?.();
  });
}

function openConfirmDialog(options: Parameters<typeof openAppConfirm>[0]): void {
  openAppConfirm(options, () => renderWithUiTransition('overlay-in'));
}

function openAlertDialog(options: Parameters<typeof openAppAlert>[0]): void {
  openAppAlert(options, () => renderWithUiTransition('overlay-in'));
}

function openPromptDialog(options: Parameters<typeof openAppPrompt>[0]): void {
  openAppPrompt(options, () => renderWithUiTransition('overlay-in'));
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
  applyCardImportFollowup(importedCharacters[0] ?? characters[0]);
}

function applyCardImportFollowup(character: CharacterProfile): void {
  const action = pendingCardImportFollowup;
  pendingCardImportFollowup = null;
  if (!action) return;
  state.activeCharacterId = character.id;
  characterPanelOpen = true;
  characterPanelPage = action === 'worldbook' ? 'worldbook-editor' : 'worldbook';
  settingsOpen = false;
  mobileChatOpen = false;
  mobileGroupChatOpen = false;
  setVisibleStatus(`已打开 ${character.name} 的${cardImportFollowupLabel(action)}，可以继续补全。`);
  saveUiSessionSnapshot({ captureDom: false });
  renderWithUiTransition('detail-in');
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

function requestChatStickToBottom(): void {
  shouldStickChatToBottom = true;
}

function settleChatScrollAfterRender(
  wasNearChatBottom: boolean,
  preRenderScroll: UiScrollSnapshot | undefined,
): ChatScrollSettleResult {
  if (
    state.activeView !== 'chat'
    && !mobileChatOpen
    && state.activeView !== 'groups'
    && !mobileGroupChatOpen
    && state.activeView !== 'world'
    && mobileSection !== 'world'
  ) {
    return 'none';
  }
  const restoredScroll = restoreScrollIfNeeded() || restoreActionMenuAnchorIfNeeded();
  if (restoredScroll) return 'restored';
  const shouldScrollToBottom = shouldStickChatToBottom
    || (wasNearChatBottom && !messageActionId && !groupMessageActionId);
  shouldStickChatToBottom = false;
  if (shouldScrollToBottom) {
    scrollMessagesToBottom();
    return 'bottom';
  }
  return applyScrollSnapshot(preRenderScroll) ? 'snapshot' : 'none';
}

function deleteActiveCharacterFromUi(): void {
  const character = activeCharacter();
  if (!character) return;
  openConfirmDialog({
    title: '删除角色卡',
    message: `确定删除角色“${character.name}”及其全部聊天记录吗？`,
    confirmLabel: '删除角色',
    cancelLabel: '保留',
    tone: 'danger',
    onConfirm: () => {
      const deleted = deleteCharacter(character.id);
      if (!deleted) return;
      quotedMessageId = '';
      messageActionId = '';
      groupMessageActionId = '';
      stickerPickerOpen = false;
      stickerManagerCharacterId = '';
      relationshipManagerCharacterId = '';
      relationshipPairACharacterId = '';
      relationshipPairBCharacterId = '';
      proactiveManagerCharacterId = '';
      replyStrategyManagerCharacterId = '';
      characterPanelOpen = false;
      characterPanelPage = 'worldbook';
      scrollCharacterPanelToTopAfterRender = false;
      closeMessageProfilePopover();
      if (isCompactViewport()) {
        mobileChatOpen = false;
        mobileGroupChatOpen = false;
        resetGroupSettingsState();
        mobileSection = state.characters.some(item => item.worldId === activeWorld().id) ? 'contacts' : 'settings';
      }
      setStatusText(`已删除角色：${deleted.name}`);
    },
  });
}

function preserveScrollForNextRender(): void {
  pendingScrollRestore = captureScrollSnapshot() ?? pendingScrollRestore;
}

function closeTransientOverlaysForPageChange(): void {
  settingsOpen = false;
  characterPanelOpen = false;
  resetGroupSettingsState();
  resetMobileGroupListClosing();
  stickerPickerOpen = false;
  eventComposerOpen = false;
  eventComposerDropClosing = false;
  momentComposerOpen = false;
  momentComposerDropClosing = false;
  momentComposerLayoutTransition = null;
  resetMomentComposerKeyboardState();
  momentsTutorialOpen = false;
  messageProfileCharacterId = '';
  messageProfileAnchor = null;
  messageActionId = '';
  groupMessageActionId = '';
  worldRpMessageActionId = '';
  worldGearPanelOpen = false;
  worldGearPanelClosing = false;
  window.clearTimeout(worldGearPanelCloseTimer);
  worldGearPanelCloseTimer = undefined;
  document.querySelectorAll<HTMLDetailsElement>('.world-gear-panel[open], .world-persona-select[open], .private-chat-identity-select[open]').forEach(details => {
    if (details.classList.contains('world-gear-panel')) worldGearPanelOpen = false;
    details.open = false;
  });
}

function closeMessageActionMenuInPlace(): void {
  messageActionId = '';
  document.querySelectorAll<HTMLElement>('.message-row.has-actions-open-above').forEach(row => {
    row.classList.remove('has-actions-open-above');
  });
  document.querySelectorAll<HTMLElement>('.message.actions-open-above, .message.actions-open-below').forEach(message => {
    message.classList.remove('actions-open-above', 'actions-open-below');
  });
  document.querySelectorAll<HTMLElement>('.message-actions').forEach(menu => {
    menu.remove();
  });
}

function closeWorldRpMessageActionMenuInPlace(): void {
  worldRpMessageActionId = '';
  document.querySelectorAll<HTMLElement>('.world-rp-action-message.is-actions-open').forEach(message => {
    message.classList.remove('is-actions-open');
  });
  document.querySelectorAll<HTMLElement>('.world-rp-message-actions').forEach(menu => {
    menu.remove();
  });
}

function closeGroupMessageActionMenuInPlace(): void {
  groupMessageActionId = '';
  document.querySelectorAll<HTMLElement>('.group-message.is-actions-open-above').forEach(message => {
    message.classList.remove('is-actions-open-above');
  });
  document.querySelectorAll<HTMLElement>('.group-message.is-actions-open').forEach(message => {
    message.classList.remove('is-actions-open');
  });
  document.querySelectorAll<HTMLElement>('.group-message-actions').forEach(menu => {
    menu.remove();
  });
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

function clearMomentComposerKeyboardTimers(): void {
  window.clearTimeout(momentComposerOpeningTimer);
  window.clearTimeout(momentComposerKeyboardBlurTimer);
  window.clearTimeout(momentComposerCloseKeyboardTimer);
  momentComposerOpeningTimer = undefined;
  momentComposerKeyboardBlurTimer = undefined;
  momentComposerCloseKeyboardTimer = undefined;
}

function releaseMomentComposerClosingFocus(): void {
  momentComposerClosing = false;
  momentComposerDropClosing = false;
  setMomentComposerKeyboardFocus(false);
  momentComposerCloseKeyboardTimer = undefined;
}

function resetMomentComposerKeyboardState(): void {
  clearMomentComposerKeyboardTimers();
  momentComposerOpening = false;
  momentComposerClosing = false;
  momentComposerDropClosing = false;
  momentComposerLayoutTransition = null;
  setMomentComposerKeyboardFocus(false);
}

function finishMomentComposerDropClose(): void {
  momentComposerDropClosing = false;
  momentComposerOpen = false;
  saveUiSessionSnapshot({ captureDom: false });
  render();
}

function clearMomentComposerLayoutTransitionSoon(): void {
  if (!momentComposerLayoutTransition) return;
  window.setTimeout(() => {
    if (!momentComposerLayoutTransition) return;
    momentComposerLayoutTransition = null;
    document.querySelector<HTMLElement>('#moment-composer')?.classList.remove('moment-composer-layout-expanding');
    render();
  }, MOMENT_COMPOSER_LAYOUT_TRANSITION_MS + 40);
}

function expandMomentComposerLayout(): void {
  if (!document.documentElement.classList.contains('moment-composer-keyboard-focus')) return;
  window.clearTimeout(momentComposerKeyboardBlurTimer);
  momentComposerKeyboardBlurTimer = undefined;
  momentComposerLayoutTransition = 'expand';
  document.querySelector<HTMLElement>('#moment-composer')?.classList.add('moment-composer-layout-expanding');
  setMomentComposerKeyboardFocus(false);
  preserveScrollForNextRender();
  saveUiSessionSnapshot({ captureDom: true });
  render();
  clearMomentComposerLayoutTransitionSoon();
}

function expandMomentComposerLayoutInPlace(): void {
  if (!document.documentElement.classList.contains('moment-composer-keyboard-focus')) return;
  momentComposerLayoutTransition = 'expand';
  document.querySelector<HTMLElement>('#moment-composer')?.classList.add('moment-composer-layout-expanding');
  setMomentComposerKeyboardFocus(false);
  clearMomentComposerLayoutTransitionSoon();
}

function closeMomentComposerWithTransition(renderTransition: boolean, dropMotion = false): void {
  captureVisibleDraftsFromDom();
  clearMomentComposerKeyboardTimers();
  momentComposerOpening = false;
  momentComposerClosing = true;
  momentGenerationStatus = '';
  saveUiSessionSnapshot();
  if (dropMotion && renderTransition) {
    momentComposerDropClosing = true;
    momentComposerOpen = true;
    renderWithUiTransition('overlay-out');
    momentComposerCloseKeyboardTimer = window.setTimeout(() => {
      releaseMomentComposerClosingFocus();
      finishMomentComposerDropClose();
    }, Math.max(0, MOMENT_COMPOSER_CLOSE_KEYBOARD_MS - 40));
    return;
  }
  momentComposerOpen = false;
  momentComposerCloseKeyboardTimer = window.setTimeout(
    releaseMomentComposerClosingFocus,
    MOMENT_COMPOSER_CLOSE_KEYBOARD_MS,
  );
  if (renderTransition) renderWithUiTransition('overlay-out');
}

function closeWorldGearPanel(renderTransition = true): void {
  if (!worldGearPanelOpen && !worldGearPanelClosing) return;
  document.querySelectorAll('.pt-action-expand-layer').forEach(element => element.remove());
  window.clearTimeout(worldGearPanelCloseTimer);
  worldGearPanelCloseTimer = undefined;
  captureVisibleDraftsFromDom();
  worldGearPanelOpen = false;
  worldGearPanelClosing = true;
  saveUiSessionSnapshot({ captureDom: false });
  const finishClose = () => {
    worldGearPanelCloseTimer = undefined;
    worldGearPanelClosing = false;
    document.querySelector<HTMLDetailsElement>('.world-gear-panel')?.removeAttribute('open');
    render();
  };
  if (renderTransition) {
    render();
    worldGearPanelCloseTimer = window.setTimeout(finishClose, WORLD_GEAR_CLOSE_MS);
    return;
  }
  finishClose();
}

function clearGroupSettingsOpeningSoon(): void {
  window.clearTimeout(groupSettingsOpeningTimer);
  groupSettingsOpeningTimer = window.setTimeout(() => {
    groupSettingsOpening = false;
    groupSettingsOpeningTimer = undefined;
    document.querySelector<HTMLElement>('.group-settings-panel.is-entering')?.classList.remove('is-entering');
  }, 520);
}

function resetGroupSettingsOpening(): void {
  window.clearTimeout(groupSettingsOpeningTimer);
  groupSettingsOpeningTimer = undefined;
  groupSettingsOpening = false;
}

function resetGroupSettingsClosing(): void {
  window.clearTimeout(groupSettingsCloseTimer);
  groupSettingsCloseTimer = undefined;
  groupSettingsClosing = false;
}

function resetGroupSettingsState(): void {
  resetGroupSettingsOpening();
  resetGroupSettingsClosing();
  groupSettingsOpen = false;
  groupSettingsMode = 'create';
}

function closeGroupSettingsPanel(renderTransition = true): void {
  if (groupSettingsClosing || !groupSettingsOpen) return;
  resetGroupSettingsOpening();
  window.clearTimeout(groupSettingsCloseTimer);
  groupSettingsCloseTimer = undefined;
  captureVisibleDraftsFromDom();
  groupSettingsClosing = true;
  const finishClose = () => {
    groupSettingsCloseTimer = undefined;
    groupSettingsOpen = false;
    groupSettingsClosing = false;
    groupSettingsMode = 'create';
    saveUiSessionSnapshot({ captureDom: false });
    render();
  };
  if (renderTransition) {
    render();
    groupSettingsCloseTimer = window.setTimeout(finishClose, GROUP_SETTINGS_CLOSE_MS);
    return;
  }
  finishClose();
}

function installVisualViewportListener(): void {
  if (visualViewportListenerInstalled) return;
  visualViewportListenerInstalled = true;
  window.visualViewport?.addEventListener('resize', updateKeyboardOffset);
  window.visualViewport?.addEventListener('scroll', updateKeyboardOffset);
  window.addEventListener('resize', updateKeyboardOffset);
  updateKeyboardOffset();
}

function installPrivateIdentityMenuOutsideListener(): void {
  if (privateIdentityMenuOutsideListenerInstalled) return;
  privateIdentityMenuOutsideListenerInstalled = true;
  document.addEventListener('pointerdown', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('.private-chat-identity-select')) return;
    closePrivateIdentityMenus();
  }, true);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') closePrivateIdentityMenus();
  });
}

export function render(): void {
  clearPendingIdleRender();
  const inputSnapshot = captureMessageInputFocus();
  const groupInputSnapshot = captureGroupMessageInputFocus();
  const momentInputSnapshot = captureMomentInputFocus();
  const wasNearChatBottom = isChatScrollNearBottom();
  const preRenderScroll = captureScrollSnapshot();
  installStorageWarningListener();
  beginMessageArrivalTracking();
  if (isAuthoringOpen()) {
    appRoot.innerHTML = `${renderAuthoringScreen()}${renderAppDialog()}${renderStorageWarning()}`;
    bindAuthoringUi(render);
    bindAppDialog(() => renderWithUiTransition('overlay-out'));
    return;
  }
  ensureGroupChatForSpeaker();
  if (state.activeView === 'groups' && !isCompactViewport() && !activeGroupChat()) {
    desktopGroupChatOpen = false;
  }
  if (mobileGroupChatOpen && !activeGroupChat()) mobileGroupChatOpen = false;
  ensureCommunicationIdentityViewState();
  const character = activeCharacter();
  const onboardingLayer = welcomeCoverOpen
    ? renderWelcomeCover()
    : renderOnboardingLayer();
  const layoutMode = getViewportLayoutMode();
  const appShell = layoutMode === 'tabletLandscape'
    ? renderTabletLandscape(character)
    : layoutMode === 'mobile'
      ? renderMobile(character)
      : renderDesktop(character);
  appRoot.innerHTML = `${appShell}${renderGlobalStatus()}${renderStorageWarning()}${onboardingLayer}${renderCardRecognitionDialog()}${renderWorldBundleImportDialog()}${renderStickerImportDialog()}${renderAppDialog()}`;
  applyCharacterAccent(character);
  bindUi();
  bindAppDialog(() => renderWithUiTransition('overlay-out'));
  installVisualViewportListener();
  installUiSessionPersistence();
  const immediateForcedMessageFocus = focusPendingMessageComposer();
  const immediateForcedGroupFocus = focusPendingGroupComposer();
  const immediateChatScroll = settleChatScrollAfterRender(wasNearChatBottom, preRenderScroll);
  window.requestAnimationFrame(() => {
    const restoredInput = restoreMessageInputFocus(inputSnapshot);
    const restoredGroupInput = restoreGroupMessageInputFocus(groupInputSnapshot);
    const restoredMomentInput = restoreMomentInputFocus(momentInputSnapshot);
    resizeComposerTextarea();
    const forcedMessageFocus = immediateForcedMessageFocus || focusPendingMessageComposer();
    const forcedGroupFocus = immediateForcedGroupFocus || focusPendingGroupComposer();
    focusPendingMomentComment();
    const settledChatScroll = immediateChatScroll === 'none'
      ? settleChatScrollAfterRender(wasNearChatBottom, preRenderScroll)
      : immediateChatScroll;
    if (
      settledChatScroll === 'bottom'
      && (restoredInput || restoredGroupInput || forcedMessageFocus || forcedGroupFocus)
    ) {
      window.setTimeout(scrollMessagesToBottom, 80);
    }
    if (restoredMomentInput) window.setTimeout(keepMomentComposerVisible, 80);
    if (scrollCharacterPanelToTopAfterRender) {
      scrollCharacterPanelToTopAfterRender = false;
      document.querySelector<HTMLElement>('.character-panel')?.scrollTo({ top: 0, behavior: 'auto' });
    }
    restoreMobileListScrollIfNeeded();
    scheduleUiSessionSnapshotSave();
  });
  if (!mediaListenerInstalled) {
    compactMedia.addEventListener('change', () => render());
    tabletLandscapeMedia.addEventListener('change', () => render());
    mediaListenerInstalled = true;
  }
  if (!mobileHistoryInstalled) {
    window.history.replaceState({ ...(window.history.state ?? {}), tavernSocialRoot: true }, '');
    window.addEventListener('popstate', () => {
      if (closeMobileLayer()) {
        renderWithUiTransition('detail-out');
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
        renderWithUiTransition('detail-out');
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
    '.authoring-screen, .app-dialog, .sticker-import-dialog, .settings-dialog, .settings-content, .mobile-settings-content, .world-gear-panel, .world-persona-select, .event-composer-dialog, .message-edit-dialog, .event-manual-result, .timeline-note-form, .group-settings-panel, .character-panel',
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
  installPrivateIdentityMenuOutsideListener();
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
    if (localStorage.getItem(MOMENTS_TUTORIAL_KEY) !== 'done') {
      momentComposerOpen = false;
      resetMomentComposerKeyboardState();
      momentsTutorialOpen = true;
    }
  };
  const closeMomentsTutorial = () => {
    localStorage.setItem(MOMENTS_TUTORIAL_KEY, 'done');
    momentsTutorialOpen = false;
    renderWithUiTransition('overlay-out');
  };
  document.querySelector<HTMLButtonElement>('#open-moments-tutorial')?.addEventListener('click', () => {
    momentComposerOpen = false;
    resetMomentComposerKeyboardState();
    momentsTutorialOpen = true;
    renderWithUiTransition('overlay-in');
  });
  document.querySelectorAll<HTMLButtonElement>('[data-close-moments-tutorial]').forEach(button => {
    button.addEventListener('click', closeMomentsTutorial);
  });
  document.querySelector<HTMLButtonElement>('#open-moment-composer')?.addEventListener('click', () => {
    clearMomentComposerKeyboardTimers();
    momentComposerClosing = false;
    momentComposerDropClosing = false;
    momentComposerLayoutTransition = null;
    momentComposerOpening = true;
    momentGenerationStatus = '';
    momentsTutorialOpen = false;
    momentComposerOpen = true;
    renderWithUiTransition('overlay-in');
    momentComposerOpeningTimer = window.setTimeout(() => {
      momentComposerOpening = false;
      document.querySelector<HTMLElement>('#moment-composer')?.classList.remove('is-entering');
    }, 460);
    const momentInput = document.querySelector<HTMLTextAreaElement>('#moment-input');
    momentInput?.focus();
    if (document.activeElement === momentInput) setMomentComposerKeyboardFocus(true);
    window.setTimeout(keepMomentComposerVisible, 80);
  });
  const closeMomentComposer = () => {
    closeMomentComposerWithTransition(true, true);
  };
  document.querySelector<HTMLButtonElement>('#close-moment-composer')?.addEventListener('click', closeMomentComposer);
  document.querySelector<HTMLButtonElement>('#close-moment-composer-backdrop')?.addEventListener('click', closeMomentComposer);
  if (worldGearPanelOpen && isCompactViewport()) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.world-gear-panel, [data-open-world-gear]')) return;
      closeWorldGearPanel(true);
    }, { capture: true, once: true });
  }
  if (messageActionId) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.message-actions')) return;
      closeMessageActionMenuInPlace();
    }, { capture: true, once: true });
  }
  appRoot.querySelectorAll<HTMLButtonElement>('[data-load-earlier-messages]').forEach(button => {
    button.addEventListener('click', () => {
      const kind = button.dataset.loadEarlierMessages;
      if (!isMessageWindowKind(kind)) return;
      const container = button.closest<HTMLElement>('.messages, .group-messages');
      const containerSelector = container?.classList.contains('group-messages') ? '.group-messages' : '.messages';
      // 小注释：以底部为锚点保持位置，加载更早的消息后，用户正在看的那几条不会跳走。
      const distanceFromBottom = container ? container.scrollHeight - container.scrollTop : 0;
      messageWindows[kind].size += MESSAGE_RENDER_WINDOW;
      render();
      const nextContainer = document.querySelector<HTMLElement>(containerSelector);
      if (nextContainer && container) nextContainer.scrollTop = Math.max(0, nextContainer.scrollHeight - distanceFromBottom);
    });
  });
  // 小注释：气泡高度完全交给 CSS 自然撑开（见 styles.css 末尾）。以前逐条量高度再写回，消息越多越卡，还会裁掉原因、记忆提示等小字。
  bindDraftManager(render);
  document.querySelector<HTMLButtonElement>('#enter-welcome-cover')?.addEventListener('click', () => {
    markWelcomeCoverSeen();
    welcomeCoverOpen = false;
    render();
  });
  document.querySelector<HTMLButtonElement>('#dismiss-first-run-guide')?.addEventListener('click', () => {
    markFirstRunGuideDismissed();
    saveUiSessionSnapshot({ captureDom: false });
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
      streamReplies: streamRepliesFieldValue(config.streamReplies),
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
    if (character) void generateOpeningMessage(character, render, privateConversationActorId(character));
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
    pendingCardImportFollowup = null;
    setStatusText('已取消这次角色卡导入。');
    renderWithUiTransition('overlay-out');
  };
  document.querySelector<HTMLButtonElement>('#cancel-card-recognition')?.addEventListener('click', closeCardRecognition);
  const closeWorldBundleImport = () => {
    pendingWorldBundleImport = null;
    setStatusText('已取消这次完整世界包导入。');
    renderWithUiTransition('overlay-out');
  };
  document.querySelector<HTMLButtonElement>('#cancel-world-bundle-import')?.addEventListener('click', closeWorldBundleImport);
  document.querySelector<HTMLButtonElement>('#cancel-world-bundle-import-button')?.addEventListener('click', closeWorldBundleImport);
  document.querySelector<HTMLButtonElement>('#import-world-bundle-selected')?.addEventListener('click', () => {
    const pending = pendingWorldBundleImport;
    if (!pending) return;
    const checkedSections = new Set(Array.from(
      document.querySelectorAll<HTMLInputElement>('input[name="world-bundle-section"]:checked'),
    ).map(input => input.value));
    const selection: WorldBundleImportSelection = {
      world: true,
      characters: checkedSections.has('characters'),
      relationships: checkedSections.has('relationships'),
      chats: checkedSections.has('chats'),
      moments: checkedSections.has('moments'),
      events: checkedSections.has('events'),
      timeline: checkedSections.has('timeline'),
      summaries: checkedSections.has('summaries'),
      drafts: checkedSections.has('drafts'),
    };
    try {
      const result = importWorldBundlePreview(pending, selection);
      pendingWorldBundleImport = null;
      setStatusText(`已导入完整世界包：${result.worldName}。`);
      render();
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
      render();
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-card-import-action]').forEach(button => {
    button.addEventListener('click', () => {
      const action = button.dataset.cardImportAction ?? '';
      if (!isCardImportFollowupAction(action)) return;
      pendingCardImportFollowup = action;
      setStatusText(`导入完成后会打开${cardImportFollowupLabel(action)}。`);
      render();
    });
  });
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
    renderWithUiTransition('overlay-out');
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
    renderWithUiTransition('overlay-out');
  });
  const openSettings = () => {
    closeTransientOverlaysForPageChange();
    momentGenerationStatus = '';
    const fromSection = mobileSection;
    if (isCompactViewport()) {
      mobileSection = 'settings';
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      desktopGroupChatOpen = false;
      resetGroupSettingsState();
      mobileSettingsDetail = false;
      pushMobileHistory('section');
    } else {
      settingsOpen = true;
    }
    renderWithUiTransition(isCompactViewport() ? mainSectionTransition(fromSection, 'settings') : 'detail-in');
  };
  document.querySelector<HTMLButtonElement>('#open-settings')?.addEventListener('click', openSettings);
  document.querySelector<HTMLButtonElement>('#open-settings-bottom')?.addEventListener('click', openSettings);
  const openCharacterPanel = (page: CharacterPanelPage = 'worldbook') => {
    if (!activeCharacter()) return;
    characterPanelOpen = true;
    characterPanelPage = page;
    scrollCharacterPanelToTopAfterRender = true;
    renderWithUiTransition('detail-in');
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
  document.querySelectorAll<HTMLButtonElement>('[data-open-context-preview]').forEach(button => {
    button.addEventListener('click', () => {
      const characterId = button.dataset.openContextPreview ?? '';
      contextPreviewCharacterId = contextPreviewCharacterId === characterId ? '' : characterId;
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('[data-close-context-preview]')?.addEventListener('click', () => {
    contextPreviewCharacterId = '';
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-context-preview-remove-timeline]').forEach(button => {
    button.addEventListener('click', () => {
      const entryId = button.dataset.contextPreviewRemoveTimeline ?? '';
      const entry = state.timelineEntries.find(item => item.id === entryId && item.worldId === activeWorld().id);
      const character = contextPreviewCharacterId
        ? state.characters.find(item => item.id === contextPreviewCharacterId && item.worldId === activeWorld().id)
        : undefined;
      if (!entry || entry.revokedAt) return;
      entry.includeInContext = false;
      saveState();
      if (character) contextPreviewCharacterId = character.id;
      setStatusText('这条世界记录已保留在时间线，但不会再进入近期上下文。');
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-context-preview-remove-summary]').forEach(button => {
    button.addEventListener('click', () => {
      const summaryId = button.dataset.contextPreviewRemoveSummary ?? '';
      const summary = state.memorySummaries.find(item => item.id === summaryId && item.worldId === activeWorld().id);
      if (!summary) return;
      updateMemorySummary(summary.id, { includeInContext: false });
      setStatusText('这条总结已保留在记忆抽屉，但不会再进入近期上下文。');
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
        scrollCharacterPanelToTopAfterRender = true;
        closeMessageProfilePopover();
      }
      renderWithUiTransition('detail-in');
    });
  });
  const closeCharacterPanel = () => {
    characterPanelOpen = false;
    renderWithUiTransition('detail-out');
  };
  document.querySelector<HTMLButtonElement>('#close-character-panel')?.addEventListener('click', closeCharacterPanel);
  document.querySelector<HTMLButtonElement>('#close-character-panel-backdrop')?.addEventListener('click', closeCharacterPanel);
  document.querySelectorAll<HTMLButtonElement>('[data-character-panel-page]').forEach(button => {
    button.addEventListener('click', () => {
      const nextPage = button.dataset.characterPanelPage;
      preserveScrollForNextRender();
      characterPanelPage = nextPage === 'status' || nextPage === 'worldbook-editor' ? nextPage : 'worldbook';
      renderWithUiTransition('detail-in');
    });
  });
  document.querySelector<HTMLButtonElement>('#jump-character-worldbook')?.addEventListener('click', () => {
    characterPanelPage = 'worldbook-editor';
    scrollCharacterPanelToTopAfterRender = true;
    renderWithUiTransition('detail-in');
  });
  document.querySelector<HTMLButtonElement>('#back-character-settings')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (character) {
      // 大注释：世界书是独立编辑页，返回时也先吸收当前表单草稿，避免页面切回设置时丢掉刚写的条目内容。
      setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());
      saveState();
    }
    characterPanelPage = 'worldbook';
    scrollCharacterPanelToTopAfterRender = true;
    renderWithUiTransition('detail-out');
  });
  document.querySelector<HTMLButtonElement>('#save-character-worldbook')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());
    saveState();
    setStatusText(`${character.name} 的角色世界书已保存。`);
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#regenerate-character-panel-reply-strategy')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    // 大注释：角色页内生成回复策略时只填当前角色的私信设置，不会碰其它角色的回复策略。
    void regenerateReplyStrategyForCharacter(character, '#character-panel-reply-strategy');
  });
  document.querySelector<HTMLButtonElement>('#add-character-worldbook-entry')?.addEventListener('click', () => {
    const character = activeCharacter();
    if (!character) return;
    setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());
    appendCharacterWorldBookEntry(character);
    saveState();
    setStatusText(`已为 ${character.name} 新增世界书条目。`);
    preserveScrollForNextRender();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-character-worldbook-entry]').forEach(button => {
    button.addEventListener('click', () => {
      const character = activeCharacter();
      const entryId = button.dataset.deleteCharacterWorldbookEntry;
      if (!character || !entryId) return;
      setCharacterWorldBookEntryDrafts(character, readCharacterWorldBookEntryDraftsFromPanel());
      deleteCharacterWorldBookEntry(character, entryId);
      saveState();
      setStatusText(`已删除 ${character.name} 的这个世界书条目。`);
      preserveScrollForNextRender();
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
    character.replyStrategy = fieldValue<HTMLTextAreaElement>('#character-panel-reply-strategy');
    character.relationship.affinity = Math.max(0, Math.round(finiteNumber(fieldValue('#character-affinity-free'), character.relationship.affinity)));
    character.relationship.updatedAt = Date.now();
    updateCharacterCardDetails(character, {
      name: fieldValue('#character-panel-name'),
      // Big comment: the private settings panel no longer exposes the main settings worldbook textarea, so saving the panel preserves the existing main settings entry.
      settings: characterSettingsText(character),
    });
    saveState();
    state.activeCharacterId = character.id;
    setStatusText(`${character.name} 的背景故事备注和好感度已保存。`);
    render();
  });
  document.querySelector<HTMLInputElement>('#character-panel-avatar-import')?.addEventListener('change', event => {
    void handleCharacterAvatarInput(event.currentTarget as HTMLInputElement);
  });
  document.querySelector<HTMLInputElement>('#private-chat-background-import')?.addEventListener('change', event => {
    const input = event.currentTarget as HTMLInputElement;
    void (async () => {
      const character = activeCharacter();
      if (!character) return;
      const image = normalizeChatBackgroundImage(await readImageInputAsDataUrl(input));
      if (!image) {
        setStatusText('请选择 PNG、JPG 或 WebP 图片作为私聊背景。');
        render();
        return;
      }
      const conversation = ensureConversation(character, privateConversationActorId(character));
      const previousImage = conversation.backgroundImage;
      const previousUpdatedAt = conversation.updatedAt;
      conversation.backgroundImage = image;
      conversation.updatedAt = Date.now();
      if (!saveState()) {
        // 小注释：存不下就撤回，避免界面显示已更换、重启后却丢失，也避免大图一直占着内存导致后续保存全部失败。
        conversation.backgroundImage = previousImage;
        conversation.updatedAt = previousUpdatedAt;
        saveState();
        setStatusText(STORAGE_FULL_IMAGE_MESSAGE);
        render();
        return;
      }
      preserveScrollForNextRender();
      setStatusText(`${character.name} 的私聊背景已更新。`);
      render();
    })().catch(error => {
      setStatusText(error instanceof Error ? error.message : String(error));
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#clear-private-chat-background')?.addEventListener('click', () => {
    const character = activeCharacter();
    const conversation = character ? conversationFor(character.id, privateConversationActorId(character)) : undefined;
    if (!character || !conversation) return;
    conversation.backgroundImage = undefined;
    conversation.updatedAt = Date.now();
    saveState();
    preserveScrollForNextRender();
    setStatusText(`${character.name} 的私聊背景已恢复默认。`);
    render();
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
      preserveScrollForNextRender();
      if (section) activeSettingsSection = section;
      if (isCompactViewport()) {
        mobileSettingsDetail = true;
        pushMobileHistory('settings-detail');
      }
      renderWithUiTransition('detail-in');
    });
  });
  document.querySelector<HTMLButtonElement>('[data-settings-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-mobile-section]').forEach(button => {
    button.addEventListener('pointerdown', () => {
      const nextSection = button.dataset.mobileSection;
      if (!isMobileSection(nextSection)) return;
      clearBottomNavMotionTimers();
      clearBottomNavMotionClasses();
      bottomNavPressedSection = nextSection;
      bottomNavLiftSection = '';
      button.classList.add('is-pressing');
    });
    button.addEventListener('pointercancel', () => {
      button.classList.remove('is-pressing');
      clearBottomNavMotion();
    });
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      const nextSection = button.dataset.mobileSection;
      const fromSection = visibleMobileSection();
      const nextMobileSection = isMobileSection(nextSection) ? nextSection : 'messages';
      const transitionKind = mainSectionTransition(fromSection, nextMobileSection);
      clearBottomNavMotionTimers();
      bottomNavPressedSection = nextMobileSection;
      bottomNavLiftSection = '';
      button.classList.add('is-pressing');
      bottomNavPressTimer = window.setTimeout(() => {
        bottomNavPressTimer = undefined;
        clearMobileListScrollRestore();
        closeTransientOverlaysForPageChange();
        document.querySelectorAll<HTMLButtonElement>('.bottom-nav button[data-mobile-section]').forEach(navButton => {
          const isTarget = navButton.dataset.mobileSection === nextMobileSection;
          navButton.classList.toggle('is-active', isTarget);
          navButton.classList.remove('is-lifting');
          if (!isTarget) navButton.classList.remove('is-pressing');
        });
        mobileSection = nextMobileSection;
        setActiveView(
          mobileSection === 'moments' ? 'moments'
            : mobileSection === 'world' ? 'world'
              : 'chat',
        );
        if (mobileSection === 'world') {
          activeWorldRpEventId = '';
          worldRpMessageEditId = '';
          worldRpMessageActionId = '';
        }
        if (mobileSection === 'moments') openMomentsTutorialIfNeeded();
        if (mobileSection !== 'moments') {
          momentComposerOpen = false;
          momentGenerationStatus = '';
          resetMomentComposerKeyboardState();
        }
        mobileChatOpen = false;
        mobileGroupChatOpen = false;
        desktopGroupChatOpen = false;
        resetGroupSettingsState();
        mobileSettingsDetail = false;
        if (mobileSection !== 'messages') pushMobileHistory('section');
        saveUiSessionSnapshot();
        renderWithUiTransition(transitionKind, () => startBottomNavLiftMotion(nextMobileSection));
      }, BOTTOM_NAV_PRESS_MS);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-timeline]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      const fromSection = mobileSection;
      const fromView = state.activeView;
      setActiveView('world');
      mobileSection = 'world';
      activeWorldRpEventId = '';
      worldRpMessageEditId = '';
      worldRpMessageActionId = '';
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      resetGroupSettingsState();
      mobileSettingsDetail = false;
      momentComposerOpen = false;
      momentGenerationStatus = '';
      resetMomentComposerKeyboardState();
      if (isCompactViewport()) pushMobileHistory('section');
      saveUiSessionSnapshot();
      renderWithUiTransition(isCompactViewport() ? mainSectionTransition(fromSection, 'world') : desktopViewTransition(fromView, 'world'));
    });
  });
  document.querySelector<HTMLButtonElement>('[data-mobile-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-model-settings]').forEach(button => {
    button.addEventListener('click', () => {
      activeSettingsSection = 'model';
      if (isCompactViewport()) {
        mobileSection = 'settings';
        mobileSettingsDetail = true;
        pushMobileHistory('settings-detail');
      } else {
        settingsOpen = true;
      }
      renderWithUiTransition('detail-in');
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
      closeMomentComposerWithTransition(true, true);
      return;
    }
    if (event.key === 'Escape' && groupSettingsOpen) {
      closeGroupSettingsPanel(true);
      return;
    }
    if (event.key === 'Escape' && settingsOpen) {
      settingsOpen = false;
      renderWithUiTransition('detail-out');
    }
  };
  document.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      const fromView = state.activeView;
      const listMode = button.dataset.desktopList;
      const leavingPage = settingsOpen || characterPanelOpen;
      let nextView: typeof state.activeView = button.dataset.view === 'moments'
        ? 'moments'
        : button.dataset.view === 'groups'
          ? 'groups'
        : button.dataset.view === 'world'
          ? 'world'
          : 'chat';
      // 小注释：导航栏里的“消息”在群聊中再点一次时留在当前群聊，不跳回私聊。
      if (listMode === 'messages' && fromView === 'groups' && desktopGroupChatOpen) nextView = 'groups';
      if (listMode === 'messages' || listMode === 'contacts') desktopListMode = listMode;
      if (leavingPage) closeTransientOverlaysForPageChange();
      setActiveView(nextView);
      if (nextView === 'world') {
        activeWorldRpEventId = '';
        worldRpMessageEditId = '';
        worldRpMessageActionId = '';
      }
      if (button.dataset.view === 'groups') desktopGroupChatOpen = false;
      if (nextView === 'moments') openMomentsTutorialIfNeeded();
      if (nextView !== 'moments') {
        momentComposerOpen = false;
        momentGenerationStatus = '';
        resetMomentComposerKeyboardState();
      }
      if (nextView !== 'groups') {
        desktopGroupChatOpen = false;
        mobileGroupChatOpen = false;
        resetGroupSettingsState();
      }
      saveUiSessionSnapshot();
      renderWithUiTransition(leavingPage ? 'detail-out' : desktopViewTransition(fromView, nextView));
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-groups]').forEach(button => {
    button.addEventListener('click', () => {
      captureVisibleDraftsFromDom();
      clearMobileListScrollRestore();
      resetMobileGroupListClosing();
      const fromView = state.activeView;
      setActiveView('groups');
      desktopGroupChatOpen = false;
      resetGroupSettingsState();
      if (isCompactViewport()) {
        mobileSection = 'groups';
        mobileChatOpen = false;
        mobileGroupChatOpen = false;
        mobileSettingsDetail = false;
        prepareActionExpandFromElement(button);
      }
      saveUiSessionSnapshot();
      renderWithUiTransition(isCompactViewport() ? 'detail-in' : desktopViewTransition(fromView, 'groups'));
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-group-create]').forEach(button => {
    button.addEventListener('click', () => {
      resetGroupSettingsClosing();
      groupSettingsMode = 'create';
      groupSettingsOpen = true;
      groupSettingsOpening = true;
      mobileSettingsDetail = false;
      if (isCompactViewport()) pushMobileHistory('modal');
      saveUiSessionSnapshot();
      renderWithUiTransition('overlay-in');
      window.requestAnimationFrame(() => {
        document.querySelector<HTMLElement>('.group-settings-panel[data-group-settings-mode="create"]')?.classList.add('is-entering');
      });
      clearGroupSettingsOpeningSoon();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('#open-group-settings, [data-open-group-settings]').forEach(button => {
    button.addEventListener('click', () => {
      resetGroupSettingsClosing();
      groupSettingsMode = 'edit';
      groupSettingsOpen = true;
      resetGroupSettingsOpening();
      mobileSettingsDetail = false;
      if (isCompactViewport()) pushMobileHistory('modal');
      saveUiSessionSnapshot();
      renderWithUiTransition('overlay-in');
    });
  });
  document.querySelector<HTMLButtonElement>('#close-group-settings')?.addEventListener('click', () => {
    closeGroupSettingsPanel(true);
  });
  document.querySelector<HTMLButtonElement>('#close-group-settings-backdrop')?.addEventListener('click', () => {
    closeGroupSettingsPanel(true);
  });
  document.querySelector<HTMLButtonElement>('#cancel-group-settings')?.addEventListener('click', () => {
    closeGroupSettingsPanel(true);
  });
  document.querySelector<HTMLButtonElement>('[data-mobile-group-back]')?.addEventListener('click', () => {
    backMobileLayer();
  });
  document.querySelector<HTMLButtonElement>('[data-group-list-back]')?.addEventListener('click', () => {
    captureVisibleDraftsFromDom();
    desktopGroupChatOpen = false;
    resetGroupSettingsState();
    saveUiSessionSnapshot();
    renderWithUiTransition('detail-out');
  });
  document.querySelector<HTMLButtonElement>('[data-mobile-group-list-back]')?.addEventListener('click', () => {
    closeMobileGroupListWithTransition();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-group-chat-id]').forEach(button => {
    button.addEventListener('click', () => {
      const groupChatId = button.dataset.groupChatId ?? '';
      if (!groupChatId) return;
      prepareChatRevealFromElement(button);
      captureVisibleDraftsFromDom();
      state.activeGroupChatId = groupChatId;
      ensureGroupChatForSpeaker();
      setActiveView('groups');
      desktopGroupChatOpen = true;
      resetGroupSettingsState();
      if (isCompactViewport()) {
        mobileChatOpen = false;
        mobileGroupChatOpen = true;
        pushMobileHistory('chat');
      }
      requestConversationOpenAtBottom();
      saveState();
      saveUiSessionSnapshot();
      renderWithUiTransition('detail-in');
    });
  });
  document.querySelector<HTMLButtonElement>('#create-group-chat')?.addEventListener('click', () => {
    const participantIds = Array.from(document.querySelectorAll<HTMLInputElement>('[data-group-participant]:checked'))
      .map(input => input.value)
      .filter(Boolean);
    const group = createGroupChat(fieldValue('#group-title-input') || undefined, participantIds);
    state.activeGroupChatId = group.id;
    ensureGroupChatForSpeaker();
    saveState();
    setActiveView('groups');
    desktopGroupChatOpen = false;
    if (isCompactViewport()) {
      mobileSection = 'groups';
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
    }
    resetGroupSettingsState();
    setVisibleStatus(`已创建群聊：${group.title}`);
    renderWithUiTransition('overlay-out');
  });
  document.querySelector<HTMLInputElement>('#group-chat-background-import')?.addEventListener('change', event => {
    const input = event.currentTarget as HTMLInputElement;
    void (async () => {
      const chat = activeGroupChat();
      if (!chat) return;
      const image = normalizeChatBackgroundImage(await readImageInputAsDataUrl(input));
      if (!image) {
        setStatusText('请选择 PNG、JPG 或 WebP 图片作为群聊背景。');
        render();
        return;
      }
      const previousImage = chat.backgroundImage ?? '';
      updateGroupChat(chat.id, { backgroundImage: image });
      if (isStorageSaveFailing()) {
        updateGroupChat(chat.id, { backgroundImage: previousImage });
        setStatusText(STORAGE_FULL_IMAGE_MESSAGE);
        render();
        return;
      }
      preserveScrollForNextRender();
      setStatusText(`${chat.title} 的群聊背景已更新。`);
      render();
    })().catch(error => {
      setStatusText(error instanceof Error ? error.message : String(error));
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#clear-group-chat-background')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat) return;
    updateGroupChat(chat.id, { backgroundImage: '' });
    preserveScrollForNextRender();
    setStatusText(`${chat.title} 的群聊背景已恢复默认。`);
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
        replyLiveliness: groupReplyLivelinessValue(fieldValue('#group-reply-liveliness')),
        replyAllOnUserMessage: checked('#group-reply-all-on-user-message'),
        allowModelInitiatedMessages: checked('#group-allow-model-initiated-messages'),
      })
      : createGroupChat(fieldValue('#group-title-input') || undefined, participantIds);
    if (saved) {
      state.activeGroupChatId = saved.id;
      ensureGroupChatForSpeaker();
      setActiveView('groups');
      desktopGroupChatOpen = Boolean(editingChat);
      if (isCompactViewport()) {
        mobileSection = 'groups';
        mobileChatOpen = false;
        mobileGroupChatOpen = Boolean(editingChat);
      }
      resetGroupSettingsState();
      saveState();
      saveUiSessionSnapshot();
      setVisibleStatus(`${editingChat ? '群聊已保存' : '已创建群聊'}：${saved.title}`);
    }
    renderWithUiTransition(editingChat ? 'overlay-out' : 'detail-in');
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
    openConfirmDialog({
      title: '清空群聊记录',
      message: `确定清空“${chat.title}”的 ${messageCount} 条聊天记录吗？群聊和成员会保留。`,
      confirmLabel: '清空记录',
      cancelLabel: '保留',
      tone: 'danger',
      onConfirm: () => {
        const result = clearGroupMessages(chat.id);
        saveUiSessionSnapshot();
        setVisibleStatus(result.ok
          ? `已清空“${chat.title}”的聊天记录。`
          : result.reason ?? '清空聊天记录失败。');
      },
    });
  });
  document.querySelector<HTMLButtonElement>('#delete-group-chat')?.addEventListener('click', () => {
    const chat = activeGroupChat();
    if (!chat || isGroupGenerating()) return;
    const title = chat.title;
    const messageCount = groupMessagesFor(chat.id).length;
    const detail = messageCount > 0
      ? `会删除 ${messageCount} 条聊天记录，并让这些记录不再进入后续 AI 上下文。`
      : '这个群还没有聊天记录。';
    openConfirmDialog({
      title: '解散群聊',
      message: `确定解散“${title}”吗？${detail}角色卡不会被删除。`,
      confirmLabel: '解散群聊',
      cancelLabel: '保留',
      tone: 'danger',
      onConfirm: () => {
        const result = deleteGroupChat(chat.id);
        setGroupMessageDraft(chat, '');
        if (result.ok) {
          setActiveView('groups');
          desktopGroupChatOpen = false;
          resetGroupSettingsState();
          if (isCompactViewport()) {
            mobileSection = 'groups';
            mobileChatOpen = false;
            mobileGroupChatOpen = false;
          }
          saveUiSessionSnapshot({ captureDom: false });
        }
        setVisibleStatus(result.ok ? `已解散群聊：${title}` : result.reason ?? '解散群聊失败。');
      },
    });
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
      captureVisibleDraftsFromDom();
      clearMobileListScrollRestore();
      preserveScrollForNextRender();
      saveUiSessionSnapshot();
      setActiveWorld((event.currentTarget as HTMLSelectElement).value);
      desktopGroupChatOpen = false;
      mobileChatOpen = false;
      mobileGroupChatOpen = false;
      resetGroupSettingsState();
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
    const applyContactSearch = (target: HTMLInputElement) => {
      const preferGroupSearch = Boolean(target.closest('.group-list-page'));
      contactQuery = target.value;
      clearMobileListScrollRestore();
      preserveScrollForNextRender();
      render();
      const inputs = Array.from(document.querySelectorAll<HTMLInputElement>('#contact-search'));
      const input = inputs.find(item => Boolean(item.closest('.group-list-page')) === preferGroupSearch) ?? inputs[0];
      input?.focus();
      input?.setSelectionRange(contactQuery.length, contactQuery.length);
    };
    // 小注释：拼音等输入法组字期间不能重画，否则输入框被整个替换，组字被打断，会残留拼音字母（比如打“叶”变成“yye叶”）。
    searchInput.addEventListener('input', event => {
      const target = event.currentTarget as HTMLInputElement;
      contactQuery = target.value;
      if (isImeComposing(event)) return;
      applyContactSearch(target);
    });
    searchInput.addEventListener('compositionend', event => {
      applyContactSearch(event.currentTarget as HTMLInputElement);
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
      setVisibleStatus(`正在读取文件：${file.name || '未命名文件'}…`);
      try {
        try {
          const preview = previewWorldBundleText(await file.text());
          pendingCardRecognition = null;
          pendingCardImportFollowup = null;
          pendingWorldBundleImport = preview;
          setVisibleStatus(`检测到完整世界包：${preview.worldName}，请选择导入部分。`);
          render();
          return;
        } catch {
          // 不是 PalTavern 世界包时继续走单张角色卡导入。
        }
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
    saveUiSessionSnapshot({ captureDom: false });
    render();
  });
  document.querySelector<HTMLSelectElement>('#relationship-pair-b-select')?.addEventListener('change', event => {
    relationshipPairBCharacterId = (event.currentTarget as HTMLSelectElement).value;
    if (relationshipPairACharacterId === relationshipPairBCharacterId) {
      relationshipPairACharacterId = state.characters.find(character =>
        character.worldId === activeWorld().id && character.id !== relationshipPairBCharacterId,
      )?.id ?? '';
    }
    saveUiSessionSnapshot({ captureDom: false });
    render();
  });
  document.querySelector<HTMLSelectElement>('#proactive-character-select')?.addEventListener('change', event => {
    proactiveManagerCharacterId = (event.currentTarget as HTMLSelectElement).value;
    render();
  });
  document.querySelector<HTMLSelectElement>('#reply-strategy-character-select')?.addEventListener('change', event => {
    replyStrategyManagerCharacterId = (event.currentTarget as HTMLSelectElement).value;
    preserveScrollForNextRender();
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
      prepareChatRevealFromElement(button);
      openPrivateChatByCharacterId(button.dataset.characterId ?? '');
    });
  });
  document.querySelector<HTMLButtonElement>('#save-world')?.addEventListener('click', () => {
    const world = activeWorld();
    world.name = fieldValue('#world-name') || world.name;
    world.description = fieldValue('#world-description');
    world.worldLore = fieldValue('#world-lore');
    world.currentLocation = fieldValue('#world-current-location') || world.currentLocation;
    world.sceneAtmosphere = fieldValue('#world-scene-atmosphere') || world.sceneAtmosphere;
    world.sceneSummary = fieldValue('#world-scene-summary');
    world.updatedAt = Date.now();
    saveState();
    setStatusText('世界设置已保存。');
    render();
  });
  const toggleWorldGearPanel = (trigger: HTMLElement): void => {
    document.querySelectorAll('.pt-action-expand-layer').forEach(element => element.remove());
    const nextOpen = !(worldGearPanelOpen || worldGearPanelClosing);
    if (!nextOpen) {
      closeWorldGearPanel(true);
      return;
    }
    prepareActionExpandFromElement(trigger);
    window.clearTimeout(worldGearPanelCloseTimer);
    worldGearPanelCloseTimer = undefined;
    worldGearPanelClosing = false;
    worldGearPanelOpen = true;
    saveUiSessionSnapshot({ captureDom: false });
    renderWithUiTransition('overlay-in');
  };
  appRoot.querySelectorAll<HTMLElement>('[data-open-world-gear]').forEach(trigger => {
    trigger.addEventListener('click', event => {
      if (!isCompactViewport()) {
        window.setTimeout(() => {
          worldGearPanelOpen = Boolean(trigger.closest<HTMLDetailsElement>('.world-gear-panel')?.open);
          saveUiSessionSnapshot({ captureDom: false });
        }, 0);
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      toggleWorldGearPanel(trigger);
    });
  });
  appRoot.querySelector<HTMLDetailsElement>('.world-gear-panel')?.addEventListener('toggle', event => {
    const details = event.currentTarget as HTMLDetailsElement;
    if (!isCompactViewport()) {
      worldGearPanelOpen = details.open;
      saveUiSessionSnapshot({ captureDom: false });
      return;
    }
    if (!details.open && worldGearPanelOpen && !worldGearPanelClosing) {
      details.open = true;
      closeWorldGearPanel(true);
    }
  });
  document.querySelector<HTMLButtonElement>('[data-save-world-workbench]')?.addEventListener('click', () => {
    const world = activeWorld();
    world.name = fieldValue('#workbench-world-name') || world.name;
    world.description = fieldValue('#workbench-world-description');
    world.worldLore = fieldValue('#workbench-world-lore');
    world.currentLocation = fieldValue('#workbench-world-current-location') || world.currentLocation;
    world.sceneAtmosphere = fieldValue('#workbench-world-scene-atmosphere') || world.sceneAtmosphere;
    world.sceneSummary = fieldValue('#workbench-world-scene-summary');
    world.updatedAt = Date.now();
    saveState();
    setStatusText('世界工作台设置已保存。');
    closeWorldGearPanel(true);
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
    openConfirmDialog({
      title: '删除世界',
      message: `确定删除世界“${world.name}”及其中全部数据吗？`,
      confirmLabel: '删除世界',
      cancelLabel: '保留',
      tone: 'danger',
      onConfirm: () => {
        const result = deleteWorld(world.id);
        setStatusText(result.ok ? `已删除世界：${world.name}` : result.reason ?? '删除失败。');
      },
    });
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
      // Big comment: the settings center now only edits the card name; the main settings worldbook body stays in the dedicated character worldbook editor.
      settings: characterSettingsText(character),
    });
    state.activeCharacterId = character.id;
    saveState();
    setStatusText(`${character.name} 的卡名已保存。`);
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-character')?.addEventListener('click', deleteActiveCharacterFromUi);
  document.querySelector<HTMLButtonElement>('#delete-character-panel')?.addEventListener('click', deleteActiveCharacterFromUi);
  document.querySelector<HTMLButtonElement>('#save-model')?.addEventListener('click', () => {
    const provider = modelProviderValue(document.querySelector<HTMLSelectElement>('#model-provider')?.value);
    state.modelConfig = {
      provider,
      apiUrl: apiUrlForProvider(provider, fieldValue('#api-url')),
      apiKey: fieldValue('#api-key'),
      model: fieldValue('#model-name'),
      temperature: Number(fieldValue('#temperature') || '0.75'),
      dailyRequestLimit: Math.max(1, Math.floor(Number(fieldValue('#daily-request-limit') || '100'))),
      streamReplies: streamRepliesFieldValue(state.modelConfig.streamReplies),
    };
    modelFormDraft = null;
    saveState();
    setStatusText('模型设置已保存。');
    render();
    const character = activeCharacter();
    if (character) void generateOpeningMessage(character, render, privateConversationActorId(character));
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
      streamReplies: streamRepliesFieldValue(state.modelConfig.streamReplies),
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
      streamReplies: streamRepliesFieldValue(state.modelConfig.streamReplies),
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
    const restorePreset = () => {
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
      setStatusText('已写入 PalTavern 默认回复策略预设，可以在下方直接编辑“回复策略”。');
    };
    if (existingIndex >= 0) {
      openConfirmDialog({
        title: '覆盖默认回复策略预设',
        message: '这会用 PalTavern 默认内容覆盖当前默认回复策略预设。',
        confirmLabel: '覆盖预设',
        cancelLabel: '取消',
        onConfirm: restorePreset,
      });
      return;
    }
    restorePreset();
    render();
  });
  document.querySelector<HTMLButtonElement>('#restore-tavern-social-group-prompt-preset')?.addEventListener('click', () => {
    const existingIndex = state.promptPresets.findIndex(item => item.id === TAVERN_SOCIAL_DEFAULT_GROUP_PROMPT_PRESET_ID);
    const restorePreset = () => {
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
      setStatusText('已写入 PalTavern 默认群聊策略预设，可以在下方直接编辑群聊规则。');
    };
    if (existingIndex >= 0) {
      openConfirmDialog({
        title: '覆盖默认群聊策略预设',
        message: '这会用 PalTavern 默认内容覆盖当前默认群聊策略预设。',
        confirmLabel: '覆盖预设',
        cancelLabel: '取消',
        onConfirm: restorePreset,
      });
      return;
    }
    restorePreset();
    render();
  });
  document.querySelector<HTMLButtonElement>('#restore-tavern-social-world-prompt-preset')?.addEventListener('click', () => {
    const existingIndex = state.promptPresets.findIndex(item => item.id === TAVERN_SOCIAL_DEFAULT_WORLD_PROMPT_PRESET_ID);
    const restorePreset = () => {
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
      setStatusText('已写入 PalTavern 默认世界 RP 预设，可以在下方直接编辑世界舞台规则。');
    };
    if (existingIndex >= 0) {
      openConfirmDialog({
        title: '覆盖默认世界 RP 预设',
        message: '这会用 PalTavern 默认内容覆盖当前默认世界 RP 预设。',
        confirmLabel: '覆盖预设',
        cancelLabel: '取消',
        onConfirm: restorePreset,
      });
      return;
    }
    restorePreset();
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
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#reset-prompt-preset')?.addEventListener('click', () => {
    const preset = activePromptPreset();
    if (!preset) return;
    resetPromptPresetDefaults(preset);
    saveState();
    setStatusText('已恢复当前预设的默认开关。');
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#delete-prompt-preset')?.addEventListener('click', () => {
    const preset = activePromptPreset();
    if (!preset) return;
    openConfirmDialog({
      title: '删除提示词预设',
      message: `确定删除提示词预设“${preset.name}”吗？`,
      confirmLabel: '删除预设',
      cancelLabel: '保留',
      tone: 'danger',
      onConfirm: () => {
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
        preserveScrollForNextRender();
      },
    });
  });
  document.querySelector<HTMLButtonElement>('#save-character-reply-strategy')?.addEventListener('click', () => {
    const character = replyStrategyManagerCharacter();
    if (!character) return;
    character.replyStrategy = fieldValue<HTMLTextAreaElement>('#character-reply-strategy');
    saveState();
    setStatusText(`${character.name} 的回复策略已保存，不影响其他角色。`);
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#regenerate-character-reply-strategy')?.addEventListener('click', () => {
    const character = replyStrategyManagerCharacter();
    if (!character) return;
    void regenerateReplyStrategyForCharacter(character, '#character-reply-strategy');
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
    state.chatFontScale = normalizeChatFontScale(Number(fieldValue<HTMLInputElement>('#chat-font-scale') || state.chatFontScale));
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
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLInputElement>('#chat-font-scale')?.addEventListener('input', event => {
    const input = event.currentTarget as HTMLInputElement;
    const preview = document.querySelector<HTMLElement>('.chat-font-preview');
    const label = preview?.querySelector<HTMLElement>('strong');
    const normalized = normalizeChatFontScale(Number(input.value));
    if (preview) preview.style.setProperty('--chat-font-scale', String(normalized));
    if (label) label.textContent = fontScaleLabel(normalized);
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
    preserveScrollForNextRender();
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
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#save-world-interactions')?.addEventListener('click', () => {
    state.worldInteractionHighSimulation = checked('#world-interaction-high-simulation');
    scheduleNextBackgroundInteraction();
    saveState();
    setStatusText(state.worldInteractionHighSimulation
      ? '热闹世界已开启，角色之间会更频繁地产生自然互动。'
      : '角色互动已切回克制自然。');
    preserveScrollForNextRender();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-apply-relationship-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const result = applyCharacterRelationshipSuggestion(button.dataset.applyRelationshipSuggestion ?? '');
      setStatusText(result.ok ? '关系阶段建议已应用，可在时间线里撤销。' : result.reason ?? '应用失败。');
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-ignore-relationship-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const result = ignoreCharacterRelationshipSuggestion(button.dataset.ignoreRelationshipSuggestion ?? '');
      setStatusText(result.ok ? '已忽略这条关系阶段建议。' : result.reason ?? '忽略失败。');
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('#export-world-bundle')?.addEventListener('click', () => {
    const world = activeWorld();
    void downloadWorldBundle(world.id)
      .then(downloadInfo => {
        const message = `已导出 ${world.name} 的完整世界包。\n文件名：${downloadInfo.fileName}\n保存位置：${downloadInfo.folderHint}`;
        openAlertDialog({
          title: '完整世界包已导出',
          message,
          confirmLabel: '知道了',
        });
        setStatusText(message.replace(/\n/g, ' '));
      })
      .catch(error => {
        setStatusText(error instanceof DOMException && error.name === 'AbortError'
          ? '已取消导出。'
          : error instanceof Error ? error.message : String(error));
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
        openAlertDialog({
          title: '角色卡已导出',
          message,
          confirmLabel: '知道了',
        });
        setStatusText(message.replace(/\n/g, ' '));
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
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#run-auto-check')?.addEventListener('click', () => {
    setStatusText('正在检查主动消息、自动动态和岛上事件…');
    preserveScrollForNextRender();
    render();
    void runAutoMessageCheckNow(render)
      .then(() => {
        setStatusText('已完成一次主动检查；如果没有新内容，说明当前未到触发条件或仍在安静时段。');
        preserveScrollForNextRender();
        renderWithUiTransition('detail-in');
      })
      .catch(error => {
        setStatusText(error instanceof Error ? `主动检查失败：${error.message}` : String(error));
        preserveScrollForNextRender();
        render();
      });
  });
  document.querySelector<HTMLButtonElement>('#restore-auto-pacing')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (character) applyResetDecision(character, 'restore');
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#keep-auto-pacing')?.addEventListener('click', () => {
    const character = proactiveManagerCharacter();
    if (character) applyResetDecision(character, 'keep');
    preserveScrollForNextRender();
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
        setStatusText(`已导出本地备份：${backupInfo.fileName}。聊天和角色已保存，API key 不会写入备份。保存位置：${backupInfo.folderHint}。`);
      })
      .catch(error => {
        setStatusText(error instanceof Error ? `备份导出失败：${error.message}` : String(error));
      })
      .finally(() => {
        render();
      });
  });
  document.querySelector<HTMLInputElement>('#backup-import')?.addEventListener('change', async event => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const rawText = await file.text();
      const preview = previewBackupRestoreText(rawText);
      openConfirmDialog({
        title: '导入备份会覆盖当前数据',
        message: formatBackupRestoreWarning(preview),
        confirmLabel: '导入并覆盖',
        cancelLabel: '先不导入',
        tone: 'danger',
        onCancel: () => {
          input.value = '';
        },
        onConfirm: () => {
          try {
            const restored = restoreBackupText(rawText);
            setStatusText(`已导入备份：${restored.characters.length} 个角色，${restored.messages.length} 条消息。`);
          } catch (error) {
            setStatusText(error instanceof Error ? error.message : String(error));
          }
          input.value = '';
          render();
        },
      });
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
      input.value = '';
      render();
    }
  });
  const messageInput = document.querySelector<HTMLTextAreaElement>('#message-input');
  if (messageInput) {
    resizeComposerTextarea(messageInput);
    messageInput.addEventListener('input', event => {
      const character = activePrivateChatTarget();
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
  document.querySelectorAll<HTMLDetailsElement>('.private-chat-identity-select').forEach(details => {
    details.addEventListener('toggle', () => {
      if (!details.open) return;
      document.querySelectorAll<HTMLDetailsElement>('.private-chat-identity-select[open]').forEach(other => {
        if (other !== details) other.open = false;
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-private-chat-identity-option]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      const selectedId = button.dataset.privateChatIdentityOption || 'user';
      if (selectedId === communicationActorId(activeWorld().id)) {
        button.closest<HTMLDetailsElement>('.private-chat-identity-select')?.removeAttribute('open');
        return;
      }
      selectPrivateChatIdentity(selectedId);
    });
  });
  document.querySelector<HTMLFormElement>('#composer')?.addEventListener('submit', event => {
    event.preventDefault();
    const character = activePrivateChatTarget();
    const input = document.querySelector<HTMLTextAreaElement>('#message-input');
    const content = input?.value ?? messageDraftFor(character);
    if (!content.trim()) return;
    if (!character) {
      setStatusText('请先选择一个可以私聊的联系人。');
      return;
    }
    if (isReplying()) {
      setStatusText('上一条消息仍在回复中。');
      return;
    }
    const shouldKeepKeyboard = Boolean(
      input
        && (
          isCompactViewport()
          || document.documentElement.classList.contains('keyboard-open')
          || document.activeElement === input
        ),
    );
    if (shouldKeepKeyboard) requestMessageComposerFocusAfterSubmit(character?.id ?? '');
    const replyToId = clearMessageComposerAfterSubmit(character, input, content, shouldKeepKeyboard);
    requestChatStickToBottom();
    const directSpeaker = privateChatIdentityCharacter();
    if (directSpeaker && character && directSpeaker.id !== character.id) {
      void (async () => {
        const thread = ensureCharacterDirectThread(character.worldId, directSpeaker.id, character.id);
        const sent = appendCharacterDirectMessage(thread.id, directSpeaker.id, content, 'manual');
        markCharacterDirectThreadRead(thread.id, directSpeaker.id, sent.createdAt);
        await detectCharacterDirectMessageEventSuggestion(sent);
        setStatusText(`已用 ${directSpeaker.name} 的身份发送。`);
        preserveScrollForNextRender();
        render();
        if (state.chatReplyMode === 'manual') return;
        try {
          await generateCharacterDirectReply(thread.id, character.id, { replyToId: sent.id, countBudget: true });
          setStatusText(`${character.name} 已回复这段角色私聊。`);
        } catch (error) {
          setStatusText(error instanceof Error ? error.message : String(error));
        }
        requestChatStickToBottom();
        preserveScrollForNextRender();
        render();
      })();
      return;
    }
    const speaker = privateChatSpeaker();
    if (state.chatReplyMode === 'manual') {
      void sendUserMessageOnly(content, render, replyToId, speaker);
    } else {
      void sendMessage(content, render, replyToId, speaker);
    }
  });
  document.querySelectorAll<HTMLButtonElement>('[data-create-private-event-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const suggestionId = button.dataset.createPrivateEventSuggestion;
      if (!suggestionId || creatingPrivateEventSuggestionId) return;
      creatingPrivateEventSuggestionId = suggestionId;
      setStatusText('正在生成事件…');
      preserveScrollForNextRender();
      render();
      window.setTimeout(() => {
        try {
          const worldEvent = createWorldEventFromPrivateChatSuggestion(suggestionId);
          activeWorldRpEventId = worldEvent.id;
          saveUiSessionSnapshot({ captureDom: false });
          setStatusText(`已生成事件：${worldEvent.title}`);
        } catch (error) {
          setStatusText(error instanceof Error ? error.message : String(error));
        } finally {
          creatingPrivateEventSuggestionId = '';
          preserveScrollForNextRender();
          render();
        }
      }, 0);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-edit-private-event-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const suggestionId = button.dataset.editPrivateEventSuggestion;
      const suggestion = state.privateChatEventSuggestions.find(item =>
        item.id === suggestionId && item.status === 'pending',
      );
      if (!suggestion) {
        setStatusText('找不到这条私聊事件草稿。');
        render();
        return;
      }
      openEventComposerFromPrivateSuggestion(suggestion);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-dismiss-private-event-suggestion]').forEach(button => {
    button.addEventListener('click', () => {
      const suggestionId = button.dataset.dismissPrivateEventSuggestion;
      if (suggestionId && dismissPrivateChatEventSuggestion(suggestionId)) {
        setStatusText('已忽略这条私聊事件草稿。');
      }
      preserveScrollForNextRender();
      render();
    });
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
      preserveScrollForNextRender();
      saveUiSessionSnapshot();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-world-insight-tab]').forEach(button => {
    button.addEventListener('click', () => {
      const nextTab = button.dataset.worldInsightTab;
      if (!isWorldInsightTab(nextTab) || nextTab === worldInsightTab) return;
      const transitionKind = worldInsightTransition(worldInsightTab, nextTab);
      worldInsightTab = nextTab;
      if (worldInsightTab !== 'events') {
        activeWorldRpEventId = '';
        worldRpInputDraft = '';
        worldRpMessageEditId = '';
        worldRpMessageActionId = '';
      }
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      renderWithUiTransition(transitionKind);
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-refresh-character-memory-summaries]').forEach(button => {
    button.addEventListener('click', () => {
      const characterId = button.dataset.refreshCharacterMemorySummaries ?? '';
      const character = state.characters.find(item => item.id === characterId && item.worldId === activeWorld().id);
      if (!character) return;
      rebuildPrivateChatAutoMemoryForCharacter(character.id);
      const micro = refreshMicroSummaryForCharacter(character.id);
      const middle = refreshMiddleSummaryForCharacter(character.id);
      setStatusText(micro || middle ? `${character.name} 的记忆总结已刷新。` : '还没有足够世界记录形成总结。');
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('[data-refresh-macro-summary]')?.addEventListener('click', () => {
    const summary = refreshMacroSummaryForWorld(activeWorld().id);
    setStatusText(summary ? '已生成世界大结草稿，请确认后再进入长期上下文。' : '还没有足够世界记录形成世界大结。');
    render();
  });
  document.querySelector<HTMLButtonElement>('[data-toggle-memory-summary-drawer]')?.addEventListener('click', () => {
    memorySummaryDrawerExpanded = !memorySummaryDrawerExpanded;
    preserveScrollForNextRender();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-edit-memory-summary]').forEach(button => {
    button.addEventListener('click', () => {
      const summary = state.memorySummaries.find(item => item.id === (button.dataset.editMemorySummary ?? '') && item.worldId === activeWorld().id);
      if (!summary) return;
      openPromptDialog({
        title: '编辑记忆总结',
        label: '事实摘要',
        initialValue: summary.factSummary,
        multiline: true,
        confirmLabel: '保存总结',
        onConfirm: value => {
          updateMemorySummary(summary.id, { factSummary: value });
          setStatusText('记忆总结已更新。');
          render();
        },
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-pause-memory-summary]').forEach(button => {
    button.addEventListener('click', () => {
      const summary = pauseMemorySummary(button.dataset.pauseMemorySummary ?? '');
      if (summary) setStatusText('这条总结已停用，不会进入模型上下文。');
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-resume-memory-summary]').forEach(button => {
    button.addEventListener('click', () => {
      const summary = resumeMemorySummary(button.dataset.resumeMemorySummary ?? '');
      if (summary) setStatusText(summary.status === 'pending_confirmation' ? '世界大结需要确认后才会进入上下文。' : '这条总结已重新启用。');
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-confirm-memory-summary]').forEach(button => {
    button.addEventListener('click', () => {
      const summary = confirmMemorySummary(button.dataset.confirmMemorySummary ?? '');
      if (summary) setStatusText('世界大结已确认，会参与长期上下文。');
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-discard-memory-summary]').forEach(button => {
    button.addEventListener('click', () => {
      const discarded = discardMemorySummary(button.dataset.discardMemorySummary ?? '');
      if (discarded) setStatusText('世界大结草稿已丢弃。');
      render();
    });
  });
  document.querySelectorAll<HTMLElement>('[data-world-relationship-character]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      const characterId = button.dataset.worldRelationshipCharacter ?? '';
      const character = state.characters.find(item => item.id === characterId && item.worldId === activeWorld().id);
      if (!character) return;
      worldInsightTab = 'relationships';
      activeWorldRpEventId = '';
      if (!relationshipPairACharacterId || relationshipPairBCharacterId) {
        relationshipPairACharacterId = character.id;
        relationshipPairBCharacterId = '';
      } else if (relationshipPairACharacterId !== character.id) {
        relationshipPairBCharacterId = character.id;
      }
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      render();
    });
  });
  document.querySelectorAll<Element>('[data-world-relationship-line]').forEach(element => {
    element.addEventListener('click', event => {
      event.stopPropagation();
      const relationshipId = element.getAttribute('data-world-relationship-line') ?? '';
      const relationship = state.characterRelationships.find(item => item.id === relationshipId && item.worldId === activeWorld().id);
      if (!relationship) return;
      worldInsightTab = 'relationships';
      activeWorldRpEventId = '';
      relationshipPairACharacterId = relationship.characterAId;
      relationshipPairBCharacterId = relationship.characterBId;
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      render();
    });
  });
  document.querySelector<HTMLElement>('[data-world-relationship-canvas]')?.addEventListener('click', event => {
    const target = event.target as Element | null;
    if (target?.closest('[data-world-relationship-character], [data-world-relationship-line]')) return;
    if (!relationshipPairACharacterId && !relationshipPairBCharacterId) return;
    relationshipPairACharacterId = '';
    relationshipPairBCharacterId = '';
    preserveScrollForNextRender();
    saveUiSessionSnapshot({ captureDom: false });
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-world-timeline-type]').forEach(button => {
    button.addEventListener('click', () => {
      const nextType = button.dataset.worldTimelineType;
      if (!isWorldTimelineTypeFilter(nextType)) return;
      worldTimelineTypeFilter = nextType;
      worldInsightTab = 'timeline';
      activeWorldRpEventId = '';
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      render();
    });
  });
  const applyWorldTimelineSearch = (target: HTMLInputElement) => {
    worldTimelineSearchQuery = target.value;
    worldInsightTab = 'timeline';
    activeWorldRpEventId = '';
    preserveScrollForNextRender();
    saveUiSessionSnapshot({ captureDom: false });
    render();
  };
  const worldTimelineSearchInput = document.querySelector<HTMLInputElement>('[data-world-timeline-search]');
  worldTimelineSearchInput?.addEventListener('input', event => {
    const target = event.currentTarget as HTMLInputElement;
    worldTimelineSearchQuery = target.value;
    if (isImeComposing(event)) return;
    applyWorldTimelineSearch(target);
  });
  worldTimelineSearchInput?.addEventListener('compositionend', event => {
    applyWorldTimelineSearch(event.currentTarget as HTMLInputElement);
  });
  document.querySelector<HTMLSelectElement>('[data-world-timeline-character]')?.addEventListener('change', event => {
    const selectedId = (event.currentTarget as HTMLSelectElement).value;
    worldTimelineCharacterFilter = selectedId === 'all'
      || state.characters.some(character => character.id === selectedId && character.worldId === activeWorld().id)
      ? selectedId
      : 'all';
    worldInsightTab = 'timeline';
    activeWorldRpEventId = '';
    preserveScrollForNextRender();
    saveUiSessionSnapshot({ captureDom: false });
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-world-event-rp]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.openWorldEventRp ?? '';
      const worldEvent = state.worldEvents.find(event => event.id === eventId && event.worldId === activeWorld().id);
      if (!worldEvent) return;
      captureVisibleDraftsFromDom();
      closeTransientOverlaysForPageChange();
      setActiveView('world');
      mobileSection = 'world';
      activeWorldRpEventId = worldEvent.id;
      worldRpInputDraft = '';
      worldRpMessageActionId = '';
      saveUiSessionSnapshot({ captureDom: false });
      requestChatStickToBottom();
      renderWithUiTransition('detail-in');
    });
  });
  document.querySelector<HTMLButtonElement>('[data-close-world-event-rp]')?.addEventListener('click', () => {
    activeWorldRpEventId = '';
    worldRpInputDraft = '';
    worldRpMessageEditId = '';
    worldRpMessageActionId = '';
    saveUiSessionSnapshot({ captureDom: false });
    renderWithUiTransition('detail-out');
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
      worldRpMessageActionId = '';
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      setStatusText(`事件已结束并写入时间线：${archived.title}`);
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : String(error));
    }
    renderWithUiTransition('detail-out');
  });
  if (worldRpMessageActionId) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.world-rp-message-actions') || target?.closest('[data-world-rp-action-message]')) return;
      closeWorldRpMessageActionMenuInPlace();
    }, { capture: true, once: true });
  }
  document.querySelectorAll<HTMLElement>('[data-world-rp-action-message]').forEach(message => {
    let pointerId = -1;
    let pointerStartX = 0;
    let pointerStartY = 0;
    let longPressTimer: ReturnType<typeof setTimeout> | undefined;
    const clearLongPress = () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      longPressTimer = undefined;
    };
    const openActions = () => {
      const messageId = message.dataset.worldRpActionMessage ?? '';
      if (!messageId) return;
      worldRpMessageActionId = messageId;
      renderWithUiTransition('quiet');
    };
    message.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement | null)?.closest('button')) return;
      pointerId = event.pointerId;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      clearLongPress();
      longPressTimer = setTimeout(openActions, 360);
    });
    message.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId) return;
      if (Math.hypot(event.clientX - pointerStartX, event.clientY - pointerStartY) > 10) {
        clearLongPress();
      }
    });
    message.addEventListener('pointerup', clearLongPress);
    message.addEventListener('pointercancel', clearLongPress);
    message.addEventListener('contextmenu', event => {
      event.preventDefault();
      openActions();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-world-rp-message]').forEach(button => {
    button.addEventListener('click', () => {
      const messageId = button.dataset.deleteWorldRpMessage ?? '';
      if (deleteWorldEventRpMessage(messageId)) {
        if (worldRpMessageEditId === messageId) worldRpMessageEditId = '';
        worldRpMessageActionId = '';
        preserveScrollForNextRender();
        setStatusText('世界 RP 记录已删除。');
        render();
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-regenerate-world-rp-message]').forEach(button => {
    button.addEventListener('click', () => {
      const messageId = button.dataset.regenerateWorldRpMessage ?? '';
      const target = worldRpRerollTarget(messageId);
      const character = target?.characterId
        ? state.characters.find(item => item.id === target.characterId && item.worldId === activeWorld().id) ?? worldRpActiveCharacter()
        : worldRpActiveCharacter();
      if (!target || !character) {
        setStatusText('这条行动后面还没有可重roll的 AI 续写。');
        worldRpMessageActionId = '';
        render();
        return;
      }
      if (worldRpGenerating) {
        setStatusText('上一条世界 RP 还在生成中。');
        return;
      }
      worldRpMessageActionId = '';
      worldRpGenerating = true;
      preserveScrollForNextRender();
      setStatusText('正在重roll世界 RP…');
      render();
      void regenerateWorldEventRpMessage(target.id, character)
        .then(() => {
          setStatusText('世界 RP 已重roll，可用下方版本切换查看旧回复。');
        })
        .catch(error => {
          setStatusText(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          worldRpGenerating = false;
          render();
        });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-world-rp-message-variant-prev]').forEach(button => {
    button.addEventListener('click', () => {
      if (selectWorldEventRpMessageVariant(button.dataset.worldRpMessageVariantPrev ?? '', -1)) {
        preserveScrollForNextRender();
        render();
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-world-rp-message-variant-next]').forEach(button => {
    button.addEventListener('click', () => {
      if (selectWorldEventRpMessageVariant(button.dataset.worldRpMessageVariantNext ?? '', 1)) {
        preserveScrollForNextRender();
        render();
      }
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-edit-world-rp-message]').forEach(button => {
    button.addEventListener('click', () => {
      worldRpMessageEditId = button.dataset.editWorldRpMessage ?? '';
      worldRpMessageActionId = '';
      renderWithUiTransition('overlay-in');
      window.requestAnimationFrame(() => {
        const input = document.querySelector<HTMLTextAreaElement>('#world-rp-message-edit-input');
        input?.focus();
        input?.setSelectionRange(input.value.length, input.value.length);
      });
    });
  });
  const closeWorldRpMessageEdit = () => {
    worldRpMessageEditId = '';
    worldRpMessageActionId = '';
    renderWithUiTransition('overlay-out');
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
    worldRpMessageActionId = '';
    renderWithUiTransition('overlay-out');
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
    const character = activePrivateChatTarget();
    const directSpeaker = privateChatIdentityCharacter();
    if (directSpeaker && character && directSpeaker.id !== character.id) {
      void (async () => {
        const thread = ensureCharacterDirectThread(character.worldId, directSpeaker.id, character.id);
        const directMessages = characterDirectMessagesFor(thread.id);
        const latest = directMessages[directMessages.length - 1];
        if (!latest) {
          setStatusText(`先用 ${directSpeaker.name} 的身份发一句，再让 ${character.name} 回复。`);
          return;
        }
        if (latest.speakerCharacterId === character.id) {
          setStatusText(`轮到你用 ${directSpeaker.name} 亲自接话。`);
          return;
        }
        try {
          await generateCharacterDirectReply(thread.id, character.id, { replyToId: latest.id, countBudget: true });
          setStatusText(`${character.name} 已继续这段角色私聊。`);
        } catch (error) {
          setStatusText(error instanceof Error ? error.message : String(error));
        }
        requestChatStickToBottom();
        preserveScrollForNextRender();
        render();
      })();
      return;
    }
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
      renderWithUiTransition('overlay-in');
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-edit-message]').forEach(button => {
    button.addEventListener('click', () => {
      messageEditId = button.dataset.editMessage ?? '';
      messageActionId = '';
      preserveScrollForNextRender();
      renderWithUiTransition('overlay-in');
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
        left: isCompactViewport()
          ? Math.min(Math.max(12, rect.left), window.innerWidth - popoverWidth - 12)
          : Math.min(rect.right + 10, window.innerWidth - popoverWidth - 12),
        top: Math.min(Math.max(76, rect.top - 8), window.innerHeight - 220),
      };
      messageActionId = '';
      renderWithUiTransition('overlay-in');
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
    renderWithUiTransition('overlay-out');
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
    renderWithUiTransition('overlay-out');
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
    renderWithUiTransition('overlay-out');
  });
  document.querySelector<HTMLButtonElement>('#confirm-recall-message')?.addEventListener('click', () => {
    const messageId = messageDeleteChoiceId;
    if (recallMessage(messageId)) {
      if (quotedMessageId === messageId) quotedMessageId = '';
      setStatusText('消息已撤回，聊天中保留痕迹。');
    }
    messageDeleteChoiceId = '';
    renderWithUiTransition('overlay-out');
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
      row?.classList.remove('is-returning');
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
          row?.classList.add('is-swiping');
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
      row?.style.setProperty('--message-swipe-x', `${-swipeDistance}px`);
      row?.style.setProperty('--swipe-progress', `${Math.min(1, rawDistance / 56)}`);
      row?.classList.toggle('is-swipe-ready', swipeReady);
    });
    const finishSwipe = (activateQuote: boolean) => {
      cancelLongPress();
      if (pointerId >= 0 && message.hasPointerCapture(pointerId)) message.releasePointerCapture(pointerId);
      row?.classList.remove('is-swiping');
      row?.classList.add('is-returning');
      row?.classList.remove('is-swipe-ready');
      row?.style.setProperty('--message-swipe-x', '0px');
      row?.style.setProperty('--swipe-progress', '0');
      pointerId = -1;
      swipeDistance = 0;
      swipeReady = false;
      window.setTimeout(() => {
        row?.classList.remove('is-returning');
        row?.style.removeProperty('--message-swipe-x');
        row?.style.removeProperty('--swipe-progress');
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
      if (privateChatIdentityCharacter()) {
        stickerPickerOpen = false;
        setStatusText('角色私聊暂时只支持文字消息。');
        render();
        return;
      }
      stickerPickerOpen = false;
      void sendStickerMessage(button.dataset.sendSticker ?? '', render, privateChatSpeaker());
    });
  });
  document.querySelector<HTMLSelectElement>('#moment-author-select')?.addEventListener('change', event => {
    expandMomentComposerLayout();
    momentComposerAuthorId = (event.currentTarget as HTMLSelectElement).value || 'user';
    momentComposerTextDraft = document.querySelector<HTMLTextAreaElement>('#moment-input')?.value ?? '';
    momentGenerationStatus = '';
    render();
  });
  document.querySelector<HTMLSelectElement>('#moment-visibility-mode')?.addEventListener('change', event => {
    expandMomentComposerLayout();
    momentVisibilityMode = (event.currentTarget as HTMLSelectElement).value as MomentVisibilityMode;
    if (momentVisibilityMode === 'private') momentVisibilityPickerOpenFor = null;
    scheduleUiSessionSnapshotSave();
    preserveScrollForNextRender();
    render();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-moment-visibility-picker]').forEach(button => {
    button.addEventListener('click', () => {
      expandMomentComposerLayout();
      const mode = button.dataset.momentVisibilityPicker === 'blocked' ? 'blocked' : 'specific';
      momentVisibilityPickerOpenFor = momentVisibilityPickerOpenFor === mode ? null : mode;
      scheduleUiSessionSnapshotSave();
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-character]').forEach(input => {
    input.addEventListener('change', event => {
      const target = event.currentTarget as HTMLInputElement;
      if (target.checked) momentVisibilityCharacterIds.add(target.value);
      else momentVisibilityCharacterIds.delete(target.value);
      scheduleUiSessionSnapshotSave();
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLInputElement>('[data-moment-visibility-blocked]').forEach(input => {
    input.addEventListener('change', event => {
      const target = event.currentTarget as HTMLInputElement;
      if (target.checked) momentVisibilityBlockedIds.add(target.value);
      else momentVisibilityBlockedIds.delete(target.value);
      scheduleUiSessionSnapshotSave();
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelector<HTMLTextAreaElement>('#moment-input')?.addEventListener('input', event => {
    momentComposerTextDraft = (event.currentTarget as HTMLTextAreaElement).value;
    scheduleUiSessionSnapshotSave();
  });
  document.querySelector<HTMLTextAreaElement>('#moment-input')?.addEventListener('focus', () => {
    window.clearTimeout(momentComposerKeyboardBlurTimer);
    momentComposerKeyboardBlurTimer = undefined;
    setMomentComposerKeyboardFocus(true);
    keepMomentComposerVisible();
  });
  document.querySelector<HTMLTextAreaElement>('#moment-input')?.addEventListener('blur', () => {
    window.clearTimeout(momentComposerKeyboardBlurTimer);
    if (momentComposerClosing) return;
    momentComposerKeyboardBlurTimer = window.setTimeout(() => {
      momentComposerKeyboardBlurTimer = undefined;
      if (!momentComposerClosing) expandMomentComposerLayoutInPlace();
    }, 120);
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
  document.querySelectorAll<HTMLButtonElement>('[data-toggle-timeline-context]').forEach(button => {
    button.addEventListener('click', () => {
      const entry = state.timelineEntries.find(item => item.id === (button.dataset.toggleTimelineContext ?? ''));
      if (!entry || entry.revokedAt) return;
      entry.includeInContext = !entry.includeInContext;
      saveState();
      setStatusText(entry.includeInContext ? '这条记忆会进入近期上下文。' : '这条记忆仅作为记录保存。');
      preserveScrollForNextRender();
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
  document.querySelectorAll<HTMLButtonElement>('[data-moment-comment-tap]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      if (Date.now() < momentCommentSuppressTapUntil) return;
      const momentId = button.dataset.momentCommentMoment ?? '';
      const commentId = button.dataset.momentCommentTap ?? '';
      setMomentCommentReplyTarget(momentId, commentId);
      clearMomentCommentActionMenu(momentId, commentId);
      preserveScrollForNextRender();
      render();
    });
  });
  if (momentCommentActionMenu) {
    document.addEventListener('pointerdown', event => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('.moment-comment-menu, .moment-comment-actions, .moment-comment-character-reply')) return;
      momentCommentActionMenu = null;
      preserveScrollForNextRender();
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
        preserveScrollForNextRender();
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
        preserveScrollForNextRender();
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
      preserveScrollForNextRender();
      render();
      if (hasVisibleCharacters) void inviteInterestedCharacters(moment.id);
      return;
    } catch (error) {
      setVisibleStatus(error instanceof Error ? error.message : String(error));
    }
    preserveScrollForNextRender();
    render();
  });
  document.querySelector<HTMLButtonElement>('#generate-moment')?.addEventListener('click', () => {
    expandMomentComposerLayout();
    const selectedAuthorId = document.querySelector<HTMLSelectElement>('#moment-author-select')?.value || momentComposerAuthorId;
    momentComposerAuthorId = selectedAuthorId || 'user';
    momentComposerTextDraft = document.querySelector<HTMLTextAreaElement>('#moment-input')?.value ?? momentComposerTextDraft;
    const character = state.characters.find(item =>
      item.id === momentComposerAuthorId && item.worldId === activeWorld().id,
    );
    if (!character) {
      momentComposerOpen = true;
      momentGenerationStatus = '请先在发布身份里选择一个角色。';
      setVisibleStatus(momentGenerationStatus);
      preserveScrollForNextRender();
      render();
      return;
    }
    if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
      momentComposerOpen = true;
      momentGenerationStatus = '还没有配置模型，请先到“设置 -> 模型连接”填写 API 地址和模型名称。';
      setVisibleStatus(momentGenerationStatus);
      preserveScrollForNextRender();
      render();
      return;
    }
    momentGenerating = true;
    momentComposerOpen = true;
    momentGenerationStatus = `正在让 ${character.name} 生成动态草稿…`;
    setVisibleStatus(momentGenerationStatus);
    preserveScrollForNextRender();
    render();
    void generateCharacterMomentDraft(character)
      .then(content => {
        momentComposerTextDraft = content;
        momentGenerationStatus = `${character.name} 已写好草稿，确认后点“发布动态”。`;
        saveUiSessionSnapshot({ captureDom: false });
        setVisibleStatus(momentGenerationStatus);
        preserveScrollForNextRender();
        render();
      })
      .catch(error => {
        momentGenerationStatus = error instanceof Error ? error.message : String(error);
        setVisibleStatus(momentGenerationStatus);
        preserveScrollForNextRender();
        render();
      })
      .finally(() => {
        momentGenerating = false;
        preserveScrollForNextRender();
        render();
      });
  });
  document.querySelectorAll<HTMLFormElement>('[data-comment-form]').forEach(form => {
    form.addEventListener('submit', event => {
      event.preventDefault();
      const momentId = form.dataset.commentForm ?? '';
      try {
        const input = document.querySelector<HTMLInputElement>(`[data-comment-input="${momentId}"]`);
        const moment = state.moments.find(item => item.id === momentId);
        if (!moment) throw new Error('找不到这条动态。');
        const selectedActorId = document.querySelector<HTMLSelectElement>(
          `[data-comment-actor-select="${momentId}"]`,
        )?.value ?? communicationActorId(moment.worldId);
        setCommunicationActor(moment.worldId, selectedActorId);
        const commentCharacter = momentCommentCharacterFromCommunicationIdentity(moment);
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
        const willReply = Boolean(moment?.characterId && !commentCharacter && modelIsReady());
        setStatusText(willReply ? '评论已发送，对方正在回复…' : '评论已发送。');
        preserveScrollForNextRender();
        render();
        if (willReply) void replyToUserComment(momentId, comment.id);
        return;
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : String(error));
      }
      preserveScrollForNextRender();
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
        item.id === selectedCharacterId && item.worldId === moment?.worldId,
      );
      if (!moment || !character) return;
      if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再让角色评论。');
        preserveScrollForNextRender();
        render();
        return;
      }
      commentingMomentId = momentId;
      momentGenerationStatus = `正在生成 ${character.name} 的评论…`;
      setStatusText(momentGenerationStatus);
      preserveScrollForNextRender();
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
          preserveScrollForNextRender();
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
      preserveScrollForNextRender();
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
        item.id === selectedCharacterId && item.worldId === moment?.worldId,
      );
      if (!moment || !character || !commentId) return;
      if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再让角色回复评论。');
        preserveScrollForNextRender();
        render();
        return;
      }
      commentingMomentId = momentId;
      momentGenerationStatus = `正在生成 ${character.name} 的回复…`;
      setStatusText(momentGenerationStatus);
      clearMomentCommentActionMenu(momentId, commentId);
      preserveScrollForNextRender();
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
          preserveScrollForNextRender();
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
        ? state.characters.find(item => item.id === moment.characterId && item.worldId === moment.worldId)
        : undefined;
      if (!moment || !character || !commentId) return;
      if (!state.modelConfig.apiUrl.trim() || !state.modelConfig.model.trim()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再让楼主回复评论。');
        preserveScrollForNextRender();
        render();
        return;
      }
      autoCommentingMomentIds.add(momentId);
      momentGenerationStatus = `正在让 ${character.name} 回复这条评论…`;
      setStatusText(momentGenerationStatus);
      clearMomentCommentActionMenu(momentId, commentId);
      preserveScrollForNextRender();
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
          preserveScrollForNextRender();
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
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-moment-id]').forEach(button => {
    button.addEventListener('click', () => {
      const momentId = button.dataset.momentId ?? '';
      if (!momentId) return;
      openConfirmDialog({
        title: '删除动态',
        message: '确定删除这条动态吗？删除后可以短时间内撤销。',
        confirmLabel: '删除动态',
        cancelLabel: '保留',
        tone: 'danger',
        onConfirm: () => {
          clearMomentDeleteUndo();
          const snapshot = deleteMomentForUndo(momentId);
          if (snapshot) {
            if (activeMomentDetailId === momentId) activeMomentDetailId = '';
            lastDeletedMomentSnapshot = snapshot;
            lastDeletedMomentUndoTimer = window.setTimeout(() => {
              clearMomentDeleteUndo();
              renderWhenChatInputIdle();
            }, 8000);
            setStatusText('动态已删除，可在列表顶部撤销。');
          }
          preserveScrollForNextRender();
        },
      });
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-moment-detail]').forEach(button => {
    button.addEventListener('click', () => {
      const momentId = button.dataset.openMomentDetail ?? '';
      activeMomentDetailId = activeMomentDetailId === momentId ? '' : momentId;
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelector<HTMLButtonElement>('[data-undo-moment-delete]')?.addEventListener('click', () => {
    if (!lastDeletedMomentSnapshot) return;
    if (restoreDeletedMoment(lastDeletedMomentSnapshot)) {
      clearMomentDeleteUndo();
      setStatusText('已恢复刚刚删除的动态。');
      preserveScrollForNextRender();
      render();
    }
  });
  const closeEventComposer = () => {
    captureEventComposerDraftFromDom();
    eventComposerOpen = true;
    eventComposerDropClosing = true;
    preserveScrollForNextRender();
    saveUiSessionSnapshot();
    renderWithUiTransition('overlay-out');
    window.setTimeout(() => {
      if (!eventComposerDropClosing) return;
      eventComposerOpen = false;
      eventComposerDropClosing = false;
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      render();
    }, Math.max(0, EVENT_COMPOSER_DROP_CLOSE_MS - 40));
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
  document.querySelectorAll<HTMLButtonElement>('[data-event-composer-mode]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      captureEventComposerDraftFromDom();
      eventComposerDraft.mode = button.dataset.eventComposerMode === 'manual' ? 'manual' : 'auto';
      preserveScrollForNextRender();
      saveUiSessionSnapshot({ captureDom: false });
      render();
    });
  });
  document.querySelector<HTMLFormElement>('#event-composer')?.addEventListener('submit', event => {
    event.preventDefault();
    captureEventComposerDraftFromDom();
    const leadActor = eventComposerLeadActor();
    const participantIds = eventComposerParticipantIds();
    try {
      if (eventComposerDraft.mode === 'manual') {
        const worldEvent = createWorldEvent({
          title: eventComposerDraft.title,
          description: eventComposerDraft.description,
          participantCharacterIds: participantIds,
          leadActor,
          affinityDelta: finiteNumber(eventComposerDraft.affinityDelta, 0),
          type: eventComposerDraft.eventType ?? 'daily',
          source: 'manual',
        });
        if (eventComposerDraft.privateEventSuggestionId) {
          markPrivateChatEventSuggestionAccepted(eventComposerDraft.privateEventSuggestionId, worldEvent.id);
        }
        activeWorldRpEventId = worldEvent.id;
        eventComposerOpen = false;
        eventComposerDraft = { mode: 'auto', title: '', description: '', participantIds: [], affinityDelta: '0' };
        saveUiSessionSnapshot();
        setStatusText(`手写事件已创建：${worldEvent.title}`);
        preserveScrollForNextRender();
        render();
        return;
      }
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
          eventComposerDraft = { mode: 'auto', title: '', description: '', participantIds: [], affinityDelta: '0' };
          saveUiSessionSnapshot();
          setStatusText(`生活线索已生成：${worldEvent.title}`);
        })
        .catch(error => {
          setStatusText(error instanceof Error ? error.message : String(error));
        })
        .finally(() => {
          eventGenerating = false;
          preserveScrollForNextRender();
          renderWithUiTransition(eventComposerOpen ? 'quiet' : 'detail-in');
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
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEventComposer(button.dataset.openEventComposerMode === 'manual' ? 'manual' : 'auto');
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-open-event-composer-mode]').forEach(button => {
    button.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      openEventComposer(button.dataset.openEventComposerMode === 'manual' ? 'manual' : 'auto');
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-event-choice]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.eventChoice ?? '';
      const choiceId = button.dataset.eventChoiceId ?? '';
      if (!modelIsReady()) {
        setStatusText('请先到“设置 -> 模型连接”配置模型，再生成事件后续。');
        preserveScrollForNextRender();
        render();
        return;
      }
      eventResolvingId = eventId;
      setStatusText('正在生成这条分支的后续结果…');
      preserveScrollForNextRender();
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
          preserveScrollForNextRender();
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
      preserveScrollForNextRender();
      render();
    });
  });
  document.querySelectorAll<HTMLButtonElement>('[data-resolve-event]').forEach(button => {
    button.addEventListener('click', () => {
      const eventId = button.dataset.resolveEvent ?? '';
      if (resolveWorldEvent(eventId)) {
        setStatusText('事件已直接记为结束，并写入近期生活记忆。');
      }
      preserveScrollForNextRender();
      render();
    });
  });
  const setEventSwipeDeleteVisible = (row: HTMLElement, revealed: boolean): void => {
    row.classList.toggle('is-delete-revealed', revealed);
    row.querySelectorAll<HTMLButtonElement>('[data-delete-event]').forEach(action => {
      action.tabIndex = revealed ? 0 : -1;
      action.setAttribute('aria-hidden', revealed ? 'false' : 'true');
    });
  };
  const closeRevealedEventSwipeRows = (except?: HTMLElement): void => {
    document.querySelectorAll<HTMLElement>('[data-event-swipe-row].is-delete-revealed').forEach(openRow => {
      if (openRow !== except) setEventSwipeDeleteVisible(openRow, false);
    });
  };
  document.querySelectorAll<HTMLElement>('[data-event-swipe-row]').forEach(row => {
    let eventSwipeStartX = 0;
    let eventSwipeStartY = 0;
    row.addEventListener('pointerdown', event => {
      if ((event.target as HTMLElement | null)?.closest('[data-delete-event]')) return;
      closeRevealedEventSwipeRows(row);
      eventSwipeStartX = event.clientX;
      eventSwipeStartY = event.clientY;
    });
    row.addEventListener('pointerup', event => {
      const deltaX = event.clientX - eventSwipeStartX;
      const deltaY = event.clientY - eventSwipeStartY;
      if (Math.abs(deltaX) < 36 || Math.abs(deltaX) < Math.abs(deltaY)) return;
      closeRevealedEventSwipeRows(row);
      const shouldReveal = deltaX < 0 || !row.classList.contains('is-delete-revealed');
      setEventSwipeDeleteVisible(row, shouldReveal);
    });
  });
  document.addEventListener('pointerdown', event => {
    const target = event.target as HTMLElement | null;
    if (target?.closest('[data-event-swipe-row]')) return;
    closeRevealedEventSwipeRows();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-delete-event]').forEach(button => {
    button.addEventListener('click', clickEvent => {
      const eventId = button.dataset.deleteEvent ?? '';
      clickEvent.preventDefault();
      clickEvent.stopPropagation();
      if (!eventId) return;
      if (deleteWorldEvent(eventId, { rollbackImpact: true })) {
        if (activeWorldRpEventId === eventId) activeWorldRpEventId = '';
        setStatusText('事件已删除，相关关系影响也已撤销。');
      }
      preserveScrollForNextRender();
      render();
    });
  });
}
