// The adaptive shell.
//
// One navigator, two presentations of the same four destinations — Home,
// Calendar, Plans, People:
//   compact  → translucent tab bar anchored to the bottom (thumb zone);
//              settings ("You") open from your avatar on Home
//   sidebar  → a left source list with sections, your groups, and your
//              account pinned bottom-left (macOS / iPadOS convention)
// Desktop also gets ⌘1–⌘4 to jump between sections. The New Plan sheet
// wraps everything so any screen can open it.

import React, { useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { BottomTabBarProps, createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import HomeScreen from '../screens/home/HomeScreen';
import CalendarScreen from '../screens/calendar/CalendarScreen';
import PlansScreen from '../screens/ideas/IdeasScreen';
import { PlanComposerProvider } from '../components/PlanComposer';
import PeopleScreen from '../screens/people/PeopleScreen';
import ProfileScreen from '../screens/ProfileScreen';
import Avatar from '../components/Avatar';
import { useGroupSheets, useVisibleGroups } from '../components/GroupSwitcher';
import { Icon, IconButton, IconName, Material, Menu, SectionHeader, TAB_BAR_HEIGHT, Tappable, Txt } from '../components/ui';
import { useAuth } from '../contexts/AuthContext';
import { useGroup } from '../contexts/GroupContext';
import { modKey } from '../lib/shortcuts';
import { TabParamList } from '../types';
import { continuous, radius, SIDEBAR_WIDTH, space, useLayout, useTheme } from '../theme';

const Tab = createBottomTabNavigator<TabParamList>();

const DESTINATIONS: { name: keyof TabParamList; label: string; icon: IconName; iconActive: IconName }[] = [
  { name: 'Home',     label: 'Home',     icon: 'home-outline',     iconActive: 'home' },
  { name: 'Calendar', label: 'Calendar', icon: 'calendar-outline', iconActive: 'calendar' },
  { name: 'Plans',    label: 'Plans',    icon: 'sparkles-outline', iconActive: 'sparkles' },
  { name: 'People',   label: 'People',   icon: 'people-outline',   iconActive: 'people' },
];

export default function TabNavigator() {
  const { c } = useTheme();
  const { hasSidebar } = useLayout();
  return (
    <PlanComposerProvider>
      <Tab.Navigator
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.background, marginLeft: hasSidebar ? SIDEBAR_WIDTH : 0 } }}
        tabBar={(props) => (hasSidebar ? <Sidebar {...props} /> : <TabBar {...props} />)}
      >
        <Tab.Screen name="Home" component={HomeScreen} />
        <Tab.Screen name="Calendar" component={CalendarScreen} />
        <Tab.Screen name="Plans" component={PlansScreen} />
        <Tab.Screen name="People" component={PeopleScreen} />
        <Tab.Screen name="You" component={ProfileScreen} />
      </Tab.Navigator>
    </PlanComposerProvider>
  );
}

// ─── Compact: bottom tab bar ─────────────────────────────────────────────────

function TabBar({ state, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Material style={[styles.tabBar, { paddingBottom: insets.bottom, borderTopColor: c.separator }]}>
      <View accessibilityRole="tablist" style={styles.tabRow}>
        {state.routes.map((route, i) => {
          const d = DESTINATIONS.find(x => x.name === route.name);
          if (!d) return null;   // "You" opens from your avatar on Home
          const focused = state.index === i;
          const color = focused ? c.tint : c.secondaryLabel;
          return (
            <Tappable
              key={route.key}
              feedback="opacity"
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={d.label}
              onPress={() => {
                const e = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                if (!focused && !e.defaultPrevented) navigation.navigate(route.name);
              }}
              style={styles.tabItem}
            >
              <Icon name={focused ? d.iconActive : d.icon} size={24} color={color} />
              <Txt v="caption" style={{ color, fontWeight: focused ? '600' : '400' }}>{d.label}</Txt>
            </Tappable>
          );
        })}
      </View>
    </Material>
  );
}

// ─── Sidebar ─────────────────────────────────────────────────────────────────

function Sidebar({ state, navigation }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile } = useAuth();
  const { activeGroup, setActiveGroup } = useGroup();
  const groups = useVisibleGroups();
  const { openCreate, openJoin, sheets } = useGroupSheets();
  const current = state.routes[state.index].name;

  // ⌘1–⌘4 jump between destinations.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey) return;
      const idx = Number(e.key) - 1;
      if (idx >= 0 && idx < DESTINATIONS.length) {
        e.preventDefault();
        navigation.navigate(DESTINATIONS[idx].name);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [navigation]);

  const me = { id: user?.id ?? 'me', full_name: profile?.full_name ?? 'You', email: user?.email };

  return (
    <View style={[styles.sidebar, { backgroundColor: c.fill, paddingTop: insets.top + space.m, borderRightColor: c.separator }]}>
      <View style={styles.brand}>
        <Txt v="title" style={{ fontFamily: Platform.select({ web: 'ui-serif, "New York", Georgia, serif', ios: 'Georgia' }), fontWeight: '600' }}>sheep</Txt>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: space.s, paddingBottom: space.m }}>
        <View accessibilityRole="tablist" style={{ gap: 2 }}>
          {DESTINATIONS.map((d, i) => {
            const selected = current === d.name;
            return (
              <SidebarItem
                key={d.name}
                label={d.label}
                icon={selected ? d.iconActive : d.icon}
                selected={selected}
                hint={`${modKey}${i + 1}`}
                onPress={() => navigation.navigate(d.name)}
              />
            );
          })}
        </View>

        <View style={{ marginTop: space.l }}>
          <SectionHeader
            title="Groups"
            action={
              <Menu sections={[{ items: [
                { key: 'new', label: 'New Group…', icon: 'add-circle-outline', onSelect: openCreate },
                { key: 'join', label: 'Join with Code…', icon: 'enter-outline', onSelect: openJoin },
              ] }]}>
                {(open) => <IconButton icon="add" label="Add group" onPress={open} style={{ marginRight: -space.s }} />}
              </Menu>
            }
          />
          <View style={{ gap: 2 }}>
            {groups.map(g => (
              <SidebarItem
                key={g.id}
                label={g.name}
                icon={g.id === activeGroup?.id ? 'ellipse' : 'ellipse-outline'}
                iconSize={10}
                selected={false}
                checked={g.id === activeGroup?.id}
                onPress={() => setActiveGroup(g)}
              />
            ))}
            {groups.length === 0 && (
              <Txt v="footnote" tone="secondary" style={{ paddingHorizontal: space.s }}>No groups yet</Txt>
            )}
          </View>
        </View>
      </ScrollView>

      <View style={[styles.account, { borderTopColor: c.separator, paddingBottom: insets.bottom + space.s }]}>
        <Tappable
          onPress={() => navigation.navigate('You')}
          selected={current === 'You'}
          accessibilityLabel="Your profile and settings"
          style={styles.accountRow}
        >
          <Avatar person={me} size={32} highlight />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Txt v="callout" semibold numberOfLines={1}>{me.full_name}</Txt>
            <Txt v="footnote" tone="secondary" numberOfLines={1}>Profile & settings</Txt>
          </View>
        </Tappable>
      </View>
      {sheets}
    </View>
  );
}

function SidebarItem({ label, icon, iconSize = 18, selected, checked, hint, onPress }: {
  label: string; icon: IconName; iconSize?: number; selected: boolean; checked?: boolean; hint?: string; onPress: () => void;
}) {
  const { c } = useTheme();
  return (
    <Tappable
      onPress={onPress}
      selected={selected}
      accessibilityRole="tab"
      accessibilityState={{ selected: selected || checked }}
      accessibilityLabel={label}
      style={styles.item}
    >
      <View style={{ width: 24, alignItems: 'center' }}>
        <Icon name={icon} size={iconSize} color={selected || checked ? c.tint : c.secondaryLabel} />
      </View>
      <Txt v="callout" semibold={selected || checked} numberOfLines={1} style={{ flex: 1 }}>{label}</Txt>
      {hint ? <Txt v="footnote" tone="secondary">{hint}</Txt> : null}
    </Tappable>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  tabRow: { flexDirection: 'row', height: TAB_BAR_HEIGHT },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 2 },

  sidebar: {
    position: 'absolute', left: 0, top: 0, bottom: 0, width: SIDEBAR_WIDTH,
    borderRightWidth: StyleSheet.hairlineWidth,
  },
  brand: { paddingHorizontal: space.m, paddingBottom: space.m },
  item: {
    flexDirection: 'row', alignItems: 'center', gap: space.s,
    height: 32, paddingHorizontal: space.s, borderRadius: radius.control, ...continuous,
  },
  account: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space.s, paddingHorizontal: space.s },
  accountRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.s,
    padding: space.s, borderRadius: radius.control, ...continuous,
  },
});
