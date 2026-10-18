// Calendar periods: the day as an hour timeline, the week as seven rows.
// (The month is CalendarGrid.) The screen pages them with PeriodBar; taps go
// back to the screen: an event opens it, a day drills into it.

import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { Event, Idea, TimeSlot } from '../../types';
import { Button, Icon, IconButton, ListRow, Tappable, Txt } from '../../components/ui';
import { continuous, space, tabularNums, useTheme } from '../../theme';
import { addDays, parseKey, timeParts, todayKey } from './dates';
import { fillsDay, whenOnDay } from '../../lib/span';

/** A date option on a plan still picking one: shown faintly, like a pencilled-in maybe. */
export type Maybe = { kind: 'maybe'; id: string; idea: Idea; slot: TimeSlot; start_time: string };
// `overlay` marks one of your own events laid over a shared calendar.
import { CalEvent } from './calendarFilter';
export type { CalEvent };
export type Row = CalEvent | Maybe;
export const isMaybe = (r: Row): r is Maybe => (r as Maybe).kind === 'maybe';
export const isOverlay = (r: Row) => !isMaybe(r) && !!r.overlay;

const titleOf = (r: Row) => (isMaybe(r) ? r.idea.title : r.title);
const endOf = (r: Row) => (isMaybe(r) ? r.slot.end : r.end_time);
export const rowEnd = endOf;
const cancelledOf = (r: Row) => !isMaybe(r) && !!r.cancelled_at;
const spokenKind = (r: Row) =>
  `${isMaybe(r) ? ', date option' : ''}${isOverlay(r) ? ', your event, not on this calendar' : ''}${cancelledOf(r) ? ', cancelled' : ''}`;

// ─── Paging bar ──────────────────────────────────────────────────────────────

/** What you're looking at, a way back to today, and back/forward. */
export function PeriodBar({ label, spoken, unit, onStep, onToday, accessory }: {
  label: string;
  spoken?: string;        // full dates for screen readers, when the label abbreviates
  unit: string;
  accessory?: React.ReactNode;   // e.g. the "Mine" chip on a shared calendar
  onStep?: (dir: 1 | -1) => void;
  onToday?: () => void;   // only while today is out of view
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, paddingLeft: space.m, paddingRight: space.s, minHeight: 44 }}>
      {/* Wraps rather than truncates; labels are kept short enough not to need it. */}
      <Txt v="title" style={{ flex: 1 }} accessibilityRole="header" accessibilityLabel={spoken}>{label}</Txt>
      {accessory}
      {onToday ? <Button label="Today" variant="plain" onPress={onToday} /> : null}
      {onStep ? <>
        <IconButton icon="chevron-back" label={`Previous ${unit}`} onPress={() => onStep(-1)} />
        <IconButton icon="chevron-forward" label={`Next ${unit}`} onPress={() => onStep(1)} />
      </> : null}
    </View>
  );
}

/** On a shared calendar: lay your own other events over it. Filled when on. */
export function MineChip({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  const { c } = useTheme();
  return (
    <Tappable
      feedback="opacity"
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel="Show my events"
      accessibilityHint="Adds your other plans to this calendar. Only you see them."
      hitSlop={{ top: 8, bottom: 8 }}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 4, height: 30, paddingHorizontal: 10,
        borderRadius: 15, ...continuous, borderWidth: 1,
        borderColor: on ? c.tint : c.separator, backgroundColor: on ? c.tintSoft : 'transparent',
      }}
    >
      <Icon name={on ? 'person' : 'person-outline'} size={14} color={on ? c.tint : c.secondaryLabel} />
      <Txt v="footnote" semibold={on} tone={on ? 'tint' : 'secondary'}>Mine</Txt>
    </Tappable>
  );
}

// ─── Day ─────────────────────────────────────────────────────────────────────

const HOUR = 52;
const GUTTER = 56;

const minutesInto = (iso: string, day: string) =>
  Math.round((new Date(iso).getTime() - parseKey(day).getTime()) / 60000);

const hourLabel = (h: number) => (h === 0 || h === 24 ? '12 AM' : h === 12 ? 'Noon' : h < 12 ? `${h} AM` : `${h - 12} PM`);

/**
 * Overlapping events share the width: each gets the first free column in its
 * cluster, and the cluster splits evenly across however many columns it needs.
 */
function layOut(rows: Row[], day: string) {
  const items = rows
    .map(r => {
      const start = Math.max(0, minutesInto(r.start_time, day));
      const end = Math.min(24 * 60, Math.max(start + 30, minutesInto(endOf(r), day)));
      return { row: r, start, end, col: 0, cols: 1 };
    })
    .sort((a, b) => a.start - b.start || b.end - a.end);

  let cluster: typeof items = [];
  let colEnds: number[] = [];
  let clusterEnd = -1;
  const close = () => { cluster.forEach(i => { i.cols = colEnds.length; }); cluster = []; colEnds = []; };
  items.forEach(i => {
    if (i.start >= clusterEnd) close();
    let col = colEnds.findIndex(e => e <= i.start);
    if (col < 0) { col = colEnds.length; colEnds.push(i.end); } else colEnds[col] = i.end;
    i.col = col;
    cluster.push(i);
    clusterEnd = Math.max(clusterEnd, i.end);
  });
  close();
  return items;
}

export function DayTimeline({ day, rows, header, onOpen, onAdd }: {
  day: string;
  rows: Row[];
  header?: React.ReactNode;
  onOpen: (r: Row) => void;
  onAdd: () => void;
}) {
  const { c } = useTheme();
  // Plans filling the whole day (all-day, or the middle of a trip) sit above
  // the hours instead of as a 24-hour block.
  const wholeDay = rows.filter(r => fillsDay(r.start_time, endOf(r), day));
  const timed = rows.filter(r => !wholeDay.includes(r));
  const items = useMemo(() => layOut(timed, day), [rows, day]);

  const isToday = day === todayKey();
  const nowMin = isToday ? minutesInto(new Date().toISOString(), day) : -1;

  // An empty day doesn't need fourteen empty hours.
  if (rows.length === 0) {
    return (
      <View style={{ paddingBottom: space.s }}>
        {header}
        <ListRow title="Nothing planned" subtitle="Make plans for this day" tintTitle={false} onPress={onAdd} icon="add-circle-outline" />
      </View>
    );
  }

  const strip = wholeDay.length ? (
    <View style={{ paddingHorizontal: space.s, paddingTop: space.s, paddingBottom: space.s, gap: space.hair }}>
      {wholeDay.map(r => <EventChip key={r.id} row={r} day={day} onPress={() => onOpen(r)} />)}
    </View>
  ) : null;
  if (!timed.length) return <View style={{ paddingBottom: space.s }}>{header}{strip}</View>;

  // Only the hours that matter: an hour either side of the plans (and now,
  // on today), at least six hours tall.
  const minutes = [...items.flatMap(i => [i.start, i.end]), ...(isToday ? [nowMin] : [])];
  let first = Math.max(0, Math.floor(Math.min(...minutes) / 60) - 1);
  let last = Math.min(24, Math.ceil(Math.max(...minutes) / 60) + 1);
  while (last - first < 6) { if (last < 24) last++; else first--; }
  const hours = Array.from({ length: last - first }, (_, i) => first + i);
  const top = (min: number) => ((min - first * 60) / 60) * HOUR;

  return (
    <View style={{ paddingBottom: space.s }}>
      {header}
      {strip}
      <View style={{ height: hours.length * HOUR + space.s, marginTop: space.s }}>
        {hours.map(h => (
          <Pressable
            key={h}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`Add a plan at ${hourLabel(h)}`}
            style={[{ position: 'absolute', left: 0, right: 0, top: top(h * 60), height: HOUR, flexDirection: 'row' }, webPointer]}
          >
            <Txt v="caption" tone="secondary" align="right" style={[tabularNums, { width: GUTTER - space.s, marginTop: -7 }]}>
              {hourLabel(h)}
            </Txt>
            <View style={{ flex: 1, marginLeft: space.s, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.separator }} />
          </Pressable>
        ))}

        {/* Events sit over the hour lines, inside the gutter's right edge. */}
        <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, bottom: 0, left: GUTTER, right: space.s }}>
          {items.map(({ row, start, end, col, cols }) => {
            const maybe = isMaybe(row);
            const cancelled = cancelledOf(row);
            const overlay = isOverlay(row);
            const height = Math.max(24, top(end) - top(start) - 2);
            const { hm, ampm, spoken: when } = whenOnDay(row.start_time, endOf(row), day);
            return (
              <Tappable
                key={row.id}
                onPress={() => onOpen(row)}
                accessibilityLabel={`${when}, ${titleOf(row)}${spokenKind(row)}`}
                style={{
                  position: 'absolute', top: top(start) + 1, height,
                  left: `${(col / cols) * 100}%`, width: `${100 / cols}%`,
                  paddingRight: 2,
                }}
              >
                <View style={{
                  flex: 1, borderRadius: 8, ...continuous, overflow: 'hidden',
                  paddingHorizontal: space.s, paddingVertical: 3,
                  // Your overlaid events are outlines; the calendar's own are filled.
                  backgroundColor: maybe || cancelled || overlay ? 'transparent' : c.tintSoft,
                  ...(overlay ? { borderWidth: 1, borderColor: c.separator } : null),
                  borderLeftWidth: 3, borderLeftColor: cancelled || overlay ? c.separator : c.tint,
                  ...(maybe ? { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.separator, opacity: 0.8 } : null),
                }}>
                  <Txt
                    v="footnote" semibold={!overlay} numberOfLines={height > 40 ? 2 : 1}
                    tone={maybe || cancelled || overlay ? 'secondary' : 'primary'}
                    style={cancelled ? { textDecorationLine: 'line-through' } : undefined}
                  >
                    {overlay ? <><Icon name="person" size={11} color={c.secondaryLabel} />{' '}</> : null}
                    {titleOf(row)}
                  </Txt>
                  {height > 40 ? (
                    <Txt v="caption" tone="secondary" numberOfLines={1} style={tabularNums}>
                      {`${hm} ${ampm}${maybe ? ' · Maybe' : !overlay && row.location ? ` · ${row.location}` : ''}`}
                    </Txt>
                  ) : null}
                </View>
              </Tappable>
            );
          })}
        </View>

        {nowMin >= first * 60 && nowMin <= last * 60 ? (
          <View pointerEvents="none" style={{ position: 'absolute', left: GUTTER - 4, right: space.s, top: top(nowMin) - 4, flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: c.danger }} />
            <View style={{ flex: 1, height: 2, backgroundColor: c.danger }} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Week ────────────────────────────────────────────────────────────────────

/** Seven rows, Sunday first: the day on the left, its plans as chips on the right. */
export function WeekRows({ start, byDay, selected, onPickDay, onOpen }: {
  start: string;
  byDay: Map<string, Row[]>;
  selected: string;
  onPickDay: (key: string) => void;
  onOpen: (r: Row) => void;
}) {
  const { c } = useTheme();
  const today = todayKey();
  return (
    <View style={{ paddingHorizontal: space.s, paddingBottom: space.s }}>
      {Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((key, i) => {
        const d = parseKey(key);
        const isToday = key === today;
        const isSel = key === selected;
        const rows = byDay.get(key) ?? [];
        const dayName = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
        const divider = { borderTopWidth: i ? StyleSheet.hairlineWidth : 0, borderTopColor: c.separator };
        // Empty days are a thin line, so the days with plans stand out.
        if (rows.length === 0) {
          return (
            <Tappable
              key={key}
              onPress={() => onPickDay(key)}
              accessibilityLabel={`${dayName}${isToday ? ', today' : ''}, nothing planned. Open day`}
              style={[divider, { flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 32, paddingVertical: 2 }]}
            >
              <View style={{ width: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'baseline', gap: 4 }}>
                <Txt v="caption" tone={isToday ? 'tint' : 'secondary'} semibold={isToday}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
                </Txt>
                <Txt v="footnote" tone={isToday ? 'tint' : 'secondary'} semibold={isToday} style={tabularNums}>{d.getDate()}</Txt>
              </View>
            </Tappable>
          );
        }
        return (
          <View
            key={key}
            style={{
              flexDirection: 'row', gap: space.s, paddingVertical: space.s, minHeight: 56, ...divider,
            }}
          >
            <Tappable
              onPress={() => onPickDay(key)}
              accessibilityLabel={`${dayName}${isToday ? ', today' : ''}, ${rows.length} plan${rows.length === 1 ? '' : 's'}. Open day`}
              style={{ width: 48, alignItems: 'center', borderRadius: 10, paddingVertical: 2 }}
            >
              <Txt v="caption" tone={isToday ? 'tint' : 'secondary'} semibold={isToday}>
                {d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()}
              </Txt>
              <View style={{
                width: 32, height: 32, borderRadius: 16, ...continuous, alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? c.tint : isSel ? c.fill : 'transparent',
              }}>
                <Txt v="headline" style={[tabularNums, { color: isToday ? c.onTint : c.label }]}>{d.getDate()}</Txt>
              </View>
            </Tappable>
            <View style={{ flex: 1, minWidth: 0, gap: space.hair, justifyContent: 'center' }}>
              {rows.map(r => <EventChip key={r.id} row={r} day={key} onPress={() => onOpen(r)} />)}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** One plan as a compact chip: the week's rows and "Coming up" both use it. */
export function EventChip({ row, day, onPress }: { row: Row; day: string; onPress: () => void }) {
  const { c } = useTheme();
  const maybe = isMaybe(row);
  const cancelled = cancelledOf(row);
  const overlay = isOverlay(row);
  const { short, spoken } = whenOnDay(row.start_time, endOf(row), day);
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={`${spoken}, ${titleOf(row)}${spokenKind(row)}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.s,
        paddingHorizontal: space.s, paddingVertical: 6, borderRadius: 8, ...continuous,
        // Your overlaid events are outlines; the calendar's own are filled.
        backgroundColor: maybe || cancelled || overlay ? 'transparent' : c.tintSoft,
        ...(overlay ? { borderWidth: 1, borderColor: c.separator } : null),
        ...(maybe ? { borderWidth: 1, borderStyle: 'dashed' as const, borderColor: c.separator, opacity: 0.8 } : null),
      }}
    >
      <Txt v="footnote" tone="secondary" numberOfLines={1} style={[tabularNums, { width: 64 }]}>{short}</Txt>
      <Txt
        v="callout" numberOfLines={1} semibold={!maybe && !cancelled && !overlay}
        tone={maybe || cancelled || overlay ? 'secondary' : 'primary'}
        style={[{ flex: 1 }, cancelled && { textDecorationLine: 'line-through' }]}
      >
        {titleOf(row)}
      </Txt>
      {/* Marked by outline and icon, not color alone. */}
      {overlay ? <Icon name="person-outline" size={13} color={c.secondaryLabel} /> : null}
    </Tappable>
  );
}

const webPointer = Platform.OS === 'web' ? ({ cursor: 'pointer' } as any) : null;
