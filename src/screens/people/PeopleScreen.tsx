import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, TextInput, Alert, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { Profile } from '../../types';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { colors, radius, shadow } from '../../theme';

interface PersonEntry {
  profile: Profile;
  groups: { id: string; name: string }[];
}

export default function PeopleScreen() {
  const { user } = useAuth();
  const { groups, activeGroup, setActiveGroup, joinGroup, createGroup } = useGroup();

  const [people, setPeople] = useState<PersonEntry[]>([]);
  const [membersByGroup, setMembersByGroup] = useState<Record<string, Profile[]>>({});
  const [loading, setLoading] = useState(false);

  const [modalMode, setModalMode] = useState<null | 'create' | 'join'>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (groups.length === 0) { setPeople([]); setMembersByGroup({}); return; }
    setLoading(true);

    const results = await Promise.all(
      groups.map(g =>
        supabase.from('group_members')
          .select('profiles(id, full_name, email, avatar_url)')
          .eq('group_id', g.id)
          .then(({ data }) => ({
            group: g,
            members: ((data ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[],
          }))
      )
    );

    const byGroup: Record<string, Profile[]> = {};
    const peopleMap = new Map<string, PersonEntry>();

    results.forEach(({ group, members }) => {
      byGroup[group.id] = members;
      members.forEach(p => {
        if (p.id === user?.id) return;
        const existing = peopleMap.get(p.id);
        if (existing) existing.groups.push({ id: group.id, name: group.name });
        else peopleMap.set(p.id, { profile: p, groups: [{ id: group.id, name: group.name }] });
      });
    });

    setMembersByGroup(byGroup);
    setPeople(Array.from(peopleMap.values()).sort((a, b) => {
      const an = a.profile.full_name ?? a.profile.email ?? '';
      const bn = b.profile.full_name ?? b.profile.email ?? '';
      return an.localeCompare(bn);
    }));
    setLoading(false);
  }, [groups, user]);

  useEffect(() => { load(); }, [load]);

  function openJoin()   { setInviteCode(''); setModalMode('join'); }
  function openCreate() { setNewName(''); setNewDesc(''); setModalMode('create'); }

  async function handleJoin() {
    if (!inviteCode.trim()) return Alert.alert('Required', 'Enter an invite code.');
    setBusy(true);
    const { error } = await joinGroup(inviteCode.trim());
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setModalMode(null);
    load();
  }

  async function handleCreate() {
    if (!newName.trim()) return Alert.alert('Required', 'Give the group a name.');
    setBusy(true);
    const { error } = await createGroup(newName.trim(), newDesc.trim());
    setBusy(false);
    if (error) return Alert.alert('Error', error.message);
    setModalMode(null);
    load();
  }

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Actions */}
        <View style={styles.actionsRow}>
          <TouchableOpacity style={[styles.actionCard, styles.actionCardPrimary]} onPress={openCreate} activeOpacity={0.85}>
            <Text style={styles.actionIconPrimary}>＋</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.actionTitlePrimary}>Create group</Text>
              <Text style={styles.actionHintPrimary}>Start planning with new people</Text>
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.joinCard} onPress={openJoin} activeOpacity={0.75}>
          <View style={styles.joinIcon}><Text style={styles.joinIconText}>#</Text></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.joinTitle}>Join with a code</Text>
            <Text style={styles.joinHint}>Ask someone in the group to share it</Text>
          </View>
          <Text style={styles.joinArrow}>›</Text>
        </TouchableOpacity>

        {/* Your groups */}
        <Text style={styles.sectionLabel}>YOUR GROUPS</Text>
        {loading ? (
          <ActivityIndicator color={colors.sheep} style={{ marginVertical: 20 }} />
        ) : groups.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>No groups yet</Text>
            <Text style={styles.emptyBody}>Groups hold your shared calendars. Create one above, or join with a code.</Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {groups.map(g => {
              const members = membersByGroup[g.id] ?? [];
              const others = members.filter(m => m.id !== user?.id);
              const isActive = activeGroup?.id === g.id;
              return (
                <TouchableOpacity
                  key={g.id}
                  style={[styles.groupCard, isActive && styles.groupCardActive]}
                  onPress={() => setActiveGroup(g)}
                  activeOpacity={0.8}
                >
                  <View style={styles.groupHead}>
                    <Text style={styles.groupName} numberOfLines={1}>{g.name}</Text>
                    {isActive && (
                      <View style={styles.activePill}>
                        <Text style={styles.activePillText}>ACTIVE</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.groupBody}>
                    {members.length > 0 ? (
                      <AvatarStack people={members as AvatarPerson[]} max={5} size={26} />
                    ) : (
                      <Text style={styles.groupMeta}>No members yet</Text>
                    )}
                    <Text style={styles.groupMeta}>
                      {members.length} member{members.length === 1 ? '' : 's'}
                      {others.length > 0 ? ` · ${others.length} besides you` : ''}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* People you plan with */}
        {people.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { marginTop: 28 }]}>PEOPLE YOU PLAN WITH</Text>
            <View style={styles.peopleList}>
              {people.map((p, idx) => (
                <View key={p.profile.id}>
                  {idx > 0 && <View style={styles.rowDivider} />}
                  <View style={styles.personRow}>
                    <Avatar person={p.profile} size={40} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.personName} numberOfLines={1}>{p.profile.full_name ?? p.profile.email}</Text>
                      <Text style={styles.personMeta} numberOfLines={1}>
                        in {p.groups.map(g => g.name).join(', ')}
                      </Text>
                    </View>
                    <Text style={styles.personCount}>{p.groups.length}</Text>
                  </View>
                </View>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Create / Join Modal */}
      <Modal visible={modalMode !== null} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setModalMode(null)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setModalMode(null)}><Text style={styles.modalCancel}>Cancel</Text></TouchableOpacity>
            <Text style={styles.modalTitle}>{modalMode === 'create' ? 'New group' : 'Join a group'}</Text>
            <TouchableOpacity onPress={modalMode === 'create' ? handleCreate : handleJoin} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.sheep} /> : <Text style={styles.modalSave}>{modalMode === 'create' ? 'Create' : 'Join'}</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20 }} keyboardShouldPersistTaps="handled">
            {modalMode === 'create' ? (
              <>
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.field}
                  value={newName}
                  onChangeText={setNewName}
                  placeholder="The Cohens, Book club…"
                  placeholderTextColor={colors.muted2}
                  autoFocus
                />
                <Text style={styles.fieldLabel}>Description (optional)</Text>
                <TextInput
                  style={[styles.field, { height: 70, textAlignVertical: 'top' }]}
                  value={newDesc}
                  onChangeText={setNewDesc}
                  placeholder="Who's this for?"
                  placeholderTextColor={colors.muted2}
                  multiline
                />
              </>
            ) : (
              <>
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
                <Text style={styles.hint}>Ask someone in the group to share the 6-character code.</Text>
              </>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },
  content: { padding: 20 },

  actionsRow: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  actionCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: 14, borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  actionCardPrimary: { backgroundColor: colors.sheep, borderColor: colors.sheep },
  actionIconPrimary: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.22)',
    color: '#fff', fontSize: 22, fontWeight: '600',
    textAlign: 'center', lineHeight: 40,
  },
  actionTitlePrimary: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionHintPrimary: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },

  joinCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.card, borderRadius: radius.lg,
    padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 10,
    ...shadow.card,
  },
  joinIcon: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.sheepTint,
    alignItems: 'center', justifyContent: 'center',
  },
  joinIconText: { fontSize: 18, fontWeight: '800', color: colors.sheepDeep },
  joinTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  joinHint: { fontSize: 12, color: colors.muted, marginTop: 2 },
  joinArrow: { fontSize: 22, color: colors.muted2, fontWeight: '300' },

  sectionLabel: {
    fontSize: 11, fontWeight: '800', color: colors.muted,
    letterSpacing: 1.4, marginTop: 24, marginBottom: 10, marginLeft: 4,
  },

  emptyCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 20,
  },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  emptyBody: { fontSize: 13, color: colors.muted, marginTop: 6, lineHeight: 18 },

  // Group cards
  groupCard: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border, padding: 14,
    ...shadow.card,
  },
  groupCardActive: { borderColor: colors.sheep, backgroundColor: colors.sheepTint },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  groupName: { fontSize: 16, fontWeight: '700', color: colors.ink, flexShrink: 1, letterSpacing: -0.1 },
  activePill: { backgroundColor: colors.sheepDeep, paddingHorizontal: 8, paddingVertical: 2, borderRadius: radius.pill },
  activePillText: { color: '#fff', fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  groupBody: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  groupMeta: { fontSize: 12, color: colors.muted, flexShrink: 1 },

  // People list
  peopleList: {
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    ...shadow.card,
  },
  personRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  personName: { fontSize: 15, fontWeight: '600', color: colors.ink },
  personMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  personCount: { fontSize: 12, color: colors.muted2, fontWeight: '700' },
  rowDivider: { height: 1, backgroundColor: colors.border, marginLeft: 60 },

  // Modal
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  modalCancel: { fontSize: 16, color: colors.muted },
  modalSave: { fontSize: 16, fontWeight: '700', color: colors.sheepDeep },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: 6, marginTop: 4 },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.ink, marginBottom: 12, backgroundColor: colors.card,
  },
  fieldMono: { fontSize: 20, letterSpacing: 2, fontWeight: '700', textAlign: 'center' },
  hint: { fontSize: 12, color: colors.muted, marginTop: 2 },
});
