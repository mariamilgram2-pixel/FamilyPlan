import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Event } from '../types';

interface Props {
  event: Event;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function durationLabel(start: string, end: string) {
  const mins = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000);
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function EventCard({ event }: Props) {
  return (
    <View style={styles.card}>
      <View style={styles.timeCol}>
        <Text style={styles.time}>{formatTime(event.start_time)}</Text>
        <Text style={styles.duration}>{durationLabel(event.start_time, event.end_time)}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.content}>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        {event.description ? (
          <Text style={styles.description} numberOfLines={2}>{event.description}</Text>
        ) : null}
        {event.profiles?.full_name ? (
          <Text style={styles.creator}>by {event.profiles.full_name}</Text>
        ) : null}
        {event.attendees.length > 0 && (
          <Text style={styles.attendees}>
            {event.attendees.length} attendee{event.attendees.length !== 1 ? 's' : ''}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  timeCol: { width: 64, alignItems: 'center', justifyContent: 'center' },
  time: { fontSize: 13, fontWeight: '700', color: '#6366F1', textAlign: 'center' },
  duration: { fontSize: 11, color: '#9CA3AF', marginTop: 2, textAlign: 'center' },
  divider: { width: 2, backgroundColor: '#EEF2FF', borderRadius: 1, marginHorizontal: 12 },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  description: { fontSize: 13, color: '#6B7280', marginBottom: 4 },
  creator: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  attendees: { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
});
