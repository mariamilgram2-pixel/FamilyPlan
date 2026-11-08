// Two tabs from one screen:
//
// Sheep — make plans happen. Made for the moment someone at dinner says "we
// should…": a sheep, the mission, and one box to plan in. The sheep's speech
// bubble ("See home ›") goes to the Home tab. Activity (the inbox) sits behind
// the bell; settings behind your avatar.
//
// Home — what needs you, what's coming up, how recent plans went, and nudges
// toward the next one (birthdays, someone free when you are, people you
// haven't seen).

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { DEMO_EVENTS, DEMO_EXTRA_GROUPS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, DEMO_PEOPLE, isDemoGroup } from '../../lib/demo';
import { expandEvents } from '../../lib/recurrence';
import { blocksTime, needsReply, replyOf } from '../../lib/rsvp';
import { awaitingYourDates, hostOf, readyToSend } from '../../lib/plans';
import { isAllDay, isMultiDay, spanLength } from '../../lib/span';
import { findSlots } from '../../lib/planner';
import { useWorkSchedules } from '../../lib/workSchedule';
import { useNotifications } from '../../lib/notifications';
import { useCircle } from '../../lib/people';
import { useShortcut } from '../../lib/shortcuts';
import { useDismissed } from '../../lib/dismissed';
import { AppNotification, Event, Idea, Profile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { usePlanComposer } from '../../components/PlanComposer';
import { Sheep } from '../../components/Sheep';
import {
  Button, Icon, IconButton, IconName, ListRow, ListSection, ReadingColumn,
  ScreenHeader, Screen, Sheet, Tappable, Txt,
TextInputRef, } from '../../components/ui';
import { NotificationList } from '../ideas/IdeaViews';
import { Bubble, BubbleRow, Hero, NewPlanButton, PillCloud, PlanBar, Polaroids, SectionTop, Stop, TicketRow, Timeline, useOpenTile } from './HomeViews';
import { ART, FieldFlock, useFieldFlockInset } from './FieldFlock';
import { addDays, dateKey, keyOf, parseKey, relativeDay, shortDate, timeParts, todayKey } from '../calendar/dates';
import { space, useLayout, useTheme } from '../../theme';

const DAY = 86400000;
const RECONNECT_AFTER_DAYS = 28;
const BIRTHDAYS_WITHIN_DAYS = 30;

const first = (p?: { full_name?: string | null } | null) => (p?.full_name ?? 'Someone').split(' ')[0];

/** Its start time, "All day", or a trip's length ("3 days"). */
function startsAt(e: Event) {
  if (isAllDay(e.start_time, e.end_time)) return spanLength(e.start_time, e.end_time);
  const { hm, ampm } = timeParts(e.start_time);
  return `${hm.replace(':00', '')} ${ampm}${isMultiDay(e.start_time, e.end_time) ? ` · ${spanLength(e.start_time, e.end_time)}` : ''}`;
}

function when(e: Event) {
  const rel = relativeDay(keyOf(e.start_time));
  return `${rel ?? shortDate(keyOf(e.start_time))} · ${startsAt(e)}`;
}

/** Next occurrence of an MM-DD birthday, from today. */
function nextBirthday(mmdd: string): string {
  const [m, d] = mmdd.split('-').map(Number);
  const today = parseKey(todayKey());
  let next = new Date(today.getFullYear(), m - 1, d);
  if (next < today) next = new Date(today.getFullYear() + 1, m - 1, d);
  return dateKey(next);
}

/** The Home tab: your plans at a glance. */
export default function HomeScreen() {
  return <HomeView view="plans" />;
}

/** The Sheep tab: the sheep, the mission, and the box to plan in. */
export function SheepScreen() {
  return <HomeView view="start" />;
}

function HomeView({ view }: { view: 'start' | 'plans' }) {
  const { user, profile } = useAuth();
  const { activeGroup, groups } = useGroup();
  const { c, isDark, toggleColorScheme } = useTheme();
  const { compact } = useLayout();
  const navigation = useNavigation<any>();
  const composer = usePlanComposer();
  const work = useWorkSchedules();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const me = profile ?? (isDemo ? DEMO_MEMBERS[0] : null);
  const inbox = useNotifications(meId, isDemo);
  const circle = useCircle(true, meId);

  const [events, setEvents] = useState<Event[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [loading, setLoading] = useState(true);
  const [inboxOpen, setInboxOpen] = useState(false);
  const describeInput = useRef<TextInputRef>(null);
  const [viewport, setViewport] = useState(0);
  const [stack, setStack] = useState(0);
  const hill = useFieldFlockInset();
  // Plain page between the last row and the crest. Grows when the list is
  // shorter than the screen, so the hill sits at the bottom instead of
  // cutting through a row. Expanding a section lengthens the stack and the
  // hill moves down with it.
  const hillGap = Math.max(space.xxl, viewport - stack - space.l - hill.height);

  // ─── Data ──────────────────────────────────────────────────────────────────
  // Your events from the last four months (for "haven't seen") through the
  // next two (for "coming up"), with repeating ones expanded.
  const fetchAll = useCallback(async () => {
    const from = new Date(Date.now() - 120 * DAY), to = new Date(Date.now() + 60 * DAY);
    if (isDemo) {
      setEvents(expandEvents(DEMO_EVENTS, from, to));
      setIdeas([...DEMO_IDEAS]);
      setLoading(false);
      return;
    }
    if (!meId) return;
    const groupIds = (groups.length ? groups : activeGroup ? [activeGroup] : []).map(g => g.id);
    const events = supabase.from('events').select('*');
    const [{ data: ev }, { data: id }] = await Promise.all([
      // Your groups' plans and anything you're invited to (just the invites before you're in a group).
      (groupIds.length ? events.or(`group_id.in.(${groupIds.join(',')}),attendees.cs.{${meId}}`) : events.contains('attendees', [meId]))
        .lt('start_time', to.toISOString()),
      // Every idea you can see: your groups', and any shared with you by name.
      supabase.from('ideas').select('*, idea_votes(id, user_id)').eq('status', 'proposed'),
    ]);
    setEvents(expandEvents((ev as Event[]) ?? [], from, to));
    setIdeas((id as Idea[]) ?? []);
    setLoading(false);
  }, [activeGroup, groups, isDemo, meId]);

  useFocusEffect(useCallback(() => { fetchAll(); inbox.refresh(); }, [fetchAll, inbox.refresh]));
  useEffect(() => { fetchAll(); }, [composer.version]);
  useShortcut('n', () => composer.newPlan());

  const people = useMemo(() => {
    const map = new Map<string, Profile>(circle.people.map(p => [p.profile.id, p.profile]));
    if (isDemo) DEMO_PEOPLE.forEach(p => map.set(p.id, p));
    return map;
  }, [circle.people, isDemo]);
  const personOf = (id: string): AvatarPerson => people.get(id) ?? { id };

  const now = Date.now();
  const mine = useMemo(() => (meId ? events.filter(e => e.attendees?.includes(meId)) : []), [events, meId]);
  const goingTo = (e: Event) => !!meId && blocksTime(e, meId) && replyOf(e, meId) !== 'pending';

  // ─── Needs you ─────────────────────────────────────────────────────────────
  const todos: Bubble[] = useMemo(() => {
    const out: Bubble[] = [];
    const seen = new Set<string>();
    mine.forEach(e => {
      const series = e.series_id ?? e.id;
      if (seen.has(series) || !needsReply(e, meId)) return;
      seen.add(series);
      const host = personOf(e.created_by ?? '');
      out.push({
        key: `rsvp-${series}`, person: host, badge: 'mail-unread', label: e.title, caption: 'Reply', strong: true,
        a11y: `${first(host)} invited you to ${e.title}, ${when(e)}. Reply.`,
        onPress: () => navigation.navigate('Calendar', { eventId: e.id, date: keyOf(e.start_time) }),
      });
    });
    ideas.forEach(i => {
      if (awaitingYourDates(i, meId)) out.push({
        key: `dates-${i.id}`, person: personOf(i.created_by ?? ''), badge: 'calendar-number', label: i.title, caption: 'Vote', strong: true,
        a11y: `Which dates work for ${i.title}? ${first(personOf(i.created_by ?? ''))} suggested ${i.proposed_slots.length} options.`,
        onPress: () => navigation.navigate('Plans', { ideaId: i.id }),
      });
      else if (readyToSend(i, meId)) out.push({
        key: `send-${i.id}`, icon: 'paper-plane-outline', badge: 'send', label: i.title, caption: 'Send', strong: true,
        a11y: `Everyone answered on ${i.title}. Pick the date and send the invite.`,
        onPress: () => navigation.navigate('Plans', { ideaId: i.id }),
      });
    });
    // Something still unclaimed at an event you're going to soon.
    mine.filter(e => goingTo(e) && new Date(e.start_time).getTime() > now && new Date(e.start_time).getTime() < now + 14 * DAY)
      .forEach(e => {
        const open = (e.assignments ?? []).filter(a => !a.assignee_id);
        const series = e.series_id ?? e.id;
        if (!open.length || seen.has(`a-${series}`)) return;
        seen.add(`a-${series}`);
        out.push({
          key: `assign-${series}`, icon: 'hand-right-outline', badge: 'hand-right', label: open[0].item, caption: 'Claim',
          a11y: `${open.map(a => a.item).join(', ')} still open for ${e.title}, ${when(e)}.`,
          onPress: () => navigation.navigate('Calendar', { eventId: e.id, date: keyOf(e.start_time) }),
        });
      });
    return out;
  }, [mine, ideas, meId, people]);

  // ─── Coming up ─────────────────────────────────────────────────────────────
  const upNext = useMemo(() => {
    const seen = new Set<string>();   // a repeating plan shows its next time only
    return mine
      .filter(e => goingTo(e) && new Date(e.end_time).getTime() > now)
      .sort((a, b) => a.start_time.localeCompare(b.start_time))
      .filter(e => { const k = e.series_id ?? e.id; if (seen.has(k)) return false; seen.add(k); return true; })
      .slice(0, 4);
  }, [mine]);

  // ─── How was it? ───────────────────────────────────────────────────────────
  const recent = useMemo(() => mine
    .filter(e => goingTo(e) && !e.series_id && new Date(e.end_time).getTime() < now && new Date(e.end_time).getTime() > now - 7 * DAY)
    .sort((a, b) => b.start_time.localeCompare(a.start_time))
    .slice(0, 2), [mine]);

  // ─── People: who you see, and who you haven't ─────────────────────────────
  // For everyone you've shared a plan with: the last time, the next time, how often.
  const together = useMemo(() => {
    const map = new Map<string, { last: Event | null; next: Event | null; count: number }>();
    mine.filter(e => meId && blocksTime(e, meId)).forEach(e => {
      const past = new Date(e.end_time).getTime() < now;
      e.attendees.forEach(id => {
        if (id === meId || e.rsvps?.[id] === 'declined') return;
        const t = map.get(id) ?? { last: null, next: null, count: 0 };
        t.count++;
        if (past && (!t.last || e.start_time > t.last.start_time)) t.last = e;
        if (!past && (!t.next || e.start_time < t.next.start_time)) t.next = e;
        map.set(id, t);
      });
    });
    return map;
  }, [mine, meId]);

  const reconnect = useMemo(() => Array.from(together.entries())
    .filter(([, t]) => !t.next && t.last && now - new Date(t.last.end_time).getTime() > RECONNECT_AFTER_DAYS * DAY)
    .sort(([, a], [, b]) => a.last!.start_time.localeCompare(b.last!.start_time))
    .slice(0, 3)
    .map(([id, t]) => ({ id, last: t.last!, weeks: Math.floor((now - new Date(t.last!.end_time).getTime()) / (7 * DAY)) })),
  [together]);

  // The people you see most: when are you both free this week?
  const freeTogether = useMemo(() => {
    if (!meId) return [];
    const top = Array.from(together.entries()).sort(([, a], [, b]) => b.count - a.count).slice(0, 2).map(([id]) => id);
    return top.map(id => {
      const busy = events
        .filter(e => blocksTime(e, meId) || blocksTime(e, id))
        .map(e => ({ start: new Date(e.start_time).getTime(), end: new Date(e.end_time).getTime(), who: id }));
      const [slot] = findSlots({ busy, work, prefs: { partOfDay: 'evening', horizon: 'soon', days: 'any', duration: 120, onlyDate: null } });
      return slot ? { id, slot } : null;
    }).filter(Boolean) as { id: string; slot: { start: string; end: string } }[];
  }, [together, events, work, meId]);

  const birthdays = useMemo(() => Array.from(people.values())
    .filter(p => p.id !== meId && p.birthday)
    .map(p => ({ p, key: nextBirthday(p.birthday!) }))
    .filter(b => parseKey(b.key).getTime() - parseKey(todayKey()).getTime() <= BIRTHDAYS_WITHIN_DAYS * DAY)
    .sort((a, b) => a.key.localeCompare(b.key))
    .slice(0, 3), [people, meId]);

  // ─── Inbox ─────────────────────────────────────────────────────────────────
  function openNotification(n: AppNotification) {
    inbox.markRead([n.id]);
    setInboxOpen(false);
    setTimeout(() => {
      if (n.event_id) navigation.navigate('Calendar', { eventId: n.event_id });
      else if (n.idea_id) navigation.navigate('Plans', { ideaId: n.idea_id });
      else if (n.kind === 'friend_request' || n.kind === 'friend_accepted' || n.kind === 'group_added') navigation.navigate('People');
    }, 450);
  }
  function closeInbox() {
    setInboxOpen(false);
    inbox.markRead(inbox.items.filter(n => !n.read_at).map(n => n.id));
  }

  const hhmm = (iso: string) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const shortTime = (iso: string) => { const { hm, ampm } = timeParts(iso); return `${hm.replace(':00', '')} ${ampm}`; };

  // ─── Pieces ────────────────────────────────────────────────────────────────
  // Which group a plan is for, by name (shared calendars and groups alike).
  const allGroups = useMemo(() => [
    ...groups, ...(activeGroup ? [activeGroup] : []), ...(isDemo ? DEMO_EXTRA_GROUPS.map(g => g.group) : []),
  ], [groups, activeGroup, isDemo]);
  const groupNameOf = (id: string | null | undefined) => (id ? allGroups.find(g => g.id === id)?.name ?? null : null);
  const stops: Stop[] = upNext.map(e => {
    const d = new Date(e.start_time);
    const host = hostOf(e);
    return {
      key: e.id,
      day: d.getDate(),
      weekday: d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase(),
      today: keyOf(e.start_time) === todayKey(),
      title: e.title,
      time: startsAt(e),
      host: host ? (host === meId ? 'You' : first(personOf(host))) : null,
      group: groupNameOf(e.group_id),
      people: e.attendees.filter(id => id !== meId && e.rsvps?.[id] !== 'declined').map(personOf),
      a11y: `${e.title}, ${when(e)}${host ? `, ${host === meId ? 'your turn to host' : `${first(personOf(host))} hosting`}` : ''}`,
      onPress: () => navigation.navigate('Calendar', { eventId: e.id, date: keyOf(e.start_time) }),
    };
  });

  // After an event: memories first; planning it again is one tap further.
  const memoryTarget = (e: Event) => ({
    eventId: e.series_id ?? e.id,
    title: e.title,
    when: relativeDay(keyOf(e.start_time)) ?? shortDate(keyOf(e.start_time)),
    recipients: e.attendees.filter(id => e.rsvps?.[id] !== 'declined'),
  });
  const cameWith = (e: Event) => e.attendees.filter(id => id !== meId && e.rsvps?.[id] !== 'declined');

  const memories: Bubble[] = recent.map(e => ({
    key: e.id,
    person: personOf(cameWith(e)[0] ?? ''),
    icon: 'images-outline',
    badge: 'camera',
    label: e.title,
    caption: relativeDay(keyOf(e.start_time)) ?? shortDate(keyOf(e.start_time)),
    group: groupNameOf(e.group_id),
    a11y: `How was ${e.title}? Add memories.`,
    onPress: () => composer.addMemories(memoryTarget(e)),
    extra: { icon: 'add', label: 'Memories', a11y: `Add memories from ${e.title}`, onPress: () => composer.addMemories(memoryTarget(e)) },
    more: [
      {
        key: 'same', label: 'Same plan again', icon: 'refresh',
        onSelect: () => composer.newPlan({ title: e.title, location: e.location ?? undefined, notes: e.description ?? undefined, people: cameWith(e) }),
      },
      {
        key: 'people', label: 'Same people, new plan', icon: 'people-outline',
        onSelect: () => composer.newPlan({ people: cameWith(e) }),
      },
      {
        key: 'see', label: 'See memories', icon: 'images-outline',
        onSelect: () => navigation.navigate('Calendar', { eventId: e.id, date: keyOf(e.start_time) }),
      },
    ],
  }));

  // Suggestions you can clear. "It's been a while" with someone shares its key
  // with Friends' Been a while, so clearing one clears both.
  const { hidden, dismiss } = useDismissed();
  const clearKey = (key: string) => key.startsWith('r-') ? `quiet:${key.slice(2)}` : `home:${key}`;
  const allNudges: Bubble[] = [
    ...birthdays.map(({ p, key }) => {
      const days = Math.round((parseKey(key).getTime() - parseKey(todayKey()).getTime()) / DAY);
      return {
        key: `b-${p.id}`, person: p, badge: 'gift' as IconName, label: first(p),
        caption: days === 0 ? 'Today!' : `in ${days}d`, strong: days <= 7,
        a11y: `${first(p)}’s birthday is ${shortDate(key)}. Plan something.`,
        onPress: () => composer.newPlan({ title: `${first(p)}’s birthday`, date: key, people: [p.id] }),
      };
    }),
    ...freeTogether.map(({ id, slot }) => {
      const key = keyOf(slot.start);
      return {
        key: `f-${id}`, person: personOf(id), badge: 'time' as IconName, label: first(personOf(id)),
        caption: `${relativeDay(key) === 'Tomorrow' ? 'Tmrw' : relativeDay(key) === 'Today' ? 'Today' : new Date(slot.start).toLocaleDateString('en-US', { weekday: 'short' })} ${shortTime(slot.start)}`,
        a11y: `You and ${first(personOf(id))} are both free ${relativeDay(key) ?? shortDate(key)} at ${shortTime(slot.start)}. Plan it.`,
        onPress: () => composer.addEvent({ people: [id], date: key, start: hhmm(slot.start), end: hhmm(slot.end) }),
      };
    }),
    ...reconnect.map(({ id, last, weeks }) => ({
      key: `r-${id}`, person: personOf(id), badge: 'heart' as IconName, label: first(personOf(id)),
      caption: `${weeks}w ago`,
      a11y: `It’s been ${weeks} weeks since you saw ${first(personOf(id))}, at ${last.title}. Reach out.`,
      onPress: () => composer.newPlan({ people: [id] }),
    })),
  ];
  const nudges: Bubble[] = allNudges
    .filter(b => !hidden(clearKey(b.key)))
    .map(b => ({ ...b, onDismiss: () => dismiss(clearKey(b.key)) }));

  // This week's flock: everyone you'll see in the next seven days.
  const flock = useMemo(() => {
    const ids = new Set<string>();
    mine.filter(e => goingTo(e) && new Date(e.start_time).getTime() > now && new Date(e.start_time).getTime() < now + 7 * DAY)
      .forEach(e => e.attendees.forEach(id => { if (id !== meId && e.rsvps?.[id] !== 'declined') ids.add(id); }));
    return Array.from(ids).map(personOf);
  }, [mine, people]);

  // What the sheep says: "See home" first (tap the bubble for it), then puns.
  const lines = [
    'See home',
    upNext.length ? `Ewe’ve got ${upNext.length} plan${upNext.length === 1 ? '' : 's'} ahead.` : 'Flock together soon?',
    flock.length ? `Shear joy: ${flock.length} friend${flock.length === 1 ? '' : 's'} this week.` : 'Who haven’t you seen lately?',
    birthdays.length ? `Psst… ${first(birthdays[0].p)}’s birthday is coming up.` : 'Baa-ck to planning?',
    'I herd you like plans.',
    'No sheepish excuses this week.',
  ];

  // ─── Home ──────────────────────────────────────────────────────────────────
  // The Home tab. One section opens all the way at a time.
  const { open: openTile, toggle: toggleTile } = useOpenTile(null);
  const section = (key: string) => ({ open: openTile === key, onToggle: () => toggleTile(key) });

  // Its own header (not ScreenHeader), so it clears the status bar itself.
  const insets = useSafeAreaInsets();
  const plansView = (
    <View style={{ gap: space.xl, paddingTop: (compact ? insets.top : 0) + space.s }}>
      <View style={{ gap: space.s }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: space.s }}>
          <Txt v="display" accessibilityRole="header">Home</Txt>
          <NewPlanButton onPress={() => composer.newPlan()} />
        </View>
      </View>
      {loading ? <ActivityIndicator color={c.secondaryLabel} /> : null}

      {/* Your turn: the faces waiting on you. */}
      <View style={{ gap: space.m }}>
        <SectionTop title="Your turn" sheep={ART.standing3} hint={todos.length ? null : 'All caught up'}
          canOpen={todos.length > 4} {...section('needs')} />
        {todos.length ? <BubbleRow items={openTile === 'needs' ? todos : todos.slice(0, 4)} wrap={openTile === 'needs'} /> : null}
      </View>

      {/* Coming up: calendar pages to swipe; open, the whole timeline. */}
      <View style={{ gap: space.m }}>
        <SectionTop title="Coming up" sheep={ART.grazing2} hint={stops.length ? null : 'Nothing planned'}
          canOpen={stops.length > 0} {...section('upcoming')} />
        {stops.length ? (openTile === 'upcoming' ? <Timeline stops={stops} /> : <TicketRow stops={stops} />) : null}
      </View>

      {/* How was it?: polaroids. */}
      <View style={{ gap: space.s }}>
        <SectionTop title="How was it?" sheep={ART.lying1} hint={memories.length ? 'Add photos or a note' : 'No new memories'}
          canOpen={memories.length > 2} {...section('recent')} />
        {memories.length ? <Polaroids items={memories} wrap={openTile === 'recent'} /> : null}
      </View>

      {/* Make plans: pills to tap. */}
      <View style={{ gap: space.m }}>
        <SectionTop title="Make plans" sheep={ART.sitting1} hint={nudges.length ? 'Birthdays, free time, old friends' : 'Ideas soon'}
          canOpen={nudges.length > 4} {...section('nudges')} />
        {nudges.length ? <PillCloud items={openTile === 'nudges' ? nudges : nudges.slice(0, 4)} /> : null}
      </View>
    </View>
  );

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Screen>
      <ReadingColumn
        style={{ flex: 1 }}
        footer={view === 'start' ? <FieldFlock /> : undefined}
        onLayout={(e) => setViewport(e.nativeEvent.layout.height)}
        contentContainerStyle={{ paddingTop: 0, paddingBottom: 0, paddingHorizontal: compact ? space.m : space.l }}
      >
        {view === 'plans' ? plansView : (
        <View onLayout={(e) => setStack(e.nativeEvent.layout.height)} style={{ gap: space.l }}>
        <View style={{ marginHorizontal: compact ? -space.m : -space.l, marginBottom: -space.m }}>
          <ScreenHeader
            title={`Hi, ${first(me)}`}
            display
            trailing={
              <>
                <IconButton
                  icon={isDark ? 'sunny-outline' : 'moon-outline'}
                  label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
                  variant="gray"
                  onPress={toggleColorScheme}
                />
                <View>
                  <IconButton
                    icon={inbox.unread ? 'notifications' : 'notifications-outline'}
                    label={inbox.unread ? `Activity, ${inbox.unread} new` : 'Activity'}
                    variant="gray"
                    onPress={() => setInboxOpen(true)}
                  />
                  {inbox.unread ? (
                    <View pointerEvents="none" style={{ position: 'absolute', top: 2, right: 2, width: 10, height: 10, borderRadius: 5, backgroundColor: c.tint, borderWidth: 2, borderColor: c.background }} />
                  ) : null}
                </View>
                {compact ? (
                  <Tappable feedback="opacity" onPress={() => navigation.navigate('You')} accessibilityLabel="Your profile and settings">
                    <Avatar person={{ id: meId ?? 'me', full_name: me?.full_name, avatar_url: me?.avatar_url }} size={36} highlight />
                  </Tappable>
                ) : null}
              </>
            }
          />
        </View>

        {/* Planning starts in the box under the sheep; Home has no floating New Plan
            button, so nothing covers the flock on the hill. */}
        <Hero
          lines={lines}
          onBubble={() => navigation.navigate('Home')}
          bubbleHint="Opens Home: what needs you, what’s coming up, how plans went, and ideas for more."
          below={(
            <View style={{ gap: space.s }}>
              <PlanBar
                inputRef={describeInput}
                onSave={(text) => {
                  describeInput.current?.blur();
                  composer.newPlan({ sentence: text, titleDone: true });
                }}
                onOpen={() => composer.newPlan()}
              />
              {/* Or start from who: pick people, then the plan opens with them in it. */}
              <Tappable
                feedback="opacity"
                onPress={() => composer.newPlan({ pickWho: true })}
                accessibilityLabel="Start with who"
                accessibilityHint="Pick people, then plan with them"
                style={{ alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, paddingVertical: space.hair, paddingHorizontal: space.s, borderRadius: 999 }}
              >
                <Icon name="person-add-outline" size={15} color={c.tint} />
                <Txt v="footnote" tone="tint" semibold>Start with who</Txt>
              </Tappable>
            </View>
          )}
        />

        </View>
        )}
        <View style={{ height: view === 'plans' ? space.xxl * 2 : hillGap }} />
      </ReadingColumn>


      <Sheet
        visible={inboxOpen}
        onClose={closeInbox}
        title="Activity"
        cancelLabel="Done"
        action={inbox.items.length ? { label: 'Clear All', onPress: () => inbox.remove(inbox.items.map(n => n.id)) } : undefined}
      >
        <NotificationList items={inbox.items} onOpen={openNotification} onClear={(n) => inbox.remove([n.id])} />
      </Sheet>
    </Screen>
  );
}
