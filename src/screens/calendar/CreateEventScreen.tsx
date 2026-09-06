import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RouteProp } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { CalendarStackParamList, Profile } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';

type Props = {
  navigation: NativeStackNavigationProp<CalendarStackParamList, 'CreateEvent'>;
  route: RouteProp<CalendarStackParamList, 'CreateEvent'>;
};

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

export default function CreateEventScreen({ navigation, route }: Props) {
  const { activeGroup } = useGroup();
  const { user } = useAuth();

  const initialDate = route.params?.date ?? new Date().toISOString().slice(0, 10);

  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(initialDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!activeGroup || activeGroup.id === 'demo') return;
    supabase
      .from('group_members')
      .select('profiles(id, full_name, email)')
      .eq('group_id', activeGroup.id)
      .then(({ data }) => {
        const profiles = (data ?? []).map((r: any) => r.profiles).filter(Boolean);
        setGroupMembers(profiles);
      });
  }, [activeGroup]);

  function toggleMember(id: string) {
    setSelectedMembers(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter an event title.');
      return;
    }
    if (!activeGroup || !user) {
      Alert.alert('Not signed in', 'Please sign in to save events.');
      return;
    }

    const startIso = new Date(`${date}T${startTime}:00`).toISOString();
    const endIso = new Date(`${date}T${endTime}:00`).toISOString();

    if (new Date(endIso) <= new Date(startIso)) {
      Alert.alert('Invalid time', 'End time must be after start time.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.from('events').insert({
      group_id: activeGroup.id,
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_time: startIso,
      end_time: endIso,
      created_by: user.id,
      attendees: [user.id, ...selectedMembers],
    });
    setLoading(false);

    if (error) Alert.alert('Error', error.message);
    else navigation.goBack();
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>New event</Text>

      <Text style={styles.label}>Title *</Text>
      <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="Movie night, birthday dinner…" placeholderTextColor="#9CA3AF" />

      <Text style={styles.label}>Location</Text>
      <TextInput style={styles.input} value={location} onChangeText={setLocation} placeholder="Address or place name" placeholderTextColor="#9CA3AF" />

      <Text style={styles.label}>Date</Text>
      <TextInput
        style={styles.input}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9CA3AF"
        keyboardType="numbers-and-punctuation"
      />

      <View style={styles.row}>
        <View style={{ flex: 1, marginRight: 8 }}>
          <Text style={styles.label}>Start time</Text>
          <TextInput style={styles.input} value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor="#9CA3AF" keyboardType="numbers-and-punctuation" />
        </View>
        <View style={{ flex: 1, marginLeft: 8 }}>
          <Text style={styles.label}>End time</Text>
          <TextInput style={styles.input} value={endTime} onChangeText={setEndTime} placeholder="10:00" placeholderTextColor="#9CA3AF" keyboardType="numbers-and-punctuation" />
        </View>
      </View>

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput style={[styles.input, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Any details…" placeholderTextColor="#9CA3AF" multiline numberOfLines={3} />

      {groupMembers.length > 0 && (
        <>
          <Text style={styles.label}>Invite group members</Text>
          <View style={styles.memberList}>
            {groupMembers.map(member => {
              const selected = selectedMembers.includes(member.id);
              return (
                <TouchableOpacity
                  key={member.id}
                  style={[styles.memberChip, selected && styles.memberChipSelected]}
                  onPress={() => toggleMember(member.id)}
                >
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(member.full_name ?? member.email ?? '?')[0].toUpperCase()}
                    </Text>
                  </View>
                  <Text style={[styles.memberName, selected && styles.memberNameSelected]} numberOfLines={1}>
                    {member.full_name ?? member.email}
                  </Text>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {groupMembers.length === 0 && activeGroup?.id !== 'demo' && (
        <Text style={styles.hint}>Sign in and join a group to invite members.</Text>
      )}

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save event</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3e7' },
  inner: { padding: 20, paddingBottom: 48 },
  sectionTitle: { fontSize: 22, fontWeight: '800', color: '#111827', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 16, backgroundColor: '#fff' },
  textArea: { height: 80, textAlignVertical: 'top' },
  row: { flexDirection: 'row' },
  memberList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  memberChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 24, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff', gap: 8 },
  memberChipSelected: { borderColor: '#8dc76d', backgroundColor: '#edf7e8' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#8dc76d', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  memberName: { fontSize: 14, color: '#374151', maxWidth: 100 },
  memberNameSelected: { color: '#8dc76d', fontWeight: '600' },
  checkmark: { color: '#8dc76d', fontWeight: '700', fontSize: 14 },
  hint: { fontSize: 13, color: '#9CA3AF', marginBottom: 16, fontStyle: 'italic' },
  saveBtn: { backgroundColor: '#8dc76d', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 10 },
  cancelBtnText: { color: '#6B7280', fontSize: 15 },
});
