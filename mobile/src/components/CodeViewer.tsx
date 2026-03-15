import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';

interface CodeViewerProps {
  code: string;
  language?: string;
  diff?: boolean;
  title?: string;
}

export function CodeViewer({ code, language, diff, title }: CodeViewerProps) {
  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [code]);

  const lines = code.split('\n');

  return (
    <View className="my-2 rounded-lg overflow-hidden">
      {title ? (
        <View className="px-3 py-2 flex-row items-center justify-between" style={{ backgroundColor: colors.bg.elevated }}>
          <Text className="text-xs font-mono" style={{ color: colors.text.muted }}>{title}</Text>
          {language ? (
            <Text className="text-[10px]" style={{ color: colors.text.subtle }}>{language}</Text>
          ) : null}
        </View>
      ) : null}
      <Pressable onLongPress={handleCopy}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="p-3" style={{ backgroundColor: colors.code.background }}>
            {lines.map((line, i) => (
              <LineRow key={i} line={line} lineNumber={i + 1} diff={diff} />
            ))}
          </View>
        </ScrollView>
      </Pressable>
      <View className="px-3 pb-2" style={{ backgroundColor: colors.code.background }}>
        <Text className="text-[10px]" style={{ color: colors.text.dim }}>long press to copy</Text>
      </View>
    </View>
  );
}

interface LineRowProps {
  line: string;
  lineNumber: number;
  diff?: boolean;
}

const LineRow = React.memo(function LineRow({ line, lineNumber, diff }: LineRowProps) {
  let lineColor: string = colors.code.text;
  if (diff) {
    if (line.startsWith('+')) lineColor = colors.code.added;
    else if (line.startsWith('-')) lineColor = colors.code.removed;
  }

  return (
    <View className="flex-row">
      <Text
        className="text-xs font-mono w-8 text-right mr-3"
        selectable={false}
        style={{ color: colors.code.lineNumber }}
      >
        {lineNumber}
      </Text>
      <Text className="text-xs font-mono leading-4" selectable style={{ color: lineColor }}>
        {line}
      </Text>
    </View>
  );
});
