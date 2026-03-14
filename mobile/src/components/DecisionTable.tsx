import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

interface DecisionTableProps {
  columns: string[];
  rows: string[][];
  selectable?: boolean;
  title?: string;
  onInteraction?: (action: string, value: unknown) => void;
}

export function DecisionTable({
  columns,
  rows,
  selectable,
  title,
  onInteraction,
}: DecisionTableProps) {
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const handleRowPress = useCallback(
    (index: number) => {
      if (!selectable) return;
      setSelectedRow(index);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onInteraction?.('row_select', { rowIndex: index, row: rows[index] });
    },
    [selectable, rows, onInteraction],
  );

  return (
    <View className="my-2">
      {title ? (
        <Text className="text-[#fafafa] font-medium text-sm mb-2 px-1">{title}</Text>
      ) : null}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View className="flex-row bg-[#1e293b] rounded-t-lg">
            {columns.map((col, i) => (
              <View key={i} className="px-4 py-2.5 min-w-[100]">
                <Text className="text-[#60a5fa] font-bold text-xs">{col}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, rowIdx) => {
            const isSelected = selectedRow === rowIdx;
            const bgClass =
              isSelected
                ? 'bg-[#1e3a5f]'
                : rowIdx % 2 === 0
                  ? 'bg-[#18181b]'
                  : 'bg-[#0a0a0a]';
            return (
              <Pressable
                key={rowIdx}
                onPress={() => handleRowPress(rowIdx)}
                disabled={!selectable}
              >
                <View className={`flex-row ${bgClass}`}>
                  {row.map((cell, cellIdx) => (
                    <View key={cellIdx} className="px-4 py-2 min-w-[100]">
                      <Text className="text-[#a1a1aa] text-xs">{cell}</Text>
                    </View>
                  ))}
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
}
