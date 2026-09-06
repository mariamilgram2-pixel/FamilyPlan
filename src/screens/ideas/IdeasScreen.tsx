import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Idea, IdeasStackParamList, Profile } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import IdeaCard from '../../components/IdeaCard';
import { AvatarPerson } from '../../components/Avatar';
import { colors, radius, shadow } from '../../theme';

type Props = { navigation: NativeStackNavigationProp<IdeasStackParamList, 'IdeasHome'> };

type StatusFilter = 'all' | 'proposed' | 'planned' | 'done';

const FILTERS: StatusFilter[] = ['all', 'proposed', 'planned', 'done'];

export default function IdeasScreen({ navigation }: Props) {
  const { activeGroup } = useGroup();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);

  const fetchAll = useCallback(async () => {
    if (!activeGroup) return;
    setLoading(true);
    const [{ data: ideasData, error }, { data: memberRows }] = await Promise.all([
      supabase.from('ideas')
        .select('*, profiles(id, full_name, email), idea_votes(id, user_id)')
        .eq('group_id', activeGroup.id)
        .order('votes', { ascending: false }),
      supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)')
        .eq('group_id', activeGroup.id),
    ]);
    if (error) Alert.alert('Error', error.message);
    else setIdeas((ideasData as Idea[]) ?? []);
    setMembers(((memberRows ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[]);
    setLoading(false);
  }, [activeGroup]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const unsub = navigation.addListener('focus', fetchAll);
    return unsub;
  }, [navigation, fetchAll]);

  const memberById = useMemo(() => {
    const m = new Map<string, Profile>();
    members.forEach(p => m.set(p.id, p));
    return m;
  }, [members]);

  async function handleVote(idea: Idea) {
    if (!user) return;
    const already = idea.idea_votes?.some(v => v.user_id === user.id);
    if (already) {
      await supabase.from('idea_votes').delete().eq('idea_id', idea.id).eq('user_id', user.id);
      await supabase.from('ideas').update({ votes: Math.max(0, idea.votes - 1) }).eq('id', idea.id);
    } else {
      await supabase.from('idea_votes').insert({ idea_id: idea.id, user_id: user.id });
      await supabase.from('ideas').update({ votes: idea.votes + 1 }).eq('id', idea.id);
    }
    fetchAll();
  }

  async function handleStatusChange(idea: Idea, status: Idea['status']) {
    await supabase.from('ideas').update({ status }).eq('id', idea.id);
    fetchAll();
  }

  const filtered = filter === 'all' ? ideas : ideas.filter(i => i.status === filter);

  return (
    <View style={styles.container}>
      <View style={styles.filterBar}>
        {FILTERS.map(f => (
          <TouchableOpacity
            key={f}
            style={[styles.filterChip, filter === f && styles.filterChipActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[styles.filterChipText, filter === f && styles.filterChipTextActive]}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.sheep} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(i) => i.id}
          renderItem={({ item }) => {
            const voters = (item.idea_votes ?? []).map(v => memberById.get(v.user_id)).filter(Boolean) as AvatarPerson[];
            return (
              <IdeaCard
                idea={item}
                currentUserId={user?.id ?? ''}
                voters={voters}
                onVote={() => handleVote(item)}
                onStatusChange={(status) => handleStatusChange(item, status)}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💡</Text>
              <Text style={styles.emptyTitle}>Nothing brewing yet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateIdea')}>
                <Text style={styles.emptyLink}>Add the first idea →</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 100 }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateIdea')} activeOpacity={0.85}>
        <Text style={styles.fabText}>＋ New idea</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.card,
  },
  filterChip: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.ground2,
    borderWidth: 1, borderColor: 'transparent',
  },
  filterChipActive: { backgroundColor: colors.sheepTint, borderColor: colors.sheep },
  filterChipText: { fontSize: 12, fontWeight: '600', color: colors.muted },
  filterChipTextActive: { color: colors.sheepDeep },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink2, marginBottom: 4 },
  emptyLink: { color: colors.sheepDeep, fontWeight: '600', fontSize: 14 },
  fab: {
    position: 'absolute',
    bottom: 20, right: 20,
    backgroundColor: colors.sheep,
    borderRadius: radius.pill,
    paddingHorizontal: 18, paddingVertical: 12,
    ...shadow.lifted,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
