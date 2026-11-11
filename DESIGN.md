# PalTavern Design System

## Theme

PalTavern looks like a clean messaging app (think iMessage or Telegram). Decoration stays behind the task. Light and dark themes are supported, and the user picks in Settings → Appearance: follow the system, always light, or always dark.

Phones and tablets (`html[data-compact-ui]`) use the chat-app layer in `styles-mobile.css`. The desktop layout keeps its own three-pane look; the shared `styles-appearance.css` layer (accent presets, appearance controls, motion layers) applies to every layout.

## Color

- Accent is user-selectable. Six presets, each with fixed light and dark values (no `color-mix`, for old Android WebViews):

  | Preset | Light | Dark |
  |---|---|---|
  | Teal (default, unchanged from before) | `#087f72` | `#4bc5b4` |
  | Sky | `#1769c2` | `#5aa9f0` |
  | Terracotta | `#b4512d` | `#e88a65` |
  | Sakura | `#bf3f6d` | `#f08cb0` |
  | Lavender | `#6750c4` | `#a796f2` |
  | Graphite | `#2f3438` | `#d9dee2` |

- Each preset sets `--accent`, `--accent-strong`, `--accent-soft`, `--accent-ink`, `--on-accent` and the user bubble color through `<html data-accent>`.
- Accent is only for primary buttons, the user's own bubbles, unread counts, the selected item, switches and links.
- Phone surfaces: list pages are plain white (near-black in dark mode); grouped pages (Settings, character status) use a light gray page with white rounded groups and no borders or shadows.
- Rows are separated by hairlines indented to the right of the avatar, not by cards.
- Two levels of gray text only (`--c-text-2`, `--c-text-3`).
- Danger uses a separate semantic red only for destructive actions.

## Typography

- Family: `system-ui, -apple-system, "PingFang SC", "Noto Sans CJK SC", "Noto Sans SC", "Microsoft YaHei UI", "Microsoft YaHei", sans-serif` so Android, iOS and Windows each get a native CJK face.
- Phone sizes: large page title 28/700, detail top bar 17/600, list names 16/600, body 15–16, captions 13.
- Desktop keeps restrained fixed sizes with modest weight contrast.

## Shape

- Phone cells and grouped sections: 14px radius (`--radius-cell`).
- Bottom sheets: 14px top corners with a grabber.
- Avatars are circles: 52px in lists, 32px beside chat bubbles. Without an uploaded image the soft tone from `avatarToneAttribute` is used.
- Desktop controls keep 10px radius and panels 14px.

## Elevation

- Grouping uses spacing, surface contrast and hairlines.
- Sticky headers and footers use a translucent bar with blur, always over an opaque fallback color.
- Only transient overlays (sheets, menus, dialogs) get a soft shadow.

## Layout

- Phone: five tabs (Messages, Characters, World, Moments, Settings) in a full-width bottom bar. The active tab turns accent and a small pill slides behind its icon.
- Tab home pages: large title on the left, icon buttons on the right. Detail pages: back, centered title, optional action on the right.
- Settings and detail pages stay full pages; only transient dialogs (confirmations, long-press menus, stickers, import pickers, identity and world pickers, onboarding) become bottom sheets.
- Desktop: rail, list pane and task area; settings use a stable navigation column and scrollable content.

## Components

- Primary button: solid accent fill with `--on-accent` text.
- Secondary button: soft accent tint.
- Destructive button: semantic red.
- Form controls: 44px minimum height, clear label, visible focus ring.
- Messages: character bubbles light gray on the left, the user's bubbles in accent on the right. The user's own avatar is hidden unless the user is speaking as an authored character. Group chats show the speaker's name inside character bubbles.
- Segmented controls: gray track with a sliding thumb (character Status/Settings, world Events/Relationships/Timeline).
- Empty states: short instructional text, no decorative cards.

## Motion

One continuous ("single take") motion language across the whole app: what you tapped becomes the next screen, and going back returns along the same path. Bars that do not change (bottom bar, top bars) stay still; only content moves. The engine lives in `src/independent-chat/ui/motion.ts`.

- Durations: fast 160ms, standard 280ms, emphasized 380ms, exits 200ms.
- Curves: decelerate `cubic-bezier(0.05, 0.7, 0.1, 1)` for entering, accelerate `cubic-bezier(0.3, 0, 0.8, 0.15)` for leaving, standard `cubic-bezier(0.2, 0, 0, 1)` otherwise.
- Five building blocks:
  - Shared element flight: avatars, names and selection indicators fly from their old box to the new one (`data-morph`).
  - Container grow/shrink: the tapped row, card or button grows into the next page or overlay and shrinks back on return.
  - Same-axis push: sibling content slides along one axis (tabs and segments horizontally, the desktop rail vertically).
  - List reflow: remaining items glide to their new place, removed items fold away.
  - In-place fade: counts, status text, accent and theme changes. Changing the accent spreads from the tapped swatch.
- Only `transform`, `opacity` and `clip-path` are animated, through Web Animations. Layout boxes are never animated.
- The new screen renders immediately; animations never delay rendering, steal focus, clear drafts or close the keyboard. Background refreshes never trigger page-level motion.
- A new page-level motion first finishes the previous one and removes its layers, so rapid taps never leave ghosts behind.
- Settings → Appearance → Motion offers Full and Reduced. Reduced (and the system "reduce motion" preference) keeps only a short cross-fade.
- Press feedback: list rows get a light background tint; round icon buttons shrink slightly (scale about 0.92) while pressed.

## Accessibility

- Target WCAG AA contrast in every accent preset, light and dark.
- Focus-visible rings appear on all interactive controls.
- Touch targets are at least 44px on narrow screens.
- Motion layers are `pointer-events: none` and `aria-hidden`.
- State is communicated through text and structure, not color alone.
