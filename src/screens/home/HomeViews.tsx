// Home's visual vocabulary: four rounded tiles (each with a little sheep from
// the hillside) that open a panel below, circles for people and plans, thin
// lines that connect them, and as few words as possible. Full sentences live in the
// accessibility labels, so VoiceOver still reads "Chloe invited you to…".

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { Sheep, useReducedMotion } from '../../components/Sheep';
import { Icon, IconButton, IconName, Menu, Tappable, TextInputRef, Txt } from '../../components/ui';
import { continuous, radius, space, tabularNums, type, useTheme, brand } from '../../theme';

const native = Platform.OS !== 'web';

// ─── Tiles: four rounded cards that open a panel below ──────────────────────

const OPEN_KEY = 'home_open_tile';

/**
 * Which tile is open, remembered on this device. One at a time; `null` when
 * all are closed. Until you choose, the first tile with something in it opens.
 */
export function useOpenTile(fallback: string | null) {
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);   // undefined: not chosen yet
  useEffect(() => {
    AsyncStorage.getItem(OPEN_KEY)
      .then(raw => { if (raw !== null) setChosen(raw === 'none' ? null : raw); })
      .catch(() => {});
  }, []);
  function toggle(key: string) {
    setChosen(prev => {
      const current = prev === undefined ? fallback : prev;
      const next = current === key ? null : key;
      AsyncStorage.setItem(OPEN_KEY, next ?? 'none').catch(() => {});
      return next;
    });
  }
  return { open: chosen === undefined ? fallback : chosen, toggle };
}

export interface TileSpec {
  key: string;
  title: string;
  sheep: { source: number; w: number; h: number };   // one of the hillside drawings
  count: number;
  empty: string;            // shown when count is 0: "All caught up"
  accent?: boolean;         // the one that wants attention: olive when it has something
}

/** Two by two. Each tile: a little sheep in its meadow, a count, a serif title. */
export function TileGrid({ tiles, open, onToggle }: { tiles: TileSpec[]; open: string | null; onToggle: (key: string) => void }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s + 2 }}>
      {tiles.map(t => <Tile key={t.key} tile={t} open={open === t.key} onPress={() => onToggle(t.key)} />)}
    </View>
  );
}

function Tile({ tile: t, open, onPress }: { tile: TileSpec; open: boolean; onPress: () => void }) {
  const { c, isDark } = useTheme();
  const lit = !!t.accent && t.count > 0;
  const ink = lit ? c.onTint : c.label;
  const turn = useRef(new Animated.Value(open ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(turn, { toValue: open ? 1 : 0, duration: 180, easing: Easing.out(Easing.quad), useNativeDriver: native }).start();
  }, [open]);
  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const sheepH = 23;
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${t.title}, ${t.count || t.empty}. ${open ? 'Hide' : 'Show'}`}
      style={{
        flexBasis: '45%', flexGrow: 1, minHeight: 100, padding: space.m - 2, justifyContent: 'space-between',
        borderRadius: radius.group, ...continuous,
        backgroundColor: lit ? c.tint : c.fill,
        borderWidth: 2, borderColor: open ? (lit ? c.tintSoft : c.tint) : 'transparent',
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        {/* A little window onto the meadow, the same sage in light and dark so the drawing always reads. */}
        <View style={{
          width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: 5,
          backgroundColor: brand.meadow, opacity: isDark && !lit ? 0.92 : 1,
        }}>
          <Image
            source={t.sheep.source}
            accessibilityIgnoresInvertColors
            style={{ width: (t.sheep.w / t.sheep.h) * sheepH, height: sheepH }}
          />
        </View>
        {t.count > 0 ? (
          <View style={{
            minWidth: 26, height: 26, paddingHorizontal: space.s - 1, borderRadius: 13, alignItems: 'center', justifyContent: 'center',
            backgroundColor: lit ? c.onTint : c.tint,
          }}>
            <Txt v="footnote" semibold style={[tabularNums, { color: lit ? c.tint : c.onTint }]}>{t.count}</Txt>
          </View>
        ) : null}
      </View>
      <View style={{ gap: 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
          <Txt v="title" numberOfLines={1} style={{ color: ink, fontSize: 18, lineHeight: 23, flexShrink: 1 }}>{t.title}</Txt>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Icon name="chevron-down" size={15} color={lit ? c.onTint : c.secondaryLabel} />
          </Animated.View>
        </View>
        {t.count === 0 ? <Txt v="footnote" style={{ color: lit ? c.onTint : c.secondaryLabel }}>{t.empty}</Txt> : null}
      </View>
    </Tappable>
  );
}

/** What an open tile holds, in a soft card under the grid. */
export function TilePanel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <View style={{ backgroundColor: c.fill, borderRadius: radius.group, paddingVertical: space.m, gap: space.s, ...continuous }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.m, paddingRight: space.s }}>
        <Txt v="title" style={{ fontSize: 20, lineHeight: 25 }}>{title}</Txt>
        <IconButton icon="close" label={`Hide ${title}`} onPress={onClose} />
      </View>
      <View style={{ paddingHorizontal: space.m }}>{children}</View>
    </View>
  );
}

// ─── Plan bar: where planning starts ─────────────────────────────────────────

/**
 * A big, friendly field that says "Plan something…". The first keystroke
 * opens New Plan with what you typed; the arrow opens it empty.
 */
export function PlanBar({ inputRef, onType, onOpen }: {
  inputRef?: React.Ref<TextInputRef>; onType: (text: string) => void; onOpen: () => void;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: space.s,
      height: 64, paddingLeft: space.l - 4, paddingRight: space.s, borderRadius: radius.pill, ...continuous,
      backgroundColor: c.fill, borderWidth: 2, borderColor: focused ? c.tint : 'transparent',
    }}>
      <Icon name="sparkles" size={20} color={c.tint} />
      <TextInput
        ref={inputRef}
        value=""
        onChangeText={(t) => { if (t) onType(t); }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        placeholder="Plan something…"
        placeholderTextColor={c.secondaryLabel}
        accessibilityLabel="Plan something. Describe it in your own words"
        accessibilityHint="Opens New Plan with what you type"
        style={[type.body, { flex: 1, minWidth: 0, fontSize: 18, color: c.label }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
      />
      <Tappable
        feedback="opacity"
        onPress={onOpen}
        accessibilityLabel="New plan"
        style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tint }}
      >
        <Icon name="arrow-forward" size={20} color={c.onTint} />
      </Tappable>
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
