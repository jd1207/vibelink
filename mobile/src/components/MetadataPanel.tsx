import React, { useState } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { SessionMetadata } from '../store/message-types';

interface MetadataPanelProps {
  metadata: SessionMetadata;
}

export function MetadataPanel({ metadata }: MetadataPanelProps) {
  const [collapsed, setCollapsed] = useState(false);
  const totalTokens = (metadata.inputTokens ?? 0) + (metadata.outputTokens ?? 0);
  const contextMax = getContextMax(metadata.model);
  const contextPercent = totalTokens > 0 ? Math.min((totalTokens / contextMax) * 100, 100) : 0;
  const barColor = contextPercent > 80 ? '#ef4444' : contextPercent > 50 ? '#f59e0b' : '#3b82f6';

  if (collapsed) {
    return (
      <Pressable
        onPress={() => setCollapsed(false)}
        className="flex-row items-center justify-between px-4 py-2 border-b border-[#27272a]"
      >
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
        </View>
        <Text className="text-[#3b82f6] text-[10px]">expand</Text>
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
        </View>
      ) : null}

      <View className="flex-row gap-4">
        {metadata.numTurns != null ? (
          <Stat label="turns" value={String(metadata.numTurns)} />
        ) : null}
        {metadata.costUsd != null ? (
          <Stat label="cost" value={`$${metadata.costUsd.toFixed(3)}`} />
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
