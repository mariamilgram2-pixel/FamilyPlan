import React from 'react';
import { View, Text, StyleSheet, Image, ViewStyle } from 'react-native';
import { avatarColorFor, initialsFor, colors } from '../theme';

export interface AvatarPerson {
  id: string;
  full_name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface Props {
  person: AvatarPerson | null | undefined;
  size?: number;
  ring?: boolean;      // white ring for overlapping stacks
  style?: ViewStyle;
}

export default function Avatar({ person, size = 28, ring = false, style }: Props) {
  const bg = avatarColorFor(person?.id);
  const label = initialsFor(person?.full_name ?? person?.email ?? null);
  const fontSize = Math.max(10, Math.round(size * 0.42));
  const borderWidth = ring ? Math.max(1.5, size * 0.08) : 0;

  const box: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: bg,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth,
    borderColor: colors.card,
  };

  return (
    <View style={[box, style]}>
      {person?.avatar_url ? (
        <Image source={{ uri: person.avatar_url }} style={{ width: size, height: size }} />
      ) : (
        <Text style={[styles.text, { fontSize }]}>{label}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: '#fff', fontWeight: '700', letterSpacing: 0.2 },
});
