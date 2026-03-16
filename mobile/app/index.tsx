import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  SectionList,
  ActivityIndicator,
  Alert,
  Animated,
  PanResponder,
} from 'react-native';
import { router, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSessionStore, Session } from '../src/store/sessions';
import { useConnectionStore } from '../src/store/connection';
import { bridgeApi } from '../src/services/bridge-api';
import { ConnectionBadge } from '../src/components/ConnectionBadge';
import { SettingsSheet } from '../src/components/SettingsSheet';
import { useColors } from '../src/store/settings';

interface RecentMessage {
  role: 'user' | 'assistant';
  text: string;
  timestamp: string;
}

interface ClaudeSession {
  sessionId: string;
  projectPath: string;
  projectName: string;
  lastActivity: string;
  model: string | null;
  gitBranch: string | null;
  alive: boolean;
  recentMessages: RecentMessage[];
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatModel(model: string | null): string {
  if (!model) return '';
  if (model.includes('opus')) return 'opus';
  if (model.includes('sonnet')) return 'sonnet';
  if (model.includes('haiku')) return 'haiku';
  return model.split('-').slice(0, 2).join('-');
}

async function fetchClaudeSessions(): Promise<ClaudeSession[]> {
  const { bridgeUrl, authToken } = useConnectionStore.getState();
  if (!bridgeUrl) return [];
  const response = await fetch(`${bridgeUrl}/claude-sessions`, {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
  });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}

const DELETE_THRESHOLD = -80;

interface SessionRowProps {
  session: ClaudeSession;
  onPress: () => void;
  onDelete: () => void;
  vibelinkSession?: Session;
}

function SessionRow({ session, onPress, onDelete, vibelinkSession }: SessionRowProps) {
  const colors = useColors();
  const modelLabel = formatModel(session.model);
  const lastUserMsg = [...session.recentMessages]
    .reverse()
    .find((m) => m.role === 'user');

  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          translateX.setValue(Math.max(gesture.dx, -120));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < DELETE_THRESHOLD) {
          Alert.alert(
            'delete session',
            `remove "${session.projectName}" from history?`,
            [
              {
                text: 'cancel',
                style: 'cancel',
                onPress: () =>
                  Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
              },
              { text: 'delete', style: 'destructive', onPress: onDelete },
            ],
          );
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  return (
    <View className="mx-4 mb-3">
      <View className="absolute inset-0 bg-red-600 rounded-xl flex-row items-center justify-end px-5">
        <Text className="text-white font-semibold text-sm">delete</Text>
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
            <Text className="text-xs ml-2" style={{ color: colors.text.muted }}>
              {formatTime(session.lastActivity)}
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5 mb-2">
            {session.alive ? (
              <View className="flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.status.success }} />
                <Text className="text-xs" style={{ color: colors.status.success }}>running</Text>
              </View>
            ) : (
              <View className="flex-row items-center gap-1">
                <View className="w-2 h-2 rounded-full" style={{ backgroundColor: colors.text.dim }} />
                <Text className="text-xs" style={{ color: colors.text.subtle }}>ended</Text>
              </View>
            )}
            {modelLabel ? (
              <View className="rounded px-1.5 py-0.5 ml-1" style={{ backgroundColor: colors.bg.secondary }}>
                <Text className="text-xs" style={{ color: colors.accent.primary }}>{modelLabel}</Text>
              </View>
            ) : null}
            {session.gitBranch ? (
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.bg.secondary }}>
                <Text className="text-xs" numberOfLines={1} style={{ color: colors.text.muted }}>
                  {session.gitBranch}
                </Text>
              </View>
            ) : null}
            {vibelinkSession ? (
              <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.bg.secondary }}>
                <Text className="text-xs" style={{ color: colors.status.success }}>vibelink</Text>
              </View>
            ) : null}
          </View>

          {lastUserMsg ? (
            <Text className="text-sm" numberOfLines={2} style={{ color: colors.text.muted }}>
              {lastUserMsg.text}
            </Text>
          ) : (
            <Text className="text-xs" numberOfLines={1} style={{ color: colors.text.dim }}>
              {session.projectPath}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}

interface SectionData {
  title: string;
  data: ClaudeSession[];
}

export default function SessionsScreen() {
  const colors = useColors();
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const vibelinkSessions = useSessionStore((s) => s.sessions);

  const loadSessions = useCallback(async () => {
    try {
      const [cliSessions, vlSessions] = await Promise.all([
        fetchClaudeSessions(),
        bridgeApi.getSessions().catch(() => [] as Session[]),
      ]);
      setClaudeSessions(cliSessions);
      useSessionStore.getState().setSessions(vlSessions);
      useConnectionStore.getState().setConnected(true);
      setError(null);
    } catch (err) {
      setError('could not reach bridge');
      useConnectionStore.getState().setConnected(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleDisconnect = useCallback(async () => {
    Alert.alert('disconnect', 'return to setup screen?', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'disconnect',
        style: 'destructive',
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

  const createVibelinkSession = useCallback(
    async (projectPath: string, resumeSessionId?: string) => {
      const { bridgeUrl, authToken } = useConnectionStore.getState();
      const res = await fetch(`${bridgeUrl}/sessions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          projectPath,
          ...(resumeSessionId ? { resumeSessionId } : {}),
        }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      const raw = await res.json();
      const name = projectPath.split('/').filter(Boolean).pop() ?? projectPath;
      return {
        id: raw.sessionId as string,
        projectPath,
        projectName: name,
        createdAt: new Date().toISOString(),
        alive: true,
      };
    },
    [],
  );

  const handleDeleteSession = useCallback(
    async (session: ClaudeSession) => {
      const { bridgeUrl, authToken } = useConnectionStore.getState();
      try {
        await fetch(`${bridgeUrl}/claude-sessions/${session.sessionId}`, {
          method: 'DELETE',
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
        });
      } catch {
        // ignore network errors on delete
      }
      setClaudeSessions((prev) =>
        prev.filter((s) => s.sessionId !== session.sessionId),
      );
    },
    [],
  );

  const handleSessionPress = useCallback(
    (session: ClaudeSession) => {
      const existingVl = Object.values(vibelinkSessions).find(
        (vl) => vl.projectPath === session.projectPath && vl.alive,
      );
      if (existingVl) {
        router.push(`/session/${existingVl.id}`);
        return;
      }

      createVibelinkSession(session.projectPath, session.sessionId)
        .then((newSession) => {
          useSessionStore.getState().addSession(newSession);
          router.push(`/session/${newSession.id}`);
        })
        .catch((err) => {
          Alert.alert('error', `could not connect to session: ${err}`);
        });
    },
    [vibelinkSessions, createVibelinkSession],
  );

  const sections: SectionData[] = [];
  const alive = claudeSessions.filter((s) => s.alive);
  const recent = claudeSessions.filter((s) => !s.alive).slice(0, 20);

  if (alive.length > 0) {
    sections.push({ title: 'active sessions', data: alive });
  }
  if (recent.length > 0) {
    sections.push({ title: 'recent sessions', data: recent });
  }

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
        {loading && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent.primary} />
            <Text className="mt-3 text-sm" style={{ color: colors.text.subtle }}>
              scanning sessions...
            </Text>
          </View>
        )}

        {error && !loading && (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-base mb-2 text-center" style={{ color: colors.status.error }}>
              {error}
            </Text>
            <Pressable
              onPress={loadSessions}
              className="rounded-lg px-4 py-2 mt-2 border"
              style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
            >
              <Text style={{ color: colors.text.muted }}>retry</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && (
          <SectionList
            sections={sections}
            keyExtractor={(item) => item.sessionId}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
            renderSectionHeader={({ section }) => (
              <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
                <Text className="text-xs uppercase tracking-wider" style={{ color: colors.text.subtle }}>
                  {section.title}
                </Text>
                <Text className="text-xs" style={{ color: colors.text.dim }}>
                  {section.data.length} · swipe to delete
                </Text>
              </View>
            )}
            renderItem={({ item }) => {
              const vlSession = Object.values(vibelinkSessions).find(
                (vl) => vl.projectPath === item.projectPath,
              );
              return (
                <SessionRow
                  session={item}
                  onPress={() => handleSessionPress(item)}
                  onDelete={() => handleDeleteSession(item)}
                  vibelinkSession={vlSession}
                />
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center pt-32">
                <Text className="text-lg mb-2" style={{ color: colors.text.dim }}>
                  no claude sessions found
                </Text>
                <Text className="text-sm" style={{ color: colors.text.subtle }}>
                  start a claude code session to see it here
                </Text>
              </View>
            }
          />
        )}

        <View className="absolute bottom-0 left-0 right-0 pb-8 pt-4 px-4 border-t"
          style={{ backgroundColor: colors.bg.primary, borderTopColor: colors.border.default }}>
          <Pressable
            onPress={() => router.push('/projects')}
            className="rounded-xl py-4 items-center active:opacity-80"
            style={{ backgroundColor: colors.accent.primary }}
          >
            <Text className="font-semibold text-base" style={{ color: colors.text.onAccent }}>
              new session
            </Text>
          </Pressable>
        </View>
      </View>
      <SettingsSheet visible={menuOpen} onClose={() => setMenuOpen(false)} onDisconnect={handleDisconnect} />
    </>
  );
}
