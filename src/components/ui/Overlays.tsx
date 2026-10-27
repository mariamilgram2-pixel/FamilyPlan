// Layered surfaces: translucent material, sheets, and menus.
//
// Sheets: native page sheet on iOS; a centered panel on desktop (Esc closes,
// ⌘↩ confirms); a bottom panel on narrow web.
// Menus: an anchored popover next to the trigger on desktop (short pointer
// travel), a bottom action sheet in the thumb zone on touch.

import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView,
  StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon, IconName, Tappable, Txt, ViewRef } from './primitives';
import { continuous, radius, space, useLayout, useTheme } from '../../theme';

// ─── Material ────────────────────────────────────────────────────────────────

export function Material({ style, children }: { style?: StyleProp<ViewStyle>; children?: React.ReactNode }) {
  const { c } = useTheme();
  if (Platform.OS === 'ios') {
    return <BlurView tint="systemChromeMaterial" intensity={100} style={style}>{children}</BlurView>;
  }
  if (Platform.OS === 'web') {
    return (
      <View style={[{
        backgroundColor: c.material,
        backdropFilter: 'saturate(180%) blur(20px)',
        WebkitBackdropFilter: 'saturate(180%) blur(20px)',
      } as any, style]}>
        {children}
      </View>
    );
  }
  return <View style={[{ backgroundColor: c.background }, style]}>{children}</View>;
}

// ─── Keyboard helper (web) ───────────────────────────────────────────────────

function useKeys(active: boolean, handlers: { escape?: () => void; submit?: () => void }) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (Platform.OS !== 'web' || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); ref.current.escape?.(); }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); ref.current.submit?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);
}

// ─── Sheet ───────────────────────────────────────────────────────────────────

interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title: string;
  action?: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean };
  cancelLabel?: string;
  scroll?: boolean;
  width?: number;
  children: React.ReactNode;
}

export function Sheet({ visible, onClose, title, action, cancelLabel, scroll = true, width = 560, children }: SheetProps) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const insets = useSafeAreaInsets();
  const nativeSheet = Platform.OS === 'ios';

  useKeys(visible, {
    escape: onClose,
    submit: () => { if (action && !action.disabled && !action.loading) action.onPress(); },
  });

  const header = (
    <View style={styles.sheetHeader}>
      <View style={styles.sheetSide}>
        <Tappable feedback="opacity" onPress={onClose} style={styles.sheetBtn} accessibilityLabel={cancelLabel ?? (action ? 'Cancel' : 'Close')}>
          <Txt v="body" tone="tint">{cancelLabel ?? (action ? 'Cancel' : 'Close')}</Txt>
        </Tappable>
      </View>
      <Txt v="headline" numberOfLines={1} style={{ flexShrink: 1 }} accessibilityRole="header">{title}</Txt>
      <View style={[styles.sheetSide, { alignItems: 'flex-end' }]}>
        {action ? (
          <Tappable
            feedback="opacity"
            onPress={action.onPress}
            disabled={action.disabled || action.loading}
            style={styles.sheetBtn}
            accessibilityLabel={action.label}
          >
            {action.loading ? <ActivityIndicator color={c.tint} /> : <Txt v="headline" tone="tint">{action.label}</Txt>}
          </Tappable>
        ) : null}
      </View>
    </View>
  );

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: space.m, paddingBottom: space.xxl + insets.bottom, gap: space.l }}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : <View style={{ flex: 1 }}>{children}</View>;

  if (nativeSheet) {
    return (
      <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.background }} behavior="padding">
          {header}
          {body}
        </KeyboardAvoidingView>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[StyleSheet.absoluteFill, { justifyContent: compact ? 'flex-end' : 'center', alignItems: 'center' }]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={onClose} accessibilityLabel="Dismiss" />
        <View
          accessibilityViewIsModal
          style={[
            { backgroundColor: c.background, overflow: 'hidden', ...continuous },
            compact
              ? { width: '100%', height: '92%', borderTopLeftRadius: radius.sheet, borderTopRightRadius: radius.sheet }
              : {
                  width, maxWidth: '92%', height: '80%', maxHeight: 720, borderRadius: radius.sheet,
                  shadowColor: c.shadow, shadowOpacity: 0.24, shadowRadius: 40, shadowOffset: { width: 0, height: 16 },
                },
          ]}
        >
          {header}
          {body}
        </View>
      </View>
    </Modal>
  );
}

// ─── Menu ────────────────────────────────────────────────────────────────────

export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  leading?: React.ReactNode;   // in place of the icon, e.g. a group's avatar
  checked?: boolean;
  destructive?: boolean;
  onSelect: () => void;
}
export interface MenuSection { title?: string; items: MenuItem[] }

interface MenuProps {
  sections: MenuSection[];
  title?: string;   // shown atop the action sheet on touch
  children: (open: () => void) => React.ReactNode;
}

const POPOVER_WIDTH = 248;

export function Menu({ sections, title, children }: MenuProps) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const { width: winW, height: winH } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const anchorRef = useRef<ViewRef>(null);
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const popover = Platform.OS === 'web' && !compact;

  useKeys(open, { escape: () => setOpen(false) });

  function show() {
    if (popover && anchorRef.current) {
      anchorRef.current.measureInWindow((x, y, w, h) => { setAnchor({ x, y, w, h }); setOpen(true); });
    } else {
      setOpen(true);
    }
  }

  function pick(item: MenuItem) {
    setOpen(false);
    // Let the overlay unmount before the action opens a sheet of its own.
    setTimeout(item.onSelect, Platform.OS === 'ios' ? 350 : 0);
  }

  const visibleSections = sections.filter(s => s.items.length > 0);

  let overlay: React.ReactNode = null;
  if (open && popover && anchor) {
    const left = Math.max(space.s, Math.min(anchor.x + anchor.w - POPOVER_WIDTH, winW - POPOVER_WIDTH - space.s));
    const top = anchor.y + anchor.h + space.hair;
    overlay = (
      <Modal visible transparent animationType="none" onRequestClose={() => setOpen(false)}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        <Material style={[styles.popover, { left, top, maxHeight: winH - top - space.m, borderColor: c.separator, shadowColor: c.shadow }]}>
          <ScrollView contentContainerStyle={{ padding: space.hair + 2 }}>
            {visibleSections.map((s, si) => (
              <View key={si}>
                {si > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginVertical: space.hair, marginHorizontal: space.s }} />}
                {s.title ? <Txt v="caption" tone="secondary" style={{ paddingHorizontal: space.s, paddingVertical: space.hair }}>{s.title}</Txt> : null}
                {s.items.map(it => (
                  <Tappable key={it.key} onPress={() => pick(it)} accessibilityRole="menuitem" style={styles.popItem}>
                    <View style={{ width: 16, alignItems: 'center' }}>
                      {it.checked ? <Icon name="checkmark" size={14} color={c.tint} /> : null}
                    </View>
                    {it.leading ?? null}
                    <Txt v="callout" tone={it.destructive ? 'danger' : 'primary'} numberOfLines={1} style={{ flex: 1 }}>{it.label}</Txt>
                    {it.icon ? <Icon name={it.icon} size={16} color={it.destructive ? c.danger : c.secondaryLabel} /> : null}
                  </Tappable>
                ))}
              </View>
            ))}
          </ScrollView>
        </Material>
      </Modal>
    );
  } else if (open) {
    overlay = (
      <Modal visible transparent animationType="slide" onRequestClose={() => setOpen(false)}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={() => setOpen(false)} accessibilityLabel="Close menu" />
        <View style={{ flex: 1, justifyContent: 'flex-end', padding: space.s, paddingBottom: Math.max(insets.bottom, space.s), gap: space.s }} pointerEvents="box-none">
          <Material style={styles.actionGroup}>
            <ScrollView style={{ maxHeight: winH * 0.6 }} bounces={false}>
              {title ? <Txt v="footnote" tone="secondary" align="center" style={{ padding: space.m }}>{title}</Txt> : null}
              {visibleSections.map((s, si) => (
                <View key={si}>
                  {(si > 0 || title) && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />}
                  {s.title ? <Txt v="caption" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.s }}>{s.title}</Txt> : null}
                  {s.items.map((it, ii) => (
                    <React.Fragment key={it.key}>
                      {ii > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />}
                      <Tappable onPress={() => pick(it)} accessibilityRole="menuitem" style={styles.sheetItem}>
                        {it.leading ?? (it.icon ? <Icon name={it.icon} size={22} color={it.destructive ? c.danger : c.tint} /> : null)}
                        <Txt v="body" tone={it.destructive ? 'danger' : 'tint'} style={{ flex: 1 }} numberOfLines={1}>{it.label}</Txt>
                        {it.checked ? <Icon name="checkmark" size={20} color={c.tint} /> : null}
                      </Tappable>
                    </React.Fragment>
                  ))}
                </View>
              ))}
            </ScrollView>
          </Material>
          <Tappable onPress={() => setOpen(false)} style={[styles.actionGroup, styles.cancel, { backgroundColor: c.background }]}>
            <Txt v="headline" tone="tint">Cancel</Txt>
          </Tappable>
        </View>
      </Modal>
    );
  }

  return (
    <>
      <View ref={anchorRef} collapsable={false}>{children(show)}</View>
      {overlay}
    </>
  );
}

const styles = StyleSheet.create({
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    height: 56, paddingHorizontal: space.s,
  },
  sheetSide: { width: 104 },
  sheetBtn: { minHeight: 44, minWidth: 44, justifyContent: 'center', paddingHorizontal: space.s },

  popover: {
    position: 'absolute', width: POPOVER_WIDTH, borderRadius: radius.row,
    borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden',
    shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
  },
  popItem: {
    flexDirection: 'row', alignItems: 'center', gap: space.s,
    height: 32, paddingHorizontal: space.s, borderRadius: radius.control,
  },

  actionGroup: { borderRadius: radius.group, overflow: 'hidden', ...continuous },
  sheetItem: { flexDirection: 'row', alignItems: 'center', gap: space.m, minHeight: 56, paddingHorizontal: space.m },
  cancel: { minHeight: 56, alignItems: 'center', justifyContent: 'center' },
});
