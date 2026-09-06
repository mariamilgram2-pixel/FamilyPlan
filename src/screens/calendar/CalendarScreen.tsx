import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  ActivityIndicator, Alert, Modal, TextInput, ScrollView,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { Calendar, DateData } from 'react-native-calendars';
import { supabase } from '../../lib/supabase';
import { Event, Idea, Profile } from '../../types';
import { useGroup } from '../../contexts/GroupContext';
import { useAuth } from '../../contexts/AuthContext';
import EventCard from '../../components/EventCard';
import Avatar, { AvatarPerson } from '../../components/Avatar';
import AvatarStack from '../../components/AvatarStack';
import { colors, radius, shadow } from '../../theme';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateKey(iso: string) { return iso.slice(0, 10); }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function relativeDay(dateStr: string): string {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr + 'T00:00:00');
  const diff = Math.round((target.getTime() - today.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff > 1 && diff < 7) return `in ${diff} days`;
  if (diff >= 7 && diff < 14) return 'next week';
  if (diff < 0 && diff > -7) return `${Math.abs(diff)}d ago`;
  return '';
}

function formatDayLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }).toUpperCase();
}

type AgendaItem =
  | { kind: 'event'; event: Event; attendees: AvatarPerson[] }
  | { kind: 'idea'; idea: Idea; voters: AvatarPerson[] };

type DayGroup = { key: string; label: string; rel: string; items: AgendaItem[] };

// ─── Component ────────────────────────────────────────────────────────────────

export default function CalendarScreen() {
  const { activeGroup } = useGroup();
  const { user } = useAuth();
  const [events, setEvents] = useState<Event[]>([]);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [members, setMembers] = useState<Profile[]>([]);
  const [selectedDate, setSelectedDate] = useState(todayKey());
  const [loading, setLoading] = useState(false);

  // Add-event modal
  const [showModal, setShowModal] = useState(false);
  const [title, setTitle] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // ─── Data ────────────────────────────────────────────────────────────────
  const fetchAll = useCallback(async () => {
    if (!activeGroup || activeGroup.id === 'demo') { setLoading(false); return; }
    setLoading(true);
    const [{ data: eventData }, { data: ideaData }, { data: memberRows }] = await Promise.all([
      supabase.from('events').select('*, profiles(id, full_name, email)')
        .eq('group_id', activeGroup.id).order('start_time', { ascending: true }),
      supabase.from('ideas').select('*, profiles(id, full_name, email), idea_votes(id, user_id)')
        .eq('group_id', activeGroup.id).eq('status', 'proposed').order('votes', { ascending: false }),
      supabase.from('group_members').select('profiles(id, full_name, email, avatar_url)')
        .eq('group_id', activeGroup.id),
    ]);
    setEvents((eventData as Event[]) ?? []);
    setIdeas((ideaData as Idea[]) ?? []);
    setMembers(((memberRows ?? []).map((r: any) => r.profiles).filter(Boolean)) as Profile[]);
    setLoading(false);
  }, [activeGroup]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ─── Derived state ───────────────────────────────────────────────────────
  const memberById = useMemo(() => {
    const m = new Map<string, Profile>();
    members.forEach(p => m.set(p.id, p));
    return m;
  }, [members]);

  const dayGroups: DayGroup[] = useMemo(() => {
    const today = todayKey();
    const groups = new Map<string, AgendaItem[]>();
    events
      .filter(e => toDateKey(e.start_time) >= today)
      .slice(0, 60)
      .forEach(e => {
        const key = toDateKey(e.start_time);
        const attendees = (e.attendees ?? []).map(id => memberById.get(id)).filter(Boolean) as AvatarPerson[];
        const item: AgendaItem = { kind: 'event', event: e, attendees };
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(item);
      });
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => ({
        key,
        label: formatDayLabel(key),
        rel: relativeDay(key),
        items,
      }));
  }, [events, memberById]);

  const proposalItems: AgendaItem[] = useMemo(() => {
    return ideas.map(i => {
      const voters = (i.idea_votes ?? []).map(v => memberById.get(v.user_id)).filter(Boolean) as AvatarPerson[];
      return { kind: 'idea', idea: i, voters };
    });
  }, [ideas, memberById]);

  const markedDates = useMemo(() => {
    const m: Record<string, any> = {};
    events.forEach(e => {
      const key = toDateKey(e.start_time);
      const youIn = !!user && e.attendees?.includes(user.id);
      const dotColor = youIn ? colors.rose : colors.sheep;
      const existing = m[key] ?? { dots: [] };
      const dots = [...existing.dots, { color: dotColor }].slice(0, 3);
      m[key] = { ...existing, marked: true, dots };
    });
    m[selectedDate] = {
      ...(m[selectedDate] ?? {}),
      selected: true,
      selectedColor: colors.sheep,
      selectedTextColor: '#fff',
    };
    return m;
  }, [events, selectedDate, user]);

  // ─── Handlers ────────────────────────────────────────────────────────────
  function openAddModal(dateKey: string = selectedDate) {
    setSelectedDate(dateKey);
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
    fetchAll();
  }

  // ─── Render ──────────────────────────────────────────────────────────────
  const invitableMembers = members.filter(m => m.id !== user?.id);

  return (
    <View style={styles.container}>
      {/* Compressed calendar block */}
      <View style={styles.calWrap}>
        <Calendar
          style={styles.calendar}
          markedDates={markedDates}
          markingType="multi-dot"
          onDayPress={(day: DateData) => setSelectedDate(day.dateString)}
          theme={{
            calendarBackground: colors.card,
            monthTextColor: colors.ink,
            textMonthFontWeight: '600',
            textMonthFontSize: 16,
            textSectionTitleColor: colors.muted2,
            textDayHeaderFontSize: 10,
            textDayHeaderFontWeight: '700',
            dayTextColor: colors.ink2,
            textDayFontSize: 13,
            textDayFontWeight: '500',
            todayTextColor: colors.sheepDeep,
            selectedDayBackgroundColor: colors.sheep,
            selectedDayTextColor: '#fff',
            arrowColor: colors.ink2,
            dotColor: colors.sheep,
            'stylesheet.calendar.header': {
              header: {
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingHorizontal: 8,
                marginTop: 4,
                marginBottom: 4,
              },
            },
          }}
        />
      </View>

      {/* Agenda header */}
      <View style={styles.agendaHead}>
        <Text style={styles.agendaTitle}>Upcoming</Text>
        <TouchableOpacity style={styles.addPill} onPress={() => openAddModal()} activeOpacity={0.75}>
          <Text style={styles.addPillText}>＋ Add event</Text>
        </TouchableOpacity>
      </View>

      {/* Agenda list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 24 }} color={colors.sheep} />
      ) : (
        <FlatList
          style={{ flex: 1 }}
          contentContainerStyle={styles.agendaBody}
          data={dayGroups}
          keyExtractor={(g) => g.key}
          ListHeaderComponent={
            proposalItems.length > 0 ? (
              <View style={styles.proposalSection}>
                <View style={styles.dayLabelRow}>
                  <Text style={styles.dayLabel}>WAITING FOR A DATE</Text>
                  <Text style={styles.dayRel}>{proposalItems.length} idea{proposalItems.length === 1 ? '' : 's'}</Text>
                </View>
                {proposalItems.slice(0, 3).map(item => item.kind === 'idea' ? (
                  <ProposalCard key={item.idea.id} idea={item.idea} voters={item.voters} />
                ) : null)}
              </View>
            ) : null
          }
          renderItem={({ item: group }) => (
            <View style={styles.dayGroup}>
              <View style={styles.dayLabelRow}>
                <Text style={styles.dayLabel}>{group.label}</Text>
                {group.rel ? <Text style={styles.dayRel}>{group.rel}</Text> : null}
              </View>
              {group.items.map(it => it.kind === 'event' ? (
                <EventCard
                  key={it.event.id}
                  event={it.event}
                  attendees={it.attendees}
                  currentUserId={user?.id ?? null}
                  groupName={activeGroup?.name}
                />
              ) : null)}
            </View>
          )}
          ListEmptyComponent={
            proposalItems.length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>🐑</Text>
                <Text style={styles.emptyTitle}>No plans yet</Text>
                <Text style={styles.emptyBody}>Tap the + to add your first event.</Text>
              </View>
            ) : null
          }
        />
      )}

      {/* FAB */}
      <TouchableOpacity style={styles.fab} onPress={() => openAddModal()} activeOpacity={0.85}>
        <Text style={styles.fabPlus}>＋</Text>
      </TouchableOpacity>

      {/* Add-event modal */}
      <Modal visible={showModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowModal(false)}>
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ground }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.modalHeader}>
            <TouchableOpacity onPress={() => setShowModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </TouchableOpacity>
            <Text style={styles.modalTitle}>New Event</Text>
            <TouchableOpacity onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color={colors.sheep} /> : <Text style={styles.modalSave}>Save</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
            <View style={styles.dateChip}>
              <Text style={styles.dateChipText}>{new Date(selectedDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</Text>
            </View>

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput style={styles.field} value={title} onChangeText={setTitle} placeholder="Movie night, birthday dinner…" placeholderTextColor={colors.muted2} autoFocus />

            <Text style={styles.fieldLabel}>Location</Text>
            <TextInput style={styles.field} value={location} onChangeText={setLocation} placeholder="Address or place name" placeholderTextColor={colors.muted2} />

            <View style={styles.timeRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={styles.fieldLabel}>Start</Text>
                <TextInput style={styles.field} value={startTime} onChangeText={setStartTime} placeholder="09:00" placeholderTextColor={colors.muted2} keyboardType="numbers-and-punctuation" />
              </View>
              <View style={{ flex: 1, marginLeft: 8 }}>
                <Text style={styles.fieldLabel}>End</Text>
                <TextInput style={styles.field} value={endTime} onChangeText={setEndTime} placeholder="10:00" placeholderTextColor={colors.muted2} keyboardType="numbers-and-punctuation" />
              </View>
            </View>

            <Text style={styles.fieldLabel}>Notes</Text>
            <TextInput style={[styles.field, styles.textArea]} value={description} onChangeText={setDescription} placeholder="Any details…" placeholderTextColor={colors.muted2} multiline numberOfLines={3} />

            {invitableMembers.length > 0 && (
              <>
                <Text style={styles.fieldLabel}>Invite</Text>
                <View style={styles.memberList}>
                  {invitableMembers.map(m => {
                    const selected = selectedMembers.includes(m.id);
                    return (
                      <TouchableOpacity key={m.id} style={[styles.memberChip, selected && styles.memberChipActive]} onPress={() => toggleMember(m.id)}>
                        <Avatar person={m} size={22} />
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

// ─── Proposal card (idea rendered inline in the agenda) ──────────────────────

function ProposalCard({ idea, voters }: { idea: Idea; voters: AvatarPerson[] }) {
  const totalVotes = idea.votes ?? 0;
  return (
    <View style={styles.proposalCard}>
      <View style={styles.timeColProp}>
        <Text style={styles.timeProp}>TBD</Text>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <View style={styles.proposalTitleRow}>
          <View style={styles.ideaPill}>
            <Text style={styles.ideaPillText}>IDEA</Text>
          </View>
          <Text style={styles.proposalTitle} numberOfLines={1}>{idea.title}</Text>
        </View>
        <Text style={styles.proposalMeta} numberOfLines={1}>
          {totalVotes > 0 ? `${totalVotes} said yes` : 'No votes yet'}
          {idea.profiles?.full_name ? ` · by ${idea.profiles.full_name}` : ''}
        </Text>
      </View>
      {voters.length > 0 && <AvatarStack people={voters} max={3} size={22} />}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.ground },

  calWrap: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    paddingBottom: 4,
  },
  calendar: { paddingBottom: 4 },

  agendaHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8,
  },
  agendaTitle: {
    fontSize: 11, fontWeight: '800', color: colors.muted,
    letterSpacing: 1.4, textTransform: 'uppercase',
  },
  addPill: {
    backgroundColor: colors.sheepTint,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill,
  },
  addPillText: { color: colors.sheepDeep, fontSize: 12, fontWeight: '700' },

  agendaBody: { paddingHorizontal: 16, paddingBottom: 100 },
  dayGroup: { marginTop: 8 },
  dayLabelRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-start',
    paddingHorizontal: 4, paddingBottom: 6, gap: 8,
  },
  dayLabel: { fontSize: 11, fontWeight: '800', color: colors.ink2, letterSpacing: 1 },
  dayRel: { fontSize: 11, fontWeight: '500', color: colors.muted2, letterSpacing: 0.4 },

  // Proposal
  proposalSection: { marginTop: 4 },
  proposalCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: colors.ground2,
    borderWidth: 1, borderStyle: 'dashed', borderColor: colors.border2,
    borderRadius: radius.lg, padding: 12, marginBottom: 8,
  },
  timeColProp: { width: 44 },
  timeProp: { fontSize: 12, fontWeight: '700', color: colors.rose, letterSpacing: 0.4 },
  proposalTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ideaPill: {
    backgroundColor: colors.roseTint,
    paddingHorizontal: 7, paddingVertical: 2,
    borderRadius: radius.pill,
  },
  ideaPillText: { color: colors.rose, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  proposalTitle: { fontSize: 14, fontWeight: '600', color: colors.ink, flexShrink: 1, letterSpacing: -0.1 },
  proposalMeta: { fontSize: 12, color: colors.muted, marginTop: 3 },

  // Empty
  empty: { alignItems: 'center', paddingTop: 40 },
  emptyEmoji: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.ink2 },
  emptyBody: { fontSize: 13, color: colors.muted, marginTop: 4 },

  // FAB
  fab: {
    position: 'absolute', right: 20, bottom: 24,
    width: 52, height: 52, borderRadius: 26,
    backgroundColor: colors.sheep,
    alignItems: 'center', justifyContent: 'center',
    ...shadow.lifted,
  },
  fabPlus: { color: '#fff', fontSize: 26, fontWeight: '400', lineHeight: 28, marginTop: -2 },

  // Modal
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 20, paddingBottom: 14,
    borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: colors.ink },
  modalCancel: { fontSize: 16, color: colors.muted },
  modalSave: { fontSize: 16, fontWeight: '700', color: colors.sheepDeep },
  modalBody: { flex: 1, backgroundColor: colors.ground },
  dateChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.sheepTint,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: radius.pill, marginBottom: 20,
  },
  dateChipText: { color: colors.sheepDeep, fontWeight: '600', fontSize: 13 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: colors.ink2, marginBottom: 6 },
  field: {
    borderWidth: 1, borderColor: colors.border, borderRadius: radius.md,
    paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 15, color: colors.ink, marginBottom: 16, backgroundColor: colors.card,
  },
  textArea: { height: 80, textAlignVertical: 'top' },
  timeRow: { flexDirection: 'row' },
  memberList: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  memberChip: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1, borderColor: colors.border,
    backgroundColor: colors.card,
  },
  memberChipActive: { borderColor: colors.sheep, backgroundColor: colors.sheepTint },
  memberName: { fontSize: 13, color: colors.ink2, maxWidth: 100 },
  memberNameActive: { color: colors.sheepDeep, fontWeight: '600' },
  checkmark: { color: colors.sheepDeep, fontWeight: '700', marginLeft: 2 },
});
