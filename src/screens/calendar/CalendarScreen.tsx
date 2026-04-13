import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert, Modal, TextInput, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';
import { Event, Profile } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import EventCard from '../../components/EventCard';

type MarkedDates = Record<string, any>;

function toDateKey(iso: string) { return iso.slice(0, 10); }

function formatDayHeader(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
  if (dateStr === todayStr) return 'Today';
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

export default function CalendarScreen() {
  const { activeGroup } = useGroup();
  const { user } = useAuth();
  const todayStr = toDateKey(new Date().toISOString());

  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayStr);
  const [loading, setLoading] = useState(false);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [groupMembers, setGroupMembers] = useState<Profile[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [stripVisible, setStripVisible] = useState(false);

  const fetchEvents = useCallback(async () => {
    if (!activeGroup || activeGroup.id === 'demo') { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase
      .from('events')
      .select('*, profiles(id, full_name, email)')
      .eq('group_id', activeGroup.id)
      .order('start_time', { ascending: true });
    if (error) Alert.alert('Error', error.message);
    else setEvents((data as Event[]) ?? []);
    setLoading(false);
  }, [activeGroup]);

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    if (!activeGroup || activeGroup.id === 'demo') return;
    supabase
      .from('group_members')
      .select('profiles(id, full_name, email)')
      .eq('group_id', activeGroup.id)
      .then(({ data }) => {
        setGroupMembers((data ?? []).map((r: any) => r.profiles).filter(Boolean));
      });
  }, [activeGroup]);

  function openModal() {
    setTitle(''); setLocation(''); setDescription('');
    setStartTime('09:00'); setEndTime('10:00'); setSelectedMembers([]);
    setShowModal(true);
  }

  function toggleMember(id: string) {
    setSelectedMembers(prev => prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!title.trim()) { Alert.alert('Required', 'Please enter a title.'); return; }
    if (!activeGroup || !user) { Alert.alert('Not signed in', 'Sign in to save events.'); return; }

    const startIso = new Date(`${selectedDate}T${startTime}:00`).toISOString();
    const endIso = new Date(`${selectedDate}T${endTime}:00`).toISOString();
    if (new Date(endIso) <= new Date(startIso)) { Alert.alert('Invalid time', 'End time must be after start time.'); return; }

    setSaving(true);
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
    setSaving(false);
    if (error) { Alert.alert('Error', error.message); return; }
    setShowModal(false);
    fetchEvents();
  }

  const markedDates: MarkedDates = {};
  events.forEach(e => {
    const key = toDateKey(e.start_time);
    markedDates[key] = { ...markedDates[key], marked: true, dots: [...(markedDates[key]?.dots ?? []), { color: '#6366F1' }] };
  });
  markedDates[selectedDate] = { ...markedDates[selectedDate], selected: true, selectedColor: '#6366F1' };

  const dayEvents = events.filter(e => toDateKey(e.start_time) === selectedDate);

  return (
    <View style={styles.container}>
      <View style={styles.calendarWrapper}>
        <Calendar
          style={styles.calendar}
          markedDates={markedDates}
          markingType="multi-dot"
          onDayPress={(day: DateData) => { setSelectedDate(day.dateString); setStripVisible(true); }}
          theme={{ todayTextColor: '#6366F1', selectedDayBackgroundColor: '#6366F1', arrowColor: '#6366F1', dotColor: '#6366F1' }}
        />
        {stripVisible && (
          <View style={styles.stripRow}>
            <TouchableOpacity style={styles.addEventStrip} onPress={openModal} activeOpacity={0.75}>
              <Text style={styles.addEventStripText}>＋  Add event on {new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.stripToggle} onPress={() => setStripVisible(false)} activeOpacity={0.7}>
              <Text style={styles.stripToggleText}>▼</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Add Event Modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Event</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#6366F1" /> : <Text style={styles.modalSave}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <Text style={styles.dateChip}>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>

            <Text style={styles.fieldLabel}>Title *</Text>
            <TextInput style={styles.field} value={title} onChangeText={setTitle} placeholder="Movie night, birthday dinner…" placeholderTextColor="#9CA3AF" autoFocus />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.field} value={location} onChangeText={setLocation} placeholder="Address or place name" placeholderTextColor="#9CA3AF" />

            <View style={styles.timeRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Start</Text>
                <TextInput style={styles.field} value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor="#9CA3AF" keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.fieldLabel}>End</Text>
                <TextInput style={styles.field} value={endTime} onChangeText={setEndTime} placeholder="10:00" placeholderTextColor="#9CA3AF" keyboardType="numbers-and-punctuation" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Notes (optional)</Text>
            <TextInput style={[styles.field, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Any details…" placeholderTextColor="#9CA3AF" multiline numberOfLines={3} />

            {groupMembers.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Invite members</Text>
                <View style={styles.memberList}>
                  {groupMembers.map(m => {
                    const selected = selectedMembers.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} style={[styles.memberChip, selected && styles.memberChipActive]} onPress={() => toggleMember(m.id)}>
                        <View style={styles.avatar}><Text style={styles.avatarText}>{(m.full_name ?? m.email ?? '?')[0].toUpperCase()}</Text></View>
                        <Text style={[styles.memberName, selected && styles.memberNameActive]} numberOfLines={1}>{m.full_name ?? m.email}</Text>
                        {selected && <Text style={styles.checkmark}>✓</Text>}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  calendarWrapper: { flexShrink: 0, maxHeight: 400 },
  calendar: { maxHeight: 360 },
  stripRow: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#C7D2FE', backgroundColor: '#EEF2FF' },
  addEventStrip: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 9 },
  addEventStripText: { color: '#6366F1', fontWeight: '700', fontSize: 14 },
  stripToggle: { paddingHorizontal: 14, paddingVertical: 9 },
  stripToggleText: { color: '#6366F1', fontSize: 12, fontWeight: '700' },
  dayHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14 },
  dayTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  daySubtitle: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  addBtn: { backgroundColor: '#6366F1', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#6B7280', marginBottom: 8 },
  emptyLink: { color: '#6366F1', fontWeight: '600', fontSize: 15 },
  // Modal
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#fff' },
  modalTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  modalCancel: { fontSize: 16, color: '#6B7280' },
  modalSave: { fontSize: 16, fontWeight: '700', color: '#6366F1' },
  modalBody: { flex: 1, backgroundColor: '#F9FAFB', padding: 20 },
  dateChip: { alignSelf: 'flex-start', backgroundColor: '#EEF2FF', color: '#6366F1', fontWeight: '600', fontSize: 13, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  field: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 16, backgroundColor: '#fff' },
  textArea: { height: 80, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row' },
  memberList: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 24, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff', gap: 8 },
  memberChipActive: { borderColor: '#6366F1', backgroundColor: '#EEF2FF' },
  avatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#6366F1', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  memberName: { fontSize: 14, color: '#374151', maxWidth: 100 },
  memberNameActive: { color: '#6366F1', fontWeight: '600' },
  checkmark: { color: '#6366F1', fontWeight: '700' },
});
