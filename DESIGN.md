# Tavern Social Design System

## Theme

Tavern Social uses a quiet product interface inspired by mature messaging and desktop tools. Decoration stays behind the task. The application supports light and dark themes through system preference.

## Color

- Accent: `#087f72` in light mode, `#4bc5b4` in dark mode.
- Page: cool neutral gray, never warm paper or beige.
- Content surface: true white in light mode and neutral charcoal in dark mode.
- Accent is reserved for primary actions, active navigation, focus and unread state.
- Danger uses a separate semantic red only for destructive actions.

## Typography

- Family: Segoe UI Variable, Segoe UI, Microsoft YaHei UI, then system sans-serif.
- Product headings use restrained fixed sizes and modest weight contrast.
- Body copy uses 13 to 14px with comfortable line height.
- Section kickers are omitted from settings surfaces to reduce repeated labels.

## Shape

- Controls: 10px radius.
- Panels: 14px radius.
- Avatars: 12px radius.
- Pills are reserved for counters and compact status.
- Large 24 to 32px card radii are not part of the system.

## Elevation

- Most grouping uses spacing, surface contrast and dividers.
- Cards do not combine wide shadows with borders.
- Small shadows are limited to selected tabs and transient overlays.
- The settings window is the only prominent elevated container.

## Layout

- Desktop uses a fixed contact sidebar and flexible task area.
- Settings use a stable navigation column and scrollable content panel.
- The writing studio uses two columns on desktop and one column on mobile.
- Mobile navigation is a full-width bottom bar rather than a floating dock.

## Components

- Primary button: solid accent fill with white text.
- Secondary button: neutral surface with a visible border.
- Destructive button: semantic red tint and label.
- Form controls: 44px minimum height, clear label, visible focus ring and readable placeholder.
- Messages: compact bubbles with one squared conversational corner.
- Empty states: instructional content without decorative glass cards.

## Motion

- State transitions run for approximately 160ms with an ease-out curve.
- Active press moves by one pixel.
- No decorative page-load animation.
- Reduced-motion preference effectively disables transitions and animations.

## Accessibility

- Target WCAG AA contrast.
- Focus-visible rings appear on all interactive controls.
- Touch targets are at least 44px on narrow screens.
- State is communicated through text and structure, not color alone.
