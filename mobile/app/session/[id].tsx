import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, Pressable, FlatList, KeyboardAvoidingView, Platform, Keyboard } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useStreaming } from '../../src/hooks/useStreaming';
import { useMessageStore, ChatMessage, ContentBlock, EMPTY_COMPONENTS, EMPTY_TABS } from '../../src/store/messages';
import { ConnectionBadge } from '../../src/components/ConnectionBadge';
import { InputBar } from '../../src/components/InputBar';
import { CliRenderer } from '../../src/components/CliRenderer';
import { TabBar } from '../../src/components/TabBar';
import { DynamicRenderer } from '../../src/components/DynamicRenderer';
import MessageBubble from '../../src/components/MessageBubble';
import ToolActivity from '../../src/components/ToolActivity';

interface DynamicComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
}

type GuiItem =
  | { kind: 'message'; data: ChatMessage }
  | { kind: 'tool'; data: ContentBlock; messageId: string }
  | { kind: 'component'; data: DynamicComponent };

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const sessionId = id ?? '';
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<GuiItem>>(null);
  const shouldAutoScroll = useRef(true);

  const [activeTab, setActiveTab] = React.useState('gui');
  const { isConnected, sendMessage, sendRaw } = useWebSocket(sessionId);
  const streamedMessages = useStreaming(sessionId);
  const isStreaming = useMessageStore((s) => s.isStreaming[sessionId] ?? false);
  const dynamicTabs = useMessageStore((s) => s.tabs[sessionId] ?? EMPTY_TABS);
  const components = useMessageStore((s) => s.components[sessionId] ?? EMPTY_COMPONENTS);

  // normal top-to-bottom list (not inverted)
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

    // thinking indicator
    if (isStreaming) {
      const last = items[items.length - 1];
      const hasStreamingMsg = last?.kind === 'message' && last.data.role === 'assistant' && last.data.isStreaming;
      if (!hasStreamingMsg) {
        items.push({
          kind: 'message',
          data: { id: 'thinking', role: 'assistant', content: '', timestamp: Date.now(), isStreaming: true },
        });
      }
    }

    // dynamic components
    for (const key of Object.keys(components)) {
      const c = components[key] as DynamicComponent;
      if (c?.id && c?.type) items.push({ kind: 'component', data: c });
    }

    return items;
  }, [streamedMessages, components, isStreaming]);

  // auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (shouldAutoScroll.current && guiItems.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [guiItems.length, guiItems[guiItems.length - 1]?.kind === 'message' ? (guiItems[guiItems.length - 1] as any).data?.content?.length : 0]);

  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    shouldAutoScroll.current = distanceFromBottom < 100;
  }, []);

  const tabNames = useMemo(() => {
    const tabs = [
      { key: 'gui', label: 'chat' },
      { key: 'cli', label: 'terminal' },
    ];
    for (const tab of dynamicTabs) {
      const t = tab as { id?: string; label?: string };
      if (t.id && t.label) tabs.push({ key: t.id, label: t.label });
    }
    return tabs;
  }, [dynamicTabs]);

  const handleComponentInteraction = useCallback(
    (componentId: string, action: string, value: unknown) => {
      sendRaw({ type: 'ui_interaction', componentId, action, value });
    },
    [sendRaw],
  );

  const renderGuiItem = useCallback(
    ({ item }: { item: GuiItem }) => {
      if (item.kind === 'tool') return <ToolActivity block={item.data} />;
      if (item.kind === 'component') {
        return (
          <View className="px-4 py-1">
            <DynamicRenderer
              component={item.data}
              onInteraction={handleComponentInteraction}
            />
          </View>
        );
      }
      return <MessageBubble message={item.data} />;
    },
    [handleComponentInteraction],
  );

  const keyExtractor = useCallback((item: GuiItem, index: number) => {
    if (item.kind === 'message') return `msg-${item.data.id}-${index}`;
    if (item.kind === 'component') return `comp-${item.data.id}`;
    return `tool-${item.messageId}-${index}`;
  }, []);

  return (
    <>
      <Stack.Screen
        options={{ title: 'chat', headerRight: () => <ConnectionBadge /> }}
      />
      <View
        style={{ flex: 1, backgroundColor: '#0a0a0a', paddingBottom: insets.bottom }}
      >
        <TabBar tabs={tabNames} activeTab={activeTab} onTabPress={setActiveTab} />

        <View className="flex-1">
          {activeTab === 'cli' ? (
            <CliRenderer sessionId={sessionId} />
          ) : (
            <FlatList
              ref={flatListRef}
              data={guiItems}
              renderItem={renderGuiItem}
              onScroll={handleScroll}
              scrollEventThrottle={16}
              keyboardDismissMode="interactive"
              keyExtractor={keyExtractor}
              contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center pt-32">
                  <Text className="text-[#52525b] text-base">send a message to start</Text>
                </View>
              }
            />
          )}
        </View>

        <InputBar sessionId={sessionId} isStreaming={isStreaming} onSend={sendMessage} />
      </View>
    </>
  );
}
