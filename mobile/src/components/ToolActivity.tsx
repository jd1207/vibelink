import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { ContentBlock } from '../store/messages';

interface ToolActivityProps {
  block: ContentBlock;
}

const ToolActivity = React.memo(function ToolActivity({ block }: ToolActivityProps) {
  const [expanded, setExpanded] = useState(false);
  const isComplete = block.isComplete ?? false;
  const toolName = block.name ?? 'tool';

  const toggle = useCallback(() => setExpanded((v) => !v), []);

  // derive a friendly label from tool name + input
  const label = deriveLabel(block);

  return (
    <View className="px-4 py-1">
      <Pressable onPress={toggle} className="flex-row items-center gap-2">
        <View
          className={`flex-row items-center gap-1.5 rounded-full px-3 py-1.5 ${
            isComplete ? 'bg-emerald-900/30' : 'bg-[#27272a]'
          }`}
        >
          {isComplete ? (
            <Text style={{ color: '#34d399', fontSize: 14 }}>✓</Text>
          ) : (
            <ActivityIndicator size="small" color="#a1a1aa" />
          )}
          <Text className="text-[#a1a1aa] text-xs font-medium">{label}</Text>
        </View>
        <Text className="text-[#52525b] text-xs">{expanded ? 'hide' : 'show'}</Text>
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

function deriveLabel(block: ContentBlock): string {
  const name = block.name ?? 'tool';
  const input = block.input as Record<string, unknown> | undefined;

  // try to extract a file path or command from common tool patterns
  if (input) {
    const file = input.file_path ?? input.path ?? input.filename;
    if (typeof file === 'string') {
      const short = file.split('/').pop() ?? file;
      return block.isComplete ? `${name}: ${short}` : `${name}: ${short}...`;
    }
    const cmd = input.command;
    if (typeof cmd === 'string') {
      const short = cmd.length > 30 ? cmd.slice(0, 30) + '...' : cmd;
      return block.isComplete ? `${name}: ${short}` : `${name}...`;
    }
  }

  return block.isComplete ? name : `${name}...`;
}
