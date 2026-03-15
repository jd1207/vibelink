import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';

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
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      className="border-b border-[#27272a] bg-[#0a0a0a]"
      contentContainerStyle={{ flexGrow: 1 }}
    >
      {tabs.map((tab) => (
        <Pressable
          key={tab.key}
          onPress={() => onTabPress(tab.key)}
          style={{ paddingHorizontal: 16, paddingVertical: 12, alignItems: 'center' }}
        >
          <Text
            className={`text-sm font-medium ${
              activeTab === tab.key ? 'text-[#3b82f6]' : 'text-[#71717a]'
            }`}
          >
            {tab.label}
          </Text>
          {activeTab === tab.key ? (
            <View className="absolute bottom-0 left-2 right-2 h-0.5 bg-[#3b82f6] rounded-full" />
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}
