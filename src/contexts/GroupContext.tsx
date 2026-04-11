import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { Group, GroupMember } from '../types';
import { useAuth } from './AuthContext';

interface GroupContextValue {
  groups: Group[];
  activeGroup: Group | null;
  members: GroupMember[];
  loadingGroups: boolean;
  setActiveGroup: (group: Group) => void;
  fetchGroups: () => Promise<void>;
  createGroup: (name: string, description: string) => Promise<{ error: Error | null; group: Group | null }>;
  joinGroup: (inviteCode: string) => Promise<{ error: Error | null }>;
  fetchMembers: (groupId: string) => Promise<void>;
}

const GroupContext = createContext<GroupContextValue | null>(null);

export function GroupProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [activeGroup, setActiveGroup] = useState<Group | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [loadingGroups, setLoadingGroups] = useState(true);

  const fetchGroups = useCallback(async () => {
    if (!user) return;
    setLoadingGroups(true);

    const { data } = await supabase
      .from('group_members')
      .select('group_id, groups(*)')
      .eq('user_id', user.id);

    const fetched = (data ?? [])
      .map((row: any) => row.groups as Group)
      .filter(Boolean);

    setGroups(fetched);
    if (fetched.length > 0 && !activeGroup) setActiveGroup(fetched[0]);
    setLoadingGroups(false);
  }, [user]);

  useEffect(() => {
    if (user) fetchGroups();
    else {
      setGroups([]);
      setActiveGroup(null);
      setLoadingGroups(false);
    }
  }, [user, fetchGroups]);

  async function createGroup(name: string, description: string) {
    if (!user) return { error: new Error('Not authenticated'), group: null };

    const { data: group, error } = await supabase
      .from('groups')
      .insert({ name, description: description || null, created_by: user.id })
      .select()
      .single();

    if (error) return { error, group: null };

    await supabase.from('group_members').insert({
      group_id: group.id,
      user_id: user.id,
      role: 'admin',
    });

    await fetchGroups();
    setActiveGroup(group);
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
    setActiveGroup(group);
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
