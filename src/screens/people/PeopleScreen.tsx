// People
//
// Groups, then People, then people who aren't on sheep yet. People is sorted
// by what's going on, not just A–Z: anyone waiting on you first, then anyone
// with a birthday or plan coming up, then everyone else. Each row's subtitle
// says where things stand ("Reply to Book club", "Hike · Sat", "Last together
// 6 weeks ago"). People not on sheep sit last and quieter, with a small
// invite button. Creating things (group, person, join by code) is one "+"
// menu. Group management (invite code, members, leave) lives in the group's detail.
//
// Like pinned conversations, people and groups you pin sit on top as big
// avatars (long-press a row, or Pin in its detail), and a green dot marks
// anyone with something waiting on you: an invite from them, dates they
// asked for, an unread note.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { notify, confirmAction } from '../../lib/alert';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { DEMO_CONTACTS, DEMO_EVENTS, DEMO_EXTRA_GROUPS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, DEMO_PEOPLE, isDemoGroup } from '../../lib/demo';
import { expandEvents } from '../../lib/recurrence';
import { useNotifications } from '../../lib/notifications';
import { NeedsYouItem, whatNeedsYou } from '../../lib/needsYou';
import { daysUntilBirthday, personStatus, sharedHistory } from '../../lib/personal';
import { PinKind, pinKey, usePins } from '../../lib/pins';
import { useShortcut } from '../../lib/shortcuts';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { Contact, Event, Group, Idea, Profile } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import GroupCover, { GroupCoverCircle, useCoverInk } from '../../components/GroupCover';
import { useGroupSheets, useVisibleGroups } from '../../components/GroupSwitcher';
import { IdentityHeader, NotesSection, PersonDetail } from './PersonDetail';
import { Dotted, GroupCards, NeedsYouSection, PinnedGrid, PinTile } from './PeoplePieces';
import { keyOf } from '../calendar/dates';
import {
  Button, EmptyState, Field, Icon, IconButton, ListRow, ListSection, Menu, ReadingColumn,
  ScreenHeader, SectionHeader, Sheet, SplitView, Tag, Txt, useBottomClearance,
} from '../../components/ui';
import { continuous, eyebrow, radius, space, tabularNums, type, useLayout, useTheme, brand } from '../../theme';

interface PersonEntry {
  profile: Profile;
  groups: { id: string; name: string }[];
}

type Selection =
  | { kind: 'group'; id: string }
  | { kind: 'contact'; id: string }
  | { kind: 'person'; id: string }
  | null;

const CHUNK = 5;
const DAY = 86400000;

export default function PeopleScreen() {
  const { user } = useAuth();
  const { activeGroup, setActiveGroup, fetchGroups } = useGroup();
  const visibleGroups = useVisibleGroups();
  const { c } = useTheme();
  const { threeColumn, compact } = useLayout();
  const bottomClearance = useBottomClearance();
  const isDemo = isDemoGroup(activeGroup);
  // The demo has other groups you're in (Book club, Climbing crew) besides the active one.
  const groups = useMemo(() => (isDemo
    ? [...visibleGroups, ...DEMO_EXTRA_GROUPS.filter(g => g.memberIds.includes(DEMO_ME)).map(g => g.group)]
    : visibleGroups), [visibleGroups, isDemo]);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const { openCreate, openJoin, sheets: groupSheets } = useGroupSheets();
  const navigation = useNavigation<any>();
  const inbox = useNotifications(meId, isDemo);
  const { pins, isPinned, toggle: togglePinRaw } = usePins();

  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, Profile[]>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState('');
  const [planEvents, setPlanEvents] = useState<Event[]>([]);
  const [openIdeas, setOpenIdeas] = useState<Idea[]>([]);

  // Person sheet (add / edit contact)
  const [personSheet, setPersonSheet] = useState<null | { editing: Contact | null }>(null);
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personNote, setPersonNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    type Row = { group: { id: string; name: string }; members: Profile[] };
    let results: Row[];
    let contactRows: Contact[];
    if (isDemo) {
      results = groups.map(g => ({
        group: g,
        members: g.id === activeGroup!.id ? DEMO_MEMBERS
          : DEMO_PEOPLE.filter(m => DEMO_EXTRA_GROUPS.find(x => x.group.id === g.id)?.memberIds.includes(m.id)),
      }));
      contactRows = DEMO_CONTACTS;
    } else {
    setLoading(true);

    const memberPromise = groups.length === 0
      ? Promise.resolve([] as { group: { id: string; name: string }; members: Profile[] }[])
      : Promise.all(
          groups.map(g =>
            supabase.from('group_members')
              .select('profiles(id, full_name, email, avatar_url, birthday, about, favorites)')
              .eq('group_id', g.id)
              .then(({ data }) => ({
                group: g,
                members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[],
              }))
          )
        );

    const contactsPromise = user
      ? supabase.from('contacts').select('*').eq('owner_id', user.id).order('name')
      : Promise.resolve({ data: [] as Contact[] } as any);

    const [memberRows, contactsRes] = await Promise.all([memberPromise, contactsPromise]);
    results = memberRows;
    contactRows = (contactsRes?.data ?? []) as Contact[];
    }

    const byGroup: Record<string, Profile[]> = {};
    const peopleMap = new Map<string, PersonEntry>();
    results.forEach(({ group, members }) => {
      byGroup[group.id] = members;
      members.forEach(p => {
        if (p.id === meId) return;
        const existing = peopleMap.get(p.id);
        if (existing) existing.groups.push({ id: group.id, name: group.name });
        else peopleMap.set(p.id, { profile: p, groups: [{ id: group.id, name: group.name }] });
      });
    });

    setMembersByGroup(byGroup);
    setPeople(Array.from(peopleMap.values()).sort((a, b) =>
      (a.profile.full_name ?? a.profile.email ?? '').localeCompare(b.profile.full_name ?? b.profile.email ?? '')));
    setContacts(contactRows);
    setLoading(false);
  }, [groups, user, isDemo, activeGroup, meId]);

  useEffect(() => { load(); }, [load]);

  // The last four months through the next two: what's open (for the dots)
  // and how long since you saw people (for their status). Refetched on
  // focus, since you answer things elsewhere and come back.
  const loadNeeds = useCallback(async () => {
    const from = new Date(Date.now() - 120 * DAY), to = new Date(Date.now() + 60 * DAY);
    if (isDemo) {
      setPlanEvents(expandEvents(DEMO_EVENTS, from, to));
      setOpenIdeas([...DEMO_IDEAS]);
      return;
    }
    if (!meId || !groups.length) return;
    const ids = groups.map(g => g.id).join(',');
    const [{ data: ev }, { data: id }] = await Promise.all([
      supabase.from('events').select('*').or(`group_id.in.(${ids}),attendees.cs.{${meId}}`).lt('start_time', to.toISOString()),
      supabase.from('ideas').select('*').eq('status', 'proposed'),   // RLS: yours, your groups', or shared with you
    ]);
    setPlanEvents(expandEvents((ev as Event[]) ?? [], from, to));
    setOpenIdeas((id as Idea[]) ?? []);
  }, [isDemo, meId, groups]);
  useFocusEffect(useCallback(() => { loadNeeds(); inbox.refresh(); }, [loadNeeds, inbox.refresh]));

  const needs = useMemo(() => whatNeedsYou(planEvents, openIdeas, inbox.items, meId), [planEvents, openIdeas, inbox.items, meId]);
  const needsOf = (kind: PinKind, id: string): NeedsYouItem[] =>
    kind === 'group' ? needs.byGroup.get(id) ?? [] : kind === 'person' ? needs.byPerson.get(id) ?? [] : [];

  function togglePin(kind: PinKind, id: string) {
    if (!togglePinRaw(kind, id)) notify('Pins are full', 'Unpin someone to make room.');
  }

  // Detail column defaults to the active group.
  useEffect(() => {
    if (!threeColumn) { setSelection(null); return; }
    if (!selection && activeGroup) setSelection({ kind: 'group', id: activeGroup.id });
  }, [threeColumn, activeGroup]);

  // ─── Person (contact) actions ─────────────────────────────────────────────
  function openPersonSheet(editing: Contact | null) {
    setPersonName(editing?.name ?? '');
    setPersonEmail(editing?.email ?? '');
    setPersonNote(editing?.note ?? '');
    setPersonSheet({ editing });
  }

  async function savePerson() {
    if (!personName.trim()) return;
    if (isDemo || !user) return notify('Demo mode', 'Sign in to save people.');
    setBusy(true);
    const payload = {
      owner_id: user.id,
      name: personName.trim(),
      email: personEmail.trim() || null,
      note: personNote.trim() || null,
    };
    const editingId = personSheet?.editing?.id;
    const { error } = editingId
      ? await supabase.from('contacts').update(payload as any).eq('id', editingId)
      : await supabase.from('contacts').insert(payload as any);
    setBusy(false);
    if (error) return notify('Couldn’t save', error.message);
    setPersonSheet(null);
    load();
  }

  async function removeContact(ct: Contact) {
    if (!(await confirmAction('Remove person', `Remove ${ct.name} from your people?`, 'Remove'))) return;
    if (isDemo) return notify('Demo mode', 'Sign in to manage people.');
    const { error } = await supabase.from('contacts').delete().eq('id', ct.id);
    if (error) return notify('Couldn’t remove', error.message);
    setSelection(null);
    load();
  }

  async function leaveGroup(g: Group) {
    if (!(await confirmAction('Leave group', `Leave “${g.name}”? You’ll need a new invite code to rejoin.`, 'Leave'))) return;
    if (isDemo || !user) return notify('Demo mode', 'Sign in to manage groups.');
    const { error } = await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', user.id);
    if (error) return notify('Couldn’t leave', error.message);
    setSelection(null);
    await fetchGroups();
  }

  useShortcut('n', () => openPersonSheet(null));

  // People not on sheep get the app and a code to join your active group.
  async function inviteToSheep(ct: Contact) {
    const first = ct.name.split(' ')[0];
    const code = activeGroup?.invite_code;
    const message = `Hi ${first}! I’m using sheep to make plans with friends and family. Join me${code ? ` — our group code is ${code}` : ''}.`;
    try {
      if (Platform.OS === 'web' && !(navigator as any).share) {
        await Clipboard.setStringAsync(message);
        notify('Invite copied', `Paste it in a text or email to ${first}.`);
        return;
      }
      await Share.share({ message });
    } catch {
      // Dismissed.
    }
  }

  // ─── List ──────────────────────────────────────────────────────────────────
  // Long-press any row to pin or unpin it.
  const pinMenu = (kind: PinKind, id: string, label: string, row: (onLongPress: () => void) => React.ReactNode) => (
    <Menu
      key={pinKey(kind, id)}
      title={label}
      sections={[{ items: [isPinned(kind, id)
        ? { key: 'unpin', label: 'Unpin', icon: 'pin-outline', onSelect: () => togglePin(kind, id) }
        : { key: 'pin', label: 'Pin', icon: 'pin', onSelect: () => togglePin(kind, id) }] }]}
    >
      {row}
    </Menu>
  );
  const isSel = (kind: string, id: string) => threeColumn && selection?.kind === kind && selection.id === id;

  // Where things stand with each person on sheep.
  const statuses = useMemo(() => new Map(people.map(p => [p.profile.id, personStatus({
    needs: (needs.byPerson.get(p.profile.id) ?? []).map(i => i.label),
    history: meId ? sharedHistory(planEvents, meId, p.profile.id) : null,
    birthday: p.profile.birthday,
  })])), [people, needs, planEvents, meId]);

  // People on sheep by what's going on; people you added, A–Z.
  type Entry = { kind: 'person'; p: PersonEntry; name: string } | { kind: 'contact'; ct: Contact; name: string };
  const byStatus = (a: Entry, b: Entry) => {
    const sa = a.kind === 'person' ? statuses.get(a.p.profile.id) : undefined;
    const sb = b.kind === 'person' ? statuses.get(b.p.profile.id) : undefined;
    return (sa?.rank ?? 2) - (sb?.rank ?? 2) || (sa?.rank === 1 ? sa.soon - (sb?.soon ?? 0) : 0) || a.name.localeCompare(b.name);
  };
  const everyone: Entry[] = [
    ...people.map(p => ({ kind: 'person' as const, p, name: p.profile.full_name ?? p.profile.email ?? '' })).sort(byStatus),
    ...contacts.map(ct => ({ kind: 'contact' as const, ct, name: ct.name })).sort((a, b) => a.name.localeCompare(b.name)),
  ];
  // Search covers groups, people, and people you added, matching name, the
  // email before the @ (so "co" doesn't hit every ".com"), notes, and shared
  // group names. While searching, pins and sections give way to one flat list.
  const q = query.trim().toLowerCase();
  const handle = (email?: string | null) => email?.split('@')[0];
  const hit = (...hay: (string | null | undefined)[]) => hay.some(h => h?.toLowerCase().includes(q));
  const matches = q ? everyone.filter(e => e.kind === 'person'
    ? hit(e.name, handle(e.p.profile.email), ...e.p.groups.map(g => g.name))
    : hit(e.name, handle(e.ct.email), e.ct.note)) : everyone;
  const groupMatches = q ? groups.filter(g => hit(g.name, g.description)) : [];

  // Pinned ones move up top, out of the lists.
  const unpinned = matches.filter(e => !(e.kind === 'person' ? isPinned('person', e.p.profile.id) : isPinned('contact', e.ct.id)));
  const onSheep = unpinned.filter((e): e is Extract<Entry, { kind: 'person' }> => e.kind === 'person');
  const notOnSheep = unpinned.filter((e): e is Extract<Entry, { kind: 'contact' }> => e.kind === 'contact');
  const listedGroups = groups.filter(g => !isPinned('group', g.id));

  const shortDay = (mmdd: string) => {
    const [m, d] = mmdd.split('-').map(Number);
    return new Date(2024, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };
  const pinTiles: PinTile[] = pins.flatMap((key): PinTile[] => {
    const [kind, id] = key.split(':') as [PinKind, string];
    const waiting = needsOf(kind, id);
    const tile = (label: string, avatar: PinTile['avatar'], fallback: string | null = null): PinTile[] => [{
      key, label, avatar, needs: waiting.length > 0,
      count: waiting.length,
      bubble: waiting.length > 1 ? null : waiting[0]?.short ?? fallback,
      onPress: () => setSelection({ kind, id }), onUnpin: () => togglePin(kind, id),
    }];
    if (kind === 'group') {
      const g = groups.find(x => x.id === id);
      return g ? tile(g.name, size => <GroupCoverCircle group={g} size={size} />) : [];
    }
    if (kind === 'person') {
      const p = people.find(x => x.profile.id === id)?.profile;
      const bday = p?.birthday && daysUntilBirthday(p.birthday) <= 14 ? `🎂 ${shortDay(p.birthday)}` : null;
      return p ? tile((p.full_name ?? p.email).split(' ')[0], size => <Avatar person={p} size={size} />, bday) : [];
    }
    const ct = contacts.find(x => x.id === id);
    return ct ? tile(ct.name.split(' ')[0], size => <Avatar person={{ id: ct.id, full_name: ct.name, avatar_url: ct.avatar_url }} size={size} />) : [];
  });

  const addMenu = (
    <Menu
      title="Add"
      sections={[{ items: [
        { key: 'person', label: 'Add Person…', icon: 'person-add-outline', onSelect: () => openPersonSheet(null) },
        { key: 'group', label: 'New Group…', icon: 'add-circle-outline', onSelect: openCreate },
        { key: 'join', label: 'Join with Code…', icon: 'enter-outline', onSelect: openJoin },
      ] }]}
    >
      {(open) => <IconButton icon="add" label="Add" variant="gray" onPress={open} />}
    </Menu>
  );

  // ─── Rows ──────────────────────────────────────────────────────────────────
  const memberLine = (g: Group) => {
    const n = (membersByGroup[g.id] ?? []).length;
    return `${n} member${n === 1 ? '' : 's'}${g.id === activeGroup?.id ? ' · Active' : ''}`;
  };
  const groupRow = (g: Group) => pinMenu('group', g.id, g.name, open => (
    <ListRow
      leading={<Dotted on={needsOf('group', g.id).length > 0} size={32} ringColor={c.fill}><GroupCover group={g} round blur={0} style={{ width: 32, height: 32 }} /></Dotted>}
      title={g.name}
      subtitle={memberLine(g)}
      chevron={!threeColumn}
      selected={isSel('group', g.id)}
      onPress={() => setSelection({ kind: 'group', id: g.id })}
      onLongPress={open}
    />
  ));
  const personRow = (e: Extract<Entry, { kind: 'person' }>) => {
    const status = statuses.get(e.p.profile.id);
    return pinMenu('person', e.p.profile.id, e.name, open => (
      <ListRow
        leading={<Dotted on={needsOf('person', e.p.profile.id).length > 0} size={32} ringColor={c.fill}><Avatar person={e.p.profile} size={32} /></Dotted>}
        title={e.name}
        subtitle={status?.text ?? e.p.groups.map(g => g.name).join(', ')}
        subtitleTint={status?.tint}
        chevron={!threeColumn}
        selected={isSel('person', e.p.profile.id)}
        onPress={() => setSelection({ kind: 'person', id: e.p.profile.id })}
        onLongPress={open}
      />
    ));
  };
  const contactRow = (e: Extract<Entry, { kind: 'contact' }>, searching = false) => pinMenu('contact', e.ct.id, e.name, open => (
    <ListRow
      leading={<Avatar person={{ id: e.ct.id, full_name: e.ct.name, avatar_url: e.ct.avatar_url }} size={32} />}
      title={e.name}
      subtitle={searching ? ['Not on sheep yet', e.ct.note].filter(Boolean).join(' · ') : e.ct.note}
      trailing={<IconButton icon="paper-plane-outline" label={`Invite ${e.name.split(' ')[0]} to sheep`} onPress={() => inviteToSheep(e.ct)} />}
      selected={isSel('contact', e.ct.id)}
      onPress={() => setSelection({ kind: 'contact', id: e.ct.id })}
      onLongPress={open}
    />
  ));

  const list = (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomClearance }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="People" trailing={addMenu} />
      <View style={{ paddingHorizontal: compact ? space.m : space.s, gap: space.l }}>
        {groups.length + everyone.length > 0 ? <PeopleSearch value={query} onChange={setQuery} /> : null}
        {loading && <ActivityIndicator color={c.secondaryLabel} />}

        {q ? (
          <ListSection
            separatorInset={64}
            footer={groupMatches.length + matches.length === 0 ? `Nothing matches “${query.trim()}”.` : undefined}
          >
            {groupMatches.map(groupRow)}
            {matches.map(e => (e.kind === 'person' ? personRow(e) : contactRow(e, true)))}
          </ListSection>
        ) : (
          <>
            <PinnedGrid tiles={pinTiles} />

            {groups.length === 0 ? (
              <ListSection header="Groups">
                <ListRow title="Create or join a group" icon="add-circle-outline" tintTitle onPress={openCreate} />
              </ListSection>
            ) : listedGroups.length ? (
              <View>
                <SectionHeader title="Groups" />
                <GroupCards
                  onNew={openCreate}
                  cards={listedGroups.map(g => ({
                    group: g,
                    members: membersByGroup[g.id] ?? [],
                    active: g.id === activeGroup?.id,
                    needs: needsOf('group', g.id).length > 0,
                    selected: !!isSel('group', g.id),
                    pinItem: { key: 'pin', label: 'Pin', icon: 'pin', onSelect: () => togglePin('group', g.id) },
                    onPress: () => setSelection({ kind: 'group', id: g.id }),
                  }))}
                />
              </View>
            ) : null}

            <ListSection
              header="People"
              separatorInset={64}
              footer={everyone.length === 0 ? 'People in your groups show up here. Add anyone else you make plans with.' : undefined}
            >
              {onSheep.map(personRow)}
              {!onSheep.length && people.length ? (
                <ListRow key="none" title="Everyone’s pinned" subtitle="Unpin someone to see them here." />
              ) : null}
            </ListSection>

            <ListSection
              header="Not on sheep yet"
              separatorInset={64}
              footer={notOnSheep.length ? 'Invite them to see shared calendars and get plan invites in the app.' : undefined}
            >
              {notOnSheep.map(e => contactRow(e))}
              <ListRow key="add" icon="person-add-outline" title="Add Person" tintTitle onPress={() => openPersonSheet(null)} />
            </ListSection>
          </>
        )}
      </View>
    </ScrollView>
  );

  // ─── Detail ────────────────────────────────────────────────────────────────
  const selGroup = selection?.kind === 'group' ? groups.find(g => g.id === selection.id) ?? null : null;
  const selContact = selection?.kind === 'contact' ? contacts.find(x => x.id === selection.id) ?? null : null;
  const selPerson = selection?.kind === 'person' ? people.find(x => x.profile.id === selection.id) ?? null : null;

  // On phones the detail is a sheet: let it close before going elsewhere.
  const closeFirst = (then: () => void) => {
    if (threeColumn) return then();
    setSelection(null);
    setTimeout(then, 450);
  };

  function openNeed(item: NeedsYouItem) {
    if (item.notificationId) inbox.markRead([item.notificationId]);
    closeFirst(() => {
      if (item.eventId) navigation.navigate('Calendar', { eventId: item.eventId, date: item.date ? keyOf(item.date) : undefined });
      else if (item.ideaId) navigation.navigate('Plans', { ideaId: item.ideaId });
    });
  }
  const pinRow = (kind: PinKind, id: string, name: string) => (
    <ListRow
      icon={isPinned(kind, id) ? 'pin' : 'pin-outline'}
      title={isPinned(kind, id) ? `Unpin ${name}` : `Pin ${name}`}
      tintTitle
      onPress={() => togglePin(kind, id)}
    />
  );

  let detailBody: React.ReactNode = null;
  let detailTitle = '';
  if (selGroup) {
    detailTitle = 'Group';
    detailBody = (
      <GroupDetail
        group={selGroup}
        isActive={selGroup.id === activeGroup?.id}
        meId={meId}
        fallbackMembers={membersByGroup[selGroup.id] ?? []}
        isDemo={isDemo}
        onMakeActive={() => setActiveGroup(selGroup)}
        onLeave={() => leaveGroup(selGroup)}
        needs={<NeedsYouSection items={needsOf('group', selGroup.id)} onOpen={openNeed} />}
        pinRow={pinRow('group', selGroup.id, selGroup.name)}
      />
    );
  } else if (selContact) {
    detailTitle = 'Person';
    detailBody = (
      <View style={{ gap: space.l }}>
        <IdentityHeader person={{ id: selContact.id, full_name: selContact.name, avatar_url: selContact.avatar_url }} title={selContact.name} subtitle={selContact.email} />
        {selContact.note ? (
          <ListSection header="Note"><View style={{ padding: space.m }}><Txt v="body">{selContact.note}</Txt></View></ListSection>
        ) : null}
        <ListSection footer={`${selContact.name.split(' ')[0]} isn’t on sheep yet, so you can’t check their calendar or send them invites in the app.`}>
          <ListRow icon="paper-plane-outline" title="Invite to sheep" tintTitle onPress={() => inviteToSheep(selContact)} />
          {pinRow('contact', selContact.id, selContact.name.split(' ')[0])}
        </ListSection>
        <NotesSection ownerId={meId} subject={{ kind: 'contact', id: selContact.id }} isDemo={isDemo} name={selContact.name.split(' ')[0]} />
        <ListSection>
          <ListRow icon="create-outline" title="Edit" tintTitle onPress={() => { if (!threeColumn) setSelection(null); openPersonSheet(selContact); }} />
          <ListRow icon="trash-outline" title="Remove Person" destructive onPress={() => removeContact(selContact)} />
        </ListSection>
      </View>
    );
  } else if (selPerson) {
    detailTitle = 'Person';
    detailBody = (
      <PersonDetail
        profile={selPerson.profile}
        groups={selPerson.groups}
        meId={meId}
        isDemo={isDemo}
        closeFirst={closeFirst}
        needs={<NeedsYouSection items={needsOf('person', selPerson.profile.id)} onOpen={openNeed} />}
        pinned={isPinned('person', selPerson.profile.id)}
        onTogglePin={() => togglePin('person', selPerson.profile.id)}
      />
    );
  }

  const detail = detailBody ? <ReadingColumn>{detailBody}</ReadingColumn> : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState icon="people-outline" title="Select a group or person" />
    </View>
  );

  return (
    <>
      <SplitView list={list} detail={detail} />
      {!threeColumn && (
        <Sheet visible={!!detailBody} onClose={() => setSelection(null)} title={detailTitle} cancelLabel="Done">
          {detailBody}
        </Sheet>
      )}
      <Sheet
        visible={!!personSheet}
        onClose={() => setPersonSheet(null)}
        title={personSheet?.editing ? 'Edit Person' : 'Add Person'}
        width={480}
        action={{ label: personSheet?.editing ? 'Save' : 'Add', onPress: savePerson, disabled: !personName.trim(), loading: busy }}
      >
        <Field label="Name" value={personName} onChangeText={setPersonName} placeholder="Alex Kim" autoFocus />
        <Field label="Email" value={personEmail} onChangeText={setPersonEmail} placeholder="Optional" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
        <Field
          label="Note"
          value={personNote}
          onChangeText={setPersonNote}
          placeholder="How you know them, hobbies…"
          multiline
          hint="People you add here show up when deciding who an idea is for."
        />
      </Sheet>
      {groupSheets}
    </>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function PeopleSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: space.s,
      height: 40, paddingHorizontal: space.m,
      backgroundColor: c.fill, borderRadius: radius.pill,
      borderWidth: 2, borderColor: focused ? c.tint : 'transparent',
      ...continuous,
    }}>
      <Icon name="search" size={15} color={c.secondaryLabel} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Search people and groups"
        placeholderTextColor={c.secondaryLabel}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel="Search people and groups"
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[
          type.callout,
          { flex: 1, minWidth: 0, color: c.label, paddingVertical: 0 },
          Platform.OS === 'web' && ({ outlineStyle: 'none' } as any),
        ]}
      />
      {value ? (
        <Pressable onPress={() => onChange('')} accessibilityLabel="Clear search" hitSlop={8}>
          <Icon name="close-circle" size={16} color={c.secondaryLabel} />
        </Pressable>
      ) : null}
    </View>
  );
}

/** The group's cover with its name, line, and member count set over it. */
function GroupHero({ group, isActive, memberCount }: { group: Group; isActive: boolean; memberCount: number }) {
  const { ink, soft } = useCoverInk(group);
  return (
    <GroupCover group={group} blur={4} style={{ minHeight: 184, padding: space.l, justifyContent: 'flex-end', gap: space.hair }}>
      {isActive ? (
        <View style={{ position: 'absolute', top: space.m, left: space.m }}>
          <View style={{ paddingHorizontal: space.s + 2, height: 26, justifyContent: 'center', borderRadius: radius.pill, backgroundColor: brand.coverChip }}>
            <Txt v="caption" style={{ color: brand.olive }}>Active group</Txt>
          </View>
        </View>
      ) : null}
      <Txt v="display" accessibilityRole="header" numberOfLines={2} style={{ color: ink }}>{group.name}</Txt>
      {group.description ? <Txt v="callout" style={{ color: soft }}>{group.description}</Txt> : null}
      <Txt v="footnote" style={{ color: soft, ...eyebrow }}>{`${memberCount} member${memberCount === 1 ? '' : 's'}`}</Txt>
    </GroupCover>
  );
}

function GroupDetail({ group, isActive, meId, fallbackMembers, isDemo, onMakeActive, onLeave, needs, pinRow }: {
  group: Group; isActive: boolean; meId: string | null; fallbackMembers: Profile[]; isDemo: boolean;
  onMakeActive: () => void; onLeave: () => void; needs: React.ReactNode; pinRow: React.ReactNode;
}) {
  const { c } = useTheme();
  const [members, setMembers] = useState<(Profile & { role?: string })[]>(fallbackMembers);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setShowAll(false);
    if (isDemo) { setMembers(fallbackMembers); return; }
    supabase.from('group_members').select('profiles(id, full_name, email, avatar_url), role').eq('group_id', group.id)
      .then(({ data }) => setMembers((data ?? []).map((r: any) => r.profiles && ({ ...r.profiles, role: r.role })).filter(Boolean)));
  }, [group.id, isDemo]);

  async function copy() {
    await Clipboard.setStringAsync(group.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const shown = showAll ? members : members.slice(0, CHUNK);

  return (
    <View style={{ gap: space.l }}>
      <GroupHero group={group} isActive={isActive} memberCount={members.length} />

      {needs}

      <View style={{ backgroundColor: c.fill, borderRadius: radius.group, padding: space.m, gap: space.s, ...continuous }}>
        <Txt v="footnote" tone="secondary" style={eyebrow}>Invite code</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Txt v="title" selectable style={[tabularNums, { flex: 1, letterSpacing: 4 }]}>{group.invite_code}</Txt>
          <Button label={copied ? 'Copied' : 'Copy'} icon={copied ? 'checkmark' : 'copy-outline'} variant="plain" onPress={copy} />
        </View>
        <Txt v="footnote" tone="secondary">Share this code so others can join.</Txt>
      </View>

      <ListSection header={`Members · ${members.length}`} separatorInset={64}>
        {shown.map(m => (
          <ListRow
            key={m.id}
            leading={<Avatar person={m} size={32} highlight={m.id === meId} />}
            title={m.id === meId ? `${m.full_name ?? m.email} (you)` : (m.full_name ?? m.email)}
            subtitle={m.full_name ? m.email : null}
            trailing={m.role === 'admin' ? <Tag label="Admin" /> : null}
          />
        ))}
        {members.length > CHUNK ? (
          <ListRow key="more" title={showAll ? 'Show fewer' : `Show all ${members.length}`} tintTitle onPress={() => setShowAll(x => !x)} />
        ) : null}
      </ListSection>

      <ListSection>
        {!isActive && !isDemo ? <ListRow key="active" icon="checkmark-circle-outline" title="Make Active Group" tintTitle onPress={onMakeActive} /> : null}
        {pinRow}
        <ListRow key="leave" icon="exit-outline" title="Leave Group" destructive onPress={onLeave} />
      </ListSection>
    </View>
  );
}

