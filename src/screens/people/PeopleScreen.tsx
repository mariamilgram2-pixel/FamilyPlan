// People
//
// Three chunks — Groups, Your people, People you plan with — each capped at
// five rows with an explicit "Show all". Creating things (group, person,
// join by code) is one "+" menu instead of three competing cards. Group
// management (invite code, members, leave) lives in the group's detail.

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { supabase } from '../../lib/supabase';
import { notify, confirmAction } from '../../lib/alert';
import { DEMO_CONTACTS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { Contact, Group, Profile } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { useGroupSheets, useVisibleGroups } from '../../components/GroupSwitcher';
import {
  Button, EmptyState, Field, IconButton, ListRow, ListSection, Menu, ReadingColumn,
  ScreenHeader, Sheet, SplitView, Tag, Txt, useBottomClearance,
} from '../../components/ui';
import { continuous, radius, space, tabularNums, useLayout, useTheme } from '../../theme';

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

export default function PeopleScreen() {
  const { user } = useAuth();
  const { activeGroup, setActiveGroup, fetchGroups } = useGroup();
  const groups = useVisibleGroups();
  const { c } = useTheme();
  const { threeColumn, compact } = useLayout();
  const bottomClearance = useBottomClearance();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);
  const { openCreate, openJoin, sheets: groupSheets } = useGroupSheets();

  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, Profile[]>>({});
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  // Person sheet (add / edit contact)
  const [personSheet, setPersonSheet] = useState<null | { editing: Contact | null }>(null);
  const [personName, setPersonName] = useState('');
  const [personEmail, setPersonEmail] = useState('');
  const [personNote, setPersonNote] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (isDemo) {
      const others = DEMO_MEMBERS.filter(m => m.id !== DEMO_ME);
      setMembersByGroup({ [activeGroup!.id]: DEMO_MEMBERS });
      setPeople(others.map(p => ({ profile: p, groups: [{ id: activeGroup!.id, name: activeGroup!.name }] })));
      setContacts(DEMO_CONTACTS);
      return;
    }
    setLoading(true);

    const memberPromise = groups.length === 0
      ? Promise.resolve([] as { group: { id: string; name: string }; members: Profile[] }[])
      : Promise.all(
          groups.map(g =>
            supabase.from('group_members')
              .select('profiles(id, full_name, email, avatar_url)')
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

    const [results, contactsRes] = await Promise.all([memberPromise, contactsPromise]);

    const byGroup: Record<string, Profile[]> = {};
    const peopleMap = new Map<string, PersonEntry>();
    results.forEach(({ group, members }) => {
      byGroup[group.id] = members;
      members.forEach(p => {
        if (p.id === user?.id) return;
        const existing = peopleMap.get(p.id);
        if (existing) existing.groups.push({ id: group.id, name: group.name });
        else peopleMap.set(p.id, { profile: p, groups: [{ id: group.id, name: group.name }] });
      });
    });

    setMembersByGroup(byGroup);
    setPeople(Array.from(peopleMap.values()).sort((a, b) =>
      (a.profile.full_name ?? a.profile.email ?? '').localeCompare(b.profile.full_name ?? b.profile.email ?? '')));
    setContacts((contactsRes?.data ?? []) as Contact[]);
    setLoading(false);
  }, [groups, user, isDemo, activeGroup]);

  useEffect(() => { load(); }, [load]);

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

  // ─── List ──────────────────────────────────────────────────────────────────
  const isSel = (kind: string, id: string) => threeColumn && selection?.kind === kind && selection.id === id;
  const shownPeople = showAllPeople ? people : people.slice(0, CHUNK);
  const shownContacts = showAllContacts ? contacts : contacts.slice(0, CHUNK);

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

  const list = (
    <ScrollView contentContainerStyle={{ paddingBottom: bottomClearance }}>
      <ScreenHeader title="People" trailing={addMenu} />
      <View style={{ paddingHorizontal: compact ? space.m : space.s, gap: space.l, paddingTop: space.s }}>
        {loading && <ActivityIndicator color={c.secondaryLabel} />}

        <ListSection header="Groups">
          {groups.map(g => {
            const members = membersByGroup[g.id] ?? [];
            const active = g.id === activeGroup?.id;
            return (
              <ListRow
                key={g.id}
                title={g.name}
                subtitle={`${members.length} member${members.length === 1 ? '' : 's'}${active ? ' · Active' : ''}`}
                trailing={members.length > 0 ? <AvatarStack people={members as AvatarPerson[]} max={3} size={24} ringColor={c.fill} /> : null}
                chevron={!threeColumn}
                selected={isSel('group', g.id)}
                onPress={() => setSelection({ kind: 'group', id: g.id })}
              />
            );
          })}
          {groups.length === 0 ? (
            <ListRow key="none" title="Create or join a group" icon="add-circle-outline" tintTitle onPress={openCreate} />
          ) : null}
        </ListSection>

        <ListSection header="Your people" separatorInset={64} footer={contacts.length === 0 ? 'People you add show up when you’re deciding who an idea is for.' : undefined}>
          {shownContacts.map(ct => (
            <ListRow
              key={ct.id}
              leading={<Avatar person={{ id: ct.id, full_name: ct.name }} size={32} />}
              title={ct.name}
              subtitle={ct.email ?? ct.note}
              chevron={!threeColumn}
              selected={isSel('contact', ct.id)}
              onPress={() => setSelection({ kind: 'contact', id: ct.id })}
            />
          ))}
          {contacts.length > CHUNK ? (
            <ListRow key="more" title={showAllContacts ? 'Show fewer' : `Show all ${contacts.length}`} tintTitle onPress={() => setShowAllContacts(x => !x)} />
          ) : null}
          <ListRow key="add" icon="person-add-outline" title="Add Person" tintTitle onPress={() => openPersonSheet(null)} />
        </ListSection>

        {people.length > 0 && (
          <ListSection header="People you plan with" separatorInset={64}>
            {shownPeople.map(p => (
              <ListRow
                key={p.profile.id}
                leading={<Avatar person={p.profile} size={32} />}
                title={p.profile.full_name ?? p.profile.email}
                subtitle={p.groups.map(g => g.name).join(', ')}
                chevron={!threeColumn}
                selected={isSel('person', p.profile.id)}
                onPress={() => setSelection({ kind: 'person', id: p.profile.id })}
              />
            ))}
            {people.length > CHUNK ? (
              <ListRow key="more" title={showAllPeople ? 'Show fewer' : `Show all ${people.length}`} tintTitle onPress={() => setShowAllPeople(x => !x)} />
            ) : null}
          </ListSection>
        )}
      </View>
    </ScrollView>
  );

  // ─── Detail ────────────────────────────────────────────────────────────────
  const selGroup = selection?.kind === 'group' ? groups.find(g => g.id === selection.id) ?? null : null;
  const selContact = selection?.kind === 'contact' ? contacts.find(x => x.id === selection.id) ?? null : null;
  const selPerson = selection?.kind === 'person' ? people.find(x => x.profile.id === selection.id) ?? null : null;

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
      />
    );
  } else if (selContact) {
    detailTitle = 'Person';
    detailBody = (
      <View style={{ gap: space.l }}>
        <IdentityHeader person={{ id: selContact.id, full_name: selContact.name }} title={selContact.name} subtitle={selContact.email} />
        {selContact.note ? (
          <ListSection header="Note"><View style={{ padding: space.m }}><Txt v="body">{selContact.note}</Txt></View></ListSection>
        ) : null}
        <ListSection>
          <ListRow icon="create-outline" title="Edit" tintTitle onPress={() => { if (!threeColumn) setSelection(null); openPersonSheet(selContact); }} />
          <ListRow icon="trash-outline" title="Remove from Your People" destructive onPress={() => removeContact(selContact)} />
        </ListSection>
      </View>
    );
  } else if (selPerson) {
    detailTitle = 'Person';
    detailBody = (
      <View style={{ gap: space.l }}>
        <IdentityHeader person={selPerson.profile} title={selPerson.profile.full_name ?? selPerson.profile.email} subtitle={selPerson.profile.full_name ? selPerson.profile.email : null} />
        <ListSection header="Shared groups">
          {selPerson.groups.map(g => <ListRow key={g.id} title={g.name} />)}
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

function IdentityHeader({ person, title, subtitle }: { person: AvatarPerson; title: string; subtitle?: string | null }) {
  return (
    <View style={{ alignItems: 'center', gap: space.s, paddingVertical: space.m }}>
      <Avatar person={person} size={80} />
      <Txt v="title" align="center">{title}</Txt>
      {subtitle ? <Txt v="callout" tone="secondary" align="center">{subtitle}</Txt> : null}
    </View>
  );
}

function GroupDetail({ group, isActive, meId, fallbackMembers, isDemo, onMakeActive, onLeave }: {
  group: Group; isActive: boolean; meId: string | null; fallbackMembers: Profile[]; isDemo: boolean;
  onMakeActive: () => void; onLeave: () => void;
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
      <View style={{ gap: space.s }}>
        <Txt v="title" accessibilityRole="header">{group.name}</Txt>
        {group.description ? <Txt v="callout" tone="secondary">{group.description}</Txt> : null}
        {isActive ? <View style={{ flexDirection: 'row' }}><Tag label="Active group" tone="tint" /></View> : null}
      </View>

      <View style={{ backgroundColor: c.fill, borderRadius: radius.group, padding: space.m, gap: space.s, ...continuous }}>
        <Txt v="footnote" tone="secondary" semibold style={{ textTransform: 'uppercase', letterSpacing: 0.4 }}>Invite code</Txt>
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
        {!isActive ? <ListRow key="active" icon="checkmark-circle-outline" title="Make Active Group" tintTitle onPress={onMakeActive} /> : null}
        <ListRow key="leave" icon="exit-outline" title="Leave Group" destructive onPress={onLeave} />
      </ListSection>
    </View>
  );
}

