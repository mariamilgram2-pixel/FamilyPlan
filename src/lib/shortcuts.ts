// Desktop keyboard shortcuts (web/macOS build). No-ops on native.

import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { useIsFocused } from '@react-navigation/native';

/** ⌘/Ctrl + key → handler, only while the calling screen is focused. */
export function useShortcut(key: string, handler: () => void) {
  const focused = useIsFocused();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (Platform.OS !== 'web' || !focused) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== key) return;
      e.preventDefault();
      ref.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key, focused]);
}

export const isMacLike =
  Platform.OS === 'web' && typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
export const modKey = isMacLike ? '⌘' : 'Ctrl+';
