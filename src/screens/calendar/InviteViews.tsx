// Invite picker (People / Groups, suggestions + search) and the Assign list
// ("who's bringing what") used by the event composer and detail.

import React, { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Assignment } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import { Button, Field, Icon, IconButton, ListRow, ListSection, Segmented, Tappable, Txt } from '../../components/ui';
import { continuous, radius, space, useTheme } from '../../theme';
import { CircleGroup, CirclePerson } from '../../lib/people';

const SUGGESTED = 5;

type Tab = 'people' | 'groups';
const TABS: { key: Tab; label: string }[] = [{ key: 'people', label: 'People' }, { key: 'groups', label: 'Groups' }];

const firstName = (p: AvatarPerson) => (p.full_name ?? p.email ?? 'Someone').split(' ')[0];
const matches = (name: string, q: string) => name.toLowerCase().split(/\s+/).some(w => w.startsWith(q)) || name.toLowerCase().includes(q);

// ─── Invite ──────────────────────────────────────────────────────────────────

interface InviteProps {
  people: CirclePerson[];
  groups: CircleGroup[];
  meId: string | null;
  suggestedIds: string[];          // people you plan with most, best first
  userIds: string[];
  groupIds: string[];
  onChangeUsers: (ids: string[]) => void;
  onChangeGroups: (ids: string[]) => void;
}

export function InvitePicker({ people, groups, meId, suggestedIds, userIds, groupIds, onChangeUsers, onChangeGroups }: InviteProps) {
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('people');
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  // Who each selected group brings along.
  const viaGroup = useMemo(() => {
    const m = new Map<string, string>();
    groups.filter(g => groupIds.includes(g.group.id)).forEach(g => g.memberIds.forEach(id => { if (!m.has(id)) m.set(id, g.group.name); }));
    return m;
  }, [groups, groupIds]);

  const invitedCount = new Set([...userIds, ...viaGroup.keys()].filter(id => id !== meId)).size;

  const shownPeople = useMemo(() => {
    if (q) return people.filter(p => matches(p.profile.full_name ?? p.profile.email ?? '', q)).slice(0, 20);
    const rank = (id: string) => { const i = suggestedIds.indexOf(id); return i < 0 ? Infinity : i; };
    return [...people].sort((a, b) => rank(a.profile.id) - rank(b.profile.id)).slice(0, SUGGESTED);
  }, [people, q, suggestedIds]);

  const shownGroups = useMemo(
    () => (q ? groups.filter(g => matches(g.group.name, q)) : groups.slice(0, SUGGESTED)),
    [groups, q],
  );

  const toggle = (list: string[], id: string, set: (l: string[]) => void) =>
    set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  const chips = [
    ...groups.filter(g => groupIds.includes(g.group.id)).map(g => ({ key: `g-${g.group.id}`, label: g.group.name, icon: 'people' as const, remove: () => toggle(groupIds, g.group.id, onChangeGroups) })),
    ...people.filter(p => userIds.includes(p.profile.id)).map(p => ({ key: `u-${p.profile.id}`, label: firstName(p.profile), icon: 'person' as const, remove: () => toggle(userIds, p.profile.id, onChangeUsers) })),
  ];

  return (
    <View style={{ gap: space.s }}>
      <Txt v="headline" style={{ paddingHorizontal: space.m }}>
        Invite{invitedCount ? <Txt v="callout" tone="secondary">{`  ${invitedCount} ${invitedCount === 1 ? 'person' : 'people'}`}</Txt> : null}
      </Txt>

      {chips.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.m }}>
          {chips.map(ch => (
            <Tappable
              key={ch.key}
              feedback="opacity"
              onPress={ch.remove}
              accessibilityLabel={`Remove ${ch.label}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, height: 28, paddingLeft: space.s, paddingRight: 6, borderRadius: radius.control, backgroundColor: c.tintSoft, ...continuous }}
            >
              <Icon name={ch.icon} size={12} color={c.tint} />
              <Txt v="footnote" tone="tint" semibold numberOfLines={1}>{ch.label}</Txt>
              <Icon name="close" size={14} color={c.tint} />
            </Tappable>
          ))}
        </View>
      )}

      <Segmented options={TABS} value={tab} onChange={t => { setTab(t); setQuery(''); }} />
      <Field
        value={query}
        onChangeText={setQuery}
        placeholder={tab === 'people' ? 'Search people' : 'Search groups'}
        accessibilityLabel={tab === 'people' ? 'Search people to invite' : 'Search groups to invite'}
        autoCorrect={false}
        autoCapitalize="none"
      />

      {tab === 'people' ? (
        shownPeople.length ? (
          <ListSection header={q ? 'Results' : 'Suggested'} separatorInset={64}>
            {shownPeople.map(p => {
              const via = viaGroup.get(p.profile.id);
              const explicit = userIds.includes(p.profile.id);
              return (
                <ListRow
                  key={p.profile.id}
                  leading={<Avatar person={p.profile} size={32} />}
                  title={p.profile.full_name ?? p.profile.email}
                  subtitle={via && !explicit ? `Invited with ${via}` : p.groupNames.join(', ')}
                  checked={explicit || !!via}
                  onPress={() => toggle(userIds, p.profile.id, onChangeUsers)}
                />
              );
            })}
          </ListSection>
        ) : (
          <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
            {q ? `No one named “${query.trim()}” in your groups.` : 'Join or create a group to invite people.'}
          </Txt>
        )
      ) : shownGroups.length ? (
        <ListSection header={q ? 'Results' : 'Your groups'} separatorInset={64}>
          {shownGroups.map(g => {
            const others = g.memberIds.filter(id => id !== meId).length;
            return (
              <ListRow
                key={g.group.id}
                leading={<GroupGlyph />}
                title={g.group.name}
                subtitle={`${others} ${others === 1 ? 'person' : 'people'}`}
                checked={groupIds.includes(g.group.id)}
                onPress={() => toggle(groupIds, g.group.id, onChangeGroups)}
              />
            );
          })}
        </ListSection>
      ) : (
        <Txt v="callout" tone="secondary" style={{ paddingHorizontal: space.m }}>
          {q ? `No group called “${query.trim()}”.` : 'You’re not in any groups yet.'}
        </Txt>
      )}
    </View>
  );
}

export function GroupGlyph() {
  const { c } = useTheme();
  return (
    <View style={{ width: 32, height: 32, borderRadius: radius.control, ...continuous, backgroundColor: c.tintSoft, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name="people" size={16} color={c.tint} />
    </View>
  );
}

// ─── Assign (composer) ───────────────────────────────────────────────────────

const GATHERING = /\b(dinner|party|potluck|bbq|barbecue|cookout|picnic|brunch|lunch|thanksgiving|friendsgiving|game night|birthday|shower)\b/i;
const STARTERS = ['Drinks', 'Dessert', 'Side dish', 'Plates & cups', 'Ice'];

interface AssignProps {
  items: Assignment[];
  onChange: (items: Assignment[]) => void;
  people: AvatarPerson[];          // who can be assigned: you + invitees
  meId: string | null;
  eventTitle: string;
  title?: string;
  hint?: string;
}

export function AssignEditor({
  items, onChange, people, meId, eventTitle,
  title = 'Assign',
  hint = 'Who’s bringing or handling what. Leave something open and anyone invited can claim it.',
}: AssignProps) {
  const { c } = useTheme();
  const [draft, setDraft] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);

  const add = (text: string) => {
    const item = text.trim();
    if (!item) return;
    onChange([...items, { id: `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, item, assignee_id: null }]);
    setDraft('');
  };
  const nameOf = (id: string | null) => {
    if (!id) return null;
    const p = people.find(x => x.id === id);
    return id === meId ? 'You' : p ? firstName(p) : 'Someone';
  };
  const starters = GATHERING.test(eventTitle) ? STARTERS.filter(s => !items.some(i => i.item.toLowerCase() === s.toLowerCase())) : [];

  return (
    <View style={{ gap: space.s }}>
      <View style={{ paddingHorizontal: space.m }}>
        <Txt v="headline">{title}</Txt>
        <Txt v="footnote" tone="secondary">{hint}</Txt>
      </View>

      {items.length > 0 && (
        <ListSection separatorInset={60}>
          {items.flatMap(a => {
            const open = openId === a.id;
            const rows = [
              // Remove sits beside the row, not inside it: no button-in-button.
              <View key={a.id} style={{ flexDirection: 'row', alignItems: 'center', paddingRight: space.s }}>
                <ListRow
                  icon="hand-right-outline"
                  title={a.item}
                  subtitle={nameOf(a.assignee_id) ?? 'Open — anyone can claim'}
                  onPress={() => setOpenId(open ? null : a.id)}
                  style={{ flex: 1 }}
                />
                <IconButton icon="close-circle" label={`Remove ${a.item}`} onPress={() => onChange(items.filter(x => x.id !== a.id))} />
              </View>,
            ];
            if (open) {
              const pick = (assignee_id: string | null) => { onChange(items.map(x => (x.id === a.id ? { ...x, assignee_id } : x))); setOpenId(null); };
              rows.push(
                <ListRow key={`${a.id}-open`} title="Open" checked={!a.assignee_id} onPress={() => pick(null)} style={{ paddingLeft: 60 }} />,
                ...people.map(p => (
                  <ListRow
                    key={`${a.id}-${p.id}`}
                    leading={<Avatar person={p} size={24} highlight={p.id === meId} />}
                    title={p.id === meId ? 'You' : (p.full_name ?? p.email ?? 'Someone')}
                    checked={a.assignee_id === p.id}
                    onPress={() => pick(p.id)}
                    style={{ paddingLeft: 60 }}
                  />
                )),
              );
            }
            return rows;
          })}
        </ListSection>
      )}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space.s }}>
        <View style={{ flex: 1 }}>
          <Field
            value={draft}
            onChangeText={setDraft}
            placeholder={items.length ? 'Add another' : 'Dessert, drinks, pick up ice…'}
            onSubmitEditing={() => add(draft)}
            returnKeyType="done"
            blurOnSubmit={false}
            accessibilityLabel="Add something to assign"
          />
        </View>
        <Button label="Add" variant="gray" onPress={() => add(draft)} disabled={!draft.trim()} />
      </View>

      {starters.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.s, paddingHorizontal: space.m }}>
          {starters.map(s => (
            <Tappable
              key={s}
              feedback="opacity"
              onPress={() => add(s)}
              accessibilityLabel={`Add ${s}`}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.hair, height: 28, paddingHorizontal: space.s, borderRadius: radius.control, backgroundColor: c.fill, ...continuous }}
            >
              <Icon name="add" size={14} color={c.tint} />
              <Txt v="footnote" tone="tint" semibold>{s}</Txt>
            </Tappable>
          ))}
        </View>
      )}
    </View>
  );
}

// ─── Assignments (detail) ────────────────────────────────────────────────────

interface AssignmentsProps {
  items: Assignment[];
  people: AvatarPerson[];
  meId: string | null;
  canClaim: boolean;
  onClaim?: (itemId: string, claim: boolean) => void;
}

export function AssignmentList({ items, people, meId, canClaim, onClaim }: AssignmentsProps) {
  const open = items.filter(a => !a.assignee_id).length;
  return (
    <ListSection header={open ? `Who’s bringing what · ${open} open` : 'Who’s bringing what'} separatorInset={60}>
      {items.map(a => {
        const p = people.find(x => x.id === a.assignee_id);
        const mine = !!meId && a.assignee_id === meId;
        const who = !a.assignee_id ? 'Open' : mine ? 'You' : p ? (p.full_name ?? p.email ?? 'Someone') : 'Someone';
        return (
          <ListRow
            key={a.id}
            leading={a.assignee_id ? <Avatar person={p ?? { id: a.assignee_id }} size={28} highlight={mine} /> : undefined}
            icon={a.assignee_id ? undefined : 'hand-right-outline'}
            title={a.item}
            subtitle={who}
            trailing={canClaim && onClaim && (!a.assignee_id || mine) ? (
              <Button label={mine ? 'Release' : 'I’ll take it'} variant={mine ? 'plain' : 'gray'} onPress={() => onClaim(a.id, !mine)} />
            ) : undefined}
          />
        );
      })}
    </ListSection>
  );
}
