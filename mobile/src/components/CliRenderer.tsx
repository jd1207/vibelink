import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { useStickyScroll } from '../hooks/useStickyScroll';
import { useMessageStore, ClaudeEvent } from '../store/messages';

const EVENT_COLORS: Record<string, string> = {
  system: 'text-blue-400',
  stream_event: 'text-[#71717a]',
  assistant: 'text-emerald-400',
  tool_use: 'text-orange-400',
  tool_result: 'text-orange-400',
  user: 'text-[#fafafa]',
  result: 'text-emerald-400',
  error: 'text-red-400',
  session_error: 'text-red-400',
  session_ended: 'text-[#a1a1aa]',
};

const LABEL_COLORS: Record<string, string> = {
  system: 'bg-blue-900/50',
  stream_event: 'bg-[#27272a]',
  assistant: 'bg-emerald-900/50',
  tool_use: 'bg-orange-900/50',
  tool_result: 'bg-orange-900/50',
  user: 'bg-[#27272a]',
  result: 'bg-emerald-900/50',
  error: 'bg-red-900/50',
  session_error: 'bg-red-900/50',
  session_ended: 'bg-[#27272a]',
};

function getEventLabel(event: ClaudeEvent): string {
  if (event.type === 'claude_event' && event.event?.type) {
    return event.event.type;
  }
  return event.type;
}

interface EventRowProps {
  event: ClaudeEvent;
}

const EventRow = React.memo(function EventRow({ event }: EventRowProps) {
  const label = getEventLabel(event);
  const textColor = EVENT_COLORS[label] ?? 'text-[#a1a1aa]';
  const labelBg = LABEL_COLORS[label] ?? 'bg-[#27272a]';
  const content = JSON.stringify(event, null, 2);

  return (
    <View className="px-3 py-2 border-b border-[#27272a]/50">
      <View className={`self-start rounded px-2 py-0.5 mb-1 ${labelBg}`}>
        <Text className={`text-xs font-mono ${textColor}`}>{label}</Text>
      </View>
      <Text className={`font-mono text-xs leading-4 ${textColor}`} selectable>
        {content}
      </Text>
    </View>
  );
});

interface CliRendererProps {
  sessionId: string;
}

export function CliRenderer({ sessionId }: CliRendererProps) {
  const events = useMessageStore((s) => s.events.get(sessionId) ?? []);
  const { scrollRef, onScroll, isAtBottom, scrollToBottom } = useStickyScroll<ClaudeEvent>();

  // inverted list needs reversed data
  const reversedEvents = [...events].reverse();

  const renderItem = useCallback(({ item }: { item: ClaudeEvent }) => (
    <EventRow event={item} />
  ), []);

  return (
    <View className="flex-1">
      <FlashList
        ref={scrollRef}
        data={reversedEvents}
        renderItem={renderItem}
        inverted
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyboardDismissMode="interactive"
        keyExtractor={(_, index) => `evt-${events.length - 1 - index}`}
      />
      {!isAtBottom && (
        <Pressable
          onPress={scrollToBottom}
          className="absolute bottom-4 self-center bg-[#3b82f6] rounded-full px-4 py-2"
        >
          <Text className="text-white text-xs font-medium">jump to bottom</Text>
        </Pressable>
      )}
    </View>
  );
}
