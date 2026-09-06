import React, { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import GroupSetupScreen from '../screens/GroupSetupScreen';

const Stack = createNativeStackNavigator();

// Shared skip flag — LoginScreen can call this to bypass auth in dev
let _skipAuth = false;
export function skipAuthForDev() { _skipAuth = true; }

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const { groups, loadingGroups } = useGroup();
  const [skipped, setSkipped] = useState(false);

  // Expose a way for LoginScreen to trigger re-render after skip
  (skipAuthForDev as any)._notify = () => setSkipped(true);

  if (_skipAuth || skipped) {
    return <TabNavigator />;
  }

  if (loading || (session && loadingGroups)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f5f3e7' }}>
        <ActivityIndicator size="large" color="#8dc76d" />
      </View>
    );
  }

  if (!session) {
    return <AuthNavigator />;
  }

  if (groups.length === 0) {
    return (
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="GroupSetup" component={GroupSetupScreen} />
      </Stack.Navigator>
    );
  }

  return <TabNavigator />;
}
