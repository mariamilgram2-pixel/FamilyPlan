// Who's in a plan, picked like guests in a calendar invite: a search bar at
// the top, whoever's added as chips under it (tap × to take them off), and
// everyone you could add below. With nothing typed it's Groups, People from
// your groups, and Your people; typing narrows it to one list of matches,
// and picking one clears the search for the next name. Done keeps what's
// picked; Cancel puts it back how it was.
//
// People who aren't on sheep or in your people yet: type their phone number,
// or search your phone's contacts (it asks for access the first time). Either
// way they're saved as one of your people, with their number, and added.
// A typed number asks for their name first (or keep it as just the number).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Avatar from '../../components/Avatar';
import GroupAvatar from '../../components/GroupAvatar';
import { Button, Field, Icon, ListRow, ListSection, Sheet, Tappable, Txt } from '../../components/ui';
import { space, useTheme } from '../../theme';
import { Contact, Group, Profile } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { DEMO_MEMBERS, DEMO_ME, addDemoContact, demoContacts, isDemoGroup } from '../../lib/demo';
import { supabase } from '../../lib/supabase';
import { notify } from '../../lib/alert';
import { firstNameOf, formatPhone, looksLikePhone, phoneMatches, samePhone } from '../../lib/phone';
import { PhoneContact, useDeviceContacts } from '../../lib/deviceContacts';
import { isCalendar } from '../../lib/groups';
import MakeGroupRow from '../../components/MakeGroupRow';
import { useFriends } from '../../lib/friends';

export interface PersonInGroup {
  profile: Profile;
  groupIds: string[];
  groupNames: string[];
  friend?: boolean;        // a friend on sheep
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
  const { friends } = useFriends(active ? user?.id ?? null : null, isDemo);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    async function load() {
      if (isDemo) {
        setPeople(DEMO_MEMBERS.filter(m => m.id !== DEMO_ME).map(p => ({ profile: p, groupIds: ['demo'], groupNames: [activeGroup?.name ?? ''] })));
        setContacts(demoContacts());
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

  /**
   * Someone by their phone number, as one of your people: the one you already
   * have with that number, or a new one. Null if it couldn't be saved.
   */
  const addContact = useCallback(async (name: string, phone: string): Promise<Contact | null> => {
    const have = contacts.find(ct => samePhone(ct.phone, phone));
    if (have) return have;
    const byName = (a: Contact, b: Contact) => a.name.localeCompare(b.name);
    if (isDemo || !user) {
      const ct: Contact = { id: `local-${Date.now()}`, owner_id: user?.id ?? DEMO_ME, name, email: null, note: null, phone, created_at: new Date().toISOString() };
      addDemoContact(ct);
      setContacts(cs => [...cs, ct].sort(byName));
      return ct;
    }
    const { data, error } = await supabase.from('contacts').insert({ owner_id: user.id, name, phone } as any).select().single();
    if (error || !data) { notify('Couldn’t add them', error?.message ?? 'Try again.'); return null; }
    setContacts(cs => [...cs, data as Contact].sort(byName));
    return data as Contact;
  }, [contacts, isDemo, user]);

  // Friends you don't share a group with count too.
  const withFriends = useMemo(() => {
    const friendIds = new Set(friends.map(f => f.id));
    const have = new Set(people.map(p => p.profile.id));
    return [
      ...people.map(p => (friendIds.has(p.profile.id) ? { ...p, friend: true } : p)),
      ...friends.filter(f => !have.has(f.id)).map(f => ({ profile: f, groupIds: [], groupNames: [], friend: true })),
    ].sort((a, b) => (a.profile.full_name ?? a.profile.email ?? '').localeCompare(b.profile.full_name ?? b.profile.email ?? ''));
  }, [people, friends]);

  return { people: withFriends, contacts, loading, addContact };
}

type Kind = 'group' | 'user' | 'contact';

/** For someone saved by number only: a phone, not initials made of digits. */
function PhoneDisc({ size }: { size: number }) {
  const { c } = useTheme();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tintSoft }}>
      <Icon name="call-outline" size={Math.round(size * 0.5)} color={c.tint} />
    </View>
  );
}
interface Entry { kind: Kind; id: string; name: string; subtitle: string | null; phone?: string | null; avatar: (size: number) => React.ReactNode }

export default function WhoPicker({
  visible, onDone, onCancel, loading, groups, people, contacts,
  groupIds, userIds, contactIds, onToggle, onAddPhone, title = 'Add people', usersOnly = false, canMakeGroup = false,
}: {
  title?: string;
  /** Offer "Make this a group" once two or more people are picked (plans). */
  canMakeGroup?: boolean;
  /** Just people on sheep (who's in a group): no people you added, phone numbers, or phone contacts. */
  usersOnly?: boolean;
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
  /** Save someone by their number (typed, or from your phone's contacts) as one of your people. */
  onAddPhone: (name: string, phone: string) => Promise<Contact | null>;
}) {
  const { c } = useTheme();
  const { activeGroup } = useGroup();
  const phoneBook = useDeviceContacts(visible && !usersOnly, isDemoGroup(activeGroup));
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState<string | null>(null);
  // A typed number being named before it's added.
  const [naming, setNaming] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');
  useEffect(() => { if (visible) { setQuery(''); setNaming(null); } }, [visible]);
  const startNaming = (phone: string) => { setNaming(phone); setNameDraft(''); };
  const changeQuery = (t: string) => { setQuery(t); setNaming(null); };

  const entries = useMemo(() => ({
    group: groups.map((g): Entry => ({
      kind: 'group', id: g.id, name: g.name, subtitle: isCalendar(g) ? 'Shared calendar' : 'Group', avatar: size => <GroupAvatar group={g} size={size} />,
    })),
    user: people.map((p): Entry => ({
      kind: 'user', id: p.profile.id, name: p.profile.full_name ?? p.profile.email ?? 'Someone',
      subtitle: p.groupNames.join(', ') || (p.friend ? 'Friend' : p.profile.email), avatar: size => <Avatar person={p.profile} size={size} />,
    })),
    contact: (usersOnly ? [] : contacts).map((ct): Entry => ({
      kind: 'contact', id: ct.id, name: ct.name, phone: ct.phone,
      subtitle: ct.email ?? (ct.phone && !looksLikePhone(ct.name) ? formatPhone(ct.phone) : null),
      avatar: size => !ct.avatar_url && looksLikePhone(ct.name)
        ? <PhoneDisc size={size} />
        : <Avatar person={{ id: ct.id, full_name: ct.name, avatar_url: ct.avatar_url }} size={size} />,
    })),
  }), [groups, people, contacts, usersOnly]);

  const isOn = (e: Entry) => (e.kind === 'group' ? groupIds : e.kind === 'user' ? userIds : contactIds).has(e.id);
  const all = [...entries.group, ...entries.user, ...entries.contact];
  const added = all.filter(isOn);

  // Matches any word's start in the name, or anywhere in the email or groups.
  const q = query.trim().toLowerCase();
  const nameMatches = (name: string) => name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || name.toLowerCase().startsWith(q);
  const matches = q ? all.filter(e =>
    nameMatches(e.name) || (e.subtitle ?? '').toLowerCase().includes(q) || phoneMatches(e.phone, q)) : [];

  // A number typed in: add it, unless it's someone you already have (they're in matches).
  const typedPhone = !usersOnly && looksLikePhone(query) ? formatPhone(query) : null;
  const typedIsKnown = !!typedPhone && contacts.some(ct => samePhone(ct.phone, typedPhone));
  // Your phone's contacts matching what's typed, leaving out numbers already in your people.
  const phoneMatchesList = q && phoneBook.access === 'granted'
    ? phoneBook.contacts.filter(pc => (nameMatches(pc.name) || phoneMatches(pc.phone, q))
        && !contacts.some(ct => samePhone(ct.phone, pc.phone))).slice(0, 30)
    : [];

  async function addByPhone(name: string, phone: string, key: string) {
    if (adding) return;
    setAdding(key);
    const ct = await onAddPhone(name, phone);
    setAdding(null);
    if (!ct) return;
    if (!contactIds.has(ct.id)) onToggle('contact', ct.id);
    setQuery('');
  }

  const disc = (icon: React.ComponentProps<typeof Icon>['name']) => (
    <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.tintSoft }}>
      <Icon name={icon} size={16} color={c.tint} />
    </View>
  );
  const busy = (key: string) => adding === key ? <ActivityIndicator color={c.secondaryLabel} /> : undefined;

  const typedRow = typedPhone && !typedIsKnown ? (
    <ListSection separatorInset={64}>
      <ListRow
        leading={disc('call-outline')}
        title={`Add ${typedPhone}`}
        subtitle="By phone number"
        trailing={<Icon name="chevron-forward" size={16} color={c.secondaryLabel} />}
        onPress={() => startNaming(typedPhone)}
      />
    </ListSection>
  ) : null;

  // Naming a typed number: their name, or leave it blank to keep just the number.
  const saveNamed = async () => {
    if (!naming) return;
    await addByPhone(nameDraft.trim() || naming, naming, 'typed');
    setNaming(null);
  };
  const namingCard = naming ? (
    <View style={{ gap: space.m }}>
      <Field
          label={`Who’s ${naming}?`}
          hint="So you know who it is. Leave it blank to just use the number."
          value={nameDraft}
          onChangeText={setNameDraft}
          placeholder="Their name"
          autoFocus
          autoCapitalize="words"
          autoCorrect={false}
          returnKeyType="done"
          onSubmitEditing={saveNamed}
          accessibilityLabel={`Name for ${naming}`}
        />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s }}>
        <Button label="Back" variant="plain" onPress={() => setNaming(null)} />
        <Button label={nameDraft.trim() ? `Add ${firstNameOf(nameDraft.trim())}` : 'Add'} onPress={saveNamed} loading={adding === 'typed'} />
      </View>
    </View>
  ) : null;

  const phoneRow = (pc: PhoneContact) => (
    <ListRow
      key={`phone-${pc.key}`}
      leading={<Avatar person={{ id: pc.key, full_name: pc.name, avatar_url: null }} size={32} />}
      title={pc.name}
      subtitle={pc.label ? `${pc.label} · ${pc.phone}` : pc.phone}
      trailing={busy(pc.key)}
      onPress={() => addByPhone(pc.name, pc.phone, pc.key)}
    />
  );

  // Your phone's contacts, before access: one row to search them.
  const askRow = !usersOnly && phoneBook.available && (phoneBook.access === 'ask' || phoneBook.access === 'blocked') ? (
    <ListSection
      header="From your contacts"
      footer={phoneBook.access === 'blocked' ? 'Contacts are turned off for sheep. Turn them on in Settings to search them here.' : undefined}
      separatorInset={64}
    >
      <ListRow
        leading={disc('book-outline')}
        title={phoneBook.access === 'blocked' ? 'Open Settings' : 'Search your contacts'}
        subtitle={phoneBook.access === 'blocked' ? undefined : 'Add anyone from your phone'}
        onPress={phoneBook.ask}
      />
    </ListSection>
  ) : null;

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
    <Sheet visible={visible} onClose={onCancel} title={title} action={{ label: 'Done', onPress: onDone }} scroll={false}>
      <View style={{ paddingHorizontal: space.m, paddingBottom: space.s, gap: space.s }}>
        <View>
          <Field
            value={query}
            onChangeText={changeQuery}
            placeholder={usersOnly ? 'Search people on sheep' : 'Search people, or type a phone number'}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            onSubmitEditing={() => {
              if (matches.length === 1) { onToggle(matches[0].kind, matches[0].id); setQuery(''); }
              else if (!matches.length && typedPhone && !typedIsKnown) startNaming(typedPhone);
            }}
            accessibilityLabel={usersOnly ? 'Search people on sheep' : 'Search people, or type a phone number'}
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
                <Txt v="footnote" tone="tint" semibold numberOfLines={1}>{e.kind === 'group' ? e.name : firstNameOf(e.name)}</Txt>
                <Icon name="close" size={14} color={c.tint} />
              </Tappable>
            ))}
          </View>
        ) : null}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: space.m, paddingTop: space.s, gap: space.l }} keyboardShouldPersistTaps="handled">
        {loading ? <ActivityIndicator color={c.secondaryLabel} /> : namingCard ?? (q ? (
          <>
            {typedRow}
            {matches.length ? <ListSection separatorInset={64}>{matches.map(row)}</ListSection> : null}
            {phoneMatchesList.length ? <ListSection header="From your contacts" separatorInset={64}>{phoneMatchesList.map(phoneRow)}</ListSection> : null}
            {!typedRow && !matches.length && !phoneMatchesList.length ? (
              <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
                {`No one matching “${query.trim()}”.`}{usersOnly ? '' : phoneBook.access === 'granted' ? '' : ' Type their phone number to add them.'}
              </Txt>
            ) : null}
            {phoneMatchesList.length || typedPhone ? null : askRow}
          </>
        ) : all.length ? (
          <>
            {entries.group.length ? (
              <ListSection header="Groups" footer={groupIds.size === 0 ? 'Nothing picked — it’s just for you and anyone you add.' : undefined} separatorInset={64}>
                {entries.group.map(row)}
              </ListSection>
            ) : null}
            {entries.user.length ? <ListSection header="People on sheep" separatorInset={64}>{entries.user.map(row)}</ListSection> : null}
            {entries.contact.length ? <ListSection header="Your people" separatorInset={64}>{entries.contact.map(row)}</ListSection> : null}
            {askRow}
            {!usersOnly && phoneBook.access === 'granted' && phoneBook.limited ? (
              <ListSection footer="You let sheep see only some of your contacts.">
                <ListRow leading={disc('person-add-outline')} title="Allow more contacts" onPress={phoneBook.allowMore} />
              </ListSection>
            ) : null}
            {!usersOnly && phoneBook.access === 'granted' ? (
              <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>
                Type a name to find someone in your contacts, or type a phone number.
              </Txt>
            ) : null}
          </>
        ) : (
          <>
            <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
              {usersOnly
                ? 'No one on sheep to pick yet. Tap Done, name the group, and share its invite code so friends can join.'
                : 'You’re not in any groups and haven’t added anyone yet. Type someone’s phone number to add them.'}
            </Txt>
            {askRow}
          </>
        ))}
      </ScrollView>
      {/* Two or more people picked: keep them together as a group. */}
      {canMakeGroup && !q && !namingCard ? (
        <View style={{ paddingHorizontal: space.m, paddingBottom: space.m }}>
          <MakeGroupRow
            userIds={Array.from(userIds)}
            names={people.filter(p => userIds.has(p.profile.id)).map(p => p.profile.full_name ?? p.profile.email ?? 'Someone')}
            isDemo={isDemoGroup(activeGroup)}
            onMade={(g, ids) => { ids.forEach(id => onToggle('user', id)); onToggle('group', g.id); }}
          />
        </View>
      ) : null}
    </Sheet>
  );
}
