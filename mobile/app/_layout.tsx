import "../global.css";
import React, { useEffect, useRef, useState } from 'react';
import { Stack, router } from 'expo-router';
import * as Linking from 'expo-linking';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { useConnectionStore } from '../src/store/connection';
import { useColors, useSettingsStore, THEME_KEY } from '../src/store/settings';
import { themes, ThemeKey } from '../src/constants/colors';

const isExpoGo = Constants.appOwnership === 'expo';
let KeyboardProvider: React.ComponentType<{ children: React.ReactNode }> | null = null;
if (!isExpoGo) {
  try { KeyboardProvider = require('react-native-keyboard-controller').KeyboardProvider; } catch {}
}

const BRIDGE_URL_KEY = 'vibelink_bridge_url';
const AUTH_TOKEN_KEY = 'vibelink_auth_token';

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const setBridgeUrl = useConnectionStore((s) => s.setBridgeUrl);
  const setAuthToken = useConnectionStore((s) => s.setAuthToken);
  const colors = useColors();

  useEffect(() => {
    (async () => {
      // load theme before any UI renders
      const savedTheme = await SecureStore.getItemAsync(THEME_KEY);
      if (savedTheme && savedTheme in themes) {
        useSettingsStore.setState({ theme: savedTheme as ThemeKey });
      }

      const storedUrl = await SecureStore.getItemAsync(BRIDGE_URL_KEY);
      const storedToken = await SecureStore.getItemAsync(AUTH_TOKEN_KEY);

      if (storedUrl) {
        setBridgeUrl(storedUrl);
        setAuthToken(storedToken ?? '');
      }

      setReady(true);

      setTimeout(() => {
        if (!storedUrl) router.replace('/setup');
      }, 0);
    })();
  }, [setBridgeUrl, setAuthToken]);

  const pendingDeepLink = useRef<string | null>(null);
  const initialUrlChecked = useRef(false);

  useEffect(() => {
    if (initialUrlChecked.current) return;
    initialUrlChecked.current = true;
    Linking.getInitialURL().then((url) => {
      if (url) {
        if (ready) handleDeepLink(url);
        else pendingDeepLink.current = url;
      }
    });
  }, []);

  useEffect(() => {
    const sub = Linking.addEventListener('url', ({ url }) => {
      if (ready) handleDeepLink(url);
      else pendingDeepLink.current = url;
    });
    return () => sub.remove();
  }, [ready]);

  useEffect(() => {
    if (ready && pendingDeepLink.current) {
      handleDeepLink(pendingDeepLink.current);
      pendingDeepLink.current = null;
    }
  }, [ready]);

  function handleDeepLink(url: string) {
    if (!url.startsWith('vibelink://connect')) return;
    try {
      const parsed = new URL(url);
      const host = parsed.searchParams.get('host');
      const port = parsed.searchParams.get('port') || '3400';
      const token = parsed.searchParams.get('token') || '';
      if (host) router.replace({ pathname: '/setup', params: { host, port, token } });
    } catch {}
  }

  if (!ready) return null;

  const content = (
    <>
      <StatusBar style={colors.mode === 'light' ? 'dark' : 'light'} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg.surface },
          headerTintColor: colors.text.primary,
          headerTitleStyle: { color: colors.text.primary },
          contentStyle: { backgroundColor: colors.bg.primary },
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
