import React, { useState } from 'react';
import { View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { useGroup } from '../../contexts/GroupContext';
import { skipAuthForDev } from '../../navigation/AppNavigator';
import { DEMO_GROUP_ID } from '../../lib/demo';
import { Button, Field } from '../../components/ui';
import { space } from '../../theme';
import AuthLayout, { FormMessage } from './AuthLayout';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Login'> };

export function enterDemo(setActiveGroup: ReturnType<typeof useGroup>['setActiveGroup']) {
  setActiveGroup({ id: DEMO_GROUP_ID, name: 'My Family', description: null, invite_code: 'DEMO42', created_by: null, created_at: new Date().toISOString() });
  skipAuthForDev();
  (skipAuthForDev as any)._notify?.();
}

/** Turn Supabase auth errors into something a person can act on. */
export function friendlyAuthError(message: string) {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return 'That email and password don’t match. Check them and try again.';
  if (m.includes('email not confirmed')) return 'Confirm your email first — we sent you a link when you signed up.';
  if (m.includes('fetch') || m.includes('network')) return 'Can’t reach the server. Check your connection and try again.';
  return message;
}

export default function LoginScreen({ navigation }: Props) {
  const { signIn } = useAuth();
  const { setActiveGroup } = useGroup();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = email.trim().length > 0 && password.length > 0;

  async function handleLogin() {
    if (!ready || loading) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await signIn(email.trim(), password);
      if (err) setError(friendlyAuthError(err.message));
    } catch (e: any) {
      setError(friendlyAuthError(e?.message ?? 'Something went wrong. Try again.'));
    } finally {
      setLoading(false);
    }
  }

  const edit = (setter: (v: string) => void) => (v: string) => { setter(v); if (error) setError(null); };

  return (
    <AuthLayout title="sheep" subtitle="One calendar for the people you plan with.">
      <Field label="Email" value={email} onChangeText={edit(setEmail)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field label="Password" value={password} onChangeText={edit(setPassword)} placeholder="Password" secureTextEntry autoComplete="password" textContentType="password" onSubmitEditing={handleLogin} />
      <FormMessage message={error} />
      <Button label="Sign In" onPress={handleLogin} loading={loading} disabled={!ready} block style={{ marginTop: space.s }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Button label="Create Account" variant="plain" onPress={() => navigation.navigate('Signup')} />
        <Button label="Explore Demo" variant="plain" onPress={() => enterDemo(setActiveGroup)} />
      </View>
    </AuthLayout>
  );
}
