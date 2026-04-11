import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet,
  ActivityIndicator, Alert,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { supabase } from '../../lib/supabase';
import { Event, CalendarStackParamList } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import EventCard from '../../components/EventCard';

type Props = { navigation: NativeStackNavigationProp<CalendarStackParamList, 'CalendarHome'> };

type MarkedDates = Record<string, { marked?: boolean; selected?: boolean; selectedColor?: string; dots?: { color: string }[] }>;

function toDateKey(iso: string) {
  return iso.slice(0, 10);
}

export default function CalendarScreen({ navigation }: Props) {
  const { activeGroup } = useGroup();
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedDate, setSelectedDate] = useState(toDateKey(new Date().toISOString()));
  const [loading, setLoading] = useState(true);

  const fetchEvents = useCallback(async () => {
    if (!activeGroup) return;
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

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  // Focus listener to refresh after creating an event
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', fetchEvents);
    return unsubscribe;
  }, [navigation, fetchEvents]);

  const markedDates: MarkedDates = {};
  events.forEach((e) => {
    const key = toDateKey(e.start_time);
    markedDates[key] = {
      ...(markedDates[key] ?? {}),
      marked: true,
      dots: [...((markedDates[key]?.dots ?? [])), { color: '#6366F1' }],
    };
  });
  if (selectedDate) {
    markedDates[selectedDate] = {
      ...(markedDates[selectedDate] ?? {}),
      selected: true,
      selectedColor: '#6366F1',
    };
  }

  const dayEvents = events.filter((e) => toDateKey(e.start_time) === selectedDate);

  return (
    <View style={styles.container}>
      <Calendar
        style={styles.calendar}
        markedDates={markedDates}
        markingType="multi-dot"
        onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
        theme={{
          todayTextColor: '#6366F1',
          selectedDayBackgroundColor: '#6366F1',
          arrowColor: '#6366F1',
          dotColor: '#6366F1',
        }}
      />

      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>
          {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
        </Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => navigation.navigate('CreateEvent', { date: selectedDate })}
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 32 }} color="#6366F1" />
      ) : (
        <FlatList
          data={dayEvents}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <EventCard event={item} />}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📅</Text>
              <Text style={styles.emptyText}>No events on this day</Text>
              <TouchableOpacity onPress={() => navigation.navigate('CreateEvent', { date: selectedDate })}>
                <Text style={styles.emptyLink}>Add one →</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  calendar: {
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  listHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  listTitle: { fontSize: 16, fontWeight: '700', color: '#111827', flex: 1 },
  addBtn: { backgroundColor: '#EEF2FF', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: '#6366F1', fontWeight: '700', fontSize: 14 },
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 40, marginBottom: 8 },
  emptyText: { fontSize: 16, color: '#6B7280', marginBottom: 8 },
  emptyLink: { color: '#6366F1', fontWeight: '600', fontSize: 15 },
});
