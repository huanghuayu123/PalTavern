# UI Render Helper Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce `src/independent-chat/ui/app.ts` risk by extracting two pure v1 render helpers into focused UI modules.

**Architecture:** Keep behavior and DOM output stable. Move first-run guide rendering into `ui/first-run-guide.ts` and card-import diagnostics into `ui/card-import-diagnostics.ts`; `app.ts` remains responsible for state gathering and event binding.

**Tech Stack:** TypeScript independent-chat UI, existing source-level regression harness in `scripts/test-independent-core.ts`.

---

### Task 1: Add Source-Level Ownership Guard

**Files:**
- Modify: `scripts/test-independent-core.ts`

- [ ] **Step 1: Add module source reads**

Read `src/independent-chat/ui/first-run-guide.ts` and `src/independent-chat/ui/card-import-diagnostics.ts` in the core source test.

- [ ] **Step 2: Add guard assertions**

Assert that `app.ts` imports `renderFirstRunGuide` and `renderCardImportDiagnostics`, and no longer declares local `function renderFirstRunGuide` or `function renderCardImportDiagnostics`.

- [ ] **Step 3: Verify red**

Run `pnpm test:independent-core`. Expected before implementation: fail because the modules or imports do not exist yet.

### Task 2: Extract First-Run Guide Renderer

**Files:**
- Create: `src/independent-chat/ui/first-run-guide.ts`
- Modify: `src/independent-chat/ui/app.ts`

- [ ] **Step 1: Create pure renderer**

Create a module that exports `FirstRunGuideState`, `shouldShowFirstRunGuide`, and `renderFirstRunGuide`.

- [ ] **Step 2: Replace local app renderer**

In `app.ts`, build the `FirstRunGuideState` from existing model/character/content checks and call the imported renderer.

- [ ] **Step 3: Verify focused test**

Run `pnpm test:independent-core`. Expected: may still fail until Task 3 is also extracted.

### Task 3: Extract Card Import Diagnostics Renderer

**Files:**
- Create: `src/independent-chat/ui/card-import-diagnostics.ts`
- Modify: `src/independent-chat/ui/app.ts`

- [ ] **Step 1: Create pure diagnostics renderer**

Create a module that exports `renderCardImportDiagnostics(character, candidates)`.

- [ ] **Step 2: Replace local app renderer**

Remove the local diagnostics function from `app.ts` and import the new module.

- [ ] **Step 3: Verify focused test**

Run `pnpm test:independent-core`. Expected: pass.

### Task 4: Full Verification and Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run checks**

Run:

```powershell
pnpm test:independent-core
pnpm typecheck:independent
pnpm build
```

Expected: tests and typecheck pass; build succeeds with only existing size warnings.

- [ ] **Step 2: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-06-13-ui-render-helper-extraction.md scripts/test-independent-core.ts src/independent-chat/ui/app.ts src/independent-chat/ui/first-run-guide.ts src/independent-chat/ui/card-import-diagnostics.ts
git commit -m "refactor: extract v1 render helpers"
```
