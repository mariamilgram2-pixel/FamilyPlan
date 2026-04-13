import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import CalendarScreen from '../screens/calendar/CalendarScreen';
import CreateEventScreen from '../screens/calendar/CreateEventScreen';
import IdeasScreen from '../screens/ideas/IdeasScreen';
import CreateIdeaScreen from '../screens/ideas/CreateIdeaScreen';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { CalendarStackParamList, IdeasStackParamList } from '../types';

const Tab = createBottomTabNavigator();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const IdeasStack = createNativeStackNavigator<IdeasStackParamList>();

function GroupHeaderTitle() {
  const { activeGroup } = useGroup();
  return (
    <Text style={styles.headerGroupName} numberOfLines={1}>
      {activeGroup?.name ?? 'sheep'}
    </Text>
  );
}

function SignOutButton() {
  const { signOut } = useAuth();
  return (
    <TouchableOpacity onPress={signOut} style={styles.headerBtn}>
      <Text style={styles.headerBtnText}>Sign out</Text>
    </TouchableOpacity>
  );
}

const HEADER_OPTS = {
  headerStyle: { backgroundColor: '#C4B5A5' },
  headerTintColor: '#fff',
  headerTitle: () => <GroupHeaderTitle />,
  headerRight: () => <SignOutButton />,
};

function CalendarStackNavigator() {
  return (
    <CalendarStack.Navigator>
      <CalendarStack.Screen name="CalendarHome" component={CalendarScreen} options={{ ...HEADER_OPTS, title: 'Calendar' }} />
      <CalendarStack.Screen name="CreateEvent" component={CreateEventScreen} options={{ ...HEADER_OPTS, title: 'New Event', headerTitle: 'New Event', headerRight: undefined }} />
    </CalendarStack.Navigator>
  );
}

function IdeasStackNavigator() {
  return (
    <IdeasStack.Navigator>
      <IdeasStack.Screen name="IdeasHome" component={IdeasScreen} options={{ ...HEADER_OPTS, title: 'Ideas' }} />
      <IdeasStack.Screen name="CreateIdea" component={CreateIdeaScreen} options={{ ...HEADER_OPTS, title: 'New Idea', headerTitle: 'New Idea', headerRight: undefined }} />
    </IdeasStack.Navigator>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#8B7B6B',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tab.Screen
        name="Calendar"
        component={CalendarStackNavigator}
        options={{
          tabBarIcon: ({ color }) => <TabIcon label="📅" color={color} />,
        }}
      />
      <Tab.Screen
        name="Ideas"
        component={IdeasStackNavigator}
        options={{
          tabBarIcon: ({ color }) => <TabIcon label="💡" color={color} />,
        }}
      />
    </Tab.Navigator>
  );
}

function TabIcon({ label, color }: { label: string; color: string }) {
  return <Text style={{ fontSize: 20 }}>{label}</Text>;
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopColor: '#E5E7EB',
    paddingBottom: 4,
    height: 60,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  headerGroupName: {
    color: '#fff',
    fontSize: 17,
    fontWeight: '700',
  },
  headerBtn: {
    marginRight: 12,
  },
  headerBtnText: {
    color: '#E0E7FF',
    fontSize: 14,
  },
});
