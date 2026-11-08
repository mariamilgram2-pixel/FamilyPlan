import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Group, GroupMember } from '../types';
import { useAuth } from './AuthContext';
import { isCalendar, nameFromPeople } from '../lib/groupKinds';
import { tellAdded } from '../lib/groups';

export interface NewGroupOptions {
  /** Off for a group like a group chat (no shared calendar). Default on. */
  sharedCalendar?: boolean;
  /** People on sheep to put in it right away (groups without a shared calendar). */
  memberIds?: string[];
}

interface GroupContextValue {
  groups: Group[];
  activeGroup: Group | null;
  members: GroupMember[];
  loadingGroups: boolean;
  setActiveGroup: (group: Group) => void;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string, description: string, options?: NewGroupOptions) => Promise<{ error: Error | null; group: Group | null }>;
  joinGroup: (inviteCode: string) => Promise<{ error: Error | null }>;
  fetchMembers: (groupId: string) => Promise<void>;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user, profile } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  // Only the first load counts as loading: the app waits on it once, at
  // sign-in. Refreshing later (opening a plan, joining a group) happens
  // quietly, or the whole app would blink to a spinner and lose what was open.
  const loadedFor = useRef<string | null>(null);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    if (loadedFor.current !== user.id) setLoadingGroups(true);

    // With who's in each, so a group without a name can go by its people.
    const { data } = await supabase
      .from('group_members')
      .select('group_id, groups(*, group_members(user_id, profiles(full_name, email)))')
      .eq('user_id', user.id);

    const fetched = (data ?? [])
      .map((row: any) => row.groups)
      .filter(Boolean)
      .map(({ group_members: people, ...g }: any): Group => {
        if (g.name) return { ...g, named: true };
        const others = ((people ?? []) as any[]).filter(m => m.user_id !== user.id)
          .map(m => m.profiles?.full_name ?? m.profiles?.email ?? 'Someone');
        return { ...g, name: nameFromPeople(others), named: false };
      });

    setGroups(fetched);
    // The active group is a shared calendar (it's the calendar you're looking at).
    const calendars = fetched.filter(isCalendar);
    setActiveGroup(prev => (prev && calendars.some(g => g.id === prev.id) ? prev : calendars[0] ?? null));
    loadedFor.current = user.id;
    setLoadingGroups(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchGroups();
    else {
      setGroups([]);
      setActiveGroup(null);
      loadedFor.current = null;
      setLoadingGroups(false);
    }
  }, [user, fetchGroups]);

  async function createGroup(name: string, description: string, options: NewGroupOptions = {}) {
    if (!user) return { error: new Error('Not authenticated'), group: null };
    const sharedCalendar = options.sharedCalendar ?? true;

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name: name.trim() || null, description: description || null, created_by: user.id, shared_calendar: sharedCalendar } as any)
      .select()
      .single();

    if (error) return { error, group: null };

    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'admin',
    });
    // Everyone else, now that you're in it (anyone in a group like this can add people).
    const others = (options.memberIds ?? []).filter(id => id !== user.id);
    if (others.length) {
      const { error: addError } = await supabase.from('group_members').insert(others.map(id => ({ group_id: group.id, user_id: id, role: 'member' as const })));
      if (!addError) {
        const me = profile?.full_name?.split(' ')[0] ?? 'Someone';
        await tellAdded(others, { id: user.id, name: me, groupName: group.name ?? 'a group' });
      }
    }

    await fetchGroups();
    if (sharedCalendar) setActiveGroup(group);
    return { error: null, group };
  }

  async function joinGroup(inviteCode: string) {
    if (!user) return { error: new Error('Not authenticated') };

    const { data: group, error: findError } = await supabase
      .from('groups')
      .select('*')
      .eq('invite_code', inviteCode.toUpperCase())
      .single();

    if (findError || !group) return { error: new Error('Invalid invite code') };

    const { error } = await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'member',
    });

    if (error && error.code !== '23505') return { error }; // 23505 = unique violation (already member)

    await fetchGroups();
    if (isCalendar(group)) setActiveGroup(group);
    return { error: null };
  }

  async function fetchMembers(groupId: string) {
    const { data } = await supabase
      .from('group_members')
      .select('*')
      .eq('group_id', groupId);
    setMembers(data ?? []);
  }

  return (
    <GroupContext.Provider
      value={{ groups, activeGroup, members, loadingGroups, setActiveGroup, fetchGroups, createGroup, joinGroup, fetchMembers }}
    >
      {children}
    </GroupContext.Provider>
  );
}

export function useGroup() {
  const ctx = useContext(GroupContext);
  if (!ctx) throw new Error('useGroup must be used within GroupProvider');
  return ctx;
}
