import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import { useGroup } from '../contexts/GroupContext';
import { useAuth } from '../contexts/AuthContext';
import { skipAuthForDev } from '../navigation/AppNavigator';

type Tab = 'create' | 'join';

export default function GroupSetupScreen() {
  const { createGroup, joinGroup, setActiveGroup } = useGroup();
  const { signOut } = useAuth();
  const [tab, setTab] = useState<Tab>('create');

  // Create form
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');

  // Join form
  const [inviteCode, setInviteCode] = useState('');

  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    if (!groupName.trim()) {
      Alert.alert('Required', 'Please enter a group name.');
      return;
    }
    setLoading(true);
    const { error } = await createGroup(groupName.trim(), groupDesc.trim());
    setLoading(false);
    if (error) Alert.alert('Error creating group', error.message + '\n\nTip: use "Skip to demo" below to explore the app first.');
  }

  async function handleJoin() {
    if (!inviteCode.trim()) {
      Alert.alert('Required', 'Please enter an invite code.');
      return;
    }
    setLoading(true);
    const { error } = await joinGroup(inviteCode.trim());
    setLoading(false);
    if (error) Alert.alert('Error', error.message);
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        <Text style={styles.emoji}>🐑</Text>
        <Text style={styles.title}>Welcome to sheep</Text>
        <Text style={styles.subtitle}>Create a new group or join an existing one with an invite code</Text>

        <View style={styles.tabRow}>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'create' && styles.tabBtnActive]}
            onPress={() => setTab('create')}
          >
            <Text style={[styles.tabBtnText, tab === 'create' && styles.tabBtnTextActive]}>Create group</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tabBtn, tab === 'join' && styles.tabBtnActive]}
            onPress={() => setTab('join')}
          >
            <Text style={[styles.tabBtnText, tab === 'join' && styles.tabBtnTextActive]}>Join group</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          {tab === 'create' ? (
            <>
              <Text style={styles.label}>Group name *</Text>
              <TextInput
                style={styles.input}
                value={groupName}
                onChangeText={setGroupName}
                placeholder="The Smith Family"
                placeholderTextColor="#9CA3AF"
              />
              <Text style={styles.label}>Description (optional)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={groupDesc}
                onChangeText={setGroupDesc}
                placeholder="A short description of your group…"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleCreate} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Create group</Text>}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.label}>Invite code</Text>
              <TextInput
                style={styles.input}
                value={inviteCode}
                onChangeText={setInviteCode}
                placeholder="e.g. AB12CD34"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="characters"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.primaryBtn} onPress={handleJoin} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>Join group</Text>}
              </TouchableOpacity>
            </>
          )}
        </View>

        <TouchableOpacity
          style={styles.skipBtn}
          onPress={() => {
            setActiveGroup({ id: 'demo', name: 'My Family', description: null, invite_code: 'DEMO', created_by: null, created_at: new Date().toISOString() });
            skipAuthForDev();
            (skipAuthForDev as any)._notify?.();
          }}
        >
          <Text style={styles.skipText}>Skip to demo →</Text>
        </TouchableOpacity>

        <TouchableOpacity onPress={signOut} style={styles.signOutBtn}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f5f3e7' },
  inner: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  emoji: { textAlign: 'center', fontSize: 56, marginBottom: 12 },
  title: { textAlign: 'center', fontSize: 24, fontWeight: '800', color: '#111827', marginBottom: 8 },
  subtitle: { textAlign: 'center', fontSize: 14, color: '#6B7280', marginBottom: 28, lineHeight: 20 },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#E5E7EB',
    borderRadius: 12,
    padding: 4,
    marginBottom: 20,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  tabBtnActive: { backgroundColor: '#fff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.08, shadowRadius: 4, elevation: 2 },
  tabBtnText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  tabBtnTextActive: { color: '#8dc76d' },
  card: { backgroundColor: '#fff', borderRadius: 20, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111827', marginBottom: 16, backgroundColor: '#f5f3e7' },
  textArea: { height: 80, textAlignVertical: 'top' },
  primaryBtn: { backgroundColor: '#8dc76d', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 4 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  skipBtn: { marginTop: 20, alignItems: 'center' },
  skipText: { color: '#8dc76d', fontSize: 14, fontWeight: '600' },
  signOutBtn: { marginTop: 12, alignItems: 'center' },
  signOutText: { color: '#9CA3AF', fontSize: 14 },
});
