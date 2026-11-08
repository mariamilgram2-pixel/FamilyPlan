// A photo, softly blurred and dimmed toward the bottom, so a title can sit on
// top and read clearly, like the cover of a book. Without a photo, a warm
// wash of color instead. Groups and idea cards both wear one.

import React from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { GROUP_COLORS } from './GroupAvatar';
import { continuous, radius, useTheme, brand } from '../theme';

/** Cream type on a photo; the wash's own ink on a color. */
export function useCoverInk(photo: string | null, wash: string) {
  const { isDark } = useTheme();
  if (photo) return { ink: brand.onCover, soft: brand.onCoverSoft };
  const p = GROUP_COLORS[wash] ?? GROUP_COLORS.sand;
  const ink = isDark ? p.ink.dark : p.ink.light;
  return { ink, soft: ink };
}

// A fade from clear to dim over the bottom of the cover, in small steps so
// there's no visible edge: the title sits in the darkest part.
const FADE = [0.04, 0.08, 0.12, 0.17, 0.22, 0.27];

export default function Cover({ photo, wash, blur = 3, round, label, style, children }: {
  photo: string | null;
  wash: string;               // a GROUP_COLORS key, used when there's no photo
  blur?: number;              // 0 for a plain photo (tiny avatars)
  round?: boolean;            // a circle instead of a card
  label?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}) {
  const { isDark } = useTheme();
  const p = GROUP_COLORS[wash] ?? GROUP_COLORS.sand;
  return (
    <View
      accessibilityLabel={label}
      style={[{
        overflow: 'hidden', borderRadius: round ? 999 : radius.group, ...continuous,
        backgroundColor: isDark ? p.dark : p.light,
      }, style]}
    >
      {photo ? (
        <>
          {/* Scaled up a touch so the blur's soft edges fall outside the frame. */}
          <Image
            source={{ uri: photo }}
            blurRadius={blur}
            resizeMode="cover"
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, transform: [{ scale: blur ? 1.08 : 1 }] }}
          />
          {blur ? (
            <>
              <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: brand.coverShade(0.22) }} />
              {FADE.map((a, i) => (
                <View key={i} style={{
                  position: 'absolute', left: 0, right: 0,
                  top: `${40 + i * 10}%`, height: `${100 - (40 + i * 10)}%`,
                  backgroundColor: brand.coverShade(Number((a - (FADE[i - 1] ?? 0)).toFixed(2))),
                }} />
              ))}
            </>
          ) : null}
        </>
      ) : null}
      {children}
    </View>
  );
}
