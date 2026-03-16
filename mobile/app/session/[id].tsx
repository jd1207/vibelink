import React, { useCallback, useMemo, useRef, useEffect, useState } from 'react';
import { View, Text, Pressable, FlatList, Keyboard, Modal, TextInput, ActivityIndicator } from 'react-native';
import { useLocalSearchParams, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useWebSocket } from '../../src/hooks/useWebSocket';
import { useStreaming } from '../../src/hooks/useStreaming';
import { useMessageStore, ChatMessage, ContentBlock, EMPTY_TABS, EMPTY_PERMISSION_QUEUE, EMPTY_WATCH_INFO } from '../../src/store/messages';
import { useConnectionStore } from '../../src/store/connection';
import { useStreamStore, EMPTY_STREAM_TABS } from '../../src/store/stream-store';
import { ConnectionBadge } from '../../src/components/ConnectionBadge';
import { InputBar } from '../../src/components/InputBar';
import { WatchBanner } from '../../src/components/WatchBanner';
import { WorkspaceView } from '../../src/components/WorkspaceView';
import { StreamView } from '../../src/components/StreamView';
import { WindowPicker } from '../../src/components/WindowPicker';
import { TabBar } from '../../src/components/TabBar';
import MessageBubble from '../../src/components/MessageBubble';
import ToolActivity from '../../src/components/ToolActivity';
import { formatToolName, formatToolInput } from '../../src/components/tool-format';
import { useColors } from '../../src/store/settings';
import { bridgeApi } from '../../src/services/bridge-api';

type GuiItem =
  | { kind: 'message'; data: ChatMessage }
  | { kind: 'tool'; data: ContentBlock; messageId: string };

export default function SessionScreen() {
  const colors = useColors();
  const params = useLocalSearchParams<{
    id: string;
    watch?: string;
    claudeSessionId?: string;
    projectPath?: string;
  }>();
  const initialSessionId = params.id ?? '';
  const isWatchMode = params.watch === 'true';
  const initialClaudeSessionId = params.claudeSessionId;
  const projectPath = params.projectPath ? decodeURIComponent(params.projectPath) : undefined;
  const insets = useSafeAreaInsets();
  const flatListRef = useRef<FlatList<GuiItem>>(null);
  const shouldAutoScroll = useRef(true);

  // mutable state for seamless session swapping (no navigation)
  const [activeSessionId, setActiveSessionId] = useState(initialSessionId);
  const [activeClaudeSessionId, setActiveClaudeSessionId] = useState(initialClaudeSessionId);
  const [isWatching, setIsWatching] = useState(isWatchMode);

  const [activeTab, setActiveTab] = React.useState('gui');
  const { isConnected, sendMessage, sendRaw } = useWebSocket(activeSessionId);
  const streamedMessages = useStreaming(activeSessionId);
  const isStreaming = useMessageStore((s) => s.isStreaming[activeSessionId] ?? false);
  const dynamicTabs = useMessageStore((s) => s.tabs[activeSessionId] ?? EMPTY_TABS);
  const permissionQueue = useMessageStore((s) => s.permissionQueue[activeSessionId] ?? EMPTY_PERMISSION_QUEUE);
  const permissionRequest = permissionQueue[0] ?? null;
  const streamTabs = useStreamStore((s) => s.streamTabs[activeSessionId] ?? EMPTY_STREAM_TABS);
  const pickerOpen = useStreamStore((s) => s.pickerOpen[activeSessionId] ?? false);
  const { setPickerOpen } = useStreamStore.getState();
  const bridgeUrl = useConnectionStore((s) => s.bridgeUrl);
  const authToken = useConnectionStore((s) => s.authToken);
  const watchInfo = useMessageStore((s) => s.watchInfo[activeSessionId] ?? EMPTY_WATCH_INFO);
  const watchState = watchInfo.state;

  // initialize watch state in store on mount
  useEffect(() => {
    if (isWatchMode) {
      useMessageStore.getState().setWatchState(activeSessionId, 'watching');
    }
  }, [isWatchMode, activeSessionId]);

  // auto-reconnect to terminal when "continued in terminal" is detected
  const reconnectingRef = useRef(false);
  useEffect(() => {
    if (watchState !== 'ended') return;
    if (watchInfo.error !== 'continued in terminal') return;
    if (!activeClaudeSessionId || reconnectingRef.current) return;
    reconnectingRef.current = true;

    // auto-create a watch session for the terminal and swap in-place
    bridgeApi.watchSession(activeClaudeSessionId).then((result) => {
      const oldId = activeSessionId;
      useMessageStore.getState().copyEvents(oldId, result.sessionId);
      useMessageStore.getState().setWatchState(result.sessionId, 'watching');
      setActiveSessionId(result.sessionId);
      setIsWatching(true);
      if (oldId && oldId !== result.sessionId) {
        bridgeApi.deleteSession(oldId).catch(() => {});
      }
      reconnectingRef.current = false;
    }).catch(() => {
      reconnectingRef.current = false;
    });
  }, [watchState, watchInfo.error, activeClaudeSessionId, activeSessionId]);

  // session swap handler — copies events for continuity, updates state in-place
  const handleSessionSwap = useCallback((newSessionId: string, watching: boolean) => {
    const oldId = activeSessionId;
    useMessageStore.getState().copyEvents(oldId, newSessionId);
    setActiveSessionId(newSessionId);
    setIsWatching(watching);
    // clean up the old bridge session (don't await — fire and forget)
    if (oldId && oldId !== newSessionId) {
      bridgeApi.deleteSession(oldId).catch(() => {});
    }
  }, [activeSessionId]);

  // stream tab edit modal
  const [editingStream, setEditingStream] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');

  // manual keyboard height tracking — more reliable than KeyboardAvoidingView on Android
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener('keyboardDidHide', () => {
      setKeyboardHeight(0);
    });
    return () => { showSub.remove(); hideSub.remove(); };
  }, []);

  // normal top-to-bottom list (not inverted)
  const guiItems = useMemo(() => {
    const items: GuiItem[] = [];

    // collect completed tool ids so tool_use blocks show "done" after their result arrives
    const completedToolIds = new Set<string>();
    for (const msg of streamedMessages) {
      if (msg.contentBlocks) {
        for (const block of msg.contentBlocks) {
          if (block.type === 'tool_result' && block.id) completedToolIds.add(block.id);
        }
      }
    }

    for (const msg of streamedMessages) {
      if (msg.contentBlocks) {
        for (const block of msg.contentBlocks) {
          if (block.type === 'tool_use') {
            const isComplete = !!block.id && completedToolIds.has(block.id);
            items.push({ kind: 'tool', data: { ...block, isComplete }, messageId: msg.id });
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

    return items;
  }, [streamedMessages, isStreaming]);

  // auto-scroll to bottom when new items arrive
  useEffect(() => {
    if (shouldAutoScroll.current && guiItems.length > 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 50);
    }
  }, [guiItems.length, guiItems[guiItems.length - 1]?.kind === 'message' ? (guiItems[guiItems.length - 1] as any).data?.content?.length : 0]);

  // streaming watchdog: clear stuck streaming on disconnect
  useEffect(() => {
    if (!isStreaming || isConnected) return;
    const timer = setTimeout(() => {
      useMessageStore.getState().setStreaming(activeSessionId, false);
    }, 5000);
    return () => clearTimeout(timer);
  }, [isStreaming, isConnected, activeSessionId]);

  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    shouldAutoScroll.current = distanceFromBottom < 100;
  }, []);

  const tabNames = useMemo(() => {
    const tabs = [
      { key: 'gui', label: 'chat' },
      { key: 'workspace', label: 'workspace' },
    ];
    for (const tab of dynamicTabs) {
      const t = tab as { id?: string; label?: string };
      if (t.id && t.label) tabs.push({ key: t.id, label: t.label });
    }
    const sortedStreams = Object.entries(streamTabs)
      .sort(([, a], [, b]) => (a.tabLabel || '').localeCompare(b.tabLabel || '', undefined, { numeric: true }));
    for (const [windowId, stream] of sortedStreams) {
      tabs.push({ key: `stream-${windowId}`, label: stream.tabLabel || 'stream' });
    }
    tabs.push({ key: 'add-stream', label: '+' });
    return tabs;
  }, [dynamicTabs, streamTabs]);

  const handleComponentInteraction = useCallback(
    (componentId: string, action: string, value: unknown) => {
      sendRaw({ type: 'ui_interaction', componentId, action, value });
    },
    [sendRaw],
  );

  const handleTabPress = useCallback(
    (tabKey: string) => {
      if (tabKey === 'add-stream') {
        sendRaw({ type: 'list_windows' });
        setPickerOpen(activeSessionId, true);
        return;
      }
      // tapping already-active stream tab opens edit modal
      if (tabKey === activeTab && tabKey.startsWith('stream-')) {
        const wid = tabKey.replace('stream-', '');
        const tab = useStreamStore.getState().streamTabs[activeSessionId]?.[wid];
        setEditLabel(tab?.tabLabel || '');
        setEditingStream(wid);
        return;
      }
      setActiveTab(tabKey);
    },
    [sendRaw, setPickerOpen, activeSessionId, activeTab],
  );

  const handleStreamConfirm = useCallback(
    (windowId: string) => {
      sendRaw({ type: 'stream_confirm_response', windowId, accepted: true });
    },
    [sendRaw],
  );

  const handleStreamReject = useCallback(
    (windowId: string) => {
      sendRaw({ type: 'stream_confirm_response', windowId, accepted: false });
      useStreamStore.getState().removeStreamTab(activeSessionId, windowId);
    },
    [sendRaw, activeSessionId],
  );

  const handlePermissionResponse = useCallback(
    (behavior: 'allow' | 'deny') => {
      // read directly from store to avoid stale closure when tapping rapidly
      const queue = useMessageStore.getState().permissionQueue[activeSessionId];
      const front = queue?.[0];
      if (!front) return;
      sendRaw({ type: 'permission_response', requestId: front.requestId, behavior });
      useMessageStore.getState().shiftPermission(activeSessionId);
    },
    [sendRaw, activeSessionId],
  );

  const renderGuiItem = useCallback(
    ({ item }: { item: GuiItem }) => {
      if (item.kind === 'tool') return <ToolActivity block={item.data} />;
      return <MessageBubble message={item.data} />;
    },
    [],
  );

  const keyExtractor = useCallback((item: GuiItem, index: number) => {
    if (item.kind === 'message') return `msg-${item.data.id}-${index}`;
    return `tool-${item.messageId}-${index}`;
  }, []);

  return (
    <>
      <Stack.Screen
        options={{ title: isWatching ? 'watching' : 'chat', headerRight: () => <ConnectionBadge /> }}
      />
      <View
        style={{ flex: 1, backgroundColor: colors.bg.primary, paddingBottom: keyboardHeight ? keyboardHeight + 20 : insets.bottom }}
      >
        <TabBar tabs={tabNames} activeTab={activeTab} onTabPress={handleTabPress} />

        <View className="flex-1">
          {activeTab.startsWith('stream-') ? (
            <StreamView
              sessionId={activeSessionId}
              windowId={activeTab.replace('stream-', '')}
              wsUrl={`ws://${bridgeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}/ws/${activeSessionId}?token=${encodeURIComponent(authToken)}`}
              onConfirm={handleStreamConfirm}
              onReject={handleStreamReject}
            />
          ) : activeTab === 'workspace' ? (
            <WorkspaceView sessionId={activeSessionId} onComponentInteraction={handleComponentInteraction} />
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
              ListFooterComponent={
                isWatching && isStreaming ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12 }}>
                    <ActivityIndicator size="small" color={colors.text.muted} />
                    <Text style={{ color: colors.text.subtle, fontSize: 13 }}>Claude is responding...</Text>
                  </View>
                ) : null
              }
              ListEmptyComponent={
                <View className="flex-1 items-center justify-center pt-32">
                  <Text className="text-base" style={{ color: colors.text.dim }}>
                    {isWatching ? 'watching terminal session...' : 'send a message to start'}
                  </Text>
                </View>
              }
            />
          )}
        </View>

        {permissionRequest ? (
          <View className="px-4 py-3 border-t"
            style={{ backgroundColor: colors.bg.surface, borderTopColor: colors.status.warning + '33' }}>
            <View className="flex-row items-center gap-2">
              <View className="flex-1">
                <View className="flex-row items-center gap-2">
                  <Text className="text-xs font-semibold" style={{ color: colors.status.warning }}>
                    {formatToolName(permissionRequest.toolName)}
                  </Text>
                  {permissionQueue.length > 1 ? (
                    <Text className="text-[10px]" style={{ color: colors.text.subtle }}>
                      +{permissionQueue.length - 1} more
                    </Text>
                  ) : null}
                </View>
                <Text className="text-[11px] mt-0.5" numberOfLines={2} style={{ color: colors.text.muted }}>
                  {formatToolInput(permissionRequest.toolName, permissionRequest.toolInput)}
                </Text>
              </View>
              <Pressable
                onPress={() => handlePermissionResponse('allow')}
                className="rounded-lg px-4 py-2 active:opacity-80"
                style={{ backgroundColor: colors.accent.primary }}
              >
                <Text className="text-white font-semibold text-sm">approve</Text>
              </Pressable>
              <Pressable
                onPress={() => handlePermissionResponse('deny')}
                className="rounded-lg px-4 py-2 active:opacity-80"
                style={{ backgroundColor: colors.status.errorDark }}
              >
                <Text className="text-white font-semibold text-sm">deny</Text>
              </Pressable>
            </View>
          </View>
        ) : null}

        {watchState ? (
          <WatchBanner
            sessionId={activeSessionId}
            claudeSessionId={activeClaudeSessionId}
            projectPath={projectPath}
            sendRaw={sendRaw}
            onSessionSwap={handleSessionSwap}
          />
        ) : (
          <InputBar sessionId={activeSessionId} isStreaming={isStreaming} onSend={sendMessage} />
        )}

        <WindowPicker
          sessionId={activeSessionId}
          visible={pickerOpen}
          onClose={() => setPickerOpen(activeSessionId, false)}
          onSelect={(w) => {
            useStreamStore.getState().addStreamTab(activeSessionId, w.id, w.title, 'streaming');
            sendRaw({ type: 'start_stream', windowId: w.id });
            setActiveTab(`stream-${w.id}`);
          }}
          onRefresh={() => sendRaw({ type: 'list_windows' })}
        />

        <Modal visible={editingStream !== null} transparent animationType="fade">
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' }}
            onPress={() => setEditingStream(null)}
          >
            <Pressable
              style={{ backgroundColor: colors.bg.surface, borderRadius: 12, padding: 20, width: 260 }}
              onPress={(e) => e.stopPropagation()}
            >
              <Text style={{ color: colors.text.secondary, fontSize: 15, fontWeight: '600', marginBottom: 12 }}>
                rename tab
              </Text>
              <TextInput
                value={editLabel}
                onChangeText={(t) => setEditLabel(t.slice(0, 10))}
                maxLength={10}
                style={{
                  backgroundColor: colors.bg.elevated, color: colors.text.secondary, borderRadius: 8,
                  paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 16,
                }}
                autoFocus
                selectTextOnFocus
              />
              <Pressable
                onPress={() => {
                  if (editingStream && editLabel.trim()) {
                    useStreamStore.getState().renameStreamTab(activeSessionId, editingStream, editLabel.trim());
                  }
                  setEditingStream(null);
                }}
                style={{ backgroundColor: colors.accent.dark, borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>save</Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  if (editingStream) {
                    sendRaw({ type: 'stop_stream', windowId: editingStream });
                    useStreamStore.getState().removeStreamTab(activeSessionId, editingStream);
                    setActiveTab('gui');
                  }
                  setEditingStream(null);
                }}
                style={{ backgroundColor: colors.status.errorDark, borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 14, fontWeight: '600' }}>close stream</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    </>
  );
}
