import React, { useCallback } from 'react';
import { View, Text, ScrollView, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';

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
        <View className="bg-[#1e293b] px-3 py-2 flex-row items-center justify-between">
          <Text className="text-[#94a3b8] text-xs font-mono">{title}</Text>
          {language ? (
            <Text className="text-[#64748b] text-[10px]">{language}</Text>
          ) : null}
        </View>
      ) : null}
      <Pressable onLongPress={handleCopy}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="bg-[#111] p-3">
            {lines.map((line, i) => (
              <LineRow key={i} line={line} lineNumber={i + 1} diff={diff} />
            ))}
          </View>
        </ScrollView>
      </Pressable>
      <View className="bg-[#111] px-3 pb-2">
        <Text className="text-[#52525b] text-[10px]">long press to copy</Text>
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
  let textColor = 'text-[#e2e8f0]';
  if (diff) {
    if (line.startsWith('+')) textColor = 'text-[#4ade80]';
    else if (line.startsWith('-')) textColor = 'text-[#f87171]';
  }

  return (
    <View className="flex-row">
      <Text className="text-[#52525b] text-xs font-mono w-8 text-right mr-3" selectable={false}>
        {lineNumber}
      </Text>
      <Text className={`${textColor} text-xs font-mono leading-4`} selectable>
        {line}
      </Text>
    </View>
  );
});
