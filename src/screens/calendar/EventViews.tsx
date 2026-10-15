import React, { useEffect, useState } from 'react';
import { notify } from '../../lib/alert';
import { View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Event, Group, Profile } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Field, Icon, ListRow, ListSection, Sheet, Tag, Txt } from '../../components/ui';
import { WorkDay, formatHours, useWorkSchedules, workConflict, workOn } from '../../lib/workSchedule';
import { space, useTheme } from '../../theme';
import CalendarGrid from './CalendarGrid';
import { keyOf, longDate, relativeDay, shortDate, timeRange, todayKey } from './dates';
import { ParsedEvent, parseEventText } from '../../lib/nlEvent';
import { formatTime } from '../../lib/workSchedule';
import { REPEAT_OPTIONS, RepeatKey, describeRecurrence, ruleFor, untilLabel } from '../../lib/recurrence';
import { addDemoEvent } from '../../lib/demo';
import { useCircle } from '../../lib/people';
import { Assignment } from '../../types';
import { AssignEditor, AssignmentList, InvitePicker } from './InviteViews';

// ─── Detail ──────────────────────────────────────────────────────────────────

interface DetailProps {
  event: Event;
  attendees: AvatarPerson[];
  meId: string | null;
  group: Group | null;
  onClaim?: (itemId: string, claim: boolean) => void;
  onAssign?: (items: Assignment[]) => void;   // organizer edits
}

/** Event content; the caller provides the scroll container (pane or sheet). */
export function EventDetail({ event, attendees, meId, group, onClaim, onAssign }: DetailProps) {
  const organizer = !!meId && event.created_by === meId;
  const going = !!meId && event.attendees?.includes(meId);
  const minutes = Math.round((new Date(event.end_time).getTime() - new Date(event.start_time).getTime()) / 60000);
  const duration = minutes >= 60 ? `${Math.floor(minutes / 60)} hr${minutes % 60 ? ` ${minutes % 60} min` : ''}` : `${minutes} min`;
  const creator = attendees.find(a => a.id === event.created_by) ?? event.profiles;
  const conflict = workConflict(useWorkSchedules(), event.start_time, event.end_time);

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        {group ? <Txt v="footnote" tone="secondary" semibold style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{group.name}</Txt> : null}
        <Txt v="title" accessibilityRole="header">{event.title}</Txt>
        <Txt v="callout" tone="secondary">{longDate(keyOf(event.start_time))}</Txt>
        {going ? <View style={{ flexDirection: 'row' }}><Tag label="You’re going" tone="tint" /></View> : null}
      </View>

      <ListSection separatorInset={60}>
        <ListRow icon="time-outline" title={timeRange(event.start_time, event.end_time)} subtitle={duration} />
        {event.recurrence ? (
          <ListRow icon="repeat" title={describeRecurrence({ ...event.recurrence, until: null }, event.start_time)} subtitle={untilLabel(event.recurrence)} />
        ) : null}
        {conflict ? <ListRow icon="briefcase-outline" title="During your work hours" subtitle={formatHours(conflict)} /> : null}
        {event.location ? <ListRow icon="location-outline" title={event.location} /> : null}
      </ListSection>

      {attendees.length > 0 && (
        <ListSection header={`Going · ${attendees.length}`} separatorInset={64}>
          {attendees.map(a => (
            <ListRow
              key={a.id}
              leading={<Avatar person={a} size={32} highlight={a.id === meId} />}
              title={a.id === meId ? `${a.full_name ?? 'You'} (you)` : (a.full_name ?? a.email ?? 'Someone')}
            />
          ))}
        </ListSection>
      )}

      {organizer && onAssign ? (
        // The organizer hands things out; everyone else claims what's open.
        <AssignEditor
          items={event.assignments ?? []}
          onChange={onAssign}
          people={attendees}
          meId={meId}
          eventTitle={event.title}
          title="Who’s bringing what"
          hint="You’re organizing — tap an item to assign it. Open items can be claimed by anyone invited."
        />
      ) : event.assignments?.length ? (
        <AssignmentList items={event.assignments} people={attendees} meId={meId} canClaim={going} onClaim={onClaim} />
      ) : null}

      {event.description ? (
        <ListSection header="Notes">
          <View style={{ padding: space.m }}>
            <Txt v="body">{event.description}</Txt>
          </View>
        </ListSection>
      ) : null}

      {creator?.full_name ? <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>Added by {creator.full_name}</Txt> : null}
    </View>
  );
}

// ─── Composer ────────────────────────────────────────────────────────────────

interface ComposerProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  initialDate: string;
  group: Group | null;
  meId: string | null;
  members: Profile[];
  suggestedIds: string[];
  isDemo: boolean;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

export function EventComposer({ visible, onClose, onSaved, initialDate, group, meId, members, suggestedIds, isDemo }: ComposerProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [pickingDate, setPickingDate] = useState(false);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [invited, setInvited] = useState<string[]>([]);
  const [invitedGroups, setInvitedGroups] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const circle = useCircle(visible, meId);
  const [saving, setSaving] = useState(false);
  const [describe, setDescribe] = useState('');
  const [parsed, setParsed] = useState<ParsedEvent | null>(null);
  const [repeat, setRepeat] = useState<RepeatKey>('never');
  const [repeatUntil, setRepeatUntil] = useState<string | null>(null);
  const [picking, setPicking] = useState<'repeat' | 'until' | null>(null);

  // Fresh form each time the sheet opens.
  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDate(initialDate); setPickingDate(false);
    setStartTime('09:00'); setEndTime('10:00');
    setLocation(''); setNotes(''); setInvited([]); setInvitedGroups([]); setAssignments([]);
    setDescribe(''); setParsed(null);
    setRepeat('never'); setRepeatUntil(null); setPicking(null);
  }, [visible, initialDate]);

  // The sentence drives the form: each edit rebuilds the fields from the
  // defaults plus whatever was understood. Manual edits below stick until
  // the sentence changes again.
  function onDescribe(text: string) {
    setDescribe(text);
    if (!text.trim()) { setParsed(null); return; }
    const everyone = circle.people.length ? circle.people.map(x => x.profile) : members;
    const p = parseEventText(text, { today: todayKey(), members: everyone, meId });
    setParsed(p);
    setTitle(p.title);
    setDate(p.date ?? initialDate);
    setStartTime(p.start ?? '09:00');
    setEndTime(p.end ?? '10:00');
    setLocation(p.location ?? '');
    setInvited(p.inviteIds);
    setRepeat(p.repeat ?? 'never');
  }

  // Everyone coming: picked people plus members of picked groups.
  const attendeeIds = Array.from(new Set([
    ...invited,
    ...circle.groups.filter(g => invitedGroups.includes(g.group.id)).flatMap(g => g.memberIds),
  ])).filter(id => id !== meId);
  const me = members.find(m => m.id === meId);
  const assignable: AvatarPerson[] = [
    ...(me ? [me] : meId ? [{ id: meId, full_name: 'You' }] : []),
    ...attendeeIds.map(id => circle.people.find(p => p.profile.id === id)?.profile ?? members.find(m => m.id === id)).filter(Boolean) as AvatarPerson[],
  ];

  async function save() {
    if (!title.trim()) return;
    if (!group || !meId) return notify('Not signed in', 'Sign in to save events.');
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return notify('Check the time', 'Use 24-hour times like 09:00 or 18:30.');
    const startIso = new Date(`${date}T${startTime.padStart(5, '0')}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime.padStart(5, '0')}:00`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) return notify('Check the time', 'End time must be after the start time.');
    if (repeat !== 'never' && repeatUntil && repeatUntil < date) return notify('Check the repeat', 'The repeat has to end on or after the first day.');
    const row = {
      title: title.trim(),
      description: notes.trim() || null,
      location: location.trim() || null,
      start_time: startIso,
      end_time: endIso,
      created_by: meId,
      attendees: [meId, ...attendeeIds],
      invited_group_ids: invitedGroups,
      // Anyone dropped from the invite list loses their assignment.
      assignments: assignments.map(a => (a.assignee_id && a.assignee_id !== meId && !attendeeIds.includes(a.assignee_id) ? { ...a, assignee_id: null } : a)),
      recurrence: ruleFor(repeat, repeatUntil),
    };
    // Demo events live in memory so the calendar can show them.
    if (isDemo) { addDemoEvent(row); onSaved(); onClose(); return; }
    setSaving(true);
    const { error } = await supabase.from('events').insert({ ...row, group_id: group.id } as any);
    setSaving(false);
    if (error) return notify('Couldn’t save', error.message);
    onSaved();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New Event"
      action={{ label: 'Add', onPress: save, disabled: !title.trim(), loading: saving }}
    >
      <DescribeField value={describe} onChange={onDescribe} parsed={parsed} onSubmit={save} />

      <Field value={title} onChangeText={setTitle} placeholder="Title" accessibilityLabel="Title" returnKeyType="next" />

      <ListSection>
        <ListRow
          icon="calendar-outline"
          title={longDate(date)}
          value={pickingDate ? 'Done' : 'Change'}
          onPress={() => setPickingDate(p => !p)}
        />
        {pickingDate ? (
          <CalendarGrid
            selected={date}
            onSelect={(k) => { setDate(k); setPickingDate(false); }}
            marked={new Set()}
            expanded
          />
        ) : null}
      </ListSection>

      <View style={{ flexDirection: 'row', gap: space.m }}>
        <View style={{ flex: 1 }}>
          <Field label="Starts" value={startTime} onChangeText={setStartTime} placeholder="09:00" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Ends" value={endTime} onChangeText={setEndTime} placeholder="10:00" keyboardType="numbers-and-punctuation" />
        </View>
      </View>

      <ListSection>
        <ListRow
          icon="repeat"
          title="Repeat"
          value={REPEAT_OPTIONS.find(o => o.key === repeat)!.label}
          chevron={picking !== 'repeat'}
          onPress={() => setPicking(p => (p === 'repeat' ? null : 'repeat'))}
        />
        {picking === 'repeat' ? REPEAT_OPTIONS.map(o => (
          <ListRow
            key={o.key}
            title={o.label}
            checked={repeat === o.key}
            onPress={() => { setRepeat(o.key); setPicking(null); }}
            style={{ paddingLeft: space.m + 28 + space.m }}
          />
        )) : null}
        {repeat !== 'never' ? (
          <ListRow
            icon="flag-outline"
            title="End repeat"
            value={repeatUntil ? shortDate(repeatUntil) : 'Never'}
            chevron={picking !== 'until'}
            onPress={() => setPicking(p => (p === 'until' ? null : 'until'))}
          />
        ) : null}
        {repeat !== 'never' && picking === 'until' ? (
          <>
            <ListRow
              title="Never"
              checked={!repeatUntil}
              onPress={() => { setRepeatUntil(null); setPicking(null); }}
              style={{ paddingLeft: space.m + 28 + space.m }}
            />
            <CalendarGrid
              selected={repeatUntil ?? date}
              onSelect={(k) => { setRepeatUntil(k); setPicking(null); }}
              marked={new Set()}
              expanded
            />
          </>
        ) : null}
      </ListSection>
      {repeat !== 'never' ? (
        <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m, marginTop: -space.s }}>
          {describeRecurrence(ruleFor(repeat, repeatUntil)!, new Date(`${date}T${TIME_RE.test(startTime) ? startTime.padStart(5, '0') : '09:00'}:00`).toISOString())}.
        </Txt>
      ) : null}

      <WorkHint
        date={date}
        startIso={TIME_RE.test(startTime) ? new Date(`${date}T${startTime.padStart(5, '0')}:00`).toISOString() : null}
        endIso={TIME_RE.test(endTime) ? new Date(`${date}T${endTime.padStart(5, '0')}:00`).toISOString() : null}
      />

      <Field label="Location" value={location} onChangeText={setLocation} placeholder="Optional" />

      <InvitePicker
        people={circle.people}
        groups={circle.groups}
        meId={meId}
        suggestedIds={suggestedIds}
        userIds={invited}
        groupIds={invitedGroups}
        onChangeUsers={setInvited}
        onChangeGroups={setInvitedGroups}
      />

      <AssignEditor items={assignments} onChange={setAssignments} people={assignable} meId={meId} eventTitle={title} />

      <Field label="Notes" value={notes} onChangeText={setNotes} placeholder="Optional" multiline />
    </Sheet>
  );
}

// ─── Work context ────────────────────────────────────────────────────────────

/** Quiet one-liner under a day heading: your hours, or the holiday you have off. */
export function WorkLine({ day }: { day: WorkDay }) {
  const { c } = useTheme();
  if (!day) return null;
  const isWork = day.kind === 'work';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, marginTop: space.hair }}>
      <Icon name={isWork ? 'briefcase-outline' : 'sunny-outline'} size={14} color={c.secondaryLabel} />
      <Txt v="footnote" tone="secondary">
        {isWork ? `Work · ${formatHours(day.hours)}` : `Off · ${day.holiday.name}`}
      </Txt>
    </View>
  );
}

/** Inline heads-up in the composer when the chosen time collides with work. */
function WorkHint({ date, startIso, endIso }: { date: string; startIso: string | null; endIso: string | null }) {
  const { c } = useTheme();
  const schedules = useWorkSchedules();
  const day = workOn(schedules, date);
  const conflict = startIso && endIso ? workConflict(schedules, startIso, endIso) : null;
  if (!day) return null;
  const text =
    day.kind === 'holiday' ? `You’re off — ${day.holiday.name}.` :
    conflict ? `Overlaps your work hours (${formatHours(conflict)}).` :
    `You work ${formatHours(day.hours)} — this fits around it.`;
  const warn = !!conflict;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-start', paddingHorizontal: space.m, marginTop: -space.s }}>
      <Icon name={warn ? 'alert-circle' : day.kind === 'holiday' ? 'sunny-outline' : 'briefcase-outline'} size={16} color={warn ? c.danger : c.secondaryLabel} style={{ marginTop: 1 }} />
      <Txt v="footnote" tone={warn ? 'danger' : 'secondary'} style={{ flex: 1 }}>{text}</Txt>
    </View>
  );
}

// ─── Natural-language entry ──────────────────────────────────────────────────

type ParsedSummary = Pick<ParsedEvent, 'date' | 'start' | 'end' | 'location' | 'people' | 'repeat'>;

export function DescribeField({
  value, onChange, parsed, onSubmit,
  placeholder = 'Dinner with Ana next Tuesday at 7pm',
  filledHint = 'Filled in below — adjust anything, then Add.',
  emptyHint = 'Add a day or time, like “Friday at 7”.',
  accessibilityLabel = 'Describe the event in your own words',
}: {
  value: string; onChange: (t: string) => void; parsed: ParsedSummary | null; onSubmit?: () => void;
  placeholder?: string; filledHint?: string; emptyHint?: string; accessibilityLabel?: string;
}) {
  const { c } = useTheme();
  const chips: { icon: React.ComponentProps<typeof Icon>['name']; label: string }[] = [];
  if (parsed?.date) {
    const rel = relativeDay(parsed.date);
    chips.push({ icon: 'calendar-outline', label: rel === 'Today' || rel === 'Tomorrow' ? rel : shortDate(parsed.date) });
  }
  if (parsed?.start) chips.push({ icon: 'time-outline', label: parsed.end ? `${formatTime(parsed.start, true)} – ${formatTime(parsed.end, true)}` : formatTime(parsed.start, true) });
  if (parsed?.repeat) chips.push({ icon: 'repeat', label: REPEAT_OPTIONS.find(o => o.key === parsed.repeat)!.label });
  parsed?.people.forEach(p => chips.push({ icon: 'person-outline', label: p }));
  if (parsed?.location) chips.push({ icon: 'location-outline', label: parsed.location });

  return (
    <View style={{ gap: space.s }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, paddingHorizontal: space.m }}>
        <Icon name="sparkles-outline" size={14} color={c.tint} />
        <Txt v="footnote" tone="secondary" semibold>Describe it</Txt>
      </View>
      <Field
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        autoFocus
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint="Fills in the title, date, time, people, and place below"
      />
      {parsed ? (
        <View accessibilityLiveRegion="polite" style={{ paddingHorizontal: space.m, gap: space.s }}>
          {chips.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
              {chips.map((ch, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, height: 28, paddingHorizontal: space.s, borderRadius: 8, backgroundColor: c.tintSoft }}>
                  <Icon name={ch.icon} size={14} color={c.tint} />
                  <Txt v="footnote" tone="tint" semibold numberOfLines={1}>{ch.label}</Txt>
                </View>
              ))}
            </View>
          ) : null}
          <Txt v="footnote" tone="secondary">
            {parsed.date || parsed.start ? filledHint : emptyHint}
          </Txt>
        </View>
      ) : null}
    </View>
  );
}
