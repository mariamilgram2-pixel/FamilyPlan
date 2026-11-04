// Everyone you plan with: members across all your groups, and the groups
// themselves with their member lists. Loaded when a picker opens.

import { useEffect, useState } from 'react';
import { supabase } from './supabase';
import { DEMO_EXTRA_GROUPS, DEMO_MEMBERS, DEMO_ME, DEMO_PEOPLE, isDemoGroup } from './demo';
import { Group, Profile } from '../types';
import { useGroup } from '../contexts/GroupContext';

export interface CirclePerson { profile: Profile; groupIds: string[]; groupNames: string[] }
export interface CircleGroup { group: Group; memberIds: string[] }

export function useCircle(active: boolean, meId: string | null) {
  const { groups, activeGroup } = useGroup();
  const [people, setPeople] = useState<CirclePerson[]>([]);
  const [circleGroups, setCircleGroups] = useState<CircleGroup[]>([]);
  const [loading, setLoading] = useState(false);
  const isDemo = isDemoGroup(activeGroup);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    (async () => {
      let rows: { group: Group; members: Profile[] }[];
      if (isDemo) {
        rows = [
          { group: activeGroup!, members: DEMO_MEMBERS },
          ...DEMO_EXTRA_GROUPS.map(g => ({ group: g.group, members: DEMO_PEOPLE.filter(m => g.memberIds.includes(m.id)) })),
        ];
      } else {
        const list = groups.length ? groups : activeGroup ? [activeGroup] : [];
        setLoading(true);
        rows = await Promise.all(list.map(g =>
          supabase.from('group_members').select('profiles(id, full_name, email, avatar_url, birthday)').eq('group_id', g.id)
            .then(({ data }) => ({ group: g, members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[] })),
        ));
      }
      if (cancelled) return;

      const map = new Map<string, CirclePerson>();
      rows.forEach(({ group, members }) => members.forEach(p => {
        if (p.id === (meId ?? DEMO_ME)) return;
        const hit = map.get(p.id);
        if (hit) { hit.groupIds.push(group.id); hit.groupNames.push(group.name); }
        else map.set(p.id, { profile: p, groupIds: [group.id], groupNames: [group.name] });
      }));
      setPeople(Array.from(map.values()).sort((a, b) =>
        (a.profile.full_name ?? a.profile.email ?? '').localeCompare(b.profile.full_name ?? b.profile.email ?? '')));
      // Active group first; the rest as they come.
      setCircleGroups(rows
        .map(r => ({ group: r.group, memberIds: r.members.map(m => m.id) }))
        .sort((a, b) => Number(b.group.id === activeGroup?.id) - Number(a.group.id === activeGroup?.id)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [active, groups, activeGroup, isDemo, meId]);

  return { people, groups: circleGroups, loading };
}
