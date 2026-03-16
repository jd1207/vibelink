import React, { useEffect, useRef } from 'react';
import { View, Animated, DimensionValue } from 'react-native';
import { useColors } from '../store/settings';

interface SkeletonPulseProps {
  width: DimensionValue;
  height: number;
  borderRadius?: number;
}

export function SkeletonPulse({ width, height, borderRadius = 4 }: SkeletonPulseProps) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => { anim.stop(); };
  }, [opacity]);

  return (
    <Animated.View
      style={{
        width, height, borderRadius, opacity,
        backgroundColor: colors.border.default,
      }}
    />
  );
}

export function SessionSkeleton() {
  const colors = useColors();
  return (
    <View
      className="mx-4 mb-3 rounded-xl p-4 border"
      style={{ backgroundColor: colors.bg.surface, borderColor: colors.border.default }}
    >
      <View className="flex-row items-center justify-between mb-2">
        <SkeletonPulse width={140} height={16} borderRadius={8} />
        <SkeletonPulse width={50} height={12} borderRadius={6} />
      </View>
      <View className="flex-row items-center gap-2 mb-3">
        <SkeletonPulse width={60} height={12} borderRadius={6} />
        <SkeletonPulse width={45} height={12} borderRadius={6} />
      </View>
      <SkeletonPulse width="80%" height={14} borderRadius={7} />
    </View>
  );
}
