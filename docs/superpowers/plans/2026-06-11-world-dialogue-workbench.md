# World Dialogue Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the approved PalTavern world entry as a daily-RP dialogue workbench with narration plus dialogue rendering.

**Architecture:** Keep existing world, event, and timeline data stores. Add `world` as a view routing target, move event/timeline entry points into the world page, and render a chat-like workbench that reuses current events and timeline selectors. The first implementation is UI-first and preserves existing business functions.

**Tech Stack:** TypeScript, existing independent-chat state module, existing `ui/app.ts` renderer, existing CSS system in `styles.css`, current ts-node test scripts.

---

### Task 1: Lock Navigation Contract

**Files:**
- Modify: `scripts/test-independent-core.ts`
- Modify: `src/independent-chat/core/types.ts`
- Modify: `src/independent-chat/core/state.ts`
- Modify: `src/independent-chat/ui/app.ts`

- [x] **Step 1: Write failing assertions**

Add source-level assertions that require `world` as a persisted active view, require desktop controls to include `世界`, and require mobile bottom navigation to include `消息 / 角色 / 世界 / 动态 / 设置` while excluding standalone `事件` and `时间线`.

- [x] **Step 2: Run the focused test**

Run: `pnpm test:independent-core`
Expected before implementation: failure because `world` is not recognized and navigation still exposes event/timeline.

- [x] **Step 3: Implement minimal route changes**

Add `world` to `AppState['activeView']`, normalize legacy `events` and `timeline` into `world`, update `MobileSection`, and route desktop/mobile world entry to a new world page renderer.

- [x] **Step 4: Re-run the focused test**

Run: `pnpm test:independent-core`
Expected after implementation: pass.

### Task 2: Build World Workbench UI

**Files:**
- Modify: `src/independent-chat/ui/app.ts`
- Modify: `src/independent-chat/styles.css`

- [x] **Step 1: Render the workbench shell**

Create `renderWorldWorkbenchPage(mobile = false)` with current world identity, persona selector, event generation button, world settings/timeline panel, active daily-RP event card, narration plus dialogue preview, and embedded recent timeline.

- [x] **Step 2: Wire existing actions**

Reuse existing event composer, AI event generation, event resolve, timeline note, and world save controls. Keep `renderEvents()` and `renderTimeline()` available inside the world page rather than deleting their underlying logic.

- [x] **Step 3: Add CSS**

Add scoped classes for the world workbench, narration cards, dialogue turns, persona selector, top event tools, and gear-style world panel using existing PalTavern tokens.

### Task 3: Verify

**Files:**
- Test commands only.

- [x] **Step 1: Run type and behavior checks**

Run: `pnpm test:independent-core`, `pnpm typecheck:independent`, and `pnpm build:dev`.

- [x] **Step 2: Runtime smoke**

Request `http://127.0.0.1:8088/` and confirm the served app bundle is reachable. Use browser verification if the in-app browser tool is available.

### Task 4: Fixed Input-Stability Regression Gate

**Files:**
- Modify: `scripts/test-independent-core.ts`
- Inspect: `src/independent-chat/ui/app.ts`

- [x] **Step 1: Guard every visible text box**

The fixed flow must check that background scheduler renders do not clear focused text boxes or drop mobile keyboard focus. Covered surfaces include private chat, group chat, moment composer, moment comments, timeline/world memory notes, event composer fields, event result fields, world gear/persona fields, message edit dialogs, settings forms, character panels, authoring forms, and sticker import dialogs.

- [x] **Step 2: Keep draft-backed fields and unsaved forms separate**

Draft-backed chat fields may cache the current value and render after a real blur. Unsaved forms such as world settings, persona, event forms, event results, and timeline notes must drop idle scheduler renders while the user is typing so the DOM and keyboard are not rebuilt.

- [x] **Step 3: Run the fixed check on every new UI program**

Run `pnpm test:independent-core` for this gate. For changed visible UI, also perform one browser smoke check by typing into the touched input and waiting through one scheduler interval.
