import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Event } from '../types';
import { colors, radius, shadow } from '../theme';
import AvatarStack from './AvatarStack';
import { AvatarPerson } from './Avatar';

interface Props {
  event: Event;
  attendees?: AvatarPerson[];   // resolved profiles for the attendee ids
  currentUserId?: string | null;
  groupName?: string | null;
  onPress?: () => void;
}

function formatTime(iso: string) {
  const d = new Date(iso);
  // Split hour/min from am/pm so we can stack them like the mockup.
  const parts = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }).split(' ');
  return { hm: parts[0], ampm: (parts[1] ?? '').toLowerCase() };
}

export default function EventCard({ event, attendees = [], currentUserId, groupName, onPress }: Props) {
  const { hm, ampm } = formatTime(event.start_time);
  const youAreGoing = !!currentUserId && event.attendees?.includes(currentUserId);

  return (
    <TouchableOpacity
      activeOpacity={onPress ? 0.75 : 1}
      onPress={onPress}
      style={[styles.card, youAreGoing && styles.cardRsvp]}
    >
      <View style={styles.timeCol}>
        <Text style={styles.time}>{hm}</Text>
        <Text style={styles.ampm}>{ampm}</Text>
      </View>

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>{event.title}</Text>
        <View style={styles.metaRow}>
          {youAreGoing ? (
            <View style={[styles.tag, styles.tagRose]}>
              <Text style={[styles.tagText, styles.tagTextRose]}>You're going</Text>
            </View>
          ) : groupName ? (
            <View style={styles.tag}>
              <Text style={styles.tagText}>{groupName}</Text>
            </View>
          ) : null}
          {event.location ? (
            <Text style={styles.metaText} numberOfLines={1}>· {event.location}</Text>
          ) : null}
        </View>
      </View>

      {attendees.length > 0 && (
        <AvatarStack people={attendees} max={3} size={24} style={styles.avatars} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 8,
    gap: 12,
    ...shadow.card,
  },
  cardRsvp: { borderColor: colors.roseTint },

  timeCol: { width: 44, alignItems: 'flex-start' },
  time: { fontSize: 13, fontWeight: '700', color: colors.ink2, fontVariant: ['tabular-nums'] as any, lineHeight: 15 },
  ampm: { fontSize: 10, fontWeight: '500', color: colors.muted, letterSpacing: 0.5, marginTop: 1 },

  body: { flex: 1, minWidth: 0 },
  title: { fontSize: 14.5, fontWeight: '600', color: colors.ink, letterSpacing: -0.1 },
  metaRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3, gap: 6, flexWrap: 'wrap' },
  metaText: { fontSize: 12, color: colors.muted, flexShrink: 1 },

  tag: {
    backgroundColor: colors.sheepTint,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  tagText: { fontSize: 10, fontWeight: '700', color: colors.sheepDeep, letterSpacing: 0.2 },
  tagRose: { backgroundColor: colors.roseTint },
  tagTextRose: { color: colors.rose },

  avatars: { marginLeft: 4 },
});
