import React from 'react';
import { View, Text, Pressable } from 'react-native';

interface Tab {
  key: string;
  label: string;
}

interface TabBarProps {
  tabs: Tab[];
  activeTab: string;
  onTabPress: (key: string) => void;
}

export function TabBar({ tabs, activeTab, onTabPress }: TabBarProps) {
  return (
    <View className="flex-row border-b border-[#27272a] bg-[#0a0a0a]">
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onTabPress(tab.key)}
          className="flex-1 items-center py-3"
        >
          <Text
            className={`text-sm font-medium ${
              activeTab === tab.key ? 'text-[#3b82f6]' : 'text-[#71717a]'
            }`}
          >
            {tab.label}
          </Text>
          {activeTab === tab.key ? (
            <View className="absolute bottom-0 left-4 right-4 h-0.5 bg-[#3b82f6] rounded-full" />
          ) : null}
        </Pressable>
      ))}
    </View>
  );
}
