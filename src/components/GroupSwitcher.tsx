import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Modal,
  ScrollView, TextInput, ActivityIndicator, Alert,
} from 'react-native';
import { useGroup } from '../contexts/GroupContext';
import { supabase } from '../lib/supabase';
import { Group, Profile } from '../types';
import Avatar, { AvatarPerson } from './Avatar';
import AvatarStack from './AvatarStack';
import { colors, radius, shadow } from '../theme';

interface Props {
  compact?: boolean;   // used in header — smaller chip
}

export default function GroupSwitcher({ compact = true }: Props) {
  const { groups, activeGroup, setActiveGroup, createGroup, joinGroup, fetchGroups } = useGroup();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'list' | 'create' | 'join'>('list');
  const [memberMap, setMemberMap] = useState<Record<string, Profile[]>>({});
  const [loadingMembers, setLoadingMembers] = useState(false);

  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [busy, setBusy] = useState(false);

  // Load a handful of members per group for the avatar stacks.
  const loadMembers = useCallback(async () => {
    if (groups.length === 0) return;
    setLoadingMembers(true);
    const results = await Promise.all(
      groups.map(g =>
        supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)')
          .eq('group_id', g.id).limit(5)
          .then(({ data }) => ({
            id: g.id,
            members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[],
          }))
      )
    );
    const map: Record<string, Profile[]> = {};
    results.forEach(r => { map[r.id] = r.members; });
    setMemberMap(map);
    setLoadingMembers(false);
  }, [groups]);

  useEffect(() => { if (open) loadMembers(); }, [open, loadMembers]);

  function openModal() {
    setMode('list');
    setOpen(true);
  }

  function closeModal() { setOpen(false); }

  async function handleCreate() {
    if (!newName.trim()) return Alert.alert('Required', 'Give the group a name.');
    setBusy(true);
    const { error } = await createGroup(newName.trim(), newDesc.trim());
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setNewName(''); setNewDesc('');
    closeModal();
  }

  async function handleJoin() {
    if (!inviteCode.trim()) return Alert.alert('Required', 'Enter an invite code.');
    setBusy(true);
    const { error } = await joinGroup(inviteCode.trim());
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setInviteCode('');
    closeModal();
  }

  const activeMembers = activeGroup ? (memberMap[activeGroup.id] ?? []) : [];

  // ─── Chip (in header) ────────────────────────────────────────────────────
  const chip = (
    <TouchableOpacity onPress={openModal} activeOpacity={0.75} style={[styles.chip, compact && styles.chipCompact]}>
      {activeMembers.length > 0 ? (
        <AvatarStack people={activeMembers as AvatarPerson[]} max={3} size={compact ? 18 : 22} style={{ marginRight: 6 }} />
      ) : activeGroup ? (
        <View style={styles.chipDot} />
      ) : null}
      <Text style={styles.chipText} numberOfLines={1}>
        {activeGroup?.name ?? 'Pick a group'}
      </Text>
      <Text style={styles.chipChevron}>▾</Text>
    </TouchableOpacity>
  );

  return (
    <>
      {chip}

      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <TouchableOpacity onPress={closeModal}>
              <Text style={styles.sheetCancel}>Close</Text>
            </TouchableOpacity>
            <Text style={styles.sheetTitle}>
              {mode === 'list' ? 'Your groups' : mode === 'create' ? 'New group' : 'Join a group'}
            </Text>
            <View style={{ width: 50 }} />
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            {mode === 'list' && (
              <>
                {loadingMembers && groups.length > 0 && (
                  <ActivityIndicator color={colors.sheep} style={{ marginBottom: 12 }} />
                )}

                {groups.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <Text style={styles.emptyTitle}>No groups yet</Text>
                    <Text style={styles.emptyBody}>Groups are how friends and family share a calendar. Create one, or join with an invite code.</Text>
                  </View>
                ) : (
                  <View style={{ gap: 10 }}>
                    {groups.map(g => {
                      const isActive = activeGroup?.id === g.id;
                      const members = memberMap[g.id] ?? [];
                      return (
                        <TouchableOpacity
                          key={g.id}
                          onPress={() => { setActiveGroup(g); closeModal(); }}
                          activeOpacity={0.75}
                          style={[styles.groupRow, isActive && styles.groupRowActive]}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={styles.groupRowTop}>
                              <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                              {isActive && (
                                <View style={styles.activePill}>
                                  <Text style={styles.activePillText}>ACTIVE</Text>
                                </View>
                              )}
                            </View>
                            <View style={styles.groupRowBottom}>
                              {members.length > 0 && (
                                <AvatarStack people={members as AvatarPerson[]} max={4} size={20} />
                              )}
                              <Text style={styles.groupMeta}>
                                {members.length} member{members.length === 1 ? '' : 's'}
                              </Text>
                            </View>
                          </View>
                          <Text style={styles.groupArrow}>›</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={() => setMode('create')}>
                    <Text style={styles.actionBtnPrimaryText}>＋ Create</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setMode('join')}>
                    <Text style={styles.actionBtnText}>Join with code</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}

            {mode === 'create' && (
              <View>
                <Text style={styles.fieldLabel}>Group name</Text>
                <TextInput
                  style={styles.field}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="The Cohens, Book club…"
                  placeholderTextColor={colors.muted2}
                  autoFocus
                />
                <Text style={styles.fieldLabel}>Short description (optional)</Text>
                <TextInput
                  style={[styles.field, { height: 70, textAlignVertical: 'top' }]}
                  value={newDesc}
                  onChangeText={setNewDesc}
                  placeholder="Who's this for?"
                  placeholderTextColor={colors.muted2}
                  multiline
                />
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setMode('list')}>
                    <Text style={styles.actionBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleCreate} disabled={busy}>
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionBtnPrimaryText}>Create group</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}

            {mode === 'join' && (
              <View>
                <Text style={styles.fieldLabel}>Invite code</Text>
                <TextInput
                  style={[styles.field, styles.fieldMono]}
                  value={inviteCode}
                  onChangeText={setInviteCode}
                  placeholder="ABC123"
                  placeholderTextColor={colors.muted2}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoFocus
                />
                <Text style={styles.hint}>Ask someone in the group to share the code.</Text>
                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setMode('list')}>
                    <Text style={styles.actionBtnText}>Back</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionBtn, styles.actionBtnPrimary]} onPress={handleJoin} disabled={busy}>
                    {busy ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.actionBtnPrimaryText}>Join</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  // Chip
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: colors.card,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: radius.pill,
    paddingLeft: 6, paddingRight: 10, paddingVertical: 4,
    maxWidth: 220,
    ...shadow.card,
  },
  chipCompact: { paddingLeft: 4 },
  chipDot: {
    width: 8, height: 8, borderRadius: 4,
    backgroundColor: colors.sheep, marginHorizontal: 6,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: colors.ink, flexShrink: 1 },
  chipChevron: { fontSize: 10, color: colors.muted, marginLeft: 2 },

  // Sheet
  sheet: { flex: 1, backgroundColor: colors.ground },
  sheetHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
  },
  sheetTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  sheetCancel: { fontSize: 16, color: colors.muted },

  emptyCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 20,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyBody: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 },

  // Group row
  groupRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg, padding: 14,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  groupRowActive: { borderColor: colors.sheep, backgroundColor: colors.sheepTint },
  groupRowTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 15, fontWeight: '700', color: colors.ink, flexShrink: 1, letterSpacing: -0.1 },
  activePill: { backgroundColor: colors.sheepDeep, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  activePillText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  groupRowBottom: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6 },
  groupMeta: { fontSize: 12, color: colors.muted },
  groupArrow: { fontSize: 22, color: colors.muted2, fontWeight: '300' },

  // Actions
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 20 },
  actionBtn: {
    flex: 1, alignItems: 'center', paddingVertical: 12, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  actionBtnText: { color: colors.ink2, fontSize: 14, fontWeight: '700' },
  actionBtnPrimary: { backgroundColor: colors.sheep, borderColor: colors.sheep },
  actionBtnPrimaryText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // Fields
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: 6, marginTop: 4 },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.ink, marginBottom: 12, backgroundColor: colors.card,
  },
  fieldMono: { fontSize: 20, letterSpacing: 2, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 12, color: colors.muted, marginBottom: 6 },
});
