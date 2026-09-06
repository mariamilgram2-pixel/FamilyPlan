import React from 'react';
import { View, Text, StyleSheet, Platform, StatusBar } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Feather } from '@expo/vector-icons';
import CalendarScreen from '../screens/calendar/CalendarScreen';
import CreateEventScreen from '../screens/calendar/CreateEventScreen';
import IdeasScreen from '../screens/ideas/IdeasScreen';
import CreateIdeaScreen from '../screens/ideas/CreateIdeaScreen';
import PeopleScreen from '../screens/people/PeopleScreen';
import ProfileScreen from '../screens/ProfileScreen';
import AppHeader from '../components/AppHeader';
import { CalendarStackParamList, IdeasStackParamList } from '../types';
import { colors } from '../theme';

const Tab = createBottomTabNavigator();
const CalendarStack = createNativeStackNavigator<CalendarStackParamList>();
const IdeasStack = createNativeStackNavigator<IdeasStackParamList>();
const PeopleStack = createNativeStackNavigator();
const ProfileStack = createNativeStackNavigator();

// ─── Header + modal-screen options ────────────────────────────────────────────

const HOME_SCREEN_OPTS = {
  header: () => <AppHeader />,
};

const MODAL_HEADER_OPTS = {
  headerStyle: { backgroundColor: colors.card },
  headerTintColor: colors.ink,
  headerTitleStyle: { fontWeight: '700' as const, color: colors.ink },
  headerShadowVisible: false,
  headerBackTitle: 'Back',
};

// ─── Stacks ──────────────────────────────────────────────────────────────────

function CalendarStackNavigator() {
  return (
    <CalendarStack.Navigator>
      <CalendarStack.Screen name="CalendarHome" component={CalendarScreen} options={HOME_SCREEN_OPTS as any} />
      <CalendarStack.Screen name="CreateEvent" component={CreateEventScreen} options={{ ...MODAL_HEADER_OPTS, headerTitle: 'New Event' }} />
    </CalendarStack.Navigator>
  );
}

function IdeasStackNavigator() {
  return (
    <IdeasStack.Navigator>
      <IdeasStack.Screen name="IdeasHome" component={IdeasScreen} options={HOME_SCREEN_OPTS as any} />
      <IdeasStack.Screen name="CreateIdea" component={CreateIdeaScreen} options={{ ...MODAL_HEADER_OPTS, headerTitle: 'New Idea' }} />
    </IdeasStack.Navigator>
  );
}

function PeopleStackNavigator() {
  return (
    <PeopleStack.Navigator>
      <PeopleStack.Screen name="PeopleHome" component={PeopleScreen} options={HOME_SCREEN_OPTS as any} />
    </PeopleStack.Navigator>
  );
}

function ProfileStackNavigator() {
  return (
    <ProfileStack.Navigator>
      <ProfileStack.Screen name="ProfileHome" component={ProfileScreen} options={HOME_SCREEN_OPTS as any} />
    </ProfileStack.Navigator>
  );
}

// ─── Tab bar ─────────────────────────────────────────────────────────────────

type IconName = React.ComponentProps<typeof Feather>['name'];

function TabIcon({ name, color, focused }: { name: IconName; color: string; focused: boolean }) {
  return (
    <View style={styles.iconWrap}>
      <Feather name={name} size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
    </View>
  );
}

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.sheepDeep,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        tabBarItemStyle: { paddingVertical: 4 },
      }}
    >
      <Tab.Screen
        name="Calendar"
        component={CalendarStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="calendar" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Ideas"
        component={IdeasStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="zap" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="People"
        component={PeopleStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="users" color={color} focused={focused} />,
        }}
      />
      <Tab.Screen
        name="You"
        component={ProfileStackNavigator}
        options={{
          tabBarIcon: ({ color, focused }) => <TabIcon name="user" color={color} focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    borderTopColor: colors.border,
    backgroundColor: colors.card,
    paddingTop: 6,
    paddingBottom: 8,
    height: 66,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
    marginTop: 2,
  },
  iconWrap: { alignItems: 'center', justifyContent: 'center', height: 24 },
});
