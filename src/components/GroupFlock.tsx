// A group's picture: its flock. One little sheep per member on a small hill,
// on a soft wash of the group's calendar color, so a group looks like how
// many of you there are, and the same color it is on the calendar.
//
//   GroupFlock      round, for lists and pins: one to three sheep
//   FlockCover      a card or header: up to eight sheep, then "+N"
//
// A group that uploads its own photo still shows that photo.

import React, { useMemo, useState } from 'react';
import { Image, StyleProp, View, ViewStyle } from 'react-native';
import { Group } from '../types';
import { DEMO_EXTRA_GROUPS, isDemoGroup } from '../lib/demo';
import { isCalendar } from '../lib/groups';
import { calendarColor, tintOf } from '../lib/calendarColors';
import { useCalendarColors } from '../lib/calendarColorsStore';
import { useGroup } from '../contexts/GroupContext';
import { useVisibleGroups } from './GroupSwitcher';
import { ART } from '../screens/home/FieldFlock';
import { brand, useTheme } from '../theme';
import { Txt } from './ui';

type FlockGroup = Pick<Group, 'id' | 'name'> & Partial<Group>;

/**
 * A group's calendar color, the same one Calendar colors and the calendar
 * use: your pick, else the palette by the group's place in your calendars.
 */
export function useGroupColor() {
  const { prefs } = useCalendarColors();
  const visible = useVisibleGroups();
  const { activeGroup } = useGroup();
  const isDemo = isDemoGroup(activeGroup);
  const order = useMemo(() => [
    ...visible.filter(isCalendar).map(g => g.id),
    ...visible.filter(g => !isCalendar(g)).map(g => g.id),
    ...(isDemo ? DEMO_EXTRA_GROUPS.map(g => g.group.id).filter(id => !visible.some(v => v.id === id)) : []),
  ], [visible, isDemo]);
  const own = useMemo(() => new Map(visible.map(g => [g.id, g.avatar_color ?? null])), [visible]);
  return (groupId: string, color?: string | null) => calendarColor(groupId, prefs, order, color ?? own.get(groupId));
}

const POSES = [ART.standing1, ART.grazing1, ART.standing3, ART.lying1, ART.grazing2, ART.sitting1, ART.standing2, ART.lying2];

// Where each sheep stands, filled in order: x across, b up from the bottom
// (fractions of the picture), and how tall, so the flock clusters on the hill.
// On a card the name sits bottom-left, so the flock grazes on a hill to the
// right, standing just above the name.
const CARD_SLOTS = [
  { x: 0.72, b: 0.5, h: 0.19 }, { x: 0.88, b: 0.48, h: 0.18 }, { x: 0.58, b: 0.5, h: 0.17 },
  { x: 0.8, b: 0.61, h: 0.15 }, { x: 0.94, b: 0.6, h: 0.15 }, { x: 0.66, b: 0.62, h: 0.14 },
  { x: 0.48, b: 0.55, h: 0.14 }, { x: 0.87, b: 0.7, h: 0.13 },
];
const ROUND_SLOTS: { x: number; b: number; h: number }[][] = [
  [{ x: 0.5, b: 0.16, h: 0.48 }],
  [{ x: 0.34, b: 0.18, h: 0.4 }, { x: 0.66, b: 0.14, h: 0.42 }],
  [{ x: 0.3, b: 0.16, h: 0.34 }, { x: 0.7, b: 0.14, h: 0.36 }, { x: 0.5, b: 0.36, h: 0.3 }],
];

function Sheep({ n, x, b, h, w: boxW, box: boxH }: { n: number; x: number; b: number; h: number; w: number; box: number }) {
  const art = POSES[n % POSES.length];
  const height = h * boxH;
  const width = (art.w / art.h) * height;
  return (
    <Image
      source={art.source}
      accessibilityIgnoresInvertColors
      style={{
        position: 'absolute', left: x * boxW - width / 2, bottom: b * boxH, width, height,
        transform: n % 3 === 1 ? [{ scaleX: -1 }] : undefined,
      }}
    />
  );
}

/** The hill: a gentle curve of meadow, with its darker crest line. `from` is where it starts across. */
function Hill({ w, h, rise, from = -0.25, curve = 1 }: { w: number; h: number; rise: number; from?: number; curve?: number }) {
  const top = h * (1 - rise);
  return (
    <View pointerEvents="none" style={{ position: 'absolute', left: w * from, right: -w * 0.25, top, bottom: -h, borderTopLeftRadius: w * curve, borderTopRightRadius: w * curve, backgroundColor: brand.meadow, borderTopWidth: 1.5, borderColor: brand.meadowCrest }} />
  );
}

function useWash(group: FlockGroup) {
  const { isDark } = useTheme();
  const colorOf = useGroupColor();
  return tintOf(colorOf(group.id, group.avatar_color), isDark ? 0.4 : 0.26);
}

/** Round: the group's flock in a circle, one to three sheep by how many of you there are. */
export function GroupFlock({ group, count = 3, size = 32, style }: { group: FlockGroup; count?: number; size?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const wash = useWash(group);
  const slots = ROUND_SLOTS[Math.max(1, Math.min(3, count)) - 1];
  return (
    <View
      accessible
      accessibilityLabel={`${group.name}, ${count} member${count === 1 ? '' : 's'}`}
      style={[{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: c.background }, style]}
    >
      {group.avatar_url ? (
        <Image source={{ uri: group.avatar_url }} style={{ width: size, height: size }} />
      ) : (
        <View style={{ flex: 1, backgroundColor: wash }}>
          <Hill w={size} h={size} rise={0.32} />
          {slots.map((sl, i) => <Sheep key={i} n={i} {...sl} w={size} box={size} />)}
        </View>
      )}
    </View>
  );
}

/** A card or header: the flock on its hill, up to eight sheep, then "+N". Children sit on top. */
export function FlockCover({ group, count, style, children }: {
  group: FlockGroup; count: number; style?: StyleProp<ViewStyle>; children?: React.ReactNode;
}) {
  const { c } = useTheme();
  const wash = useWash(group);
  // Measured, so the hill and the flock fit a card or a full-width header alike.
  const [{ width, height }, setBox] = useState({ width: 0, height: 0 });
  const shown = Math.min(count, CARD_SLOTS.length);
  const extra = count - shown;
  // Back rows first, so nearer sheep stand in front.
  const order = CARD_SLOTS.slice(0, shown).map((sl, i) => ({ sl, i })).sort((a, b) => b.sl.b - a.sl.b);
  return (
    <View
      style={[{ overflow: 'hidden', backgroundColor: c.background }, style]}
      onLayout={e => { const { width: w, height: h } = e.nativeEvent.layout; if (w !== width || h !== height) setBox({ width: w, height: h }); }}
    >
      {group.avatar_url ? (
        <Image source={{ uri: group.avatar_url }} style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0.9 }} />
      ) : width ? (
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: wash }}>
          <Hill w={width} h={height} rise={0.53} from={0.36} curve={0.45} />
          {order.map(({ sl, i }) => <Sheep key={i} n={i} {...sl} w={width} box={height} />)}
          {extra > 0 ? (
            <View style={{ position: 'absolute', right: 8, top: 8, paddingHorizontal: 6, height: 18, borderRadius: 9, justifyContent: 'center', backgroundColor: brand.coverChip }}>
              <Txt v="caption" style={{ color: brand.olive, fontSize: 11 }}>{`+${extra}`}</Txt>
            </View>
          ) : null}
        </View>
      ) : null}
      {children}
    </View>
  );
}
