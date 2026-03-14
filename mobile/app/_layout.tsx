import "../global.css";
import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#18181b' },
          headerTintColor: '#fafafa',
          headerTitleStyle: { color: '#fafafa' },
          contentStyle: { backgroundColor: '#0a0a0a' },
        }}
      />
    </SafeAreaProvider>
  );
}
