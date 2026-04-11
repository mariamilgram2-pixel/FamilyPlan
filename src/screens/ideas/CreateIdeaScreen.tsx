import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { IdeasStackParamList, Idea } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';

type Props = { navigation: NativeStackNavigationProp<IdeasStackParamList, 'CreateIdea'> };

const STATUS_OPTIONS: { value: Idea['status']; label: string; emoji: string }[] = [
  { value: 'proposed', label: 'Proposed', emoji: '💭' },
  { value: 'planned', label: 'Planned', emoji: '✅' },
  { value: 'done', label: 'Done', emoji: '🎉' },
];

export default function CreateIdeaScreen({ navigation }: Props) {
  const { activeGroup } = useGroup();
  const { user } = useAuth();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<Idea['status']>('proposed');
  const [loading, setLoading] = useState(false);

  async function handleSave() {
    if (!title.trim()) {
      Alert.alert('Required', 'Please enter an idea title.');
      return;
    }
    if (!activeGroup || !user) return;

    setLoading(true);
    const { error } = await supabase.from('ideas').insert({
      group_id: activeGroup.id,
      title: title.trim(),
      description: description.trim() || null,
      status,
      created_by: user.id,
    });
    setLoading(false);

    if (error) {
      Alert.alert('Error', error.message);
    } else {
      navigation.goBack();
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
      <Text style={styles.sectionTitle}>New idea</Text>

      <Text style={styles.label}>Title *</Text>
      <TextInput
        style={styles.input}
        value={title}
        onChangeText={setTitle}
        placeholder="Weekend camping trip, theme dinner…"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.label}>Description</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={description}
        onChangeText={setDescription}
        placeholder="Share more details or context…"
        placeholderTextColor="#9CA3AF"
        multiline
        numberOfLines={4}
      />

      <Text style={styles.label}>Initial status</Text>
      <View style={styles.statusRow}>
        {STATUS_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.statusChip, status === opt.value && styles.statusChipActive]}
            onPress={() => setStatus(opt.value)}
          >
            <Text style={styles.statusEmoji}>{opt.emoji}</Text>
            <Text style={[styles.statusLabel, status === opt.value && styles.statusLabelActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save idea</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.cancelBtn} onPress={() => navigation.goBack()}>
        <Text style={styles.cancelBtnText}>Cancel</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  inner: { padding: 20, paddingBottom: 40 },
  sectionTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 20 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 16, backgroundColor: '#fff' },
  textArea: { height: 96, textAlignVertical: 'top' },
  statusRow: { flexDirection: 'row', gap: 10, marginBottom: 24 },
  statusChip: { flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: 12, backgroundColor: '#F3F4F6', borderWidth: 1.5, borderColor: 'transparent' },
  statusChipActive: { backgroundColor: '#EEF2FF', borderColor: '#6366F1' },
  statusEmoji: { fontSize: 20, marginBottom: 4 },
  statusLabel: { fontSize: 12, fontWeight: '600', color: '#6B7280' },
  statusLabelActive: { color: '#6366F1' },
  saveBtn: { backgroundColor: '#6366F1', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 4 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancelBtn: { alignItems: 'center', marginTop: 12, paddingVertical: 10 },
  cancelBtnText: { color: '#6B7280', fontSize: 15 },
});
