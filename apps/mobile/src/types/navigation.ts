/**
 * Navigation type definitions
 */

import type { NativeStackScreenProps } from '@react-navigation/native-stack';

/**
 * Root stack parameter list
 */
export type RootStackParamList = {
  // Onboarding
  Welcome: undefined;
  ConnectAccount: undefined;
  VIPSelection: undefined;
  TopicSelection: undefined;
  KeywordSelection: undefined;
  Confirmation: undefined;

  // Main App
  Home: undefined;
  BriefingRoom: { roomName?: string };
  Settings: undefined;
  PrivacyDashboard: undefined;
  PendingActions: undefined;
  SyncStatus: undefined;

  // Account Management
  AddAccount: undefined;
};

/**
 * Screen props type helper
 */
export type RootStackScreenProps<T extends keyof RootStackParamList> =
  NativeStackScreenProps<RootStackParamList, T>;

/**
 * Navigation prop type helper
 */
export type NavigationProp = RootStackScreenProps<keyof RootStackParamList>['navigation'];

/**
 * Route prop type helper
 */
export type RouteProp<T extends keyof RootStackParamList> =
  RootStackScreenProps<T>['route'];
