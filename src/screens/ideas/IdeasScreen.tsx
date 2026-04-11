import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Idea, IdeasStackParamList } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import IdeaCard from '../../components/IdeaCard';

type Props = { navigation: NativeStackNavigationProp<IdeasStackParamList, 'IdeasHome'> };

type StatusFilter = 'all' | 'proposed' | 'planned' | 'done';

const FILTERS: StatusFilter[] = ['all', 'proposed', 'planned', 'done'];

export default function IdeasScreen({ navigation }: Props) {
  const { activeGroup } = useGroup();
  const { user } = useAuth();
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);

  const fetchIdeas = useCallback(async () => {
    if (!activeGroup) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('ideas')
      .select('*, profiles(id, full_name, email), idea_votes(id, user_id)')
      .eq('group_id', activeGroup.id)
      .order('votes', { ascending: false });

    if (error) Alert.alert('Error', error.message);
    else setIdeas((data as Idea[]) ?? []);
    setLoading(false);
  }, [activeGroup]);

  useEffect(() => {
    fetchIdeas();
  }, [fetchIdeas]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchIdeas);
    return unsubscribe;
  }, [navigation, fetchIdeas]);

  async function handleVote(idea: Idea) {
    if (!user) return;

    const alreadyVoted = idea.idea_votes?.some((v) => v.user_id === user.id);

    if (alreadyVoted) {
      // Remove vote
      await supabase.from('idea_votes').delete().eq('idea_id', idea.id).eq('user_id', user.id);
      await supabase.from('ideas').update({ votes: Math.max(0, idea.votes - 1) }).eq('id', idea.id);
    } else {
      // Add vote
      await supabase.from('idea_votes').insert({ idea_id: idea.id, user_id: user.id });
      await supabase.from('ideas').update({ votes: idea.votes + 1 }).eq('id', idea.id);
    }

    fetchIdeas();
  }

  async function handleStatusChange(idea: Idea, status: Idea['status']) {
    await supabase.from('ideas').update({ status }).eq('id', idea.id);
    fetchIdeas();
  }

  const filtered = filter === 'all' ? ideas : ideas.filter((i) => i.status === filter);

  return (
    <View style={styles.container}>
      {/* Filter bar */}
      <View style={styles.filterBar}>
        {FILTERS.map((f) => (
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
        <ActivityIndicator style={{ marginTop: 40 }} color="#6366F1" />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <IdeaCard
              idea={item}
              currentUserId={user?.id ?? ''}
              onVote={() => handleVote(item)}
              onStatusChange={(status) => handleStatusChange(item, status)}
            />
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>💡</Text>
              <Text style={styles.emptyText}>No ideas yet</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateIdea')}>
                <Text style={styles.emptyLink}>Add the first one →</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        />
      )}

      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('CreateIdea')}>
        <Text style={styles.fabText}>+ New idea</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  filterBar: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  filterChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: 'transparent' },
  filterChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  filterChipTextActive: { color: '#6366F1' },
  empty: { alignItems: 'center', paddingTop: 60 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#6B7280', marginBottom: 8 },
  emptyLink: { color: '#6366F1', fontWeight: '600', fontSize: 15 },
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    backgroundColor: '#6366F1',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingVertical: 14,
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
