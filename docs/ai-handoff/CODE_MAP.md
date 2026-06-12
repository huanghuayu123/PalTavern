# PalTavern Code Map

This map is written for an AI that has not seen the project before. It names the main files, what each file owns, and what not to confuse.

## Boot Flow

`src/independent-chat/index.ts`

- Imports `styles.css`.
- Calls `render()` from `ui/app.ts`.
- Generates the opening private message for the active character if needed.
- Starts the auto-message scheduler with `renderWhenChatInputIdle`.
- Do not move scheduler startup into UI page renderers. It is app-level boot behavior.

## Core Data

`src/independent-chat/core/types.ts`

- Defines persisted data shapes: worlds, characters, private conversations, group chats, moments, timeline, world events, prompt presets, model config, and app state.
- If a persisted field is added, add it here first and then normalize it in `core/state.ts`.

`src/independent-chat/core/state.ts`

- Owns the local storage key and default state.
- Normalizes old local data into the current `AppState` shape.
- Owns active selectors such as `activeWorld`, `activeCharacter`, `activeGroupChat`.
- Owns communication identity helpers: `communicationActorId`, `communicationActor`, `setCommunicationActor`.
- Owns conversation helpers: `privateConversationActorIdFor`, `ensureConversation`, `conversationFor`, `messagesFor`, `markConversationRead`.
- Do not import UI code here. State must stay usable by tests and feature modules.

## UI Shell

`src/independent-chat/ui/app.ts`

This is currently the main code knot. It contains:

- Transient UI state: selected settings section, active mobile section, active panels, drafts, popovers, modals, action menus.
- Session persistence for scroll position, focus, draft text, current mobile layer, and active detail page.
- Render helpers for headers, lists, chat bubbles, world RP segments, settings folds, prompt rows, and dialogs.
- Page renderers for messages, contacts, groups, character panel, moments, world workbench, settings, onboarding, import dialogs, and sticker dialogs.
- UI transition helpers: `renderWithUiTransition` for user-triggered page changes, while background refresh stays on plain `render`.
- Input stability helpers: capture and restore focus/drafts for private chat, group chat, moment comments, and world event composer.
- `bindUi`, which attaches almost all DOM event listeners after each render.

Do not treat this as a pure view file. It is view plus UI controller plus transient state. The first safe refactor is to extract helpers, not to rewrite behavior.

`src/independent-chat/ui/transitions.ts`

- Owns browser-level View Transition API support and CSS fallback markers.
- Exports transition direction helpers for main mobile sections and desktop view switches.
- Exports `renderWithUiTransition(kind, renderPage)` so the module can run transitions without importing the whole UI shell.
- Do not call this module for background scheduler refreshes or input-idle renders.

`src/independent-chat/ui/icons.ts`

- Owns shared icon names and SVG rendering.
- Keeps repeated navigation/action icon paths out of the main app renderer.

`src/independent-chat/ui/chat-surface.ts`

- Owns shared chat-surface display helpers: avatar markup, stable avatar tone attributes, user avatar initials, chat background controls, image import reading, and chat surface inline style.
- Keeps visual chat chrome separate from page renderers so private chat, group chat, moments, and world RP can share the same display rules.

`src/independent-chat/ui/rp-rendering.ts`

- Parses RP text into narration, dialogue, and thought segments.
- Used by world RP rendering.
- Good example of a small focused UI helper.

`src/independent-chat/ui/authoring-ui.ts`

- Renders character creation/editing surfaces.
- Keep character authoring UI behavior separate from private chat settings when possible.

`src/independent-chat/ui/welcome-cover.ts`

- Owns the first-run welcome cover rendering and seen-state helper.

## Styles

`src/independent-chat/styles.css`

The file is very large because several UI refreshes were appended over time. Important layers currently include:

- Base variables and early app layout.
- Earlier mobile and settings styles.
- Product UI refresh layers.
- World workbench styles.
- Page transition styles.
- Later final mobile guards and overlap repair layers.
- Final message, world, settings, chat background, and worldbook page guards near the bottom.

Because later rules override earlier rules, deleting an "old-looking" block can still change the app. Consolidate CSS only after taking screenshots and comparing mobile pages.

## Chat

`src/independent-chat/chat/private-chat.ts`

- Handles private chat message mutations, reply generation, opening messages, regeneration, recall, delete, and stickers.
- User-authored messages can be from `user` or from a character communication identity.
- Private conversations are isolated by actor and target through state helpers. This is intentional.

`src/independent-chat/chat/group-chat.ts`

- Handles group creation, participant management, group message sending, group reply generation, deletion and recall.
- Group chat records are shared in the world. The current speaker follows communication identity, but the group itself is not duplicated per identity.

`src/independent-chat/chat/auto-message-strategy.ts`

- Owns proactive-message pacing strategy defaults and parsing.

`src/independent-chat/chat/format.ts`

- Owns chat output formatting and segmentation.

`src/independent-chat/chat/typing-delay.ts`

- Small helper for simulated response timing.

## Social And World

`src/independent-chat/social/moments.ts`

- Owns moment creation, automatic moment generation, comments, comment prompt building, author replies, interest spreading, and deletion.
- Moment comments follow the global communication identity.

`src/independent-chat/social/events.ts`

- Owns world events, event generation, RP event messages, RP replies, manual finish, choice resolution, deletion, and event timeline writes.
- World events live under the world entry.

`src/independent-chat/social/background-interactions.ts`

- Owns background character interaction simulation.

`src/independent-chat/social/character-interactions.ts`

- Owns interaction records and related helpers.

`src/independent-chat/social/moment-visibility.ts`

- Owns moment visibility rules.

`src/independent-chat/world/weather.ts`

- Owns weather/location data.

## Memory

`src/independent-chat/memory/timeline.ts`

- Adds timeline entries for manual notes, chat, moments, events, auto messages, and relationship changes.
- Provides timeline context for model prompts.

`src/independent-chat/memory/impacts.ts`

- Applies and rolls back relationship/status impacts.

`src/independent-chat/memory/character-status.ts`

- Owns character status summaries.

`src/independent-chat/memory/daily-brief.ts`

- Owns daily brief generation and storage.

## Model And Prompts

`src/independent-chat/model/client.ts`

- Normalizes model API URLs.
- Fetches model list and tests connection.
- Builds final model messages from presets, world/user/character context, timeline, relationship context, and chat history.
- Calls the model for chat and authoring flows.

`src/independent-chat/model/prompt-presets.ts`

- Owns default private, group, and world prompt presets.
- Parses SillyTavern presets.
- Normalizes prompt preset data and regex scripts.

`src/independent-chat/model/reply-strategy.ts`

- Owns reply strategy helpers.

## Characters

`src/independent-chat/characters/cards.ts`

- Parses character cards, PNG cards, candidates, imports, updates, sticker files, avatar files, upsert, and delete.

`src/independent-chat/characters/settings.ts`

- Converts character settings to and from editable world book entries.
- Keeps the main settings entry and additional world book entries together.

`src/independent-chat/characters/authoring.ts`

- Owns simple character card drafts, draft conversion into `CharacterProfile`, and authoring tutor prompts.

`src/independent-chat/characters/relationships.ts`

- Owns relationship helpers.

`src/independent-chat/characters/tavern-export.ts`

- Exports characters back into Tavern-compatible cards.

`src/independent-chat/characters/builtin-character-cards.ts`

- Built-in starter cards.

## Platform, Data, Automation, Media

`src/independent-chat/automation/scheduler.ts`

- Runs background/proactive scheduling and calls the app render callback carefully.

`src/independent-chat/data/backup.ts`

- Exports and restores complete local app data.

`src/independent-chat/platform/notifications.ts`

- Owns local notification permission and send helpers.

`src/independent-chat/platform/runtime.ts`

- Owns background runtime status helpers.

`src/independent-chat/media/stickers.ts`

- Owns sticker lookup.

## Tests And Build

Main verification commands are declared in `package.json`.

- `pnpm test:independent-core` is the largest behavior guard.
- `pnpm test:independent` chains all independent app tests.
- `pnpm typecheck:independent` compiles the independent source.
- `pnpm build:dev` builds the browser app.
- `pnpm android:check` and `pnpm android:build` verify Android readiness and package the debug APK.
