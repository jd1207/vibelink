import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { router, Stack } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { useSessionStore, Session, SessionType } from '../src/store/sessions';
import { useConnectionStore } from '../src/store/connection';
import { bridgeApi } from '../src/services/bridge-api';
import { ConnectionBadge } from '../src/components/ConnectionBadge';
import { ThemePicker } from '../src/components/ThemePicker';
import { SessionRow } from '../src/components/SessionRow';
import { useColors } from '../src/store/settings';
import type { ClaudeSession, DisplaySession } from '../src/types/session-list';
import { classifySessions } from '../src/types/session-list';

type ListItem = DisplaySession | { key: string; type: 'section_header' | 'empty_message'; text: string };

export default function SessionsScreen() {
  const colors = useColors();
  const [claudeSessions, setClaudeSessions] = useState<ClaudeSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [otherExpanded, setOtherExpanded] = useState(false);
  const vibelinkSessions = useSessionStore((s) => s.sessions);

  const loadSessions = useCallback(async () => {
    try {
      const [cliSessions, vlSessions] = await Promise.all([
        bridgeApi.getClaudeSessions().catch(() => [] as ClaudeSession[]),
        bridgeApi.getSessions().catch(() => [] as Array<{ id: string; projectPath: string; projectName: string; createdAt: string; alive: boolean; lastMessage?: string }>),
      ]);
      setClaudeSessions(cliSessions as ClaudeSession[]);
      const storeSessions: Session[] = vlSessions.map((vl) => ({
        ...vl,
        sessionType: 'vibelink' as SessionType,
      }));
      useSessionStore.getState().setSessions(storeSessions);
      useConnectionStore.getState().setConnected(true);
      setError(null);
    } catch {
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

  const vlSessionValues = Object.values(vibelinkSessions);
  const { activeSessions, idleSessions } = classifySessions(claudeSessions, vlSessionValues);

  const autoExpanded = activeSessions.length === 0 && idleSessions.length > 0;
  const showIdle = otherExpanded || autoExpanded;

  const handlePress = useCallback((item: DisplaySession) => {
    if (item.sessionType === 'vibelink' && item.vibelinkSessionId) {
      router.push(`/session/${item.vibelinkSessionId}`);
      return;
    }
    if (item.sessionType === 'terminal' && item.claudeSessionId) {
      bridgeApi.watchSession(item.claudeSessionId)
        .then((result) => {
          router.push(
            `/session/${result.sessionId}?watch=true&claudeSessionId=${item.claudeSessionId}&projectPath=${encodeURIComponent(item.projectPath)}`,
          );
        })
        .catch((err) => Alert.alert('error', `could not watch session: ${err}`));
      return;
    }
    if (item.sessionType === 'idle' && item.claudeSessionId) {
      bridgeApi.createSession(item.projectPath, false, item.claudeSessionId)
        .then((newSession) => {
          useSessionStore.getState().addSession({ ...newSession, sessionType: 'vibelink' as SessionType });
          router.push(`/session/${newSession.id}`);
        })
        .catch((err) => Alert.alert('error', `could not resume session: ${err}`));
    }
  }, []);

  const handleSwipeAction = useCallback((item: DisplaySession) => {
    if (item.sessionType === 'terminal' && item.claudeSessionId) {
      Alert.alert('end terminal session', 'This will kill the Claude process running in your terminal. Continue?', [
        { text: 'cancel', style: 'cancel' },
        { text: 'end', style: 'destructive', onPress: () => {
          bridgeApi.endTerminalSession(item.claudeSessionId!).then(() => loadSessions()).catch(() => {});
        }},
      ]);
      return;
    }
    if (item.sessionType === 'vibelink' && item.vibelinkSessionId) {
      bridgeApi.deleteSession(item.vibelinkSessionId).then(() => {
        useSessionStore.getState().removeSession(item.vibelinkSessionId!);
        loadSessions();
      }).catch(() => {});
      return;
    }
    if (item.sessionType === 'idle' && item.claudeSessionId) {
      Alert.alert('delete session', 'This permanently deletes the conversation. Continue?', [
        { text: 'cancel', style: 'cancel' },
        { text: 'delete', style: 'destructive', onPress: () => {
          const { bridgeUrl, authToken } = useConnectionStore.getState();
          fetch(`${bridgeUrl}/claude-sessions/${item.claudeSessionId}`, {
            method: 'DELETE',
            headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
          }).then(() => loadSessions()).catch(() => {});
        }},
      ]);
    }
  }, [loadSessions]);

  const handleDisconnect = useCallback(async () => {
    Alert.alert('disconnect', 'return to setup screen?', [
      { text: 'cancel', style: 'cancel' },
      { text: 'disconnect', style: 'destructive', onPress: async () => {
        await SecureStore.deleteItemAsync('vibelink_bridge_url');
        await SecureStore.deleteItemAsync('vibelink_auth_token');
        useConnectionStore.getState().setBridgeUrl('');
        useConnectionStore.getState().setAuthToken('');
        useConnectionStore.getState().setConnected(false);
        router.replace('/setup');
      }},
    ]);
  }, []);

  const listData: ListItem[] = [];
  const noActive = activeSessions.length === 0;
  const noIdle = idleSessions.length === 0;

  if (activeSessions.length > 0) {
    activeSessions.forEach((s) => listData.push(s));
  }
  if (noActive && noIdle) {
    listData.push({ key: 'empty-all', type: 'empty_message', text: 'No sessions yet. Start Claude in your terminal to see sessions here, or tap + to create one.' });
  } else if (noActive && !noIdle) {
    listData.push({ key: 'empty-active', type: 'empty_message', text: 'No active sessions. Tap one below to resume, or start new.' });
  }
  if (idleSessions.length > 0) {
    listData.push({ key: 'section-other', type: 'section_header', text: `Other sessions (${idleSessions.length})` });
    if (showIdle) {
      idleSessions.forEach((s) => listData.push(s));
    }
  }

  const renderItem = ({ item }: { item: ListItem }) => {
    if ('type' in item && item.type === 'empty_message') {
      return (
        <View className="items-center justify-center pt-16 px-8">
          <Text className="text-sm text-center" style={{ color: colors.text.subtle }}>{item.text}</Text>
        </View>
      );
    }
    if ('type' in item && item.type === 'section_header') {
      return (
        <Pressable onPress={() => setOtherExpanded((prev) => !prev)} className="px-4 pt-6 pb-2 flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Text className="text-xs uppercase tracking-wider" style={{ color: colors.text.subtle }}>{item.text}</Text>
            <Text style={{ color: colors.text.dim, fontSize: 12 }}>{showIdle ? '\u25B4' : '\u25BE'}</Text>
          </View>
          {showIdle && <Text className="text-xs" style={{ color: colors.text.dim }}>swipe to delete</Text>}
        </Pressable>
      );
    }
    const displayItem = item as DisplaySession;
    return (
      <SessionRow
        item={displayItem}
        onPress={() => handlePress(displayItem)}
        onSwipeAction={() => handleSwipeAction(displayItem)}
        swipeLabel={displayItem.sessionType === 'idle' ? 'delete' : 'end'}
        dimmed={displayItem.sessionType === 'idle'}
      />
    );
  };

  return (
    <>
      <Stack.Screen options={{
        title: '',
        headerTitle: () => (
          <Pressable onPress={() => setMenuOpen(true)} className="active:opacity-60">
            <Text className="text-lg font-semibold" style={{ color: colors.text.primary }}>vibelink</Text>
          </Pressable>
        ),
        headerRight: () => <ConnectionBadge />,
      }} />
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        {loading && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent.primary} />
            <Text className="mt-3 text-sm" style={{ color: colors.text.subtle }}>scanning sessions...</Text>
          </View>
        )}
        {error && !loading && (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-base mb-2 text-center" style={{ color: colors.status.error }}>{error}</Text>
            <Pressable onPress={loadSessions} className="rounded-lg px-4 py-2 mt-2 border" style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}>
              <Text style={{ color: colors.text.muted }}>retry</Text>
            </Pressable>
          </View>
        )}
        {!loading && !error && (
          <FlatList data={listData} keyExtractor={(item) => item.key} renderItem={renderItem} contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }} />
        )}
        <View className="absolute bottom-0 left-0 right-0 pb-8 pt-4 px-4 border-t" style={{ backgroundColor: colors.bg.primary, borderTopColor: colors.border.default }}>
          <Pressable onPress={() => router.push('/projects')} className="rounded-xl py-4 items-center active:opacity-80" style={{ backgroundColor: colors.accent.primary }}>
            <Text className="font-semibold text-base" style={{ color: colors.text.onAccent }}>new session</Text>
          </Pressable>
        </View>
      </View>
      <ThemePicker visible={menuOpen} onClose={() => setMenuOpen(false)} onDisconnect={handleDisconnect} />
    </>
  );
}
