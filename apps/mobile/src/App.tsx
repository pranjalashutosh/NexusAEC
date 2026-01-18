/**
 * NexusAEC Mobile App
 *
 * Voice-driven AI executive assistant for email management
 */

import { NavigationContainer } from '@react-navigation/native';
import React from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider } from './hooks/useAuth';
import { LiveKitProvider } from './hooks/useLiveKit';
import { NetworkProvider } from './hooks/useNetworkStatus';
import { ThemeProvider, useTheme } from './hooks/useTheme';
import { RootNavigator } from './navigation/RootNavigator';

/**
 * App content with theme-aware status bar
 */
function AppContent(): React.JSX.Element {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar
        barStyle={isDark ? 'light-content' : 'dark-content'}
        backgroundColor={colors.background}
      />
      <NavigationContainer
        theme={{
          dark: isDark,
          colors: {
            primary: colors.primary,
            background: colors.background,
            card: colors.card,
            text: colors.text,
            border: colors.border,
            notification: colors.notification,
          },
        }}
      >
        <RootNavigator />
      </NavigationContainer>
    </View>
  );
}

/**
 * Main App component with all providers
 */
function App(): React.JSX.Element {
  return (
    <GestureHandlerRootView style={styles.container}>
      <SafeAreaProvider>
        <ThemeProvider>
          <NetworkProvider>
            <AuthProvider>
              <LiveKitProvider>
                <AppContent />
              </LiveKitProvider>
            </AuthProvider>
          </NetworkProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default App;
