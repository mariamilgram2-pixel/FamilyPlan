// "Make this a group": once you've picked two or more people for a plan or an
// idea, one quiet row offers to keep them together as a group (like a group
// chat, no shared calendar). Tapping it asks for an optional name, makes the
// group with them in it, and hands it back so the picker can swap the people
// for the group: the plan belongs to it from the start, and everyone in it
// sees it through every stage.

import React, { useState } from 'react';
import { View } from 'react-native';
import { Button, Field, ListRow, ListSection } from './ui';
import { useGroup } from '../contexts/GroupContext';
import { notify } from '../lib/alert';
import { nameFromPeople } from '../lib/groupKinds';
import { Group } from '../types';
import { space } from '../theme';

export default function MakeGroupRow({ userIds, names, isDemo, onMade }: {
  /** The people on sheep picked so far (you're added too). */
  userIds: string[];
  /** Their names, for what an unnamed group would be called. */
  names: string[];
  isDemo: boolean;
  onMade: (group: Group, memberIds: string[]) => void;
}) {
  const { createGroup } = useGroup();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  if (userIds.length < 2) return null;

  async function make() {
    if (isDemo) { setNaming(false); return notify('Demo mode', 'Sign in to make a group.'); }
    setBusy(true);
    const { error, group } = await createGroup(name, '', { sharedCalendar: false, memberIds: userIds });
    setBusy(false);
    if (error || !group) return notify('Couldn’t make the group', error?.message ?? 'Try again.');
    setNaming(false); setName('');
    onMade(group, userIds);
  }

  if (!naming) {
    return (
      <ListSection separatorInset={60}>
        <ListRow icon="people-outline" title="Make this a group" tintTitle onPress={() => setNaming(true)} />
      </ListSection>
    );
  }
  return (
    <View style={{ gap: space.s }}>
      <Field
        label="Name this group"
        value={name}
        onChangeText={setName}
        placeholder={nameFromPeople(names)}
        hint="Optional"
        autoFocus
        returnKeyType="done"
        onSubmitEditing={make}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: space.s }}>
        <Button label="Back" variant="plain" onPress={() => { setNaming(false); setName(''); }} />
        <Button label="Make Group" onPress={make} loading={busy} />
      </View>
    </View>
  );
}
