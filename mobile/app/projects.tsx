import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useProjects } from '../src/hooks/useProjects';
import { useSessionStore } from '../src/store/sessions';
import { bridgeApi } from '../src/services/bridge-api';

interface Project {
  name: string;
  path: string;
  hasClaude: boolean;
  isGit: boolean;
}

interface ProjectRowProps {
  project: Project;
  onPress: () => void;
}

function ProjectRow({ project, onPress }: ProjectRowProps) {
  return (
    <Pressable
      onPress={onPress}
      className="bg-[#18181b] border border-[#27272a] rounded-xl mx-4 mb-3 p-4 active:opacity-70"
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="text-[#fafafa] font-medium text-base flex-1" numberOfLines={1}>
          {project.name}
        </Text>
        <View className="flex-row gap-1.5 ml-2">
          {project.isGit && (
            <View className="bg-[#27272a] rounded px-1.5 py-0.5">
              <Text className="text-[#a1a1aa] text-xs">git</Text>
            </View>
          )}
          {project.hasClaude && (
            <View className="bg-[#1d3557] rounded px-1.5 py-0.5">
              <Text className="text-[#60a5fa] text-xs">claude</Text>
            </View>
          )}
        </View>
      </View>
      <Text className="text-[#52525b] text-xs" numberOfLines={1}>
        {project.path}
      </Text>
    </Pressable>
  );
}

export default function ProjectsScreen() {
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const { projects, loading, error, refresh } = useProjects();
  const { addSession } = useSessionStore();

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filtered = query.trim()
    ? projects.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          p.path.toLowerCase().includes(query.toLowerCase())
      )
    : projects;

  const handleSelect = async (project: Project) => {
    if (creating) return;
    setCreating(true);
    try {
      const session = await bridgeApi.createSession(project.path);
      addSession(session);
      router.replace(`/session/${session.id}`);
    } catch (err) {
      // navigate anyway with error state handled by session screen
      console.error('create session failed:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'pick a project' }} />
      <View className="flex-1 bg-[#0a0a0a]">
        <View className="px-4 pt-4 pb-2">
          <View className="bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 flex-row items-center">
            <Text className="text-[#71717a] mr-2">search</Text>
            <TextInput
              className="flex-1 text-[#fafafa] text-base"
              placeholder="filter projects..."
              placeholderTextColor="#52525b"
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        </View>

        {loading && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color="#3b82f6" />
            <Text className="text-[#71717a] mt-3 text-sm">loading projects...</Text>
          </View>
        )}

        {error && !loading && (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-[#ef4444] text-base mb-2 text-center">{error}</Text>
            <Pressable
              onPress={refresh}
              className="bg-[#18181b] border border-[#27272a] rounded-lg px-4 py-2 mt-2"
            >
              <Text className="text-[#a1a1aa]">retry</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.path}
            estimatedItemSize={80}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <ProjectRow project={item} onPress={() => handleSelect(item)} />
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center pt-24">
                <Text className="text-[#52525b] text-base">no projects found</Text>
              </View>
            }
          />
        )}

        {creating && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator color="#3b82f6" size="large" />
            <Text className="text-[#fafafa] mt-3">creating session...</Text>
          </View>
        )}
      </View>
    </>
  );
}
