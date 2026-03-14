import React from 'react';
import { View, Text } from 'react-native';

interface ProgressBarProps {
  value: number;
  max?: number;
  label?: string;
}

export function ProgressBar({ value, max = 100, label }: ProgressBarProps) {
  const percent = Math.min(Math.max((value / max) * 100, 0), 100);

  return (
    <View className="my-2">
      {label ? (
        <Text className="text-[#a1a1aa] text-xs mb-1.5">{label}</Text>
      ) : null}
      <View className="bg-[#27272a] rounded-full h-3 overflow-hidden">
        <View
          className="bg-[#3b82f6] h-full rounded-full"
          style={{ width: `${percent}%` }}
        />
      </View>
      <Text className="text-[#71717a] text-[10px] mt-1">
        {Math.round(percent)}%
      </Text>
    </View>
  );
}
