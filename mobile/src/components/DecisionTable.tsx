import React, { useCallback, useState } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../store/settings';

interface DecisionTableProps {
  columns: string[]; rows: string[][]; selectable?: boolean; title?: string;
  onInteraction?: (action: string, value: unknown) => void;
}

export function DecisionTable({ columns, rows, selectable, title, onInteraction }: DecisionTableProps) {
  const colors = useColors();
  const [selectedRow, setSelectedRow] = useState<number | null>(null);

  const handleRowPress = useCallback((index: number) => {
    if (!selectable) return;
    setSelectedRow(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onInteraction?.('row_select', { rowIndex: index, row: rows[index] });
  }, [selectable, rows, onInteraction]);

  return (
    <View className="my-2">
      {title ? <Text className="font-medium text-sm mb-2 px-1" style={{ color: colors.text.primary }}>{title}</Text> : null}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View>
          <View className="flex-row rounded-t-lg" style={{ backgroundColor: colors.bg.elevated }}>
            {columns.map((col, i) => (
              <View key={i} className="px-4 py-2.5 min-w-[100]">
                <Text className="font-bold text-xs" style={{ color: colors.accent.light }}>{col}</Text>
              </View>
            ))}
          </View>
          {rows.map((row, rowIdx) => {
            const isSelected = selectedRow === rowIdx;
            const rowBg = isSelected ? colors.interactive.selected : rowIdx % 2 === 0 ? colors.bg.surface : colors.bg.primary;
            return (
              <Pressable key={rowIdx} onPress={() => handleRowPress(rowIdx)} disabled={!selectable}>
                <View className="flex-row" style={{ backgroundColor: rowBg }}>
                  {row.map((cell, cellIdx) => (
                    <View key={cellIdx} className="px-4 py-2 min-w-[100]">
                      <Text className="text-xs" style={{ color: colors.text.muted }}>{cell}</Text>
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
