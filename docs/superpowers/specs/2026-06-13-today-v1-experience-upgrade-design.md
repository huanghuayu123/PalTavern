# Today v1 Experience Upgrade Design

## Goal

Ship the most useful parts of the selected improvement and feature list today, with every shipped item reachable from the app and covered by focused verification.

## Scope

The release is a v1 pass, not the final form of every system. It prioritizes user-visible clarity, safety, and workflow continuity:

- First-run guidance: show a clear next-step path for connecting a model, importing or creating a character, and starting a chat.
- Backup safety: prevent model credentials from being included in exported backups by default, and warn users before export.
- Moments cleanup: make destructive deletion confirmable/undoable and move heavier comment operations out of the always-visible feed.
- Mobile authoring polish: prevent the writing-card progress UI from squeezing or causing horizontal scrolling.
- Brand consistency: use `PalTavern` in user-facing copy, keeping old schema names only for compatibility.
- Memory inbox: surface pending memory suggestions as a review queue with edit, accept, and dismiss actions.
- World continuation dashboard: show active world continuation prompts based on current events, timeline entries, memories, and characters.
- Relationship map v1: provide a readable relationship overview as grouped cards/list rows rather than a complex drag canvas.
- Moment detail v1: allow opening a single moment detail surface for comments and advanced role interactions.
- Context previewer v1: expose a readable summary of the context that will be sent to the model before generation paths where this is safe.
- Character import assistant v1: after card import, show recognized fields, missing fields, and recommended next steps.
- Chapter/scene v1: add lightweight long-RP chapters/scenes that can be created, switched, ended, and summarized.
- UI/CSS cleanup: split only files touched for the above work when it reduces risk or makes tests clearer.

## Non-Goals

- No cloud backup, sync, accounts, or multi-device state.
- No force-directed or drag-and-drop relationship graph.
- No full UI framework rewrite.
- No migration that breaks existing `tavern-social-backup-v1` backups.
- No hidden transmission of API keys or chat content outside the user's configured model call path.

## Design

### First-Run Guidance

The home screen should detect whether the user has a usable model connection and at least one usable character. When either is missing, it shows a compact setup guide with three steps: connect model, import/create character, start chatting. Each step links to the relevant existing view instead of creating a separate onboarding mode.

### Backup Safety

Backup export should create a sanitized copy of the application state. Model connection secrets are removed from the exported state by default. The UI copy should explicitly say that local chats and characters are included, while API keys are not included.

### Moments

The feed stays readable. Delete requires confirmation and then offers an undo window. Advanced comment controls move behind a detail view or expanded actions so the main feed does not look like an operations console.

### World, Memory, Relationships

The world page becomes the hub for "what can continue next." Memory suggestions are reviewed in an inbox. Character relationships are displayed as readable relationship cards grouped by world. The first implementation uses existing relationship records and pending suggestions.

### Creation Tools

Context preview, import assistant, and chapters are lightweight v1 tools. They should reuse current state and rendering patterns, avoid new dependencies, and prefer clear text summaries over complex editors.

## Data and Compatibility

Any new persisted data must be optional and migration-safe. Existing states with no chapter, scene, import-assistant, or onboarding fields should load normally. Existing backup schema names remain accepted. User-facing labels move toward `PalTavern`.

## Testing

Add focused tests before implementation for backup sanitization, moment delete/undo behavior, chapter state operations, and any new pure helpers. Then run the relevant independent-chat tests, typecheck, build, UI detector, and browser checks for desktop and mobile widths.
