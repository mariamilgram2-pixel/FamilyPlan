// In-app alert dialog for web (macOS-style: centered, compact, material).
// Enter confirms, Esc cancels. Native platforms use the system Alert instead.

import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { AlertRequest, setAlertListener } from '../../lib/alert';
import { Material } from './Overlays';
import { Tappable, Txt } from './primitives';
import { continuous, radius, space, useTheme } from '../../theme';

export default function AlertHost() {
  const { c } = useTheme();
  const [queue, setQueue] = useState<AlertRequest[]>([]);
  const current = queue[0];

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    setAlertListener(req => setQueue(q => [...q, req]));
    return () => setAlertListener(null);
  }, []);

  function close(ok: boolean) {
    current?.resolve(ok);
    setQueue(q => q.slice(1));
  }

  useEffect(() => {
    if (!current) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); close(false); }
      if (e.key === 'Enter') { e.preventDefault(); close(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [current]);

  if (!current) return null;
  const isConfirm = !!current.confirmLabel;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={() => close(false)}>
      <View style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center', padding: space.l }]}>
        <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: c.scrim }]} onPress={() => close(false)} accessibilityLabel="Dismiss" />
        <Material style={[styles.box, { borderColor: c.separator, shadowColor: c.shadow }]}>
          <View accessibilityRole="alert" style={{ padding: space.m, gap: space.s, alignItems: 'center' }}>
            <Txt v="headline" align="center">{current.title}</Txt>
            {current.message ? <Txt v="footnote" align="center">{current.message}</Txt> : null}
          </View>
          <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.m, paddingBottom: space.m }}>
            {isConfirm && (
              <Tappable feedback="opacity" onPress={() => close(false)} style={[styles.btn, { backgroundColor: c.fill }]}>
                <Txt v="callout">{current.cancelLabel ?? 'Cancel'}</Txt>
              </Tappable>
            )}
            <Tappable
              feedback="opacity"
              onPress={() => close(true)}
              style={[styles.btn, { backgroundColor: isConfirm && current.destructive ? c.danger : c.tint }]}
            >
              <Txt v="callout" semibold style={{ color: isConfirm && current.destructive ? c.background : c.onTint }}>
                {current.confirmLabel ?? 'OK'}
              </Txt>
            </Tappable>
          </View>
        </Material>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 280, maxWidth: '100%', borderRadius: radius.group, overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth, ...continuous,
    shadowOpacity: 0.24, shadowRadius: 32, shadowOffset: { width: 0, height: 12 },
  },
  btn: { flex: 1, height: 32, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', ...continuous },
});
