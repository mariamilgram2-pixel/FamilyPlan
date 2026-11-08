// Friends (the People route)
//
// Close friends up top as big faces, like pinned chats (tap + to add one,
// long-press a row to pin). Then your groups, friends you haven't seen in a
// while (each with a + to make plans), and all your friends: anyone waiting
// on you first, then anyone with a birthday or plan coming up. Each row's
// line is about your time together ("Together 2 weeks ago · Brunch", "Hike ·
// Sat"); what they're waiting on from you is a small Reply tag beside it.
// People not on Sheep yet sit last, under Invite to Sheep. Search covers it
// all. Creating things (group, person, join by code) is one "+" menu; group
// management (invite code, members, leave) lives in the group's detail.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, Share, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { notify, confirmAction } from '../../lib/alert';
import { firstNameOf, formatPhone, looksLikePhone, phoneMatches, samePhone } from '../../lib/phone';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { demoContacts, DEMO_EVENTS, DEMO_EXTRA_GROUPS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, DEMO_PEOPLE, isDemoGroup } from '../../lib/demo';
import { expandEvents } from '../../lib/recurrence';
import { useNotifications } from '../../lib/notifications';
import { NeedsYouItem, whatNeedsYou } from '../../lib/needsYou';
import { beenAWhile, daysUntilBirthday, friendLine, personStatus, sharedHistory } from '../../lib/personal';
import { usePlanComposer } from '../../components/PlanComposer';
import { useDismissed } from '../../lib/dismissed';
import { PinKind, pinKey, usePins } from '../../lib/pins';
import { useShortcut } from '../../lib/shortcuts';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { Contact, Event, Group, Idea, Profile } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { FlockCover, GroupFlock } from '../../components/GroupFlock';
import { useGroupSheets, useVisibleGroups } from '../../components/GroupSwitcher';
import { IdentityHeader, NotesSection, PersonDetail } from './PersonDetail';
import { Dotted, GroupCards, NeedsYouSection, PinnedGrid, PinTile } from './PeoplePieces';
import { keyOf, relativeDay, shortDate } from '../calendar/dates';
import { stageOf } from '../../lib/plans';
import ImportContactsSheet from './ImportContactsSheet';
import NewGroupSheet from './NewGroupSheet';
import AddFriendSheet from './AddFriendSheet';
import EditGroupSheet from './EditGroupSheet';
import { FoundPerson, findPeople, useFriends } from '../../lib/friends';
import WhoPicker, { useAudience } from '../ideas/WhoPicker';
import { addToGroup, isCalendar, removeFromGroup } from '../../lib/groups';
import { isPastGroup, lastUsedAt } from '../../lib/groupKinds';
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
const DEMO_CLOSE_FRIENDS = ['person:demo-ana', 'person:demo-chloe', 'person:demo-ben'];
const DAY = 86400000;

export default function PeopleScreen() {
  const { user, profile: myProfile } = useAuth();
  const myFirst = myProfile?.full_name?.split(' ')[0] ?? 'Someone';
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
  // Close friends: pinned up top. The demo starts with a few.
  const { pins, isPinned, toggle: togglePinRaw } = usePins(isDemo ? DEMO_CLOSE_FRIENDS : []);

  const [groupPeople, setPeople] = useState<PersonEntry[]>([]);
  // Friends on sheep: requests, and friends you don't share a group with.
  const friendsApi = useFriends(meId, isDemo, myFirst);
  const { friends, incoming, outgoing, statusWith, rowWith } = friendsApi;
  const [addingFriend, setAddingFriend] = useState(false);
  const people = useMemo(() => {
    const have = new Set(groupPeople.map(p => p.profile.id));
    const extra = friends.filter(f => !have.has(f.id)).map(f => ({ profile: f, groups: [] as { id: string; name: string }[] }));
    return extra.length ? [...groupPeople, ...extra].sort((a, b) =>
      (a.profile.full_name ?? a.profile.email ?? '').localeCompare(b.profile.full_name ?? b.profile.email ?? '')) : groupPeople;
  }, [groupPeople, friends]);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, Profile[]>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [query, setQuery] = useState('');
  const [planEvents, setPlanEvents] = useState<Event[]>([]);
  const [openIdeas, setOpenIdeas] = useState<Idea[]>([]);
  const [needsLoaded, setNeedsLoaded] = useState(false);   // until plans load, nothing counts as past

  // Person sheet (add / edit contact)
  const [personSheet, setPersonSheet] = useState<null | { editing: Contact | null }>(null);
  const [importing, setImporting] = useState(false);
  const [newGroup, setNewGroup] = useState(false);   // New Group: like starting a group chat
  const openNewGroup = () => setNewGroup(true);
  const [personName, setPersonName] = useState('');
  const [personPhone, setPersonPhone] = useState('');
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
      contactRows = demoContacts();
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

  // People you added who are on sheep (matched by number): offer Add Friend instead of an invite.
  const [contactOnSheep, setContactOnSheep] = useState<Map<string, FoundPerson>>(new Map());
  useEffect(() => {
    if (isDemo || !contacts.length) { setContactOnSheep(new Map()); return; }
    let cancelled = false;
    findPeople(contacts.map(ct => ct.phone)).then(found => {
      if (cancelled) return;
      const byKey = new Map(found.filter(f => f.phone_key).map(f => [f.phone_key!, f]));
      setContactOnSheep(new Map(contacts.flatMap(ct => {
        const d = (ct.phone ?? '').replace(/\D/g, '');
        const hit = d.length >= 7 ? byKey.get(d.slice(-10)) : undefined;
        return hit ? [[ct.id, hit] as [string, FoundPerson]] : [];
      })));
    });
    return () => { cancelled = true; };
  }, [contacts, isDemo]);

  // The last four months through the next two: what's open (for the dots)
  // and how long since you saw people (for their status). Refetched on
  // focus, since you answer things elsewhere and come back.
  const loadNeeds = useCallback(async () => {
    const from = new Date(Date.now() - 120 * DAY), to = new Date(Date.now() + 60 * DAY);
    if (isDemo) {
      setPlanEvents(expandEvents(DEMO_EVENTS, from, to));
      setOpenIdeas([...DEMO_IDEAS]);
      setNeedsLoaded(true);
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
    setNeedsLoaded(true);
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
    setPersonPhone(editing?.phone ? formatPhone(editing.phone) : '');
    setPersonEmail(editing?.email ?? '');
    setPersonNote(editing?.note ?? '');
    setPersonSheet({ editing });
  }

  // Name and phone number are needed; email is optional but has to look like one.
  const phoneOk = looksLikePhone(personPhone);
  const emailOk = !personEmail.trim() || /^\S+@\S+\.\S+$/.test(personEmail.trim());
  const personReady = !!personName.trim() && phoneOk && emailOk;

  async function savePerson() {
    if (!personReady) return;
    // One person per number: say who already has it rather than adding them twice.
    const twin = contacts.find(ct => ct.id !== personSheet?.editing?.id && samePhone(ct.phone, personPhone));
    if (twin) return notify('Already in your people', `${formatPhone(personPhone)} is ${twin.name}’s number.`);
    if (isDemo || !user) return notify('Demo mode', 'Sign in to save people.');
    setBusy(true);
    const payload = {
      owner_id: user.id,
      name: personName.trim(),
      phone: formatPhone(personPhone),
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
    const why = isCalendar(g) ? 'You’ll need a new invite code to rejoin.' : 'You won’t see its plans anymore, unless someone adds you back.';
    if (!(await confirmAction('Leave group', `Leave “${g.name}”? ${why}`, 'Leave'))) return;
    if (isDemo || !user) return notify('Demo mode', 'Sign in to manage groups.');
    const { error } = await supabase.from('group_members').delete().eq('group_id', g.id).eq('user_id', user.id);
    if (error) return notify('Couldn’t leave', error.message);
    setSelection(null);
    await fetchGroups();
  }

  useShortcut('n', () => openPersonSheet(null));

  // People not on sheep get the app and a code to join your active group.
  async function inviteToSheep(ct: Contact) {
    const first = firstNameOf(ct.name);
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

  // What you have with each friend: your plans together.
  const histories = useMemo(() => new Map(people.map(p => [p.profile.id, meId ? sharedHistory(planEvents, meId, p.profile.id) : null])), [people, planEvents, meId]);
  // Where things stand, for the order: anyone waiting on you first, then something soon.
  const statuses = useMemo(() => new Map(people.map(p => [p.profile.id, personStatus({
    needs: (needs.byPerson.get(p.profile.id) ?? []).map(i => i.label),
    history: histories.get(p.profile.id) ?? null,
    birthday: p.profile.birthday,
  })])), [people, needs, histories]);
  // Been a while: you've done things together, nothing's planned, a month or more. Longest first.
  // Clear someone (×) and they stay off it for a while; Home's nudge for them clears too.
  const { hidden, dismiss } = useDismissed();
  const quiet = useMemo(() => people
    .map(p => ({ p, days: beenAWhile(histories.get(p.profile.id) ?? null) }))
    .filter((x): x is { p: PersonEntry; days: number } => x.days !== null && !hidden(`quiet:${x.p.profile.id}`))
    .sort((a, b) => b.days - a.days), [people, histories, hidden]);
  const composer = usePlanComposer();

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
    : hit(e.name, handle(e.ct.email), e.ct.note) || phoneMatches(e.ct.phone, q)) : everyone;
  // Groups match by name, or by anyone in them (so past groups are easy to find).
  const groupMatches = q ? groups.filter(g => hit(g.name, g.description, ...(membersByGroup[g.id] ?? []).map(m => m.full_name))) : [];

  // Pinned ones move up top, out of the lists.
  const unpinned = matches.filter(e => !(e.kind === 'person' ? isPinned('person', e.p.profile.id) : isPinned('contact', e.ct.id)));
  const onSheep = unpinned.filter((e): e is Extract<Entry, { kind: 'person' }> => e.kind === 'person');
  const notOnSheep = unpinned.filter((e): e is Extract<Entry, { kind: 'contact' }> =>
    e.kind === 'contact' && !(contactOnSheep.get(e.ct.id) && statusWith(contactOnSheep.get(e.ct.id)!.id) === 'friends'));
  // Groups you haven't used lately step out of the way, into Past groups.
  const lastUsed = useMemo(() => new Map(groups.map(g => [g.id, lastUsedAt(g, planEvents, openIdeas)])), [groups, planEvents, openIdeas]);
  const pastGroups = !needsLoaded ? [] : groups.filter(g => g.id !== activeGroup?.id && !isPinned('group', g.id) && isPastGroup(g, lastUsed.get(g.id) ?? 0))
    .sort((a, b) => (lastUsed.get(b.id) ?? 0) - (lastUsed.get(a.id) ?? 0));
  const listedGroups = groups.filter(g => !isPinned('group', g.id) && !pastGroups.includes(g));
  const [pastOpen, setPastOpen] = useState(false);
  // Edit Group (top right of a group's page): anyone in a group, a shared calendar's admin.
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const canEdit = (g: Group) => isDemo || !isCalendar(g) || g.created_by === meId;

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
      return g ? tile(g.name, size => <GroupFlock group={g} count={(membersByGroup[g.id] ?? []).length} size={size} />) : [];
    }
    if (kind === 'person') {
      const p = people.find(x => x.profile.id === id)?.profile;
      const bday = p?.birthday && daysUntilBirthday(p.birthday) <= 14 ? `🎂 ${shortDay(p.birthday)}` : null;
      return p ? tile((p.full_name ?? p.email).split(' ')[0], size => <Avatar person={p} size={size} />, bday) : [];
    }
    const ct = contacts.find(x => x.id === id);
    return ct ? tile(firstNameOf(ct.name), size => <Avatar person={{ id: ct.id, full_name: ct.name, avatar_url: ct.avatar_url }} size={size} />) : [];
  });

  const addMenu = (
    <Menu
      title="Add"
      sections={[{ items: [
        { key: 'friend', label: 'Add Friend…', icon: 'person-add-outline', onSelect: () => setAddingFriend(true) },
        { key: 'person', label: 'Add Person…', icon: 'create-outline', onSelect: () => openPersonSheet(null) },
        { key: 'contacts', label: 'Add from Contacts…', icon: 'book-outline', onSelect: () => setImporting(true) },
        { key: 'group', label: 'New Group…', icon: 'people-outline', onSelect: openNewGroup },
        { key: 'calendar', label: 'New Shared Calendar…', icon: 'calendar-outline', onSelect: openCreate },
        { key: 'join', label: 'Join with Code…', icon: 'enter-outline', onSelect: openJoin },
      ] }]}
    >
      {(open) => <IconButton icon="add" label="Add" variant="gray" onPress={open} />}
    </Menu>
  );

  // ─── Rows ──────────────────────────────────────────────────────────────────
  const memberLine = (g: Group) => {
    const n = (membersByGroup[g.id] ?? []).length;
    return isCalendar(g) ? `Shared calendar · ${n}` : `${n} ${n === 1 ? 'person' : 'people'}`;
  };
  const groupRow = (g: Group) => pinMenu('group', g.id, g.name, open => (
    <ListRow
      leading={<Dotted on={needsOf('group', g.id).length > 0} size={32} ringColor={c.fill}><GroupFlock group={g} count={(membersByGroup[g.id] ?? []).length} size={32} /></Dotted>}
      title={g.name}
      subtitle={memberLine(g)}
      chevron={!threeColumn}
      selected={isSel('group', g.id)}
      onPress={() => setSelection({ kind: 'group', id: g.id })}
      onLongPress={open}
    />
  ));
  // Each friend: their name, and a friendly line about your time together.
  // What they're waiting on from you is a small tag, not the line.
  const personRow = (e: Extract<Entry, { kind: 'person' }>) => {
    const waiting = needsOf('person', e.p.profile.id);
    const line = friendLine({ history: histories.get(e.p.profile.id) ?? null, birthday: e.p.profile.birthday });
    return pinMenu('person', e.p.profile.id, e.name, open => (
      <ListRow
        leading={<Avatar person={e.p.profile} size={36} />}
        title={e.name}
        subtitle={line ?? e.p.groups.map(g => g.name).join(', ')}
        trailing={waiting.length ? <Tag label={waiting.length === 1 && waiting[0].short === 'Reply?' ? 'Reply' : 'Your turn'} tone="tint" /> : undefined}
        chevron={!threeColumn && !waiting.length}
        selected={isSel('person', e.p.profile.id)}
        onPress={() => setSelection({ kind: 'person', id: e.p.profile.id })}
        onLongPress={open}
      />
    ));
  };
  // Add Friend, or where a request stands.
  const friendButton = (userId: string, first: string) => {
    const status = statusWith(userId);
    if (status === 'sent') return <Txt v="footnote" tone="secondary">Requested</Txt>;
    if (status === 'received') {
      const f = rowWith(userId);
      return f ? <Button small label="Accept" onPress={() => friendsApi.accept(f)} /> : null;
    }
    if (status === 'friends') return <Txt v="footnote" tone="secondary">Friends</Txt>;
    return <Button small variant="gray" label="Add Friend" onPress={() => friendsApi.send(userId)} />;
  };

  const contactRow = (e: Extract<Entry, { kind: 'contact' }>, searching = false) => pinMenu('contact', e.ct.id, e.name, open => (
    <ListRow
      leading={<Avatar person={{ id: e.ct.id, full_name: e.ct.name, avatar_url: e.ct.avatar_url }} size={32} />}
      title={e.name}
      subtitle={contactOnSheep.has(e.ct.id) ? 'On sheep' : searching ? ['Not on sheep yet', e.ct.note].filter(Boolean).join(' · ') : e.ct.note}
      trailing={contactOnSheep.has(e.ct.id) ? friendButton(contactOnSheep.get(e.ct.id)!.id, firstNameOf(e.name))
        : <IconButton icon="paper-plane-outline" label={`Invite ${firstNameOf(e.name)} to sheep`} onPress={() => inviteToSheep(e.ct)} />}
      selected={isSel('contact', e.ct.id)}
      onPress={() => setSelection({ kind: 'contact', id: e.ct.id })}
      onLongPress={open}
    />
  ));

  const list = (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomClearance }} keyboardShouldPersistTaps="handled">
      <ScreenHeader title="Friends" trailing={addMenu} />
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
            {incoming.length ? (
              <ListSection header="Friend requests" separatorInset={64}>
                {incoming.map(r => {
                  const first = (r.person.full_name ?? r.person.email ?? 'them').split(' ')[0];
                  return (
                    <ListRow
                      key={r.friendship.id}
                      leading={<Avatar person={r.person} size={36} />}
                      title={r.person.full_name ?? r.person.email}
                      trailing={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
                          <Button small label="Accept" onPress={() => friendsApi.accept(r.friendship)} />
                          <IconButton icon="close" label={`Decline ${first}’s request`} onPress={() => friendsApi.end(r.friendship)} />
                        </View>
                      }
                    />
                  );
                })}
              </ListSection>
            ) : null}

            {people.length ? (
              <View>
                <SectionHeader title="Close friends" />
                <PinnedGrid
                  tiles={pinTiles}
                  addItems={people.filter(p => !isPinned('person', p.profile.id)).slice(0, 12).map(p => ({
                    key: p.profile.id, label: p.profile.full_name ?? p.profile.email ?? 'Someone',
                    leading: <Avatar person={p.profile} size={24} />, onSelect: () => togglePin('person', p.profile.id),
                  }))}
                />
              </View>
            ) : <PinnedGrid tiles={pinTiles} />}

            {groups.length === 0 ? (
              <ListSection header="Groups" footer="Like a group chat, for planning with the same friends: a party, a trip.">
                <ListRow title="New Group" icon="add-circle-outline" tintTitle onPress={openNewGroup} />
              </ListSection>
            ) : listedGroups.length || pastGroups.length ? (
              <View>
                <SectionHeader title="Groups" />
                <GroupCards
                  onNew={openNewGroup}
                  cards={listedGroups.map(g => ({
                    group: g,
                    members: membersByGroup[g.id] ?? [],
                    active: false,
                    subtitle: memberLine(g),
                    needs: needsOf('group', g.id).length > 0,
                    selected: !!isSel('group', g.id),
                    pinItem: { key: 'pin', label: 'Pin', icon: 'pin', onSelect: () => togglePin('group', g.id) },
                    onPress: () => setSelection({ kind: 'group', id: g.id }),
                  }))}
                />
                {pastGroups.length ? (
                  <View style={{ flexDirection: 'row', marginTop: space.hair }}>
                    <Button small variant="plain" icon="time-outline" label={`Past groups · ${pastGroups.length}`} onPress={() => setPastOpen(true)} />
                  </View>
                ) : null}
              </View>
            ) : null}

            {quiet.length ? (
              <ListSection header="Been a while" footer="Friends you haven’t seen in a month or more. × clears someone for now." separatorInset={64}>
                {quiet.slice(0, 3).map(({ p, days }) => {
                  const first = (p.profile.full_name ?? p.profile.email ?? 'them').split(' ')[0];
                  return (
                    <ListRow
                      key={`quiet-${p.profile.id}`}
                      leading={<Avatar person={p.profile} size={36} />}
                      title={p.profile.full_name ?? p.profile.email}
                      subtitle={`Last together ${days < 60 ? `${Math.floor(days / 7)} weeks` : `${Math.floor(days / 30)} months`} ago`}
                      trailing={
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair }}>
                          <IconButton icon="add" label={`Make plans with ${first}`} variant="filled" onPress={() => composer.newPlan({ people: [p.profile.id] })} />
                          <IconButton icon="close" label={`Clear ${first} from Been a while`} onPress={() => dismiss(`quiet:${p.profile.id}`)} />
                        </View>
                      }
                      onPress={() => setSelection({ kind: 'person', id: p.profile.id })}
                    />
                  );
                })}
              </ListSection>
            ) : null}

            <ListSection
              header="All friends"
              separatorInset={64}
              footer={everyone.length === 0 ? 'People in your groups show up here. Add anyone else you make plans with.' : undefined}
            >
              {onSheep.map(personRow)}
              {!onSheep.length && people.length ? (
                <ListRow key="none" title="Everyone’s pinned" subtitle="Unpin someone to see them here." />
              ) : null}
            </ListSection>

            <ListSection
              header="Invite to Sheep"
              separatorInset={64}
              footer={notOnSheep.length ? 'Plans are easier when they’re here too: they’ll see shared calendars and get invites in the app.' : undefined}
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
        allGroups={groups}
        onEdit={threeColumn && canEdit(selGroup) ? () => setEditingGroup(selGroup) : undefined}
        me={meId ? { id: meId, name: myFirst } : null}
        onChanged={async () => { await fetchGroups(); load(); }}
        onPlan={() => closeFirst(() => composer.newPlan({ groups: [selGroup.id] }))}
        events={planEvents.filter(e => e.group_id === selGroup.id || !!e.invited_group_ids?.includes(selGroup.id))}
        ideas={openIdeas.filter(i => i.group_id === selGroup.id || (i.audience_group_ids ?? []).includes(selGroup.id))}
        onOpenEvent={(e) => closeFirst(() => navigation.navigate('Calendar', { eventId: e.series_id ?? e.id, date: keyOf(e.start_time) }))}
        onOpenIdea={(i) => closeFirst(() => navigation.navigate('Plans', { ideaId: i.id }))}
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
        <IdentityHeader person={{ id: selContact.id, full_name: selContact.name, avatar_url: selContact.avatar_url }} title={selContact.name} subtitle={[selContact.phone ? formatPhone(selContact.phone) : null, selContact.email].filter(Boolean).join(' · ') || null} />
        {selContact.note ? (
          <ListSection header="Note"><View style={{ padding: space.m }}><Txt v="body">{selContact.note}</Txt></View></ListSection>
        ) : null}
        <ListSection footer={`${firstNameOf(selContact.name)} isn’t on sheep yet, so you can’t check their calendar or send them invites in the app.`}>
          <ListRow icon="paper-plane-outline" title="Invite to sheep" tintTitle onPress={() => inviteToSheep(selContact)} />
          {pinRow('contact', selContact.id, firstNameOf(selContact.name))}
        </ListSection>
        <NotesSection ownerId={meId} subject={{ kind: 'contact', id: selContact.id }} isDemo={isDemo} name={firstNameOf(selContact.name)} />
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
    const f = rowWith(selPerson.profile.id);
    const status = statusWith(selPerson.profile.id);
    const first = (selPerson.profile.full_name ?? 'them').split(' ')[0];
    detailBody = (
      <View style={{ gap: space.l }}>
        {detailBody}
        <ListSection>
          {status === 'friends' && f ? (
            <ListRow icon="person-remove-outline" title="Remove Friend" destructive onPress={async () => {
              if (await confirmAction('Remove friend', `Remove ${first} as a friend? Groups and plans you share stay.`, 'Remove')) friendsApi.end(f);
            }} />
          ) : status === 'received' && f ? (
            <ListRow icon="person-add-outline" title={`Accept ${first}’s Request`} tintTitle onPress={() => friendsApi.accept(f)} />
          ) : status === 'sent' ? (
            <ListRow icon="time-outline" title="Friend request sent" subtitle="Waiting on them" />
          ) : (
            <ListRow icon="person-add-outline" title="Add Friend" tintTitle onPress={() => friendsApi.send(selPerson.profile.id)} />
          )}
        </ListSection>
      </View>
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
      <EditGroupSheet
        visible={!!editingGroup}
        group={editingGroup}
        memberCount={editingGroup ? (membersByGroup[editingGroup.id] ?? []).length : 0}
        meId={meId}
        isDemo={isDemo}
        onClose={() => {
          const g = editingGroup;
          setEditingGroup(null);
          if (g && !threeColumn) setTimeout(() => setSelection({ kind: 'group', id: g.id }), 450);   // back to its page
        }}
        onSaved={async () => { await fetchGroups(); load(); }}
      />
      <PastGroupsSheet
        visible={pastOpen}
        groups={pastGroups}
        membersOf={(id) => (membersByGroup[id] ?? []).filter(m => m.id !== meId)}
        lastUsed={lastUsed}
        onClose={() => setPastOpen(false)}
        onOpen={(g) => { setPastOpen(false); setTimeout(() => setSelection({ kind: 'group', id: g.id }), threeColumn ? 0 : 450); }}
      />
      <AddFriendSheet
        visible={addingFriend}
        onClose={() => setAddingFriend(false)}
        statusWith={statusWith}
        outgoing={outgoing}
        onSend={friendsApi.send}
        onCancelRequest={friendsApi.end}
        isDemo={isDemo}
      />
      <NewGroupSheet
        visible={newGroup}
        groups={groups}
        isDemo={isDemo}
        onClose={() => setNewGroup(false)}
        onCreated={(g) => { load(); if (threeColumn) setSelection({ kind: 'group', id: g.id }); }}
      />
      <ImportContactsSheet visible={importing} onClose={() => setImporting(false)} demo={isDemo} onAdded={() => load()} />
      {!threeColumn && (
        <Sheet
          visible={!!detailBody}
          onClose={() => setSelection(null)}
          title={detailTitle}
          cancelLabel="Done"
          action={selGroup && canEdit(selGroup) ? { label: 'Edit', onPress: () => closeFirst(() => setEditingGroup(selGroup)) } : undefined}
        >
          {detailBody}
        </Sheet>
      )}
      <Sheet
        visible={!!personSheet}
        onClose={() => setPersonSheet(null)}
        title={personSheet?.editing ? 'Edit Person' : 'Add Person'}
        width={480}
        action={{ label: personSheet?.editing ? 'Save' : 'Add', onPress: savePerson, disabled: !personReady, loading: busy }}
      >
        <Field label="Name" value={personName} onChangeText={setPersonName} placeholder="Alex Kim" autoFocus />
        <Field
          label="Phone"
          value={personPhone}
          onChangeText={setPersonPhone}
          onBlur={() => { if (phoneOk) setPersonPhone(formatPhone(personPhone)); }}
          placeholder="(555) 123-4567"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          hint={personPhone.trim() && !phoneOk ? 'That doesn’t look like a phone number yet.' : undefined}
        />
        <Field
          label="Email"
          value={personEmail}
          onChangeText={setPersonEmail}
          placeholder="Optional"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect={false}
          hint={emailOk ? undefined : 'That doesn’t look like an email address.'}
        />
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

/**
 * A group's plans, start to finish: what's coming up, what's still being
 * planned, and what's happened (where its memories are). Each opens it.
 */
function GroupPlans({ group, events, ideas, onOpenEvent, onOpenIdea }: {
  group: Group; events: Event[]; ideas: Idea[]; onOpenEvent: (e: Event) => void; onOpenIdea: (i: Idea) => void;
}) {
  const now = Date.now();
  // One row per plan, even for one that repeats: its next time, or its last.
  const once = (list: Event[]) => {
    const seen = new Set<string>();
    return list.filter(e => { const k = e.series_id ?? e.id; if (seen.has(k)) return false; seen.add(k); return true; });
  };
  const live = events.filter(e => !e.cancelled_at);
  const coming = once(live.filter(e => new Date(e.end_time).getTime() >= now).sort((a, b) => a.start_time.localeCompare(b.start_time))).slice(0, 4);
  const past = once(live.filter(e => new Date(e.end_time).getTime() < now).sort((a, b) => b.start_time.localeCompare(a.start_time))).slice(0, 4);
  const planning = ideas.filter(i => i.status !== 'draft' && (stageOf(i) === 'idea' || stageOf(i) === 'dates'));

  const day = (iso: string) => relativeDay(keyOf(iso)) ?? shortDate(keyOf(iso));
  const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).replace(':00', '');

  if (!coming.length && !planning.length && !past.length) {
    return isCalendar(group) ? null : (
      <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>No plans yet. Make one and everyone in the group sees it here.</Txt>
    );
  }
  return (
    <>
      {coming.length ? (
        <ListSection header="Coming up" separatorInset={60}>
          {coming.map(e => (
            <ListRow key={e.id} icon="calendar-outline" title={e.title} subtitle={`${day(e.start_time)} · ${time(e.start_time)}`} chevron onPress={() => onOpenEvent(e)} />
          ))}
        </ListSection>
      ) : null}
      {planning.length ? (
        <ListSection header="Being planned" separatorInset={60}>
          {planning.map(i => (
            <ListRow
              key={i.id}
              icon={stageOf(i) === 'dates' ? 'time-outline' : 'bulb-outline'}
              title={i.title}
              subtitle={stageOf(i) === 'dates' ? ((i.proposed_slots ?? []).length ? 'Picking a date' : 'Finding a time') : 'An idea'}
              chevron
              onPress={() => onOpenIdea(i)}
            />
          ))}
        </ListSection>
      ) : null}
      {past.length ? (
        <ListSection header="Past" footer="Open one for its photos and notes, or to add yours." separatorInset={60}>
          {past.map(e => (
            <ListRow key={e.id} icon="images-outline" title={e.title} subtitle={day(e.start_time)} chevron onPress={() => onOpenEvent(e)} />
          ))}
        </ListSection>
      ) : null}
    </>
  );
}

/** Groups you haven't used lately: search by the group's name or anyone in it. */
function PastGroupsSheet({ visible, groups, membersOf, lastUsed, onClose, onOpen }: {
  visible: boolean; groups: Group[]; membersOf: (groupId: string) => Profile[]; lastUsed: Map<string, number>;
  onClose: () => void; onOpen: (g: Group) => void;
}) {
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) setQuery(''); }, [visible]);
  const q = query.trim().toLowerCase();
  const names = (g: Group) => membersOf(g.id).map(m => m.full_name ?? m.email ?? '').filter(Boolean);
  const shown = q ? groups.filter(g => [g.name, ...names(g)].some(n => n.toLowerCase().includes(q))) : groups;
  const when = (t?: number) => t ? new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: new Date(t).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }) : null;
  return (
    <Sheet visible={visible} onClose={onClose} title="Past groups" cancelLabel="Done" width={480}>
      <PeopleSearch value={query} onChange={setQuery} placeholder="Search by group or person" autoFocus />
      <ListSection
        separatorInset={64}
        footer={shown.length ? 'Groups you haven’t planned with in a while. Plan with one again and it’s back in Groups.' : `No past group matches “${query.trim()}”.`}
      >
        {shown.map(g => (
          <ListRow
            key={g.id}
            leading={<GroupFlock group={g} count={membersOf(g.id).length} size={36} />}
            title={g.name}
            subtitle={[when(lastUsed.get(g.id)) && `Last used ${when(lastUsed.get(g.id))}`, names(g).map(n => n.split(' ')[0]).slice(0, 4).join(', ')].filter(Boolean).join(' · ')}
            chevron
            onPress={() => onOpen(g)}
          />
        ))}
      </ListSection>
    </Sheet>
  );
}

function PeopleSearch({ value, onChange, placeholder = 'Search friends and groups', autoFocus }: { value: string; onChange: (v: string) => void; placeholder?: string; autoFocus?: boolean }) {
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
        placeholder={placeholder}
        placeholderTextColor={c.secondaryLabel}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        accessibilityLabel={placeholder}
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
  const { c } = useTheme();
  const ink = c.label;
  const soft = c.secondaryLabel;
  return (
    <FlockCover group={group} count={memberCount} style={{ minHeight: 184, padding: space.l, justifyContent: 'flex-end', gap: space.hair }}>
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
    </FlockCover>
  );
}

/**
 * A group's page. A shared calendar: its invite code, members, and Make
 * Active. A group (like a group chat): Make a Plan, and anyone in it can add
 * or remove people, rename it, or leave.
 */
function GroupDetail({ group, allGroups, onEdit, events, ideas, onOpenEvent, onOpenIdea, isActive, meId, me, fallbackMembers, isDemo, onMakeActive, onLeave, onChanged, onPlan, needs, pinRow }: {
  group: Group; allGroups: Group[]; onEdit?: () => void;
  events: Event[]; ideas: Idea[]; onOpenEvent: (e: Event) => void; onOpenIdea: (i: Idea) => void;
  isActive: boolean; meId: string | null; me?: { id: string; name: string } | null; fallbackMembers: Profile[]; isDemo: boolean;
  onMakeActive: () => void; onLeave: () => void; onChanged: () => Promise<void>; onPlan: () => void;
  needs: React.ReactNode; pinRow: React.ReactNode;
}) {
  const { c } = useTheme();
  const calendar = isCalendar(group);
  const [members, setMembers] = useState<(Profile & { role?: string })[]>(fallbackMembers);
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [version, setVersion] = useState(0);
  // Adding people: the same picker as a plan's, just people on sheep.
  const [adding, setAdding] = useState(false);
  const [toAdd, setToAdd] = useState<Set<string>>(new Set());
  const audience = useAudience(adding, allGroups);

  useEffect(() => {
    setShowAll(false);
    if (isDemo) { setMembers(fallbackMembers); return; }
    supabase.from('group_members').select('profiles(id, full_name, email, avatar_url), role').eq('group_id', group.id)
      .then(({ data }) => setMembers((data ?? []).map((r: any) => r.profiles && ({ ...r.profiles, role: r.role })).filter(Boolean)));
  }, [group.id, isDemo, version]);
  useEffect(() => { setAdding(false); }, [group.id]);

  const changed = async () => { setVersion(v => v + 1); await onChanged(); };
  const demoOnly = () => notify('Demo mode', 'Sign in to change groups.');

  async function addPeople() {
    setAdding(false);
    const ids = Array.from(toAdd).filter(id => !members.some(m => m.id === id));
    if (!ids.length) return;
    if (isDemo) return demoOnly();
    const error = await addToGroup(group.id, ids, me ? { id: me.id, name: me.name, groupName: group.name } : undefined);
    if (error) return notify('Couldn’t add them', error.message);
    await changed();
  }

  async function remove(m: Profile) {
    const first = (m.full_name ?? m.email ?? 'them').split(' ')[0];
    if (!(await confirmAction('Remove from group', `Remove ${first} from “${group.name}”? They won’t see its plans anymore.`, 'Remove'))) return;
    if (isDemo) return demoOnly();
    const error = await removeFromGroup(group.id, m.id);
    if (error) return notify('Couldn’t remove them', error.message);
    await changed();
  }



  async function copy() {
    await Clipboard.setStringAsync(group.invite_code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  const shown = showAll ? members : members.slice(0, CHUNK);

  return (
    <View style={{ gap: space.l }}>
      {onEdit ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginBottom: -space.s }}>
          <Button label="Edit" variant="plain" onPress={onEdit} />
        </View>
      ) : null}
      <GroupHero group={group} isActive={isActive} memberCount={members.length} />

      {needs}

      {!calendar ? <Button label="Make a Plan" icon="calendar-outline" onPress={onPlan} block /> : null}

      <GroupPlans group={group} events={events} ideas={ideas} onOpenEvent={onOpenEvent} onOpenIdea={onOpenIdea} />

      {!calendar ? (
        <ListSection header={`People · ${members.length}`} separatorInset={64}>
          {members.map(m => (
            <ListRow
              key={m.id}
              leading={<Avatar person={m} size={32} highlight={m.id === meId} />}
              title={m.id === meId ? `${m.full_name ?? m.email} (you)` : (m.full_name ?? m.email)}
              trailing={m.id !== meId ? (
                <IconButton icon="close" label={`Remove ${(m.full_name ?? m.email ?? 'them').split(' ')[0]}`} onPress={() => remove(m)} />
              ) : null}
            />
          ))}
          <ListRow icon="person-add-outline" title="Add People" tintTitle onPress={() => { setToAdd(new Set(members.map(m => m.id))); setAdding(true); }} />
        </ListSection>
      ) : null}


      <View style={{ backgroundColor: c.fill, borderRadius: radius.group, padding: space.m, gap: space.s, ...continuous }}>
        <Txt v="footnote" tone="secondary" style={eyebrow}>Invite code</Txt>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.m }}>
          <Txt v="title" selectable style={[tabularNums, { flex: 1, letterSpacing: 4 }]}>{group.invite_code}</Txt>
          <Button label={copied ? 'Copied' : 'Copy'} icon={copied ? 'checkmark' : 'copy-outline'} variant="plain" onPress={copy} />
        </View>
        <Txt v="footnote" tone="secondary">{calendar ? 'Share this code so others can join.' : 'Or share this code, for friends you can’t find above.'}</Txt>
      </View>

      {calendar ? <ListSection header={`Members · ${members.length}`} separatorInset={64}>
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
      </ListSection> : null}

      <ListSection footer={calendar ? undefined : 'Everyone in the group sees it and its plans, and anyone in it can add or remove people.'}>
        {calendar && !isActive && !isDemo ? <ListRow key="active" icon="checkmark-circle-outline" title="Make Active Group" tintTitle onPress={onMakeActive} /> : null}
        {pinRow}
        <ListRow key="leave" icon="exit-outline" title="Leave Group" destructive onPress={onLeave} />
      </ListSection>

      {/* Inside the page (a sheet on iPhone) so it shows on top of it. */}
      {!calendar ? (
        <WhoPicker
          visible={adding}
          title="Add People"
          usersOnly
          onDone={addPeople}
          onCancel={() => setAdding(false)}
          loading={audience.loading}
          groups={[]}
          people={audience.people}
          contacts={[]}
          groupIds={new Set()}
          userIds={toAdd}
          contactIds={new Set()}
          onToggle={(k, id) => {
            if (k !== 'user' || members.some(m => m.id === id)) return;   // take people out with × on the page
            const next = new Set(toAdd);
            if (next.has(id)) next.delete(id); else next.add(id);
            setToAdd(next);
          }}
          onAddPhone={audience.addContact}
        />
      ) : null}
    </View>
  );
}

