# AI Handoff Code Organization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make PalTavern understandable to another AI before any large refactor by adding an entry handoff, code map, semantic guardrails, refactoring order, and double-pass review record.

**Architecture:** This is a documentation-first cleanup. It does not move runtime code. It records the current source meaning, then compares a second behavior-oriented read against the first map and reconciles wording differences.

**Tech Stack:** Markdown docs, existing TypeScript source in `src/independent-chat`, PowerShell verification, existing pnpm scripts.

---

### Task 1: Add AI handoff entry point

**Files:**
- Create: `docs/AI_HANDOFF.md`

- [ ] **Step 1: Write the handoff entry**

Create `docs/AI_HANDOFF.md` with these required sections:

```markdown
# PalTavern AI Handoff

Snapshot: `7778b57` on branch `codex/world-ui-followups`.

Read this file first when another AI or engineer takes over this project.
```

Include product shape, current code reality, rules that must not be broken, recommended next step, verification commands, and double-pass review pointers.

- [ ] **Step 2: Verify the file exists**

Run:

```powershell
Test-Path docs\AI_HANDOFF.md
```

Expected: `True`

### Task 2: Add source-grounded code map

**Files:**
- Create: `docs/ai-handoff/CODE_MAP.md`

- [ ] **Step 1: Write the map from current source**

Create `docs/ai-handoff/CODE_MAP.md`.

It must cover:

- Boot flow.
- Core data.
- UI shell.
- Styles.
- Chat.
- Social and world.
- Memory.
- Model and prompts.
- Characters.
- Platform, data, automation, media.
- Tests and build.

- [ ] **Step 2: Verify important source files are named**

Run:

```powershell
Select-String -Path docs\ai-handoff\CODE_MAP.md -Pattern 'src/independent-chat/ui/app.ts','src/independent-chat/styles.css','src/independent-chat/core/state.ts'
```

Expected: all three paths appear.

### Task 3: Add semantic guardrails

**Files:**
- Create: `docs/ai-handoff/SEMANTIC_GUARDRAILS.md`

- [ ] **Step 1: Write the protected behavior list**

Create `docs/ai-handoff/SEMANTIC_GUARDRAILS.md`.

It must explicitly protect:

- Main navigation.
- Communication identity.
- Private chat scoping.
- Group chat sharing.
- Moments comments.
- World RP, events, and timeline.
- World and character lore.
- Prompt presets.
- Input stability.
- CSS and layout.
- Persistence and migration.
- Verification commands.

- [ ] **Step 2: Verify the high-risk terms are present**

Run:

```powershell
Select-String -Path docs\ai-handoff\SEMANTIC_GUARDRAILS.md -Pattern 'Private chat records are isolated','Group chat records are shared','World RP identity is separate','must not be cleared'
```

Expected: all four phrases appear.

### Task 4: Add refactoring order

**Files:**
- Create: `docs/ai-handoff/REFACTORING_ORDER.md`

- [ ] **Step 1: Write a phase-based cleanup order**

Create `docs/ai-handoff/REFACTORING_ORDER.md`.

It must include these phases in order:

1. Rollback point.
2. Documentation and guards.
3. Split UI helpers before pages.
4. Split page renderers.
5. Split event binding.
6. Consolidate CSS.
7. Split state normalization.
8. Split tests by meaning.

- [ ] **Step 2: Verify CSS is not first**

Run:

```powershell
Select-String -Path docs\ai-handoff\REFACTORING_ORDER.md -Pattern 'Phase 5: Consolidate CSS'
```

Expected: the CSS phase appears after UI helper and renderer phases.

### Task 5: Add double-pass review record

**Files:**
- Create: `docs/ai-handoff/DOUBLE_PASS_REVIEW.md`

- [ ] **Step 1: Record pass 1**

Write the file-name-oriented source map conclusions.

- [ ] **Step 2: Record pass 2**

Write the behavior-risk-oriented conclusions.

- [ ] **Step 3: Record differences and resolutions**

Include at least these reconciled differences:

- Private chat isolation vs group chat sharing.
- Communication identity vs world RP identity.
- CSS size vs CSS override history.
- Large tests vs meaning-named tests.

- [ ] **Step 4: Verify differences are recorded**

Run:

```powershell
Select-String -Path docs\ai-handoff\DOUBLE_PASS_REVIEW.md -Pattern 'Difference 1','Difference 2','Difference 3','Difference 4'
```

Expected: four difference headings appear.

### Task 6: Verify documentation links and source safety

**Files:**
- Check: `docs/AI_HANDOFF.md`
- Check: `docs/ai-handoff/CODE_MAP.md`
- Check: `docs/ai-handoff/SEMANTIC_GUARDRAILS.md`
- Check: `docs/ai-handoff/REFACTORING_ORDER.md`
- Check: `docs/ai-handoff/DOUBLE_PASS_REVIEW.md`

- [ ] **Step 1: Check file list**

Run:

```powershell
Get-ChildItem docs\ai-handoff -File | Select-Object -ExpandProperty Name
```

Expected:

```text
CODE_MAP.md
DOUBLE_PASS_REVIEW.md
REFACTORING_ORDER.md
SEMANTIC_GUARDRAILS.md
```

- [ ] **Step 2: Run source checks**

Run:

```powershell
pnpm typecheck:independent
pnpm build:dev
```

Expected: both exit with code `0`.

- [ ] **Step 3: Check git diff**

Run:

```powershell
git diff -- docs\AI_HANDOFF.md docs\ai-handoff docs\superpowers\plans\2026-06-12-ai-handoff-code-organization.md
```

Expected: only documentation files are changed.
