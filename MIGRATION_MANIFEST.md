# PalTavern Migration Manifest

Source: `D:\tavern_helper_template-main`

Target: `D:\PalTavern`

Copied as PalTavern project material:

- Root config: `package.json`, `pnpm-lock.yaml`, TypeScript, Webpack, Capacitor, Electron, ESLint, PostCSS and formatting config.
- App source: `src/independent-chat`.
- Platform shells: `android`, `desktop`.
- Project assets and documentation: `assets`, `docs`, selected `outputs`, selected `release` files.
- Type declarations: `@types`, root `*.d.ts`.
- Agent/project instructions: `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.cursor/rules`.

Intentionally excluded:

- `.git`, `node_modules`, `dist`.
- `src/local-phone`, `src/tavern-phone-assistant`, `src/tavern-phone-script`, `src/关系档案界面`.
- xiaoxi/local-phone/template scripts.
- `.paltavern-migration-*`, backups, temp logs, old workspace zip files, Android/Gradle build output caches.

