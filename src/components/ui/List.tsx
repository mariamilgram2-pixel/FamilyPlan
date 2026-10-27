// Lists: the workhorse of every screen.
// `ListSection` is an inset-grouped container (one subtle fill, no borders);
// `ListRow` works inside it or standalone on the background (plain lists).

import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { Icon, IconName, Tappable, Txt } from './primitives';
import { continuous, radius, space, useLayout, useTheme } from '../../theme';

// ─── Section ─────────────────────────────────────────────────────────────────

interface SectionProps {
  header?: string;
  headerAction?: React.ReactNode;
  footer?: string;
  /** Left inset for separators — match the row's text start. */
  separatorInset?: number;
  /** 'grouped' sits in a fill container; 'plain' sits on the background. */
  variant?: 'grouped' | 'plain';
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

export function ListSection({ header, headerAction, footer, separatorInset = space.m, variant = 'grouped', children, style }: SectionProps) {
  const { c } = useTheme();
  const rows = React.Children.toArray(children).filter(Boolean);
  return (
    <View style={style}>
      {header ? <SectionHeader title={header} action={headerAction} /> : null}
      <View
        style={variant === 'grouped' && {
          backgroundColor: c.fill,
          borderRadius: radius.group,
          overflow: 'hidden',
          ...continuous,
        }}
      >
        {rows.map((row, i) => (
          <React.Fragment key={(row as any).key ?? i}>
            {i > 0 && (
              <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: separatorInset }} />
            )}
            {row}
          </React.Fragment>
        ))}
      </View>
      {footer ? (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.s }}>{footer}</Txt>
      ) : null}
    </View>
  );
}

export function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: space.m, paddingBottom: space.s, minHeight: 32,
    }}>
      <Txt v="footnote" tone="secondary" semibold style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{title}</Txt>
      {action}
    </View>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

interface RowProps {
  title: string;
  subtitle?: string | null;
  subtitleTint?: boolean;     // a subtitle that's a call to act ("Reply to Book club")
  detail?: string | null;     // a second secondary line, e.g. calendar fit under votes
  leading?: React.ReactNode;
  icon?: IconName;            // shorthand for a tinted leading glyph
  trailing?: React.ReactNode;
  value?: string;             // secondary trailing text (settings-style)
  chevron?: boolean;
  checked?: boolean;
  selected?: boolean;
  destructive?: boolean;
  tintTitle?: boolean;        // action rows ("Add person")
  onPress?: () => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

export function ListRow({
  title, subtitle, subtitleTint, detail, leading, icon, trailing, value, chevron, checked, selected,
  destructive, tintTitle, onPress, onLongPress, style,
}: RowProps) {
  const { c } = useTheme();
  const { compact } = useLayout();

  const content = (
    <>
      {icon ? <Icon name={icon} size={compact ? 22 : 18} color={destructive ? c.danger : c.tint} style={{ width: 28, textAlign: 'center' }} /> : null}
      {leading}
      <View style={{ flex: 1, minWidth: 0, paddingVertical: space.s }}>
        <Txt
          v={compact ? 'body' : 'callout'}
          tone={destructive ? 'danger' : tintTitle ? 'tint' : 'primary'}
          semibold={selected}
          numberOfLines={1}
        >
          {title}
        </Txt>
        {subtitle ? (
          <Txt v={compact ? 'callout' : 'footnote'} tone={subtitleTint ? 'tint' : 'secondary'} numberOfLines={1}>{subtitle}</Txt>
        ) : null}
        {detail ? (
          <Txt v="footnote" tone="secondary" numberOfLines={1}>{detail}</Txt>
        ) : null}
      </View>
      {value ? <Txt v={compact ? 'body' : 'callout'} tone="secondary" numberOfLines={1}>{value}</Txt> : null}
      {trailing}
      {checked ? <Icon name="checkmark" size={20} color={c.tint} /> : null}
      {chevron ? <Icon name="chevron-forward" size={16} color={c.secondaryLabel} /> : null}
    </>
  );

  const base: ViewStyle = {
    flexDirection: 'row', alignItems: 'center', gap: space.m,
    paddingHorizontal: space.m, minHeight: compact ? 48 : 40,
  };

  if (!onPress && !onLongPress) return <View style={[base, style]}>{content}</View>;
  return (
    <Tappable
      onPress={onPress}
      onLongPress={onLongPress}
      selected={selected}
      accessibilityLabel={[title, subtitle, detail].filter(Boolean).join(', ')}
      accessibilityState={{ selected, checked }}
      style={[base, style]}
    >
      {content}
    </Tappable>
  );
}
