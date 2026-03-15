import React from 'react';
import { View, Text } from 'react-native';
import { colors } from '../constants/colors';

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
        <Text className="text-xs mb-1.5" style={{ color: colors.text.muted }}>{label}</Text>
      ) : null}
      <View className="rounded-full h-3 overflow-hidden" style={{ backgroundColor: colors.border.default }}>
        <View
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: colors.accent.primary }}
        />
      </View>
      <Text className="text-[10px] mt-1" style={{ color: colors.text.subtle }}>
        {Math.round(percent)}%
      </Text>
    </View>
  );
}
