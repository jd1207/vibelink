import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  SectionList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { router, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSessionStore, Session } from '../src/store/sessions';
import { useConnectionStore } from '../src/store/connection';
import { bridgeApi } from '../src/services/bridge-api';
import { ConnectionBadge } from '../src/components/ConnectionBadge';

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

interface SessionRowProps {
  session: ClaudeSession;
  onPress: () => void;
  vibelinkSession?: Session;
}

function SessionRow({ session, onPress, vibelinkSession }: SessionRowProps) {
  const modelLabel = formatModel(session.model);
  const lastUserMsg = [...session.recentMessages]
    .reverse()
    .find((m) => m.role === 'user');

  return (
    <Pressable
      onPress={onPress}
      className="bg-[#18181b] border border-[#27272a] rounded-xl mx-4 mb-3 p-4 active:opacity-70"
    >
      {/* top row: project name + time */}
      <View className="flex-row items-center justify-between mb-1">
        <Text
          className="text-[#fafafa] font-medium text-base flex-1"
          numberOfLines={1}
        >
          {session.projectName}
        </Text>
        <Text className="text-[#a1a1aa] text-xs ml-2">
          {formatTime(session.lastActivity)}
        </Text>
      </View>

      {/* badges: model, branch, vibelink status */}
      <View className="flex-row items-center gap-1.5 mb-2">
        {session.alive && (
          <View className="flex-row items-center gap-1">
            <View className="w-2 h-2 rounded-full bg-emerald-500" />
            <Text className="text-emerald-400 text-xs">running</Text>
          </View>
        )}
        {!session.alive && (
          <View className="flex-row items-center gap-1">
            <View className="w-2 h-2 rounded-full bg-[#52525b]" />
            <Text className="text-[#71717a] text-xs">ended</Text>
          </View>
        )}
        {modelLabel ? (
          <View className="bg-[#1d3557] rounded px-1.5 py-0.5 ml-1">
            <Text className="text-[#60a5fa] text-xs">{modelLabel}</Text>
          </View>
        ) : null}
        {session.gitBranch ? (
          <View className="bg-[#27272a] rounded px-1.5 py-0.5">
            <Text className="text-[#a1a1aa] text-xs" numberOfLines={1}>
              {session.gitBranch}
            </Text>
          </View>
        ) : null}
        {vibelinkSession ? (
          <View className="bg-[#164e3f] rounded px-1.5 py-0.5">
            <Text className="text-emerald-300 text-xs">vibelink</Text>
          </View>
        ) : null}
      </View>

      {/* last user message preview */}
      {lastUserMsg ? (
        <Text className="text-[#a1a1aa] text-sm" numberOfLines={2}>
          {lastUserMsg.text}
        </Text>
      ) : (
        <Text className="text-[#52525b] text-xs" numberOfLines={1}>
          {session.projectPath}
        </Text>
      )}
    </Pressable>
  );
}

interface SectionData {
  title: string;
  data: ClaudeSession[];
}

export default function SessionsScreen() {
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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

  const handleSessionPress = useCallback(
    (session: ClaudeSession) => {
      // check if there's already a vibelink session for this project
      const existingVl = Object.values(vibelinkSessions).find(
        (vl) => vl.projectPath === session.projectPath && vl.alive,
      );
      if (existingVl) {
        router.push(`/session/${existingVl.id}`);
        return;
      }

      // for dead sessions, offer to resume
      const resumeId = session.alive ? undefined : session.sessionId;

      createVibelinkSession(session.projectPath, resumeId)
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

  // group sessions into sections
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
            <Pressable onPress={handleDisconnect} className="active:opacity-60">
              <Text className="text-[#fafafa] text-lg font-semibold">
                vibelink
              </Text>
            </Pressable>
          ),
          headerRight: () => <ConnectionBadge />,
        }}
      />
      <View className="flex-1 bg-[#0a0a0a]">
        {loading && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#3b82f6" />
            <Text className="text-[#71717a] mt-3 text-sm">
              scanning sessions...
            </Text>
          </View>
        )}

        {error && !loading && (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-[#ef4444] text-base mb-2 text-center">
              {error}
            </Text>
            <Pressable
              onPress={loadSessions}
              className="bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-2 mt-2"
            >
              <Text className="text-[#a1a1aa]">retry</Text>
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
                <Text className="text-[#71717a] text-xs uppercase tracking-wider">
                  {section.title}
                </Text>
                <Text className="text-[#52525b] text-xs">
                  {section.data.length}
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
                  vibelinkSession={vlSession}
                />
              );
            }}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center pt-32">
                <Text className="text-[#52525b] text-lg mb-2">
                  no claude sessions found
                </Text>
                <Text className="text-[#3f3f46] text-sm">
                  start a claude code session to see it here
                </Text>
              </View>
            }
          />
        )}

        <View className="absolute bottom-0 left-0 right-0 pb-8 pt-4 px-4 bg-[#0a0a0a] border-t border-[#27272a]">
          <Pressable
            onPress={() => router.push('/projects')}
            className="bg-[#3b82f6] rounded-xl py-4 items-center active:opacity-80"
          >
            <Text className="text-white font-semibold text-base">
              new session
            </Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
