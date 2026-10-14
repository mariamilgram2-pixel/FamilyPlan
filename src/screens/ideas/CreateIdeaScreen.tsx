// New Idea sheet.
// The audience picker is chunked into Groups / People / Your people, and long
// lists show five at a time with an explicit "Show all" to keep each chunk
// scannable.

import React, { useEffect, useMemo, useState } from 'react';
import { notify } from '../../lib/alert';
import { ActivityIndicator, View } from 'react-native';
import { supabase } from '../../lib/supabase';
import { DEMO_CONTACTS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { Idea, Profile, Contact } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import Avatar from '../../components/Avatar';
import { Field, ListRow, ListSection, SectionHeader, Segmented, Sheet, Txt } from '../../components/ui';
import { space, useTheme } from '../../theme';
import { STATUS_OPTIONS } from './IdeaViews';

interface PersonInGroup {
  profile: Profile;
  groupIds: string[];
  groupNames: string[];
}

const CHUNK = 5;

interface Props {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export default function CreateIdeaSheet({ visible, onClose, onSaved }: Props) {
  const { activeGroup, groups, fetchGroups } = useGroup();
  const { user } = useAuth();
  const { c } = useTheme();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);

  // Fall back to activeGroup if the groups list came back empty (stale fetch).
  const effectiveGroups = useMemo(() => {
    if (groups.length > 0) return groups;
    if (activeGroup) return [activeGroup];
    return [];
  }, [groups, activeGroup]);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Idea['status']>('proposed');
  const [selectedGroupIds, setSelectedGroupIds] = useState<Set<string>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [selectedContactIds, setSelectedContactIds] = useState<Set<string>>(new Set());
  const [showAllPeople, setShowAllPeople] = useState(false);
  const [showAllContacts, setShowAllContacts] = useState(false);

  const [people, setPeople] = useState<PersonInGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingPeople, setLoadingPeople] = useState(false);

  // Reset + refetch groups each time the sheet opens so we never render
  // against a stale/empty list from an earlier failed fetch.
  useEffect(() => {
    if (!visible) return;
    setTitle(''); setDescription(''); setStatus('proposed');
    setSelectedGroupIds(new Set()); setSelectedUserIds(new Set()); setSelectedContactIds(new Set());
    setShowAllPeople(false); setShowAllContacts(false);
    if (!isDemo) fetchGroups();
  }, [visible]);

  // Load members across ALL your groups + contacts.
  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    async function load() {
      if (isDemo) {
        setPeople(DEMO_MEMBERS.filter(m => m.id !== DEMO_ME).map(p => ({ profile: p, groupIds: ['demo'], groupNames: [activeGroup?.name ?? ''] })));
        setContacts(DEMO_CONTACTS);
        return;
      }
      if (!user) return;
      setLoadingPeople(true);
      const [memberResults, contactsRes] = await Promise.all([
        effectiveGroups.length === 0
          ? Promise.resolve([] as { group: { id: string; name: string }; members: Profile[] }[])
          : Promise.all(
              effectiveGroups.map(g =>
                supabase.from('group_members')
                  .select('profiles(id, full_name, email, avatar_url)')
                  .eq('group_id', g.id)
                  .then(({ data }) => ({
                    group: g,
                    members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[],
                  }))
              )
            ),
        supabase.from('contacts').select('*').eq('owner_id', user.id).order('name'),
      ]);
      if (cancelled) return;

      const map = new Map<string, PersonInGroup>();
      memberResults.forEach(({ group, members }) => {
        members.forEach(p => {
          if (p.id === user.id) return;
          const existing = map.get(p.id);
          if (existing) {
            if (!existing.groupIds.includes(group.id)) {
              existing.groupIds.push(group.id);
              existing.groupNames.push(group.name);
            }
          } else {
            map.set(p.id, { profile: p, groupIds: [group.id], groupNames: [group.name] });
          }
        });
      });

      setPeople(Array.from(map.values()).sort((a, b) => {
        const an = a.profile.full_name ?? a.profile.email ?? '';
        const bn = b.profile.full_name ?? b.profile.email ?? '';
        return an.localeCompare(bn);
      }));
      setContacts((contactsRes?.data ?? []) as Contact[]);
      setLoadingPeople(false);
    }
    load();
    return () => { cancelled = true; };
  }, [visible, effectiveGroups, user, isDemo]);

  function toggle(set: Set<string>, id: string, setter: (s: Set<string>) => void) {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setter(next);
  }

  // Storage group: pick a home for the idea (needed for RLS).
  // Prefer the first selected group; else the active group.
  const storageGroupId = useMemo(() => {
    if (selectedGroupIds.size > 0) {
      for (const g of effectiveGroups) if (selectedGroupIds.has(g.id)) return g.id;
    }
    return activeGroup?.id ?? effectiveGroups[0]?.id ?? null;
  }, [selectedGroupIds, activeGroup, effectiveGroups]);

  async function handleSave() {
    if (!title.trim()) return;
    if (isDemo) return notify('Demo mode', 'Sign in to share ideas with your group.');
    if (!storageGroupId || !meId) {
      notify('Pick a group', 'Ideas need to belong to at least one group. Create or join one first.');
      return;
    }

    // Additional groups tagged as audience beyond the storage/home group.
    const extraGroupIds = Array.from(selectedGroupIds).filter(id => id !== storageGroupId);

    setSaving(true);
    const { error } = await supabase.from('ideas').insert({
      group_id: storageGroupId,
      title: title.trim(),
      description: description.trim() || null,
      status,
      audience_group_ids: extraGroupIds,
      audience_user_ids: Array.from(selectedUserIds),
      audience_contact_ids: Array.from(selectedContactIds),
      created_by: meId,
    } as any);
    setSaving(false);

    if (error) return notify('Couldn’t save', error.message);
    onSaved();
    onClose();
  }

  const audienceCount = selectedGroupIds.size + selectedUserIds.size + selectedContactIds.size;
  const shownPeople = showAllPeople ? people : people.slice(0, CHUNK);
  const shownContacts = showAllContacts ? contacts : contacts.slice(0, CHUNK);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New Idea"
      action={{ label: 'Add', onPress: handleSave, disabled: !title.trim(), loading: saving }}
    >
      <Field value={title} onChangeText={setTitle} placeholder="Weekend camping trip, theme dinner…" autoFocus accessibilityLabel="Title" />
      <Field value={description} onChangeText={setDescription} placeholder="Details (optional)" multiline accessibilityLabel="Details" />

      <Txt v="headline" style={{ paddingHorizontal: space.m, marginBottom: -space.s }}>
        Who’s it for?{audienceCount > 0 ? <Txt v="callout" tone="secondary">{`  ${audienceCount} selected`}</Txt> : null}
      </Txt>

      {effectiveGroups.length > 0 && (
        <ListSection
          header="Groups"
          footer={selectedGroupIds.size === 0 ? `Nothing picked — it’ll go to ${activeGroup?.name ?? 'your active group'}.` : undefined}
        >
          {effectiveGroups.map(g => (
            <ListRow
              key={g.id}
              title={g.name}
              checked={selectedGroupIds.has(g.id)}
              onPress={() => toggle(selectedGroupIds, g.id, setSelectedGroupIds)}
            />
          ))}
        </ListSection>
      )}

      {loadingPeople ? (
        <ActivityIndicator color={c.secondaryLabel} />
      ) : (
        <>
          {people.length > 0 && (
            <ListSection header="People from your groups" separatorInset={64}>
              {shownPeople.map(p => (
                <ListRow
                  key={`u-${p.profile.id}`}
                  leading={<Avatar person={p.profile} size={32} />}
                  title={p.profile.full_name ?? p.profile.email}
                  subtitle={p.groupNames.join(', ')}
                  checked={selectedUserIds.has(p.profile.id)}
                  onPress={() => toggle(selectedUserIds, p.profile.id, setSelectedUserIds)}
                />
              ))}
              {people.length > CHUNK && (
                <ListRow
                  key="more-people"
                  title={showAllPeople ? 'Show fewer' : `Show all ${people.length}`}
                  tintTitle
                  onPress={() => setShowAllPeople(x => !x)}
                />
              )}
            </ListSection>
          )}

          {contacts.length > 0 && (
            <ListSection header="Your people" separatorInset={64}>
              {shownContacts.map(ct => (
                <ListRow
                  key={`c-${ct.id}`}
                  leading={<Avatar person={{ id: ct.id, full_name: ct.name }} size={32} />}
                  title={ct.name}
                  checked={selectedContactIds.has(ct.id)}
                  onPress={() => toggle(selectedContactIds, ct.id, setSelectedContactIds)}
                />
              ))}
              {contacts.length > CHUNK && (
                <ListRow
                  key="more-contacts"
                  title={showAllContacts ? 'Show fewer' : `Show all ${contacts.length}`}
                  tintTitle
                  onPress={() => setShowAllContacts(x => !x)}
                />
              )}
            </ListSection>
          )}

          {effectiveGroups.length === 0 && people.length === 0 && contacts.length === 0 && (
            <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
              You’re not in any groups and haven’t added anyone yet. Head to People first.
            </Txt>
          )}
        </>
      )}

      <View>
        <SectionHeader title="Status" />
        <Segmented options={STATUS_OPTIONS} value={status} onChange={setStatus} />
      </View>
    </Sheet>
  );
}
