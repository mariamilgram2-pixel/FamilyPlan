// Appearance override. Until someone picks a side, the app follows the system.
// A tap stores light or dark and keeps that choice on this device.

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'color_scheme';

type Scheme = 'light' | 'dark';
type Preference = Scheme | null;

interface ThemePreference {
  /** null means follow the system. */
  preference: Preference;
  resolved: Scheme;
  toggleColorScheme: () => void;
}

const ThemePreferenceContext = createContext<ThemePreference | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme();
  const [preference, setPreference] = useState<Preference>(null);

  useEffect(() => {
    AsyncStorage.getItem(KEY).then(value => {
      if (value === 'light' || value === 'dark') setPreference(value);
    }).catch(() => {});
  }, []);

  const resolved: Scheme = preference ?? (system === 'dark' ? 'dark' : 'light');

  const toggleColorScheme = useCallback(() => {
    const next: Scheme = resolved === 'dark' ? 'light' : 'dark';
    setPreference(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  }, [resolved]);

  return (
    <ThemePreferenceContext.Provider value={{ preference, resolved, toggleColorScheme }}>
      {children}
    </ThemePreferenceContext.Provider>
  );
}

export function useThemePreference(): ThemePreference {
  const value = useContext(ThemePreferenceContext);
  const system = useColorScheme();
  if (value) return value;
  return {
    preference: null,
    resolved: system === 'dark' ? 'dark' : 'light',
    toggleColorScheme: () => {},
  };
}
