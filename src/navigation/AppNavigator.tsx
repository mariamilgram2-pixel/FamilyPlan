import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import AuthNavigator from './AuthNavigator';
import TabNavigator from './TabNavigator';
import GroupSetupScreen from '../screens/GroupSetupScreen';

const Stack = createNativeStackNavigator();

export default function AppNavigator() {
  const { session, loading } = useAuth();
  const { groups, loadingGroups } = useGroup();

  if (loading || (session && loadingGroups)) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F9FAFB' }}>
        <ActivityIndicator size="large" color="#6366F1" />
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
