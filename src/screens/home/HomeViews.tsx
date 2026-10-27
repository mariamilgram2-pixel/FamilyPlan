// Home's visual vocabulary: circles for people and plans, thin lines that
// connect them, and as few words as possible. Full sentences live in the
// accessibility labels, so VoiceOver still reads "Chloe invited you to…".

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, ScrollView, StyleSheet, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { Sheep, useReducedMotion } from '../../components/Sheep';
import { Icon, IconName, Menu, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, tabularNums, useTheme } from '../../theme';

const native = Platform.OS !== 'web';

// ─── Collapsible category ────────────────────────────────────────────────────

const COLLAPSED_KEY = 'home_collapsed';

/** Which categories you've folded away, remembered on this device. */
export function useCollapsed() {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  useEffect(() => {
    AsyncStorage.getItem(COLLAPSED_KEY)
      .then(raw => { if (raw) setCollapsed(new Set(JSON.parse(raw))); })
      .catch(() => {});
  }, []);
  function toggle(key: string) {
    setCollapsed(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      AsyncStorage.setItem(COLLAPSED_KEY, JSON.stringify(Array.from(next))).catch(() => {});
      return next;
    });
  }
  return { collapsed, toggle };
}

export function Category({ title, icon, count, open, onToggle, accent, children }: {
  title: string; icon: IconName; count: number; open: boolean; onToggle: () => void; accent?: boolean; children: React.ReactNode;
}) {
  const { c } = useTheme();
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
  }, [open]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['-90deg', '0deg'] });

  return (
    <View style={{ gap: space.s }}>
      <Tappable
        feedback="opacity"
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}, ${count}. ${open ? 'Hide' : 'Show'}`}
        style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44 }}
      >
        <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: accent ? c.tint : c.tintSoft }}>
          <Icon name={icon} size={16} color={accent ? c.onTint : c.tint} />
        </View>
        <Txt v="headline" style={{ flex: 1 }}>{title}</Txt>
        <View style={{ minWidth: 24, height: 24, paddingHorizontal: space.s, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.fill }}>
          <Txt v="footnote" semibold style={tabularNums}>{count}</Txt>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <Icon name="chevron-down" size={18} color={c.secondaryLabel} />
        </Animated.View>
      </Tappable>
      {open ? children : null}
    </View>
  );
}

// ─── Bubbles: a connected row of circles ─────────────────────────────────────

export interface Bubble {
  key: string;
  person?: AvatarPerson;       // shows their face; otherwise `icon`
  icon?: IconName;
  badge: IconName;             // what to do: reply, vote, send, celebrate…
  label: string;               // one or two words
  caption?: string;            // a verb or a tiny when ("Reply", "9d")
  strong?: boolean;            // caption in the tint
  a11y: string;                // the full sentence
  onPress: () => void;
  extra?: { icon: IconName; label: string; a11y?: string; onPress: () => void }; // the main small action under it
  more?: { key: string; label: string; icon: IconName; onSelect: () => void }[];   // tucked behind "⋯"
}

const BUBBLE = 60;
const COL = 84;
const COL_WITH_ACTIONS = 124;   // room for "+ Memories" and "⋯" side by side

export function BubbleRow({ items }: { items: Bubble[] }) {
  const { c } = useTheme();
  const col = items.some(b => b.extra || b.more) ? COL_WITH_ACTIONS : COL;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingVertical: space.hair }}>
      <View style={{ flexDirection: 'row' }}>
        {/* The thread that ties them together, behind the circles. */}
        {items.length > 1 ? (
          <View style={{
            position: 'absolute', top: BUBBLE / 2, left: col / 2, width: col * (items.length - 1),
            height: 2, borderRadius: 1, backgroundColor: c.tint, opacity: 0.35,
          }} />
        ) : null}
        {items.map(b => <BubbleView key={b.key} b={b} col={col} />)}
      </View>
    </ScrollView>
  );
}

function BubbleView({ b, col }: { b: Bubble; col: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: col, alignItems: 'center', gap: 2 }}>
      <Tappable feedback="opacity" onPress={b.onPress} accessibilityLabel={b.a11y} style={{ alignItems: 'center' }}>
        <View style={{
          width: BUBBLE, height: BUBBLE, borderRadius: BUBBLE / 2, padding: 3,
          backgroundColor: c.background, borderWidth: 2, borderColor: b.strong ? c.tint : c.tintSoft,
          alignItems: 'center', justifyContent: 'center',
        }}>
          {b.person ? (
            <Avatar person={b.person} size={BUBBLE - 10} />
          ) : (
            <View style={{ width: BUBBLE - 10, height: BUBBLE - 10, borderRadius: (BUBBLE - 10) / 2, backgroundColor: c.fill, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={b.icon ?? 'sparkles-outline'} size={22} color={c.tint} />
            </View>
          )}
          <View style={{
            position: 'absolute', right: -2, bottom: -2, width: 22, height: 22, borderRadius: 11,
            backgroundColor: c.tint, borderWidth: 2, borderColor: c.background, alignItems: 'center', justifyContent: 'center',
          }}>
            <Icon name={b.badge} size={11} color={c.onTint} />
          </View>
        </View>
        <Txt v="footnote" semibold numberOfLines={2} align="center" style={{ width: col - 8, marginTop: space.hair, lineHeight: 16 }}>{b.label}</Txt>
        {b.caption ? (
          <Txt v="caption" tone={b.strong ? 'tint' : 'secondary'} semibold={b.strong} numberOfLines={1} align="center" style={{ width: col - 8 }}>{b.caption}</Txt>
        ) : null}
      </Tappable>
      {b.extra || b.more ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, marginTop: 2 }}>
          {b.extra ? (
            <Tappable
              feedback="opacity"
              onPress={b.extra.onPress}
              accessibilityLabel={`${b.extra.a11y ?? b.extra.label}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 2, height: 28, paddingHorizontal: space.s, borderRadius: 14, backgroundColor: c.tint }}
            >
              <Icon name={b.extra.icon} size={12} color={c.onTint} />
              <Txt v="caption" tone="onTint" semibold>{b.extra.label}</Txt>
            </Tappable>
          ) : null}
          {b.more ? (
            <Menu title={b.label} sections={[{ items: b.more }]}>
              {(open) => (
                <Tappable
                  feedback="opacity"
                  onPress={open}
                  accessibilityLabel={`More for ${b.label}`}
                  style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tintSoft }}
                >
                  <Icon name="ellipsis-horizontal" size={14} color={c.tint} />
                </Tappable>
              )}
            </Menu>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

// ─── Timeline: date circles on a line ────────────────────────────────────────

export interface Stop {
  key: string;
  day: number;                 // 14
  weekday: string;             // "WED"
  today: boolean;
  title: string;
  time: string;                // "7 PM"
  host?: string | null;        // "Chloe" / "You" — traditions
  people: AvatarPerson[];
  a11y: string;
  onPress: () => void;
}

const DOT = 44;

export function Timeline({ stops }: { stops: Stop[] }) {
  const { c } = useTheme();
  return (
    <View>
      {stops.map((s, i) => (
        <Tappable key={s.key} onPress={s.onPress} accessibilityLabel={s.a11y} style={{ flexDirection: 'row', gap: space.m, borderRadius: radius.row, ...continuous }}>
          {/* Date circle, with the line running through to the next stop. */}
          <View style={{ width: DOT, alignItems: 'center' }}>
            {i > 0 ? <View style={{ position: 'absolute', top: 0, height: space.s, width: 2, backgroundColor: c.tint, opacity: 0.35 }} /> : null}
            {i < stops.length - 1 ? <View style={{ position: 'absolute', top: space.s + DOT, bottom: 0, width: 2, backgroundColor: c.tint, opacity: 0.35 }} /> : null}
            <View style={{
              marginTop: space.s, width: DOT, height: DOT, borderRadius: DOT / 2,
              alignItems: 'center', justifyContent: 'center',
              backgroundColor: s.today ? c.tint : c.background, borderWidth: 2, borderColor: s.today ? c.tint : c.tintSoft,
            }}>
              <Txt v="headline" style={[tabularNums, { lineHeight: 18, color: s.today ? c.onTint : c.label }]}>{s.day}</Txt>
              <Txt v="caption" style={{ fontSize: 9, lineHeight: 11, letterSpacing: 0.4, color: s.today ? c.onTint : c.secondaryLabel }}>{s.weekday}</Txt>
            </View>
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: space.s + 2, minHeight: DOT + space.m, justifyContent: 'center' }}>
            <Txt v="headline" numberOfLines={1}>{s.title}</Txt>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, marginTop: 2 }}>
              <Icon name="time-outline" size={13} color={c.secondaryLabel} />
              <Txt v="footnote" tone="secondary">{s.time}</Txt>
              {s.host ? (
                <>
                  <Icon name="home-outline" size={13} color={s.host === 'You' ? c.tint : c.secondaryLabel} style={{ marginLeft: space.s }} />
                  <Txt v="footnote" tone={s.host === 'You' ? 'tint' : 'secondary'} semibold={s.host === 'You'} numberOfLines={1}>{s.host}</Txt>
                </>
              ) : null}
            </View>
          </View>
          {s.people.length ? (
            <View style={{ justifyContent: 'center' }}>
              <AvatarStack people={s.people} max={3} size={24} />
            </View>
          ) : null}
        </Tappable>
      ))}
    </View>
  );
}

// ─── Hero: the sheep ─────────────────────────────────────────────────────────

/**
 * A sheep you can poke. Tap it and it hops and says something — a summary of
 * your week first, then a rotating pun.
 */
export function Hero({ lines, below }: { lines: string[]; below?: React.ReactNode }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const hop = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;

  function poke() {
    setI(n => (n + 1) % lines.length);
    if (reduced) return;
    hop.setValue(0);
    pop.setValue(0.85);
    Animated.parallel([
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: native }),
        Animated.timing(hop, { toValue: 0, duration: 260, easing: Easing.bounce, useNativeDriver: native }),
      ]),
      Animated.spring(pop, { toValue: 1, friction: 4, tension: 160, useNativeDriver: native }),
    ]).start();
  }

  const lift = hop.interpolate({ inputRange: [0, 1], outputRange: [0, -18] });
  const line = lines[i % lines.length] ?? '';

  return (
    <View style={{ gap: space.m }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.s, minHeight: 92 }}>
        <Tappable feedback="none" onPress={poke} accessibilityLabel={`Sheep says: ${/[.!?]$/.test(line) ? line : `${line}.`} Tap for another.`}>
          <Animated.View style={{ transform: [{ translateY: lift }] }}>
            <Sheep size={84} pose="graze" />
          </Animated.View>
        </Tappable>
        {/* Speech bubble, tail pointing at the sheep. */}
        <Animated.View accessibilityLiveRegion="polite" style={{ flex: 1, marginBottom: 36, transform: [{ scale: pop }] }}>
          <View style={{ position: 'absolute', left: -6, bottom: 12, width: 14, height: 14, backgroundColor: c.fill, transform: [{ rotate: '45deg' }] }} />
          <View style={{ backgroundColor: c.fill, borderRadius: radius.group, paddingHorizontal: space.m, paddingVertical: space.s + 2, alignSelf: 'flex-start', ...continuous }}>
            <Txt v="callout" semibold>{line}</Txt>
          </View>
        </Animated.View>
        <Sheep size={30} pose="graze" flip delay={1600} style={{ marginBottom: 2, opacity: 0.7 }} />
      </View>
      {below}
      <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginTop: below ? 0 : -space.m }} />
    </View>
  );
}
