import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { colors } from '../constants/colors';

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
    <View style={{ borderBottomWidth: 1, borderBottomColor: colors.border.default, backgroundColor: colors.bg.primary }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexGrow: 1 }}
      >
        {tabs.map((tab) => (
          <Pressable
            key={tab.key}
            onPress={() => onTabPress(tab.key)}
            style={{ flex: 1, minWidth: 60, alignItems: 'center', paddingVertical: 12 }}
          >
            <Text
              className="text-sm font-medium"
              style={{ color: activeTab === tab.key ? colors.accent.primary : colors.text.subtle }}
            >
              {tab.label}
            </Text>
            {activeTab === tab.key ? (
              <View
                className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full"
                style={{ backgroundColor: colors.accent.primary }}
              />
            ) : null}
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
