// Suggestions you've cleared: "Been a while" for someone, a nudge on Home.
// Cleared ones stay away for a while (60 days), then may come back if they
// still apply: Fran, quiet two months later, shows up again. Per device, and
// shared by every screen, so clearing on one is cleared on all.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'dismissed_suggestions:v1';
export const HIDE_FOR_DAYS = 60;

/** Cleared, and not long enough ago to come back. */
export function isHidden(dismissed: Record<string, string>, key: string, now = Date.now(), days = HIDE_FOR_DAYS): boolean {
  const at = dismissed[key];
  return !!at && now - Date.parse(at) < days * 86400000;
}

let current: Record<string, string> = {};
let loaded = false;
const listeners = new Set<(d: Record<string, string>) => void>();

export function useDismissed() {
  const [dismissed, setDismissed] = useState(current);
  useEffect(() => {
    listeners.add(setDismissed);
    setDismissed(current);
    if (!loaded) {
      loaded = true;
      AsyncStorage.getItem(KEY).then(raw => {
        if (!raw) return;
        current = JSON.parse(raw);
        listeners.forEach(fn => fn(current));
      }).catch(() => {});
    }
    return () => { listeners.delete(setDismissed); };
  }, []);

  const dismiss = useCallback((key: string) => {
    current = { ...current, [key]: new Date().toISOString() };
    listeners.forEach(fn => fn(current));
    AsyncStorage.setItem(KEY, JSON.stringify(current)).catch(() => {});
  }, []);

  const hidden = useCallback((key: string) => isHidden(dismissed, key), [dismissed]);
  return { hidden, dismiss };
}
