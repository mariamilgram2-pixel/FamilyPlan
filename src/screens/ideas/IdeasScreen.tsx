// Plans
//
// Every plan in one list, grouped by what it needs — not by a status someone
// has to set. Needs you first (dates to answer, invites ready to send), then
// plans picking a date, ideas still gathering interest, what's coming up,
// and what already happened. The audience filter stays behind one menu.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, SectionList, View } from 'react-native';
import { useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import { confirmAction, notify } from '../../lib/alert';
import { supabase } from '../../lib/supabase';
import {
  DEMO_CONTACTS, DEMO_EVENTS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, isDemoGroup, removeDemoIdea, updateDemoIdea,
} from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { sendNotifications } from '../../lib/notifications';
import { awaitedVoters, dateVoters, tallySlots } from '../../lib/rsvp';
import { slotLabel } from '../../lib/planner';
import { Stage, awaitingYourDates, readyToSend, stageOf } from '../../lib/plans';
import { Contact, Group, Idea, Profile } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPerson } from '../../components/Avatar';
import GroupSwitcher, { useVisibleGroups } from '../../components/GroupSwitcher';
import { usePlanComposer } from '../../components/PlanComposer';
import CommentThread from '../../components/CommentThread';
import {
  EmptyState, IconButton, ListRow, Menu, MenuSection, PrimaryAction, ReadingColumn,
  ScreenHeader, Sheet, SplitView, Txt, useBottomClearance,
} from '../../components/ui';
import { space, useLayout, useTheme } from '../../theme';
import { Sheep } from '../../components/Sheep';
import { IdeaDetail, IdeaRow } from './IdeaViews';
import { keyOf, shortDate } from '../calendar/dates';

type AudienceFilter =
  | { kind: 'all' }
  | { kind: 'group'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'contact'; id: string };

type Bucket = 'needsYou' | Stage;
const BUCKETS: { key: Bucket; title: string }[] = [
  { key: 'needsYou', title: 'Needs you' },
  { key: 'dates', title: 'Picking a date' },
  { key: 'idea', title: 'Ideas' },
  { key: 'on', title: 'Coming up' },
  { key: 'happened', title: 'Happened' },
];
const HAPPENED_SHOWN = 5;

/** Demo ideas follow their events the way the database does: moved or cancelled. */
function reconcileDemo(i: Idea): Idea {
  const ev = i.event_id ? DEMO_EVENTS.find(e => e.id === i.event_id) : null;
  if (!ev) return i;
  if (ev.cancelled_at) return { ...i, status: 'proposed', event_id: null, proposed_slots: [], planned_at: null };
  return { ...i, proposed_slots: [{ start: ev.start_time, end: ev.end_time }] };
}

export default function PlansScreen() {
  const { activeGroup, groups } = useGroup();
  const visibleGroups = useVisibleGroups();
  const { user, profile } = useAuth();
  const { c } = useTheme();
  const { compact, threeColumn } = useLayout();
  const bottomClearance = useBottomClearance();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const composer = usePlanComposer();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const myName = (profile?.full_name ?? (isDemo ? DEMO_MEMBERS[0].full_name : null) ?? 'Someone').split(' ')[0];

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAllHappened, setShowAllHappened] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!activeGroup) return;
    if (isDemo) {
      setIdeas(DEMO_IDEAS.map(reconcileDemo));
      setMembers(DEMO_MEMBERS);
      setContacts(DEMO_CONTACTS);
      setLoading(false);
      return;
    }
    setLoading(true);

    // Ideas across ALL your groups so cross-group tags show up; then filter by
    // "either homed in this group, or audience-tagged into it".
    const [{ data: ideasData, error }, memberResults, contactsRes] = await Promise.all([
      supabase.from('ideas')
        .select('*, profiles(id, full_name, email), idea_votes(id, user_id)')
        .in('group_id', groups.map(g => g.id))
        .order('votes', { ascending: false }),
      groups.length === 0
        ? Promise.resolve([] as { members: Profile[] }[])
        : Promise.all(groups.map(g =>
            supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)').eq('group_id', g.id)
              .then(({ data }) => ({ members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[] })))),
      user
        ? supabase.from('contacts').select('*').eq('owner_id', user.id).order('name')
        : Promise.resolve({ data: [] as Contact[] } as any),
    ]);
    if (error) notify('Couldn’t load plans', error.message);
    else {
      setIdeas(((ideasData as Idea[]) ?? []).filter(i =>
        i.group_id === activeGroup.id || (i.audience_group_ids ?? []).includes(activeGroup.id)));
    }
    const uniq = new Map<string, Profile>();
    memberResults.forEach(({ members: ms }) => ms.forEach(p => uniq.set(p.id, p)));
    setMembers(Array.from(uniq.values()));
    setContacts(((contactsRes?.data ?? []) as Contact[]));
    setLoading(false);
  }, [activeGroup, groups, user, isDemo]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));
  useEffect(() => { fetchAll(); }, [composer.version]);

  // Arriving from Home or the calendar with a plan to open.
  useEffect(() => {
    const id = route.params?.ideaId;
    if (!id) return;
    setSelectedId(id);
    navigation.setParams({ ideaId: undefined });
  }, [route.params?.ideaId]);

  const memberById = useMemo(() => new Map(members.map(p => [p.id, p])), [members]);
  const contactById = useMemo(() => new Map(contacts.map(ct => [ct.id, ct])), [contacts]);
  const groupById = useMemo(() => new Map<string, Group>(visibleGroups.map(g => [g.id, g])), [visibleGroups]);
  const personOf = (id: string): AvatarPerson => memberById.get(id) ?? { id };

  const ideaGroupIds = (idea: Idea) => Array.from(new Set<string>([idea.group_id, ...(idea.audience_group_ids ?? [])]));

  function resolveAudience(idea: Idea): AvatarPerson[] {
    const users = (idea.audience_user_ids ?? []).map(id => memberById.get(id)).filter(Boolean) as AvatarPerson[];
    const cts = (idea.audience_contact_ids ?? [])
      .map(id => contactById.get(id)).filter(Boolean)
      .map(ct => ({ id: ct!.id, full_name: ct!.name, email: ct!.email ?? undefined })) as AvatarPerson[];
    return [...users, ...cts];
  }

  function audienceSummary(idea: Idea): string | null {
    const people = resolveAudience(idea);
    if (people.length === 0) return null;
    const first = people[0].full_name?.split(' ')[0] ?? 'someone';
    return people.length === 1 ? first : `${first} +${people.length - 1}`;
  }

  const hasVoted = (idea: Idea) => !!meId && (idea.idea_votes?.some(v => v.user_id === meId) ?? false);

  // ─── Actions ───────────────────────────────────────────────────────────────

  async function handleVote(idea: Idea) {
    if (!meId) return;
    const already = hasVoted(idea);
    if (isDemo) {
      updateDemoIdea(idea.id, {
        votes: idea.votes + (already ? -1 : 1),
        idea_votes: already
          ? (idea.idea_votes ?? []).filter(v => v.user_id !== meId)
          : [...(idea.idea_votes ?? []), { id: `${idea.id}-me`, idea_id: idea.id, user_id: meId, created_at: '' }],
      });
      return fetchAll();
    }
    if (already) {
      await supabase.from('idea_votes').delete().eq('idea_id', idea.id).eq('user_id', meId);
      await supabase.from('ideas').update({ votes: Math.max(0, idea.votes - 1) } as any).eq('id', idea.id);
    } else {
      await supabase.from('idea_votes').insert({ idea_id: idea.id, user_id: meId } as any);
      await supabase.from('ideas').update({ votes: idea.votes + 1 } as any).eq('id', idea.id);
    }
    fetchAll();
  }

  // "These dates work for me." Replaces only your own answer.
  async function handleSlotVotes(idea: Idea, starts: string[]) {
    if (!meId) return;
    const next = { ...(idea.slot_votes ?? {}), [meId]: starts };
    if (isDemo) { updateDemoIdea(idea.id, { slot_votes: next }); return fetchAll(); }
    const { error } = await supabase.rpc('set_slot_votes', { p_idea: idea.id, p_starts: starts } as any);
    if (error) return notify('Couldn’t save', error.message);
    // Last answer in: tell whoever proposed it which date wins.
    const updated = { ...idea, slot_votes: next };
    const everyone = awaitedVoters(updated);
    const wasWaiting = awaitedVoters(idea).some(id => !idea.slot_votes?.[id]);
    if (wasWaiting && everyone.every(id => next[id]) && idea.created_by && idea.created_by !== meId) {
      const top = tallySlots(updated, idea.proposed_slots ?? []).sort((a, b) => b.yes.length - a.yes.length)[0];
      await sendNotifications([{
        user_id: idea.created_by, actor_id: meId, kind: 'date_votes', idea_id: idea.id, event_id: null,
        title: `Everyone answered on ${idea.title}`,
        body: top?.yes.length === everyone.length ? `${slotLabel(top.slot)} works for everyone` : `${myName} was the last to answer`,
      }], false);
    }
    fetchAll();
  }

  async function handleDrop(idea: Idea) {
    if (!(await confirmAction(`Drop ${idea.title}?`, 'It comes off everyone’s Plans. Votes and comments on it go too.', 'Drop Idea', 'Keep It'))) return;
    if (isDemo) { removeDemoIdea(idea.id); setSelectedId(null); return fetchAll(); }
    const { error } = await supabase.from('ideas').delete().eq('id', idea.id);
    if (error) return notify('Couldn’t drop it', error.message);
    setSelectedId(null);
    fetchAll();
  }

  function openPlanner(idea: Idea, step: 'prefs' | 'options', slot?: Idea['proposed_slots'][number]) {
    if (!threeColumn) setSelectedId(null);
    setTimeout(() => composer.planIdea({ idea, step, slot }), threeColumn ? 0 : 450);
  }

  function openEvent(idea: Idea) {
    const booked = idea.proposed_slots?.[0];
    navigation.navigate('Calendar', { eventId: idea.event_id ?? undefined, date: booked ? keyOf(booked.start) : undefined });
  }

  // After it happened. On phones the plan is a sheet; close it first.
  const afterDetail = (fn: () => void) => {
    if (!threeColumn) setSelectedId(null);
    setTimeout(fn, threeColumn ? 0 : 450);
  };
  const peopleOn = (idea: Idea) => Array.from(new Set([...(idea.audience_user_ids ?? []), ...(idea.idea_votes ?? []).map(v => v.user_id)]))
    .filter(id => id !== meId);
  const doAgain = (idea: Idea) => afterDetail(() =>
    composer.newPlan({ title: idea.title, location: idea.location ?? undefined, notes: idea.description ?? undefined, people: peopleOn(idea) }));
  const samePeople = (idea: Idea) => afterDetail(() => composer.newPlan({ people: peopleOn(idea) }));
  const addMemories = (idea: Idea) => {
    const booked = idea.proposed_slots?.[0];
    if (!idea.event_id) return;
    afterDetail(() => composer.addMemories({
      eventId: idea.event_id!,
      title: idea.title,
      when: booked ? shortDate(keyOf(booked.start)) : 'Recently',
      recipients: [...peopleOn(idea), ...(meId ? [meId] : [])],
    }));
  };

  // ─── Sections ──────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    let list = ideas;
    if (audienceFilter.kind === 'group') list = list.filter(i => ideaGroupIds(i).includes(audienceFilter.id));
    else if (audienceFilter.kind === 'user') list = list.filter(i => i.audience_user_ids?.includes(audienceFilter.id));
    else if (audienceFilter.kind === 'contact') list = list.filter(i => i.audience_contact_ids?.includes(audienceFilter.id));
    return list;
  }, [ideas, audienceFilter]);

  const sections = useMemo(() => {
    const by: Record<Bucket, Idea[]> = { needsYou: [], dates: [], idea: [], on: [], happened: [] };
    filtered.forEach(i => {
      if (awaitingYourDates(i, meId) || readyToSend(i, meId)) by.needsYou.push(i);
      else by[stageOf(i)].push(i);
    });
    const when = (i: Idea) => i.proposed_slots?.[0]?.start ?? '';
    by.idea.sort((a, b) => b.votes - a.votes);
    by.on.sort((a, b) => when(a).localeCompare(when(b)));
    by.happened.sort((a, b) => when(b).localeCompare(when(a)));
    return BUCKETS
      .map(b => ({ key: b.key, title: b.title, total: by[b.key].length, data: b.key === 'happened' && !showAllHappened ? by[b.key].slice(0, HAPPENED_SHOWN) : by[b.key] }))
      .filter(s => s.data.length > 0);
  }, [filtered, meId, showAllHappened]);

  const flat = useMemo(() => sections.flatMap(s => s.data), [sections]);

  // Detail column: keep something selected when there's room to show it.
  // (Only on leaving that layout does compact drop the selection; clearing it
  // on every list change would close the open sheet after a vote.)
  // Skips the first render, so arriving with a plan to open still opens it.
  const layoutSeen = useRef(false);
  useEffect(() => {
    if (!layoutSeen.current) { layoutSeen.current = true; return; }
    if (!threeColumn) setSelectedId(null);
  }, [threeColumn]);
  useEffect(() => {
    if (threeColumn && !flat.some(i => i.id === selectedId)) setSelectedId(flat[0]?.id ?? null);
  }, [flat, threeColumn]);

  useShortcut('n', () => composer.newPlan());

  const selected = ideas.find(i => i.id === selectedId) ?? null;

  // ─── Filter menu ───────────────────────────────────────────────────────────
  const isActive = (f: AudienceFilter) =>
    f.kind === audienceFilter.kind && (f.kind === 'all' || (audienceFilter as any).id === (f as any).id);

  const filterSections: MenuSection[] = [
    { items: [{ key: 'all', label: 'Everyone', checked: audienceFilter.kind === 'all', onSelect: () => setAudienceFilter({ kind: 'all' }) }] },
    {
      title: 'Groups',
      items: visibleGroups.length > 1 ? visibleGroups.map(g => ({
        key: `g-${g.id}`, label: g.name, checked: isActive({ kind: 'group', id: g.id }),
        onSelect: () => setAudienceFilter({ kind: 'group', id: g.id }),
      })) : [],
    },
    {
      title: 'People',
      items: [
        ...members.filter(m => m.id !== meId).map(m => ({
          key: `u-${m.id}`, label: m.full_name ?? m.email, checked: isActive({ kind: 'user', id: m.id }),
          onSelect: () => setAudienceFilter({ kind: 'user', id: m.id }),
        })),
        ...contacts.map(ct => ({
          key: `c-${ct.id}`, label: ct.name, checked: isActive({ kind: 'contact', id: ct.id }),
          onSelect: () => setAudienceFilter({ kind: 'contact', id: ct.id }),
        })),
      ],
    },
  ];

  const audienceLabel =
    audienceFilter.kind === 'group' ? groupById.get(audienceFilter.id)?.name :
    audienceFilter.kind === 'user' ? (memberById.get(audienceFilter.id)?.full_name ?? 'someone') :
    audienceFilter.kind === 'contact' ? contactById.get(audienceFilter.id)?.name : null;

  // ─── Layout ────────────────────────────────────────────────────────────────
  const list = (
    <SectionList
      sections={sections}
      keyExtractor={i => i.id}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{ paddingBottom: bottomClearance }}
      ItemSeparatorComponent={() => <View style={{ height: space.s }} />}
      ListHeaderComponent={
        <View style={{ paddingBottom: space.s }}>
          <ScreenHeader
            title="Plans"
            eyebrow={activeGroup?.name}
            trailing={
              <>
                <Menu sections={filterSections} title="Show plans for">
                  {(open) => (
                    <IconButton
                      icon={audienceFilter.kind === 'all' ? 'filter-circle-outline' : 'filter-circle'}
                      label="Filter by who it’s for"
                      variant="gray"
                      onPress={open}
                    />
                  )}
                </Menu>
                {compact ? (
                  <GroupSwitcher>
                    {(open) => <IconButton icon="people-circle-outline" label={`Group: ${activeGroup?.name ?? 'none'}`} variant="gray" onPress={open} />}
                  </GroupSwitcher>
                ) : (
                  <IconButton icon="add" label="New Plan (⌘N)" variant="gray" onPress={() => composer.newPlan()} />
                )}
              </>
            }
          />
          {audienceLabel ? (
            <View style={{ marginHorizontal: compact ? space.m : space.l, backgroundColor: c.fill, borderRadius: 12, overflow: 'hidden' }}>
              <ListRow
                icon="filter"
                title={`For ${audienceLabel}`}
                trailing={<IconButton icon="close-circle" label="Clear filter" onPress={() => setAudienceFilter({ kind: 'all' })} />}
              />
            </View>
          ) : null}
        </View>
      }
      renderSectionHeader={({ section }) => (
        <View style={{ paddingHorizontal: space.m, paddingTop: space.m, paddingBottom: space.s }}>
          <Txt v="headline" accessibilityRole="header" tone={section.key === 'needsYou' ? 'tint' : 'primary'}>
            {section.title}<Txt v="callout" tone="secondary">{`  ${section.total}`}</Txt>
          </Txt>
        </View>
      )}
      renderItem={({ item }) => (
        <IdeaRow
          idea={item}
          voted={hasVoted(item)}
          meId={meId}
          audienceSummary={audienceSummary(item)}
          selected={threeColumn && item.id === selectedId}
          onVote={() => handleVote(item)}
          onPress={() => setSelectedId(item.id)}
        />
      )}
      renderSectionFooter={({ section }) => section.key === 'happened' && section.total > HAPPENED_SHOWN ? (
        <ListRow title={showAllHappened ? 'Show fewer' : `Show all ${section.total}`} tintTitle onPress={() => setShowAllHappened(x => !x)} />
      ) : null}
      ListEmptyComponent={
        loading ? <ActivityIndicator style={{ marginTop: space.xl }} color={c.secondaryLabel} /> : (
          <EmptyState
            icon="bulb-outline"
            illustration={ideas.length ? undefined : <Sheep size={88} pose="graze" style={{ marginBottom: space.m }} />}
            title={ideas.length ? 'No plans for them yet' : 'Nothing brewing yet'}
            body={ideas.length ? 'Try someone else, or make a plan with them.' : 'Float a plan and see who’s in.'}
            action={{ label: 'New Plan', onPress: () => composer.newPlan() }}
          />
        )
      }
    />
  );

  const detailFor = (idea: Idea) => {
    const stage = stageOf(idea);
    return (
      <IdeaDetail
        idea={idea}
        voted={hasVoted(idea)}
        voters={(idea.idea_votes ?? []).map(v => memberById.get(v.user_id)).filter(Boolean) as AvatarPerson[]}
        audience={resolveAudience(idea)}
        audienceGroupNames={ideaGroupIds(idea).map(id => groupById.get(id)?.name).filter((n): n is string => !!n)}
        meId={meId}
        onVote={() => handleVote(idea)}
        onPlan={() => openPlanner(idea, 'prefs')}
        onPickSlot={(slot) => openPlanner(idea, 'options', slot)}
        onSlotVotes={(starts) => handleSlotVotes(idea, starts)}
        personOf={personOf}
        onOpenEvent={idea.event_id ? () => openEvent(idea) : undefined}
        onDoAgain={() => doAgain(idea)}
        onSamePeople={() => samePeople(idea)}
        onAddMemories={idea.event_id ? () => addMemories(idea) : undefined}
        onDrop={idea.created_by === meId ? () => handleDrop(idea) : undefined}
        conversation={
          // Once it's booked, the conversation lives on the event.
          stage === 'idea' || stage === 'dates' ? (
            <CommentThread
              ideaId={idea.id}
              planTitle={idea.title}
              meId={meId}
              myName={myName}
              personOf={personOf}
              recipients={dateVoters(idea)}
              isDemo={isDemo}
            />
          ) : null
        }
      />
    );
  };

  const detail = selected ? (
    <ReadingColumn>{detailFor(selected)}</ReadingColumn>
  ) : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState icon="bulb-outline" title="No plan selected" />
    </View>
  );

  return (
    <>
      <SplitView list={list} detail={detail} />
      {!threeColumn && (
        <Sheet visible={!!selected} onClose={() => setSelectedId(null)} title="Plan" cancelLabel="Done">
          {selected ? detailFor(selected) : null}
        </Sheet>
      )}
      <PrimaryAction label="New Plan" onPress={() => composer.newPlan()} />
    </>
  );
}
