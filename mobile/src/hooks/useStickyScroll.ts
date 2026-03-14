import { useRef, useState, useCallback } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';
import type { FlashListRef } from '@shopify/flash-list';

// threshold in points to consider "at bottom" (inverted list: top = bottom)
const BOTTOM_THRESHOLD = 50;

export function useStickyScroll<T>() {
  const scrollRef = useRef<FlashListRef<T>>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset } = event.nativeEvent;
    // inverted list: offset 0 means at the bottom (newest messages)
    const atBottom = contentOffset.y <= BOTTOM_THRESHOLD;
    setIsAtBottom(atBottom);
  }, []);

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollToOffset({ offset: 0, animated: true });
    setIsAtBottom(true);
  }, []);

  return {
    scrollRef,
    onScroll,
    isAtBottom,
    scrollToBottom,
    shouldAutoScroll: isAtBottom,
  };
}
