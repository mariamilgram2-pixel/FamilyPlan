// Swipe a row left to reveal actions behind it, like Messages: Hide, Delete.
// Past halfway (or a flick) it stays open; tapping the row closes it. Only
// one row is open at a time: the list owns which, through `open`. The row's
// own taps go through `guard`, so the tap a browser sends at the end of a
// swipe doesn't also open it.

import React, { useEffect, useRef } from 'react';
import { Animated, PanResponder, Platform, StyleSheet, View } from 'react-native';
import { Icon, IconName, Tappable, Txt } from './ui';
import { useTheme } from '../theme';

export interface SwipeAction {
  key: string;
  label: string;
  icon: IconName;
  destructive?: boolean;
  onPress: () => void;
}

const ACTION_WIDTH = 78;
const native = Platform.OS !== 'web';

export default function SwipeRow({ actions, open, onOpenChange, children }: {
  actions: SwipeAction[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: (guard: (fn: () => void) => () => void) => React.ReactNode;
}) {
  const { c } = useTheme();
  const total = actions.length * ACTION_WIDTH;
  const x = useRef(new Animated.Value(0)).current;
  const state = useRef({ open, total, onOpenChange });
  const dragged = useRef(false);   // mid-swipe, or just after: a tap now isn't one
  state.current = { open, total, onOpenChange };

  const settle = (toOpen: boolean) =>
    Animated.spring(x, { toValue: toOpen ? -state.current.total : 0, friction: 9, tension: 80, useNativeDriver: native }).start();

  useEffect(() => { settle(open); }, [open, total]);

  const pan = useRef(PanResponder.create({
    // Sideways drags only, so the list still scrolls; capture so the row's own tap doesn't fire.
    onMoveShouldSetPanResponderCapture: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { dragged.current = true; },
    onPanResponderMove: (_, g) => {
      const base = state.current.open ? -state.current.total : 0;
      x.setValue(Math.min(0, Math.max(-state.current.total - 40, base + g.dx)));
    },
    onPanResponderRelease: (_, g) => {
      const base = state.current.open ? -state.current.total : 0;
      const toOpen = g.vx < -0.5 || (g.vx <= 0.5 && base + g.dx < -state.current.total / 2);
      settle(toOpen);
      if (toOpen !== state.current.open) state.current.onOpenChange(toOpen);
      setTimeout(() => { dragged.current = false; }, 250);
    },
    onPanResponderTerminate: () => { settle(state.current.open); setTimeout(() => { dragged.current = false; }, 250); },
  })).current;

  // Taps on the row: ignored right after a swipe; while open, they close it.
  const guard = (fn: () => void) => () => {
    if (dragged.current) return;
    if (state.current.open) { state.current.onOpenChange(false); return; }
    fn();
  };

  if (!actions.length) return <>{children(fn => fn)}</>;

  return (
    <View style={{ overflow: 'hidden' }}>
      <View style={[StyleSheet.absoluteFill, { flexDirection: 'row', justifyContent: 'flex-end' }]}>
        {actions.map(a => (
          <Tappable
            key={a.key}
            feedback="opacity"
            accessibilityLabel={a.label}
            onPress={() => { onOpenChange(false); a.onPress(); }}
            style={{
              width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center', gap: 2,
              backgroundColor: a.destructive ? c.danger : c.fill,
            }}
          >
            <Icon name={a.icon} size={20} color={a.destructive ? '#FFFFFF' : c.tint} />
            <Txt v="caption" semibold style={{ color: a.destructive ? '#FFFFFF' : c.tint }}>{a.label}</Txt>
          </Tappable>
        ))}
      </View>
      <Animated.View {...pan.panHandlers} style={{ transform: [{ translateX: x }], backgroundColor: c.background }}>
        {children(guard)}
      </Animated.View>
    </View>
  );
}
