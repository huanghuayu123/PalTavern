# Double Pass Review

The user asked for a loop like this:

1. Organize the project for another AI.
2. Return to the current source version and do the understanding pass again.
3. Compare both meanings.
4. If meanings differ, repeat until the handoff is stable.

This file records that check for snapshot `7778b57`.

## Pass 1: Source-To-Map

Pass 1 read the source tree as a module map:

- `index.ts` is the boot entry.
- `ui/app.ts` is the current UI shell and controller.
- `styles.css` is a historical layered stylesheet.
- `core/types.ts` defines persisted shape.
- `core/state.ts` owns defaults, normalization, persistence, active selectors, communication identity, and private conversation selection.
- Feature modules already exist for chat, group chat, moments, world events, model calls, prompt presets, memory, character cards, authoring, scheduler, backup, platform helpers, and weather.

Pass 1 conclusion:

The main problem is not missing modules. The main problem is that UI rendering, UI session protection, DOM binding, and CSS overrides are still too concentrated.

## Pass 2: Behavior-To-Risk

Pass 2 re-read the same source snapshot from behavior rules instead of file names:

- Inputs are fragile because render calls can happen from many places.
- Communication identity is subtle because it affects private chat, group chat, and moments, but not world RP.
- Private chat and group chat intentionally differ: private records are actor-target scoped; group records are world-shared.
- World events, RP, timeline, and memory are intentionally folded under the world page.
- Prompt context can leak if non-chat generation forgets to pass an explicit context.
- CSS is risky because older and newer visual layers coexist, with final guards near the bottom.

Pass 2 conclusion:

The same hotspots appeared, but the wording needed sharper rules around private chat isolation, group chat sharing, and world RP separation.

## Differences Found

### Difference 1: "Messages are shared" was too vague

Pass 1 could be misread as saying all chat records are shared by identity. Pass 2 corrected this:

- Private chat records are isolated by communication actor and target character.
- Group chat records are shared inside the world.

Resolution:

This distinction is now explicit in `AI_HANDOFF.md`, `CODE_MAP.md`, and `SEMANTIC_GUARDRAILS.md`.

### Difference 2: "World identity" could be confused with communication identity

Pass 1 named both systems, but did not make the separation strong enough. Pass 2 corrected this:

- Communication identity controls messages, groups, and moment comments.
- World RP identity remains separate.

Resolution:

The guardrail now says this directly.

### Difference 3: CSS cleanup looked easier than it is

Pass 1 identified `styles.css` as too large. Pass 2 found that the real risk is layered override history.

Resolution:

The CSS section now warns that deleting old-looking blocks can still change behavior, and `REFACTORING_ORDER.md` delays CSS consolidation until renderer splitting makes visual checks easier.

### Difference 4: Tests need meaning-based names

Pass 1 saw the core test as large. Pass 2 clarified why that matters:

- The next AI needs tests that tell it which product rule it is protecting.

Resolution:

`REFACTORING_ORDER.md` now proposes behavior-named test files such as communication identity, input stability, world RP guards, prompt context, and character worldbook tests.

## Current Stable Meaning

After reconciliation, the stable handoff meaning is:

PalTavern has usable feature modules, but the next cleanup should focus on making the UI shell, CSS layers, and state/test guards understandable. The first code refactor should move helpers and page renderers without changing behavior. The most important protected behaviors are input stability, communication identity separation, private/group chat scoping, world RP separation, world event/timeline folding, prompt preset scopes, world/character lore separation, and mobile layout stability.

## Repeat Criteria

Repeat this double-pass process whenever:

- A document changes the meaning of communication identity.
- A document suggests changing private chat or group chat storage.
- A document suggests moving world RP into message identity.
- A CSS cleanup plan claims old layers can be deleted without visual proof.
- A refactor plan skips tests before behavior-moving work.

If a repeat pass finds a meaning difference, update the handoff docs first, then re-run the comparison before code edits.
