import React, { useRef } from 'react';
import { View, Text, Pressable, Animated, PanResponder } from 'react-native';
import type { SessionType } from '../store/sessions';
import type { DisplaySession } from '../types/session-list';
import { formatTime } from '../types/session-list';
import { useColors } from '../store/settings';

const SWIPE_THRESHOLD = -80;

function StatusIndicator({ sessionType, accentColor }: { sessionType: SessionType; accentColor: string }) {
  if (sessionType === 'terminal') {
    return (
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: '#4ade80' }}
      />
    );
  }
  if (sessionType === 'vibelink') {
    return (
      <View
        style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: accentColor }}
      />
    );
  }
  return (
    <View style={{ width: 8, height: 2, backgroundColor: '#475569', borderRadius: 1 }} />
  );
}

function TypeBadge({ sessionType, colors }: { sessionType: SessionType; colors: any }) {
  if (sessionType === 'terminal') {
    return (
      <View
        className="rounded px-1.5 py-0.5"
        style={{ backgroundColor: 'rgba(74, 222, 128, 0.15)' }}
      >
        <Text style={{ color: '#4ade80', fontSize: 11 }}>terminal</Text>
      </View>
    );
  }
  if (sessionType === 'vibelink') {
    return (
      <View
        className="rounded px-1.5 py-0.5"
        style={{ backgroundColor: colors.accent.primary + '26' }}
      >
        <Text style={{ color: colors.accent.primary, fontSize: 11 }}>vibelink</Text>
      </View>
    );
  }
  return (
    <Text style={{ color: colors.text.dim, fontSize: 11 }}>resume</Text>
  );
}

interface SessionRowProps {
  item: DisplaySession;
  onPress: () => void;
  onSwipeAction: () => void;
  swipeLabel: string;
  dimmed?: boolean;
}

export function SessionRow({ item, onPress, onSwipeAction, swipeLabel, dimmed }: SessionRowProps) {
  const colors = useColors();
  const translateX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) =>
        Math.abs(gesture.dx) > 10 && Math.abs(gesture.dx) > Math.abs(gesture.dy),
      onPanResponderMove: (_, gesture) => {
        if (gesture.dx < 0) {
          translateX.setValue(Math.max(gesture.dx, -120));
        }
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.dx < SWIPE_THRESHOLD) {
          onSwipeAction();
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        } else {
          Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  const stateLabel =
    item.sessionType === 'terminal'
      ? 'active terminal'
      : item.sessionType === 'vibelink'
        ? 'active vibelink'
        : 'idle';

  const accessLabel = [
    item.projectName,
    stateLabel,
    item.lastMessage ?? '',
    formatTime(item.lastActivity),
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View className="mx-4 mb-3" style={dimmed ? { opacity: 0.7 } : undefined}>
      <View className="absolute inset-0 bg-red-600 rounded-xl flex-row items-center justify-end px-5">
        <Text className="text-white font-semibold text-sm">{swipeLabel}</Text>
      </View>

      <Animated.View style={{ transform: [{ translateX }] }} {...panResponder.panHandlers}>
        <Pressable
          onPress={onPress}
          className="rounded-xl p-4 active:opacity-70 border"
          style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
          accessibilityLabel={accessLabel}
        >
          <View className="flex-row items-center justify-between mb-1">
            <View className="flex-row items-center gap-2 flex-1">
              <StatusIndicator sessionType={item.sessionType} accentColor={colors.accent.primary} />
              <Text
                className="font-medium text-base flex-1"
                numberOfLines={1}
                style={{ color: colors.text.primary }}
              >
                {item.projectName}
              </Text>
            </View>
            <Text className="text-xs ml-2" style={{ color: colors.text.muted }}>
              {formatTime(item.lastActivity)}
            </Text>
          </View>

          <View className="flex-row items-center gap-1.5 mb-2 ml-5">
            <TypeBadge sessionType={item.sessionType} colors={colors} />
            {item.gitBranch ? (
              <View
                className="rounded px-1.5 py-0.5"
                style={{ backgroundColor: colors.bg.secondary }}
              >
                <Text
                  className="text-xs"
                  numberOfLines={1}
                  style={{ color: colors.text.muted }}
                >
                  {item.gitBranch}
                </Text>
              </View>
            ) : null}
          </View>

          {item.lastMessage ? (
            <Text
              className="text-sm ml-5"
              numberOfLines={1}
              style={{ color: colors.text.muted }}
            >
              {item.lastMessage}
            </Text>
          ) : (
            <Text
              className="text-xs ml-5"
              numberOfLines={1}
              style={{ color: colors.text.dim }}
            >
              {item.projectPath}
            </Text>
          )}
        </Pressable>
      </Animated.View>
    </View>
  );
}
