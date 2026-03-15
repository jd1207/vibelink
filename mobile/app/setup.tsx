import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useConnectionStore } from '../src/store/connection';

const BRIDGE_URL_KEY = 'vibelink_bridge_url';
const AUTH_TOKEN_KEY = 'vibelink_auth_token';

function parseVibelinkUri(uri: string): { host: string; port: string; token: string } | null {
  try {
    if (!uri.startsWith('vibelink://connect')) return null;
    const url = new URL(uri);
    const host = url.searchParams.get('host');
    const port = url.searchParams.get('port') || '3400';
    const token = url.searchParams.get('token') || '';
    if (!host) return null;
    return { host, port, token };
  } catch {
    return null;
  }
}

export default function SetupScreen() {
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();

  const { setBridgeUrl: storeSetUrl, setAuthToken: storeSetToken } = useConnectionStore();
  const params = useLocalSearchParams<{ host?: string; port?: string; token?: string }>();

  const handleConnect = useCallback(async (overrideUrl?: string, overrideToken?: string) => {
    const url = (overrideUrl || bridgeUrl).trim();
    if (!url) {
      setError('bridge url is required');
      return;
    }

    const connectToken = overrideToken ?? authToken;

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
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, connectToken.trim());

      // update zustand
      storeSetUrl(normalizedUrl);
      storeSetToken(connectToken.trim());

      router.replace('/');
    } catch (err) {
      setError('could not connect. check that tailscale is running on both devices.');
    } finally {
      setTesting(false);
    }
  }, [bridgeUrl, authToken, storeSetUrl, storeSetToken]);

  const scannedRef = useRef(false);

  const handleQrScanned = useCallback(({ data }: { data: string }) => {
    if (scannedRef.current) return;
    scannedRef.current = true;
    setScanning(false);
    const parsed = parseVibelinkUri(data);
    if (parsed) {
      const fullUrl = `${parsed.host}:${parsed.port}`;
      setBridgeUrl(fullUrl);
      setAuthToken(parsed.token);
      handleConnect(fullUrl, parsed.token);
    } else {
      scannedRef.current = false;
      setError('not a vibelink qr code. try the one from your setup script.');
    }
  }, [handleConnect]);

  // auto-connect when navigated from deep link with pre-filled params
  useEffect(() => {
    if (params.host) {
      const prefillUrl = `${params.host}:${params.port || '3400'}`;
      setBridgeUrl(prefillUrl);
      if (params.token) setAuthToken(params.token);
      handleConnect(prefillUrl, params.token || '');
    }
  }, [params.host]);

  return (
    <>
      <Stack.Screen options={{ title: 'setup', headerBackVisible: false }} />

      {scanning ? (
        <View style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
            onBarcodeScanned={handleQrScanned}
          />
          <Pressable
            onPress={() => setScanning(false)}
            style={{ position: 'absolute', top: 60, right: 20, padding: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8 }}
          >
            <Text style={{ color: '#fff', fontSize: 16 }}>cancel</Text>
          </Pressable>
        </View>
      ) : null}

      <View className="flex-1 bg-[#0a0a0a] px-6 pt-16">
        <Text className="text-[#fafafa] text-2xl font-bold mb-2">vibelink</Text>
        <Text className="text-[#71717a] text-sm mb-8">
          connect to your bridge server to get started
        </Text>

        <Pressable
          onPress={async () => {
            if (!permission?.granted) {
              const result = await requestPermission();
              if (!result.granted) return;
            }
            scannedRef.current = false;
            setScanning(true);
          }}
          className="bg-[#3b82f6] p-4 rounded-xl items-center mb-6 active:opacity-80"
        >
          <Text className="text-[#fafafa] text-base font-semibold">
            scan qr code
          </Text>
        </Pressable>

        <Text className="text-[#a1a1aa] text-center mb-4">
          or enter manually
        </Text>

        <Text className="text-[#a1a1aa] text-sm mb-1.5">bridge url</Text>
        <TextInput
          className="bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-[#fafafa] text-base mb-1"
          placeholder="100.64.0.1:3400"
          placeholderTextColor="#52525b"
          value={bridgeUrl}
          onChangeText={setBridgeUrl}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
        />
        <Text className="text-[#a1a1aa] text-xs mt-1 mb-2">
          both your phone and computer need tailscale on the same account
        </Text>

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
          onPress={() => handleConnect()}
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
