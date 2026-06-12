# Refactoring Order

This is the recommended cleanup sequence. The goal is to make the code understandable to another AI without changing product behavior.

## Phase 0: Rollback Point

1. Check branch and status.
2. Commit or stash unrelated work.
3. Create a backup branch before moving code.
4. Keep `backups/` and `mockups/` out of commits unless the user explicitly asks.

## Phase 1: Documentation And Guards

1. Keep `docs/AI_HANDOFF.md` as the entry point for other AI workers.
2. Keep `docs/ai-handoff/CODE_MAP.md` aligned with current source files.
3. Keep `docs/ai-handoff/SEMANTIC_GUARDRAILS.md` aligned with product rules.
4. Add small source comments only where a future worker could easily break a hidden rule.
5. Do not add noisy comments such as "sets value" or "returns result".

## Phase 2: Split UI Helpers Before Pages

Start with helpers that are easiest to move without changing markup.

Candidate files:

- `src/independent-chat/ui/session.ts`: scroll, focus, draft, and UI session snapshot helpers.
- `src/independent-chat/ui/transitions.ts`: `UiTransitionKind`, `renderWithUiTransition`, and fallback transition helpers.
- `src/independent-chat/ui/icons.ts`: icon names and icon rendering.
- `src/independent-chat/ui/chat-surface.ts`: avatar rendering, chat background helpers, composer sizing and focus helpers.

Keep exported function names close to current names so tests and future diffs are easy to review.

## Phase 3: Split Page Renderers

After helpers are extracted, move page renderers by product area.

Candidate files:

- `src/independent-chat/ui/messages-page.ts`
- `src/independent-chat/ui/group-page.ts`
- `src/independent-chat/ui/character-page.ts`
- `src/independent-chat/ui/moments-page.ts`
- `src/independent-chat/ui/world-page.ts`
- `src/independent-chat/ui/settings-page.ts`

Do not redesign markup during this phase. Move code first, then verify that output still builds and tests pass.

## Phase 4: Split Event Binding

`bindUi` currently binds many unrelated interactions. Split it only after page renderers are stable.

Candidate files:

- `src/independent-chat/ui/bind/messages-bindings.ts`
- `src/independent-chat/ui/bind/group-bindings.ts`
- `src/independent-chat/ui/bind/character-bindings.ts`
- `src/independent-chat/ui/bind/moments-bindings.ts`
- `src/independent-chat/ui/bind/world-bindings.ts`
- `src/independent-chat/ui/bind/settings-bindings.ts`

Each binding module should receive only the state/actions it needs. Avoid importing every feature module into every binding file.

## Phase 5: Consolidate CSS

Do this after renderer splitting, not before. CSS is currently layered through history.

Candidate structure:

- `src/independent-chat/styles.css`: imports and shared tokens only.
- `src/independent-chat/styles/tokens.css`
- `src/independent-chat/styles/app-shell.css`
- `src/independent-chat/styles/messages.css`
- `src/independent-chat/styles/world.css`
- `src/independent-chat/styles/moments.css`
- `src/independent-chat/styles/settings.css`
- `src/independent-chat/styles/character.css`
- `src/independent-chat/styles/overlays.css`
- `src/independent-chat/styles/mobile.css`
- `src/independent-chat/styles/transitions.css`

Keep the import order explicit. Later files still override earlier files.

## Phase 6: Split State Normalization

Only do this after UI is easier to test.

Candidate files:

- `src/independent-chat/core/defaults.ts`
- `src/independent-chat/core/normalizers.ts`
- `src/independent-chat/core/selectors.ts`
- `src/independent-chat/core/persistence.ts`
- `src/independent-chat/core/conversations.ts`

Do not change `STORAGE_KEY` unless a deliberate migration plan exists.

## Phase 7: Split Tests By Meaning

Split `scripts/test-independent-core.ts` into named guard tests.

Candidate scripts:

- `scripts/test-state-migration.ts`
- `scripts/test-communication-identity.ts`
- `scripts/test-input-stability.ts`
- `scripts/test-world-rp-guards.ts`
- `scripts/test-character-worldbook.ts`
- `scripts/test-prompt-context.ts`
- `scripts/test-ui-source-guards.ts`

Keep `pnpm test:independent-core` as a wrapper or broad guard so existing commands continue working.

## Stop Conditions

Stop and ask before continuing if:

- A refactor changes generated HTML for a page that was meant to be moved unchanged.
- A test fails for unclear reasons twice in a row.
- TypeScript requires broad type weakening such as `any` to complete the move.
- A CSS consolidation causes new mobile overlap or horizontal scrolling.
- A state split changes normalized persisted output.

## Required Checks Per Phase

Small documentation-only phase:

```powershell
pnpm typecheck:independent
pnpm build:dev
```

UI helper or renderer movement:

```powershell
pnpm test:independent-core
pnpm typecheck:independent
pnpm build:dev
```

State, prompt, or model-context changes:

```powershell
pnpm test:independent
pnpm typecheck:independent
pnpm build:dev
```

Before APK:

```powershell
pnpm android:check
pnpm android:build
```
