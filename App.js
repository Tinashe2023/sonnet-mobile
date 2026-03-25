import React, { useContext } from 'react';
import { StatusBar } from 'react-native';
import AppNavigator from './src/navigation/AppNavigator';
import { ThemeProvider, ThemeContext } from './src/context/ThemeContext';

function ThemedApp() {
  const { colors, isDark } = useContext(ThemeContext);
  return (
    <>
      <StatusBar
        barStyle={isDark ? "light-content" : "light-content"}
        backgroundColor={colors.headerDark}
      />
      <AppNavigator />
    </>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <ThemedApp />
    </ThemeProvider>
  );
}
