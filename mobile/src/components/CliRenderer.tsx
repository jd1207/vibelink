import React, { useCallback, useMemo, useRef, useEffect } from 'react';
import { View, Text, FlatList } from 'react-native';
import { useMessageStore, EMPTY_EVENTS } from '../store/messages';

// extract human-readable text from a claude event
function formatEvent(raw: any): { label: string; text: string; color: string } | null {
  const evt = raw?.type === 'claude_event' ? raw.event : raw?.payload;
  if (!evt?.type) return null;

  switch (evt.type) {
    case 'system':
      if (evt.subtype === 'init') {
        return { label: 'system', text: `session started in ${evt.cwd ?? 'unknown'}`, color: '#60a5fa' };
      }
      return null;

    case 'stream_event': {
      const delta = evt.event?.delta;
      if (delta?.type === 'text_delta' && delta.text) {
        return { label: '', text: delta.text, color: '#fafafa' };
      }
      return null;
    }

    case 'assistant': {
      const content = evt.message?.content;
      if (!Array.isArray(content)) return null;
      const parts: string[] = [];
      for (const block of content) {
        if (block.type === 'text') parts.push(block.text);
        if (block.type === 'tool_use') {
          const input = JSON.stringify(block.input ?? {});
          parts.push(`> ${block.name}(${input.length > 80 ? input.substring(0, 80) + '...' : input})`);
        }
      }
      return parts.length ? { label: 'claude', text: parts.join('\n'), color: '#34d399' } : null;
    }

    case 'user': {
      const content = evt.message?.content;
      if (typeof content === 'string') return { label: 'you', text: content, color: '#60a5fa' };
      if (Array.isArray(content)) {
        const text = content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('');
        if (text) return { label: 'you', text, color: '#60a5fa' };
        const toolResult = content.find((b: any) => b.type === 'tool_result');
        if (toolResult) {
          const output = typeof toolResult.content === 'string'
            ? toolResult.content.substring(0, 300)
            : JSON.stringify(toolResult.content).substring(0, 300);
          return { label: 'tool', text: output, color: '#fb923c' };
        }
      }
      return null;
    }

    case 'result':
      return { label: 'done', text: `completed in ${evt.duration_ms ?? '?'}ms`, color: '#a1a1aa' };

    default:
      return null;
  }
}

interface CliLine {
  id: string;
  label: string;
  text: string;
  color: string;
}

interface CliRendererProps {
  sessionId: string;
}

export function CliRenderer({ sessionId }: CliRendererProps) {
  const events = useMessageStore((s) => s.events[sessionId] ?? EMPTY_EVENTS);
  const flatListRef = useRef<FlatList<CliLine>>(null);
  const shouldAutoScroll = useRef(true);

  const lines = useMemo(() => {
    const result: CliLine[] = [];
    for (let i = 0; i < events.length; i++) {
      const formatted = formatEvent(events[i]);
      if (!formatted) continue;

      // merge consecutive stream deltas into one line
      if (!formatted.label && result.length > 0 && !result[result.length - 1].label) {
        result[result.length - 1] = {
          ...result[result.length - 1],
          text: result[result.length - 1].text + formatted.text,
        };
        continue;
      }

      result.push({ id: `cli-${i}`, ...formatted });
    }
    return result;
  }, [events]);

  // auto-scroll to bottom
  useEffect(() => {
    if (shouldAutoScroll.current && lines.length > 0) {
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: false }), 30);
    }
  }, [lines.length, lines[lines.length - 1]?.text?.length]);

  const handleScroll = useCallback((event: any) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    const distanceFromBottom = contentSize.height - layoutMeasurement.height - contentOffset.y;
    shouldAutoScroll.current = distanceFromBottom < 80;
  }, []);

  const renderItem = useCallback(({ item }: { item: CliLine }) => (
    <View className="px-3 py-0.5">
      {item.label ? (
        <Text style={{ color: item.color }} className="font-mono text-xs opacity-60">
          {item.label}
        </Text>
      ) : null}
      <Text style={{ color: item.color }} className="font-mono text-sm leading-5" selectable>
        {item.text}
      </Text>
    </View>
  ), []);

  return (
    <FlatList
      ref={flatListRef}
      data={lines}
      renderItem={renderItem}
      onScroll={handleScroll}
      scrollEventThrottle={16}
      keyboardDismissMode="interactive"
      keyExtractor={(item) => item.id}
      contentContainerStyle={{ paddingTop: 8, paddingBottom: 8 }}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center pt-32">
          <Text className="text-[#52525b] text-base font-mono">waiting for events...</Text>
        </View>
      }
    />
  );
}
