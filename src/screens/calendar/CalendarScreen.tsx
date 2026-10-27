// Calendar
//
// Reading order (F-pattern): the selected date anchors the top-left, the
// grid sits directly beneath it, and the agenda runs down the left edge with
// the time column first so eyes can scan times vertically.
//
// Two ways to look: Calendar (a day timeline, a week of rows, or the month
// grid, with what's coming up listed underneath) or List (every day with
// something on it, from the selected day on).
//
// compact:   header → view → agenda; detail in a sheet; "New Plan" capsule
//            in the thumb zone.
// "My plans" shows everything you're invited to across all your groups; the
// group view shows everything on the active group's calendar.
// expanded:  [list column: header, view, agenda] | [event detail].

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, SectionList, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { DEMO_EVENTS, DEMO_EXTRA_GROUPS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { Assignment, Event, Group, Idea, Profile, Rsvp, TimeSlot } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { useGroupSheets, useVisibleGroups } from '../../components/GroupSwitcher';
import { Sheep } from '../../components/Sheep';
import GroupCover from '../../components/GroupCover';
import {
  EmptyState, Icon, IconButton, ListRow, Menu, MenuSection, PrimaryAction, ReadingColumn, ScreenHeader,
  Segmented, Sheet, SplitView, Tappable, Toggle, Txt, useBottomClearance,
} from '../../components/ui';
import { space, tabularNums, useLayout, useTheme } from '../../theme';
import CalendarGrid from './CalendarGrid';
import { DayTimeline, EventChip, Maybe, MineChip, PeriodBar, Row, WeekRows, isMaybe, rowEnd } from './CalendarViews';
import { daysCovered, fillsDay, isMultiDay, spanLabel, whenOnDay } from '../../lib/span';
import { calendarEvents } from './calendarFilter';
import { EventComposer, EventDetail, WorkLine } from './EventViews';
import { usePlanComposer } from '../../components/PlanComposer';
import CommentThread from '../../components/CommentThread';
import { dateVoters, tallySlots } from '../../lib/rsvp';
import { votesLabel } from '../../lib/availability';
import { hostOf, openSlots, stageOf } from '../../lib/plans';
import { useWorkSchedules, workOn } from '../../lib/workSchedule';
import { expandEvents } from '../../lib/recurrence';
import { useCircle } from '../../lib/people';
import { confirmAction, notify } from '../../lib/alert';
import { Reply, needsReply, repliesByStatus, replyOf, rsvpChangeNotice, rsvpNotice } from '../../lib/rsvp';
import { sendNotifications } from '../../lib/notifications';
import { addDays, dateKey as dateKeyOf, keyOf, longDate, parseKey, rangeLabel, relativeDay, shortDate, timeParts, todayKey } from './dates';

type DaySection = { key: string; title: string; subtitle: string; data: Row[] };
type Scope = 'mine' | 'group';
type CalView = 'day' | 'week' | 'month';
const VIEWS: { key: CalView; label: string }[] = [
  { key: 'day', label: 'Day' }, { key: 'week', label: 'Week' }, { key: 'month', label: 'Month' },
];

// How far "Coming up" looks ahead under the calendar; 0 hides it.
const UPCOMING_OPTIONS = [
  { days: 3, label: 'Next 3 days' },
  { days: 7, label: 'Next week' },
  { days: 14, label: 'Next 2 weeks' },
  { days: 30, label: 'Next month' },
  { days: 0, label: 'Don’t show' },
];
const VIEW_PREFS_KEY = 'calendar_view';

const daySection = (key: string, data: Row[]): DaySection => {
  const rel = relativeDay(key);
  return { key, data, title: rel ?? shortDate(key), subtitle: rel ? shortDate(key) : '' };
};

const weekStart = (key: string, startsOn: 0 | 1) => addDays(key, -((parseKey(key).getDay() - startsOn + 7) % 7));
const monthLabel = (key: string) => parseKey(key).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

/** Same day of the month, n months on (clamped: Jan 31 → Feb 28). */
function addMonths(key: string, n: number) {
  const d = parseKey(key);
  const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
  const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), last));
  return dateKeyOf(target);
}


// iOS can't present a sheet while another is still sliding away.
const afterSheet = (fn: () => void) => setTimeout(fn, Platform.OS === 'ios' ? 450 : 0);

export default function CalendarScreen() {
  const { activeGroup, groups, setActiveGroup } = useGroup();
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
  const [view, setView] = useState<CalView>('week');
  // Show the day, week or month as a list of plans instead of a calendar.
  const [asList, setAsList] = useState(false);
  // A starred view opens every time you come to the calendar. Without one,
  // it opens however you left it.
  type DefaultView = { view: CalView; asList: boolean };
  const [defaultView, setDefaultView] = useState<DefaultView | null>(null);
  const defaultRef = useRef<DefaultView | null>(null);
  defaultRef.current = defaultView;
  const [upcomingDays, setUpcomingDays] = useState(7);
  const [weekStartsOn, setWeekStartsOn] = useState<0 | 1>(0);
  // In a shared calendar, lay your own events over it for context. On by
  // default; after that, whatever you last chose.
  const [showMine, setShowMine] = useState(true);
  const [mineHintSeen, setMineHintSeen] = useState(false);
  // The demo can't switch its active group (that would leave demo mode), so
  // it remembers which demo calendar is open here instead.
  const [demoGroupId, setDemoGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const groupSheets = useGroupSheets();

  // Remember how you like to look at it: which calendar, which view, and the options.
  const prefsLoaded = useRef(false);
  useEffect(() => {
    AsyncStorage.getItem(VIEW_PREFS_KEY)
      .then(raw => {
        const p = raw ? JSON.parse(raw) : {};
        if (VIEWS.some(v => v.key === p.view)) setView(p.view);
        if (p.view === 'list') { setView('week'); setAsList(true); }   // "List" used to be a fourth view
        if (typeof p.asList === 'boolean') setAsList(p.asList);
        const d = p.defaultView;
        if (d && VIEWS.some(v => v.key === d.view) && typeof d.asList === 'boolean') {
          setDefaultView({ view: d.view, asList: d.asList });
          setView(d.view);
          setAsList(d.asList);
        }
        if (p.scope === 'mine' || p.scope === 'group') setScope(p.scope);
        if (UPCOMING_OPTIONS.some(o => o.days === p.upcomingDays)) setUpcomingDays(p.upcomingDays);
        if (p.weekStartsOn === 0 || p.weekStartsOn === 1) setWeekStartsOn(p.weekStartsOn);
        if (typeof p.showMine === 'boolean') setShowMine(p.showMine);
        if (p.mineHintSeen === true) setMineHintSeen(true);
      })
      .catch(() => {})
      .finally(() => { prefsLoaded.current = true; });
  }, []);
  useEffect(() => {
    if (!prefsLoaded.current) return;
    AsyncStorage.setItem(VIEW_PREFS_KEY, JSON.stringify({ view, asList, defaultView, scope, upcomingDays, weekStartsOn, showMine, mineHintSeen })).catch(() => {});
  }, [view, asList, defaultView, scope, upcomingDays, weekStartsOn, showMine, mineHintSeen]);

  // Coming back to the calendar tab opens the starred view.
  useFocusEffect(useCallback(() => {
    const d = defaultRef.current;
    if (d) { setView(d.view); setAsList(d.asList); }
  }, []));

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

  // Shared calendars you can open: the groups you're in.
  const sharedCalendars: Group[] = useMemo(() => isDemo
    ? [...visibleGroups, ...DEMO_EXTRA_GROUPS.filter(g => g.memberIds.includes(DEMO_ME)).map(g => g.group)]
    : visibleGroups, [isDemo, visibleGroups]);
  const viewGroup = (isDemo ? sharedCalendars.find(g => g.id === demoGroupId) : null) ?? activeGroup;

  function openCalendar(g: Group | null) {
    if (!g) return setScope('mine');
    if (isDemo) setDemoGroupId(g.id); else setActiveGroup(g);
    setScope('group');
  }

  // What this view shows (see calendarFilter for the rules).
  const shown = useMemo(
    () => calendarEvents(events, { meId, groupId: scope === 'group' ? viewGroup?.id ?? null : null, showMine }),
    [events, scope, viewGroup, meId, showMine],
  );

  // A plan running several days marks each of them.
  const marked = useMemo(() => new Set(shown.filter(e => !e.cancelled_at).flatMap(e => daysCovered(e.start_time, e.end_time))), [shown]);

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
  const inviteKey = (e: Event) => e.series_id ?? e.id;

  // Selected day first (even if empty, so the answer to "what's on?" is
  // explicit), then every later day that has something.
  // Date options on plans you're part of (or the group's, in group view).
  // An idea belongs to a shared calendar if it was made in that group or the whole group is invited.
  const forViewGroup = (i: Idea) => i.group_id === viewGroup?.id || (i.audience_group_ids ?? []).includes(viewGroup?.id ?? '');
  const maybes: Maybe[] = useMemo(() => openIdeas
    .filter(i => stageOf(i) === 'dates')
    .filter(i => scope === 'group'
      ? forViewGroup(i)
      : !!meId && (dateVoters(i).includes(meId) || (i.audience_user_ids ?? []).includes(meId)))
    .flatMap(i => openSlots(i).map(slot => ({ kind: 'maybe' as const, id: `${i.id}#${slot.start}`, idea: i, slot, start_time: slot.start }))),
  [openIdeas, scope, viewGroup, meId]);
  // Ideas still needing a date: on a shared calendar, only that group's.
  const undatedIdeas = openIdeas.filter(i => stageOf(i) === 'idea' && (scope !== 'group' || forViewGroup(i)));
  const ideaKey = (i: Idea) => `idea:${i.id}`;


  // Everything shown, by day: a plan running several days is on each of
  // them. Within a day, whole-day plans first, then soonest first.
  const byDay = useMemo(() => {
    const map = new Map<string, Row[]>();
    ([...shown, ...maybes] as Row[]).forEach(e => {
      daysCovered(e.start_time, rowEnd(e)).forEach(k => {
        if (!map.has(k)) map.set(k, []);
        map.get(k)!.push(e);
      });
    });
    map.forEach((list, k) => list.sort((a, b) =>
      Number(fillsDay(b.start_time, rowEnd(b), k)) - Number(fillsDay(a.start_time, rowEnd(a), k))
      || a.start_time.localeCompare(b.start_time)));
    return map;
  }, [shown, maybes]);

  // The days the view covers.
  const week = weekStart(selectedDate, weekStartsOn);
  const monthStart = dateKeyOf(new Date(parseKey(selectedDate).getFullYear(), parseKey(selectedDate).getMonth(), 1));
  const nextMonthStart = addMonths(monthStart, 1);
  const periodDays: string[] = useMemo(() => {
    if (view === 'day') return [selectedDate];
    if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(week, i));
    const days: string[] = [];
    for (let k = monthStart; k < nextMonthStart; k = addDays(k, 1)) days.push(k);
    return days;
  }, [view, selectedDate, week, monthStart, nextMonthStart]);

  // As a list: each day in view that has plans (the day view always shows its day).
  const sections: DaySection[] = useMemo(() => periodDays
    .filter(k => view === 'day' || (byDay.get(k)?.length ?? 0) > 0)
    .map(k => daySection(k, byDay.get(k) ?? [])), [periodDays, byDay, view]);

  // Plans visible in the view (the month grid itself lists none).
  const periodRows: Row[] = useMemo(
    () => (view === 'month' && !asList ? [] : Array.from(new Set(periodDays.flatMap(k => byDay.get(k) ?? [])))),
    [view, asList, periodDays, byDay],
  );

  // Under the calendar: the next few days, picking up where the view above
  // leaves off so nothing shows twice (the month grid lists nothing, so today).
  const upcomingFrom = (() => {
    const today = todayKey();
    const after = view === 'day' ? addDays(selectedDate, 1)
      : view === 'week' ? addDays(week, 7)
      : asList ? nextMonthStart : today;
    return after > today ? after : today;
  })();
  const upcomingTo = addDays(upcomingFrom, Math.max(upcomingDays, 1) - 1);
  const upcoming: DaySection[] = useMemo(() => {
    if (!upcomingDays) return [];
    return Array.from(byDay.keys()).filter(k => k >= upcomingFrom && k <= upcomingTo).sort().map(k => daySection(k, byDay.get(k)!));
  }, [byDay, upcomingDays, upcomingFrom, upcomingTo]);

  // Keep a sensible event selected for the detail column.
  useEffect(() => {
    if (!threeColumn) return;
    const real = [...periodRows, ...upcoming.flatMap(s => s.data)].filter(r => !isMaybe(r));
    if (!real.some(e => e.id === selectedEventId)) setSelectedEventId(real[0]?.id ?? null);
  }, [upcoming, periodRows, threeColumn]);

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
  // Which calendar: yours (everything you're in, across groups) or one
  // you share with a group. The title is the picker.
  const calendarMenu: MenuSection[] = [
    {
      title: 'Yours',
      items: [{ key: 'mine', label: 'My calendar', icon: 'person-circle-outline', checked: scope === 'mine', onSelect: () => openCalendar(null) }],
    },
    {
      title: 'Shared calendars',
      items: sharedCalendars.map(g => ({
        key: g.id, label: g.name, leading: <GroupCover group={g} round blur={0} style={{ width: 24, height: 24 }} />,
        checked: scope === 'group' && g.id === viewGroup?.id,
        onSelect: () => openCalendar(g),
      })),
    },
    {
      items: [
        { key: 'new', label: 'New Group…', icon: 'add-circle-outline', onSelect: groupSheets.openCreate },
        { key: 'join', label: 'Join with Code…', icon: 'enter-outline', onSelect: groupSheets.openJoin },
      ],
    },
  ];

  // Set once, remembered: kept out of the way in one menu.
  const optionsMenu: MenuSection[] = [
    {
      items: [{ key: 'as-list', label: 'Show as list', icon: 'list-outline', checked: asList, onSelect: () => setAsList(x => !x) }],
    },
    {
      title: 'Coming up under the calendar',
      items: UPCOMING_OPTIONS.map(o => ({
        key: `up${o.days}`, label: o.label, checked: o.days === upcomingDays, onSelect: () => setUpcomingDays(o.days),
      })),
    },
    {
      title: 'Week starts on',
      items: [
        { key: 'sun', label: 'Sunday', checked: weekStartsOn === 0, onSelect: () => setWeekStartsOn(0) },
        { key: 'mon', label: 'Monday', checked: weekStartsOn === 1, onSelect: () => setWeekStartsOn(1) },
      ],
    },
  ];

  // What's waiting on you: replies, and ideas without a date. It lives behind
  // a bell by the menu, with a red dot while anything is waiting.
  const openInvite = (e: Event) => { setScope('mine'); setSelectedDate(keyOf(e.start_time)); setSelectedEventId(e.id); };
  const needsTargets = [
    ...awaiting.map(e => ({ key: inviteKey(e), label: `Reply: ${e.title}`, icon: 'mail-unread-outline' as const, onSelect: () => openInvite(e) })),
    ...undatedIdeas.map(i => ({ key: ideaKey(i), label: `Pick a date: ${i.title}`, icon: 'bulb-outline' as const, onSelect: () => navigation.navigate('Plans', { ideaId: i.id }) })),
  ];
  const needsCount = needsTargets.length;
  const needsBell = (
    <Menu
      title={needsCount ? 'Your turn' : undefined}
      sections={needsCount
        ? [
          { title: awaiting.length ? 'Waiting on your reply' : undefined, items: needsTargets.filter(t => !t.key.startsWith('idea:')) },
          { title: undatedIdeas.length ? 'Ideas that need a date' : undefined, items: needsTargets.filter(t => t.key.startsWith('idea:')) },
        ]
        : [{ items: [{ key: 'none', label: 'You’re all caught up', icon: 'checkmark-circle-outline', onSelect: () => {} }] }]}
    >
      {(open) => (
        <View>
          <IconButton
            icon={needsCount ? 'notifications' : 'notifications-outline'}
            label={needsCount ? `Your turn: ${needsCount} item${needsCount === 1 ? '' : 's'}` : 'Your turn: nothing right now'}
            variant="gray"
            onPress={open}
          />
          {needsCount ? (
            <View pointerEvents="none" style={{
              position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5,
              backgroundColor: c.danger, borderWidth: 2, borderColor: c.background,
            }} />
          ) : null}
        </View>
      )}
    </Menu>
  );

  const header = (
    <ScreenHeader
      title={scope === 'mine' ? 'My calendar' : viewGroup?.name ?? 'Shared calendar'}
      titleAccessibilityLabel={scope === 'group' && viewGroup ? `${viewGroup.name}, shared calendar` : undefined}
      titleLeading={scope === 'group' && viewGroup ? <GroupCover group={viewGroup} round blur={0} style={{ width: 38, height: 38 }} /> : undefined}
      titleMenu={{ sections: calendarMenu, title: 'Show calendar' }}
      display
      trailing={
        <>
          {needsBell}
          <Menu sections={optionsMenu} title="View options">
            {(open) => <IconButton icon="ellipsis-horizontal" label="View options" variant="gray" onPress={open} />}
          </Menu>
          {!compact && <IconButton icon="add" label="New Plan (⌘N)" variant="gray" onPress={() => newPlan()} />}
        </>
      }
    />
  );

  // ☆ beside the views: star what you're looking at (e.g. Week, or Week as a
  // list) to open it every time; tap the filled star to unset.
  const viewName = `${VIEWS.find(v => v.key === view)!.label}${asList ? ' as a list' : ''}`;
  const starred = !!defaultView && defaultView.view === view && defaultView.asList === asList;
  const viewPicker = (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, paddingLeft: space.m, paddingRight: space.s, paddingBottom: space.s }}>
      <Segmented options={VIEWS} value={view} onChange={setView} style={{ flex: 1 }} />
      <IconButton
        icon={starred ? 'star' : 'star-outline'}
        label={starred ? `${viewName} is your default view. Tap to unset` : `Make ${viewName} your default view`}
        onPress={() => setDefaultView(starred ? null : { view, asList })}
      />
    </View>
  );

  // Only in a shared calendar: a chip on the date row lays your own events
  // over it. The first time, one line says what it does.
  const toggleMine = () => { setShowMine(x => !x); setMineHintSeen(true); };
  const mineChip = scope === 'group' ? <MineChip on={showMine} onToggle={toggleMine} /> : undefined;
  const mineHint = scope === 'group' && !mineHintSeen ? (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s, paddingLeft: space.m, paddingRight: space.hair }}>
      <Txt v="footnote" tone="secondary" style={{ flex: 1 }}>“Mine” adds your other plans here, outlined. Only you see them.</Txt>
      <IconButton icon="close" label="Got it" onPress={() => setMineHintSeen(true)} />
    </View>
  ) : null;


  const openRow = (r: Row) => isMaybe(r)
    ? navigation.navigate('Plans', { ideaId: r.idea.id })
    : setSelectedEventId(r.id);

  const sectionHeader = (section: DaySection) => (
    <View style={{ paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: space.s, backgroundColor: c.background }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
        <Txt v="headline" accessibilityRole="header">{section.title}</Txt>
        {section.subtitle ? <Txt v="callout" tone="secondary">{section.subtitle}</Txt> : null}
      </View>
      <WorkLine day={workOn(workSchedules, section.key)} />
    </View>
  );

  const rowView = (item: Row, day: string) => isMaybe(item) ? (
    <MaybeRow key={item.id} item={item} day={day} meId={meId} onPress={() => openRow(item)} />
  ) : (
    <EventRow
      key={item.id}
      event={item}
      day={day}
      attendees={attendeesOf(item)}
      meId={meId}
      hostName={(() => { const h = hostOf(item); return h ? (h === meId ? 'you' : memberById.get(h)?.full_name?.split(' ')[0] ?? null) : null; })()}
      groupName={(scope === 'mine' && groupById.size > 1) || item.overlay ? groupById.get(item.group_id)?.name ?? null : null}
      overlay={!!item.overlay}
      selected={threeColumn && item.id === selectedEventId}
      onPress={() => openRow(item)}
    />
  );

  const footer = loading ? <ActivityIndicator style={{ marginTop: space.l }} color={c.secondaryLabel} /> : null;

  // ─── The view ──────────────────────────────────────────────────────────────
  // Picking a day from the week or month opens that day.
  const openDay = (key: string) => { setSelectedDate(key); setView('day'); };
  const today = todayKey();
  const goToday = () => setSelectedDate(today);

  const weekRange = rangeLabel(week, addDays(week, 6));
  const periodBar =
    view === 'day' ? (
      <PeriodBar label={longDate(selectedDate)} unit="day" accessory={mineChip} onStep={dir => setSelectedDate(addDays(selectedDate, dir))} onToday={selectedDate !== today ? goToday : undefined} />
    ) : view === 'week' ? (
      <PeriodBar label={weekRange.text} spoken={weekRange.spoken} unit="week" accessory={mineChip} onStep={dir => setSelectedDate(addDays(selectedDate, 7 * dir))} onToday={today < week || today > addDays(week, 6) ? goToday : undefined} />
    ) : (
      <PeriodBar label={monthLabel(selectedDate)} unit="month" accessory={mineChip} onStep={dir => setSelectedDate(addMonths(selectedDate, dir))} onToday={monthLabel(today) !== monthLabel(selectedDate) ? goToday : undefined} />
    );

  const listPeriod = (
    <View>
      {sections.map(s => (
        <View key={s.key}>
          {sectionHeader(s)}
          {s.data.length ? s.data.map(r => rowView(r, s.key)) : (
            <ListRow title="Nothing planned" subtitle={scope === 'mine' ? 'Make plans for this day' : 'Add something for this day'} tintTitle={false} onPress={() => newPlan(s.key)} icon="add-circle-outline" />
          )}
        </View>
      ))}
      {sections.length === 0 ? (
        <ListRow title={`Nothing planned this ${view}`} subtitle="Make plans" tintTitle={false} onPress={() => newPlan()} icon="add-circle-outline" />
      ) : null}
    </View>
  );

  const period = asList ? listPeriod :
    view === 'day' ? (
      <DayTimeline
        day={selectedDate}
        rows={byDay.get(selectedDate) ?? []}
        header={<View style={{ paddingHorizontal: space.m }}><WorkLine day={workOn(workSchedules, selectedDate)} /></View>}
        onOpen={openRow}
        onAdd={() => newPlan(selectedDate)}
      />
    ) : view === 'week' ? (
      <WeekRows start={week} byDay={byDay} selected={selectedDate} onPickDay={openDay} onOpen={openRow} />
    ) : (
      <CalendarGrid selected={selectedDate} onSelect={openDay} marked={marked} expanded hideHeader weekStartsOn={weekStartsOn} />
    );

  const comingUp = upcomingDays > 0 ? (
    <>
      <View style={{ paddingHorizontal: space.m, paddingTop: space.l, flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
        <Txt v="title" accessibilityRole="header">Coming up</Txt>
        <Txt v="callout" tone="secondary" accessibilityLabel={rangeLabel(upcomingFrom, upcomingTo).spoken}>{rangeLabel(upcomingFrom, upcomingTo).text}</Txt>
      </View>
      {/* Same compact chips as the week, so the page reads as one calendar. */}
      {upcoming.length ? upcoming.map(s => (
        <View key={s.key} style={{ paddingHorizontal: space.m, paddingTop: space.m, gap: space.hair }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s, paddingBottom: 2 }}>
            <Txt v="callout" semibold accessibilityRole="header">{s.title}</Txt>
            {s.subtitle ? <Txt v="footnote" tone="secondary">{s.subtitle}</Txt> : null}
          </View>
          <WorkLine day={workOn(workSchedules, s.key)} />
          {s.data.map(r => <EventChip key={r.id} row={r} day={s.key} onPress={() => openRow(r)} />)}
        </View>
      )) : (
        <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m, paddingTop: space.s }}>Nothing else planned yet.</Txt>
      )}
    </>
  ) : null;

  const top = <>{header}{viewPicker}{periodBar}{mineHint}</>;

  const list = (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomClearance }}>
      {top}{period}{comingUp}{footer}
    </ScrollView>
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
      onOpenGroup={(() => {
        const g = sharedCalendars.find(x => x.id === e.group_id);
        if (!g || (scope === 'group' && g.id === viewGroup?.id)) return undefined;
        return () => { if (!threeColumn) setSelectedEventId(null); openCalendar(g); };
      })()}
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
      {groupSheets.sheets}

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
  if (isMultiDay(e.start_time, e.end_time)) return spanLabel(e.start_time, e.end_time);
  const { hm, ampm } = whenOnDay(e.start_time, e.end_time, keyOf(e.start_time));
  return `${hm} ${ampm}`;
}

function EventRow({ event, day, attendees, meId, groupName, hostName, overlay, selected, onPress }: {
  event: Event; day: string; attendees: AvatarPerson[]; meId: string | null; groupName: string | null; hostName: string | null;
  overlay: boolean;   // your own event laid over a shared calendar
  selected: boolean; onPress: () => void;
}) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const { hm, ampm, spoken: when } = whenOnDay(event.start_time, event.end_time, day);
  const cancelled = !!event.cancelled_at;
  const reply = replyOf(event, meId);
  // Traditions name this time's host; otherwise the organizer is hosting.
  const status = cancelled ? 'Cancelled'
    : hostName === 'you' ? 'Your turn to host'
    : event.created_by === meId && !hostName ? 'You’re hosting'
    : reply ? REPLY_META[reply] : null;
  const strong = !cancelled && (reply === 'going' || reply === 'pending');
  const faded = cancelled || reply === 'declined';
  const rest = [hostName && hostName !== 'you' ? `${hostName} hosting` : null, event.location].filter(Boolean).join(' · ');
  const meta = [status, rest].filter(Boolean).join(' · ');
  // Where it comes from: its group, by icon and name (not color alone).
  const source = overlay ? groupName ?? 'Your event' : groupName;

  return (
    <Tappable
      onPress={onPress}
      selected={selected}
      accessibilityLabel={`${when}, ${event.title}${meta ? `, ${meta}` : ''}${overlay ? ', your event, not on this calendar' : groupName ? `, ${groupName} calendar` : ''}`}
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
        <Txt v={overlay ? 'body' : 'headline'} numberOfLines={1} tone={faded || overlay ? 'secondary' : 'primary'} style={cancelled ? { textDecorationLine: 'line-through' } : undefined}>{event.title}</Txt>
        {meta ? (
          <Txt v="callout" tone="secondary" numberOfLines={1}>
            {status ? <Txt v="callout" tone={strong ? 'tint' : 'secondary'} semibold={strong}>{status}</Txt> : null}
            {status && rest ? ' · ' : ''}
            {rest}
          </Txt>
        ) : null}
        {source ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 1 }} importantForAccessibility="no-hide-descendants">
            <Icon name={overlay ? 'person-outline' : 'people-circle-outline'} size={12} color={c.secondaryLabel} />
            <Txt v="caption" tone="secondary" numberOfLines={1}>{source}</Txt>
          </View>
        ) : null}
      </View>
      {attendees.length > 0 && !cancelled && !overlay && <AvatarStack people={attendees} max={compact ? 3 : 2} size={compact ? 28 : 24} />}
    </Tappable>
  );
}

// ─── Maybe row ───────────────────────────────────────────────────────────────

/** A date option still being decided: faint, dashed, and one tap from voting. */
function MaybeRow({ item, day, meId, onPress }: { item: Maybe; day: string; meId: string | null; onPress: () => void }) {
  const { c } = useTheme();
  const { compact } = useLayout();
  const { hm, ampm, spoken: when } = whenOnDay(item.slot.start, item.slot.end, day);
  const yes = tallySlots(item.idea, [item.slot])[0].yes;
  const mine = meId ? item.idea.slot_votes?.[meId] : undefined;
  const status = mine === undefined ? 'Maybe · vote on dates' : mine.includes(item.slot.start) ? 'Maybe · works for you' : 'Maybe';
  return (
    <Tappable
      onPress={onPress}
      accessibilityLabel={`${when}, ${item.idea.title}, date option, ${votesLabel(yes.length)}`}
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
          {`${status} · ${votesLabel(yes.length)}`}
        </Txt>
      </View>
    </Tappable>
  );
}

