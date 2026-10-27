// Pinned people and groups, kept at the top of People like pinned
// conversations. Private and per device; in pin order.

import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type PinKind = 'group' | 'person' | 'contact';
export const pinKey = (kind: PinKind, id: string) => `${kind}:${id}`;

export const MAX_PINS = 9;
const STORAGE_KEY = 'pinned_people';

export function usePins() {
  const [pins, setPins] = useState<string[]>([]);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(d => { if (d) setPins(JSON.parse(d)); }).catch(() => {});
  }, []);

  const save = (next: string[]) => {
    setPins(next);
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  };

  const isPinned = useCallback((kind: PinKind, id: string) => pins.includes(pinKey(kind, id)), [pins]);

  /** False when there's no room for another pin. */
  function toggle(kind: PinKind, id: string): boolean {
    const key = pinKey(kind, id);
    if (pins.includes(key)) { save(pins.filter(p => p !== key)); return true; }
    if (pins.length >= MAX_PINS) return false;
    save([...pins, key]);
    return true;
  }

  return { pins, isPinned, toggle };
}
