// Shared frame for sign-in, sign-up, and first-group setup.
// Z-pattern: brand + promise top-left, form and primary action bottom
// (thumb zone) on iPhone; one centered 400pt column on desktop.

import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, Txt } from '../../components/ui';
import { Meadow } from '../../components/Sheep';
import { space, useLayout, useTheme } from '../../theme';

export default function AuthLayout({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{
          flexGrow: 1,
          justifyContent: compact ? 'space-between' : 'center',
          paddingTop: insets.top + space.xl,
          paddingBottom: insets.bottom + space.l,
          paddingHorizontal: space.l,
        }}
      >
        <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.s, marginBottom: compact ? space.xl : space.xxl }}>
          <Txt v="display" accessibilityRole="header">{title}</Txt>
          <Txt v="body" tone="secondary">{subtitle}</Txt>
          <Meadow />
        </View>
        <View style={{ width: '100%', maxWidth: 400, alignSelf: 'center', gap: space.m }}>
          {children}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Inline result line under a form: errors in red, confirmations in tint. */
export function FormMessage({ message, tone = 'danger' }: { message: string | null; tone?: 'danger' | 'tint' }) {
  const { c } = useTheme();
  if (!message) return null;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-start', paddingHorizontal: space.m }}
    >
      <Icon name={tone === 'danger' ? 'alert-circle' : 'checkmark-circle'} size={18} color={tone === 'danger' ? c.danger : c.tint} style={{ marginTop: 1 }} />
      <Txt v="footnote" tone={tone} style={{ flex: 1 }}>{message}</Txt>
    </View>
  );
}
