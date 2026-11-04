// What you've kept from Resting or Quiet lately, and when a tidy was last
// offered, on this device. See quiet.ts for the rules.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'planQuiet:v1';
type Store = { kept: Record<string, string>; tidyOfferedAt: string | null };

/** What you've kept, and when a tidy was last offered. The demo keeps it in memory. */
export function useQuietStore(isDemo: boolean) {
  const [store, setStore] = useState<Store>({ kept: {}, tidyOfferedAt: null });

  useEffect(() => {
    if (isDemo) return;
    let live = true;
    AsyncStorage.getItem(KEY).then(raw => {
      if (live && raw) setStore(JSON.parse(raw) as Store);
    }).catch(() => {});
    return () => { live = false; };
  }, [isDemo]);

  const update = useCallback((fn: (s: Store) => Store) => {
    setStore(s => {
      const next = fn(s);
      if (!isDemo) AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, [isDemo]);

  const keep = useCallback((id: string) => update(s => ({ ...s, kept: { ...s.kept, [id]: new Date().toISOString() } })), [update]);
  const markTidyOffered = useCallback(() => update(s => ({ ...s, tidyOfferedAt: new Date().toISOString() })), [update]);

  return { kept: store.kept, tidyOfferedAt: store.tidyOfferedAt, keep, markTidyOffered };
}
