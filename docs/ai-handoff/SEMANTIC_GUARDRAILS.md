# Semantic Guardrails

These are the rules that define the meaning of the app. Refactors may move code, rename helpers, or split files, but they must not change these behaviors unless the user explicitly asks.

## Navigation

- Main navigation is `消息 / 角色 / 世界 / 动态 / 设置`.
- `事件` and `时间线` must not return as separate main navigation entries.
- Event and timeline behavior belongs under `世界`.
- Mobile back should return to the previous in-app page or list, not leave the app or jump to desktop behavior.

## Communication Identity

- The global communication identity is saved per world.
- Its value is either `user` or a character ID in the current world.
- The only primary UI entry for this identity is the messages page selector.
- Private chat details, group chat details, and moment comment inputs should not expose separate speaker selectors.
- Switching identity on mobile should return to the message list and preserve drafts/scroll state.
- World RP identity is separate and must not be replaced by communication identity.

## Private Chat

- Private chat records are isolated by communication actor plus target character.
- Private chat conversations are scoped by communication actor plus target character.
- Example: user -> B, A -> B, and C -> B are separate private conversation records.
- A character should not see their own private window as a target.
- User-authored messages must record `speakerType` and `speakerCharacterId` correctly.
- When a character identity sends a private message, the model prompt must make clear which identity sent the previous turn.
- Character-to-character private chat relationship effects should apply between those characters, not to user affinity.

## Group Chat

- Group chat records are shared within the world.
- Group chat list and records are shared within the world.
- Switching communication identity must not duplicate or hide the group record.
- If the current identity is a group member, sending uses that character.
- If the current identity is not a group member, sending falls back to user.
- Existing `selectedSpeakerId` may remain as compatibility data, but UI should not use it as a second live picker.

## Moments

- Moment comments follow communication identity.
- The inline comment row should stay compact: role selection should not reappear there.
- Switching identity must not clear an in-progress comment.
- Generated or automatic comments must not inherit private chat history unless the prompt path deliberately passes that context.

## World RP, Events, Timeline

- The world page starts from daily fragments/list view, not a management board.
- Events are RP fragments. Opening an event enters a dialogue stage.
- Generating an event opens the unified event composer.
- The composer supports automatic generation and manual writing.
- Current world RP identity participates as lead actor. Extra characters can be selected as participants.
- Private chat messages must never be rendered inside the world RP stream.
- Ending an event archives it and writes timeline memory.
- Archived events are read-only.
- Recent memory and full timeline live behind the world settings/gear surface, not as main nav entries.

## World And Character Lore

- World-level lore belongs to the world and should be available to characters in that world.
- Character world book entries belong to the character.
- Do not merge world-level lore and character world book entries into one blob.
- Character settings text and additional world book entries must coexist.
- Editing a character world book should happen through a page-like editor, not a cramped hidden interaction.

## Prompt Presets

- Private chat, group chat, and world RP each have their own prompt preset selection/enabled state.
- SillyTavern preset import must preserve editable prompt entries and regex scripts.
- Preset rows must allow adding, editing, deleting, moving, and toggling entries.
- World presets belong in the Settings preset section.

## Input Stability

This is a hard product rule.

- Background scheduler ticks must not clear focused input text.
- Focused input text must not be cleared by scheduler ticks.
- Opening settings, opening drawers, opening event composer, switching composer mode, selecting participants, ending events, writing memories, or generating responses must not clear drafts.
- Mobile keyboard should not be dismissed by avoidable full-page refreshes.
- Use `renderWhenChatInputIdle` or draft/focus capture helpers when a render is not directly user navigation.
- Use `renderWithUiTransition` only for deliberate page, detail, or overlay transitions. Do not wrap background refreshes in transition renders.

## CSS And Layout

- The bottom of `styles.css` contains later guard layers that override older rules.
- Do not delete old-looking CSS until screenshots prove the later consolidated rules cover the same pages.
- Every mobile topbar must fit within screen width.
- Bottom nav items must stay evenly distributed.
- No page should allow horizontal scrolling on mobile.
- Text inputs and send buttons must not overlap.
- Settings and detail pages should be full pages when requested by the user, not half-modal sheets.

## Persistence And Migration

- Add persisted fields to `core/types.ts`.
- Normalize every persisted field in `core/state.ts`.
- Keep old data loading safely.
- Avoid throwing on unknown old fields.
- Default world and default characters must remain available for fresh users.

## Verification Before Claiming Safety

At minimum, run:

```powershell
pnpm test:independent-core
pnpm typecheck:independent
pnpm build:dev
```

Before packaging or declaring a broad refactor safe, also run:

```powershell
pnpm test:independent
pnpm android:check
pnpm android:build
```
