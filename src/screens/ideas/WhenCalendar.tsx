// The calendar in a plan's When: one week to start, so When stays short;
// "Show month" opens the mini month, like the one in a calendar app's
// new-event screen. Swipe (or the arrows) for the next week or month; tap the
// month's name for a month-and-year picker. Tap a day for one day; tap a
// later day right after to make it every day in between (the 13th to the
// 26th), any length. The next tap starts over. A day set some other way
// ("Tomorrow") isn't a first tap, so tapping the calendar then just moves it. Only picked days are marked: a loose
// "this weekend" stays loose, so nothing on the grid is shaded for it.
// Past days are out of reach. With a calendar shown, days
// with plans get a dot and the month's plans are listed underneath, to pick
// around them.

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, Platform, Pressable, View } from 'react-native';
import { IconButton, Menu, Tappable, Icon, Txt } from '../../components/ui';
import { continuous, space, tabularNums, useTheme, weight } from '../../theme';
import { addDays, dateKey, keyOf, parseKey } from '../calendar/dates';
import { startOfWeek } from '../../lib/planWhen';
import { MAX_PICKED_DAYS } from '../../lib/planner';
import { Event } from '../../types';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthOf = (k: string) => `${k.slice(0, 7)}-01`;
const shiftMonth = (m: string, n: number) => { const d = parseKey(m); return dateKey(new Date(d.getFullYear(), d.getMonth() + n, 1)); };
const monthLabel = (k: string) => parseKey(k).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
// How far a swipe goes before it turns the page.
const SWIPE = 48;

export default function WhenCalendar({ range, selected, selectedEnd, today, onPick, events, onVisible, calView, onCalView }: {
  range: [string, string];                // the days in question, first to last: where it opens
  selected: string | null;
  selectedEnd: string | null;             // last day, when several are picked
  today: string;
  onPick: (first: string, last: string | null) => void;
  events: Event[] | null;                 // plans to show, when a calendar is on
  onVisible: (from: string, to: string) => void;
  calView: 'mine' | 'all' | null;
  onCalView: (v: 'mine' | 'all' | null) => void;
}) {
  const { c } = useTheme();
  const thisMonth = monthOf(today);
  const opening = () => { const m = monthOf(selected ?? range[0]); return m < thisMonth ? thisMonth : m; };
  const [month, setMonth] = useState(opening);
  const [choosing, setChoosing] = useState(false);     // the month-and-year picker
  const [pickerYear, setPickerYear] = useState(() => parseKey(month).getFullYear());
  const thisWeek = startOfWeek(today);
  const weekOf = (k: string) => { const w = startOfWeek(k); return w < thisWeek ? thisWeek : w; };
  const [expanded, setExpanded] = useState(false);     // the whole month, or one week
  const [week, setWeek] = useState(() => weekOf(selected ?? range[0]));
  useEffect(() => { setMonth(opening()); setWeek(weekOf(selected ?? range[0])); }, [range[0], range[1]]);

  // A month is six weeks, always, so the grid doesn't change height from month to month.
  const days = useMemo(() => expanded
    ? Array.from({ length: 42 }, (_, i) => addDays(startOfWeek(month), i))
    : Array.from({ length: 7 }, (_, i) => addDays(week, i)), [expanded, month, week]);
  const first = days[0], last = days[days.length - 1];
  useEffect(() => { onVisible(first, last); }, [first, last]);

  const canGoBack = expanded ? month > thisMonth : week > thisWeek;
  const go = (n: number) => expanded
    ? setMonth(m => { const next = shiftMonth(m, n); return next < thisMonth ? thisMonth : next; })
    : setWeek(w => { const next = addDays(w, 7 * n); return next < thisWeek ? thisWeek : next; });
  const shown = expanded ? month : monthOf(addDays(week, 3));
  const expand = () => { setMonth(shown < thisMonth ? thisMonth : shown); setExpanded(true); };
  const collapse = () => {
    setWeek(weekOf(selected && monthOf(selected) === month ? selected : month === thisMonth ? today : month));
    setExpanded(false);
  };

  // Swiping: the grid follows your finger, then slides the rest of the way.
  const [gridWidth, setGridWidth] = useState(320);
  const slide = useRef(new Animated.Value(0)).current;
  const pageRef = useRef({ canGoBack, gridWidth, go });
  pageRef.current = { canGoBack, gridWidth, go };
  const pan = useMemo(() => PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
    onPanResponderMove: (_, g) => slide.setValue(g.dx < 0 || pageRef.current.canGoBack ? g.dx : g.dx / 4),
    onPanResponderRelease: (_, g) => {
      const { canGoBack: back, gridWidth: w } = pageRef.current;
      const dir = g.dx < -SWIPE || g.vx < -0.5 ? 1 : (g.dx > SWIPE || g.vx > 0.5) && back ? -1 : 0;
      if (!dir) { Animated.spring(slide, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(); return; }
      Animated.timing(slide, { toValue: -dir * w, duration: 140, useNativeDriver: Platform.OS !== 'web' }).start(() => {
        pageRef.current.go(dir);
        slide.setValue(dir * w);
        Animated.timing(slide, { toValue: 0, duration: 160, useNativeDriver: Platform.OS !== 'web' }).start();
      });
    },
    onPanResponderTerminate: () => Animated.spring(slide, { toValue: 0, useNativeDriver: Platform.OS !== 'web' }).start(),
  }), []);

  const byDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    (events ?? []).forEach(e => {
      const k = keyOf(e.start_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return map;
  }, [events]);
  // A week shows every day alike; a month fades the days either side of it.
  const inMonth = (k: string) => !expanded || monthOf(k) === month;
  const upcoming = events
    ? days.filter(k => inMonth(k) && k >= today).flatMap(k => (byDay.get(k) ?? []).map(e => ({ k, e })))
    : [];
  const listed = upcoming.slice(0, 6);
  const dayShort = (k: string) => `${parseKey(k).toLocaleDateString('en-US', { weekday: 'short' })} ${parseKey(k).getDate()}`;

  const inPicked = (k: string) => !!selected && !!selectedEnd && k >= selected && k <= selectedEnd;
  // The day just tapped, waiting to see if the next tap makes it several.
  const [anchor, setAnchor] = useState<string | null>(null);
  useEffect(() => { if (selected !== anchor || selectedEnd) setAnchor(null); }, [selected, selectedEnd]);
  const pick = (k: string) => {
    if (expanded && !inMonth(k)) setMonth(monthOf(k));
    const later = !!anchor && k > anchor
      && Math.round((parseKey(k).getTime() - parseKey(anchor).getTime()) / 864e5) < MAX_PICKED_DAYS;
    onPick(later ? anchor! : k, later ? k : null);
    setAnchor(later ? null : k);
  };
  const pickedDays = selected && selectedEnd ? Math.round((parseKey(selectedEnd).getTime() - parseKey(selected).getTime()) / 864e5) + 1 : 1;

  const openPicker = () => { setPickerYear(parseKey(shown).getFullYear()); setChoosing(x => !x); };
  const thisYear = parseKey(today).getFullYear();

  return (
    <View style={{ margin: space.s, padding: space.s, gap: space.s, backgroundColor: c.background, borderRadius: 12, ...continuous }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
        <Tappable
          onPress={openPicker}
          feedback="opacity"
          accessibilityLabel={`${monthLabel(shown)}. ${choosing ? 'Close' : 'Choose'} month and year`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, paddingVertical: space.hair, paddingLeft: space.s, borderRadius: 6 }}
        >
          <Txt v="headline" accessibilityRole="header" numberOfLines={1}>{monthLabel(shown)}</Txt>
          <Icon name={choosing ? 'chevron-down' : 'chevron-forward'} size={14} color={c.tint} />
        </Tappable>
        <View style={{ flex: 1 }} />
        {(expanded ? month !== thisMonth : week !== thisWeek) && !choosing ? (
          <Tappable onPress={() => { setMonth(thisMonth); setWeek(thisWeek); }} accessibilityLabel="Go to today" style={{ padding: space.hair + 2, borderRadius: 6 }}>
            <Txt v="footnote" tone="tint">Today</Txt>
          </Tappable>
        ) : null}
        {choosing ? null : (
          <>
            <IconButton icon="chevron-back" label={expanded ? 'Previous month' : 'Previous week'} onPress={() => go(-1)} disabled={!canGoBack} />
            <IconButton icon="chevron-forward" label={expanded ? 'Next month' : 'Next week'} onPress={() => go(1)} />
          </>
        )}
      </View>

      {choosing ? (
        // Month and year: arrows for the year, then the twelve months.
        <View style={{ gap: space.s }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.m }}>
            <IconButton icon="chevron-back" label="Previous year" onPress={() => setPickerYear(y => y - 1)} disabled={pickerYear <= thisYear} />
            <Txt v="headline" style={tabularNums}>{String(pickerYear)}</Txt>
            <IconButton icon="chevron-forward" label="Next year" onPress={() => setPickerYear(y => y + 1)} />
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {MONTHS.map((label, i) => {
              const m = dateKey(new Date(pickerYear, i, 1));
              const past = m < thisMonth;
              const on = m === shown;
              return (
                <View key={label} style={{ width: '25%', padding: space.hair }}>
                  <Tappable
                    onPress={() => { setMonth(m); setExpanded(true); setChoosing(false); }}
                    disabled={past}
                    feedback="opacity"
                    accessibilityLabel={`${parseKey(m).toLocaleDateString('en-US', { month: 'long' })} ${pickerYear}`}
                    accessibilityState={{ selected: on, disabled: past }}
                    style={{ alignItems: 'center', paddingVertical: space.s + 2, borderRadius: 999, backgroundColor: on ? c.tint : 'transparent' }}
                  >
                    <Txt v="callout" style={{ color: on ? c.onTint : c.label, opacity: past ? 0.3 : 1, ...weight(on ? '700' : '500') }}>{label}</Txt>
                  </Tappable>
                </View>
              );
            })}
          </View>
        </View>
      ) : (
        <View style={{ overflow: 'hidden' }} onLayout={e => setGridWidth(e.nativeEvent.layout.width)} {...pan.panHandlers}>
          <View style={{ flexDirection: 'row', height: 22, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
            {WEEKDAYS.map((d, i) => <Txt key={i} v="caption" tone="secondary" align="center" style={{ flex: 1 }}>{d}</Txt>)}
          </View>
          <Animated.View style={{ transform: [{ translateX: slide }] }}>
            {Array.from({ length: days.length / 7 }, (_, ri) => (
              <View key={ri} style={{ flexDirection: 'row' }}>
                {days.slice(ri * 7, ri * 7 + 7).map((k, ci) => {
                  const past = k < today;
                  const isSel = k === selected || k === selectedEnd;
                  const between = inPicked(k);
                  const isToday = k === today;
                  const busy = !!events && (byDay.get(k)?.length ?? 0) > 0;
                  const d = parseKey(k);
                  return (
                    <Pressable
                      key={k}
                      disabled={past}
                      onPress={() => pick(k)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isSel || between, disabled: past }}
                      accessibilityLabel={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}${busy ? ', has plans' : ''}`}
                      style={(state: any) => [
                        { flex: 1, alignItems: 'center', paddingVertical: 2, minHeight: 44 },
                        Platform.OS === 'web' && !past && ({ cursor: 'pointer' } as any),
                        state.hovered && !isSel && !past && { opacity: 0.7 },
                      ]}
                    >
                      {/* Several days: one band from the first to the last, ends rounded at the edges of a week. */}
                      {between ? (
                        <View style={{
                          position: 'absolute', top: 2, height: 34, backgroundColor: c.tintSoft,
                          left: k === selected || ci === 0 ? '50%' : 0, right: k === selectedEnd || ci === 6 ? '50%' : 0,
                        }} />
                      ) : null}
                      {between && ci === 0 && k !== selected ? <View style={{ position: 'absolute', top: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: c.tintSoft }} /> : null}
                      {between && ci === 6 && k !== selectedEnd ? <View style={{ position: 'absolute', top: 2, width: 34, height: 34, borderRadius: 17, backgroundColor: c.tintSoft }} /> : null}
                      <View style={{
                        width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isSel ? c.tint : 'transparent',
                        borderWidth: isToday && !isSel ? 1 : 0, borderColor: c.tint,
                      }}>
                        <Txt
                          v="callout"
                          style={[tabularNums, {
                            color: isSel ? c.onTint : c.label,
                            opacity: past ? 0.25 : inMonth(k) ? 1 : 0.4,
                            ...weight(isSel || isToday ? '700' : '500'),
                          }]}
                        >
                          {d.getDate()}
                        </Txt>
                      </View>
                      <View style={{ width: 5, height: 5, borderRadius: 3, marginTop: 1, backgroundColor: busy && !past ? c.secondaryLabel : 'transparent' }} />
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </Animated.View>
        </View>
      )}

      {!choosing && selectedEnd ? (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.s }}>{`${pickedDays} days`}</Txt>
      ) : null}

      {!choosing && listed.length ? (
        <View style={{ gap: 2, paddingHorizontal: space.s }}>
          {listed.map(({ k, e }) => (
            <Txt key={`${e.id}-${k}`} v="footnote" tone="secondary" numberOfLines={1}>
              {`${dayShort(k)} · ${clock(e.start_time)}  ${e.title}`}
            </Txt>
          ))}
          {upcoming.length > listed.length ? (
            <Txt v="footnote" tone="secondary">{`and ${upcoming.length - listed.length} more`}</Txt>
          ) : null}
        </View>
      ) : !choosing && events ? (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.s }}>{`Nothing planned this ${expanded ? 'month' : 'week'}.`}</Txt>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      {choosing ? <View /> : (
        <Tappable onPress={expanded ? collapse : expand} accessibilityLabel={expanded ? 'Show one week' : 'Show the whole month'} style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, padding: space.hair + 2, paddingHorizontal: space.s, borderRadius: 6 }}>
          <Icon name={expanded ? 'chevron-up' : 'chevron-down'} size={14} color={c.tint} />
          <Txt v="footnote" tone="tint" semibold>{expanded ? 'Show week' : 'Show month'}</Txt>
        </Tappable>
      )}
      <Menu
        title="See on calendars"
        sections={[{ items: [
          { key: 'off', label: 'Don’t show plans', checked: !calView, onSelect: () => onCalView(null) },
          { key: 'mine', label: 'Just my calendar', checked: calView === 'mine', onSelect: () => onCalView('mine') },
          { key: 'all', label: 'All calendars', checked: calView === 'all', onSelect: () => onCalView('all') },
        ] }]}
      >
        {open => (
          <Tappable onPress={open} accessibilityLabel="See on calendars" style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, padding: space.hair + 2, paddingHorizontal: space.s, borderRadius: 6 }}>
            <Icon name="calendar-outline" size={14} color={c.tint} />
            <Txt v="footnote" tone="tint">{calView === 'mine' ? 'My calendar' : calView === 'all' ? 'All calendars' : 'See plans'}</Txt>
            <Icon name="chevron-down" size={12} color={c.tint} />
          </Tappable>
        )}
      </Menu>
      </View>
    </View>
  );
}
