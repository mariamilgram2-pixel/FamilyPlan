// New Group, from Friends: like starting a group chat. Who's in it, and a
// name if you want one (without one it goes by who's in it). No shared
// calendar: the group's plans land on each person's own calendar. Everyone in
// it sees the group and its plans, and anyone in it can add or remove people.
// People have to be on sheep to be in a group; anyone else can still be added
// to a plan on its own. With no one to pick yet, name it and share its code.

import React, { useEffect, useMemo, useState } from 'react';
import Avatar from '../../components/Avatar';
import { Field, ListRow, ListSection, Sheet } from '../../components/ui';
import { Group } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { notify } from '../../lib/alert';
import { nameFromPeople } from '../../lib/groups';
import WhoPicker, { useAudience } from '../ideas/WhoPicker';

export default function NewGroupSheet({ visible, groups, isDemo, onClose, onCreated }: {
  visible: boolean;
  /** Groups you're in: where the people you can add come from. */
  groups: Group[];
  isDemo: boolean;
  onClose: () => void;
  onCreated?: (group: Group) => void;
}) {
  const { createGroup } = useGroup();
  const { people, contacts, loading, addContact } = useAudience(visible, groups);
  const [name, setName] = useState('');
  const [userIds, setUserIds] = useState<Set<string>>(new Set());
  const [picking, setPicking] = useState(false);
  const [before, setBefore] = useState<Set<string>>(new Set());   // for Cancel in the picker
  const [busy, setBusy] = useState(false);

  // Opens straight to choosing people, like a new group chat.
  useEffect(() => {
    if (!visible) return;
    setName(''); setUserIds(new Set()); setBefore(new Set()); setPicking(true);
  }, [visible]);

  const members = useMemo(() => people.filter(p => userIds.has(p.profile.id)), [people, userIds]);
  const fallbackName = nameFromPeople(members.map(m => m.profile.full_name ?? m.profile.email ?? 'Someone'));

  async function create() {
    if (!userIds.size && !name.trim()) return;
    if (isDemo) return notify('Demo mode', 'Sign in to make a group.');
    setBusy(true);
    const { error, group } = await createGroup(name, '', { sharedCalendar: false, memberIds: Array.from(userIds) });
    setBusy(false);
    if (error || !group) return notify('Couldn’t make the group', error?.message ?? 'Try again.');
    onClose();
    onCreated?.(group);
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New Group"
      width={480}
      action={{ label: 'Create', onPress: create, disabled: !userIds.size && !name.trim(), loading: busy }}
    >
      <ListSection header={userIds.size ? `People · ${userIds.size + 1}` : 'People'} separatorInset={64}>
        {members.map(m => (
          <ListRow key={m.profile.id} leading={<Avatar person={m.profile} size={32} />} title={m.profile.full_name ?? m.profile.email ?? 'Someone'} />
        ))}
        <ListRow
          icon={userIds.size ? 'create-outline' : 'person-add-outline'}
          title={userIds.size ? 'Change People' : 'Add People'}
          tintTitle
          onPress={() => { setBefore(userIds); setPicking(true); }}
        />
      </ListSection>
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder={userIds.size ? fallbackName : 'Optional'}
        returnKeyType="done"
        hint={userIds.size ? 'Optional' : 'Starting with just you? Name it, then share its invite code.'}
      />
      {/* Inside this sheet so it shows on top of it on iPhone. */}
      <WhoPicker
        visible={visible && picking}
        title="Who’s in it?"
        usersOnly
        onDone={() => setPicking(false)}
        onCancel={() => { setUserIds(before); setPicking(false); if (!before.size) onClose(); }}
        loading={loading}
        groups={[]}
        people={people}
        contacts={contacts}
        groupIds={new Set()}
        userIds={userIds}
        contactIds={new Set()}
        onToggle={(k, id) => {
          if (k !== 'user') return;
          const next = new Set(userIds);
          if (next.has(id)) next.delete(id); else next.add(id);
          setUserIds(next);
        }}
        onAddPhone={addContact}
      />
    </Sheet>
  );
}
