import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { SessionMetadata } from '../store/message-types';

interface MetadataPanelProps {
  metadata: SessionMetadata;
}

export function MetadataPanel({ metadata }: MetadataPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const inputTokens = metadata.inputTokens ?? 0;
  const outputTokens = metadata.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const contextMax = getContextMax(metadata.model);
  const contextPercent = totalTokens > 0 ? Math.min((totalTokens / contextMax) * 100, 100) : 0;
  const barColor = contextPercent > 80 ? '#ef4444' : contextPercent > 50 ? '#f59e0b' : '#3b82f6';

  const elapsed = useSessionDuration(metadata.sessionStartedAt);

  if (collapsed) {
    return (
      <Pressable
        onPress={() => setCollapsed(false)}
        className="px-4 py-2 border-b border-[#27272a]"
      >
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {metadata.model ? (
              <Text className="text-[#60a5fa] text-[10px] font-semibold">{metadata.model}</Text>
            ) : null}
            {totalTokens > 0 ? (
              <Text className="text-[#52525b] text-[10px]">{formatTokens(totalTokens)}</Text>
            ) : null}
            {metadata.costUsd != null ? (
              <Text className="text-[#52525b] text-[10px]">${metadata.costUsd.toFixed(3)}</Text>
            ) : null}
            {elapsed ? (
              <Text className="text-[#52525b] text-[10px]">{elapsed}</Text>
            ) : null}
          </View>
          <Text className="text-[#3b82f6] text-[10px]">expand</Text>
        </View>
        {totalTokens > 0 ? (
          <View className="h-1 bg-[#27272a] rounded-full overflow-hidden mt-1.5">
            <View
              style={{ width: `${contextPercent}%`, backgroundColor: barColor }}
              className="h-full rounded-full"
            />
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View className="px-4 pt-3 pb-2 border-b border-[#27272a]">
      <View className="flex-row items-center gap-2 mb-2">
        {metadata.model ? (
          <View className="bg-[#1e293b] rounded-md px-2 py-1">
            <Text className="text-[#60a5fa] text-xs font-semibold">{metadata.model}</Text>
          </View>
        ) : null}
        {metadata.cwd ? (
          <Text className="text-[#52525b] text-xs flex-1" numberOfLines={1}>
            {metadata.cwd.split('/').slice(-2).join('/')}
          </Text>
        ) : null}
        <Pressable onPress={() => setCollapsed(true)} className="active:opacity-60">
          <Text className="text-[#3b82f6] text-[10px]">collapse</Text>
        </Pressable>
      </View>

      {totalTokens > 0 ? (
        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-[#71717a] text-[10px]">context window</Text>
            <Text className="text-[#71717a] text-[10px]">
              {formatTokens(totalTokens)} / {formatTokens(contextMax)}
            </Text>
          </View>
          <View className="h-1.5 bg-[#27272a] rounded-full overflow-hidden">
            <View
              style={{ width: `${contextPercent}%`, backgroundColor: barColor }}
              className="h-full rounded-full"
            />
          </View>
          <View className="flex-row gap-3 mt-1">
            <Text className="text-[#52525b] text-[10px]">
              in: {formatTokens(inputTokens)}
            </Text>
            <Text className="text-[#52525b] text-[10px]">
              out: {formatTokens(outputTokens)}
            </Text>
          </View>
        </View>
      ) : null}

      <View className="flex-row gap-4">
        {metadata.numTurns != null ? (
          <Stat label="turns" value={String(metadata.numTurns)} />
        ) : null}
        {metadata.costUsd != null ? (
          <Stat label="cost" value={`$${metadata.costUsd.toFixed(3)}`} />
        ) : null}
        {elapsed ? (
          <Stat label="duration" value={elapsed} />
        ) : null}
        {metadata.cacheReadTokens != null && metadata.cacheReadTokens > 0 ? (
          <Stat label="cache read" value={formatTokens(metadata.cacheReadTokens)} />
        ) : null}
      </View>

      {metadata.mcpServers && metadata.mcpServers.length > 0 ? (
        <View className="mt-2">
          <Text className="text-[#71717a] text-[10px] mb-1">mcp servers</Text>
          <View className="flex-row flex-wrap gap-1">
            {metadata.mcpServers.map((name) => (
              <View key={name} className="bg-[#18181b] rounded px-2 py-0.5">
                <Text className="text-[#a1a1aa] text-[10px]">{name}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      <ToolsSection tools={metadata.tools} />
    </View>
  );
}

function categorizeTools(tools: string[]): { builtIn: string[]; mcpGroups: Record<string, string[]> } {
  const builtIn: string[] = [];
  const mcpGroups: Record<string, string[]> = {};

  for (const name of tools) {
    if (name.startsWith('mcp__')) {
      const parts = name.split('__');
      const server = parts[1] ?? 'unknown';
      const toolName = parts.slice(2).join('_');
      if (!mcpGroups[server]) mcpGroups[server] = [];
      mcpGroups[server].push(toolName);
    } else {
      builtIn.push(name);
    }
  }

  return { builtIn, mcpGroups };
}

function ToolsSection({ tools }: { tools?: string[] }) {
  const [expanded, setExpanded] = useState(false);

  if (!tools || tools.length === 0) return null;

  const { builtIn, mcpGroups } = categorizeTools(tools);
  const mcpServerNames = Object.keys(mcpGroups);

  return (
    <View className="mt-2">
      <Pressable onPress={() => setExpanded(!expanded)} className="flex-row items-center gap-1">
        <Text className="text-[#71717a] text-[10px]">
          tools ({tools.length})
        </Text>
        <Text className="text-[#52525b] text-[10px]">{expanded ? 'hide' : 'show'}</Text>
      </Pressable>

      {expanded ? (
        <View className="mt-1">
          {builtIn.length > 0 ? (
            <View className="mb-1.5">
              <Text className="text-[#52525b] text-[10px] mb-0.5">built-in</Text>
              <View className="flex-row flex-wrap gap-1">
                {builtIn.map((name) => (
                  <View key={name} className="bg-[#18181b] rounded px-2 py-0.5">
                    <Text className="text-[#71717a] text-[10px]">{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {mcpServerNames.map((server) => (
            <View key={server} className="mb-1.5">
              <Text className="text-[#52525b] text-[10px] mb-0.5">{server}</Text>
              <View className="flex-row flex-wrap gap-1">
                {mcpGroups[server].map((name) => (
                  <View key={name} className="bg-[#18181b] rounded px-2 py-0.5">
                    <Text className="text-[#a1a1aa] text-[10px]">{name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-[#fafafa] text-xs font-semibold">{value}</Text>
      <Text className="text-[#52525b] text-[10px]">{label}</Text>
    </View>
  );
}

function useSessionDuration(startedAt?: number): string {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!startedAt) return;
    intervalRef.current = setInterval(() => setNow(Date.now()), 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [startedAt]);

  if (!startedAt) return '';
  return formatDuration(now - startedAt);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function getContextMax(model?: string): number {
  if (!model) return 200000;
  if (model.includes('opus') && model.includes('1m')) return 1000000;
  return 200000;
}

function formatTokens(n: number): string {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
  return String(n);
}
