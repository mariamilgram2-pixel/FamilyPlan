// Who's in a plan, picked like guests in a calendar invite: a search bar at
// the top, whoever's added as chips under it (tap × to take them off), and
// everyone you could add below. With nothing typed it's Groups, People from
// your groups, and Your people; typing narrows it to one list of matches,
// and picking one clears the search for the next name. Done keeps what's
// picked; Cancel puts it back how it was.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Avatar from '../../components/Avatar';
import GroupAvatar from '../../components/GroupAvatar';
import { Field, Icon, ListRow, ListSection, Sheet, Tappable, Txt } from '../../components/ui';
import { space, useTheme } from '../../theme';
import { Contact, Group, Profile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { DEMO_CONTACTS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { supabase } from '../../lib/supabase';

export interface PersonInGroup {
  profile: Profile;
  groupIds: string[];
  groupNames: string[];
}

/**
 * Who you could plan with: members across all your groups, and your own
 * contacts. Loads while `active` (a sheet is open).
 */
export function useAudience(active: boolean, groups: Group[]) {
  const { user } = useAuth();
  const { activeGroup } = useGroup();
  const isDemo = isDemoGroup(activeGroup);
  const [people, setPeople] = useState<PersonInGroup[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function load() {
      if (isDemo) {
        setPeople(DEMO_MEMBERS.filter(m => m.id !== DEMO_ME).map(p => ({ profile: p, groupIds: ['demo'], groupNames: [activeGroup?.name ?? ''] })));
        setContacts(DEMO_CONTACTS);
        return;
      }
      if (!user) return;
      setLoading(true);
      const [memberResults, contactsRes] = await Promise.all([
        groups.length === 0
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
            ),
        supabase.from('contacts').select('*').eq('owner_id', user.id).order('name'),
      ]);
      if (cancelled) return;

      const map = new Map<string, PersonInGroup>();
      memberResults.forEach(({ group, members }) => {
        members.forEach(p => {
          if (p.id === user.id) return;
          const existingPerson = map.get(p.id);
          if (existingPerson) {
            if (!existingPerson.groupIds.includes(group.id)) {
              existingPerson.groupIds.push(group.id);
              existingPerson.groupNames.push(group.name);
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
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [active, groups, user, isDemo]);
  return { people, contacts, loading };
}

type Kind = 'group' | 'user' | 'contact';
interface Entry { kind: Kind; id: string; name: string; subtitle: string | null; avatar: (size: number) => React.ReactNode }

export default function WhoPicker({
  visible, onDone, onCancel, loading, groups, people, contacts,
  groupIds, userIds, contactIds, onToggle,
}: {
  visible: boolean;
  onDone: () => void;
  onCancel: () => void;
  loading: boolean;
  groups: Group[];
  people: PersonInGroup[];
  contacts: Contact[];
  groupIds: Set<string>;
  userIds: Set<string>;
  contactIds: Set<string>;
  onToggle: (kind: Kind, id: string) => void;
}) {
  const { c } = useTheme();
  const [query, setQuery] = useState('');
  useEffect(() => { if (visible) setQuery(''); }, [visible]);

  const entries = useMemo(() => ({
    group: groups.map((g): Entry => ({
      kind: 'group', id: g.id, name: g.name, subtitle: 'Group', avatar: size => <GroupAvatar group={g} size={size} />,
    })),
    user: people.map((p): Entry => ({
      kind: 'user', id: p.profile.id, name: p.profile.full_name ?? p.profile.email ?? 'Someone',
      subtitle: p.groupNames.join(', ') || p.profile.email, avatar: size => <Avatar person={p.profile} size={size} />,
    })),
    contact: contacts.map((ct): Entry => ({
      kind: 'contact', id: ct.id, name: ct.name, subtitle: ct.email,
      avatar: size => <Avatar person={{ id: ct.id, full_name: ct.name, avatar_url: ct.avatar_url }} size={size} />,
    })),
  }), [groups, people, contacts]);

  const isOn = (e: Entry) => (e.kind === 'group' ? groupIds : e.kind === 'user' ? userIds : contactIds).has(e.id);
  const all = [...entries.group, ...entries.user, ...entries.contact];
  const added = all.filter(isOn);

  // Matches any word's start in the name, or anywhere in the email or groups.
  const q = query.trim().toLowerCase();
  const matches = q ? all.filter(e =>
    e.name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || e.name.toLowerCase().startsWith(q)
    || (e.subtitle ?? '').toLowerCase().includes(q)) : [];

  const row = (e: Entry) => (
    <ListRow
      key={`${e.kind}-${e.id}`}
      leading={e.avatar(32)}
      title={e.name}
      subtitle={e.subtitle}
      checked={isOn(e)}
      onPress={() => { onToggle(e.kind, e.id); if (q) setQuery(''); }}
    />
  );

  return (
    <Sheet visible={visible} onClose={onCancel} title="Add people" action={{ label: 'Done', onPress: onDone }} scroll={false}>
      <View style={{ paddingHorizontal: space.m, paddingBottom: space.s, gap: space.s }}>
        <View>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder="Search groups and people"
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => { if (matches.length === 1) { onToggle(matches[0].kind, matches[0].id); setQuery(''); } }}
            accessibilityLabel="Search groups and people"
            style={{ paddingLeft: space.xl + space.s }}
          />
          <View pointerEvents="none" style={{ position: 'absolute', left: space.m, top: 0, bottom: 0, justifyContent: 'center' }}>
            <Icon name="search" size={18} color={c.secondaryLabel} />
          </View>
        </View>
        {added.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {added.map(e => (
              <Tappable
                key={`${e.kind}-${e.id}`}
                onPress={() => onToggle(e.kind, e.id)}
                feedback="opacity"
                accessibilityLabel={`Remove ${e.name}`}
                style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair + 2, paddingLeft: space.hair, paddingRight: space.s, paddingVertical: space.hair, borderRadius: 999, backgroundColor: c.tintSoft }}
              >
                {e.avatar(22)}
                <Txt v="footnote" tone="tint" semibold numberOfLines={1}>{e.kind === 'group' ? e.name : e.name.split(' ')[0]}</Txt>
                <Icon name="close" size={14} color={c.tint} />
              </Tappable>
            ))}
          </View>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.m, paddingTop: space.s, gap: space.l }} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={c.secondaryLabel} /> : q ? (
          matches.length ? (
            <ListSection separatorInset={64}>{matches.map(row)}</ListSection>
          ) : (
            <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>{`No one matching “${query.trim()}”.`}</Txt>
          )
        ) : all.length ? (
          <>
            {entries.group.length ? (
              <ListSection header="Groups" footer={groupIds.size === 0 ? 'Nothing picked — it’s just for you and anyone you add.' : undefined} separatorInset={64}>
                {entries.group.map(row)}
              </ListSection>
            ) : null}
            {entries.user.length ? <ListSection header="People from your groups" separatorInset={64}>{entries.user.map(row)}</ListSection> : null}
            {entries.contact.length ? <ListSection header="Your people" separatorInset={64}>{entries.contact.map(row)}</ListSection> : null}
          </>
        ) : (
          <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
            You’re not in any groups and haven’t added anyone yet. Head to People first.
          </Txt>
        )}
      </ScrollView>
    </Sheet>
  );
}
