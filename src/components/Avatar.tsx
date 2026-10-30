import React from 'react';
import { View, Text, Image, ViewStyle } from 'react-native';
import { initialsFor, useTheme, weight } from '../theme';

export interface AvatarPerson {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface Props {
  person: AvatarPerson | null | undefined;
  size?: number;
  ring?: boolean;          // separates overlapping avatars in a stack
  ringColor?: string;      // match the surface the stack sits on
  highlight?: boolean;     // the signed-in user wears the tint
  style?: ViewStyle;
}

/**
 * Monochrome monogram (à la Contacts). Identity comes from initials and
 * photos, not from a rainbow of avatar colors — the tint stays meaningful.
 */
export default function Avatar({ person, size = 32, ring = false, ringColor, highlight, style }: Props) {
  const { c } = useTheme();
  const label = initialsFor(person?.full_name ?? person?.email ?? null);
  const borderWidth = ring ? Math.max(2, Math.round(size * 0.08)) : 0;

  return (
    <View
      accessible
      accessibilityLabel={person?.full_name ?? person?.email ?? 'Unknown'}
      style={[{
        width: size, height: size, borderRadius: size / 2,
        backgroundColor: highlight ? c.tint : c.secondaryLabel,
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
        borderWidth, borderColor: ringColor ?? c.background,
      }, style]}
    >
      {person?.avatar_url ? (
        <Image source={{ uri: person.avatar_url }} style={{ width: size, height: size }} />
      ) : (
        <Text style={{ color: highlight ? c.onTint : c.background, fontSize: Math.round(size * 0.4), ...weight('700') }}>
          {label}
        </Text>
      )}
    </View>
  );
}
