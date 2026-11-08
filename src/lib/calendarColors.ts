// Color coding, like Apple and Google Calendar, if you want it: by calendar
// (each group gets a color), by category (Meals, Outdoors…, which you file
// events under), or one color (the olive look). By category, an event you
// haven't filed falls back to its calendar's color, so it's calendar and/or
// category.
//
// Colors are yours alone: they never change anyone else's calendar. They're
// all chosen in one place, You → Calendar colors; an event only says which
// category it's in. Pure rules here; the store is calendarColorsStore.

export type ColorMode = 'none' | 'calendar' | 'category';

export interface EventCategory {
  id: string;
  name: string;
  color: string;
}

export interface CalendarColorPrefs {
  mode: ColorMode;
  calendars: Record<string, string>;   // group id → color
  categories: EventCategory[];
  assigned: Record<string, string>;    // event key (series id or id) → category id
}

/** Muted, so a colored calendar still feels like the app: readable on cream and in dark mode. */
export const PALETTE: { color: string; name: string }[] = [
  { color: '#56653F', name: 'Olive' },
  { color: '#6E9B5B', name: 'Sage' },
  { color: '#3D8B86', name: 'Teal' },
  { color: '#4C7FA8', name: 'Sky' },
  { color: '#85588F', name: 'Plum' },
  { color: '#C2566E', name: 'Rose' },
  { color: '#C0663F', name: 'Clay' },
  { color: '#C49A1E', name: 'Mustard' },
  { color: '#8A8178', name: 'Stone' },
];

export const colorName = (color: string) => PALETTE.find(p => p.color.toLowerCase() === color.toLowerCase())?.name ?? 'Custom';

/** A few to start from; anyone can rename, recolor, or delete them. */
export const STARTER_CATEGORIES: EventCategory[] = [
  { id: 'cat-meals', name: 'Meals', color: '#C0663F' },
  { id: 'cat-outdoors', name: 'Outdoors', color: '#6E9B5B' },
  { id: 'cat-games', name: 'Games & fun', color: '#85588F' },
  { id: 'cat-errands', name: 'Errands', color: '#8A8178' },
];

export const DEFAULT_PREFS: CalendarColorPrefs = { mode: 'none', calendars: {}, categories: STARTER_CATEGORIES, assigned: {} };

/** Plans with people but no group (say, just you and Fran) are on your Personal calendar. */
export const PERSONAL = 'personal';
const PERSONAL_DEFAULT = '#C2566E';   // Rose, apart from the groups' greens and blues

/** A calendar's color: the one you chose, else one from the palette by its place in your list. */
export function calendarColor(groupId: string | null | undefined, prefs: CalendarColorPrefs, order: string[], own?: string | null): string {
  if (!groupId) return prefs.calendars[PERSONAL] ?? PERSONAL_DEFAULT;
  if (prefs.calendars[groupId]) return prefs.calendars[groupId];
  // The group's own background (Edit Group), unless you picked a color for it.
  if (own) return own;
  // Olive is the app's own color, so calendars start from the next one.
  const i = order.indexOf(groupId);
  return PALETTE[((i < 0 ? 0 : i) + 1) % PALETTE.length].color;
}

/** The category an event is filed under, if it still exists. */
export function categoryFor(key: string | null | undefined, prefs: CalendarColorPrefs): EventCategory | null {
  const id = key ? prefs.assigned[key] : undefined;
  return (id && prefs.categories.find(c => c.id === id)) || null;
}

/** An event's color, or null for the one-color look. */
export function colorFor(
  item: { groupId: string | null | undefined; key: string | null | undefined; own?: string | null },
  prefs: CalendarColorPrefs,
  order: string[],
): string | null {
  if (prefs.mode === 'none') return null;
  if (prefs.mode === 'category') {
    const cat = categoryFor(item.key, prefs);
    if (cat) return cat.color;
  }
  return calendarColor(item.groupId, prefs, order, item.own);
}

/** A color at some opacity, for fills behind text. */
export function tintOf(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map(ch => ch + ch).join('') : h;
  const n = parseInt(full, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}
