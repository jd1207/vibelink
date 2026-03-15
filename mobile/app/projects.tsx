import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { router, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { useProjects } from '../src/hooks/useProjects';
import { useSessionStore } from '../src/store/sessions';
import { bridgeApi } from '../src/services/bridge-api';
import { useColors } from '../src/store/settings';

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
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      className="rounded-xl mx-4 mb-3 p-4 active:opacity-70 border"
      style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
    >
      <View className="flex-row items-center justify-between mb-1">
        <Text className="font-medium text-base flex-1" numberOfLines={1} style={{ color: colors.text.primary }}>
          {project.name}
        </Text>
        <View className="flex-row gap-1.5 ml-2">
          {project.isGit && (
            <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.bg.secondary }}>
              <Text className="text-xs" style={{ color: colors.text.muted }}>git</Text>
            </View>
          )}
          {project.hasClaude && (
            <View className="rounded px-1.5 py-0.5" style={{ backgroundColor: colors.bg.secondary }}>
              <Text className="text-xs" style={{ color: colors.accent.primary }}>claude</Text>
            </View>
          )}
        </View>
      </View>
      <Text className="text-xs" numberOfLines={1} style={{ color: colors.text.dim }}>
        {project.path}
      </Text>
    </Pressable>
  );
}

export default function ProjectsScreen() {
  const colors = useColors();
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [skipPermissions, setSkipPermissions] = useState(false);
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
      const session = await bridgeApi.createSession(project.path, skipPermissions);
      addSession(session);
      router.replace(`/session/${session.id}`);
    } catch (err) {
      console.error('create session failed:', err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <Stack.Screen options={{ title: 'new session' }} />
      <View className="flex-1" style={{ backgroundColor: colors.bg.primary }}>
        <View className="px-4 pt-4 pb-2">
          <View className="rounded-xl px-4 py-3 flex-row items-center border"
            style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}>
            <Text className="mr-2" style={{ color: colors.text.subtle }}>search</Text>
            <TextInput
              className="flex-1 text-base"
              placeholder="filter projects..."
              placeholderTextColor={colors.text.dim}
              value={query}
              onChangeText={setQuery}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ color: colors.text.primary }}
            />
          </View>
        </View>

        <Pressable
          onPress={() => setSkipPermissions(!skipPermissions)}
          className="mx-4 mb-3 flex-row items-center justify-between rounded-xl px-4 py-3 border"
          style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
        >
          <View className="flex-1 mr-3">
            <Text className="text-sm font-medium" style={{ color: colors.text.primary }}>skip permissions</Text>
            <Text className="text-xs mt-0.5" style={{ color: colors.text.dim }}>
              auto-approve all tool use (file edits, commands)
            </Text>
          </View>
          <Switch
            value={skipPermissions}
            onValueChange={setSkipPermissions}
            trackColor={{ false: colors.border.default, true: colors.accent.primary }}
            thumbColor={skipPermissions ? colors.text.primary : colors.text.dim}
          />
        </Pressable>

        {loading && (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator color={colors.accent.primary} />
            <Text className="mt-3 text-sm" style={{ color: colors.text.subtle }}>loading projects...</Text>
          </View>
        )}

        {error && !loading && (
          <View className="flex-1 items-center justify-center px-8">
            <Text className="text-base mb-2 text-center" style={{ color: colors.status.error }}>{error}</Text>
            <Pressable
              onPress={refresh}
              className="rounded-lg px-4 py-2 mt-2 border"
              style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
            >
              <Text style={{ color: colors.text.muted }}>retry</Text>
            </Pressable>
          </View>
        )}

        {!loading && !error && (
          <FlashList
            data={filtered}
            keyExtractor={(item) => item.path}
            contentContainerStyle={{ paddingTop: 8, paddingBottom: 32 }}
            renderItem={({ item }) => (
              <ProjectRow project={item} onPress={() => handleSelect(item)} />
            )}
            ListEmptyComponent={
              <View className="flex-1 items-center justify-center pt-24">
                <Text className="text-base" style={{ color: colors.text.dim }}>no projects found on this machine</Text>
              </View>
            }
          />
        )}

        {creating && (
          <View className="absolute inset-0 items-center justify-center bg-black/50">
            <ActivityIndicator color={colors.accent.primary} size="large" />
            <Text className="mt-3" style={{ color: colors.text.primary }}>creating session...</Text>
          </View>
        )}
      </View>
    </>
  );
}
