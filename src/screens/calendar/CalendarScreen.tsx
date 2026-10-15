// Calendar
//
// Reading order (F-pattern): the selected date anchors the top-left, the
// grid sits directly beneath it, and the agenda runs down the left edge with
// the time column first so eyes can scan times vertically.
//
// compact:   header → week strip (expandable) → agenda; detail in a sheet;
//            "New Event" capsule in the thumb zone.
// "My plans" shows everything you're invited to across all your groups; the
// group view shows everything on the active group's calendar.
// expanded:  [list column: header, month, agenda] | [event detail].

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, SectionList, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { DEMO_EVENTS, DEMO_EXTRA_GROUPS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { Assignment, Event, Group, Idea, Profile, Rsvp, TimeSlot } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import GroupSwitcher, { useVisibleGroups } from '../../components/GroupSwitcher';
import { Sheep } from '../../components/Sheep';
import {
  Button, EmptyState, IconButton, ListRow, PrimaryAction, ReadingColumn, ScreenHeader,
  Segmented, Sheet, SplitView, Tappable, Txt, useBottomClearance,
} from '../../components/ui';
import { space, tabularNums, useLayout, useTheme } from '../../theme';
import CalendarGrid from './CalendarGrid';
import { EventComposer, EventDetail, WorkLine } from './EventViews';
import { usePlanComposer } from '../../components/PlanComposer';
import CommentThread from '../../components/CommentThread';
import { dateVoters, tallySlots } from '../../lib/rsvp';
import { hostOf, openSlots, stageOf } from '../../lib/plans';
import { useWorkSchedules, workOn } from '../../lib/workSchedule';
import { expandEvents } from '../../lib/recurrence';
import { useCircle } from '../../lib/people';
import { confirmAction, notify } from '../../lib/alert';
import { Reply, needsReply, repliesByStatus, replyOf, rsvpChangeNotice, rsvpNotice } from '../../lib/rsvp';
import { sendNotifications } from '../../lib/notifications';
import { keyOf, longDate, relativeDay, shortDate, timeParts, todayKey } from './dates';

/** A date option on a plan still picking one: shown faintly, like a pencilled-in maybe. */
type Maybe = { kind: 'maybe'; id: string; idea: Idea; slot: TimeSlot; start_time: string };
type Row = Event | Maybe;
const isMaybe = (r: Row): r is Maybe => (r as Maybe).kind === 'maybe';
type DaySection = { key: string; title: string; subtitle: string; data: Row[] };
type Scope = 'mine' | 'group';

// iOS can't present a sheet while another is still sliding away.
const afterSheet = (fn: () => void) => setTimeout(fn, Platform.OS === 'ios' ? 450 : 0);

export default function CalendarScreen() {
  const { activeGroup, groups } = useGroup();
  const visibleGroups = useVisibleGroups();
  const { user, profile } = useAuth();
  const { c } = useTheme();
  const { compact, threeColumn } = useLayout();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const composer = usePlanComposer();
  const bottomClearance = useBottomClearance();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);

  const [rawEvents, setRawEvents] = useState<Event[]>([]);   // series rows, unexpanded
  const [events, setEvents] = useState<Event[]>([]);
  const [scope, setScope] = useState<Scope>('mine');
  const [editing, setEditing] = useState<Event | null>(null);
  const [nudged, setNudged] = useState<Set<string>>(new Set());
  const [openIdeas, setOpenIdeas] = useState<Idea[]>([]);   // still proposed: no date yet, or picking one
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  // ─── Data ──────────────────────────────────────────────────────────────────
  // Repeating events become one entry per occurrence, a year either side of today.
  const withOccurrences = (list: Event[]) => {
    const now = Date.now(), year = 366 * 86400000;
    return expandEvents(list, new Date(now - year), new Date(now + year));
  };

  const fetchAll = useCallback(async () => {
    if (!activeGroup) return;
    if (isDemo) {
      setRawEvents([...DEMO_EVENTS]);
      setEvents(withOccurrences(DEMO_EVENTS));   // new array: planned ideas add to the demo list
      setOpenIdeas(DEMO_IDEAS.filter(i => i.status === 'proposed'));
      setMembers(DEMO_MEMBERS);
      return;
    }
    setLoading(true);
    // Every group you're in, plus anything you were invited to from elsewhere.
    const groupIds = (groups.length ? groups : [activeGroup]).map(g => g.id);
    const eventQuery = supabase.from('events').select('*, profiles(id, full_name, email)');
    const [{ data: eventData }, { data: ideaRows }, { data: memberRows }] = await Promise.all([
      (meId ? eventQuery.or(`group_id.in.(${groupIds.join(',')}),attendees.cs.{${meId}}`) : eventQuery.in('group_id', groupIds))
        .order('start_time', { ascending: true }),
      supabase.from('ideas')
        .select('id, title, group_id, audience_group_ids, audience_user_ids, created_by, created_at, status, proposed_slots, slot_votes, idea_votes(id, user_id)')
        .in('group_id', groupIds).eq('status', 'proposed'),
      supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)')
        .eq('group_id', activeGroup.id),
    ]);
    setRawEvents((eventData as Event[]) ?? []);
    setEvents(withOccurrences((eventData as Event[]) ?? []));
    setOpenIdeas((ideaRows as Idea[]) ?? []);
    setMembers(((memberRows ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[]);
    setLoading(false);
  }, [activeGroup, groups, isDemo, meId]);

  // Refetch on focus (planning an idea adds events from Plans), and whenever
  // the New Plan sheet saves something.
  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));
  useEffect(() => { fetchAll(); }, [composer.version]);

  // Arriving from Home or Plans with an event (or day) to open.
  useEffect(() => {
    const { eventId, date } = route.params ?? {};
    if (!eventId && !date) return;
    setScope('mine');
    if (date) setSelectedDate(date);
    if (eventId) setSelectedEventId(eventId);
    navigation.setParams({ eventId: undefined, date: undefined });
  }, [route.params?.eventId, route.params?.date]);

  // ─── Derived ───────────────────────────────────────────────────────────────
  // Names for attendees from any of your groups (invites can cross groups).
  const circle = useCircle(true, meId);
  const memberById = useMemo(() => new Map<string, Profile>([
    ...circle.people.map(p => [p.profile.id, p.profile] as [string, Profile]),
    ...members.map(p => [p.id, p] as [string, Profile]),
  ]), [members, circle.people]);

  // People you're at events with most often, best first.
  const suggestedIds = useMemo(() => {
    const counts = new Map<string, number>();
    events.forEach(e => {
      if (!meId || !e.attendees?.includes(meId)) return;
      e.attendees.forEach(id => { if (id !== meId) counts.set(id, (counts.get(id) ?? 0) + 1); });
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map(([id]) => id);
  }, [events, meId]);

  // Organizer edits: save the list, and tell anyone newly given something.
  async function handleAssign(event: Event, items: Assignment[]) {
    const id = event.series_id ?? event.id;
    const before = new Map((event.assignments ?? []).map(a => [a.id, a.assignee_id]));
    const newlyAssigned = items.filter(a => a.assignee_id && a.assignee_id !== meId && before.get(a.id) !== a.assignee_id);
    if (isDemo) {
      const base = DEMO_EVENTS.find(e => e.id === id);
      if (base) base.assignments = items;
      fetchAll();
      return;
    }
    const { error } = await supabase.from('events').update({ assignments: items } as any).eq('id', id);
    if (error) { notify('Couldn’t update', error.message); return; }
    const me = (profile?.full_name ?? 'Someone').split(' ')[0];
    await sendNotifications(newlyAssigned.map(a => ({
      user_id: a.assignee_id!, actor_id: meId, kind: 'assignment' as const, idea_id: null, event_id: id,
      title: `${me} assigned you ${a.item}`, body: `${event.title} · ${shortDate(keyOf(event.start_time))}`,
    })), false);
    fetchAll();
  }

  // "I'll take it" / "Release" on an assignment. Applies to the whole series.
  async function handleClaim(event: Event, itemId: string, claim: boolean) {
    const id = event.series_id ?? event.id;
    if (isDemo) {
      const base = DEMO_EVENTS.find(e => e.id === id);
      if (base) base.assignments = (base.assignments ?? []).map(a => (a.id !== itemId ? a : { ...a, assignee_id: claim ? meId : null }));
      fetchAll();
      return;
    }
    const { error } = await supabase.rpc('claim_assignment', { p_event: id, p_item: itemId, p_claim: claim } as any);
    if (error) notify('Couldn’t update', error.message);
    fetchAll();
  }
  const myName = (profile?.full_name ?? (isDemo ? DEMO_MEMBERS[0].full_name : null) ?? 'Someone').split(' ')[0];
  const demoBase = (e: Event) => DEMO_EVENTS.find(d => d.id === (e.series_id ?? e.id));

  // Going / Maybe / Can't go, or a change to it. Applies to the whole series.
  async function handleRsvp(event: Event, reply: Rsvp, note?: string) {
    if (!meId) return;
    const id = event.series_id ?? event.id;
    if (isDemo) {
      const base = demoBase(event);
      if (base) {
        base.rsvps = { ...base.rsvps, [meId]: reply };
        const { [meId]: _old, ...others } = base.rsvp_notes ?? {};
        base.rsvp_notes = note ? { ...others, [meId]: note } : others;
      }
      fetchAll();
      return;
    }
    const before = replyOf(event, meId);
    const { error } = await supabase.rpc('set_rsvp', { p_event: id, p_status: reply, p_note: note ?? null } as any);
    if (error) return notify('Couldn’t update your RSVP', error.message);
    // A first answer goes to the organizer. A change also goes to everyone
    // going or maybe, since their plans may hinge on it.
    const changed = !!before && before !== 'pending';
    const byStatus = repliesByStatus(event);
    const recipients = Array.from(new Set([
      ...(event.created_by ? [event.created_by] : []),
      ...(changed ? [...byStatus.going, ...byStatus.maybe] : []),
    ])).filter(uid => uid !== meId);
    await sendNotifications(recipients.map(uid => ({
      user_id: uid, actor_id: meId, kind: 'rsvp' as const, idea_id: null, event_id: id,
      title: before === reply ? `${myName} added a note on ${event.title}`
        : (changed ? rsvpChangeNotice : rsvpNotice)(myName, reply, event.title),
      body: [note ? `“${note}”` : null, shortDate(keyOf(event.start_time))].filter(Boolean).join('\n'),
    })), false);
    fetchAll();
  }

  // Cancelled events stay on everyone's calendar, marked, so nobody shows up to nothing.
  async function handleCancel(event: Event) {
    const id = event.series_id ?? event.id;
    const ok = await confirmAction(
      `Cancel ${event.title}?`,
      `${event.recurrence ? 'Every time it repeats is cancelled. ' : ''}Everyone invited will be told, and it stays on their calendar marked cancelled.`,
      'Cancel Event',
      'Keep It',
    );
    if (!ok) return;
    const at = new Date().toISOString();
    if (isDemo) {
      const base = demoBase(event);
      if (base) base.cancelled_at = at;
      fetchAll();
      return;
    }
    const { error } = await supabase.from('events').update({ cancelled_at: at } as any).eq('id', id);
    if (error) return notify('Couldn’t cancel', error.message);
    // An idea that became this event goes back to needing a date.
    await supabase.from('ideas').update({ status: 'proposed', event_id: null, proposed_slots: [], planned_at: null } as any).eq('event_id', id);
    await sendNotifications((event.attendees ?? []).filter(uid => uid !== meId).map(uid => ({
      user_id: uid, actor_id: meId, kind: 'event_cancelled' as const, idea_id: null, event_id: id,
      title: `${myName} cancelled ${event.title}`, body: `${shortDate(keyOf(event.start_time))} · ${timeLabel(event)}`,
    })), false);
    fetchAll();
  }

  // One reminder per event per visit, so it stays a nudge.
  async function handleNudge(event: Event, ids: string[]) {
    const id = event.series_id ?? event.id;
    setNudged(prev => new Set(prev).add(id));
    await sendNotifications(ids.map(uid => ({
      user_id: uid, actor_id: meId, kind: 'invite' as const, idea_id: null, event_id: id,
      title: `${myName} is waiting on your reply`, body: `${event.title} · ${shortDate(keyOf(event.start_time))}`,
    })), isDemo);
    const first = memberById.get(ids[0])?.full_name?.split(' ')[0];
    notify('Reminder sent', `${ids.length === 1 && first ? first : `${ids.length} people`} got a nudge to reply.`);
  }

  // Edit the series row, not the occurrence.
  function openEdit(event: Event) {
    const base = rawEvents.find(r => r.id === (event.series_id ?? event.id)) ?? event;
    if (threeColumn) return setEditing(base);
    setSelectedEventId(null);
    afterSheet(() => setEditing(base));
  }

  const groupById = useMemo(() => new Map<string, Group>([
    ...visibleGroups.map(g => [g.id, g] as [string, Group]),
    ...(isDemo ? DEMO_EXTRA_GROUPS.map(g => [g.group.id, g.group] as [string, Group]) : []),
  ]), [visibleGroups, isDemo]);

  const attendeesOf = useCallback(
    (e: Event) => (e.attendees ?? []).map(id => memberById.get(id)).filter(Boolean) as AvatarPerson[],
    [memberById],
  );

  // What this view shows: your plans everywhere, or the whole group's calendar.
  const shown = useMemo(() => events.filter(e => scope === 'group'
    ? e.group_id === activeGroup?.id
    : !!meId && (e.created_by === meId || !!e.attendees?.includes(meId))), [events, scope, activeGroup, meId]);

  const marked = useMemo(() => new Set(shown.filter(e => !e.cancelled_at).map(e => keyOf(e.start_time))), [shown]);

  // Invites still waiting on you (a repeating one counts once), soonest first.
  const awaiting = useMemo(() => {
    const seen = new Set<string>();
    return events.filter(e => {
      const k = e.series_id ?? e.id;
      if (seen.has(k) || !needsReply(e, meId)) return false;
      seen.add(k);
      return true;
    });
  }, [events, meId]);

  // Selected day first (even if empty, so the answer to "what's on?" is
  // explicit), then every later day that has something.
  // Date options on plans you're part of (or the group's, in group view).
  const maybes: Maybe[] = useMemo(() => openIdeas
    .filter(i => stageOf(i) === 'dates')
    .filter(i => scope === 'group'
      ? i.group_id === activeGroup?.id || (i.audience_group_ids ?? []).includes(activeGroup?.id ?? '')
      : !!meId && (dateVoters(i).includes(meId) || (i.audience_user_ids ?? []).includes(meId)))
    .flatMap(i => openSlots(i).map(slot => ({ kind: 'maybe' as const, id: `${i.id}#${slot.start}`, idea: i, slot, start_time: slot.start }))),
  [openIdeas, scope, activeGroup, meId]);
  const undated = openIdeas.filter(i => stageOf(i) === 'idea').length;

  const sections: DaySection[] = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    ([...shown, ...maybes] as Row[]).forEach(e => {
      const k = keyOf(e.start_time);
      if (k < selectedDate) return;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(e);
    });
    byDay.forEach(list => list.sort((a, b) => a.start_time.localeCompare(b.start_time)));
    if (!byDay.has(selectedDate)) byDay.set(selectedDate, []);
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const rel = relativeDay(key);
        return { key, data, title: rel ?? shortDate(key), subtitle: rel ? shortDate(key) : '' };
      });
  }, [shown, maybes, selectedDate]);

  // Keep a sensible event selected for the detail column.
  useEffect(() => {
    if (!threeColumn) return;
    const real = sections.flatMap(s => s.data.filter(r => !isMaybe(r)));
    if (!real.some(e => e.id === selectedEventId)) setSelectedEventId(real[0]?.id ?? null);
  }, [sections, threeColumn]);

  // Leaving the three-column layout shouldn't pop a sheet for the old selection.
  // (Skips the first render, so arriving with an event to open still opens it.)
  const layoutSeen = useRef(false);
  useEffect(() => {
    if (!layoutSeen.current) { layoutSeen.current = true; return; }
    if (!threeColumn) setSelectedEventId(null);
  }, [threeColumn]);

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;

  const newPlan = (date = selectedDate) => composer.newPlan({ date });
  useShortcut('n', () => newPlan());
  useShortcut('t', () => setSelectedDate(todayKey()));
  const workSchedules = useWorkSchedules();

  // ─── Pieces ────────────────────────────────────────────────────────────────
  const rel = relativeDay(selectedDate);
  const header = (
    <ScreenHeader
      eyebrow={rel ?? new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      title={compact ? shortDate(selectedDate) : longDate(selectedDate)}
      display
      trailing={
        <>
          {selectedDate !== todayKey() && (
            <Button label="Today" variant="gray" onPress={() => setSelectedDate(todayKey())} />
          )}
          {compact ? (
            <GroupSwitcher>
              {(open) => <IconButton icon="people-circle-outline" label={`Group: ${activeGroup?.name ?? 'none'}`} variant="gray" onPress={open} />}
            </GroupSwitcher>
          ) : (
            <IconButton icon="add" label="New Plan (⌘N)" variant="gray" onPress={() => newPlan()} />
          )}
        </>
      }
    />
  );

  const scopePicker = (
    <View style={{ paddingHorizontal: space.m, paddingBottom: space.s }}>
      <Segmented
        options={[{ key: 'mine', label: 'My plans' }, { key: 'group', label: activeGroup?.name ?? 'Group' }]}
        value={scope}
        onChange={setScope}
      />
    </View>
  );

  const awaitingRow = awaiting.length > 0 ? (
    <View style={{ marginTop: space.s, marginHorizontal: space.m, backgroundColor: c.tintSoft, borderRadius: 16, overflow: 'hidden' }}>
      <ListRow
        icon="mail-unread-outline"
        title={awaiting.length === 1 ? `${awaiting[0].title} needs your reply` : `${awaiting.length} invites need your reply`}
        subtitle={awaiting.length === 1 ? shortDate(keyOf(awaiting[0].start_time)) : awaiting.slice(0, 3).map(e => e.title).join(', ')}
        chevron
        onPress={() => {
          const first = awaiting[0];
          setScope('mine');
          setSelectedDate(keyOf(first.start_time));
          setSelectedEventId(first.id);
        }}
      />
    </View>
  ) : null;

  const grid = (
    <CalendarGrid
      selected={selectedDate}
      onSelect={setSelectedDate}
      marked={marked}
      expanded={compact ? expanded : true}
      onToggleExpanded={compact ? () => setExpanded(x => !x) : undefined}
    />
  );

  const list = (
    <SectionList
      sections={sections}
      keyExtractor={e => e.id}
      stickySectionHeadersEnabled
      contentContainerStyle={{ paddingBottom: bottomClearance }}
      ListHeaderComponent={<>{header}{scopePicker}{grid}{awaitingRow}</>}
      renderSectionHeader={({ section }) => (
        <View style={{ paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: space.s, backgroundColor: c.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
            <Txt v="headline" accessibilityRole="header">{section.title}</Txt>
            {section.subtitle ? <Txt v="callout" tone="secondary">{section.subtitle}</Txt> : null}
          </View>
          <WorkLine day={workOn(workSchedules, section.key)} />
        </View>
      )}
      renderItem={({ item }) => isMaybe(item) ? (
        <MaybeRow item={item} meId={meId} onPress={() => navigation.navigate('Plans', { ideaId: item.idea.id })} />
      ) : (
        <EventRow
          event={item}
          attendees={attendeesOf(item)}
          meId={meId}
          hostName={(() => { const h = hostOf(item); return h ? (h === meId ? 'you' : memberById.get(h)?.full_name?.split(' ')[0] ?? null) : null; })()}
          groupName={scope === 'mine' && groupById.size > 1 ? groupById.get(item.group_id)?.name ?? null : null}
          selected={threeColumn && item.id === selectedEventId}
          onPress={() => setSelectedEventId(item.id)}
        />
      )}
      renderSectionFooter={({ section }) => section.data.length === 0 ? (
        <ListRow title="Nothing planned" subtitle={scope === 'mine' ? 'Make plans for this day' : 'Add something for this day'} tintTitle={false} onPress={() => newPlan(section.key)} icon="add-circle-outline" />
      ) : null}
      ListFooterComponent={
        loading ? <ActivityIndicator style={{ marginTop: space.l }} color={c.secondaryLabel} /> :
        undated > 0 ? (
          <View style={{ marginTop: space.l, marginHorizontal: space.m, backgroundColor: c.fill, borderRadius: 16, overflow: 'hidden' }}>
            <ListRow
              icon="bulb-outline"
              title={`${undated} idea${undated === 1 ? '' : 's'} still need${undated === 1 ? 's' : ''} a date`}
              chevron
              onPress={() => navigation.navigate('Plans')}
            />
          </View>
        ) : null
      }
    />
  );

  // After an event. Everyone who came (minus anyone who couldn't).
  const cameWith = (e: Event) => (e.attendees ?? []).filter(id => id !== meId && e.rsvps?.[id] !== 'declined');
  // On phones the event is a sheet; close it before the next one opens.
  const afterDetail = (fn: () => void) => {
    if (!threeColumn) setSelectedEventId(null);
    setTimeout(fn, threeColumn ? 0 : 450);
  };
  const doAgain = (e: Event) => afterDetail(() => composer.newPlan({ title: e.title, location: e.location ?? undefined, notes: e.description ?? undefined, people: cameWith(e) }));
  const samePeople = (e: Event) => afterDetail(() => composer.newPlan({ people: cameWith(e) }));
  const addMemories = (e: Event) => afterDetail(() => composer.addMemories({
    eventId: e.series_id ?? e.id,
    title: e.title,
    when: relativeDay(keyOf(e.start_time)) ?? shortDate(keyOf(e.start_time)),
    recipients: (e.attendees ?? []).filter(id => e.rsvps?.[id] !== 'declined'),
  }));

  const detailFor = (e: Event) => (
    <EventDetail
      event={e}
      attendees={attendeesOf(e)}
      meId={meId}
      group={groupById.get(e.group_id) ?? null}
      onClaim={(item, claim) => handleClaim(e, item, claim)}
      onAssign={(items) => handleAssign(e, items)}
      onRsvp={(reply, note) => handleRsvp(e, reply, note)}
      onEdit={() => openEdit(e)}
      onCancel={() => handleCancel(e)}
      onNudge={nudged.has(e.series_id ?? e.id) ? undefined : (ids) => handleNudge(e, ids)}
      onDoAgain={() => doAgain(e)}
      onSamePeople={() => samePeople(e)}
      onAddMemories={() => addMemories(e)}
      conversation={e.cancelled_at ? null : (
        <CommentThread
          eventId={e.series_id ?? e.id}
          planTitle={e.title}
          meId={meId}
          myName={myName}
          personOf={(id) => memberById.get(id) ?? { id }}
          recipients={(e.attendees ?? []).filter(id => e.rsvps?.[id] !== 'declined')}
          isDemo={isDemo}
          memories={new Date(e.end_time).getTime() < Date.now()}
          onAddMemories={() => addMemories(e)}
        />
      )}
    />
  );

  const detail = selectedEvent ? (
    <ReadingColumn>{detailFor(selectedEvent)}</ReadingColumn>
  ) : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="calendar-clear-outline"
        illustration={<Sheep size={88} pose="rest" style={{ marginBottom: space.m }} />}
        title="Nothing coming up"
        body="Plans you add for your group show up here."
        action={{ label: 'New Plan', onPress: () => newPlan() }}
      />
    </View>
  );

  return (
    <>
      <SplitView list={list} detail={detail} />

      {!threeColumn && (
        <Sheet visible={!!selectedEvent} onClose={() => setSelectedEventId(null)} title="Event" cancelLabel="Done">
          {selectedEvent ? detailFor(selectedEvent) : null}
        </Sheet>
      )}

      <PrimaryAction label="New Plan" onPress={() => newPlan()} />

      {/* Editing only; new plans go through the shared New Plan sheet. */}
      <EventComposer
        visible={!!editing}
        editing={editing}
        myName={myName}
        onClose={() => setEditing(null)}
        onSaved={fetchAll}
        initialDate={selectedDate}
        group={activeGroup}
        meId={meId}
        members={members}
        suggestedIds={suggestedIds}
        isDemo={isDemo}
      />
    </>
  );
}

// ─── Row ─────────────────────────────────────────────────────────────────────

const REPLY_META: Record<Reply, string> = {
  going: 'You’re going',
  maybe: 'Maybe',
  declined: 'Can’t go',
  pending: 'Needs your reply',
};

function timeLabel(e: Event) {
  const { hm, ampm } = timeParts(e.start_time);
  return `${hm} ${ampm}`;
}

function EventRow({ event, attendees, meId, groupName, hostName, selected, onPress }: {
  event: Event; attendees: AvatarPerson[]; meId: string | null; groupName: string | null; hostName: string | null; selected: boolean; onPress: () => void;
}) {
  const { compact } = useLayout();
  const { hm, ampm } = timeParts(event.start_time);
  const cancelled = !!event.cancelled_at;
  const reply = replyOf(event, meId);
  // Traditions name this time's host; otherwise the organizer is hosting.
  const status = cancelled ? 'Cancelled'
    : hostName === 'you' ? 'Your turn to host'
    : event.created_by === meId && !hostName ? 'You’re hosting'
    : reply ? REPLY_META[reply] : null;
  const strong = !cancelled && (reply === 'going' || reply === 'pending');
  const faded = cancelled || reply === 'declined';
  const rest = [hostName && hostName !== 'you' ? `${hostName} hosting` : null, event.location, groupName].filter(Boolean).join(' · ');
  const meta = [status, rest].filter(Boolean).join(' · ');

  return (
    <Tappable
      onPress={onPress}
      selected={selected}
      accessibilityLabel={`${hm} ${ampm}, ${event.title}${meta ? `, ${meta}` : ''}`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.m,
        paddingHorizontal: space.m, paddingVertical: space.s, minHeight: 64,
        marginHorizontal: compact ? 0 : space.s, borderRadius: compact ? 0 : 12,
      }}
    >
      <View style={{ width: 48 }}>
        <Txt v="callout" semibold style={tabularNums}>{hm}</Txt>
        <Txt v="footnote" tone="secondary">{ampm}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="headline" numberOfLines={1} tone={faded ? 'secondary' : 'primary'} style={cancelled ? { textDecorationLine: 'line-through' } : undefined}>{event.title}</Txt>
        {meta ? (
          <Txt v="callout" tone="secondary" numberOfLines={1}>
            {status ? <Txt v="callout" tone={strong ? 'tint' : 'secondary'} semibold={strong}>{status}</Txt> : null}
            {status && rest ? ' · ' : ''}
            {rest}
          </Txt>
        ) : null}
      </View>
      {attendees.length > 0 && !cancelled && <AvatarStack people={attendees} max={compact ? 3 : 2} size={compact ? 28 : 24} />}
    </Tappable>
  );
}

// ─── Maybe row ───────────────────────────────────────────────────────────────

/** A date option still being decided: faint, dashed, and one tap from voting. */
function MaybeRow({ item, meId, onPress }: { item: Maybe; meId: string | null; onPress: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const { hm, ampm } = timeParts(item.slot.start);
  const voters = dateVoters(item.idea);
  const yes = tallySlots(item.idea, [item.slot])[0].yes;
  const mine = meId ? item.idea.slot_votes?.[meId] : undefined;
  const status = mine === undefined ? 'Maybe · vote on dates' : mine.includes(item.slot.start) ? 'Maybe · works for you' : 'Maybe';
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={`${hm} ${ampm}, ${item.idea.title}, date option, ${yes.length} of ${voters.length} can make it`}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: space.m,
        paddingHorizontal: space.m, paddingVertical: space.s, minHeight: 56,
        marginHorizontal: compact ? space.s : space.s, borderRadius: 12,
        borderWidth: 1, borderStyle: 'dashed', borderColor: c.separator, opacity: 0.8,
      }}
    >
      <View style={{ width: 48 - space.s }}>
        <Txt v="callout" tone="secondary" style={tabularNums}>{hm}</Txt>
        <Txt v="footnote" tone="secondary">{ampm}</Txt>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Txt v="headline" tone="secondary" numberOfLines={1}>{item.idea.title}</Txt>
        <Txt v="footnote" tone={mine === undefined ? 'tint' : 'secondary'} semibold={mine === undefined} numberOfLines={1}>
          {`${status} · ${yes.length} of ${voters.length} can make it`}
        </Txt>
      </View>
    </Tappable>
  );
}

