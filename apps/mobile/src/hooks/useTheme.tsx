/**
 * Theme hook and provider
 */

import React, { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

/**
 * Color palette
 */
export interface ThemeColors {
  primary: string;
  secondary: string;
  background: string;
  card: string;
  text: string;
  textSecondary: string;
  border: string;
  notification: string;
  success: string;
  warning: string;
  error: string;
  muted: string;
}

/**
 * Theme configuration
 */
export interface Theme {
  isDark: boolean;
  colors: ThemeColors;
}

/**
 * Theme context value
 */
interface ThemeContextValue extends Theme {
  toggleTheme: () => void;
  setDarkMode: (isDark: boolean) => void;
}

/**
 * Light theme colors
 */
const lightColors: ThemeColors = {
  primary: '#2563EB', // Blue
  secondary: '#7C3AED', // Purple
  background: '#FFFFFF',
  card: '#F9FAFB',
  text: '#111827',
  textSecondary: '#6B7280',
  border: '#E5E7EB',
  notification: '#EF4444',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  muted: '#9CA3AF',
};

/**
 * Dark theme colors
 */
const darkColors: ThemeColors = {
  primary: '#3B82F6',
  secondary: '#8B5CF6',
  background: '#111827',
  card: '#1F2937',
  text: '#F9FAFB',
  textSecondary: '#9CA3AF',
  border: '#374151',
  notification: '#F87171',
  success: '#34D399',
  warning: '#FBBF24',
  error: '#F87171',
  muted: '#6B7280',
};

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

/**
 * Theme provider component
 */
export function ThemeProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const systemColorScheme = useColorScheme();
  const [isDarkOverride, setIsDarkOverride] = useState<boolean | null>(null);

  const isDark = isDarkOverride ?? systemColorScheme === 'dark';

  const toggleTheme = useCallback(() => {
    setIsDarkOverride((prev) => (prev === null ? !isDark : !prev));
  }, [isDark]);

  const setDarkMode = useCallback((dark: boolean) => {
    setIsDarkOverride(dark);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      isDark,
      colors: isDark ? darkColors : lightColors,
      toggleTheme,
      setDarkMode,
    }),
    [isDark, toggleTheme, setDarkMode]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/**
 * Use theme hook
 */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error('useTheme must be used within ThemeProvider');
  }

  return context;
}
