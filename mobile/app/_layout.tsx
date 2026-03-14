import "../global.css";
import React, { useEffect, useState } from 'react';
import { Stack, router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useConnectionStore } from '../src/store/connection';

// keyboard-controller requires native modules — only available in standalone APK builds, not Expo Go
const isExpoGo = Constants.appOwnership === 'expo';
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> | null = null;
if (!isExpoGo) {
  try {
    KeyboardProvider = require('react-native-keyboard-controller').KeyboardProvider;
  } catch {
    // native module not available
  }
}

const BRIDGE_URL_KEY = 'vibelink_bridge_url';
const AUTH_TOKEN_KEY = 'vibelink_auth_token';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setBridgeUrl = useConnectionStore((s) => s.setBridgeUrl);
  const setAuthToken = useConnectionStore((s) => s.setAuthToken);

  useEffect(() => {
    (async () => {
      const storedUrl = await SecureStore.getItemAsync(BRIDGE_URL_KEY);
      const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

      if (storedUrl) {
        setBridgeUrl(storedUrl);
        setAuthToken(storedToken ?? '');
      }

      setReady(true);

      setTimeout(() => {
        if (!storedUrl) {
          router.replace('/setup');
        }
      }, 0);
    })();
  }, [setBridgeUrl, setAuthToken]);

  if (!ready) return null;

  const content = (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: '#18181b' },
          headerTintColor: '#fafafa',
          headerTitleStyle: { color: '#fafafa' },
          contentStyle: { backgroundColor: '#0a0a0a' },
        }}
      />
    </>
  );

  return (
    <SafeAreaProvider>
      {KeyboardProvider ? <KeyboardProvider>{content}</KeyboardProvider> : content}
    </SafeAreaProvider>
  );
}
