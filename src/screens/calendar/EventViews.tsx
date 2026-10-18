import React, { useEffect, useState } from 'react';
import { isAllDay, isMultiDay, spanLabel, spanLength } from '../../lib/span';
import { notify } from '../../lib/alert';
import { View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { Event, Group, Profile } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Button, Field, Icon, IconName, ListRow, ListSection, Sheet, Tag, Tappable, Toggle, Txt } from '../../components/ui';
import { WorkDay, formatHours, useWorkSchedules, workConflict, workOn } from '../../lib/workSchedule';
import { space, useTheme } from '../../theme';
import CalendarGrid from './CalendarGrid';
import { addDays, keyOf, longDate, parseKey, relativeDay, shortDate, timeRange, todayKey } from './dates';
import { ParsedEvent, parseEventText } from '../../lib/nlEvent';
import { formatTime } from '../../lib/workSchedule';
import { REPEAT_OPTIONS, RepeatKey, describeRecurrence, keyFor, ruleFor, untilLabel } from '../../lib/recurrence';
import { addDemoEvent, DEMO_EVENTS } from '../../lib/demo';
import { sendNotifications } from '../../lib/notifications';
import { useCircle } from '../../lib/people';
import { Assignment, Rsvp } from '../../types';
import { Reply, RSVP_LABEL, repliesByStatus, repliesOpen, replyOf } from '../../lib/rsvp';
import { hostOf, nextHostOf, ordinal } from '../../lib/plans';
import { AssignEditor, AssignmentList, InvitePicker } from './InviteViews';

// ─── Detail ──────────────────────────────────────────────────────────────────

/** Which shared calendar an event belongs to; opens it when you're in the group. */
function GroupBadge({ group, onPress }: { group: Group; onPress?: () => void }) {
  const { c } = useTheme();
  const body = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
      <Icon name="people-circle-outline" size={16} color={c.secondaryLabel} />
      <Txt v="footnote" tone="secondary" semibold style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>{group.name}</Txt>
      {onPress ? <Icon name="chevron-forward" size={12} color={c.secondaryLabel} /> : null}
    </View>
  );
  if (!onPress) return <View style={{ flexDirection: 'row' }}>{body}</View>;
  return (
    <View style={{ flexDirection: 'row' }}>
      <Tappable feedback="opacity" onPress={onPress} accessibilityLabel={`On the ${group.name} shared calendar. Open it`} style={{ paddingVertical: 2 }}>
        {body}
      </Tappable>
    </View>
  );
}

interface DetailProps {
  event: Event;
  attendees: AvatarPerson[];
  meId: string | null;
  group: Group | null;
  onOpenGroup?: () => void;                    // open that group's shared calendar, if you're in it
  onClaim?: (itemId: string, claim: boolean) => void;
  onAssign?: (items: Assignment[]) => void;   // organizer edits
  onRsvp?: (reply: Rsvp, note?: string) => void;
  onEdit?: () => void;
  onCancel?: () => void;
  onNudge?: (ids: string[]) => void;          // remind people who haven't replied
  onDoAgain?: () => void;                      // after: same plan again
  onSamePeople?: () => void;                   // after: same people, new plan
  onAddMemories?: () => void;                  // after: photos and notes
  conversation?: React.ReactNode;              // comments, or memories afterwards
}

const REPLY_OPTIONS: { key: Rsvp; label: string; icon: IconName }[] = [
  { key: 'going', label: 'Going', icon: 'checkmark-circle-outline' },
  { key: 'maybe', label: 'Maybe', icon: 'help-circle-outline' },
  { key: 'declined', label: 'Can’t go', icon: 'close-circle-outline' },
];

/** Event content; the caller provides the scroll container (pane or sheet). */
export function EventDetail({ event, attendees, meId, group, onOpenGroup, onClaim, onAssign, onRsvp, onEdit, onCancel, onNudge, onDoAgain, onSamePeople, onAddMemories, conversation }: DetailProps) {
  const organizer = !!meId && event.created_by === meId;
  const reply = replyOf(event, meId);
  const cancelled = !!event.cancelled_at;
  const open = repliesOpen(event);   // replies close when it starts
  const duration = spanLength(event.start_time, event.end_time);
  const multiDay = isMultiDay(event.start_time, event.end_time);
  const allDay = isAllDay(event.start_time, event.end_time);
  const creator = attendees.find(a => a.id === event.created_by) ?? event.profiles;
  const conflict = workConflict(useWorkSchedules(), event.start_time, event.end_time);
  const byStatus = repliesByStatus(event);
  const personOf = (id: string): AvatarPerson => attendees.find(a => a.id === id) ?? { id };
  const others = (event.attendees ?? []).filter(id => id !== event.created_by);
  const replied = others.filter(id => replyOf(event, id) !== 'pending').length;
  const over = new Date(event.end_time).getTime() < Date.now();
  const wasThere = !cancelled && (reply === 'going' || reply === 'maybe');
  // Traditions: whose turn it is, and which time this is.
  const host = hostOf(event);
  const nextHost = nextHostOf(event);
  const nameOf = (id: string) => (id === meId ? 'You' : personOf(id).full_name?.split(' ')[0] ?? 'Someone');

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        {group ? <GroupBadge group={group} onPress={onOpenGroup} /> : null}
        <Txt v="title" accessibilityRole="header" style={cancelled ? { textDecorationLine: 'line-through' } : undefined}>{event.title}</Txt>
        <Txt v="callout" tone="secondary">{multiDay ? spanLabel(event.start_time, event.end_time) : longDate(keyOf(event.start_time))}</Txt>
        {cancelled ? <View style={{ flexDirection: 'row' }}><Tag label="Cancelled" /></View>
          : organizer ? <View style={{ flexDirection: 'row' }}><Tag label="You’re organizing" tone="tint" /></View>
          : reply && reply !== 'pending' ? <View style={{ flexDirection: 'row' }}><Tag label={reply === 'going' ? 'You’re going' : RSVP_LABEL[reply]} tone={reply === 'going' ? 'tint' : 'secondary'} /></View>
          : null}
      </View>

      {reply && !organizer && open && onRsvp ? (
        <RsvpSection
          key={event.series_id ?? event.id}
          event={event}
          reply={reply}
          meId={meId}
          firstName={(id) => personOf(id).full_name?.split(' ')[0] ?? 'someone'}
          onRsvp={onRsvp}
        />
      ) : null}

      <ListSection separatorInset={60}>
        <ListRow
          icon="time-outline"
          title={allDay ? (multiDay ? 'All day, every day' : 'All day') : multiDay ? spanLabel(event.start_time, event.end_time) : timeRange(event.start_time, event.end_time)}
          subtitle={duration}
        />
        {event.recurrence ? (
          <ListRow icon="repeat" title={describeRecurrence({ ...event.recurrence, until: null }, event.start_time)} subtitle={untilLabel(event.recurrence)} />
        ) : null}
        {conflict && !cancelled ? <ListRow icon="briefcase-outline" title="During your work hours" subtitle={formatHours(conflict)} /> : null}
        {event.location ? <ListRow icon="location-outline" title={event.location} /> : null}
        {host ? (
          <ListRow
            icon="home-outline"
            title={host === meId ? 'Your turn to host' : `${nameOf(host)} is hosting`}
            subtitle={[`${ordinal((event.occurrence ?? 0) + 1)} time`, nextHost && nextHost !== host ? `Next: ${nameOf(nextHost)}` : null].filter(Boolean).join(' · ')}
          />
        ) : null}
      </ListSection>

      {/* After: keep the memories first, then make the next one. */}
      {over && wasThere && (onAddMemories || onDoAgain || onSamePeople) ? (
        <View style={{ gap: space.s }}>
          <Txt v="headline" style={{ paddingHorizontal: space.m }}>How was it?</Txt>
          {onAddMemories ? <Button label="Add Memories" icon="images-outline" onPress={onAddMemories} block /> : null}
          {onDoAgain || onSamePeople ? (
            <ListSection separatorInset={60}>
              {onDoAgain ? <ListRow icon="refresh" title="Same plan again" tintTitle chevron onPress={onDoAgain} /> : null}
              {onSamePeople ? <ListRow icon="people-outline" title="Same people, new plan" tintTitle chevron onPress={onSamePeople} /> : null}
            </ListSection>
          ) : null}
        </View>
      ) : null}

      {organizer && others.length > 0 && !cancelled ? (
        <View style={{ gap: space.s, paddingHorizontal: space.m }}>
          <Txt v="callout" tone="secondary">
            {replied === others.length ? 'Everyone has replied.' : `${replied} of ${others.length} replied.`}
          </Txt>
          {byStatus.pending.length > 0 && open && onNudge ? (
            <View style={{ flexDirection: 'row' }}>
              <Button
                label={`Remind ${byStatus.pending.length === 1 ? (personOf(byStatus.pending[0]).full_name?.split(' ')[0] ?? '1 person') : `${byStatus.pending.length} people`}`}
                icon="notifications-outline"
                variant="gray"
                onPress={() => onNudge(byStatus.pending)}
              />
            </View>
          ) : null}
        </View>
      ) : null}

      {(['going', 'maybe', 'declined', 'pending'] as Reply[]).map(status => byStatus[status].length ? (
        <ListSection key={status} header={`${RSVP_LABEL[status]} · ${byStatus[status].length}`} separatorInset={64}>
          {byStatus[status].map(id => {
            const a = personOf(id);
            return (
              <ListRow
                key={id}
                leading={<Avatar person={a} size={32} highlight={id === meId} />}
                title={id === meId ? `${a.full_name ?? 'You'} (you)` : (a.full_name ?? a.email ?? 'Someone')}
                subtitle={event.rsvp_notes?.[id] ? `“${event.rsvp_notes[id]}”` : undefined}
                trailing={id === event.created_by ? <Tag label="Organizer" /> : null}
              />
            );
          })}
        </ListSection>
      ) : null)}

      {organizer && onAssign && !cancelled ? (
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
        <AssignmentList items={event.assignments} people={attendees} meId={meId} canClaim={!!reply && reply !== 'declined' && !cancelled} onClaim={onClaim} />
      ) : null}

      {conversation}

      {event.description ? (
        <ListSection header="Notes">
          <View style={{ padding: space.m }}>
            <Txt v="body">{event.description}</Txt>
          </View>
        </ListSection>
      ) : null}

      {organizer && !cancelled && (onEdit || onCancel) ? (
        <ListSection footer={event.recurrence ? 'Changes apply to every time it repeats.' : undefined}>
          {onEdit ? <ListRow icon="create-outline" title="Edit Event" tintTitle onPress={onEdit} /> : null}
          {onCancel ? <ListRow icon="close-circle-outline" title="Cancel Event" destructive onPress={onCancel} /> : null}
        </ListSection>
      ) : null}

      {creator?.full_name ? <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>Added by {creator.full_name}</Txt> : null}
    </View>
  );
}

// ─── RSVP ────────────────────────────────────────────────────────────────────

const YOUR_REPLY: Record<Rsvp, { title: string; icon: IconName }> = {
  going: { title: 'You’re going', icon: 'checkmark-circle' },
  maybe: { title: 'You’re a maybe', icon: 'help-circle' },
  declined: { title: 'You can’t go', icon: 'close-circle' },
};

/**
 * First reply: three buttons. Once you've answered, your answer stands, with
 * Edit RSVP behind it. Editing is deliberate: pick the new answer, optionally
 * say why, and confirm — with a heads-up that the organizer and everyone
 * going or maybe will hear about it.
 */
function RsvpSection({ event, reply, meId, firstName, onRsvp }: {
  event: Event; reply: Reply; meId: string | null; firstName: (id: string) => string;
  onRsvp: (r: Rsvp, note?: string) => void;
}) {
  const { c } = useTheme();
  const myNote = (meId && event.rsvp_notes?.[meId]) || '';
  const [editing, setEditing] = useState(false);
  const [choice, setChoice] = useState<Rsvp | null>(reply === 'pending' ? null : reply);
  const [note, setNote] = useState(myNote);
  const host = event.created_by ? firstName(event.created_by) : 'They';
  const series = event.recurrence ? <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>Your RSVP applies to every time it repeats.</Txt> : null;

  const buttons = (selected: Rsvp | null, onPick: (r: Rsvp) => void) => (
    <View style={{ flexDirection: 'row', gap: space.s }}>
      {REPLY_OPTIONS.map(o => (
        <Button
          key={o.key}
          label={o.label}
          icon={selected === o.key ? 'checkmark' : o.icon}
          variant={selected === o.key ? 'filled' : 'gray'}
          onPress={() => onPick(o.key)}
          style={{ flex: 1 }}
        />
      ))}
    </View>
  );

  if (reply === 'pending') {
    return (
      <View style={{ gap: space.s }}>
        <Txt v="headline" style={{ paddingHorizontal: space.m }}>{host} invited you. Can you make it?</Txt>
        {buttons(null, (r) => onRsvp(r))}
        {series}
      </View>
    );
  }

  function startEditing() {
    setChoice(reply as Rsvp);
    setNote(myNote);
    setEditing(true);
  }

  if (!editing) {
    const mine = YOUR_REPLY[reply];
    return (
      <ListSection header="Your RSVP" separatorInset={60}>
        <ListRow
          icon={mine.icon}
          title={mine.title}
          subtitle={myNote ? `“${myNote}”` : undefined}
          trailing={<Button label="Edit RSVP" variant="plain" onPress={startEditing} />}
        />
      </ListSection>
    );
  }

  // Who hears about a change: the organizer, plus everyone going or maybe.
  const byStatus = repliesByStatus(event);
  const told = Array.from(new Set([
    ...(event.created_by ? [event.created_by] : []),
    ...byStatus.going, ...byStatus.maybe,
  ])).filter(id => id !== meId);
  const names = told.map(id => (id === event.created_by ? `${firstName(id)} (organizer)` : firstName(id)));
  const list =
    names.length <= 3 ? (names.length < 2 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`)
    : `${names[0]} and ${names.length - 1} others going or maybe`;
  const changed = choice !== reply || note.trim() !== myNote;

  return (
    <View style={{ gap: space.s }}>
      <Txt v="headline" style={{ paddingHorizontal: space.m }}>Edit your RSVP</Txt>
      {buttons(choice, setChoice)}
      <Field
        value={note}
        onChangeText={setNote}
        placeholder={choice === 'declined' ? 'Add a note, like why you can’t make it' : 'Add a note (optional)'}
        accessibilityLabel="Note with your RSVP"
        maxLength={280}
        multiline
      />
      <View style={{ flexDirection: 'row', gap: space.s, alignItems: 'flex-start', paddingHorizontal: space.m }}>
        <Icon name="notifications-outline" size={16} color={c.secondaryLabel} style={{ marginTop: 1 }} />
        <Txt v="footnote" tone="secondary" style={{ flex: 1 }}>
          {told.length ? `Updating your RSVP lets ${list} know` : 'Updating your RSVP lets the organizer know'}
          {note.trim() ? ', with your note.' : '.'}
        </Txt>
      </View>
      {series}
      <View style={{ flexDirection: 'row', gap: space.s }}>
        <Button
          label="Update RSVP"
          disabled={!changed || !choice}
          onPress={() => { setEditing(false); onRsvp(choice!, note.trim() || undefined); }}
          style={{ flex: 1 }}
        />
        <Button label="Keep My RSVP" variant="gray" onPress={() => setEditing(false)} style={{ flex: 1 }} />
      </View>
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
  editing?: Event | null;      // the series row when editing a repeating event
  prefill?: { title?: string; location?: string; notes?: string; people?: string[]; date?: string | null; start?: string; end?: string } | null;
  myName?: string;
}

const TIME_RE = /^([01]?\d|2[0-3]):([0-5]\d)$/;

const addHour = (hm: string, n: number) => { const [h, m] = hm.split(':').map(Number); return `${String(Math.min(23, h + n)).padStart(2, '0')}:${String(m).padStart(2, '0')}`; };
const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

export function EventComposer({ visible, onClose, onSaved, initialDate, group, meId, members, suggestedIds, isDemo, editing, prefill, myName = 'Someone' }: ComposerProps) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(initialDate);
  const [pickingDate, setPickingDate] = useState(false);
  // Several days in a row: the last day (inclusive), and whether times matter.
  const [endDate, setEndDate] = useState(initialDate);
  const [pickingEnd, setPickingEnd] = useState(false);
  const [allDay, setAllDay] = useState(false);
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
  const [rotate, setRotate] = useState(false);   // traditions: take turns hosting

  // Fresh form each time the sheet opens, or the event being edited.
  useEffect(() => {
    if (!visible) return;
    setPickingDate(false); setPickingEnd(false); setDescribe(''); setParsed(null); setPicking(null);
    if (editing) {
      const whole = isAllDay(editing.start_time, editing.end_time);
      setTitle(editing.title); setDate(keyOf(editing.start_time));
      setAllDay(whole);
      setEndDate(keyOf(whole ? new Date(Date.parse(editing.end_time) - 1).toISOString() : editing.end_time));
      setStartTime(hhmm(editing.start_time)); setEndTime(hhmm(editing.end_time));
      setLocation(editing.location ?? ''); setNotes(editing.description ?? '');
      setInvited((editing.attendees ?? []).filter(id => id !== meId));
      setInvitedGroups(editing.invited_group_ids ?? []);
      setAssignments(editing.assignments ?? []);
      setRepeat(keyFor(editing.recurrence)); setRepeatUntil(editing.recurrence?.until ?? null);
      setRotate(!!editing.host_rotation?.length);
      return;
    }
    setTitle(prefill?.title ?? ''); setDate(prefill?.date ?? initialDate);
    setEndDate(prefill?.date ?? initialDate); setAllDay(false);
    setStartTime(prefill?.start ?? '18:00'); setEndTime(prefill?.end ?? (prefill?.start ? addHour(prefill.start, 2) : '20:00'));
    setLocation(prefill?.location ?? ''); setNotes(prefill?.notes ?? '');
    setInvited((prefill?.people ?? []).filter(id => id !== meId)); setInvitedGroups([]); setAssignments([]);
    setRepeat('never'); setRepeatUntil(null); setRotate(false);
  }, [visible, initialDate, editing, prefill]);

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
    setEndDate(p.date ?? initialDate);
    setStartTime(p.start ?? '18:00');
    setEndTime(p.end ?? (p.start ? addHour(p.start, 2) : '20:00'));
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

  /** Moving the first day keeps the plan the same number of days long. */
  function pickStart(k: string) {
    const length = Math.round((parseKey(endDate).getTime() - parseKey(date).getTime()) / 86400000);
    setDate(k);
    setEndDate(addDays(k, Math.max(0, length)));
  }

  /** Start and end as ISO, or null while a time is unreadable. All-day: midnight to midnight after the last day. */
  function span(): [string, string] | null {
    if (allDay) return [new Date(`${date}T00:00:00`).toISOString(), new Date(`${addDays(endDate, 1)}T00:00:00`).toISOString()];
    if (!TIME_RE.test(startTime) || !TIME_RE.test(endTime)) return null;
    return [
      new Date(`${date}T${startTime.padStart(5, '0')}:00`).toISOString(),
      new Date(`${endDate}T${endTime.padStart(5, '0')}:00`).toISOString(),
    ];
  }

  async function save() {
    if (!title.trim()) return;
    if (!group || !meId) return notify('Not signed in', 'Sign in to save events.');
    const times = span();
    if (!times) return notify('Check the time', 'Use 24-hour times like 09:00 or 18:30.');
    const [startIso, endIso] = times;
    if (endDate < date) return notify('Check the days', 'The last day can’t be before the first.');
    if (new Date(endIso) <= new Date(startIso)) return notify('Check the time', 'End time must be after the start time.');
    if (repeat !== 'never' && repeatUntil && repeatUntil < date) return notify('Check the repeat', 'The repeat has to end on or after the first day.');
    // A new time asks everyone again; other edits keep their replies.
    const timeChanged = !!editing && (editing.start_time !== startIso || editing.end_time !== endIso || keyFor(editing.recurrence) !== repeat);
    const keptReplies = Object.fromEntries(Object.entries(editing?.rsvps ?? {}).filter(([id]) => attendeeIds.includes(id)));
    const keptNotes = Object.fromEntries(Object.entries(editing?.rsvp_notes ?? {}).filter(([id]) => attendeeIds.includes(id)));
    const row = {
      title: title.trim(),
      description: notes.trim() || null,
      location: location.trim() || null,
      start_time: startIso,
      end_time: endIso,
      created_by: editing?.created_by ?? meId,
      attendees: [meId, ...attendeeIds],
      invited_group_ids: invitedGroups,
      // Anyone dropped from the invite list loses their assignment.
      assignments: assignments.map(a => (a.assignee_id && a.assignee_id !== meId && !attendeeIds.includes(a.assignee_id) ? { ...a, assignee_id: null } : a)),
      recurrence: ruleFor(repeat, repeatUntil),
      rsvps: timeChanged ? {} : keptReplies,
      rsvp_notes: timeChanged ? {} : keptNotes,
      // Hosts take turns in the order people were invited, starting with you.
      host_rotation: repeat !== 'never' && rotate
        ? (editing?.host_rotation?.length
            ? [...editing.host_rotation.filter(id => id === meId || attendeeIds.includes(id)), ...attendeeIds.filter(id => !editing.host_rotation!.includes(id))]
            : [meId, ...attendeeIds])
        : [],
    };

    // Who hears about it: new invitees get an invite; everyone else still
    // invited hears what changed.
    const before = new Set(editing?.attendees ?? []);
    const added = attendeeIds.filter(id => !before.has(id));
    const kept = attendeeIds.filter(id => before.has(id));
    const when = isMultiDay(startIso, endIso) ? spanLabel(startIso, endIso)
      : allDay ? `${shortDate(date)} · All day`
      : `${shortDate(date)} · ${timeRange(startIso, endIso)}`;
    const changes = editing ? [
      timeChanged ? 'new time' : null,
      (editing.location ?? '') !== (row.location ?? '') ? 'new place' : null,
      editing.title !== row.title ? 'new name' : null,
    ].filter(Boolean) as string[] : [];

    if (isDemo) {
      // Demo events live in memory so the calendar can show them.
      if (editing) Object.assign(DEMO_EVENTS.find(e => e.id === editing.id) ?? {}, row);
      else addDemoEvent(row);
      onSaved(); onClose(); return;
    }
    setSaving(true);
    const { data, error } = editing
      ? await supabase.from('events').update(row as any).eq('id', editing.id).select('id').single()
      : await supabase.from('events').insert({ ...row, group_id: group.id } as any).select('id').single();
    if (error) { setSaving(false); return notify('Couldn’t save', error.message); }
    const eventId = (data as { id: string }).id;
    const place = row.location ? ` · ${row.location}` : '';
    await sendNotifications([
      ...added.map(uid => ({
        user_id: uid, actor_id: meId, kind: 'invite' as const, idea_id: null, event_id: eventId,
        title: `${myName} invited you to ${row.title}`, body: `${when}${place}`,
      })),
      ...(changes.length ? kept.map(uid => ({
        user_id: uid, actor_id: meId, kind: 'event_changed' as const, idea_id: null, event_id: eventId,
        title: `${myName} changed ${row.title}: ${changes.join(', ')}`,
        body: `${when}${place}${timeChanged ? '\nLet them know if you can still make it.' : ''}`,
      })) : []),
    ], false);
    // A planned idea shows its booked time; keep it in step.
    if (editing && timeChanged) {
      await supabase.from('ideas').update({ proposed_slots: [{ start: startIso, end: endIso }] } as any).eq('event_id', editing.id);
    }
    setSaving(false);
    onSaved();
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Edit Event' : 'New Event'}
      action={{ label: editing ? 'Save' : 'Add', onPress: save, disabled: !title.trim(), loading: saving }}
    >
      {/* Already described when it comes from New Plan or a suggestion. */}
      {editing || prefill ? null : <DescribeField value={describe} onChange={onDescribe} parsed={parsed} onSubmit={save} />}

      <Field value={title} onChangeText={setTitle} placeholder="Title" accessibilityLabel="Title" returnKeyType="next" />

      <ListSection>
        <ListRow
          icon="calendar-outline"
          title={longDate(date)}
          subtitle={endDate > date ? 'First day' : null}
          value={pickingDate ? 'Done' : 'Change'}
          onPress={() => { setPickingDate(p => !p); setPickingEnd(false); }}
        />
        {pickingDate ? (
          <CalendarGrid
            selected={date}
            onSelect={(k) => { pickStart(k); setPickingDate(false); }}
            marked={new Set()}
            expanded
          />
        ) : null}
        <ListRow
          icon="arrow-forward-circle-outline"
          title={endDate > date ? longDate(endDate) : 'Same day'}
          subtitle={endDate > date ? `Last day · ${Math.round((parseKey(endDate).getTime() - parseKey(date).getTime()) / 86400000) + 1} days` : 'Runs several days? Pick the last day'}
          value={pickingEnd ? 'Done' : 'Change'}
          onPress={() => { setPickingEnd(p => !p); setPickingDate(false); }}
        />
        {pickingEnd ? (
          <>
            {endDate > date ? (
              <ListRow title="Same day" onPress={() => { setEndDate(date); setPickingEnd(false); }} style={{ paddingLeft: space.m + 28 + space.m }} />
            ) : null}
            <CalendarGrid
              selected={endDate}
              onSelect={(k) => { if (k < date) return notify('Pick a later day', 'The last day can’t be before the first.'); setEndDate(k); setPickingEnd(false); }}
              marked={new Set()}
              expanded
            />
          </>
        ) : null}
        <ListRow icon="sunny-outline" title="All day" trailing={<Toggle label="All day" value={allDay} onValueChange={setAllDay} />} />
      </ListSection>

      {allDay ? null : (
        <View style={{ flexDirection: 'row', gap: space.m }}>
          <View style={{ flex: 1 }}>
            <Field label={endDate > date ? `Starts ${shortDate(date).split(',')[0]}` : 'Starts'} value={startTime} onChangeText={setStartTime} placeholder="09:00" keyboardType="numbers-and-punctuation" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label={endDate > date ? `Ends ${shortDate(endDate).split(',')[0]}` : 'Ends'} value={endTime} onChangeText={setEndTime} placeholder="10:00" keyboardType="numbers-and-punctuation" />
          </View>
        </View>
      )}

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

      {repeat !== 'never' ? (
        <ListSection footer={rotate
          ? `Hosts take turns${assignable.length > 1 ? `: ${assignable.map(p => (p.id === meId ? 'you' : (p.full_name ?? 'someone').split(' ')[0])).join(', then ')}` : ' once you invite people'}.`
          : 'Make it a tradition: everyone hosts in turn.'}>
          <ListRow icon="home-outline" title="Take turns hosting" trailing={<Toggle label="Take turns hosting" value={rotate} onValueChange={setRotate} />} />
        </ListSection>
      ) : null}

      <WorkHint date={date} startIso={span()?.[0] ?? null} endIso={span()?.[1] ?? null} />

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
