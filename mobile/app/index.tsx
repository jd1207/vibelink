import React, { useEffect, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
} from 'react-native';
import { router } from 'expo-router';
import { Stack } from 'expo-router';
import { useSessionStore, Session } from '../src/store/sessions';
import { bridgeApi } from '../src/services/bridge-api';
import { ConnectionBadge } from '../src/components/ConnectionBadge';

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

interface SessionRowProps {
  session: Session;
  onPress: () => void;
  onDelete: () => void;
}

function SessionRow({ session, onPress, onDelete }: SessionRowProps) {
  const handleLongPress = () => {
    Alert.alert('delete session', `remove session for ${session.projectName}?`, [
      { text: 'cancel', style: 'cancel' },
      { text: 'delete', style: 'destructive', onPress: onDelete },
    ]);
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={handleLongPress}
      className="bg-[#18181b] border border-[#27272a] rounded-xl mx-4 mb-3 p-4 active:opacity-70"
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-[#fafafa] font-medium text-base flex-1" numberOfLines={1}>
          {session.projectName}
        </Text>
        <Text className="text-[#a1a1aa] text-xs ml-2">
          {formatTime(session.createdAt)}
        </Text>
      </View>
      {session.lastMessage ? (
        <Text className="text-[#a1a1aa] text-sm" numberOfLines={2}>
          {session.lastMessage}
        </Text>
      ) : (
        <Text className="text-[#52525b] text-sm italic">no messages yet</Text>
      )}
      <View className="flex-row items-center mt-2 gap-1.5">
        <View className={`w-1.5 h-1.5 rounded-full ${session.alive ? 'bg-emerald-500' : 'bg-[#52525b]'}`} />
        <Text className="text-[#71717a] text-xs">{session.alive ? 'active' : 'ended'}</Text>
      </View>
    </Pressable>
  );
}

export default function SessionsScreen() {
  const { sessions, setSessions, removeSession } = useSessionStore();
  const sessionList = Array.from(sessions.values());

  const loadSessions = useCallback(async () => {
    try {
      const data = await bridgeApi.getSessions();
      setSessions(data);
    } catch {
      // bridge may not be connected yet — silent fail
    }
  }, [setSessions]);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleDelete = async (id: string) => {
    try {
      await bridgeApi.deleteSession(id);
      removeSession(id);
    } catch {
      removeSession(id);
    }
  };

  const handleNewChat = () => {
    router.push('/projects');
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: 'vibelink',
          headerRight: () => <ConnectionBadge />,
        }}
      />
      <View className="flex-1 bg-[#0a0a0a]">
        <FlatList
          data={sessionList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: 16, paddingBottom: 100 }}
          renderItem={({ item }) => (
            <SessionRow
              session={item}
              onPress={() => router.push(`/session/${item.id}`)}
              onDelete={() => handleDelete(item.id)}
            />
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center pt-32">
              <Text className="text-[#52525b] text-lg mb-2">no sessions yet</Text>
              <Text className="text-[#3f3f46] text-sm">tap new chat to start</Text>
            </View>
          }
        />
        <View className="absolute bottom-0 left-0 right-0 pb-8 pt-4 px-4 bg-[#0a0a0a] border-t border-[#27272a]">
          <Pressable
            onPress={handleNewChat}
            className="bg-[#3b82f6] rounded-xl py-4 items-center active:opacity-80"
          >
            <Text className="text-white font-semibold text-base">new chat</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
