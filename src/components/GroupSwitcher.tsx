import React, { useMemo, useState } from 'react';
import { notify } from '../lib/alert';

import { useGroup } from '../contexts/GroupContext';
import { Field, Menu, MenuSection, Sheet } from './ui';
import { Group } from '../types';
import { isCalendar } from '../lib/groups';

// ─── Sheets ──────────────────────────────────────────────────────────────────

/** A group with a shared calendar (public.groups). Groups of friends without one are made in Friends. */
export function CreateGroupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { createGroup } = useGroup();
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!name.trim()) return notify('Name required', 'Give the group a name.');
    setBusy(true);
    const { error } = await createGroup(name.trim(), desc.trim());
    setBusy(false);
    if (error) return notify('Couldn’t create group', error.message);
    setName(''); setDesc('');
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New Shared Calendar"
      width={480}
      action={{ label: 'Create', onPress: submit, disabled: !name.trim(), loading: busy }}
    >
      <Field
        label="Name"
        value={name}
        onChangeText={setName}
        placeholder="The Cohens, Our house…"
        autoFocus
        returnKeyType="next"
        hint="For people who plan together all the time, like family. Everyone who joins sees its calendar. You’ll get a code to invite them."
      />
      <Field label="Description" value={desc} onChangeText={setDesc} placeholder="Optional — who’s this for?" multiline />
    </Sheet>
  );
}

export function JoinGroupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { joinGroup } = useGroup();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!code.trim()) return;
    setBusy(true);
    const { error } = await joinGroup(code.trim());
    setBusy(false);
    if (error) return notify('Couldn’t join', error.message);
    setCode('');
    onClose();
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Join a Group"
      width={480}
      action={{ label: 'Join', onPress: submit, disabled: !code.trim(), loading: busy }}
    >
      <Field
        label="Invite code"
        value={code}
        onChangeText={setCode}
        placeholder="ABC123"
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        mono
        hint="Ask someone in the group to share their code."
        onSubmitEditing={submit}
      />
    </Sheet>
  );
}

// ─── Hook: owns the two sheets so any surface can open them ──────────────────

export function useGroupSheets() {
  const [mode, setMode] = useState<null | 'create' | 'join'>(null);
  const sheets = (
    <>
      <CreateGroupSheet visible={mode === 'create'} onClose={() => setMode(null)} />
      <JoinGroupSheet visible={mode === 'join'} onClose={() => setMode(null)} />
    </>
  );
  return { openCreate: () => setMode('create'), openJoin: () => setMode('join'), sheets };
}

/** All groups the UI should list (demo mode has an active group but no list): shared calendars and groups. */
export function useVisibleGroups(): Group[] {
  const { groups, activeGroup } = useGroup();
  // Memoized: callers use this as an effect dependency.
  return useMemo(
    () => (groups.length > 0 ? groups : activeGroup ? [activeGroup] : []),
    [groups, activeGroup],
  );
}

/** Just the shared calendars: what Calendar, calendar colors and the group switcher list. */
export function useCalendarGroups(): Group[] {
  const visible = useVisibleGroups();
  return useMemo(() => visible.filter(isCalendar), [visible]);
}

// ─── Switcher: header title menu on compact ─────────────────────────────────

/**
 * Wraps a trigger (usually the screen title) in a menu listing your groups,
 * with create/join tucked into a second section.
 */
export default function GroupSwitcher({ children }: { children: (open: () => void) => React.ReactNode }) {
  const { activeGroup, setActiveGroup } = useGroup();
  const groups = useCalendarGroups();
  const { openCreate, openJoin, sheets } = useGroupSheets();

  const sections: MenuSection[] = [
    {
      title: 'Groups',
      items: groups.map(g => ({
        key: g.id, label: g.name, checked: g.id === activeGroup?.id, onSelect: () => setActiveGroup(g),
      })),
    },
    {
      items: [
        { key: 'new', label: 'New Shared Calendar…', icon: 'add-circle-outline', onSelect: openCreate },
        { key: 'join', label: 'Join with Code…', icon: 'enter-outline', onSelect: openJoin },
      ],
    },
  ];

  return (
    <>
      <Menu sections={sections} title="Switch group">{children}</Menu>
      {sheets}
    </>
  );
}
