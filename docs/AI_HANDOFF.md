# PalTavern AI Handoff

Snapshot: `7778b57` on branch `codex/world-ui-followups`.

Read this file first when another AI or engineer takes over this project. The goal of this handoff is not to describe every line of code. The goal is to stop the next worker from walking into the huge UI file, guessing the product rules, and accidentally breaking chat identity, world isolation, input stability, or mobile layout.

## Product Shape

PalTavern is a local-first roleplay and social chat app built from SillyTavern-style character cards. The user-facing app has five main entries:

- Messages: private chat, group chat, and the global communication identity selector.
- Characters: character creation, import/export, status, character world book, relationship and reply strategy settings.
- World: daily RP fragments, world events, world RP dialogue stage, world memories and timeline access.
- Moments: social feed, posts, comments, and character reactions.
- Settings: model connection, prompt presets, user persona, global app settings, notifications, data backup, and runtime checks.

The app should feel like a polished mobile social/chat app, not a debug console or management dashboard.

## Current Code Reality

The project already has feature modules, but the UI shell is still too concentrated:

- `src/independent-chat/index.ts` starts the app.
- `src/independent-chat/ui/app.ts` renders almost every page, stores transient UI state, restores focus/scroll, binds DOM events, and coordinates page transitions.
- `src/independent-chat/ui/transitions.ts` is the single entry for page transitions: `renderWithUiTransition(kind, renderPage)` plus the `prepare*` helpers. It only maps a transition kind to a motion-engine call. `app.ts` keeps the old one-argument call wrapper so existing navigation code stays stable.
- `src/independent-chat/ui/motion.ts` is the motion engine (see Motion Engine below).
- `src/independent-chat/ui/appearance.ts` applies the user's appearance settings (accent, light/dark/system, full/reduced motion) as attributes on `<html>` and by rewriting the `prefers-color-scheme` / `prefers-reduced-motion` media queries in place.
- `src/independent-chat/styles.css` contains multiple historical UI refresh layers. Later rules often override earlier rules. Phone and tablet styling now lives in `styles-mobile.css` (every rule starts with `html[data-compact-ui]`, so desktop is untouched); `styles-appearance.css` holds accent presets, appearance controls and motion layer styles for every layout.
- `src/independent-chat/core/state.ts` owns persistence, default state, migrations, active selectors, world selectors, communication identity selectors, and conversation selectors.
- `src/independent-chat/core/types.ts` is the shared schema for all persisted app data.
- Feature modules under `chat`, `social`, `memory`, `model`, `characters`, `automation`, `platform`, `world`, and `data` contain most business behavior.

If you only read one deeper document, read [Code Map](./ai-handoff/CODE_MAP.md).

## Motion Engine

`ui/motion.ts` gives the whole app one continuous motion language: what you tapped becomes the next screen, and going back returns the same way. The app re-renders whole pages with `innerHTML`, so the engine works around that:

1. Before rendering it records the boxes of elements marked `data-morph` (and, for page changes, copies the old page into a fixed `.pt-motion-clone` layer).
2. It renders the new screen immediately. Nothing waits for an animation.
3. After rendering it animates the new elements from the old boxes with Web Animations, touching only `transform`, `opacity` and `clip-path`.

Main entry points (all called through `transitions.ts` or a few event handlers):

- `enterDetail` / `exitDetail`: a row or button grows into a page and shrinks back. On desktop, a list row beside the detail pane swaps the pane in place and flies the avatar and name into its header.
- `switchAxis`: tabs, segments and the desktop rail push content along one axis.
- `openOverlay` / `closeOverlay`: sheets, menus and dialogs grow from the tapped control and shrink back into it.
- `captureMorphs` / `playMorphs`: shared-element flights, list reflow and the sliding selection highlight.
- `dissolveCover`, `playSendFlight`, `fadeOutThen`, `playAppearanceSwitch`: welcome cover, sending, delete/recall, accent and theme changes.

Rules to keep:

- Every page-level call starts with `settlePageMotion()`, which finishes running animations and removes leftover layers.
- `isMotionReduced()` (Settings → Appearance → Reduced, or the system preference) falls back to a short cross-fade.
- Motion layers are `pointer-events: none` and `aria-hidden`; copies drop ids and `data-*` hooks (except a short allowlist used by CSS), so styling for something that appears in a copy must use classes.
- Background refreshes (`renderWhenChatInputIdle`) never go through `renderWithUiTransition`.
- Pure math (`motionMath`) and appearance parsing are covered by `pnpm test:appearance-motion`.

## Rules That Must Not Be Broken

Before changing behavior, read [Semantic Guardrails](./ai-handoff/SEMANTIC_GUARDRAILS.md). The highest-risk rules are:

- Private chat input, group chat input, moment comment input, and world RP input must not be cleared by background refresh, settings edits, event generation, or scheduler ticks.
- The global communication identity belongs to messages, group chat, and moment comments. It does not control world RP.
- Private chat records are isolated by current communication actor and target character. Group chat records are shared inside the world.
- World RP must not render private chat messages.
- Event and timeline are folded under the world entry; they should not return as separate main navigation entries.
- CSS cleanup must respect the latest bottom override layers until they are intentionally consolidated and visually verified.

## Recommended Next Step

Do not start by rewriting features. Start by following [Refactoring Order](./ai-handoff/REFACTORING_ORDER.md):

1. Keep a rollback point.
2. Add or keep tests for every protected rule.
3. Extract UI helpers from `ui/app.ts` without changing markup.
4. Split page renderers after tests pass.
5. Consolidate CSS only after page renderers are easier to inspect.
6. Split state normalization and tests last.

## Verification Commands

Use these before claiming a change is safe:

```powershell
pnpm test:independent-core
pnpm typecheck:independent
pnpm build:dev
pnpm test:independent
```

For Android packaging work, also run:

```powershell
pnpm android:check
pnpm android:build
```

For UI layout work, use the in-app browser or Playwright-style screenshots at a mobile width. Check that nothing overlaps, no page scrolls horizontally, and focused text inputs keep their text.

## Double-Pass Review

This handoff was checked with a two-pass method requested by the user:

1. Pass 1 mapped the project from current source files.
2. Pass 2 returned to the same source snapshot and remapped the risky behavior without relying on the first wording.
3. Differences were reconciled in [Double Pass Review](./ai-handoff/DOUBLE_PASS_REVIEW.md).

If a later AI changes the architecture documents, repeat the same two-pass review before editing code.
