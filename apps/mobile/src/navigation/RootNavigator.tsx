/**
 * Root Navigator
 *
 * Main navigation structure for the app
 */

import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';

import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { AddAccountScreen } from '../screens/main/AddAccount';
import { BriefingRoomScreen } from '../screens/main/BriefingRoom';
import { HomeScreen } from '../screens/main/Home';
import { PendingActionsScreen } from '../screens/main/PendingActions';
import { PrivacyDashboardScreen } from '../screens/main/PrivacyDashboard';
import { SettingsScreen } from '../screens/main/Settings';
import { SyncStatusScreen } from '../screens/main/SyncStatus';
import { ConfirmationScreen } from '../screens/onboarding/Confirmation';
import { ConnectAccountScreen } from '../screens/onboarding/ConnectAccount';
import { KeywordSelectionScreen } from '../screens/onboarding/KeywordSelection';
import { TopicSelectionScreen } from '../screens/onboarding/TopicSelection';
import { VIPSelectionScreen } from '../screens/onboarding/VIPSelection';
import { WelcomeScreen } from '../screens/onboarding/Welcome';

import type { RootStackParamList } from '../types/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();

/**
 * Onboarding Navigator
 */
function OnboardingNavigator(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="ConnectAccount" component={ConnectAccountScreen} />
      <Stack.Screen name="VIPSelection" component={VIPSelectionScreen} />
      <Stack.Screen name="TopicSelection" component={TopicSelectionScreen} />
      <Stack.Screen name="KeywordSelection" component={KeywordSelectionScreen} />
      <Stack.Screen name="Confirmation" component={ConfirmationScreen} />
    </Stack.Navigator>
  );
}

/**
 * Main App Navigator
 */
function MainNavigator(): React.JSX.Element {
  const { colors } = useTheme();

  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerTitleStyle: { fontWeight: '600' },
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    >
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BriefingRoom"
        component={BriefingRoomScreen}
        options={{
          headerShown: false,
          animation: 'fade',
          gestureEnabled: false,
        }}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="PrivacyDashboard"
        component={PrivacyDashboardScreen}
        options={{ title: 'Privacy & Data' }}
      />
      <Stack.Screen
        name="PendingActions"
        component={PendingActionsScreen}
        options={{ title: 'Pending Actions' }}
      />
      <Stack.Screen
        name="SyncStatus"
        component={SyncStatusScreen}
        options={{ title: 'Sync Status' }}
      />
      <Stack.Screen
        name="AddAccount"
        component={AddAccountScreen}
        options={{ title: 'Add Account' }}
      />
    </Stack.Navigator>
  );
}

/**
 * Root Navigator - switches between onboarding and main app
 */
export function RootNavigator(): React.JSX.Element {
  const { isAuthenticated, hasCompletedOnboarding } = useAuth();

  // Show onboarding for new users or users who haven't completed setup
  if (!isAuthenticated || !hasCompletedOnboarding) {
    return <OnboardingNavigator />;
  }

  return <MainNavigator />;
}
