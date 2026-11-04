// Your calendar colors (see calendarColors for the rules), on this device and
// shared by every screen: change them in You and the calendar follows at once.
// Categories you made before colors existed carry over.

import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarColorPrefs, ColorMode, DEFAULT_PREFS, EventCategory } from './calendarColors';

const KEY = 'calendar_colors:v1';
const OLD_CATEGORIES_KEY = 'event_categories';

let current: CalendarColorPrefs = DEFAULT_PREFS;
let loaded = false;
const listeners = new Set<(p: CalendarColorPrefs) => void>();

function set(next: CalendarColorPrefs) {
  current = next;
  listeners.forEach(fn => fn(next));
  AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
}

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      current = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as CalendarColorPrefs) };
    } else {
      const old = await AsyncStorage.getItem(OLD_CATEGORIES_KEY);
      const cats = old ? (JSON.parse(old) as EventCategory[]) : null;
      current = { ...DEFAULT_PREFS, categories: cats?.length ? cats : DEFAULT_PREFS.categories };
    }
    listeners.forEach(fn => fn(current));
  } catch { /* keep the defaults */ }
}

export function useCalendarColors() {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => {
    listeners.add(setPrefs);
    setPrefs(current);
    load();
    return () => { listeners.delete(setPrefs); };
  }, []);

  return {
    prefs,
    setMode: (mode: ColorMode) => set({ ...current, mode }),
    setCalendarColor: (groupId: string, color: string) => set({ ...current, calendars: { ...current.calendars, [groupId]: color } }),
    addCategory: (name: string, color: string) => {
      const cat = { id: `cat-${Date.now()}`, name: name.trim(), color };
      set({ ...current, categories: [...current.categories, cat] });
      return cat;
    },
    setCategoryColor: (id: string, color: string) =>
      set({ ...current, categories: current.categories.map(c => (c.id === id ? { ...c, color } : c)) }),
    removeCategory: (id: string) => {
      const assigned = Object.fromEntries(Object.entries(current.assigned).filter(([, v]) => v !== id));
      set({ ...current, categories: current.categories.filter(c => c.id !== id), assigned });
    },
    /** File an event under a category, or take it out (null). Keyed by series, so every repeat follows. */
    assign: (eventKey: string, categoryId: string | null) => {
      const assigned = { ...current.assigned };
      if (categoryId) assigned[eventKey] = categoryId; else delete assigned[eventKey];
      set({ ...current, assigned });
    },
  };
}
