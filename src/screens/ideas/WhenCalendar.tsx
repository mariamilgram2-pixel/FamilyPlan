// The calendar in a plan's When: just the days in question ("this week" is
// one row), faded outside them, past days out of reach. "Show more" adds the
// next week, opens the whole month, or takes a typed "Nov 3" / "next month".
// With a calendar shown, days with plans get a dot and the plans in view are
// listed underneath, to pick around them.

import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { Button, Field, IconButton, Menu, Tappable, Icon, Txt } from '../../components/ui';
import { continuous, space, tabularNums, useTheme } from '../../theme';
import { addDays, dateKey, keyOf, parseKey, shortDate } from '../calendar/dates';
import { CalendarView as View_, readOther, startOfWeek } from '../../lib/planWhen';
import { Event } from '../../types';


const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const monthOf = (k: string) => `${k.slice(0, 7)}-01`;
const monthLabel = (k: string) => parseKey(k).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');

export default function WhenCalendar({ range, selected, today, onPick, events, onVisible, calView, onCalView }: {
  range: [string, string];                // the days in question, first to last
  selected: string | null;
  today: string;
  onPick: (day: string) => void;
  events: Event[] | null;                 // plans to show, when a calendar is on
  onVisible: (from: string, to: string) => void;
  calView: 'mine' | 'all' | null;
  onCalView: (v: 'mine' | 'all' | null) => void;
}) {
  const { c } = useTheme();
  const [view, setView] = useState<View_>({ kind: 'days', from: range[0], to: range[1] });
  const [typing, setTyping] = useState(false);
  const [other, setOther] = useState('');
  useEffect(() => { setView({ kind: 'days', from: range[0], to: range[1] }); }, [range[0], range[1]]);

  // The rows to draw, and which days count as "in range".
  const { rows, inRange, first, last } = useMemo(() => {
    let from: string, to: string;
    if (view.kind === 'month') {
      const d = parseKey(view.month);
      from = view.month;
      to = dateKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    } else { from = view.from; to = view.to; }
    const out: string[][] = [];
    for (let w = startOfWeek(from); w <= to; w = addDays(w, 7)) out.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    return { rows: out, inRange: (k: string) => k >= from && k <= to, first: out[0][0], last: out[out.length - 1][6] };
  }, [view]);
  useEffect(() => { onVisible(first, last); }, [first, last]);

  const byDay = useMemo(() => {
    const map = new Map<string, Event[]>();
    (events ?? []).forEach(e => {
      const k = keyOf(e.start_time);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(e);
    });
    return map;
  }, [events]);
  const upcoming = events
    ? rows.flat().filter(k => inRange(k) && k >= today).flatMap(k => (byDay.get(k) ?? []).map(e => ({ k, e })))
    : [];
  const listed = upcoming.slice(0, 6);
  const dayShort = (k: string) => `${parseKey(k).toLocaleDateString('en-US', { weekday: 'short' })} ${parseKey(k).getDate()}`;

  const title = view.kind === 'month' ? monthLabel(view.month)
    : view.from === view.to ? shortDate(view.from) : `${shortDate(view.from)} – ${shortDate(view.to)}`;
  const stepMonth = (dir: 1 | -1) => {
    if (view.kind !== 'month') return;
    const d = parseKey(view.month);
    setView({ kind: 'month', month: dateKey(new Date(d.getFullYear(), d.getMonth() + dir, 1)) });
  };
  const goOther = () => {
    const v = readOther(other, today);
    if (!v) return;
    setView(v); setTyping(false); setOther('');
  };
  const typed = other.trim() ? readOther(other, today) : null;

  return (
    <View style={{ margin: space.s, padding: space.s, gap: space.s, backgroundColor: c.background, borderRadius: 12, ...continuous }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.s }}>
        <Txt v="headline" style={{ flex: 1 }} accessibilityRole="header" numberOfLines={1}>{title}</Txt>
        {view.kind === 'month' ? (
          <>
            <IconButton icon="chevron-back" label="Previous month" onPress={() => stepMonth(-1)} disabled={view.month <= monthOf(today)} />
            <IconButton icon="chevron-forward" label="Next month" onPress={() => stepMonth(1)} />
          </>
        ) : null}
        <Menu
          title="See on calendars"
          sections={[{ items: [
            { key: 'off', label: 'Don’t show plans', checked: !calView, onSelect: () => onCalView(null) },
            { key: 'mine', label: 'Just my calendar', checked: calView === 'mine', onSelect: () => onCalView('mine') },
            { key: 'all', label: 'All calendars', checked: calView === 'all', onSelect: () => onCalView('all') },
          ] }]}
        >
          {open => (
            <Tappable onPress={open} accessibilityLabel="See on calendars" style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, padding: space.hair + 2, borderRadius: 6 }}>
              <Icon name="calendar-outline" size={14} color={c.tint} />
              <Txt v="footnote" tone="tint">{calView === 'mine' ? 'My calendar' : calView === 'all' ? 'All calendars' : 'See on calendars'}</Txt>
            </Tappable>
          )}
        </Menu>
      </View>

      <View>
        <View style={{ flexDirection: 'row', height: 22, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
          {WEEKDAYS.map((d, i) => <Txt key={i} v="caption" tone="secondary" align="center" style={{ flex: 1 }}>{d}</Txt>)}
        </View>
        {rows.map((row, ri) => (
          <View key={ri} style={{ flexDirection: 'row' }}>
            {row.map(k => {
              const past = k < today;
              const inside = inRange(k);
              const isSel = k === selected;
              const isToday = k === today;
              const busy = !!events && (byDay.get(k)?.length ?? 0) > 0;
              const d = parseKey(k);
              return (
                <Pressable
                  key={k}
                  disabled={past}
                  onPress={() => onPick(k)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: isSel, disabled: past }}
                  accessibilityLabel={`${d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}${busy ? ', has plans' : ''}`}
                  style={(state: any) => [
                    { flex: 1, alignItems: 'center', paddingVertical: 2, minHeight: 44 },
                    Platform.OS === 'web' && !past && ({ cursor: 'pointer' } as any),
                    state.hovered && !isSel && !past && { opacity: 0.7 },
                  ]}
                >
                  <View style={{
                    width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center',
                    backgroundColor: isSel ? c.tint : 'transparent',
                    borderWidth: isToday && !isSel ? 1 : 0, borderColor: c.tint,
                  }}>
                    <Txt
                      v="callout"
                      style={[tabularNums, {
                        color: isSel ? c.onTint : c.label,
                        opacity: past ? 0.25 : inside ? 1 : 0.4,
                        fontWeight: isSel || isToday ? '600' : '400',
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
      </View>

      {listed.length ? (
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
      ) : events && view.kind !== 'month' ? (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.s }}>Nothing planned these days.</Txt>
      ) : null}

      {typing ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: space.s }}>
          <View style={{ flex: 1 }}>
            <Field
              value={other}
              onChangeText={setOther}
              placeholder="Nov 3, next month, in 3 weeks"
              autoFocus
              onSubmitEditing={goOther}
              accessibilityLabel="Show another time"
              hint={other.trim() && !typed ? 'Try a date like Nov 3, a month, or in 3 weeks.' : undefined}
            />
          </View>
          <Button label="Show" variant="gray" onPress={goOther} disabled={!typed} />
        </View>
      ) : (
        <Menu
          title="Show more"
          sections={[{ items: [
            ...(view.kind === 'days' ? [{ key: 'next', label: 'Next week too', onSelect: () => setView({ kind: 'days', from: view.from, to: addDays(view.to, 7) }) }] : []),
            ...(view.kind === 'days' ? [{ key: 'month', label: 'Show month', onSelect: () => setView({ kind: 'month', month: monthOf(view.from) }) }] : []),
            ...(view.kind === 'month' ? [{ key: 'back', label: 'Back to these days', onSelect: () => setView({ kind: 'days', from: range[0], to: range[1] }) }] : []),
            { key: 'other', label: 'Other…', onSelect: () => setTyping(true) },
          ] }]}
        >
          {open => (
            <Tappable onPress={open} accessibilityLabel="Show more" style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, alignSelf: 'flex-start', padding: space.hair + 2, paddingHorizontal: space.s, borderRadius: 6 }}>
              <Txt v="footnote" tone="tint">Show more</Txt>
              <Icon name="chevron-down" size={12} color={c.tint} />
            </Tappable>
          )}
        </Menu>
      )}
    </View>
  );
}
