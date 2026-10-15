// Screen scaffolding.
//
// Compact (iPhone): a large-title header that anchors the top-left quadrant,
// with secondary actions top-right and the primary action in a bottom
// capsule inside the thumb zone.
// Regular/Expanded (iPad, Mac): each column gets a toolbar-style header.
// `SplitView` arranges list + detail when there's room for a third column.

import React from 'react';
import { ScrollView, ScrollViewProps, StyleSheet, View, ViewStyle, StyleProp } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName, Tappable, Txt } from './primitives';
import { LIST_WIDTH, radius, space, type, useLayout, useTheme, continuous } from '../../theme';

export const TAB_BAR_HEIGHT = 56;

// ─── Header ──────────────────────────────────────────────────────────────────

interface HeaderProps {
  title: string;
  eyebrow?: string;            // small line above the title (date, context)
  display?: boolean;           // use the New York display face
  trailing?: React.ReactNode;
  /** Render as a column toolbar rather than a large title (desktop panes). */
  toolbar?: boolean;
  onTitlePress?: () => void;   // makes the title a menu trigger
}

export function ScreenHeader({ title, eyebrow, display, trailing, toolbar, onTitlePress }: HeaderProps) {
  const insets = useSafeAreaInsets();
  const { compact } = useLayout();
  const { c } = useTheme();
  const asToolbar = toolbar ?? !compact;

  const titleNode = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, flexShrink: 1 }}>
      <Txt
        v={asToolbar ? 'title' : display ? 'display' : 'largeTitle'}
        numberOfLines={1}
        accessibilityRole="header"
        style={[{ flexShrink: 1 }, display && asToolbar && { fontFamily: type.display.fontFamily, fontWeight: '600' }]}
      >
        {title}
      </Txt>
      {onTitlePress ? <Icon name="chevron-down" size={asToolbar ? 16 : 20} color={c.secondaryLabel} style={{ marginTop: space.hair }} /> : null}
    </View>
  );

  return (
    <View style={{
      paddingTop: asToolbar ? space.m : insets.top + space.s,
      paddingBottom: space.s,
      paddingHorizontal: asToolbar ? space.l : space.m,
    }}>
      {eyebrow ? <Txt v="footnote" tone="secondary" semibold style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{eyebrow}</Txt> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.s, minHeight: 44 }}>
        {onTitlePress ? (
          <Tappable feedback="opacity" onPress={onTitlePress} accessibilityLabel={`${title}, switch`} style={{ flexShrink: 1 }}>
            {titleNode}
          </Tappable>
        ) : titleNode}
        {trailing ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>{trailing}</View> : null}
      </View>
    </View>
  );
}

// ─── Primary action capsule (compact, thumb zone) ────────────────────────────

export function PrimaryAction({ label, icon = 'add', onPress }: { label: string; icon?: IconName; onPress: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const insets = useSafeAreaInsets();
  if (!compact) return null;
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel={label}
      style={{
        position: 'absolute', right: space.m,
        bottom: TAB_BAR_HEIGHT + insets.bottom + space.m,
        height: 48, paddingHorizontal: space.l, borderRadius: radius.pill,
        flexDirection: 'row', alignItems: 'center', gap: space.s,
        backgroundColor: c.tint, ...continuous,
        shadowColor: '#000', shadowOpacity: 0.16, shadowRadius: 12, shadowOffset: { width: 0, height: 4 },
      }}
    >
      <Icon name={icon} size={22} color={c.onTint} />
      <Txt v="headline" tone="onTint">{label}</Txt>
    </Tappable>
  );
}

/** Bottom padding so lists can scroll clear of the tab bar + capsule. */
export function useBottomClearance() {
  const insets = useSafeAreaInsets();
  const { compact } = useLayout();
  return compact ? TAB_BAR_HEIGHT + insets.bottom + 48 + space.xl : space.xl;
}

// ─── Columns ─────────────────────────────────────────────────────────────────

/** Screen root with the system background. */
export function Screen({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ flex: 1, backgroundColor: c.background }, style]}>{children}</View>;
}

/**
 * List + detail. On expanded widths shows both side by side separated by a
 * hairline; otherwise renders only the list (detail goes into a sheet).
 */
export function SplitView({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  const { threeColumn } = useLayout();
  const { c } = useTheme();
  if (!threeColumn) return <Screen>{list}</Screen>;
  return (
    <Screen style={{ flexDirection: 'row' }}>
      <View style={{ width: LIST_WIDTH, borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: c.separator }}>
        {list}
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>{detail}</View>
    </Screen>
  );
}

/** Scrollable reading column capped at a comfortable measure. */
export function ReadingColumn({ children, maxWidth = 640, ...rest }: ScrollViewProps & { maxWidth?: number; children: React.ReactNode }) {
  const { compact } = useLayout();
  return (
    <ScrollView
      {...rest}
      contentContainerStyle={[
        { padding: compact ? space.m : space.l, gap: space.l, width: '100%', maxWidth, alignSelf: 'center' },
        rest.contentContainerStyle,
      ]}
    >
      {children}
    </ScrollView>
  );
}

// ─── Inline badge (no pill-soup — one quiet style) ───────────────────────────

export function Tag({ label, tone = 'secondary' }: { label: string; tone?: 'secondary' | 'tint' }) {
  const { c } = useTheme();
  return (
    <View style={{
      paddingHorizontal: space.s, height: 24, justifyContent: 'center',
      borderRadius: radius.control, backgroundColor: tone === 'tint' ? c.tintSoft : c.fill, ...continuous,
    }}>
      <Txt v="caption" tone={tone === 'tint' ? 'tint' : 'secondary'} numberOfLines={1}>{label}</Txt>
    </View>
  );
}

