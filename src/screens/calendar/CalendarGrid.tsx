// Month grid / week strip.
// Compact defaults to a single 7-day row (one chunk) and expands to the
// month on demand; wide layouts always show the month.

import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, View } from 'react-native';
import { IconButton, Txt } from '../../components/ui';
import { continuous, space, tabularNums, useLayout, useTheme } from '../../theme';
import { addDays, dateKey, parseKey, todayKey } from './dates';

interface Props {
  selected: string;
  onSelect: (key: string) => void;
  marked: Set<string>;
  expanded: boolean;
  onToggleExpanded?: () => void;
  /** Leave out the month label and paging (the screen drives them). */
  hideHeader?: boolean;
  /** 0 = Sunday, 1 = Monday. */
  weekStartsOn?: 0 | 1;
}

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export default function CalendarGrid({ selected, onSelect, marked, expanded, onToggleExpanded, hideHeader, weekStartsOn = 0 }: Props) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const [anchor, setAnchor] = useState(selected);
  const today = todayKey();

  // Follow external selection changes (e.g. "Today").
  useEffect(() => { setAnchor(selected); }, [selected]);

  const anchorDate = parseKey(anchor);
  const monthLabel = anchorDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const weeks: (string | null)[][] = useMemo(() => {
    if (!expanded) {
      const start = addDays(anchor, -((anchorDate.getDay() - weekStartsOn + 7) % 7));
      return [Array.from({ length: 7 }, (_, i) => addDays(start, i))];
    }
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const daysInMonth = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0).getDate();
    const cells: (string | null)[] = Array((first.getDay() - weekStartsOn + 7) % 7).fill(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(dateKey(new Date(first.getFullYear(), first.getMonth(), d)));
    while (cells.length % 7) cells.push(null);
    const rows: (string | null)[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    return rows;
  }, [anchor, expanded, weekStartsOn]);

  function step(dir: 1 | -1) {
    if (expanded) {
      const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + dir, 1);
      setAnchor(dateKey(d));
    } else {
      setAnchor(addDays(anchor, 7 * dir));
    }
  }

  const circle = compact ? 40 : 32;

  return (
    <View style={{ paddingHorizontal: compact ? space.s : space.m, paddingBottom: space.s }}>
      {/* Month + paging */}
      {!hideHeader && <View style={{ flexDirection: 'row', alignItems: 'center', paddingLeft: compact ? space.s : 0, minHeight: 44 }}>
        <Txt v="headline" style={{ flex: 1 }} accessibilityRole="header">{monthLabel}</Txt>
        <IconButton icon="chevron-back" label={expanded ? 'Previous month' : 'Previous week'} onPress={() => step(-1)} />
        <IconButton icon="chevron-forward" label={expanded ? 'Next month' : 'Next week'} onPress={() => step(1)} />
        {onToggleExpanded ? (
          <IconButton
            icon={expanded ? 'contract-outline' : 'expand-outline'}
            label={expanded ? 'Show week' : 'Show month'}
            onPress={onToggleExpanded}
          />
        ) : null}
      </View>}

      {/* Weekday initials */}
      <View style={{ flexDirection: 'row', height: 24, alignItems: 'center' }} importantForAccessibility="no-hide-descendants">
        {[...WEEKDAYS.slice(weekStartsOn), ...WEEKDAYS.slice(0, weekStartsOn)].map((d, i) => (
          <Txt key={i} v="caption" tone="secondary" align="center" style={{ flex: 1 }}>{d}</Txt>
        ))}
      </View>

      {weeks.map((row, ri) => (
        <View key={ri} style={{ flexDirection: 'row' }}>
          {row.map((key, ci) => {
            if (!key) return <View key={ci} style={{ flex: 1 }} />;
            const isSel = key === selected;
            const isToday = key === today;
            const hasEvents = marked.has(key);
            const d = parseKey(key);
            return (
              <Pressable
                key={key}
                onPress={() => onSelect(key)}
                accessibilityRole="button"
                accessibilityState={{ selected: isSel }}
                accessibilityLabel={`${WEEKDAY_NAMES[d.getDay()]}, ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}${isToday ? ', today' : ''}${hasEvents ? ', has events' : ''}`}
                style={(state: any) => [
                  { flex: 1, alignItems: 'center', paddingVertical: space.hair, minHeight: 48 },
                  Platform.OS === 'web' && ({ cursor: 'pointer' } as any),
                  state.hovered && !isSel && { opacity: 0.7 },
                ]}
              >
                <View style={{
                  width: circle, height: circle, borderRadius: circle / 2, ...continuous,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isSel ? (isToday ? c.tint : c.label) : 'transparent',
                }}>
                  <Txt
                    v={compact ? 'body' : 'callout'}
                    style={[
                      tabularNums,
                      { color: isSel ? (isToday ? c.onTint : c.background) : isToday ? c.tint : c.label },
                      (isSel || isToday) && { fontWeight: '600' },
                    ]}
                  >
                    {d.getDate()}
                  </Txt>
                </View>
                <View style={{
                  width: 6, height: 6, borderRadius: 3, marginTop: 2,
                  backgroundColor: hasEvents ? c.secondaryLabel : 'transparent',
                }} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

