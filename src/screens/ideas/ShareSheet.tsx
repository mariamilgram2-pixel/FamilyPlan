// Share an idea: type a name, or pick people and groups from the list. Groups
// see it in their Ideas; people you pick hear about it. The picker is also
// how a new idea gets its people.

import React, { useEffect, useMemo, useState } from 'react';
import { View } from 'react-native';
import { Group, Idea, Profile } from '../../types';
import Avatar from '../../components/Avatar';
import GroupAvatar from '../../components/GroupAvatar';
import { Button, Field, Icon, ListRow, ListSection, Sheet, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, useTheme } from '../../theme';

export interface ShareTarget { groupIds: string[]; userIds: string[] }

const nameOf = (p: Profile) => p.full_name ?? p.email ?? 'Someone';

/**
 * Pick people and groups: type to narrow (return picks the top match), or tap
 * rows. What's picked shows as chips you can tap to remove.
 */
export function AudiencePicker({ groups, people, groupIds, userIds, onChange, hint }: {
  groups: Group[];
  people: Profile[];          // everyone you share a group with, not you
  groupIds: Set<string>;
  userIds: Set<string>;
  onChange: (groupIds: Set<string>, userIds: Set<string>) => void;
  hint?: string;
}) {
  const { c } = useTheme();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const shownGroups = useMemo(() => groups.filter(g => !q || g.name.toLowerCase().includes(q)), [groups, q]);
  const shownPeople = useMemo(() => [...people]
    .filter(p => !q || nameOf(p).toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q))
    .sort((a, b) => nameOf(a).localeCompare(nameOf(b))), [people, q]);

  const flip = (set: Set<string>, id: string) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  };
  const toggleGroup = (id: string) => { onChange(flip(groupIds, id), userIds); setQuery(''); };
  const togglePerson = (id: string) => { onChange(groupIds, flip(userIds, id)); setQuery(''); };

  const chosen = chosenLabels(groups, people, groupIds, userIds);

  return (
    <View style={{ gap: space.l }}>
      <View style={{ gap: space.s }}>
        <Field
          value={query}
          onChangeText={setQuery}
          placeholder="Type a name or group"
          accessibilityLabel="Search people and groups"
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={() => {
            // Return picks the top match.
            if (!q) return;
            if (shownGroups[0]) toggleGroup(shownGroups[0].id);
            else if (shownPeople[0]) togglePerson(shownPeople[0].id);
          }}
        />
        {chosen.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s }}>
            {chosen.map(ch => (
              <Tappable
                key={ch.key}
                feedback="opacity"
                onPress={() => (ch.kind === 'group' ? toggleGroup(ch.id) : togglePerson(ch.id))}
                accessibilityLabel={`Remove ${ch.label}`}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: space.hair,
                  height: 30, paddingLeft: space.m - 4, paddingRight: space.s, borderRadius: radius.pill, ...continuous,
                  backgroundColor: c.tint,
                }}
              >
                <Txt v="footnote" semibold style={{ color: c.onTint }}>{ch.label}</Txt>
                <Icon name="close" size={14} color={c.onTint} />
              </Tappable>
            ))}
          </View>
        ) : hint ? (
          <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.m }}>{hint}</Txt>
        ) : null}
      </View>

      {shownGroups.length ? (
        <ListSection header="Groups" separatorInset={60}>
          {shownGroups.map(g => (
            <ListRow key={g.id} leading={<GroupAvatar group={g} size={32} />} title={g.name} checked={groupIds.has(g.id)} onPress={() => toggleGroup(g.id)} />
          ))}
        </ListSection>
      ) : null}

      {shownPeople.length ? (
        <ListSection header="People" separatorInset={60}>
          {shownPeople.map(p => (
            <ListRow key={p.id} leading={<Avatar person={p} size={32} />} title={nameOf(p)} checked={userIds.has(p.id)} onPress={() => togglePerson(p.id)} />
          ))}
        </ListSection>
      ) : null}

      {q && !shownGroups.length && !shownPeople.length ? (
        <Txt v="callout" tone="secondary" align="center">No one called “{query.trim()}” in your groups yet.</Txt>
      ) : null}
    </View>
  );
}

/** Picked groups, then people, as short labels. */
export function chosenLabels(groups: Group[], people: Profile[], groupIds: Set<string>, userIds: Set<string>) {
  return [
    ...groups.filter(g => groupIds.has(g.id)).map(g => ({ key: `g-${g.id}`, kind: 'group' as const, id: g.id, label: g.name })),
    ...people.filter(p => userIds.has(p.id)).map(p => ({ key: `u-${p.id}`, kind: 'person' as const, id: p.id, label: nameOf(p).split(' ')[0] })),
  ];
}

/** "Share with Ana", "Share with Book club and Hana", "Share with 4". */
export function withLabel(verb: string, labels: string[]) {
  return labels.length === 0 ? verb
    : labels.length === 1 ? `${verb} with ${labels[0]}`
    : labels.length === 2 ? `${verb} with ${labels[0]} and ${labels[1]}`
    : `${verb} with ${labels.length}`;
}

export default function ShareSheet({ idea, groups, people, onClose, onShare }: {
  idea: Idea | null;
  groups: Group[];
  people: Profile[];
  onClose: () => void;
  onShare: (target: ShareTarget) => Promise<void>;
}) {
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set());
  const [userIds, setUserIds] = useState<Set<string>>(new Set());
  const [sharing, setSharing] = useState(false);

  // Opening on an idea starts from who it's already for.
  useEffect(() => {
    if (!idea) return;
    setGroupIds(new Set([...(idea.group_id ? [idea.group_id] : []), ...(idea.audience_group_ids ?? [])]));
    setUserIds(new Set(idea.audience_user_ids ?? []));
  }, [idea?.id]);

  const chosen = chosenLabels(groups, people, groupIds, userIds);

  async function share() {
    if (!chosen.length) return;
    setSharing(true);
    await onShare({ groupIds: Array.from(groupIds), userIds: Array.from(userIds) });
    setSharing(false);
  }

  return (
    <Sheet visible={!!idea} onClose={onClose} title="Share" action={{ label: 'Share', onPress: share, disabled: !chosen.length, loading: sharing }}>
      <View style={{ gap: space.l }}>
        <AudiencePicker
          groups={groups}
          people={people}
          groupIds={groupIds}
          userIds={userIds}
          onChange={(g, u) => { setGroupIds(g); setUserIds(u); }}
          hint="Pick people, groups, or both. Everyone you share with can add notes and suggestions."
        />
        <Button label={withLabel('Share', chosen.map(ch => ch.label))} icon="share-outline" onPress={share} disabled={!chosen.length} loading={sharing} block />
      </View>
    </Sheet>
  );
}
