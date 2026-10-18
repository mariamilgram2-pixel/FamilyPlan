// Core building blocks: text, pressables, buttons, fields, segmented control.
// Every interactive element meets the 44pt touch minimum on compact layouts
// and gets hover + pointer feedback on desktop.

import React, { useState } from 'react';
import {
  ActivityIndicator, Platform, Pressable, PressableProps, StyleProp, Switch,
  Text, TextInput, TextInputProps, TextProps, TextStyle, View, ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { continuous, HIT, Palette, radius, space, type, TypeVariant, useLayout, useStyles, useTheme } from '../../theme';

export type IconName = React.ComponentProps<typeof Ionicons>['name'];
export { Ionicons as Icon };

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as ViewStyle) : null;

// ─── Text ────────────────────────────────────────────────────────────────────

type Tone = 'primary' | 'secondary' | 'tint' | 'onTint' | 'danger';

interface TxtProps extends TextProps {
  v?: TypeVariant;
  tone?: Tone;
  semibold?: boolean;
  align?: TextStyle['textAlign'];
}

export function Txt({ v = 'body', tone = 'primary', semibold, align, style, ...rest }: TxtProps) {
  const { c } = useTheme();
  const color =
    tone === 'secondary' ? c.secondaryLabel :
    tone === 'tint'      ? c.tint :
    tone === 'onTint'    ? c.onTint :
    tone === 'danger'    ? c.danger : c.label;
  return (
    <Text
      {...rest}
      style={[type[v], { color }, semibold && { fontWeight: '600' }, align && { textAlign: align }, style]}
    />
  );
}

// ─── Tappable: Pressable with press + hover feedback ─────────────────────────

interface TappableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  feedback?: 'highlight' | 'opacity' | 'none';
  selected?: boolean;
}

export const Tappable = React.forwardRef<View, TappableProps>(function Tappable(
  { style, feedback = 'highlight', selected, ...rest }, ref,
) {
  const { c } = useTheme();
  return (
    <Pressable
      ref={ref}
      accessibilityRole="button"
      {...rest}
      style={(state: any) => [
        style,
        selected && { backgroundColor: c.tintSoft },
        !selected && feedback === 'highlight' && (state.pressed || state.hovered) && { backgroundColor: c.pressed },
        feedback === 'opacity' && state.pressed && { opacity: 0.55 },
        feedback === 'opacity' && state.hovered && !state.pressed && { opacity: 0.8 },
        rest.disabled && { opacity: 0.4 },
        webPointer,
      ]}
    />
  );
});

// ─── Button ──────────────────────────────────────────────────────────────────

interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: 'filled' | 'gray' | 'plain' | 'destructive';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  block?: boolean;     // stretch to container width
  style?: StyleProp<ViewStyle>;
}

export function Button({ label, onPress, variant = 'filled', icon, loading, disabled, block, style }: ButtonProps) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const s = useStyles(buttonStyles);
  const fg =
    variant === 'filled' ? c.onTint :
    variant === 'destructive' ? c.danger : c.tint;
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled || loading}
      feedback="opacity"
      accessibilityLabel={label}
      style={[
        s.base,
        { height: compact ? HIT + 4 : 32, paddingHorizontal: compact ? space.l : space.m },
        variant === 'filled' && { backgroundColor: c.tint },
        variant === 'gray' && { backgroundColor: c.fill },
        block && { alignSelf: 'stretch' },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={compact ? 20 : 16} color={fg} />}
          <Text style={[compact ? type.headline : type.callout, { color: fg, fontWeight: '600' }]}>{label}</Text>
        </>
      )}
    </Tappable>
  );
}

const buttonStyles = (_c: Palette) => ({
  base: {
    flexDirection: 'row' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    gap: space.s,
    borderRadius: radius.row,
    ...continuous,
  },
});

// ─── IconButton ──────────────────────────────────────────────────────────────

interface IconButtonProps {
  icon: IconName;
  label: string;            // accessibility + desktop tooltip
  onPress?: () => void;
  variant?: 'plain' | 'gray' | 'filled';
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconButton = React.forwardRef<View, IconButtonProps>(function IconButton(
  { icon, label, onPress, variant = 'plain', disabled, style }, ref,
) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const size = compact ? HIT : 32;
  return (
    <Tappable
      ref={ref}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel={label}
      feedback={variant === 'plain' ? 'highlight' : 'opacity'}
      {...(Platform.OS === 'web' ? ({ title: label } as object) : {})}
      style={[
        {
          width: size, height: size, borderRadius: size / 2,
          alignItems: 'center', justifyContent: 'center',
        },
        variant === 'gray' && { backgroundColor: c.fill },
        variant === 'filled' && { backgroundColor: c.tint },
        style,
      ]}
    >
      <Ionicons name={icon} size={compact ? 22 : 18} color={variant === 'filled' ? c.onTint : c.tint} />
    </Tappable>
  );
});

// ─── Field ───────────────────────────────────────────────────────────────────

interface FieldProps extends TextInputProps {
  label?: string;
  hint?: string;
  mono?: boolean;
}

export const Field = React.forwardRef<TextInput, FieldProps>(function Field(
  { label, hint, mono, multiline, style, ...rest }, ref,
) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: space.s }}>
      {label ? <Txt v="footnote" tone="secondary" semibold style={{ paddingHorizontal: space.m }}>{label}</Txt> : null}
      <TextInput
        ref={ref}
        placeholderTextColor={c.secondaryLabel}
        multiline={multiline}
        {...rest}
        onFocus={(e) => { setFocused(true); rest.onFocus?.(e); }}
        onBlur={(e) => { setFocused(false); rest.onBlur?.(e); }}
        style={[
          type.body,
          {
            color: c.label,
            backgroundColor: c.fill,
            borderRadius: radius.row,
            paddingHorizontal: space.m,
            minHeight: compact ? 48 : 40,
            borderWidth: 2,
            borderColor: focused ? c.tint : 'transparent',
            ...continuous,
          },
          multiline && { minHeight: 96, paddingTop: space.s + space.hair, textAlignVertical: 'top' },
          mono && { fontVariant: ['tabular-nums'], letterSpacing: 4, fontWeight: '600', textAlign: 'center' },
          Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
          style,
        ]}
      />
      {hint ? <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>{hint}</Txt> : null}
    </View>
  );
});

// ─── Segmented control ───────────────────────────────────────────────────────

interface SegmentedProps<K extends string> {
  options: { key: K; label: string }[];
  value: K;
  onChange: (k: K) => void;
  style?: StyleProp<ViewStyle>;
}

export function Segmented<K extends string>({ options, value, onChange, style }: SegmentedProps<K>) {
  const { c, isDark } = useTheme();
  const { compact } = useLayout();
  return (
    <View
      accessibilityRole="tablist"
      style={[{
        flexDirection: 'row', backgroundColor: c.fill, borderRadius: radius.control + 2,
        padding: 2, height: compact ? 40 : 32, ...continuous,
      }, style]}
    >
      {options.map(o => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            {...(Platform.OS === 'web' ? ({ 'aria-selected': active } as object) : {})}
            onPress={() => onChange(o.key)}
            hitSlop={{ top: 4, bottom: 4 }}
            style={[
              {
                flex: 1, alignItems: 'center', justifyContent: 'center',
                borderRadius: radius.control, ...continuous,
              },
              active && {
                backgroundColor: isDark ? c.separator : c.background,
                shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
              },
              webPointer,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[compact ? type.callout : type.footnote, { color: c.label, fontWeight: active ? '600' : '400' }]}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// ─── Toggle ──────────────────────────────────────────────────────────────────

export function Toggle({ value, onValueChange, label }: { value: boolean; onValueChange: (v: boolean) => void; label: string }) {
  const { c } = useTheme();
  return (
    <Switch
      accessibilityLabel={label}
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: c.separator, true: c.tint }}
      thumbColor="#FFFFFF"
      {...(Platform.OS === 'web' ? ({ activeThumbColor: '#FFFFFF' } as any) : {})}
    />
  );
}

// ─── Empty state ─────────────────────────────────────────────────────────────

export function EmptyState({ icon, illustration, title, body, action }: {
  icon: IconName; illustration?: React.ReactNode; title: string; body?: string; action?: { label: string; onPress: () => void };
}) {
  const { c } = useTheme();
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl, paddingHorizontal: space.l, gap: space.s }}>
      {illustration ?? <Ionicons name={icon} size={40} color={c.secondaryLabel} style={{ marginBottom: space.s }} />}
      <Txt v="headline" align="center">{title}</Txt>
      {body ? <Txt v="callout" tone="secondary" align="center" style={{ maxWidth: 320 }}>{body}</Txt> : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="plain" style={{ marginTop: space.s }} /> : null}
    </View>
  );
}
