import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import { useTheme } from '../theme';

// Shared skip flag — LoginScreen can call this to bypass auth in dev
let _skipAuth = false;
export function skipAuthForDev() { _skipAuth = true; }
/** Leave demo mode and return to sign-in. */
export function exitDemo() { _skipAuth = false; (skipAuthForDev as any)._exit?.(); }

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const { loadingGroups } = useGroup();
  const [skipped, setSkipped] = useState(false);
  const { c } = useTheme();

  // Expose a way for LoginScreen to trigger re-render after skip
  (skipAuthForDev as any)._notify = () => setSkipped(true);
  (skipAuthForDev as any)._exit = () => setSkipped(false);

  if (_skipAuth || skipped) {
    return <TabNavigator />;
  }

  if (loading || (session && loadingGroups)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: c.background }}>
        <ActivityIndicator size="large" color={c.secondaryLabel} />
      </View>
    );
  }

  if (!session) {
    return <AuthNavigator />;
  }

  // No group needed to start: plans can be with just people, and a group
  // can be made or joined later from Friends.
  return <TabNavigator />;
}
