// Work schedule editor: Hours → Applies to → Holidays off.
// One decision per step, with the common answer pre-selected (Mon–Fri 9–5,
// every week, all federal holidays off) so the fast path is a single "Save".

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Platform, StyleSheet, View } from 'react-native';
import {
  Button, Field, Icon, IconButton, ListRow, ListSection, Menu, SectionHeader, Segmented, Sheet, Tappable, Toggle, Txt,
} from '../../components/ui';
import {
  ScheduleFile, formatBytes, pickScheduleDocument, pickScheduleImage, readScheduleFromFile, validateScheduleFile,
} from '../../lib/scheduleImport';
import { notify } from '../../lib/alert';
import { confirmAction } from '../../lib/alert';
import {
  ALL_HOLIDAY_IDS, DAY_SHORT, DayHours, FEDERAL_HOLIDAYS, MON_FIRST, STANDARD_PATTERN, WeekPattern,
  WorkSchedule, deleteSchedule, formatHours, formatTime, monthOf, nextHolidayDates, parseTime,
  upsertSchedule, weekStart,
} from '../../lib/workSchedule';
import { addDays, dateKey, parseKey, todayKey } from '../calendar/dates';
import { continuous, radius, space, useTheme } from '../../theme';

type Preset = 'standard' | 'custom';
type ScopeChoice = 'ongoing' | 'next' | 'weeks' | 'months';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CHUNK = 6;

interface Props {
  visible: boolean;
  onClose: () => void;
  editing: WorkSchedule | null;
  hasOngoing: boolean;   // a regular schedule already exists
}

export default function WorkScheduleSheet({ visible, onClose, editing, hasOngoing }: Props) {
  const today = todayKey();
  const thisWeek = weekStart(today);
  const nextWeek = addDays(thisWeek, 7);

  const [preset, setPreset] = useState<Preset>('standard');
  const [custom, setCustom] = useState<WeekPattern>(STANDARD_PATTERN);
  const [scope, setScope] = useState<ScopeChoice>('ongoing');
  const [weeks, setWeeks] = useState<string[]>([]);
  const [months, setMonths] = useState<string[]>([]);
  const [holidaysOff, setHolidaysOff] = useState<string[]>(ALL_HOLIDAY_IDS);
  const [moreWeeks, setMoreWeeks] = useState(false);
  const [moreMonths, setMoreMonths] = useState(false);
  const [file, setFile] = useState<ScheduleFile | WorkSchedule['source'] | null>(null);
  const [reading, setReading] = useState<'idle' | 'reading' | 'unavailable' | 'filled' | 'unreadable'>('idle');

  // Load the schedule being edited, or sensible defaults.
  useEffect(() => {
    if (!visible) return;
    setMoreWeeks(false); setMoreMonths(false);
    setFile(editing?.source ?? null); setReading(editing?.source ? 'unavailable' : 'idle');
    if (!editing) {
      setPreset('standard'); setCustom(STANDARD_PATTERN); setScope(hasOngoing ? 'next' : 'ongoing');
      setWeeks([nextWeek]); setMonths([monthOf(today)]); setHolidaysOff(ALL_HOLIDAY_IDS);
      return;
    }
    setPreset(editing.preset);
    setCustom(editing.pattern);
    setHolidaysOff(editing.holidaysOff);
    const s = editing.scope;
    if (s.kind === 'ongoing') setScope('ongoing');
    else if (s.kind === 'months') { setScope('months'); setMonths(s.months); }
    else {
      setWeeks(s.weeks);
      setScope(s.weeks.length === 1 && s.weeks[0] === nextWeek ? 'next' : 'weeks');
    }
  }, [visible, editing]);

  const pattern = preset === 'standard' ? STANDARD_PATTERN : custom;
  const workdays = Object.values(pattern).filter(Boolean) as DayHours[];
  const invalidTimes = workdays.some(h => !h.start || !h.end || h.start === h.end);

  const upcomingWeeks = useMemo(() => Array.from({ length: 16 }, (_, i) => addDays(thisWeek, i * 7)), [thisWeek]);
  const upcomingMonths = useMemo(() => {
    const d = parseKey(today);
    return Array.from({ length: 12 }, (_, i) => monthOf(dateKey(new Date(d.getFullYear(), d.getMonth() + i, 1))));
  }, [today]);
  const holidayDates = useMemo(() => nextHolidayDates(today), [today]);

  const canSave =
    workdays.length > 0 && !invalidTimes &&
    (scope !== 'weeks' || weeks.length > 0) &&
    (scope !== 'months' || months.length > 0);

  async function attach(pick: () => Promise<ScheduleFile | null>) {
    let picked: ScheduleFile | null = null;
    try { picked = await pick(); } catch (e: any) { return notify('Couldn’t open that file', e?.message); }
    if (!picked) return;
    const problem = validateScheduleFile(picked);
    if (problem) return notify('Can’t use that file', problem);
    setFile(picked);
    // An employer's schedule is almost always for a specific week.
    if (scope === 'ongoing') setScope('next');
    setReading('reading');
    const result = await readScheduleFromFile(picked);
    if (result.status === 'ok') {
      setCustom(result.pattern);
      if (result.weekStart) { setWeeks([result.weekStart]); setScope(result.weekStart === nextWeek ? 'next' : 'weeks'); }
      setReading('filled');
    } else {
      setReading(result.status);
    }
  }

  function save() {
    if (!canSave) return;
    const usesHolidays = scope === 'ongoing' || scope === 'months';
    upsertSchedule({
      id: editing?.id ?? `ws-${Date.now()}`,
      preset,
      pattern,
      scope:
        scope === 'ongoing' ? { kind: 'ongoing' } :
        scope === 'months' ? { kind: 'months', months: [...months].sort() } :
        { kind: 'weeks', weeks: scope === 'next' ? [nextWeek] : [...weeks].sort() },
      holidaysOff: usesHolidays ? holidaysOff : [],
      createdAt: editing?.createdAt ?? Date.now(),
      source: preset === 'custom' && file ? { name: file.name, mimeType: file.mimeType, size: file.size, kind: file.kind } : undefined,
    });
    onClose();
  }

  async function remove() {
    if (!editing) return;
    if (await confirmAction('Delete schedule', 'Remove this work schedule from your calendar?', 'Delete')) {
      deleteSchedule(editing.id);
      onClose();
    }
  }

  function toggleIn(list: string[], v: string, set: (l: string[]) => void) {
    set(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);
  }

  const weekLabel = (w: string) => {
    const end = addDays(w, 6);
    const f = (k: string, withMonth: boolean) => parseKey(k).toLocaleDateString('en-US', withMonth ? { month: 'short', day: 'numeric' } : { day: 'numeric' });
    return `${f(w, true)} – ${f(end, parseKey(end).getMonth() !== parseKey(w).getMonth())}`;
  };
  const weekTag = (w: string) => (w === thisWeek ? 'This week' : w === nextWeek ? 'Next week' : null);
  const monthLabel = (m: string) => parseKey(`${m}-01`).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  const allHolidays = holidaysOff.length === FEDERAL_HOLIDAYS.length;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit Work Schedule' : 'Work Schedule'}
      action={{ label: 'Save', onPress: save, disabled: !canSave }}
    >
      {/* 1 · Hours */}
      <View>
        <SectionHeader title="Hours" />
        <Segmented
          options={[{ key: 'standard', label: 'Mon–Fri, 9–5' }, { key: 'custom', label: 'Other' }]}
          value={preset}
          onChange={setPreset}
        />
        {preset === 'standard' ? (
          <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.s }}>
            Monday to Friday, 9:00 AM – 5:00 PM.
          </Txt>
        ) : null}
      </View>

      {preset === 'custom' && (
        <ImportFromFile
          file={file}
          reading={reading}
          onPick={attach}
          onRemove={() => { setFile(null); setReading('idle'); }}
        />
      )}

      {preset === 'custom' && (
        <CustomHours pattern={custom} onChange={setCustom} />
      )}

      {/* 2 · Applies to */}
      <View>
        <SectionHeader title="Applies to" />
        <Segmented
          options={[
            { key: 'ongoing', label: 'Every week' },
            { key: 'next', label: 'Next week' },
            { key: 'weeks', label: 'Weeks' },
            { key: 'months', label: 'Months' },
          ]}
          value={scope}
          onChange={setScope}
        />
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.s }}>
          {scope === 'ongoing' && (hasOngoing && editing?.scope.kind !== 'ongoing'
            ? 'Repeats every week. This replaces your current regular schedule.'
            : 'Repeats every week until you change it.')}
          {scope === 'next' && `Only ${weekLabel(nextWeek)}. Use this when your employer sends a weekly schedule.`}
          {scope === 'weeks' && 'Pick the weeks this schedule covers. It overrides your regular hours on those weeks.'}
          {scope === 'months' && 'Pick the months this schedule covers. It overrides your regular hours in those months.'}
        </Txt>
      </View>

      {scope === 'weeks' && (
        <ListSection header={weeks.length ? `Weeks · ${weeks.length} selected` : 'Weeks'}>
          {(moreWeeks ? upcomingWeeks : upcomingWeeks.slice(0, CHUNK)).map(w => (
            <ListRow key={w} title={weekLabel(w)} subtitle={weekTag(w)} checked={weeks.includes(w)} onPress={() => toggleIn(weeks, w, setWeeks)} />
          ))}
          <ListRow key="more" title={moreWeeks ? 'Show fewer' : 'Show more weeks'} tintTitle onPress={() => setMoreWeeks(x => !x)} />
        </ListSection>
      )}

      {scope === 'months' && (
        <ListSection header={months.length ? `Months · ${months.length} selected` : 'Months'}>
          {(moreMonths ? upcomingMonths : upcomingMonths.slice(0, CHUNK)).map(m => (
            <ListRow key={m} title={monthLabel(m)} checked={months.includes(m)} onPress={() => toggleIn(months, m, setMonths)} />
          ))}
          <ListRow key="more" title={moreMonths ? 'Show fewer' : 'Show more months'} tintTitle onPress={() => setMoreMonths(x => !x)} />
        </ListSection>
      )}

      {/* 3 · Holidays off */}
      {(scope === 'ongoing' || scope === 'months') && (
        <ListSection
          header={`Holidays off · ${holidaysOff.length} of ${FEDERAL_HOLIDAYS.length}`}
          headerAction={
            <Button
              label={allHolidays ? 'Uncheck All' : 'Check All'}
              variant="plain"
              onPress={() => setHolidaysOff(allHolidays ? [] : ALL_HOLIDAY_IDS)}
              style={{ marginRight: -space.m }}
            />
          }
          footer="US federal holidays. Uncheck any you normally work — those days keep your regular hours."
        >
          {[...FEDERAL_HOLIDAYS].sort((x, y) => (holidayDates[x.id] ?? '').localeCompare(holidayDates[y.id] ?? '')).map(h => (
            <ListRow
              key={h.id}
              title={h.name}
              subtitle={holidayDates[h.id] ? `Next: ${parseKey(holidayDates[h.id]).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}` : null}
              checked={holidaysOff.includes(h.id)}
              onPress={() => toggleIn(holidaysOff, h.id, setHolidaysOff)}
            />
          ))}
        </ListSection>
      )}

      {editing ? (
        <ListSection>
          <ListRow title="Delete Schedule" destructive onPress={remove} />
        </ListSection>
      ) : null}
    </Sheet>
  );
}

// ─── Custom hours (per weekday) ──────────────────────────────────────────────

function CustomHours({ pattern, onChange }: { pattern: WeekPattern; onChange: (p: WeekPattern) => void }) {
  const { c } = useTheme();
  const firstOn = MON_FIRST.find(d => pattern[d]);

  function setDay(d: number, h: DayHours | undefined) {
    const next = { ...pattern };
    if (h) next[d] = h; else delete next[d];
    onChange(next);
  }

  function copyToAll() {
    if (firstOn === undefined) return;
    const h = pattern[firstOn]!;
    const next: WeekPattern = {};
    MON_FIRST.forEach(d => { if (pattern[d]) next[d] = { ...h }; });
    onChange(next);
  }

  return (
    <View style={{ gap: space.s }}>
      <View style={{ backgroundColor: c.fill, borderRadius: 16, overflow: 'hidden' }}>
        {MON_FIRST.map((d, i) => {
          const h = pattern[d];
          return (
            <View key={d}>
              {i > 0 && <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.separator, marginLeft: space.m }} />}
              <ListRow
                title={DAY_NAMES[d]}
                value={h ? undefined : 'Off'}
                trailing={
                  <Toggle
                    label={`Work on ${DAY_NAMES[d]}`}
                    value={!!h}
                    onValueChange={on => setDay(d, on ? (firstOn !== undefined ? { ...pattern[firstOn]! } : { start: '09:00', end: '17:00' }) : undefined)}
                  />
                }
              />
              {h ? (
                <View style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.m, paddingBottom: space.m, alignItems: 'flex-end' }}>
                  <View style={{ flex: 1 }}>
                    <TimeField label="Start" value={h.start} onChange={v => setDay(d, { ...h, start: v })} />
                  </View>
                  <Txt v="body" tone="secondary" style={{ paddingBottom: space.s + space.hair }}>–</Txt>
                  <View style={{ flex: 1 }}>
                    <TimeField label="End" value={h.end} onChange={v => setDay(d, { ...h, end: v })} />
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
      {firstOn !== undefined && Object.keys(pattern).length > 1 ? (
        <Tappable feedback="opacity" onPress={copyToAll} style={{ paddingHorizontal: space.m, minHeight: 44, justifyContent: 'center' }}>
          <Txt v="callout" tone="tint">
            Use {DAY_SHORT[firstOn]}’s hours ({formatHours(pattern[firstOn]!)}) for every workday
          </Txt>
        </Tappable>
      ) : null}
    </View>
  );
}

/** Free-form time entry ("9", "5:30pm", "17:00"), normalized on blur. */
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (hm: string) => void }) {
  const { c } = useTheme();
  const [text, setText] = useState(formatTime(value));
  const [bad, setBad] = useState(false);
  useEffect(() => { setText(formatTime(value)); setBad(false); }, [value]);

  function commit() {
    const hm = parseTime(text);
    if (!hm) { setBad(true); return; }
    setBad(false);
    setText(formatTime(hm));
    if (hm !== value) onChange(hm);
  }

  return (
    <Field
      label={label}
      value={text}
      onChangeText={t => { setText(t); if (bad) setBad(false); }}
      onBlur={commit}
      onSubmitEditing={commit}
      placeholder="9:00 AM"
      autoCorrect={false}
      autoCapitalize="none"
      accessibilityLabel={`${label} time`}
      style={[{ backgroundColor: c.background }, bad && { borderColor: c.danger }]}
      hint={bad ? 'Try “9am” or “17:30”' : undefined}
    />
  );
}

// ─── Import from file ────────────────────────────────────────────────────────

function ImportFromFile({ file, reading, onPick, onRemove }: {
  file: ScheduleFile | WorkSchedule['source'] | null;
  reading: 'idle' | 'reading' | 'unavailable' | 'filled' | 'unreadable';
  onPick: (pick: () => Promise<ScheduleFile | null>) => void;
  onRemove: () => void;
}) {
  const { c } = useTheme();

  // Web opens one file dialog either way; iOS distinguishes Photos from Files.
  const items = Platform.OS === 'web'
    ? [{ key: 'file', label: 'Choose File…', icon: 'folder-open-outline' as const, onSelect: () => onPick(pickScheduleDocument) }]
    : [
        { key: 'photos', label: 'Photo Library', icon: 'images-outline' as const, onSelect: () => onPick(pickScheduleImage) },
        { key: 'files', label: 'Files', icon: 'folder-open-outline' as const, onSelect: () => onPick(pickScheduleDocument) },
      ];

  if (!file) {
    return (
      <ListSection
        header="Got it from your employer?"
        footer="Upload a screenshot, photo, or PDF of your schedule. Or enter your hours below."
      >
        <Menu title="Import schedule" sections={[{ items }]}>
          {(open) => (
            <ListRow
              icon="document-attach-outline"
              title="Import Schedule"
              subtitle="Screenshot, photo, or PDF"
              tintTitle
              chevron
              onPress={open}
            />
          )}
        </Menu>
      </ListSection>
    );
  }

  const uri = 'uri' in file ? file.uri : null;
  const status =
    reading === 'reading' ? 'Reading your schedule…' :
    reading === 'filled' ? 'Hours filled in from your file — check them before saving.' :
    reading === 'unreadable' ? 'Couldn’t find a schedule in this file. Enter your hours below.' :
    'Automatic reading is coming soon. For now, enter the hours below — the file stays attached for reference.';

  return (
    <View style={{ gap: space.s }}>
      <SectionHeader title="Imported schedule" />
      <Menu title="Replace schedule file" sections={[{ items }]}>
        {(open) => (
          <View style={{ backgroundColor: c.fill, borderRadius: radius.group, flexDirection: 'row', alignItems: 'center', paddingRight: space.s, overflow: 'hidden', ...continuous }}>
          <Tappable
            onPress={open}
            accessibilityLabel={`${file.name}. Replace file`}
            style={{ flex: 1, minWidth: 0, padding: space.s, flexDirection: 'row', alignItems: 'center', gap: space.m }}
          >
            <View style={{ width: 56, height: 56, borderRadius: radius.control, overflow: 'hidden', backgroundColor: c.background, alignItems: 'center', justifyContent: 'center', ...continuous }}>
              {file.kind === 'image' && uri
                ? <Image source={{ uri }} style={{ width: 56, height: 56 }} resizeMode="cover" accessibilityLabel="Schedule preview" />
                : <Icon name={file.kind === 'pdf' ? 'document-text-outline' : 'image-outline'} size={26} color={c.secondaryLabel} />}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Txt v="callout" semibold numberOfLines={1}>{file.name}</Txt>
              <Txt v="footnote" tone="secondary" numberOfLines={1}>
                {[file.kind === 'pdf' ? 'PDF' : 'Image', formatBytes(file.size), 'Tap to replace'].filter(Boolean).join(' · ')}
              </Txt>
            </View>
          </Tappable>
          <IconButton icon="close-circle" label="Remove file" onPress={onRemove} />
          </View>
        )}
      </Menu>
      <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: space.s, paddingHorizontal: space.m, alignItems: 'flex-start' }}>
        {reading === 'reading'
          ? <ActivityIndicator size="small" color={c.secondaryLabel} />
          : <Icon name={reading === 'filled' ? 'checkmark-circle' : 'information-circle-outline'} size={16} color={reading === 'filled' ? c.tint : c.secondaryLabel} style={{ marginTop: 1 }} />}
        <Txt v="footnote" tone={reading === 'filled' ? 'tint' : 'secondary'} style={{ flex: 1 }}>{status}</Txt>
      </View>
    </View>
  );
}
