import React from 'react';
import { View, Text, Pressable, Modal } from 'react-native';
import { themeList } from '../constants/colors';
import { useColors, useSettingsStore } from '../store/settings';

interface ThemePickerProps {
  visible: boolean;
  onClose: () => void;
  onDisconnect: () => void;
}

export function ThemePicker({ visible, onClose, onDisconnect }: ThemePickerProps) {
  const colors = useColors();
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          className="rounded-t-2xl px-6 pt-5 pb-10"
          style={{ backgroundColor: colors.bg.surface }}
        >
          <Text className="text-base font-semibold mb-4" style={{ color: colors.text.primary }}>
            theme
          </Text>

          {themeList.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => { setTheme(t.key); onClose(); }}
              className="flex-row items-center gap-4 py-3 active:opacity-70"
            >
              <View
                style={{
                  width: 28, height: 28, borderRadius: 14, backgroundColor: t.accent,
                  borderWidth: currentTheme === t.key ? 2.5 : 0.5,
                  borderColor: currentTheme === t.key ? colors.text.primary : colors.text.dim,
                }}
              />
              <Text className="text-sm flex-1" style={{ color: colors.text.primary }}>
                {t.name}
              </Text>
              {currentTheme === t.key ? (
                <Text style={{ color: colors.accent.primary, fontSize: 16 }}>✓</Text>
              ) : null}
            </Pressable>
          ))}

          <View className="my-3" style={{ height: 1, backgroundColor: colors.border.default }} />

          <Pressable
            onPress={() => { onClose(); setTimeout(onDisconnect, 300); }}
            className="py-3 active:opacity-70"
          >
            <Text className="text-sm" style={{ color: colors.status.error }}>disconnect</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
