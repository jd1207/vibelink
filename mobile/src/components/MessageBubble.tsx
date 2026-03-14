import React from 'react';
import { View, Text } from 'react-native';
import { ChatMessage } from '../store/messages';
import { MarkdownContent } from './MarkdownRenderer';

interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View className="px-4 py-2 items-center">
        <Text className="text-[#71717a] text-xs">{message.content}</Text>
      </View>
    );
  }

  const timeStr = formatTimestamp(message.timestamp);

  return (
    <View className={`px-4 py-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <View
        className={`rounded-2xl px-4 py-2.5 max-w-[85%] ${
          isUser ? 'bg-[#3b82f6]' : 'bg-[#18181b]'
        }`}
      >
        <MarkdownContent text={message.content} isUser={isUser} />
        {message.isStreaming ? <StreamingDot /> : null}
      </View>
      <Text className="text-[#52525b] text-[10px] mt-1 px-1">{timeStr}</Text>
    </View>
  );
});

export default MessageBubble;

function StreamingDot() {
  return (
    <View className="flex-row items-center mt-1 gap-1">
      <View className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] opacity-60" />
      <Text className="text-[#52525b] text-[10px]">typing</Text>
    </View>
  );
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  return `${hours}:${minutes}`;
}
