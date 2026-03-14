import React, { useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  FlatList,
  Alert,
  Animated,
  PanResponder,
  Dimensions,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { useSessionStore, Session } from '../src/store/sessions';
import { bridgeApi } from '../src/services/bridge-api';
import { ConnectionBadge } from '../src/components/ConnectionBadge';

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

interface SessionRowProps {
  session: Session;
  onPress: () => void;
  onDelete: () => void;
}

function SessionRow({ session, onPress, onDelete }: SessionRowProps) {
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
          // show delete confirmation
          Alert.alert(
            'end session',
            `stop claude and remove "${session.projectName}"?`,
            [
              {
                text: 'cancel',
                style: 'cancel',
                onPress: () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start(),
              },
              {
                text: 'end session',
                style: 'destructive',
                onPress: onDelete,
              },
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
      {/* delete background */}
      <View className="absolute inset-0 bg-red-600 rounded-xl flex-row items-center justify-end px-5">
        <Text className="text-white font-semibold text-sm">end session</Text>
      </View>

      {/* swipeable row */}
      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable
          onPress={onPress}
          className="bg-[#18181b] border border-[#27272a] rounded-xl p-4 active:opacity-70"
        >
          <View className="flex-row items-center justify-between mb-1">
            <Text className="text-[#fafafa] font-medium text-base flex-1" numberOfLines={1}>
              {session.projectName}
            </Text>
            <Text className="text-[#a1a1aa] text-xs ml-2">
              {formatTime(session.createdAt)}
            </Text>
          </View>

          <Text className="text-[#52525b] text-xs mb-2" numberOfLines={1}>
            {session.projectPath}
          </Text>

          {session.lastMessage ? (
            <Text className="text-[#a1a1aa] text-sm mb-2" numberOfLines={2}>
              {session.lastMessage}
            </Text>
          ) : null}

          {/* process status */}
          <View className="flex-row items-center gap-2">
            <View className={`w-2 h-2 rounded-full ${session.alive ? 'bg-emerald-500' : 'bg-[#52525b]'}`} />
            <Text className="text-[#71717a] text-xs">
              {session.alive ? 'claude running' : 'session ended'}
            </Text>
          </View>
        </Pressable>
      </Animated.View>
    </View>
  );
}

export default function SessionsScreen() {
  const sessions = useSessionStore((s) => s.sessions);
  const sessionList = Object.values(sessions);

  const loadSessions = useCallback(() => {
    bridgeApi.getSessions()
      .then((data) => useSessionStore.getState().setSessions(data))
      .catch(() => {});
  }, []);

  // load on mount and refresh every 5s
  useEffect(() => {
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, [loadSessions]);

  const handleDelete = async (id: string) => {
    try {
      await bridgeApi.deleteSession(id);
    } catch { /* ignore */ }
    useSessionStore.getState().removeSession(id);
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
        {/* session count header */}
        {sessionList.length > 0 && (
          <View className="px-4 pt-4 pb-2 flex-row items-center justify-between">
            <Text className="text-[#71717a] text-xs">
              {sessionList.filter(s => s.alive).length} active process{sessionList.filter(s => s.alive).length !== 1 ? 'es' : ''}
            </Text>
            <Text className="text-[#52525b] text-xs">swipe left to end</Text>
          </View>
        )}

        <FlatList
          data={sessionList}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingTop: sessionList.length > 0 ? 0 : 16, paddingBottom: 100 }}
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
            onPress={() => router.push('/projects')}
            className="bg-[#3b82f6] rounded-xl py-4 items-center active:opacity-80"
          >
            <Text className="text-white font-semibold text-base">new chat</Text>
          </Pressable>
        </View>
      </View>
    </>
  );
}
