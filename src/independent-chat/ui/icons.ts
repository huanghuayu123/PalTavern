export type IconName = 'message' | 'contacts' | 'world' | 'moments' | 'events' | 'timeline' | 'settings' | 'search' | 'send' | 'refresh' | 'import' | 'sticker' | 'add' | 'back';

const ICON_PATHS: Record<IconName, string> = {
  message: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
  contacts: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  world: '<circle cx="12" cy="12" r="9"/><path d="M3.6 9h16.8M3.6 15h16.8"/><path d="M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  moments: '<path d="M12 3v18M3 12h18"/><path d="m5 5 2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/>',
  events: '<rect x="3.5" y="5" width="17" height="16" rx="3"/><path d="M16 3.5v3M8 3.5v3M3.5 10h17"/><path d="M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01"/>',
  timeline: '<path d="M4 5h16M4 12h16M4 19h16"/><circle cx="7" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="17" cy="19" r="1.5"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.09A1.7 1.7 0 0 0 8.94 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3.09 14H3v-4h.09A1.7 1.7 0 0 0 4.6 8.94a1.7 1.7 0 0 0-.34-1.88L4.2 7l2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3.09V3h4v.09A1.7 1.7 0 0 0 15.06 4.6a1.7 1.7 0 0 0 1.88-.34L17 4.2 19.83 7l-.06.06A1.7 1.7 0 0 0 19.4 9c.18.61.75 1.02 1.38 1.02H21v4h-.09A1.7 1.7 0 0 0 19.4 15z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.6-4.5L3 9"/><path d="M3 4v5h5"/><path d="M4 13a8 8 0 0 0 14.6 4.5L21 15"/><path d="M21 20v-5h-5"/>',
  import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  sticker: '<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 10h.01M16 10h.01M8.5 15a5 5 0 0 0 7 0"/><path d="M15 21a6 6 0 0 1 6-6"/>',
  add: '<path d="M12 5v14M5 12h14"/>',
  back: '<path d="M15 18 9 12l6-6"/><path d="M9 12h12"/>',
};

export function icon(name: IconName): string {
  return `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true">${ICON_PATHS[name]}</svg>`;
}
