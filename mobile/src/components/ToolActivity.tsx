import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ContentBlock } from '../store/messages';
import { formatToolName, formatToolParam } from './tool-format';

interface ToolActivityProps {
  block: ContentBlock;
}

const ToolActivity = React.memo(function ToolActivity({ block }: ToolActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = block.isComplete ?? false;

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  const name = block.name ?? 'tool';
  const input = (block.input as Record<string, unknown>) ?? {};
  const friendlyName = formatToolName(name);
  const paramLine = formatToolParam(name, input);

  return (
    <View className="px-4 py-1">
      <Pressable onPress={toggle} className="flex-row items-center gap-2">
        <View
          className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
            isComplete ? 'bg-emerald-900/30' : 'bg-[#27272a]'
          }`}
          style={{ maxWidth: '85%' }}
        >
          {isComplete ? (
            <Text style={{ color: '#34d399', fontSize: 14 }}>✓</Text>
          ) : (
            <ActivityIndicator size="small" color="#a1a1aa" />
          )}
          <Text className="text-[#a1a1aa] text-xs font-medium">{friendlyName}</Text>
          {paramLine ? (
            <Text className="text-[#52525b] text-xs" numberOfLines={1}>{paramLine}</Text>
          ) : null}
        </View>
      </Pressable>

      {expanded ? (
        <View className="bg-[#18181b] rounded-lg p-3 mt-1.5 ml-2">
          {block.input != null ? (
            <View className="mb-2">
              <Text className="text-[#71717a] text-[10px] mb-1">input</Text>
              <Text className="font-mono text-xs text-[#a1a1aa]" selectable>
                {typeof block.input === 'string'
                  ? block.input
                  : JSON.stringify(block.input, null, 2)}
              </Text>
            </View>
          ) : null}
          {block.content ? (
            <View>
              <Text className="text-[#71717a] text-[10px] mb-1">output</Text>
              <Text className="font-mono text-xs text-[#a1a1aa]" selectable numberOfLines={20}>
                {block.content}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
});

export default ToolActivity;
