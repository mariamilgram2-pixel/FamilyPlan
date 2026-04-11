import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { Idea } from '../types';

interface Props {
  idea: Idea;
  currentUserId: string;
  onVote: () => void;
  onStatusChange: (status: Idea['status']) => void;
}

const STATUS_CONFIG: Record<Idea['status'], { label: string; color: string; bg: string }> = {
  proposed: { label: 'Proposed', color: '#D97706', bg: '#FEF3C7' },
  planned: { label: 'Planned', color: '#059669', bg: '#D1FAE5' },
  done: { label: 'Done', color: '#6366F1', bg: '#EEF2FF' },
};

const STATUS_ORDER: Idea['status'][] = ['proposed', 'planned', 'done'];

export default function IdeaCard({ idea, currentUserId, onVote, onStatusChange }: Props) {
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
      <View style={styles.voteCol}>
        <TouchableOpacity style={[styles.voteBtn, hasVoted && styles.voteBtnActive]} onPress={onVote}>
          <Text style={[styles.voteArrow, hasVoted && styles.voteArrowActive]}>▲</Text>
        </TouchableOpacity>
        <Text style={[styles.voteCount, hasVoted && styles.voteCountActive]}>{idea.votes}</Text>
      </View>

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

        {idea.profiles?.full_name ? (
          <Text style={styles.meta}>Suggested by {idea.profiles.full_name}</Text>
        ) : null}
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
  voteCol: { width: 44, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  voteBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  voteBtnActive: { backgroundColor: '#EEF2FF' },
  voteArrow: { fontSize: 16, color: '#9CA3AF' },
  voteArrowActive: { color: '#6366F1' },
  voteCount: { fontSize: 16, fontWeight: '800', color: '#6B7280' },
  voteCountActive: { color: '#6366F1' },
  content: { flex: 1 },
  topRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 },
  title: { flex: 1, fontSize: 15, fontWeight: '700', color: '#111827', marginRight: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  statusText: { fontSize: 12, fontWeight: '700' },
  description: { fontSize: 13, color: '#6B7280', lineHeight: 19, marginBottom: 6 },
  meta: { fontSize: 12, color: '#9CA3AF' },
});
