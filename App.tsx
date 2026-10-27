import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { DarkTheme, DefaultTheme, NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider } from './src/contexts/AuthContext';
import { GroupProvider } from './src/contexts/GroupContext';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider } from './src/contexts/ThemeContext';
import { useTheme } from './src/theme';
import ErrorBoundary from './src/components/ErrorBoundary';
import AlertHost from './src/components/ui/AlertHost';

export default function App() {
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <ThemedApp />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}

function ThemedApp() {
  const { c, isDark } = useTheme();

  // Keep the browser canvas in sync with the chosen appearance.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    document.body.style.backgroundColor = c.background;
    document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
    (document.body.style as any).webkitFontSmoothing = 'antialiased';
  }, [c, isDark]);

  const base = isDark ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: c.tint, background: c.background, card: c.background, text: c.label, border: c.separator },
  };

  return (
    <AuthProvider>
      <GroupProvider>
        <ErrorBoundary background={c.background}>
          <NavigationContainer theme={navTheme} documentTitle={{ formatter: (_, route) => (route?.name ? `${route.name} · sheep` : 'sheep') }}>
            <AppNavigator />
          </NavigationContainer>
        </ErrorBoundary>
        <AlertHost />
        <StatusBar style={isDark ? 'light' : 'dark'} />
      </GroupProvider>
    </AuthProvider>
  );
}
