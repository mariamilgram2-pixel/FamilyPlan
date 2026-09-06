import React from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Avatar, { AvatarPerson } from './Avatar';
import { colors } from '../theme';

interface Props {
  people: AvatarPerson[];
  max?: number;
  size?: number;
  style?: ViewStyle;
}

export default function AvatarStack({ people, max = 3, size = 22, style }: Props) {
  const shown = people.slice(0, max);
  const extra = Math.max(0, people.length - shown.length);
  const overlap = Math.round(size * 0.36);
  const chipFont = Math.max(10, Math.round(size * 0.44));

  return (
    <View style={[styles.row, style]}>
      {shown.map((p, i) => (
        <View key={p.id ?? i} style={{ marginLeft: i === 0 ? 0 : -overlap }}>
          <Avatar person={p} size={size} ring />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={[
            styles.more,
            {
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: shown.length === 0 ? 0 : -overlap,
              borderWidth: Math.max(1.5, size * 0.08),
            },
          ]}
        >
          <Text style={[styles.moreText, { fontSize: chipFont }]}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  more: {
    backgroundColor: colors.ground2,
    borderColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: { color: colors.ink2, fontWeight: '700' },
});
