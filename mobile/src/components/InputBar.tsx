import React, { useCallback } from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useDraft } from '../hooks/useDraft';

interface InputBarProps {
  sessionId: string;
  isStreaming: boolean;
  onSend: (content: string) => void;
}

export function InputBar({ sessionId, isStreaming, onSend }: InputBarProps) {
  const { draft, setDraft, clearDraft } = useDraft(sessionId);
  const canSend = draft.trim().length > 0 && !isStreaming;

  const handleSend = useCallback(() => {
    const text = draft.trim();
    if (!text || isStreaming) return;

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onSend(text);
    clearDraft();
  }, [draft, isStreaming, onSend, clearDraft]);

  return (
    <View className="flex-row items-end gap-2 px-4 py-3 bg-[#0a0a0a] border-t border-[#27272a]">
      <TextInput
        className="flex-1 bg-[#18181b] border border-[#27272a] rounded-xl px-4 py-3 text-[#fafafa] text-base max-h-32"
        placeholder="message claude..."
        placeholderTextColor="#52525b"
        value={draft}
        onChangeText={setDraft}
        multiline
        autoFocus
        returnKeyType="default"
        blurOnSubmit={false}
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        className={`rounded-xl px-5 py-3 ${canSend ? 'bg-[#3b82f6] active:opacity-80' : 'bg-[#27272a]'}`}
      >
        <Text className={`font-semibold text-base ${canSend ? 'text-white' : 'text-[#52525b]'}`}>
          send
        </Text>
      </Pressable>
    </View>
  );
}
