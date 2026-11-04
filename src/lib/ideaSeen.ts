// When you last opened each idea, on this device, so Ideas can mark what's
// new since. The first load records a baseline, so a fresh install doesn't
// mark everything new. The demo starts a day back, so a little shows as new.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'ideaSeen:v1';
type Store = { baseline: string; seen: Record<string, string> };

export function useIdeaSeen(isDemo: boolean) {
  const [store, setStore] = useState<Store>(() => ({ baseline: new Date().toISOString(), seen: {} }));

  useEffect(() => {
    if (isDemo) {
      setStore({ baseline: new Date(Date.now() - 86400000).toISOString(), seen: {} });
      return;
    }
    let live = true;
    AsyncStorage.getItem(KEY).then(raw => {
      if (!live) return;
      const saved = raw ? (JSON.parse(raw) as Store) : null;
      if (saved?.baseline) setStore(saved);
      else AsyncStorage.setItem(KEY, JSON.stringify(store)).catch(() => {});
    }).catch(() => {});
    return () => { live = false; };
  }, [isDemo]);

  const markSeen = useCallback((id: string) => {
    setStore(s => {
      const next = { ...s, seen: { ...s.seen, [id]: new Date().toISOString() } };
      if (!isDemo) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [isDemo]);

  return { baseline: store.baseline, seen: store.seen, markSeen };
}
