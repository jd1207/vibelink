import React, { useState, useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../store/settings';

export interface TreeItem { name: string; type: 'file' | 'folder'; children?: TreeItem[]; }

interface TreeViewProps { items: TreeItem[]; onInteraction?: (action: string, value: unknown) => void; }

export function TreeView({ items, onInteraction }: TreeViewProps) {
  const colors = useColors();
  return (
    <View className="my-2 rounded-lg p-3" style={{ backgroundColor: colors.bg.surface }}>
      {items.map((item, i) => (
        <TreeNode key={`${item.name}-${i}`} item={item} depth={0} path={item.name} onInteraction={onInteraction} />
      ))}
    </View>
  );
}

function TreeNode({ item, depth, path, onInteraction }: { item: TreeItem; depth: number; path: string; onInteraction?: (a: string, v: unknown) => void }) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(false);

  const handlePress = useCallback(() => {
    if (item.type === 'folder') setExpanded((v) => !v);
    else { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); onInteraction?.('file_select', { path }); }
  }, [item.type, path, onInteraction]);

  const prefix = item.type === 'folder' ? (expanded ? '\u25BE ' : '\u25B8 ') : '  ';

  return (
    <View>
      <Pressable onPress={handlePress} style={{ paddingLeft: depth * 16 }} className="py-1.5 active:opacity-70">
        <Text className="font-mono text-xs" style={{ color: item.type === 'folder' ? colors.accent.light : colors.text.muted }}>
          {prefix}{item.name}
        </Text>
      </Pressable>
      {expanded && item.children?.map((child, i) => (
        <TreeNode key={`${child.name}-${i}`} item={child} depth={depth + 1} path={`${path}/${child.name}`} onInteraction={onInteraction} />
      ))}
    </View>
  );
}
