// Ideas
//
// One visible decision per view: the status segment (4 choices). The
// audience filter — potentially dozens of groups and people — lives behind a
// single Filter menu, with the active filter echoed as a removable row.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { notify } from '../../lib/alert';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { DEMO_CONTACTS, DEMO_IDEAS, DEMO_MEMBERS, DEMO_ME, isDemoGroup } from '../../lib/demo';
import { useShortcut } from '../../lib/shortcuts';
import { Idea, Profile, Contact, Group } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import { AvatarPerson } from '../../components/Avatar';
import GroupSwitcher, { useVisibleGroups } from '../../components/GroupSwitcher';
import {
  EmptyState, IconButton, ListRow, Menu, MenuSection, PrimaryAction, ReadingColumn,
  ScreenHeader, Segmented, Sheet, SplitView, useBottomClearance,
} from '../../components/ui';
import { space, useLayout, useTheme } from '../../theme';
import CreateIdeaSheet from './CreateIdeaScreen';
import { Sheep } from '../../components/Sheep';
import { IdeaDetail, IdeaRow } from './IdeaViews';

type StatusFilter = 'all' | Idea['status'];
type AudienceFilter =
  | { kind: 'all' }
  | { kind: 'group'; id: string }
  | { kind: 'user'; id: string }
  | { kind: 'contact'; id: string };

const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'proposed', label: 'Proposed' },
  { key: 'planned', label: 'Planned' },
  { key: 'done', label: 'Done' },
];

export default function IdeasScreen() {
  const { activeGroup, groups } = useGroup();
  const visibleGroups = useVisibleGroups();
  const { user } = useAuth();
  const { c } = useTheme();
  const { compact, threeColumn } = useLayout();
  const bottomClearance = useBottomClearance();
  const isDemo = isDemoGroup(activeGroup);
  const meId = user?.id ?? (isDemo ? DEMO_ME : null);

  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [audienceFilter, setAudienceFilter] = useState<AudienceFilter>({ kind: 'all' });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!activeGroup) return;
    if (isDemo) {
      setIdeas(prev => (prev.length ? prev : DEMO_IDEAS));
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
        : Promise.all(
            groups.map(g =>
              supabase.from('group_members')
                .select('profiles(id, full_name, email, avatar_url)')
                .eq('group_id', g.id)
                .then(({ data }) => ({
                  members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[],
                }))
            )
          ),
      user
        ? supabase.from('contacts').select('*').eq('owner_id', user.id).order('name')
        : Promise.resolve({ data: [] as Contact[] } as any),
    ]);
    if (error) notify('Couldn’t load ideas', error.message);
    else {
      const relevant = ((ideasData as Idea[]) ?? []).filter(i =>
        i.group_id === activeGroup.id || (i.audience_group_ids ?? []).includes(activeGroup.id)
      );
      setIdeas(relevant);
    }
    const uniq = new Map<string, Profile>();
    memberResults.forEach(({ members: ms }) => ms.forEach(p => uniq.set(p.id, p)));
    setMembers(Array.from(uniq.values()));
    setContacts(((contactsRes?.data ?? []) as Contact[]));
    setLoading(false);
  }, [activeGroup, groups, user, isDemo]);

  useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

  const memberById = useMemo(() => new Map(members.map(p => [p.id, p])), [members]);
  const contactById = useMemo(() => new Map(contacts.map(ct => [ct.id, ct])), [contacts]);
  const groupById = useMemo(() => new Map<string, Group>(visibleGroups.map(g => [g.id, g])), [visibleGroups]);

  function ideaGroupIds(idea: Idea): string[] {
    return Array.from(new Set<string>([idea.group_id, ...(idea.audience_group_ids ?? [])]));
  }

  function resolveAudience(idea: Idea): AvatarPerson[] {
    const users = (idea.audience_user_ids ?? []).map(id => memberById.get(id)).filter(Boolean) as AvatarPerson[];
    const cts = (idea.audience_contact_ids ?? [])
      .map(id => contactById.get(id))
      .filter(Boolean)
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

  async function handleVote(idea: Idea) {
    if (!meId) return;
    const already = hasVoted(idea);
    if (isDemo) {
      setIdeas(prev => prev.map(i => i.id !== idea.id ? i : {
        ...i,
        votes: i.votes + (already ? -1 : 1),
        idea_votes: already
          ? (i.idea_votes ?? []).filter(v => v.user_id !== meId)
          : [...(i.idea_votes ?? []), { id: `${i.id}-me`, idea_id: i.id, user_id: meId, created_at: '' }],
      }));
      return;
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

  async function handleStatusChange(idea: Idea, status: Idea['status']) {
    if (isDemo) {
      setIdeas(prev => prev.map(i => (i.id === idea.id ? { ...i, status } : i)));
      return;
    }
    await supabase.from('ideas').update({ status } as any).eq('id', idea.id);
    fetchAll();
  }

  const filtered = useMemo(() => {
    let list = filter === 'all' ? ideas : ideas.filter(i => i.status === filter);
    if (audienceFilter.kind === 'group') list = list.filter(i => ideaGroupIds(i).includes(audienceFilter.id));
    else if (audienceFilter.kind === 'user') list = list.filter(i => i.audience_user_ids?.includes(audienceFilter.id));
    else if (audienceFilter.kind === 'contact') list = list.filter(i => i.audience_contact_ids?.includes(audienceFilter.id));
    return list;
  }, [ideas, filter, audienceFilter]);

  // Detail column: keep something selected when there's room to show it.
  useEffect(() => {
    if (!threeColumn) { setSelectedId(null); return; }
    if (!filtered.some(i => i.id === selectedId)) setSelectedId(filtered[0]?.id ?? null);
  }, [filtered, threeColumn]);

  useShortcut('n', () => setComposing(true));

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
      items: members.filter(m => m.id !== meId).map(m => ({
        key: `u-${m.id}`, label: m.full_name ?? m.email, checked: isActive({ kind: 'user', id: m.id }),
        onSelect: () => setAudienceFilter({ kind: 'user', id: m.id }),
      })),
    },
    {
      title: 'Your people',
      items: contacts.map(ct => ({
        key: `c-${ct.id}`, label: ct.name, checked: isActive({ kind: 'contact', id: ct.id }),
        onSelect: () => setAudienceFilter({ kind: 'contact', id: ct.id }),
      })),
    },
  ];

  const audienceLabel =
    audienceFilter.kind === 'group' ? groupById.get(audienceFilter.id)?.name :
    audienceFilter.kind === 'user' ? (memberById.get(audienceFilter.id)?.full_name ?? 'someone') :
    audienceFilter.kind === 'contact' ? contactById.get(audienceFilter.id)?.name : null;

  const filterButton = (
    <Menu sections={filterSections} title="Show ideas for">
      {(open) => (
        <IconButton
          icon={audienceFilter.kind === 'all' ? 'filter-circle-outline' : 'filter-circle'}
          label="Filter by audience"
          variant="gray"
          onPress={open}
        />
      )}
    </Menu>
  );

  // ─── Layout ────────────────────────────────────────────────────────────────
  const list = (
    <FlatList
      data={filtered}
      keyExtractor={i => i.id}
      contentContainerStyle={{ paddingBottom: bottomClearance }}
      ItemSeparatorComponent={() => <View style={{ height: space.s }} />}
      ListHeaderComponent={
        <View style={{ paddingBottom: space.s }}>
          <ScreenHeader
            title="Ideas"
            eyebrow={activeGroup?.name}
            trailing={
              <>
                {filterButton}
                {compact ? (
                  <GroupSwitcher>
                    {(open) => <IconButton icon="people-circle-outline" label={`Group: ${activeGroup?.name ?? 'none'}`} variant="gray" onPress={open} />}
                  </GroupSwitcher>
                ) : (
                  <IconButton icon="add" label="New Idea (⌘N)" variant="gray" onPress={() => setComposing(true)} />
                )}
              </>
            }
          />
          <View style={{ paddingHorizontal: compact ? space.m : space.l, gap: space.s }}>
            <Segmented options={STATUS_FILTERS} value={filter} onChange={setFilter} />
            {audienceLabel ? (
              <View style={{ backgroundColor: c.fill, borderRadius: 12, overflow: 'hidden' }}>
                <ListRow
                  icon="filter"
                  title={`For ${audienceLabel}`}
                  trailing={<IconButton icon="close-circle" label="Clear filter" onPress={() => setAudienceFilter({ kind: 'all' })} />}
                />
              </View>
            ) : null}
          </View>
        </View>
      }
      renderItem={({ item }) => (
        <IdeaRow
          idea={item}
          voted={hasVoted(item)}
          showStatus={filter === 'all'}
          audienceSummary={audienceSummary(item)}
          selected={threeColumn && item.id === selectedId}
          onVote={() => handleVote(item)}
          onPress={() => setSelectedId(item.id)}
        />
      )}
      ListEmptyComponent={
        loading ? <ActivityIndicator style={{ marginTop: space.xl }} color={c.secondaryLabel} /> : (
          <EmptyState
            icon="bulb-outline"
            illustration={ideas.length ? undefined : <Sheep size={88} pose="graze" style={{ marginBottom: space.m }} />}
            title={ideas.length ? 'No ideas match' : 'Nothing brewing yet'}
            body={ideas.length ? 'Try a different status or audience.' : 'Float a plan and let the group vote on it.'}
            action={ideas.length ? undefined : { label: 'New Idea', onPress: () => setComposing(true) }}
          />
        )
      }
    />
  );

  const detailFor = (idea: Idea) => (
    <IdeaDetail
      idea={idea}
      voted={hasVoted(idea)}
      voters={(idea.idea_votes ?? []).map(v => memberById.get(v.user_id)).filter(Boolean) as AvatarPerson[]}
      audience={resolveAudience(idea)}
      audienceGroupNames={ideaGroupIds(idea).map(id => groupById.get(id)?.name).filter((n): n is string => !!n)}
      meId={meId}
      onVote={() => handleVote(idea)}
      onStatusChange={(s) => handleStatusChange(idea, s)}
    />
  );

  const detail = selected ? (
    <ReadingColumn>{detailFor(selected)}</ReadingColumn>
  ) : (
    <View style={{ flex: 1, justifyContent: 'center' }}>
      <EmptyState icon="bulb-outline" title="No idea selected" />
    </View>
  );

  return (
    <>
      <SplitView list={list} detail={detail} />
      {!threeColumn && (
        <Sheet visible={!!selected} onClose={() => setSelectedId(null)} title="Idea" cancelLabel="Done">
          {selected ? detailFor(selected) : null}
        </Sheet>
      )}
      <PrimaryAction label="New Idea" onPress={() => setComposing(true)} />
      <CreateIdeaSheet visible={composing} onClose={() => setComposing(false)} onSaved={fetchAll} />
    </>
  );
}
