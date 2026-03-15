import React, { useState, useCallback, useEffect, useRef } from 'react';
import { View, Text, TextInput, Pressable, ActivityIndicator, Alert } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useConnectionStore } from '../src/store/connection';
import { useColors } from '../src/store/settings';

let CameraViewComponent: React.ComponentType<any> | null = null;
let useCameraPermissionsFn: (() => [any, () => Promise<any>]) | null = null;
try {
  const cam = require('expo-camera');
  CameraViewComponent = cam.CameraView;
  useCameraPermissionsFn = cam.useCameraPermissions;
} catch {}

const useCameraPermissionsHook: () => [any, () => Promise<any>] =
  useCameraPermissionsFn ?? (() => [null, async () => ({ granted: false })]);

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
  } catch { return null; }
}

export default function SetupScreen() {
  const colors = useColors();
  const [bridgeUrl, setBridgeUrl] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [scanning, setScanning] = useState(false);
  const [permission, requestPermission] = useCameraPermissionsHook();

  const { setBridgeUrl: storeSetUrl, setAuthToken: storeSetToken } = useConnectionStore();
  const params = useLocalSearchParams<{ host?: string; port?: string; token?: string }>();

  const handleConnect = useCallback(async (overrideUrl?: string, overrideToken?: string) => {
    const url = (overrideUrl || bridgeUrl).trim();
    if (!url) { setError('bridge url is required'); return; }
    const connectToken = overrideToken ?? authToken;
    const normalizedUrl = url.startsWith('http') ? url : `http://${url}`;
    setTesting(true);
    setError('');
    try {
      const res = await fetch(`${normalizedUrl}/health`, { method: 'GET' });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const body = await res.json();
      if (body.status !== 'ok') throw new Error('unexpected response');
      await SecureStore.setItemAsync(BRIDGE_URL_KEY, normalizedUrl);
      await SecureStore.setItemAsync(AUTH_TOKEN_KEY, connectToken.trim());
      storeSetUrl(normalizedUrl);
      storeSetToken(connectToken.trim());
      router.replace('/');
    } catch { setError('could not connect. check that tailscale is running on both devices.'); }
    finally { setTesting(false); }
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
      {scanning && CameraViewComponent ? (
        <View style={{ flex: 1, position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}>
          <CameraViewComponent style={{ flex: 1 }} facing="back" barcodeScannerSettings={{ barcodeTypes: ['qr'] }} onBarcodeScanned={handleQrScanned} />
          <Pressable onPress={() => setScanning(false)} style={{ position: 'absolute', top: 60, right: 20, padding: 12, backgroundColor: 'rgba(0,0,0,0.6)', borderRadius: 8 }}>
            <Text style={{ color: colors.text.primary, fontSize: 16 }}>cancel</Text>
          </Pressable>
        </View>
      ) : null}
      <View className="flex-1 px-6 pt-16" style={{ backgroundColor: colors.bg.primary }}>
        <Text className="text-2xl font-bold mb-2" style={{ color: colors.text.primary }}>vibelink</Text>
        <Text className="text-sm mb-8" style={{ color: colors.text.subtle }}>connect to your bridge server to get started</Text>
        {CameraViewComponent ? (
          <>
            <Pressable onPress={async () => {
              if (!permission?.granted) { const r = await requestPermission(); if (!r.granted) return; }
              scannedRef.current = false; setScanning(true);
            }} className="p-4 rounded-xl items-center mb-6 active:opacity-80" style={{ backgroundColor: colors.accent.primary }}>
              <Text className="text-base font-semibold" style={{ color: colors.text.primary }}>scan qr code</Text>
            </Pressable>
            <Text className="text-center mb-4" style={{ color: colors.text.muted }}>or enter manually</Text>
          </>
        ) : null}
        <Text className="text-sm mb-1.5" style={{ color: colors.text.muted }}>bridge url</Text>
        <TextInput className="rounded-xl px-4 py-3 text-base mb-1 border" style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default, color: colors.text.primary }}
          placeholder="hostname:3400" placeholderTextColor={colors.text.dim} value={bridgeUrl} onChangeText={setBridgeUrl} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
        <Text className="text-xs mt-1 mb-2" style={{ color: colors.text.muted }}>use your device's tailscale hostname or IP</Text>
        <Text className="text-sm mb-1.5" style={{ color: colors.text.muted }}>auth token</Text>
        <TextInput className="rounded-xl px-4 py-3 text-base mb-6 border" style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default, color: colors.text.primary }}
          placeholder="optional" placeholderTextColor={colors.text.dim} value={authToken} onChangeText={setAuthToken} autoCapitalize="none" autoCorrect={false} secureTextEntry />
        {error ? <Text className="text-sm mb-4" style={{ color: colors.status.error }}>{error}</Text> : null}
        <Pressable onPress={() => handleConnect()} disabled={testing} className="rounded-xl py-4 items-center active:opacity-80"
          style={{ backgroundColor: testing ? colors.border.subtle : colors.accent.primary }}>
          {testing ? <ActivityIndicator color={colors.text.primary} /> : <Text className="font-semibold text-base" style={{ color: colors.text.primary }}>connect</Text>}
        </Pressable>
      </View>
    </>
  );
}

export { BRIDGE_URL_KEY, AUTH_TOKEN_KEY };
