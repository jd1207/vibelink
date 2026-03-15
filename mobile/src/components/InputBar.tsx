import React, { useCallback } from 'react';
import { View, TextInput, Pressable, Text } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useDraft } from '../hooks/useDraft';
import { useMessageStore } from '../store/messages';
import { colors } from '../constants/colors';

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

    // add user message to store immediately so it shows in GUI
    useMessageStore.getState().appendEvent(sessionId, {
      eventId: Date.now(),
      type: 'claude_event',
      event: { type: 'user', message: { content: [{ type: 'text', text }] } },
    } as any);

    // mark as streaming — claude is thinking
    useMessageStore.getState().setStreaming(sessionId, true);

    onSend(text);
    clearDraft();
  }, [draft, isStreaming, onSend, clearDraft, sessionId]);

  return (
    <View
      className="flex-row items-end gap-2 px-4 py-3 border-t"
      style={{ backgroundColor: colors.bg.primary, borderTopColor: colors.border.default }}
    >
      <TextInput
        className="flex-1 rounded-xl px-4 py-3 text-base max-h-32 border"
        style={{
          backgroundColor: colors.bg.surface,
          borderColor: colors.border.default,
          color: colors.text.primary,
        }}
        placeholder="message claude..."
        placeholderTextColor={colors.text.dim}
        value={draft}
        onChangeText={setDraft}
        autoFocus={false}
        returnKeyType="send"
        blurOnSubmit={false}
        onSubmitEditing={handleSend}
      />
      <Pressable
        onPress={handleSend}
        disabled={!canSend}
        className="rounded-xl px-5 py-3 active:opacity-80"
        style={{ backgroundColor: canSend ? colors.accent.primary : colors.border.subtle }}
      >
        <Text
          className="font-semibold text-base"
          style={{ color: canSend ? colors.text.primary : colors.text.dim }}
        >
          send
        </Text>
      </Pressable>
    </View>
  );
}
