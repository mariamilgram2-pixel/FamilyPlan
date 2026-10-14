import React, { useState } from 'react';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../types';
import { useAuth } from '../../contexts/AuthContext';
import { Button, Field } from '../../components/ui';
import { space } from '../../theme';
import AuthLayout, { FormMessage } from './AuthLayout';
import { friendlyAuthError } from './LoginScreen';

type Props = { navigation: NativeStackNavigationProp<AuthStackParamList, 'Signup'> };

export default function SignupScreen({ navigation }: Props) {
  const { signUp } = useAuth();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ text: string; ok: boolean } | null>(null);
  const ready = !!fullName.trim() && !!email.trim() && password.length >= 6;

  async function handleSignup() {
    if (!ready || loading) return;
    setResult(null);
    setLoading(true);
    try {
      const { error } = await signUp(email.trim(), password, fullName.trim());
      setResult(error
        ? { text: friendlyAuthError(error.message), ok: false }
        : { text: 'Almost there — check your email for a confirmation link, then sign in.', ok: true });
    } catch (e: any) {
      setResult({ text: friendlyAuthError(e?.message ?? 'Something went wrong. Try again.'), ok: false });
    } finally {
      setLoading(false);
    }
  }

  const edit = (setter: (v: string) => void) => (v: string) => { setter(v); if (result && !result.ok) setResult(null); };

  return (
    <AuthLayout title="Create account" subtitle="Start a shared calendar in under a minute.">
      <Field label="Name" value={fullName} onChangeText={edit(setFullName)} placeholder="Jane Smith" autoComplete="name" textContentType="name" />
      <Field label="Email" value={email} onChangeText={edit(setEmail)} placeholder="you@example.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" textContentType="emailAddress" />
      <Field
        label="Password"
        value={password}
        onChangeText={edit(setPassword)}
        placeholder="At least 6 characters"
        secureTextEntry
        autoComplete="new-password"
        textContentType="newPassword"
        onSubmitEditing={handleSignup}
        hint={password.length > 0 && password.length < 6 ? `${6 - password.length} more character${6 - password.length === 1 ? '' : 's'}` : undefined}
      />
      <FormMessage message={result?.text ?? null} tone={result?.ok ? 'tint' : 'danger'} />
      <Button label="Create Account" onPress={handleSignup} loading={loading} disabled={!ready} block style={{ marginTop: space.s }} />
      <Button label="I already have an account" variant="plain" onPress={() => navigation.navigate('Login')} />
    </AuthLayout>
  );
}
