import React from 'react';
import { View, Text } from 'react-native';
import { useConnectionStore } from '../store/connection';
import { useColors } from '../store/settings';

export function ConnectionBadge() {
  const colors = useColors();
  const isConnected = useConnectionStore((s) => s.isConnected);
  const dotColor = isConnected ? colors.status.success : colors.status.error;
  const textColor = isConnected ? colors.status.success : colors.status.error;

  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <Text className="text-xs" style={{ color: textColor }}>
        {isConnected ? 'connected' : 'disconnected'}
      </Text>
    </View>
  );
}
