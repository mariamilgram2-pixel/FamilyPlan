// Calendar
//
// Reading order (F-pattern): the selected date anchors the top-left, the
// grid sits directly beneath it, and the agenda runs down the left edge with
// the time column first so eyes can scan times vertically.
//
// compact:   header → week strip (expandable) → agenda; detail in a sheet;
//            "New Event" capsule in the thumb zone.
// expanded:  [list column: header, month, agenda] | [event detail].

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { DEMO_EVENTS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { Assignment, Event, Profile } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import GroupSwitcher from '../../components/GroupSwitcher';
import { Sheep } from '../../components/Sheep';
import {
  Button, EmptyState, IconButton, ListRow, PrimaryAction, ReadingColumn, ScreenHeader,
  Sheet, SplitView, Tappable, Txt, useBottomClearance,
} from '../../components/ui';
import { space, tabularNums, useLayout, useTheme } from '../../theme';
import CalendarGrid from './CalendarGrid';
import { EventComposer, EventDetail, WorkLine } from './EventViews';
import { useWorkSchedules, workOn } from '../../lib/workSchedule';
import { expandEvents } from '../../lib/recurrence';
import { useCircle } from '../../lib/people';
import { notify } from '../../lib/alert';
import { sendNotifications } from '../../lib/notifications';
import { keyOf, longDate, relativeDay, shortDate, timeParts, todayKey } from './dates';

type DaySection = { key: string; title: string; subtitle: string; data: Event[] };

export default function CalendarScreen() {
  const { activeGroup } = useGroup();
  const { user, profile } = useAuth();
  const { c } = useTheme();
  const { compact, threeColumn } = useLayout();
  const navigation = useNavigation<any>();
  const bottomClearance = useBottomClearance();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);

  const [events, setEvents] = useState<Event[]>([]);
  const [waitingIdeas, setWaitingIdeas] = useState(0);
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [composing, setComposing] = useState(false);
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
      setEvents(withOccurrences(DEMO_EVENTS));   // new array: planned ideas add to the demo list
      setWaitingIdeas(DEMO_IDEAS.filter(i => i.status === 'proposed').length);
      setMembers(DEMO_MEMBERS);
      return;
    }
    setLoading(true);
    const [{ data: eventData }, { count }, { data: memberRows }] = await Promise.all([
      supabase.from('events').select('*, profiles(id, full_name, email)')
        .eq('group_id', activeGroup.id).order('start_time', { ascending: true }),
      supabase.from('ideas').select('id', { count: 'exact', head: true })
        .eq('group_id', activeGroup.id).eq('status', 'proposed'),
      supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)')
        .eq('group_id', activeGroup.id),
    ]);
    setEvents(withOccurrences((eventData as Event[]) ?? []));
    setWaitingIdeas(count ?? 0);
    setMembers(((memberRows ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[]);
    setLoading(false);
  }, [activeGroup, isDemo]);

  // Refetch on focus: planning an idea adds events from the Ideas tab.
  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

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
  const attendeesOf = useCallback(
    (e: Event) => (e.attendees ?? []).map(id => memberById.get(id)).filter(Boolean) as AvatarPerson[],
    [memberById],
  );

  const marked = useMemo(() => new Set(events.map(e => keyOf(e.start_time))), [events]);

  // Selected day first (even if empty, so the answer to "what's on?" is
  // explicit), then every later day that has something.
  const sections: DaySection[] = useMemo(() => {
    const byDay = new Map<string, Event[]>();
    events.forEach(e => {
      const k = keyOf(e.start_time);
      if (k < selectedDate) return;
      if (!byDay.has(k)) byDay.set(k, []);
      byDay.get(k)!.push(e);
    });
    if (!byDay.has(selectedDate)) byDay.set(selectedDate, []);
    return Array.from(byDay.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, data]) => {
        const rel = relativeDay(key);
        return { key, data, title: rel ?? shortDate(key), subtitle: rel ? shortDate(key) : '' };
      });
  }, [events, selectedDate]);

  // Keep a sensible event selected for the detail column.
  useEffect(() => {
    if (!threeColumn) return;
    const stillVisible = sections.some(s => s.data.some(e => e.id === selectedEventId));
    if (!stillVisible) setSelectedEventId(sections.find(s => s.data.length)?.data[0]?.id ?? null);
  }, [sections, threeColumn]);

  // Leaving the three-column layout shouldn't pop a sheet for the old selection.
  useEffect(() => { if (!threeColumn) setSelectedEventId(null); }, [threeColumn]);

  const selectedEvent = events.find(e => e.id === selectedEventId) ?? null;

  useShortcut('n', () => setComposing(true));
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
            <IconButton icon="add" label="New Event (⌘N)" variant="gray" onPress={() => setComposing(true)} />
          )}
        </>
      }
    />
  );

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
      ListHeaderComponent={<>{header}{grid}</>}
      renderSectionHeader={({ section }) => (
        <View style={{ paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: space.s, backgroundColor: c.background }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: space.s }}>
            <Txt v="headline" accessibilityRole="header">{section.title}</Txt>
            {section.subtitle ? <Txt v="callout" tone="secondary">{section.subtitle}</Txt> : null}
          </View>
          <WorkLine day={workOn(workSchedules, section.key)} />
        </View>
      )}
      renderItem={({ item }) => (
        <EventRow
          event={item}
          attendees={attendeesOf(item)}
          meId={meId}
          selected={threeColumn && item.id === selectedEventId}
          onPress={() => setSelectedEventId(item.id)}
        />
      )}
      renderSectionFooter={({ section }) => section.data.length === 0 ? (
        <ListRow title="Nothing planned" subtitle="Add something for this day" tintTitle={false} onPress={() => setComposing(true)} icon="add-circle-outline" />
      ) : null}
      ListFooterComponent={
        loading ? <ActivityIndicator style={{ marginTop: space.l }} color={c.secondaryLabel} /> :
        waitingIdeas > 0 ? (
          <View style={{ marginTop: space.l, marginHorizontal: space.m, backgroundColor: c.fill, borderRadius: 16, overflow: 'hidden' }}>
            <ListRow
              icon="bulb-outline"
              title={`${waitingIdeas} idea${waitingIdeas === 1 ? '' : 's'} waiting for a date`}
              chevron
              onPress={() => navigation.navigate('Ideas')}
            />
          </View>
        ) : null
      }
    />
  );

  const detail = selectedEvent ? (
    <ReadingColumn>
      <EventDetail event={selectedEvent} attendees={attendeesOf(selectedEvent)} meId={meId} group={activeGroup} onClaim={(item, claim) => handleClaim(selectedEvent, item, claim)} onAssign={(items) => handleAssign(selectedEvent, items)} />
    </ReadingColumn>
  ) : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState
        icon="calendar-clear-outline"
        illustration={<Sheep size={88} pose="rest" style={{ marginBottom: space.m }} />}
        title="Nothing coming up"
        body="Plans you add for your group show up here."
        action={{ label: 'New Event', onPress: () => setComposing(true) }}
      />
    </View>
  );

  return (
    <>
      <SplitView list={list} detail={detail} />

      {!threeColumn && (
        <Sheet visible={!!selectedEvent} onClose={() => setSelectedEventId(null)} title="Event" cancelLabel="Done">
          {selectedEvent ? (
            <EventDetail event={selectedEvent} attendees={attendeesOf(selectedEvent)} meId={meId} group={activeGroup} onClaim={(item, claim) => handleClaim(selectedEvent, item, claim)} onAssign={(items) => handleAssign(selectedEvent, items)} />
          ) : null}
        </Sheet>
      )}

      <PrimaryAction label="New Event" onPress={() => setComposing(true)} />

      <EventComposer
        visible={composing}
        onClose={() => setComposing(false)}
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

function EventRow({ event, attendees, meId, selected, onPress }: {
  event: Event; attendees: AvatarPerson[]; meId: string | null; selected: boolean; onPress: () => void;
}) {
  const { compact } = useLayout();
  const { hm, ampm } = timeParts(event.start_time);
  const going = !!meId && event.attendees?.includes(meId);
  const meta = [going ? 'You’re going' : null, event.location].filter(Boolean).join(' · ');

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
        <Txt v="headline" numberOfLines={1}>{event.title}</Txt>
        {meta ? (
          <Txt v="callout" tone="secondary" numberOfLines={1}>
            {going ? <Txt v="callout" tone="tint" semibold>You’re going</Txt> : null}
            {going && event.location ? ' · ' : ''}
            {event.location ?? ''}
          </Txt>
        ) : null}
      </View>
      {attendees.length > 0 && <AvatarStack people={attendees} max={compact ? 3 : 2} size={compact ? 28 : 24} />}
    </Tappable>
  );
}
