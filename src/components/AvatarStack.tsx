import React from 'react';
import { View, Text, ViewStyle } from 'react-native';
import Avatar, { AvatarPerson } from './Avatar';
import { useTheme, weight } from '../theme';

interface Props {
  people: AvatarPerson[];
  max?: number;
  size?: number;
  ringColor?: string;
  style?: ViewStyle;
}

export default function AvatarStack({ people, max = 3, size = 24, ringColor, style }: Props) {
  const { c } = useTheme();
  const shown = people.slice(0, max);
  const extra = Math.max(0, people.length - shown.length);
  const overlap = Math.round(size * 0.3);
  const ring = ringColor ?? c.background;

  return (
    <View
      accessible
      accessibilityLabel={`${people.length} ${people.length === 1 ? 'person' : 'people'}`}
      style={[{ flexDirection: 'row', alignItems: 'center' }, style]}
    >
      {shown.map((p, i) => (
        <View key={p.id ?? i} style={{ marginLeft: i === 0 ? 0 : -overlap }}>
          <Avatar person={p} size={size} ring ringColor={ring} />
        </View>
      ))}
      {extra > 0 && (
        <View style={{
          width: size, height: size, borderRadius: size / 2, marginLeft: -overlap,
          backgroundColor: c.fill, borderWidth: Math.max(2, Math.round(size * 0.08)), borderColor: ring,
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Text style={{ color: c.label, fontSize: Math.round(size * 0.4), ...weight('700') }}>+{extra}</Text>
        </View>
      )}
    </View>
  );
}
