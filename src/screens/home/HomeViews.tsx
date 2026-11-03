// Home's visual vocabulary: four rounded tiles (each with a little sheep from
// the hillside) that open a panel below, circles for people and plans, thin
// lines that connect them, and as few words as possible. Full sentences live in the
// accessibility labels, so VoiceOver still reads "Chloe invited you to…".

import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, Platform, ScrollView, TextInput, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { Sheep, useReducedMotion } from '../../components/Sheep';
import { Icon, IconName, Menu, Tappable, TextInputRef, Txt } from '../../components/ui';
import { continuous, radius, space, tabularNums, type, useTheme, brand } from '../../theme';

const native = Platform.OS !== 'web';

// ─── Your plans: the home view, behind the sheep's bubble ────────────────────
// Its own screen. Each section is its own shape, so the eye moves down the
// page instead of along a stack of the same box: a big number and faces
// (Your turn), calendar-page tickets (Coming up), tilted polaroids (How was
// it?), and pills (Make plans). Each opens to show everything, and closes again.

const OPEN_KEY = 'home_open_tile';

/** Which section is opened all the way, remembered on this device. */
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

type SheepArt = { source: number; w: number; h: number };   // one of the hillside drawings

/** A sheep in its little meadow, the same sage in light and dark so the drawing always reads. */
function Meadow({ sheep, size = 38 }: { sheep: SheepArt; size?: number }) {
  const { isDark } = useTheme();
  const h = size * 0.6;
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'flex-end', paddingBottom: size * 0.13,
      backgroundColor: brand.meadow, opacity: isDark ? 0.92 : 1,
    }}>
      <Image source={sheep.source} accessibilityIgnoresInvertColors style={{ width: (sheep.w / sheep.h) * h, height: h }} />
    </View>
  );
}

/** On the home view, up top: a round + to start a plan. */
export function NewPlanButton({ onPress }: { onPress: () => void }) {
  const { c } = useTheme();
  return (
    <Tappable
      feedback="opacity"
      onPress={onPress}
      accessibilityLabel="New plan"
      style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tint }}
    >
      <Icon name="add" size={24} color={c.onTint} />
    </Tappable>
  );
}

/**
 * A section's top: a little sheep, the name, a line under it if there's
 * something to say, and See all / Show less when there's more than the short
 * look shows.
 */
export function SectionTop({ title, sheep, hint, open, onToggle, canOpen }: {
  title: string; sheep: SheepArt; hint?: string | null;
  open: boolean; onToggle: () => void; canOpen: boolean;
}) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s + 2 }}>
      <Meadow sheep={sheep} size={32} />
      <View style={{ flex: 1, gap: 1 }}>
        <Txt v="headline">{title}</Txt>
        {hint ? <Txt v="footnote" tone="secondary">{hint}</Txt> : null}
      </View>
      {canOpen ? (
        <Tappable onPress={onToggle} accessibilityLabel={open ? `Show less of ${title}` : `See all of ${title}`} hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: space.hair, borderRadius: 6 }}>
          <Txt v="footnote" tone="tint" semibold>{open ? 'Show less' : 'See all'}</Txt>
          <Icon name={open ? 'chevron-up' : 'chevron-forward'} size={13} color={c.tint} />
        </Tappable>
      ) : null}
    </View>
  );
}

/** Coming up, as calendar pages to swipe through: the weekday on an olive band, the date big. */
export function TicketRow({ stops }: { stops: Stop[] }) {
  const { c } = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.s + 2, paddingVertical: space.hair, paddingRight: space.m }}>
      {stops.map(st => (
        <Tappable
          key={st.key}
          feedback="opacity"
          onPress={st.onPress}
          accessibilityLabel={st.a11y}
          style={{
            width: 136, borderRadius: radius.block, overflow: 'hidden', backgroundColor: c.card, borderWidth: 1, borderColor: c.separator,
            shadowColor: c.shadow, shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 1,
          }}
        >
          <View style={{ backgroundColor: c.tint, paddingVertical: space.hair + 1, alignItems: 'center' }}>
            <Txt v="caption" semibold style={{ color: c.onTint, letterSpacing: 1 }}>{st.today ? 'TODAY' : st.weekday}</Txt>
          </View>
          <View style={{ padding: space.s + 2, gap: space.hair }}>
            <Txt v="largeTitle" style={[tabularNums, { fontSize: 36, lineHeight: 40 }]}>{st.day}</Txt>
            <Txt v="footnote" semibold numberOfLines={2} style={{ minHeight: 36 }}>{st.title}</Txt>
            <Txt v="caption" tone="secondary" numberOfLines={1}>{st.host ? `${st.time} · ${st.host}` : st.time}</Txt>
            {st.people.length ? (
              <View style={{ flexDirection: 'row', marginTop: space.hair }}>
                {st.people.slice(0, 4).map((p, i) => (
                  <View key={p.id} style={{ marginLeft: i ? -6 : 0 }}><Avatar person={p} size={22} ring ringColor={c.card} /></View>
                ))}
              </View>
            ) : null}
          </View>
        </Tappable>
      ))}
    </ScrollView>
  );
}

/** How was it?, as polaroids: a face in a white frame, a little tilted, + Memories under it. */
export function Polaroids({ items, wrap }: { items: Bubble[]; wrap?: boolean }) {
  const { c } = useTheme();
  const cards = items.map((b, i) => (
    <View key={b.key} style={{ transform: [{ rotate: i % 2 ? '2.5deg' : '-2.5deg' }], paddingVertical: space.s }}>
      <Tappable
        feedback="opacity"
        onPress={b.onPress}
        accessibilityLabel={b.a11y}
        style={{
          width: 132, padding: space.s, paddingBottom: space.m, borderRadius: 4, backgroundColor: c.card, gap: space.s,
          shadowColor: c.shadow, shadowOpacity: 0.12, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2,
        }}
      >
        <View style={{ width: 116, height: 116, borderRadius: 2, overflow: 'hidden', backgroundColor: brand.meadow, alignItems: 'center', justifyContent: 'center' }}>
          {b.person ? <Avatar person={b.person} size={116} style={{ borderRadius: 2 }} /> : <Icon name={b.icon ?? 'images-outline'} size={32} color={brand.olive} />}
        </View>
        <View style={{ gap: 1 }}>
          <Txt v="footnote" semibold numberOfLines={1}>{b.label}</Txt>
          {b.caption ? <Txt v="caption" tone="secondary">{b.caption}</Txt> : null}
        </View>
        {b.extra ? (
          <Tappable onPress={b.extra.onPress} accessibilityLabel={b.extra.a11y ?? b.extra.label} hitSlop={6}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start', borderRadius: 6 }}>
            <Icon name={b.extra.icon} size={13} color={c.tint} />
            <Txt v="footnote" tone="tint" semibold>{b.extra.label}</Txt>
          </Tappable>
        ) : null}
      </Tappable>
      {b.more ? (
        <View style={{ position: 'absolute', top: space.s + 4, right: 4 }}>
          <Menu title={b.label} sections={[{ items: b.more }]}>
            {(open) => (
              <Tappable feedback="opacity" onPress={open} accessibilityLabel={`More for ${b.label}`} hitSlop={8}
                style={{ width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card, borderWidth: 1, borderColor: c.separator }}>
                <Icon name="ellipsis-horizontal" size={13} color={c.label} />
              </Tappable>
            )}
          </Menu>
        </View>
      ) : null}
    </View>
  ));
  return wrap
    ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.m }}>{cards}</View>
    : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.m, paddingHorizontal: space.hair, paddingRight: space.m }}>{cards}</ScrollView>;
}

/** Make plans, as pills: a face, a name, and when ("in 9d"), with a small icon for why. */
export function PillCloud({ items }: { items: Bubble[] }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
      {items.map(b => (
        <Tappable
          key={b.key}
          feedback="opacity"
          onPress={b.onPress}
          accessibilityLabel={b.a11y}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.hair, paddingRight: space.m - 2, height: 40, borderRadius: radius.pill, backgroundColor: c.tintSoft }}
        >
          {b.person ? <Avatar person={b.person} size={32} /> : <Icon name={b.icon ?? 'sparkles-outline'} size={18} color={c.tint} />}
          <Txt v="footnote" semibold>{b.label}</Txt>
          {b.caption ? <Txt v="caption" tone="secondary">{b.caption}</Txt> : null}
          <Icon name={b.badge} size={13} color={c.tint} />
        </Tappable>
      ))}
    </View>
  );
}

// ─── Plan bar: where planning starts ─────────────────────────────────────────

/**
 * A big, friendly field that says "Plan something…". Typing stays right here:
 * the box grows to fit, and Save under it opens New Plan with what you wrote,
 * the title already done, for who, when and where (or just saving it). With
 * nothing typed, the arrow opens New Plan empty.
 */
export function PlanBar({ inputRef, onSave, onOpen }: {
  inputRef?: React.Ref<TextInputRef>;
  onSave: (text: string) => void;
  onOpen: () => void;
}) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const [height, setHeight] = useState(0);   // the text's own height, so the box grows line by line
  const typed = text.trim();
  const save = () => { if (!typed) return; setText(''); onSave(typed); };
  return (
    <View style={{
      gap: space.s, paddingLeft: space.l - 4, paddingRight: space.s, paddingVertical: typed ? space.m : space.s,
      borderRadius: typed ? radius.group : radius.pill, ...continuous,
      backgroundColor: c.fill, borderWidth: 2, borderColor: focused ? c.tint : 'transparent',
    }}>
      <View style={{ flexDirection: 'row', alignItems: typed ? 'flex-start' : 'center', gap: space.s, minHeight: typed ? 0 : 44 }}>
        <Icon name="sparkles" size={20} color={c.tint} style={typed ? { marginTop: 3 } : undefined} />
        <TextInput
          ref={inputRef}
          value={text}
          onChangeText={setText}
          multiline
          numberOfLines={1}
          onContentSizeChange={e => setHeight(e.nativeEvent.contentSize.height)}
          blurOnSubmit
          onSubmitEditing={save}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="What should we do?"
          placeholderTextColor={c.secondaryLabel}
          accessibilityLabel="Plan something. Describe it in your own words"
          style={[type.body, { flex: 1, minWidth: 0, fontSize: 18, color: c.label, height: Math.min(120, Math.max(24, height)), paddingTop: 0, paddingBottom: 0 }, Platform.OS === 'web' && ({ outlineStyle: 'none' } as any)]}
        />
        {typed ? null : (
          <Tappable
            feedback="opacity"
            onPress={onOpen}
            accessibilityLabel="New plan"
            style={{ width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tint }}
          >
            <Icon name="arrow-forward" size={20} color={c.onTint} />
          </Tappable>
        )}
      </View>
      {typed ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: space.s }}>
          <Tappable
            feedback="opacity"
            onPress={save}
            accessibilityLabel="Save, then add who, when and where"
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, height: 40, paddingHorizontal: space.l, borderRadius: radius.pill, backgroundColor: c.tint }}
          >
            <Txt v="callout" semibold style={{ color: c.onTint }}>Save</Txt>
          </Tappable>
        </View>
      ) : null}
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
const COL_WITH_ACTIONS = 100;   // room for "+ Memories" under the circle

/** In a row joined by a thread; `wrap` lays them out in rows instead, to see them all at once. */
export function BubbleRow({ items, wrap }: { items: Bubble[]; wrap?: boolean }) {
  const { c } = useTheme();
  const col = items.some(b => b.extra || b.more) ? COL_WITH_ACTIONS : COL;
  if (wrap) {
    return (
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: space.m, paddingVertical: space.hair }}>
        {items.map(b => <BubbleView key={b.key} b={b} col={col} />)}
      </View>
    );
  }
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
      {/* The main small action, as a plain link under the name. */}
      {b.extra ? (
        <Tappable
          feedback="opacity"
          onPress={b.extra.onPress}
          accessibilityLabel={`${b.extra.a11y ?? b.extra.label}`}
          hitSlop={6}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 2, borderRadius: 6 }}
        >
          <Icon name={b.extra.icon} size={13} color={c.tint} />
          <Txt v="footnote" tone="tint" semibold>{b.extra.label}</Txt>
        </Tappable>
      ) : null}
      {/* "⋯" tucked on the circle's top-right, opposite its badge. */}
      {b.more ? (
        <View style={{ position: 'absolute', top: -2, left: col / 2 + BUBBLE / 2 - 18 }}>
          <Menu title={b.label} sections={[{ items: b.more }]}>
            {(open) => (
              <Tappable
                feedback="opacity"
                onPress={open}
                accessibilityLabel={`More for ${b.label}`}
                hitSlop={8}
                style={{ width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.background, borderWidth: 1, borderColor: c.separator }}
              >
                <Icon name="ellipsis-horizontal" size={13} color={c.label} />
              </Tappable>
            )}
          </Menu>
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
 * The top of Home: a sheep with something to say, then the mission and the
 * box to plan in. The bubble is the way to everything that needs you — tap
 * it for Your turn, Coming up, How was it? and Make plans. Poke the sheep
 * for a pun; it goes back to what's what after a moment.
 */
export function Hero({ lines, onBubble, bubbleHint, below }: {
  lines: string[];            // first: what's what ("5 things need you"); then puns
  onBubble: () => void;
  bubbleHint: string;         // what tapping the bubble opens, for screen readers
  below?: React.ReactNode;
}) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);
  const hop = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const back = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (back.current) clearTimeout(back.current); }, []);

  function poke() {
    setI(n => (n + 1) % lines.length);
    if (back.current) clearTimeout(back.current);
    back.current = setTimeout(() => setI(0), 4000);
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
    <View style={{ gap: space.l, paddingTop: space.m }}>
      <View style={{ alignItems: 'center', gap: space.s }}>
        {/* Speech bubble, tail pointing down at the sheep: tap it for what needs you. */}
        <Animated.View accessibilityLiveRegion="polite" style={{ transform: [{ scale: pop }], alignItems: 'center' }}>
          <Tappable
            feedback="opacity"
            onPress={onBubble}
            accessibilityLabel={`Sheep says: ${line}. ${bubbleHint}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, backgroundColor: c.fill, borderRadius: radius.group, paddingHorizontal: space.m, paddingVertical: space.s + 2, ...continuous }}
          >
            <Txt v="callout" semibold>{line}</Txt>
            <Icon name="chevron-forward" size={16} color={c.tint} />
          </Tappable>
          <View style={{ width: 14, height: 14, marginTop: -8, backgroundColor: c.fill, transform: [{ rotate: '45deg' }] }} />
        </Animated.View>
        <Tappable feedback="none" onPress={poke} accessibilityLabel="Poke the sheep">
          <Animated.View style={{ transform: [{ translateY: lift }] }}>
            <Sheep size={120} pose="graze" />
          </Animated.View>
        </Tappable>
      </View>
      <Txt v="largeTitle" align="center" accessibilityRole="header">Make plans happen.</Txt>
      {below}
    </View>
  );
}
