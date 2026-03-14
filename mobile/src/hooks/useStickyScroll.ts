import { useRef, useState, useCallback } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent } from 'react-native';

// threshold in points to consider "at bottom" (inverted list: top = bottom)
const BOTTOM_THRESHOLD = 50;

export function useStickyScroll<T>() {
  const scrollRef = useRef<any>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);

  const onScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    // inverted list: contentOffset.y near 0 means at bottom (newest)
    // but also check if content is smaller than viewport (always at bottom)
    const atBottom = contentOffset.y <= BOTTOM_THRESHOLD || contentSize.height <= layoutMeasurement.height;
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
