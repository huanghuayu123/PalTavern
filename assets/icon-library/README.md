# App Icon Library

This folder keeps the approved source artwork for packaging.

- `tavern-social-app-icon-folded-compact.png`: current approved launcher icon source.
- `tavern-social-app-icon-folded-compact-foreground.png`: transparent foreground source for Android adaptive icons.
- `../tavern-social-app-icon.png`: active preview/export file generated from the same folded compact icon.

Android packaging runs `pnpm icons:android` before building, so the folded compact icon is the active launcher icon variant.
