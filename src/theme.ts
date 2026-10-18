// Design tokens for sheep.
//
// The palette is deliberately tiny: one tint, one background, one container
// fill, and two label levels. Everything else (separators, materials, pressed
// states) is derived from those by opacity, so light and dark stay in lockstep.
// All text/background pairs below clear WCAG AA (4.5:1).

import { useMemo } from 'react';
import { Platform, StyleSheet, TextStyle, useWindowDimensions, ViewStyle } from 'react-native';
import { useThemePreference } from './contexts/ThemeContext';

export type Palette = {
  tint: string;            // the one brand color: primary actions, selection, today
  onTint: string;          // text/icons placed on a tint fill
  background: string;      // the one neutral surface
  fill: string;            // the one subtle container (grouped rows, inputs, sidebar)
  label: string;           // primary text
  secondaryLabel: string;  // secondary text
  // Derived — not new hues.
  separator: string;
  pressed: string;
  tintSoft: string;        // selection highlight
  material: string;        // translucent bar surface (paired with blur)
  scrim: string;
  danger: string;          // system red, reserved for destructive actions
};

const light: Palette = {
  tint: '#3A7A3A',
  onTint: '#FFFFFF',
  background: '#f7f7f7',
  fill: '#F2F2F7',
  label: '#1C1C1E',
  secondaryLabel: '#6C6C70',
  separator: 'rgba(60,60,67,0.18)',
  pressed: 'rgba(60,60,67,0.08)',
  tintSoft: 'rgba(58,122,58,0.12)',
  material: 'rgba(255,255,255,0.78)',
  scrim: 'rgba(0,0,0,0.32)',
  danger: '#D70015',
};

const dark: Palette = {
  tint: '#7DC67A',
  onTint: '#000000',
  background: '#000000',
  fill: '#1C1C1E',
  label: '#FFFFFF',
  secondaryLabel: '#A1A1A6',
  separator: 'rgba(84,84,88,0.6)',
  pressed: 'rgba(235,235,245,0.10)',
  tintSoft: 'rgba(125,198,122,0.18)',
  material: 'rgba(22,22,24,0.78)',
  scrim: 'rgba(0,0,0,0.56)',
  danger: '#FF6961',
};

// ─── Spacing: rigid 8pt grid ──────────────────────────────────────────────────
// `hair` (4) exists only to pair an icon with its label; layout uses 8 multiples.

export const space = { hair: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 } as const;

/** Minimum interactive size (Apple HIG). */
export const HIT = 44;

// ─── Radii: continuous (squircle) curves on iOS ──────────────────────────────

export const radius = { control: 8, row: 12, group: 16, sheet: 24, pill: 999 } as const;

export const continuous: ViewStyle = Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as ViewStyle) : {};

// ─── Typography: SF Pro scale (+ New York for the one display anchor) ─────────
// Two working weights: regular (400) and semibold (600). Bold is reserved for
// the large titles that anchor each screen.

const serif = Platform.select({
  web: 'ui-serif, "New York", "Iowan Old Style", Georgia, serif',
  ios: 'Georgia',
  default: 'serif',
});

const sans = Platform.select({
  web: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif',
  default: undefined,
});

const tabular = { fontVariant: ['tabular-nums'] } as TextStyle;

export const type = {
  display:    { fontFamily: serif, fontSize: 34, lineHeight: 40, fontWeight: '600', letterSpacing: -0.4 },
  largeTitle: { fontFamily: sans, fontSize: 34, lineHeight: 40, fontWeight: '700', letterSpacing: 0.4 },
  title:      { fontFamily: sans, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2 },
  headline:   { fontFamily: sans, fontSize: 17, lineHeight: 24, fontWeight: '600', letterSpacing: -0.4 },
  body:       { fontFamily: sans, fontSize: 17, lineHeight: 24, fontWeight: '400', letterSpacing: -0.4 },
  callout:    { fontFamily: sans, fontSize: 15, lineHeight: 20, fontWeight: '400', letterSpacing: -0.2 },
  footnote:   { fontFamily: sans, fontSize: 13, lineHeight: 16, fontWeight: '400', letterSpacing: -0.1 },
  caption:    { fontFamily: sans, fontSize: 12, lineHeight: 16, fontWeight: '600', letterSpacing: 0 },
} satisfies Record<string, TextStyle>;

export type TypeVariant = keyof typeof type;
export const tabularNums = tabular;

// ─── Hooks ───────────────────────────────────────────────────────────────────

export function useTheme() {
  const { resolved, toggleColorScheme } = useThemePreference();
  const isDark = resolved === 'dark';
  return { c: isDark ? dark : light, isDark, toggleColorScheme };
}

/**
 * Build a StyleSheet from the active palette. Pass a module-level factory so
 * the sheet is only rebuilt when the color scheme flips.
 */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(factory: (c: Palette) => T): T {
  const { c } = useTheme();
  return useMemo(() => StyleSheet.create(factory(c)), [c, factory]);
}

// ─── Adaptive layout ─────────────────────────────────────────────────────────
// compact  (< 768):  iPhone — bottom tab bar, detail in sheets
// regular  (≥ 768):  iPad / narrow Mac window — sidebar, single content column
// expanded (≥ 1024): Mac — sidebar + list + detail (three columns)

export const SIDEBAR_WIDTH = 240;
export const LIST_WIDTH = 360;

export function useLayout() {
  const { width } = useWindowDimensions();
  const hasSidebar = width >= 768;
  const threeColumn = width >= 1024;
  return { width, hasSidebar, threeColumn, compact: !hasSidebar };
}

// ─── Identity helpers ────────────────────────────────────────────────────────

export function initialsFor(name: string | null | undefined, fallback = '?'): string {
  const s = (name ?? '').trim();
  if (!s) return fallback;
  const parts = s.split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
