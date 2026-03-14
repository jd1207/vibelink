import React, { useCallback, useMemo } from 'react';
import { View, Text, Pressable } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { FlashList } from '@shopify/flash-list';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useStreaming } from '../../src/hooks/useStreaming';
import { useStickyScroll } from '../../src/hooks/useStickyScroll';
import { useMessageStore, ChatMessage, ContentBlock } from '../../src/store/messages';
import { ConnectionBadge } from '../../src/components/ConnectionBadge';
import { InputBar } from '../../src/components/InputBar';
import { CliRenderer } from '../../src/components/CliRenderer';
import { TabBar } from '../../src/components/TabBar';
import MessageBubble from '../../src/components/MessageBubble';
import ToolActivity from '../../src/components/ToolActivity';

type GuiItem =
  | { kind: 'message'; data: ChatMessage }
  | { kind: 'tool'; data: ContentBlock; messageId: string };

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = id ?? '';
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = React.useState('gui');
  const { isConnected, sendMessage } = useWebSocket(sessionId);
  const streamedMessages = useStreaming(sessionId);
  const isStreaming = useMessageStore((s) => s.isStreaming.get(sessionId) ?? false);
  const dynamicTabs = useMessageStore((s) => s.tabs.get(sessionId) ?? []);

  const { scrollRef, onScroll, isAtBottom, scrollToBottom } = useStickyScroll<GuiItem>();

  const guiItems = useMemo(() => {
    const items: GuiItem[] = [];
    for (const msg of streamedMessages) {
      if (msg.contentBlocks) {
        for (const block of msg.contentBlocks) {
          if (block.type === 'tool_use' || block.type === 'tool_result') {
            items.push({ kind: 'tool', data: block, messageId: msg.id });
          }
        }
      }
      if (msg.content || msg.isStreaming) {
        items.push({ kind: 'message', data: msg });
      }
    }
    return items.reverse();
  }, [streamedMessages]);

  const tabNames = useMemo(() => {
    const tabs = [
      { key: 'cli', label: 'cli' },
      { key: 'gui', label: 'gui' },
    ];
    for (const tab of dynamicTabs) {
      const t = tab as { id?: string; label?: string };
      if (t.id && t.label) tabs.push({ key: t.id, label: t.label });
    }
    return tabs;
  }, [dynamicTabs]);

  const renderGuiItem = useCallback(({ item }: { item: GuiItem }) => {
    if (item.kind === 'tool') return <ToolActivity block={item.data} />;
    return <MessageBubble message={item.data} />;
  }, []);

  const keyExtractor = useCallback((item: GuiItem, index: number) => {
    if (item.kind === 'message') return `msg-${item.data.id}`;
    return `tool-${item.messageId}-${item.data.id ?? index}`;
  }, []);

  return (
    <>
      <Stack.Screen
        options={{ title: 'chat', headerRight: () => <ConnectionBadge /> }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#0a0a0a', paddingBottom: insets.bottom }}
        behavior="padding"
      >
        <TabBar tabs={tabNames} activeTab={activeTab} onTabPress={setActiveTab} />

        <View className="flex-1">
          {activeTab === 'cli' ? (
            <CliRenderer sessionId={sessionId} />
          ) : (
            <View className="flex-1">
              <FlashList
                ref={scrollRef}
                data={guiItems}
                renderItem={renderGuiItem}
                inverted
                onScroll={onScroll}
                scrollEventThrottle={16}
                keyboardDismissMode="interactive"
                keyExtractor={keyExtractor}
                contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
              />
              {!isAtBottom ? (
                <Pressable
                  onPress={scrollToBottom}
                  className="absolute bottom-4 self-center bg-[#3b82f6] rounded-full px-4 py-2"
                >
                  <Text className="text-white text-xs font-medium">jump to bottom</Text>
                </Pressable>
              ) : null}
            </View>
          )}
        </View>

        <InputBar sessionId={sessionId} isStreaming={isStreaming} onSend={sendMessage} />
      </KeyboardAvoidingView>
    </>
  );
}
