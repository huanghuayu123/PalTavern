# PalTavern Brand Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move user-visible app naming, default prompt naming, and readiness checks to `PalTavern` while preserving legacy compatibility identifiers.

**Architecture:** Treat `Tavern Social` as a legacy internal compatibility name for storage keys, schema ids, package names, native plugin names, and file names. Treat `PalTavern` as the displayed product name in app chrome, Android labels, default prompt labels/content, and local status/check output.

**Tech Stack:** TypeScript independent-chat app, Capacitor Android config, existing Node verification scripts.

---

### Task 1: Add Brand Regression Checks

**Files:**
- Modify: `scripts/test-independent-core.ts`
- Modify: `scripts/test-prompt-presets.ts`
- Modify: `scripts/check-android-background-readiness.mjs`

- [ ] **Step 1: Update the shell branding test**

In `scripts/test-independent-core.ts`, change the visible brand assertion so it expects `<title>PalTavern</title>` and keeps the existing guard that `Tavern Social` does not appear in the app shell.

- [ ] **Step 2: Update prompt preset tests**

In `scripts/test-prompt-presets.ts`, change default preset display-name expectations from `Tavern Social 默认...` to `PalTavern 默认...`, and change built prompt text expectations from `你正在 Tavern Social...` / `Tavern Social 运行格式保护` to `PalTavern...`.

- [ ] **Step 3: Update Android readiness expectations**

In `scripts/check-android-background-readiness.mjs`, assert `capacitor.config.json` appName and Android launcher labels are `PalTavern`.

- [ ] **Step 4: Run the focused tests and confirm they fail before implementation**

Run:

```powershell
pnpm test:independent-core
pnpm test:prompt-presets
pnpm android:check
```

Expected before implementation: at least one brand expectation fails.

### Task 2: Update Product-Facing Brand Copy

**Files:**
- Modify: `src/independent-chat/index.html`
- Modify: `capacitor.config.json`
- Modify: `android/app/src/main/res/values/strings.xml`
- Modify: `src/independent-chat/ui/authoring-ui.ts`
- Modify: `src/independent-chat/ui/app.ts`

- [ ] **Step 1: Change app title and native labels**

Set the browser title, Capacitor `appName`, Android `app_name`, and Android `title_activity_main` to `PalTavern`.

- [ ] **Step 2: Change settings/status copy**

Replace user-facing `Tavern Social 默认...` restore confirmation/status text with `PalTavern 默认...`. Replace the authoring helper sentence that says “创建为 Tavern Social 联系人” with “创建为 PalTavern 联系人”.

- [ ] **Step 3: Keep compatibility identifiers unchanged**

Do not rename `tavern-social-*` localStorage keys, backup schema, backup file names, native plugin names, Java package names, or preset ids/source filenames.

### Task 3: Update Model-Facing Default Brand Copy

**Files:**
- Modify: `src/independent-chat/model/prompt-presets.ts`
- Modify: `src/independent-chat/model/client.ts`
- Modify: `src/independent-chat/model/reply-strategy.ts`
- Modify: `src/independent-chat/chat/group-chat.ts`
- Modify: `src/independent-chat/social/events.ts`

- [ ] **Step 1: Rename default prompt preset names**

Set default prompt display names to `PalTavern 默认回复策略`, `PalTavern 默认群聊策略`, and `PalTavern 默认世界 RP 策略`.

- [ ] **Step 2: Replace model instruction brand text**

Replace model-facing sentences that say `Tavern Social` with `PalTavern`, including private chat guardrails, group chat identity, world/event assistant roles, and reply-strategy generation.

- [ ] **Step 3: Keep exported compatibility metadata unchanged**

Do not rename exported `tavern_social` extensions or `TAVERN_SOCIAL_*` constant names in this pass.

### Task 4: Verify and Commit

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run focused checks**

Run:

```powershell
pnpm test:independent-core
pnpm test:prompt-presets
pnpm android:check
```

Expected: all pass.

- [ ] **Step 2: Run broad checks**

Run:

```powershell
pnpm typecheck:independent
pnpm build
```

Expected: typecheck passes and build succeeds; existing webpack size warnings are acceptable.

- [ ] **Step 3: Commit**

Run:

```powershell
git add docs/superpowers/plans/2026-06-13-paltavern-brand-consistency.md scripts/test-independent-core.ts scripts/test-prompt-presets.ts scripts/check-android-background-readiness.mjs src/independent-chat/index.html capacitor.config.json android/app/src/main/res/values/strings.xml src/independent-chat/ui/authoring-ui.ts src/independent-chat/ui/app.ts src/independent-chat/model/prompt-presets.ts src/independent-chat/model/client.ts src/independent-chat/model/reply-strategy.ts src/independent-chat/chat/group-chat.ts src/independent-chat/social/events.ts
git commit -m "feat: align visible brand copy"
```
