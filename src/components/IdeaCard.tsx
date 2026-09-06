import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Idea } from '../types';
import { colors, radius, shadow } from '../theme';
import AvatarStack from './AvatarStack';
import { AvatarPerson } from './Avatar';

interface Props {
  idea: Idea;
  currentUserId: string;
  voters?: AvatarPerson[];   // resolved profiles for idea_votes
  onVote: () => void;
  onStatusChange: (status: Idea['status']) => void;
}

const STATUS_CONFIG: Record<Idea['status'], { label: string; color: string; bg: string }> = {
  proposed: { label: 'Proposed', color: colors.rose,       bg: colors.roseTint  },
  planned:  { label: 'Planned',  color: colors.sheepDeep,  bg: colors.sheepTint },
  done:     { label: 'Done',     color: colors.muted,      bg: colors.ground2   },
};

const STATUS_ORDER: Idea['status'][] = ['proposed', 'planned', 'done'];

export default function IdeaCard({ idea, currentUserId, voters = [], onVote, onStatusChange }: Props) {
  const hasVoted = idea.idea_votes?.some((v) => v.user_id === currentUserId) ?? false;
  const statusCfg = STATUS_CONFIG[idea.status];

  function promptStatusChange() {
    Alert.alert(
      'Change status',
      `Update "${idea.title}" to:`,
      STATUS_ORDER.filter((s) => s !== idea.status).map((s) => ({
        text: STATUS_CONFIG[s].label,
        onPress: () => onStatusChange(s),
      })).concat([{ text: 'Cancel', style: 'cancel' } as any]),
    );
  }

  return (
    <View style={styles.card}>
      <TouchableOpacity style={[styles.voteCol, hasVoted && styles.voteColActive]} onPress={onVote} activeOpacity={0.7}>
        <Text style={[styles.voteArrow, hasVoted && styles.voteArrowActive]}>▲</Text>
        <Text style={[styles.voteCount, hasVoted && styles.voteCountActive]}>{idea.votes}</Text>
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text style={styles.title} numberOfLines={2}>{idea.title}</Text>
          <TouchableOpacity
            style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}
            onPress={promptStatusChange}
          >
            <Text style={[styles.statusText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
          </TouchableOpacity>
        </View>

        {idea.description ? (
          <Text style={styles.description} numberOfLines={3}>{idea.description}</Text>
        ) : null}

        <View style={styles.footer}>
          {idea.profiles?.full_name ? (
            <Text style={styles.meta}>by {idea.profiles.full_name}</Text>
          ) : <View />}
          {voters.length > 0 && (
            <AvatarStack people={voters} max={4} size={20} />
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 10,
    padding: 12,
    gap: 12,
    ...shadow.card,
  },
  voteCol: {
    width: 44,
    borderRadius: radius.md,
    backgroundColor: colors.ground2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  voteColActive: { backgroundColor: colors.sheepTint, borderColor: colors.sheep },
  voteArrow: { fontSize: 14, color: colors.muted, marginBottom: 2 },
  voteArrowActive: { color: colors.sheepDeep },
  voteCount: { fontSize: 15, fontWeight: '800', color: colors.ink2 },
  voteCountActive: { color: colors.sheepDeep },

  content: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.ink, marginRight: 8, letterSpacing: -0.1 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill },
  statusText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.2 },
  description: { fontSize: 13, color: colors.ink2, lineHeight: 19, marginBottom: 8 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  meta: { fontSize: 12, color: colors.muted },
});
