import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useConnectionStore } from '../src/store/connection';

const BRIDGE_URL_KEY = 'vibelink_bridge_url';
const AUTH_TOKEN_KEY = 'vibelink_auth_token';

export default function SetupScreen() {
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');

  const { setBridgeUrl: storeSetUrl, setAuthToken: storeSetToken } = useConnectionStore();

  const handleConnect = useCallback(async () => {
    const url = bridgeUrl.trim();
    if (!url) {
      setError('bridge url is required');
      return;
    }

    // normalize url — add http:// if missing
    const normalizedUrl = url.startsWith('http') ? url : `http://${url}`;

    setTesting(true);
    setError('');

    try {
      const res = await fetch(`${normalizedUrl}/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      if (body.status !== 'ok') throw new Error('unexpected response');

      // save to secure store
      await SecureStore.setItemAsync(BRIDGE_URL_KEY, normalizedUrl);
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, authToken.trim());

      // update zustand
      storeSetUrl(normalizedUrl);
      storeSetToken(authToken.trim());

      router.replace('/');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'connection failed';
      setError(`could not connect: ${msg}`);
    } finally {
      setTesting(false);
    }
  }, [bridgeUrl, authToken, storeSetUrl, storeSetToken]);

  return (
    <>
      <Stack.Screen options={{ title: 'setup', headerBackVisible: false }} />
      <View className="flex-1 bg-[#0a0a0a] px-6 pt-16">
        <Text className="text-[#fafafa] text-2xl font-bold mb-2">vibelink</Text>
        <Text className="text-[#71717a] text-sm mb-8">
          connect to your bridge server to get started
        </Text>

        <Text className="text-[#a1a1aa] text-sm mb-1.5">bridge url</Text>
        <TextInput
          className="bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-[#fafafa] text-base mb-4"
          placeholder="100.64.0.1:3400"
          placeholderTextColor="#52525b"
          value={bridgeUrl}
          onChangeText={setBridgeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />

        <Text className="text-[#a1a1aa] text-sm mb-1.5">auth token</Text>
        <TextInput
          className="bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-[#fafafa] text-base mb-6"
          placeholder="optional"
          placeholderTextColor="#52525b"
          value={authToken}
          onChangeText={setAuthToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />

        {error ? (
          <Text className="text-[#ef4444] text-sm mb-4">{error}</Text>
        ) : null}

        <Pressable
          onPress={handleConnect}
          disabled={testing}
          className={`rounded-xl py-4 items-center ${testing ? 'bg-[#27272a]' : 'bg-[#3b82f6] active:opacity-80'}`}
        >
          {testing ? (
            <ActivityIndicator color="#fafafa" />
          ) : (
            <Text className="text-white font-semibold text-base">connect</Text>
          )}
        </Pressable>
      </View>
    </>
  );
}

export { BRIDGE_URL_KEY, AUTH_TOKEN_KEY };
