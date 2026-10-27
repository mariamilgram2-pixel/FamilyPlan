// Design tokens for sheep.
//
// Warm and editorial: a cream page, deep olive for actions, soft sage for
// highlights, a bold serif (Gloock) for titles, and a clean geometric sans
// (Manrope) for everything else. Dark mode is warm charcoal with sage.
//
// The palette is deliberately tiny: one tint, one background, one container
// fill, and two label levels. Everything else (separators, materials, pressed
// states) is derived from those, so light and dark stay in lockstep.
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
  // Chrome.
  tabBar: string;          // the floating tab bar's capsule
  tabIdle: string;         // unselected tabs on it
  shadow: string;          // warm, never pure black
};

/**
 * Brand colors that stay the same in light and dark, because what's under
 * them doesn't change: photos (covers are dimmed the same either way) and
 * the hillside drawings.
 */
export const brand = {
  olive: '#3E4A2E',                         // the tint, for olive type on cream chips over photos
  onCover: '#F7F2E8',                       // cream type on a photo cover
  onCoverSoft: 'rgba(247,242,232,0.82)',    // its secondary lines
  coverGlass: 'rgba(247,242,232,0.22)',     // a frosted pill on a cover
  coverChip: 'rgba(247,242,232,0.92)',      // a solid cream chip on a cover ("+3", "I'm in")
  coverShade: (alpha: number) => `rgba(32,27,18,${alpha})`,   // dims a photo so type reads
  meadow: '#DCECC8',                        // the hillside and the sheep's meadow circles
  meadowCrest: '#4F7338',                   // the line along the top of the hill
  photoBackdrop: 'rgba(0,0,0,0.92)',        // behind a photo opened full screen
  thumb: '#FFFFFF',                         // a switch's knob
} as const;

const light: Palette = {
  tint: '#3E4A2E',          // deep olive
  onTint: '#F4EFE6',
  background: '#F4EFE6',    // cream
  fill: '#EAE3D6',          // a shade deeper: cards, inputs
  label: '#23261D',
  secondaryLabel: '#6B675B',
  separator: 'rgba(62,52,30,0.13)',
  pressed: 'rgba(62,52,30,0.07)',
  tintSoft: '#DCE3C8',      // sage: selection, tags, highlights
  material: 'rgba(244,239,230,0.86)',
  scrim: 'rgba(30,26,18,0.36)',
  danger: '#B3261E',
  tabBar: '#3E4A2E',
  tabIdle: 'rgba(244,239,230,0.72)',
  shadow: '#1E1A12',
};

const dark: Palette = {
  tint: '#BCCB9E',          // sage
  onTint: '#171812',
  background: '#151612',    // warm charcoal
  fill: '#21231C',
  label: '#F2EEE4',
  secondaryLabel: '#A8A393',
  separator: 'rgba(242,238,228,0.12)',
  pressed: 'rgba(242,238,228,0.08)',
  tintSoft: 'rgba(188,203,158,0.16)',
  material: 'rgba(28,29,23,0.86)',
  scrim: 'rgba(0,0,0,0.56)',
  danger: '#F2867C',
  tabBar: '#2C2E25',        // a step lighter than cards, so it reads as floating over them
  tabIdle: '#A8A393',
  shadow: '#000000',
};

// ─── Spacing: rigid 8pt grid ──────────────────────────────────────────────────
// `hair` (4) exists only to pair an icon with its label; layout uses 8 multiples.

export const space = { hair: 4, s: 8, m: 16, l: 24, xl: 32, xxl: 48 } as const;

/** Minimum interactive size (Apple HIG). */
export const HIT = 44;

// ─── Radii: continuous (squircle) curves on iOS ──────────────────────────────

export const radius = { control: 10, row: 14, group: 22, sheet: 28, pill: 999 } as const;

export const continuous: ViewStyle = Platform.OS === 'ios' ? ({ borderCurve: 'continuous' } as ViewStyle) : {};

// ─── Typography: Gloock for titles, Manrope for everything else ──────────────
// Each weight is its own font file (loaded in App.tsx), so weight is chosen by
// family, never by fontWeight: a fontWeight on top would make browsers fake a
// bolder bold. Use `weight()` wherever text needs to be heavier.

export const fonts = {
  display: 'Gloock_400Regular',
  regular: 'Manrope_400Regular',
  medium: 'Manrope_500Medium',
  semibold: 'Manrope_600SemiBold',
  bold: 'Manrope_700Bold',
} as const;

export type Weight = '400' | '500' | '600' | '700';
const FAMILY_BY_WEIGHT: Record<Weight, string> = { 400: fonts.regular, 500: fonts.medium, 600: fonts.semibold, 700: fonts.bold };

/** A heavier (or lighter) Manrope, in place of fontWeight. */
export const weight = (w: Weight): TextStyle => ({ fontFamily: FAMILY_BY_WEIGHT[w], fontWeight: 'normal' });

const tabular = { fontVariant: ['tabular-nums'] } as TextStyle;

const sans = (w: Weight) => weight(w);

export const type = {
  display:    { fontFamily: fonts.display, fontWeight: 'normal', fontSize: 36, lineHeight: 42, letterSpacing: -0.2 },
  largeTitle: { fontFamily: fonts.display, fontWeight: 'normal', fontSize: 34, lineHeight: 40, letterSpacing: -0.2 },
  title:      { fontFamily: fonts.display, fontWeight: 'normal', fontSize: 24, lineHeight: 30, letterSpacing: 0 },
  headline:   { ...sans('700'), fontSize: 16, lineHeight: 22, letterSpacing: -0.2 },
  body:       { ...sans('500'), fontSize: 16, lineHeight: 23, letterSpacing: -0.2 },
  callout:    { ...sans('500'), fontSize: 15, lineHeight: 20, letterSpacing: -0.1 },
  footnote:   { ...sans('500'), fontSize: 13, lineHeight: 17, letterSpacing: 0 },
  caption:    { ...sans('700'), fontSize: 12, lineHeight: 16, letterSpacing: 0.1 },
} satisfies Record<string, TextStyle>;

/** Small spaced capitals for section labels and eyebrows ("EXPLORE OUR COLLECTION"). */
export const eyebrow: TextStyle = { ...weight('700'), fontSize: 11, lineHeight: 14, letterSpacing: 1.4, textTransform: 'uppercase' };

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
