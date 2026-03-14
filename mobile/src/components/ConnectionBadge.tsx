import React from 'react';
import { View, Text } from 'react-native';
import { useConnectionStore } from '../store/connection';

export function ConnectionBadge() {
  const isConnected = useConnectionStore((s) => s.isConnected);

  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-500' : 'bg-red-500'}`}
      />
      <Text className={`text-xs ${isConnected ? 'text-emerald-400' : 'text-red-400'}`}>
        {isConnected ? 'connected' : 'disconnected'}
      </Text>
    </View>
  );
}
