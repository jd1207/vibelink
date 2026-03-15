import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View, Text, Pressable, FlatList, Alert, Animated, PanResponder, Dimensions,
} from 'react-native';
import { router, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSessionStore, Session } from '../src/store/sessions';
import { useConnectionStore } from '../src/store/connection';
import { bridgeApi } from '../src/services/bridge-api';
import { ConnectionBadge } from '../src/components/ConnectionBadge';
import { ThemePicker } from '../src/components/ThemePicker';
import { useColors } from '../src/store/settings';

const SCREEN_WIDTH = Dimensions.get('window').width;
const DELETE_THRESHOLD = -80;

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  return date.toLocaleDateString();
}

function SessionRow({ session, onPress, onDelete }: { session: Session; onPress: () => void; onDelete: () => void }) {
  const colors = useColors();
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderMove: (_, g) => { if (g.dx < 0) translateX.setValue(Math.max(g.dx, -120)); },
      onPanResponderRelease: (_, g) => {
        if (g.dx < DELETE_THRESHOLD) {
          Alert.alert('end session', `stop claude and remove "${session.projectName}"?`, [
            { text: 'cancel', style: 'cancel', onPress: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start() },
            { text: 'end session', style: 'destructive', onPress: onDelete },
          ]);
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <View className="mx-4 mb-3">
      <View className="absolute inset-0 bg-red-600 rounded-xl flex-row items-center justify-end px-5">
        <Text className="text-white font-semibold text-sm">end session</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable
          onPress={onPress}
          className="rounded-xl p-4 active:opacity-70 border"
          style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
        >
          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-medium text-base flex-1" numberOfLines={1} style={{ color: colors.text.primary }}>
              {session.projectName}
            </Text>
            <Text className="text-xs ml-2" style={{ color: colors.text.muted }}>{formatTime(session.createdAt)}</Text>
          </View>
          <Text className="text-xs mb-2" numberOfLines={1} style={{ color: colors.text.dim }}>{session.projectPath}</Text>
          {session.lastMessage ? (
            <Text className="text-sm mb-2" numberOfLines={2} style={{ color: colors.text.muted }}>{session.lastMessage}</Text>
          ) : null}
          <View className="flex-row items-center gap-2">
            <View className={`w-2 h-2 rounded-full ${session.alive ? 'bg-emerald-500' : ''}`}
              style={session.alive ? undefined : { backgroundColor: colors.text.dim }} />
            <Text className="text-xs" style={{ color: colors.text.subtle }}>
              {session.alive ? 'claude running' : 'session ended'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function SessionsScreen() {
  const colors = useColors();
  const sessions = useSessionStore((s) => s.sessions);
  const sessionList = Object.values(sessions);
  const [menuOpen, setMenuOpen] = useState(false);

  const handleDisconnect = useCallback(() => {
    Alert.alert('disconnect', 'return to setup screen?', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'disconnect', style: 'destructive',
        onPress: async () => {
          await SecureStore.deleteItemAsync('vibelink_bridge_url');
          await SecureStore.deleteItemAsync('vibelink_auth_token');
          useConnectionStore.getState().setBridgeUrl('');
          useConnectionStore.getState().setAuthToken('');
          useConnectionStore.getState().setConnected(false);
          router.replace('/setup');
        },
      },
    ]);
  }, []);

  const loadSessions = useCallback(() => {
    bridgeApi.getSessions()
      .then((data) => { useSessionStore.getState().setSessions(data); useConnectionStore.getState().setConnected(true); })
      .catch(() => { useConnectionStore.getState().setConnected(false); });
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleDelete = async (id: string) => {
    try { await bridgeApi.deleteSession(id); } catch {}
    useSessionStore.getState().removeSession(id);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: '',
          headerTitle: () => (
            <Pressable onPress={() => setMenuOpen(true)} className="active:opacity-60">
              <Text className="text-lg font-semibold" style={{ color: colors.text.primary }}>vibelink</Text>
            </Pressable>
          ),
          headerRight: () => <ConnectionBadge />,
        }}
      />
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        {sessionList.length > 0 && (
          <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
            <Text className="text-xs" style={{ color: colors.text.subtle }}>
              {sessionList.filter(s => s.alive).length} active process{sessionList.filter(s => s.alive).length !== 1 ? 'es' : ''}
            </Text>
            <Text className="text-xs" style={{ color: colors.text.dim }}>swipe left to end</Text>
          </View>
        )}
        <FlatList
          data={sessionList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: sessionList.length > 0 ? 0 : 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <SessionRow session={item} onPress={() => router.push(`/session/${item.id}`)} onDelete={() => handleDelete(item.id)} />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-32">
              <Text className="text-lg mb-2" style={{ color: colors.text.dim }}>no sessions yet</Text>
              <Text className="text-sm" style={{ color: colors.text.subtle }}>tap new chat to start</Text>
            </View>
          }
        />
        <View className="absolute bottom-0 left-0 right-0 pb-8 pt-4 px-4 border-t"
          style={{ backgroundColor: colors.bg.primary, borderTopColor: colors.border.default }}>
          <Pressable
            onPress={() => router.push('/projects')}
            className="rounded-xl py-4 items-center active:opacity-80"
            style={{ backgroundColor: colors.accent.primary }}
          >
            <Text className="font-semibold text-base" style={{ color: colors.text.primary }}>new chat</Text>
          </Pressable>
        </View>
      </View>
      <ThemePicker visible={menuOpen} onClose={() => setMenuOpen(false)} onDisconnect={handleDisconnect} />
    </>
  );
}
