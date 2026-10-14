import React, { useState } from 'react';
import { View } from 'react-native';
import { useGroup } from '../contexts/GroupContext';
import { useAuth } from '../contexts/AuthContext';
import { Button, Field, Segmented } from '../components/ui';
import { space } from '../theme';
import AuthLayout, { FormMessage } from './auth/AuthLayout';
import { enterDemo } from './auth/LoginScreen';

type Mode = 'create' | 'join';

export default function GroupSetupScreen() {
  const { createGroup, joinGroup, setActiveGroup } = useGroup();
  const { signOut } = useAuth();
  const [mode, setMode] = useState<Mode>('create');
  const [groupName, setGroupName] = useState('');
  const [groupDesc, setGroupDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = mode === 'create' ? !!groupName.trim() : !!inviteCode.trim();

  async function submit() {
    if (!ready || loading) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = mode === 'create'
        ? await createGroup(groupName.trim(), groupDesc.trim())
        : await joinGroup(inviteCode.trim());
      if (err) setError(err.message);
    } catch (e: any) {
      setError(e?.message ?? 'Something went wrong. Try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Your first group" subtitle="Groups share a calendar and a pool of ideas — a household, friends, a club.">
      <Segmented
        options={[{ key: 'create', label: 'Create' }, { key: 'join', label: 'Join with Code' }]}
        value={mode}
        onChange={(m) => { setMode(m); setError(null); }}
      />
      {mode === 'create' ? (
        <>
          <Field label="Group name" value={groupName} onChangeText={setGroupName} placeholder="The Smith Family" />
          <Field label="Description" value={groupDesc} onChangeText={setGroupDesc} placeholder="Optional" />
        </>
      ) : (
        <Field label="Invite code" value={inviteCode} onChangeText={setInviteCode} placeholder="AB12CD" autoCapitalize="characters" autoCorrect={false} mono />
      )}
      <FormMessage message={error} />
      <Button label={mode === 'create' ? 'Create Group' : 'Join Group'} onPress={submit} loading={loading} disabled={!ready} block style={{ marginTop: space.s }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Button label="Sign Out" variant="plain" onPress={signOut} />
        <Button label="Explore Demo" variant="plain" onPress={() => enterDemo(setActiveGroup)} />
      </View>
    </AuthLayout>
  );
}
