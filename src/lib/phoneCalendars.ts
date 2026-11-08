// The calendars on your phone, connected to sheep. One permission prompt and
// sheep can read every calendar the phone has: iCloud, and any Google,
// Outlook or work account added in the phone's settings. You pick which ones
// count; sheep reads their events for a window of days and saves them as
// your connected calendars (sync_device_calendars), private to you.
//
// It syncs when you connect, when you change which calendars count, and
// whenever the app comes back to the front (at most every 15 minutes). A
// calendar not synced for a day counts as "unknown" in free-time
// suggestions (see availability.ts), never as free.
//
// Sheep only reads: it never adds, changes or deletes anything on the phone.
// Not on web, where there's no phone calendar to read.
//
// Demo mode keeps everything on the device instead of the server, so it can
// be tried without an account: real phone calendars on a phone, a few
// pretend ones in a browser.

import { useEffect, useState } from 'react';
import { AppState, Linking, Platform } from 'react-native';
import * as Cal from 'expo-calendar/legacy';
import { supabase } from './supabase';
import { CalendarConnection, CalendarOccurrence } from '../types';
import { addDays, dateKey, wallTime } from '../screens/calendar/dates';

export const phoneCalendarsSupported = Platform.OS !== 'web';

/** A calendar on the phone, before or after it's connected. */
export interface PhoneCalendar {
  id: string;
  name: string;
  /** The account it belongs to: "iCloud", "jordan@gmail.com"… */
  account: string;
  color: string;
  /** Worth counting by default: not birthdays or holidays. */
  suggested: boolean;
}

export type CalendarAccess = 'granted' | 'ask' | 'blocked';

/** How far back and ahead each sync reads. */
export const SYNC_PAST_DAYS = 7;
export const SYNC_AHEAD_DAYS = 90;
/** Coming back to the app syncs again once the last sync is older than this. */
export const RESYNC_AFTER_MS = 15 * 60 * 1000;

// ─── The store: your connected calendars and their events ───────────────────

interface State {
  demo: boolean;
  loaded: boolean;
  connections: CalendarConnection[];
  /** Your synced events in the window, newest sync. Only ever yours. */
  items: CalendarOccurrence[];
  syncing: boolean;
  error: string | null;
}

let state: State = { demo: false, loaded: false, connections: [], items: [], syncing: false, error: null };
const subscribers = new Set<(s: State) => void>();
function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  subscribers.forEach(fn => fn(state));
}

/** Connected calendars and their events, shared across screens. */
export function useConnectedCalendars(demo: boolean) {
  const [value, setValue] = useState(state);
  useEffect(() => {
    subscribers.add(setValue);
    if (state.demo !== demo) set({ demo, loaded: false, connections: [], items: [], error: null });
    if (!state.loaded) refreshConnected();
    setValue(state);
    return () => { subscribers.delete(setValue); };
  }, [demo]);
  return value;
}

/** Load your connections and synced events from the server (not in demo, where they live here). */
export async function refreshConnected() {
  if (state.demo) { set({ loaded: true }); return; }
  const from = new Date(Date.now() - SYNC_PAST_DAYS * 86400000).toISOString();
  const [{ data: conns, error }, { data: occ }] = await Promise.all([
    supabase.from('calendar_connections').select('*').order('created_at'),
    supabase.from('calendar_occurrences').select('*').gte('end_at', from).neq('busy_status', 'free').order('start_at').limit(5000),
  ]);
  set({ loaded: true, connections: (conns ?? []) as CalendarConnection[], items: (occ ?? []) as CalendarOccurrence[], error: error?.message ?? null });
}

// ─── The phone ───────────────────────────────────────────────────────────────

export async function calendarAccess(): Promise<CalendarAccess> {
  if (!phoneCalendarsSupported) return 'blocked';
  const p = await Cal.getCalendarPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
}

/** Ask for access, or open Settings when it was turned off and can't be asked again. */
export async function askCalendarAccess(current: CalendarAccess): Promise<CalendarAccess> {
  if (current === 'blocked') { Linking.openSettings(); return 'blocked'; }
  const p = await Cal.requestCalendarPermissionsAsync();
  return p.granted ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';
}

const isBirthdayOrHoliday = (c: { title: string; type?: string }) =>
  c.type === 'birthdays' || /holiday|birthday/i.test(c.title);

/** The phone's event calendars, by account then name. */
export async function listPhoneCalendars(): Promise<PhoneCalendar[]> {
  const cals = await Cal.getCalendarsAsync(Cal.EntityTypes.EVENT);
  return cals
    .filter(c => c.isVisible !== false)
    .map(c => ({
      id: c.id,
      name: c.title || 'Calendar',
      account: c.source?.name || c.ownerAccount || 'On this phone',
      color: c.color || '#8E8E93',
      suggested: !isBirthdayOrHoliday({ title: c.title ?? '', type: c.type as string | undefined }),
    }))
    .sort((a, b) => a.account.localeCompare(b.account) || a.name.localeCompare(b.name));
}

interface SyncEvent { id: string; start: string; end: string; all_day: boolean; tz: string | null; busy: CalendarOccurrence['busy_status']; title: string | null }

const busyOf = (a?: string): CalendarOccurrence['busy_status'] =>
  a === 'free' ? 'free' : a === 'tentative' ? 'tentative' : a === 'unavailable' ? 'out_of_office' : 'busy';

/** The window a sync covers: a week back to 90 days ahead, from local midnight. */
function syncWindow() {
  const today = dateKey(new Date());
  return {
    from: new Date(wallTime(addDays(today, -SYNC_PAST_DAYS), 0)),
    to: new Date(wallTime(addDays(today, SYNC_AHEAD_DAYS), 0)),
  };
}

/** Each calendar's events in the window, ready to save. Cancelled ones are left out. */
async function readPhoneEvents(cals: PhoneCalendar[], from: Date, to: Date): Promise<Map<string, SyncEvent[]>> {
  const byCal = new Map<string, SyncEvent[]>(cals.map(c => [c.id, []]));
  if (!cals.length) return byCal;
  const events = await Cal.getEventsAsync(cals.map(c => c.id), from, to);
  events.forEach(e => {
    if ((e.status as string) === 'canceled' || (e.status as string) === 'cancelled') return;
    const start = new Date(e.startDate), end = new Date(e.endDate);
    if (!(end > start)) return;
    byCal.get(e.calendarId)?.push({
      id: String(e.instanceId ?? e.id),
      start: start.toISOString(),
      end: end.toISOString(),
      all_day: !!e.allDay,
      tz: e.timeZone || null,
      busy: busyOf(e.availability as string),
      title: e.title?.trim() || null,
    });
  });
  return byCal;
}

/**
 * Sync these phone calendars now: read their events and save them. In demo
 * they're kept here instead. Calendars already connected but not passed are
 * left as they are (turn one off with disconnectCalendar).
 */
export async function syncPhoneCalendars(cals: PhoneCalendar[]): Promise<boolean> {
  if (state.syncing) return false;
  set({ syncing: true, error: null });
  try {
    const { from, to } = syncWindow();
    const byCal = state.demo && !phoneCalendarsSupported ? pretendEvents(cals) : await readPhoneEvents(cals, from, to);
    if (state.demo) {
      keepLocally(cals, byCal, from, to);
    } else {
      const payload = cals.map(c => ({ id: c.id, name: c.name, account: c.account, events: byCal.get(c.id) ?? [] }));
      const { error } = await supabase.rpc('sync_device_calendars' as any, { p_calendars: payload, p_from: from.toISOString(), p_to: to.toISOString() } as any);
      if (error) throw new Error(error.message);
      await refreshConnected();
    }
    set({ syncing: false });
    return true;
  } catch (e: any) {
    set({ syncing: false, error: e?.message ?? 'Couldn’t sync your calendars' });
    return false;
  }
}

/** Stop using a calendar: its connection and everything copied from it go. */
export async function disconnectCalendar(connectionId: string): Promise<boolean> {
  if (state.demo) {
    set({ connections: state.connections.filter(c => c.id !== connectionId), items: state.items.filter(i => i.connection_id !== connectionId) });
    return true;
  }
  const { error } = await supabase.from('calendar_connections').delete().eq('id', connectionId);
  if (error) { set({ error: error.message }); return false; }
  await refreshConnected();
  return true;
}

/**
 * Coming back to the app: sync this phone's connected calendars again if the
 * last sync is old enough. Quiet: no prompts, nothing if access was turned off.
 */
export async function autoSyncPhoneCalendars() {
  if (!phoneCalendarsSupported || state.syncing) return;
  if (!state.loaded) await refreshConnected();
  const mine = state.connections.filter(c => c.provider === 'device');
  if (!mine.length) return;
  const oldest = Math.min(...mine.map(c => (c.last_synced_at ? new Date(c.last_synced_at).getTime() : 0)));
  if (Date.now() - oldest < RESYNC_AFTER_MS) return;
  if ((await calendarAccess()) !== 'granted') return;
  const onPhone = await listPhoneCalendars();
  const connected = onPhone.filter(p => mine.some(c => c.remote_calendar_id === p.id));
  if (connected.length) await syncPhoneCalendars(connected);
}

/** Keep this phone's connected calendars fresh: on start and each time the app comes back. */
export function usePhoneCalendarSync(demo: boolean) {
  useConnectedCalendars(demo);
  useEffect(() => {
    if (!phoneCalendarsSupported) return;
    autoSyncPhoneCalendars();
    const sub = AppState.addEventListener('change', s => { if (s === 'active') autoSyncPhoneCalendars(); });
    return () => sub.remove();
  }, [demo]);
}

// ─── Demo: kept on the device ────────────────────────────────────────────────

function keepLocally(cals: PhoneCalendar[], byCal: Map<string, SyncEvent[]>, from: Date, to: Date) {
  const now = new Date().toISOString();
  const keep = state.connections.filter(c => !cals.some(p => p.id === c.remote_calendar_id));
  const conns: CalendarConnection[] = cals.map(p => ({
    id: `demo-${p.id}`, user_id: 'demo', provider: 'device', remote_calendar_id: p.id, calendar_name: p.name,
    account_label: p.account, permissions: 'read', sync_status: 'ok', include_in_availability: true,
    synced_from: from.toISOString(), synced_to: to.toISOString(), last_synced_at: now, last_error: null, created_at: now,
  }));
  const ids = new Set(conns.map(c => c.id));
  const items: CalendarOccurrence[] = conns.flatMap(conn => (byCal.get(conn.remote_calendar_id) ?? [])
    .filter(e => e.busy !== 'free')
    .map(e => ({
      id: `${conn.id}-${e.id}-${e.start}`, connection_id: conn.id, owner_user_id: 'demo', source: 'device' as const,
      external_id: e.id, start_at: e.start, end_at: e.end, all_day: e.all_day, timezone: e.tz, busy_status: e.busy,
      visibility: 'default' as const, title: e.title, description: null, sheep_event_id: null, updated_at: now,
    })));
  set({
    connections: [...keep, ...conns],
    items: [...state.items.filter(i => !ids.has(i.connection_id)), ...items].sort((a, b) => a.start_at.localeCompare(b.start_at)),
  });
}

/** A browser has no phone calendars; the demo pretends a few. */
export const PRETEND_PHONE_CALENDARS: PhoneCalendar[] = [
  { id: 'p-home', name: 'Home', account: 'iCloud', color: '#34C759', suggested: true },
  { id: 'p-family', name: 'Family', account: 'iCloud', color: '#FF9500', suggested: true },
  { id: 'p-work', name: 'Work', account: 'jordan@work.example', color: '#007AFF', suggested: true },
  { id: 'p-birthdays', name: 'Birthdays', account: 'Other', color: '#8E8E93', suggested: false },
];

function pretendEvents(cals: PhoneCalendar[]): Map<string, SyncEvent[]> {
  const today = dateKey(new Date());
  const at = (day: number, h: number, m = 0) => new Date(wallTime(addDays(today, day), h * 60 + m)).toISOString();
  const allDay = (day: number, days = 1) => ({ start: new Date(wallTime(addDays(today, day), 0)).toISOString(), end: new Date(wallTime(addDays(today, day + days), 0)).toISOString() });
  const all: Record<string, Omit<SyncEvent, 'tz'>[]> = {
    'p-home': [
      { id: 'h1', start: at(0, 9), end: at(0, 10), all_day: false, busy: 'busy', title: 'Dentist' },
      { id: 'h2', start: at(2, 18, 30), end: at(2, 20), all_day: false, busy: 'busy', title: 'Yoga' },
      { id: 'h3', ...allDay(5, 2), all_day: true, busy: 'busy', title: 'Weekend in Tahoe' },
    ],
    'p-family': [{ id: 'f1', start: at(1, 17), end: at(1, 18), all_day: false, busy: 'busy', title: 'Pick up Maya' }],
    'p-work': [
      { id: 'w1', start: at(0, 13), end: at(0, 14), all_day: false, busy: 'busy', title: 'Team sync' },
      { id: 'w2', start: at(1, 12), end: at(1, 13), all_day: false, busy: 'tentative', title: 'Lunch with Sam' },
    ],
    'p-birthdays': [{ id: 'b1', ...allDay(3), all_day: true, busy: 'free', title: 'Ben’s birthday' }],
  };
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return new Map(cals.map(c => [c.id, (all[c.id] ?? []).map(e => ({ ...e, tz }))]));
}

/** In demo on web, the pretend list stands in for the phone. */
export async function phoneCalendarsFor(demo: boolean): Promise<PhoneCalendar[]> {
  if (!phoneCalendarsSupported) return demo ? PRETEND_PHONE_CALENDARS : [];
  return listPhoneCalendars();
}

export { itemsOnDay } from './calendarItems';
