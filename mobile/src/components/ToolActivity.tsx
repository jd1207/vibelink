import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ContentBlock } from '../store/messages';
import { formatToolName, formatToolParam } from './tool-format';
import { colors } from '../constants/colors';

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
            isComplete ? 'bg-emerald-900/30' : ''
          }`}
          style={isComplete ? undefined : { backgroundColor: colors.border.subtle }}
        >
          {isComplete ? (
            <Text style={{ color: colors.status.success, fontSize: 14 }}>✓</Text>
          ) : (
            <ActivityIndicator size="small" color={colors.text.muted} />
          )}
          <Text className="text-xs font-medium" style={{ color: colors.text.muted }}>{friendlyName}</Text>
          {paramLine ? (
            <Text className="text-xs" numberOfLines={1} style={{ color: colors.text.dim }}>{paramLine}</Text>
          ) : null}
        </View>
      </Pressable>

      {expanded ? (
        <View className="rounded-lg p-3 mt-1.5 ml-2" style={{ backgroundColor: colors.bg.surface }}>
          {block.input != null ? (
            <View className="mb-2">
              <Text className="text-[10px] mb-1" style={{ color: colors.text.subtle }}>input</Text>
              <Text className="font-mono text-xs" selectable style={{ color: colors.text.muted }}>
                {typeof block.input === 'string'
                  ? block.input
                  : JSON.stringify(block.input, null, 2)}
              </Text>
            </View>
          ) : null}
          {block.content ? (
            <View>
              <Text className="text-[10px] mb-1" style={{ color: colors.text.subtle }}>output</Text>
              <Text className="font-mono text-xs" selectable numberOfLines={20} style={{ color: colors.text.muted }}>
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
