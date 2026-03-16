import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, LayoutAnimation, Platform, UIManager } from 'react-native';
import { themeList } from '../constants/colors';
import { useColors, useSettingsStore } from '../store/settings';
import { useConnectionStore } from '../store/connection';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  onDisconnect: () => void;
}

export function SettingsSheet({ visible, onClose, onDisconnect }: SettingsSheetProps) {
  const colors = useColors();
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const bridgeUrl = useConnectionStore((s) => s.bridgeUrl);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const [themeExpanded, setThemeExpanded] = useState(false);

  // reset accordion when sheet closes
  useEffect(() => {
    if (!visible) setThemeExpanded(false);
  }, [visible]);

  const currentThemeInfo = themeList.find((t) => t.key === currentTheme);
  const hostname = bridgeUrl ? bridgeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

  const toggleTheme = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setThemeExpanded((v) => !v);
  };

  const selectTheme = (key: typeof currentTheme) => {
    setTheme(key);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setThemeExpanded(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          className="rounded-t-2xl px-6 pt-5 pb-10"
          style={{ backgroundColor: colors.bg.surface }}
        >
          {/* section: connection */}
          <Text className="text-[10px] uppercase tracking-wider mb-2" style={{ color: colors.text.subtle }}>
            connection
          </Text>
          <View className="flex-row items-center gap-2 mb-4">
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isConnected ? colors.status.success : colors.status.error }}
            />
            <Text className="text-sm flex-1" numberOfLines={1} style={{ color: colors.text.primary }}>
              {hostname || 'not connected'}
            </Text>
          </View>

          <View className="mb-3" style={{ height: 1, backgroundColor: colors.border.default }} />

          {/* section: appearance */}
          <Text className="text-[10px] uppercase tracking-wider mb-2" style={{ color: colors.text.subtle }}>
            appearance
          </Text>
          <Pressable
            onPress={toggleTheme}
            className="flex-row items-center gap-3 py-2 active:opacity-70"
            accessibilityRole="button"
            accessibilityState={{ expanded: themeExpanded }}
          >
            <View
              style={{
                width: 28, height: 28, borderRadius: 14, backgroundColor: currentThemeInfo?.accent ?? colors.accent.primary,
                borderWidth: 1.5, borderColor: colors.text.dim,
              }}
            />
            <Text className="text-sm flex-1" style={{ color: colors.text.primary }}>
              {currentThemeInfo?.name ?? 'theme'}
            </Text>
            <Text className="text-xs" style={{ color: colors.text.dim }}>
              {themeExpanded ? 'collapse' : 'change'}
            </Text>
          </Pressable>

          {themeExpanded ? (
            <View className="ml-2 mt-1" accessibilityRole="radiogroup">
              {themeList.filter((t) => t.key !== currentTheme).map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => selectTheme(t.key)}
                  className="flex-row items-center gap-4 py-2.5 active:opacity-70"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: false }}
                >
                  <View
                    style={{
                      width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent,
                      borderWidth: 0.5, borderColor: colors.text.dim,
                    }}
                  />
                  <Text className="text-sm flex-1" style={{ color: colors.text.primary }}>
                    {t.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View className="my-3" style={{ height: 1, backgroundColor: colors.border.default }} />

          {/* section: disconnect */}
          <Pressable
            onPress={() => { onClose(); setTimeout(onDisconnect, 300); }}
            className="py-3 active:opacity-70"
            accessibilityLabel="disconnect from bridge"
          >
            <Text className="text-sm" style={{ color: colors.status.error }}>disconnect</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
