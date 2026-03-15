import React, { useState, useEffect, useRef } from 'react';
import { View, Text, Pressable } from 'react-native';
import type { SessionMetadata } from '../store/message-types';
import { useColors } from '../store/settings';

interface MetadataPanelProps { metadata: SessionMetadata; }

export function MetadataPanel({ metadata }: MetadataPanelProps) {
  const colors = useColors();
  const [collapsed, setCollapsed] = useState(false);
  const inputTokens = metadata.inputTokens ?? 0;
  const outputTokens = metadata.outputTokens ?? 0;
  const totalTokens = inputTokens + outputTokens;
  const contextMax = getContextMax(metadata.model);
  const contextPercent = totalTokens > 0 ? Math.min((totalTokens / contextMax) * 100, 100) : 0;
  const barColor = contextPercent > 80 ? colors.status.error : contextPercent > 50 ? colors.status.warningDark : colors.accent.primary;
  const elapsed = useSessionDuration(metadata.sessionStartedAt);

  if (collapsed) {
    return (
      <Pressable onPress={() => setCollapsed(false)} className="px-4 py-2 border-b" style={{ borderBottomColor: colors.border.default }}>
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            {metadata.model ? <Text className="text-[10px] font-semibold" style={{ color: colors.accent.light }}>{metadata.model}</Text> : null}
            {totalTokens > 0 ? <Text className="text-[10px]" style={{ color: colors.text.dim }}>{formatTokens(totalTokens)}</Text> : null}
            {metadata.costUsd != null ? <Text className="text-[10px]" style={{ color: colors.text.dim }}>${metadata.costUsd.toFixed(3)}</Text> : null}
            {elapsed ? <Text className="text-[10px]" style={{ color: colors.text.dim }}>{elapsed}</Text> : null}
          </View>
          <Text className="text-[10px]" style={{ color: colors.accent.primary }}>expand</Text>
        </View>
        {totalTokens > 0 ? (
          <View className="h-1 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: colors.border.default }}>
            <View style={{ width: `${contextPercent}%`, backgroundColor: barColor }} className="h-full rounded-full" />
          </View>
        ) : null}
      </Pressable>
    );
  }

  return (
    <View className="px-4 pt-3 pb-2 border-b" style={{ borderBottomColor: colors.border.default }}>
      <View className="flex-row items-center gap-2 mb-2">
        {metadata.model ? (
          <View className="rounded-md px-2 py-1" style={{ backgroundColor: colors.bg.badge }}>
            <Text className="text-xs font-semibold" style={{ color: colors.accent.light }}>{metadata.model}</Text>
          </View>
        ) : null}
        {metadata.cwd ? <Text className="text-xs flex-1" numberOfLines={1} style={{ color: colors.text.dim }}>{metadata.cwd.split('/').slice(-2).join('/')}</Text> : null}
        <Pressable onPress={() => setCollapsed(true)} className="active:opacity-60">
          <Text className="text-[10px]" style={{ color: colors.accent.primary }}>collapse</Text>
        </Pressable>
      </View>
      {totalTokens > 0 ? (
        <View className="mb-2">
          <View className="flex-row justify-between mb-1">
            <Text className="text-[10px]" style={{ color: colors.text.subtle }}>context window</Text>
            <Text className="text-[10px]" style={{ color: colors.text.subtle }}>{formatTokens(totalTokens)} / {formatTokens(contextMax)}</Text>
          </View>
          <View className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: colors.border.default }}>
            <View style={{ width: `${contextPercent}%`, backgroundColor: barColor }} className="h-full rounded-full" />
          </View>
          <View className="flex-row gap-3 mt-1">
            <Text className="text-[10px]" style={{ color: colors.text.dim }}>in: {formatTokens(inputTokens)}</Text>
            <Text className="text-[10px]" style={{ color: colors.text.dim }}>out: {formatTokens(outputTokens)}</Text>
          </View>
        </View>
      ) : null}
      <View className="flex-row gap-4">
        {metadata.numTurns != null ? <Stat label="turns" value={String(metadata.numTurns)} /> : null}
        {metadata.costUsd != null ? <Stat label="cost" value={`$${metadata.costUsd.toFixed(3)}`} /> : null}
        {elapsed ? <Stat label="duration" value={elapsed} /> : null}
        {metadata.cacheReadTokens != null && metadata.cacheReadTokens > 0 ? <Stat label="cache read" value={formatTokens(metadata.cacheReadTokens)} /> : null}
      </View>
      {metadata.mcpServers && metadata.mcpServers.length > 0 ? (
        <View className="mt-2">
          <Text className="text-[10px] mb-1" style={{ color: colors.text.subtle }}>mcp servers</Text>
          <View className="flex-row flex-wrap gap-1">
            {metadata.mcpServers.map((name) => (
              <View key={name} className="rounded px-2 py-0.5" style={{ backgroundColor: colors.bg.surface }}><Text className="text-[10px]" style={{ color: colors.text.muted }}>{name}</Text></View>
            ))}
          </View>
        </View>
      ) : null}
      <ToolsSection tools={metadata.tools} />
    </View>
  );
}

function categorizeTools(tools: string[]) {
  const builtIn: string[] = [];
  const mcpGroups: Record<string, string[]> = {};
  for (const name of tools) {
    if (name.startsWith('mcp__')) {
      const parts = name.split('__');
      const server = parts[1] ?? 'unknown';
      if (!mcpGroups[server]) mcpGroups[server] = [];
      mcpGroups[server].push(parts.slice(2).join('_'));
    } else { builtIn.push(name); }
  }
  return { builtIn, mcpGroups };
}

function ToolsSection({ tools }: { tools?: string[] }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);
  if (!tools || tools.length === 0) return null;
  const { builtIn, mcpGroups } = categorizeTools(tools);

  return (
    <View className="mt-2">
      <Pressable onPress={() => setExpanded(!expanded)} className="flex-row items-center gap-1">
        <Text className="text-[10px]" style={{ color: colors.text.subtle }}>tools ({tools.length})</Text>
        <Text className="text-[10px]" style={{ color: colors.text.dim }}>{expanded ? 'hide' : 'show'}</Text>
      </Pressable>
      {expanded ? (
        <View className="mt-1">
          {builtIn.length > 0 ? (
            <View className="mb-1.5">
              <Text className="text-[10px] mb-0.5" style={{ color: colors.text.dim }}>built-in</Text>
              <View className="flex-row flex-wrap gap-1">
                {builtIn.map((n) => <View key={n} className="rounded px-2 py-0.5" style={{ backgroundColor: colors.bg.surface }}><Text className="text-[10px]" style={{ color: colors.text.subtle }}>{n}</Text></View>)}
              </View>
            </View>
          ) : null}
          {Object.entries(mcpGroups).map(([server, names]) => (
            <View key={server} className="mb-1.5">
              <Text className="text-[10px] mb-0.5" style={{ color: colors.text.dim }}>{server}</Text>
              <View className="flex-row flex-wrap gap-1">
                {names.map((n) => <View key={n} className="rounded px-2 py-0.5" style={{ backgroundColor: colors.bg.surface }}><Text className="text-[10px]" style={{ color: colors.text.muted }}>{n}</Text></View>)}
              </View>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <View>
      <Text className="text-xs font-semibold" style={{ color: colors.text.primary }}>{value}</Text>
      <Text className="text-[10px]" style={{ color: colors.text.dim }}>{label}</Text>
    </View>
  );
}

function useSessionDuration(startedAt?: number): string {
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!startedAt) return;
    intervalRef.current = setInterval(() => setNow(Date.now()), 30000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startedAt]);
  if (!startedAt) return '';
  const totalSeconds = Math.floor((now - startedAt) / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
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
