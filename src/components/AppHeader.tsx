import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Platform, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import GroupSwitcher from './GroupSwitcher';
import { colors } from '../theme';

interface Props {
  title?: string;
}

/**
 * Cream header with the sheep wordmark on the left and the group switcher
 * on the right. Replaces the previous green slab. Used on all top-level
 * screens (Calendar, Ideas, People, You).
 */
export default function AppHeader({ title }: Props) {
  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.bar}>
        <View style={styles.left}>
          <Text style={styles.wordmark}>sheep</Text>
          <Text style={styles.sheepEmoji}>🐑</Text>
          {title ? <Text style={styles.subtitle}>{title}</Text> : null}
        </View>
        <View style={styles.right}>
          <GroupSwitcher compact />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { backgroundColor: colors.ground },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'android' ? (StatusBar.currentHeight ?? 0) + 8 : 8,
    paddingBottom: 10,
    backgroundColor: colors.ground,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  left: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexShrink: 1 },
  wordmark: { fontSize: 20, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  sheepEmoji: { fontSize: 16 },
  subtitle: { fontSize: 12, color: colors.muted, marginLeft: 4 },
  right: { flexShrink: 0 },
});
