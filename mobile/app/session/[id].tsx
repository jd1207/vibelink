import React from 'react';
import { View, Text } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';

// placeholder — full implementation in chunk 5
export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <>
      <Stack.Screen options={{ title: `chat` }} />
      <View className="flex-1 bg-[#0a0a0a] items-center justify-center">
        <Text className="text-[#fafafa] text-lg">chat: {id}</Text>
        <Text className="text-[#52525b] text-sm mt-2">full ui in chunk 5</Text>
      </View>
    </>
  );
}
