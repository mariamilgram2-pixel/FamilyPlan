// Ambient sheep. Fine line-art in the app's own palette (no new hues),
// slow motion, purely decorative: hidden from assistive tech and frozen when
// the system asks for reduced motion.
//
// Each sheep is a few stacked layers (legs, body, head) so parts can move
// independently with plain Animated transforms — native-driven on iOS,
// CSS transforms on web.

import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, LayoutChangeEvent, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import { useTheme } from '../theme';

const native = Platform.OS !== 'web';

export function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub?.remove?.();
  }, []);
  return reduced;
}

function useInk() {
  const { c, isDark } = useTheme();
  return {
    wool: isDark ? c.label : c.background,
    woolOpacity: isDark ? 0.9 : 1,
    outline: c.secondaryLabel,
    face: isDark ? c.secondaryLabel : c.label,
    eye: c.background,
  };
}

const hidden = {
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
  pointerEvents: 'none' as const,
  ...(Platform.OS === 'web' ? { 'aria-hidden': true } : {}),
};

// Geometry is authored on a 64×48 grid and scaled.
const W = 64, H = 48;
const WOOL: [number, number, number][] = [
  [7, 21, 3.5],                                     // tail
  [14, 22, 8], [22, 16, 8], [31, 15, 8], [39, 19, 8],
  [41, 27, 7], [33, 31, 8], [23, 32, 8], [13, 29, 7], [26, 24, 10],
];

type Pose = 'graze' | 'walk' | 'rest';

interface SheepProps {
  size?: number;          // rendered width in pt
  pose?: Pose;
  flip?: boolean;         // face left
  delay?: number;         // offsets the loop so a flock doesn't move in unison
  style?: ViewStyle;
}

export function Sheep({ size = 56, pose = 'graze', flip, delay = 0, style }: SheepProps) {
  const ink = useInk();
  const reduced = useReducedMotion();
  const u = size / W;
  const height = H * u;

  const head = useRef(new Animated.Value(0)).current;     // 0 up → 1 grazing
  const nibble = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;
  const stride = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loops: Animated.CompositeAnimation[] = [];

    loops.push(Animated.loop(Animated.sequence([
      Animated.timing(breath, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      Animated.timing(breath, { toValue: 0, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
    ])));

    if (pose === 'graze') {
      // A fresh sequence per use: composite animations keep internal progress.
      const chew = () => Animated.sequence([
        Animated.timing(nibble, { toValue: 1, duration: 220, useNativeDriver: native }),
        Animated.timing(nibble, { toValue: 0, duration: 220, useNativeDriver: native }),
      ]);
      loops.push(Animated.loop(Animated.sequence([
        Animated.delay(1800 + delay),
        Animated.timing(head, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        chew(), Animated.delay(500), chew(), chew(), Animated.delay(900),
        Animated.timing(head, { toValue: 0, duration: 900, easing: Easing.inOut(Easing.quad), useNativeDriver: native }),
        Animated.delay(2600),
      ])));
    }

    if (pose === 'walk') {
      loops.push(Animated.loop(Animated.sequence([
        Animated.timing(stride, { toValue: 1, duration: 280, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
        Animated.timing(stride, { toValue: 0, duration: 280, easing: Easing.inOut(Easing.sin), useNativeDriver: native }),
      ])));
    }

    loops.forEach(l => l.start());
    return () => loops.forEach(l => l.stop());
  }, [reduced, pose, delay]);

  const resting = pose === 'rest';
  const sink = resting ? 7 * u : 0;
  const bob = stride.interpolate({ inputRange: [0, 1], outputRange: [0, -0.8 * u] });
  const breathe = breath.interpolate({ inputRange: [0, 1], outputRange: [1, resting ? 1.035 : 1.02] });
  const headTurn = Animated.add(
    head.interpolate({ inputRange: [0, 1], outputRange: [resting ? 18 : 0, 32] }),
    nibble.interpolate({ inputRange: [0, 1], outputRange: [0, 4] }),
  ).interpolate({ inputRange: [0, 40], outputRange: ['0deg', '40deg'] });
  const legA = stride.interpolate({ inputRange: [0, 1], outputRange: [0, -1.8 * u] });
  const legB = stride.interpolate({ inputRange: [0, 1], outputRange: [-1.8 * u, 0] });

  const layer: ViewStyle = { position: 'absolute', left: 0, top: 0, width: size, height };
  const legs = (xs: number[]) => (
    <Svg width={size} height={height} viewBox={`0 0 ${W} ${H}`}>
      {xs.map(x => <Rect key={x} x={x} y={33} width={3} height={11} rx={1.5} fill={ink.face} />)}
    </Svg>
  );

  // Head lives in a square whose center is the neck, so rotation pivots there.
  const HEAD = 28;
  const neck = { x: 44, y: 18 };

  return (
    <View {...hidden} style={[{ width: size, height }, flip && { transform: [{ scaleX: -1 }] }, style]}>
      {!resting && (
        <>
          <Animated.View style={[layer, { transform: [{ translateY: pose === 'walk' ? legA : 0 }] }]}>{legs([15, 33])}</Animated.View>
          <Animated.View style={[layer, { transform: [{ translateY: pose === 'walk' ? legB : 0 }] }]}>{legs([21, 39])}</Animated.View>
        </>
      )}

      <Animated.View style={[layer, { transform: [{ translateY: Animated.add(bob, sink) }, { scaleY: breathe }] }]}>
        <Svg width={size} height={height} viewBox={`0 0 ${W} ${H}`}>
          {/* Union outline: stroke-colored circles under slightly smaller wool circles. */}
          <G>{WOOL.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r + 1.4} fill={ink.outline} />)}</G>
          <G opacity={ink.woolOpacity}>{WOOL.map(([x, y, r], i) => <Circle key={i} cx={x} cy={y} r={r} fill={ink.wool} />)}</G>
        </Svg>
      </Animated.View>

      <Animated.View
        style={{
          position: 'absolute',
          left: (neck.x - HEAD / 2) * u, top: (neck.y - HEAD / 2) * u,
          width: HEAD * u, height: HEAD * u,
          transform: [{ translateY: Animated.add(bob, sink) }, { rotate: headTurn }],
        }}
      >
        <Svg width={HEAD * u} height={HEAD * u} viewBox={`0 0 ${HEAD} ${HEAD}`}>
          <Ellipse cx={15} cy={11.5} rx={3.4} ry={1.6} fill={ink.face} transform="rotate(-28 15 11.5)" />
          <Ellipse cx={20.5} cy={16} rx={6.6} ry={4.8} fill={ink.face} transform="rotate(24 20.5 16)" />
          <Circle cx={16.5} cy={11} r={3.6} fill={ink.outline} />
          <Circle cx={16.5} cy={11} r={2.4} fill={ink.wool} opacity={ink.woolOpacity} />
          {resting
            ? <Path d="M20 15.2 q1.3 1.1 2.6 0" stroke={ink.eye} strokeWidth={0.9} strokeLinecap="round" fill="none" />
            : <Circle cx={21.4} cy={14.6} r={0.95} fill={ink.eye} />}
        </Svg>
      </Animated.View>
    </View>
  );
}

// ─── Meadow: a quiet strip with a small flock ───────────────────────────────

export function Meadow({ height = 72 }: { height?: number }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [width, setWidth] = useState(0);
  const walker = useRef(new Animated.Value(0)).current;
  const walkerSize = 40;

  useEffect(() => {
    if (!width || reduced) return;
    // ~16pt/s: unhurried, and offscreen most of the time between passes.
    const duration = ((width + walkerSize * 2) / 16) * 1000;
    const loop = Animated.loop(Animated.sequence([
      Animated.delay(4000),
      Animated.timing(walker, { toValue: 1, duration, easing: Easing.linear, useNativeDriver: native }),
      Animated.timing(walker, { toValue: 0, duration: 0, useNativeDriver: native }),
      Animated.delay(9000),
    ]));
    loop.start();
    return () => loop.stop();
  }, [width, reduced]);

  const x = walker.interpolate({ inputRange: [0, 1], outputRange: [-walkerSize - 8, width + 8] });

  return (
    <View
      {...hidden}
      onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
      style={{ height, overflow: 'hidden', justifyContent: 'flex-end' }}
    >
      {width > 0 && (
        <>
          {/* Smaller and facing away reads as farther off. Feet end 4/48 above
              the art's bottom edge, hence the small negative offsets. */}
          <Sheep size={36} pose="graze" delay={2200} flip style={{ position: 'absolute', left: width * 0.62, bottom: -2 }} />
          {!reduced && (
            <Animated.View style={{ position: 'absolute', bottom: -2, transform: [{ translateX: x }] }}>
              <Sheep size={walkerSize} pose="walk" />
            </Animated.View>
          )}
          <Sheep size={52} pose="graze" style={{ position: 'absolute', left: width * 0.14, bottom: -3 }} />
        </>
      )}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator }} />
    </View>
  );
}
