// Your private "when should Sheep suggest plans?" preferences.
//
// Signed in, they live in availability_preferences, readable only by you;
// other people's suggestions use them through availability_estimate(), which
// returns counts, never the preferences themselves. In the demo they stay on
// this device.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { DEFAULT_SOFT_PREFS, SoftPrefs } from './availability';

const DEMO_KEY = 'availability_prefs';

export async function loadMyPrefs(userId: string | null): Promise<SoftPrefs> {
  try {
    if (!userId) {
      const raw = await AsyncStorage.getItem(DEMO_KEY);
      return raw ? { ...DEFAULT_SOFT_PREFS, ...JSON.parse(raw) } : DEFAULT_SOFT_PREFS;
    }
    const { data } = await supabase.from('availability_preferences')
      .select('weekend_mode, spacing_enabled').eq('user_id', userId).maybeSingle();
    return data ? { weekend_mode: data.weekend_mode, spacing_enabled: data.spacing_enabled } : DEFAULT_SOFT_PREFS;
  } catch {
    return DEFAULT_SOFT_PREFS;   // unreadable: behave as before preferences existed
  }
}

/** Save; returns an error message, or null. */
export async function saveMyPrefs(userId: string | null, prefs: SoftPrefs): Promise<string | null> {
  if (!userId) {
    await AsyncStorage.setItem(DEMO_KEY, JSON.stringify(prefs)).catch(() => {});
    return null;
  }
  const { error } = await supabase.from('availability_preferences')
    .upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() });
  return error?.message ?? null;
}

// One copy shared by every screen, so a change in settings reaches an open
// planner without a reload.
let current: { userId: string | null; prefs: SoftPrefs } | null = null;
const subscribers = new Set<(p: SoftPrefs) => void>();
const publish = (userId: string | null, prefs: SoftPrefs) => {
  current = { userId, prefs };
  subscribers.forEach(fn => fn(prefs));
};

/** Your preferences, and a setter that saves (rolling back if saving fails). */
export function useMyPrefs(userId: string | null) {
  const [prefs, setPrefs] = useState<SoftPrefs>(current?.userId === userId ? current.prefs : DEFAULT_SOFT_PREFS);
  useEffect(() => {
    subscribers.add(setPrefs);
    if (current?.userId === userId) setPrefs(current.prefs);
    else loadMyPrefs(userId).then(p => { if (current?.userId !== userId) publish(userId, p); });
    return () => { subscribers.delete(setPrefs); };
  }, [userId]);
  const save = useCallback(async (next: SoftPrefs) => {
    const before = current?.prefs ?? DEFAULT_SOFT_PREFS;
    publish(userId, next);
    const error = await saveMyPrefs(userId, next);
    if (error) publish(userId, before);
    return error;
  }, [userId]);
  return { prefs, save };
}
