import React, { useEffect, useRef } from 'react';
import { View, Text, Animated } from 'react-native';
import { ChatMessage } from '../store/messages';
import { MarkdownContent } from './MarkdownRenderer';
import { useColors } from '../store/settings';

interface MessageBubbleProps {
  message: ChatMessage;
}

const MessageBubble = React.memo(function MessageBubble({ message }: MessageBubbleProps) {
  const colors = useColors();
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';

  if (isSystem) {
    return (
      <View className="px-4 py-2 items-center">
        <Text className="text-xs" style={{ color: colors.text.subtle }}>{message.content}</Text>
      </View>
    );
  }

  const timeStr = formatTimestamp(message.timestamp);

  return (
    <View className={`px-4 py-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
      <View
        className="rounded-2xl px-4 py-2.5 max-w-[85%]"
        style={{ backgroundColor: isUser ? colors.accent.userBubble : colors.bg.surface }}
      >
        <MarkdownContent text={message.content} isUser={isUser} />
        {message.isStreaming ? <AnimatedDots /> : null}
      </View>
      <Text className="text-[10px] mt-1 px-1" style={{ color: colors.text.dim }}>{timeStr}</Text>
    </View>
  );
});

export default MessageBubble;

function AnimatedDots() {
  const colors = useColors();
  const dot1 = useRef(new Animated.Value(0)).current;
  const dot2 = useRef(new Animated.Value(0)).current;
  const dot3 = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const bounce = (dot: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(dot, { toValue: -4, duration: 250, useNativeDriver: true }),
          Animated.timing(dot, { toValue: 0, duration: 250, useNativeDriver: true }),
        ])
      );
    const a1 = bounce(dot1, 0);
    const a2 = bounce(dot2, 150);
    const a3 = bounce(dot3, 300);
    a1.start(); a2.start(); a3.start();
    return () => { a1.stop(); a2.stop(); a3.stop(); };
  }, [dot1, dot2, dot3]);

  const dotStyle = { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.accent.light, opacity: 0.6 };

  return (
    <View style={{ flexDirection: 'row', gap: 4, marginTop: 4, paddingVertical: 2 }}>
      <Animated.View style={[dotStyle, { transform: [{ translateY: dot1 }] }]} />
      <Animated.View style={[dotStyle, { transform: [{ translateY: dot2 }] }]} />
      <Animated.View style={[dotStyle, { transform: [{ translateY: dot3 }] }]} />
    </View>
  );
}

function formatTimestamp(ts: number): string {
  const date = new Date(ts);
  return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
}
