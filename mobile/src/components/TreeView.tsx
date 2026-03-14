import React, { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

interface TreeItem {
  name: string;
  type: 'file' | 'folder';
  children?: TreeItem[];
}

interface TreeViewProps {
  items: TreeItem[];
  onInteraction?: (action: string, value: unknown) => void;
}

export function TreeView({ items, onInteraction }: TreeViewProps) {
  return (
    <View className="my-2 bg-[#18181b] rounded-lg p-3">
      {items.map((item, i) => (
        <TreeNode
          key={`${item.name}-${i}`}
          item={item}
          depth={0}
          path={item.name}
          onInteraction={onInteraction}
        />
      ))}
    </View>
  );
}

interface TreeNodeProps {
  item: TreeItem;
  depth: number;
  path: string;
  onInteraction?: (action: string, value: unknown) => void;
}

function TreeNode({ item, depth, path, onInteraction }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const paddingLeft = depth * 16;

  const handlePress = useCallback(() => {
    if (item.type === 'folder') {
      setExpanded((v) => !v);
    } else {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onInteraction?.('file_select', { path });
    }
  }, [item.type, path, onInteraction]);

  const prefix =
    item.type === 'folder' ? (expanded ? '\u25BE ' : '\u25B8 ') : '  ';
  const nameColor = item.type === 'folder' ? 'text-[#60a5fa]' : 'text-[#a1a1aa]';

  return (
    <View>
      <Pressable
        onPress={handlePress}
        style={{ paddingLeft }}
        className="py-1.5 active:opacity-70"
      >
        <Text className={`font-mono text-xs ${nameColor}`}>
          {prefix}
          {item.name}
        </Text>
      </Pressable>
      {expanded && item.children
        ? item.children.map((child, i) => (
            <TreeNode
              key={`${child.name}-${i}`}
              item={child}
              depth={depth + 1}
              path={`${path}/${child.name}`}
              onInteraction={onInteraction}
            />
          ))
        : null}
    </View>
  );
}
