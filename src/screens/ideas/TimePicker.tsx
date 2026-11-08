// An exact time, as two rows like a calendar's new-event screen: Starts,
// then Ends. Tap a row and a short scrolling list of times (every 15
// minutes) drops down under it; tap the arrow to close it. Closing Starts
// opens Ends, which is optional ("No end"). Starts opens where it's useful:
// at the time set, else at the part of the day chosen before (Evening: 6 PM).

import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, ScrollViewInstance, View } from 'react-native';
import { Icon, Tappable, Txt } from '../../components/ui';
import { space, tabularNums, useTheme, weight } from '../../theme';
import { TimeChoice, TimePart, clockLabel } from '../../lib/planWhen';

const STEP = 15;
const ROW = 40;
const SHOWN = 5;   // rows in view
const H = 60;
const ALL = Array.from({ length: (24 * H) / STEP }, (_, i) => i * STEP);
const hm = (min: number) => `${String(Math.floor(min / H)).padStart(2, '0')}:${String(min % H).padStart(2, '0')}`;
const toMin = (t: string) => { const [h, m] = t.split(':').map(Number); return h * H + m; };
// Where Starts opens for each part of the day, or with none.
const OPEN_AT: Record<TimePart | 'none', number> = { morning: 9 * H, daytime: 12 * H, evening: 18 * H, none: 9 * H };

export default function TimePicker({ time, onChange }: { time: TimeChoice; onChange: (t: TimeChoice) => void }) {
  const { c } = useTheme();
  const exact = time.kind === 'exact' ? time : null;
  const start = exact ? toMin(exact.start) : null;
  const end = exact?.end ? toMin(exact.end) : null;
  // Which list is down. With no start yet, Starts is.
  const [open, setOpen] = useState<'start' | 'end' | null>(start === null ? 'start' : null);
  // Where Starts opens before there's a time: the part of the day picked before.
  const partBefore = useRef<TimePart | 'none'>(time.kind === 'part' ? time.part : 'none');

  const pickStart = (m: number) => {
    // Moving the start keeps the length, as calendars do.
    const keep = start !== null && end !== null ? end - start : null;
    onChange({ kind: 'exact', start: hm(m), end: keep !== null && m + keep < 24 * H ? hm(m + keep) : undefined });
  };
  const pickEnd = (m: number | null) => {
    if (!exact) return;
    onChange({ kind: 'exact', start: exact.start, end: m === null ? undefined : hm(m) });
  };
  // Closing Starts moves on to Ends, the first time round.
  const toggle = (which: 'start' | 'end') => setOpen(o => {
    if (o !== which) return which;
    return which === 'start' && start !== null && end === null ? 'end' : null;
  });

  // A list opens on the time in question, a row down from the top.
  const list = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    if (!open) return;
    let index: number;
    if (open === 'start') index = ALL.findIndex(m => m >= (start ?? OPEN_AT[partBefore.current]));
    else index = end === null ? 0 : ALL.filter(m => m > start!).findIndex(m => m >= end) + 1;   // "No end" is first
    const t = setTimeout(() => list.current?.scrollTo({ y: Math.max(0, (index - 1) * ROW), animated: false }), 0);
    return () => clearTimeout(t);
  }, [open]);

  const option = (key: string, text: string, on: boolean, onPress: () => void) => (
    <Tappable
      key={key}
      onPress={onPress}
      accessibilityLabel={text}
      accessibilityState={{ selected: on }}
      style={{ height: ROW, flexDirection: 'row', alignItems: 'center', paddingHorizontal: space.m, backgroundColor: on ? c.tint : 'transparent', borderRadius: 10 }}
    >
      <Txt v="callout" style={[tabularNums, { color: on ? c.onTint : c.label, ...weight(on ? '700' : '500') }]}>{text}</Txt>
    </Tappable>
  );
  // A row with what's set, and the arrow that opens and closes its list.
  const row = (which: 'start' | 'end', label: string, value: string) => (
    <Tappable
      onPress={() => toggle(which)}
      feedback="opacity"
      accessibilityLabel={`${label}, ${value}. ${open === which ? 'Close' : 'Change'}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, minHeight: 44, paddingHorizontal: space.m, borderRadius: 12, backgroundColor: c.background }}
    >
      <Txt v="callout" style={{ flex: 1 }}>{label}</Txt>
      <Txt v="callout" tone={open === which ? 'tint' : 'secondary'} style={tabularNums} semibold={open === which}>{value}</Txt>
      <Icon name={open === which ? 'chevron-up' : 'chevron-down'} size={18} color={c.tint} />
    </Tappable>
  );
  const scroller = (children: React.ReactNode) => (
    <ScrollView
      ref={list}
      style={{ height: ROW * SHOWN, borderRadius: 12, backgroundColor: c.background }}
      contentContainerStyle={{ padding: space.hair }}
      nestedScrollEnabled
    >
      {children}
    </ScrollView>
  );

  return (
    <View style={{ gap: space.s }}>
      {row('start', 'Starts', exact ? clockLabel(exact.start) : 'Pick a time')}
      {open === 'start' ? scroller(ALL.map(m => option(String(m), clockLabel(hm(m)), m === start, () => pickStart(m)))) : null}
      {start !== null ? (
        <>
          {row('end', 'Ends', exact?.end ? clockLabel(exact.end) : 'No end')}
          {open === 'end' ? scroller(<>
            {option('none', 'No end', end === null, () => pickEnd(null))}
            {ALL.filter(m => m > start).map(m => option(String(m), clockLabel(hm(m)), m === end, () => pickEnd(m)))}
          </>) : null}
        </>
      ) : null}
    </View>
  );
}
