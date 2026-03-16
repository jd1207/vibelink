# Mobile UI Polish Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish mobile app UX with a settings sheet, new dark theme, skeleton loaders, streaming performance fix, and themed ConnectionBadge.

**Architecture:** Four independent tasks touching isolated files. SettingsSheet replaces ThemePicker as a sectioned Modal. Streaming throttle restructures useStreaming from useMemo to useRef+useState with trailing-edge flush. New claude-chat-dark theme added to existing theme system. ConnectionBadge switches from hardcoded Tailwind to useColors().

**Tech Stack:** React Native, Expo, TypeScript, Zustand, NativeWind, LayoutAnimation

**Spec:** `docs/superpowers/specs/2026-03-16-mobile-polish-design.md`

**Verification:** `cd mobile && npx tsc --noEmit` (no test framework in project). Visual verification on device for UX.

---

## Chunk 1: Foundation (Theme + ConnectionBadge)

### Task 1: Add `claude-chat-dark` theme to colors.ts

**Files:**
- Modify: `mobile/src/constants/colors.ts`

- [ ] **Step 1: Add the theme object**

In `mobile/src/constants/colors.ts`, add after the `midnight` theme entry (before the closing `};` of the `themes` object):

```ts
  'claude-chat-dark': {
    mode: 'dark' as const,
    bg: { primary: '#2A2A2A', secondary: '#1F1F1E', surface: '#333330', elevated: '#3D3D39', inset: '#1F1F1E', badge: '#3D3D39' },
    text: { primary: '#ECECEA', secondary: '#D4D4D0', muted: '#A8A8A0', subtle: '#807E78', dim: '#5C5B56', onAccent: '#FFFFFF' },
    accent: { primary: '#D97757', light: '#E8A088', lighter: '#F0C4B0', dark: '#C15F3C', userBubble: '#D97757', assistantBubble: '#333330' },
    status: darkStatus, border: { default: '#4A4A44', subtle: '#3D3D39' },
    code: { text: '#D4D4D0', inline: '#E8A088', background: '#1F1F1E', lineNumber: '#5C5B56', added: '#4ADE80', removed: '#F87171', blockOverlay: 'rgba(0,0,0,0.4)', inlineOverlay: 'rgba(0,0,0,0.2)' },
    interactive: { selected: '#3D2518', hover: '#333330', successTint: 'rgba(6, 78, 59, 0.3)' },
  },
```

- [ ] **Step 2: Add themeList entry**

In `mobile/src/constants/colors.ts`, add to the `themeList` array after the midnight entry:

```ts
  { key: 'claude-chat-dark', name: 'claude chat dark', accent: '#2A2A2A' },
```

- [ ] **Step 3: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS — `ThemeKey` auto-derives from `keyof typeof themes`

- [ ] **Step 4: Commit**

```bash
git add mobile/src/constants/colors.ts
git commit -m "feat: add claude-chat-dark theme"
```

---

### Task 2: Theme ConnectionBadge

**Files:**
- Modify: `mobile/src/components/ConnectionBadge.tsx`

- [ ] **Step 1: Replace hardcoded colors with useColors()**

Replace the entire component with:

```tsx
import React from 'react';
import { View, Text } from 'react-native';
import { useConnectionStore } from '../store/connection';
import { useColors } from '../store/settings';

export function ConnectionBadge() {
  const colors = useColors();
  const isConnected = useConnectionStore((s) => s.isConnected);
  const dotColor = isConnected ? colors.status.success : colors.status.error;
  const textColor = isConnected ? colors.status.success : colors.status.error;

  return (
    <View className="flex-row items-center gap-1.5">
      <View
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: dotColor }}
      />
      <Text className="text-xs" style={{ color: textColor }}>
        {isConnected ? 'connected' : 'disconnected'}
      </Text>
    </View>
  );
}
```

Key change: removed color Tailwind classes (`bg-emerald-500`, `text-emerald-400`, `bg-red-500`, `text-red-400`), kept layout classes, applied colors via `style` prop.

- [ ] **Step 2: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ConnectionBadge.tsx
git commit -m "fix: theme ConnectionBadge with useColors()"
```

---

## Chunk 2: SettingsSheet

### Task 3: Create SettingsSheet.tsx

**Files:**
- Create: `mobile/src/components/SettingsSheet.tsx`

- [ ] **Step 1: Create the component**

Create `mobile/src/components/SettingsSheet.tsx`:

```tsx
import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, Modal, LayoutAnimation, Platform, UIManager } from 'react-native';
import { themeList } from '../constants/colors';
import { useColors, useSettingsStore } from '../store/settings';
import { useConnectionStore } from '../store/connection';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface SettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  onDisconnect: () => void;
}

export function SettingsSheet({ visible, onClose, onDisconnect }: SettingsSheetProps) {
  const colors = useColors();
  const currentTheme = useSettingsStore((s) => s.theme);
  const setTheme = useSettingsStore((s) => s.setTheme);
  const bridgeUrl = useConnectionStore((s) => s.bridgeUrl);
  const isConnected = useConnectionStore((s) => s.isConnected);
  const [themeExpanded, setThemeExpanded] = useState(false);

  // reset accordion when sheet closes
  useEffect(() => {
    if (!visible) setThemeExpanded(false);
  }, [visible]);

  const currentThemeInfo = themeList.find((t) => t.key === currentTheme);
  const hostname = bridgeUrl ? bridgeUrl.replace(/^https?:\/\//, '').replace(/\/+$/, '') : '';

  const toggleTheme = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setThemeExpanded((v) => !v);
  };

  const selectTheme = (key: typeof currentTheme) => {
    setTheme(key);
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setThemeExpanded(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View
          className="rounded-t-2xl px-6 pt-5 pb-10"
          style={{ backgroundColor: colors.bg.surface }}
        >
          {/* section: connection */}
          <Text className="text-[10px] uppercase tracking-wider mb-2" style={{ color: colors.text.subtle }}>
            connection
          </Text>
          <View className="flex-row items-center gap-2 mb-4">
            <View
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: isConnected ? colors.status.success : colors.status.error }}
            />
            <Text className="text-sm flex-1" numberOfLines={1} style={{ color: colors.text.primary }}>
              {hostname || 'not connected'}
            </Text>
          </View>

          <View className="mb-3" style={{ height: 1, backgroundColor: colors.border.default }} />

          {/* section: appearance */}
          <Text className="text-[10px] uppercase tracking-wider mb-2" style={{ color: colors.text.subtle }}>
            appearance
          </Text>
          <Pressable
            onPress={toggleTheme}
            className="flex-row items-center gap-3 py-2 active:opacity-70"
            accessibilityRole="button"
            accessibilityState={{ expanded: themeExpanded }}
          >
            <View
              style={{
                width: 28, height: 28, borderRadius: 14, backgroundColor: currentThemeInfo?.accent ?? colors.accent.primary,
                borderWidth: 1.5, borderColor: colors.text.dim,
              }}
            />
            <Text className="text-sm flex-1" style={{ color: colors.text.primary }}>
              {currentThemeInfo?.name ?? 'theme'}
            </Text>
            <Text className="text-xs" style={{ color: colors.text.dim }}>
              {themeExpanded ? 'collapse' : 'change'}
            </Text>
          </Pressable>

          {themeExpanded ? (
            <View className="ml-2 mt-1" accessibilityRole="radiogroup">
              {themeList.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => selectTheme(t.key)}
                  className="flex-row items-center gap-4 py-2.5 active:opacity-70"
                  accessibilityRole="radio"
                  accessibilityState={{ checked: currentTheme === t.key }}
                >
                  <View
                    style={{
                      width: 24, height: 24, borderRadius: 12, backgroundColor: t.accent,
                      borderWidth: currentTheme === t.key ? 2.5 : 0.5,
                      borderColor: currentTheme === t.key ? colors.text.primary : colors.text.dim,
                    }}
                  />
                  <Text className="text-sm flex-1" style={{ color: colors.text.primary }}>
                    {t.name}
                  </Text>
                  {currentTheme === t.key ? (
                    <Text style={{ color: colors.accent.primary, fontSize: 14 }}>✓</Text>
                  ) : null}
                </Pressable>
              ))}
            </View>
          ) : null}

          <View className="my-3" style={{ height: 1, backgroundColor: colors.border.default }} />

          {/* section: disconnect */}
          <Pressable
            onPress={() => { onClose(); setTimeout(onDisconnect, 300); }}
            className="py-3 active:opacity-70"
            accessibilityLabel="disconnect from bridge"
          >
            <Text className="text-sm" style={{ color: colors.status.error }}>disconnect</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}
```

- [ ] **Step 2: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/SettingsSheet.tsx
git commit -m "feat: create SettingsSheet to replace ThemePicker"
```

---

### Task 4: Swap ThemePicker → SettingsSheet in index.tsx and delete ThemePicker

**Files:**
- Modify: `mobile/app/index.tsx`
- Delete: `mobile/src/components/ThemePicker.tsx`

- [ ] **Step 1: Update import in index.tsx**

In `mobile/app/index.tsx`, change line 18:

```ts
// old
import { ThemePicker } from '../src/components/ThemePicker';
// new
import { SettingsSheet } from '../src/components/SettingsSheet';
```

- [ ] **Step 2: Update JSX usage in index.tsx**

In `mobile/app/index.tsx`, change the `<ThemePicker .../>` usage (line 415):

```tsx
// old
<ThemePicker visible={menuOpen} onClose={() => setMenuOpen(false)} onDisconnect={handleDisconnect} />
// new
<SettingsSheet visible={menuOpen} onClose={() => setMenuOpen(false)} onDisconnect={handleDisconnect} />
```

- [ ] **Step 3: Delete ThemePicker.tsx**

```bash
git rm mobile/src/components/ThemePicker.tsx
```

- [ ] **Step 4: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS — no other consumers of ThemePicker

- [ ] **Step 5: Commit**

```bash
git add mobile/app/index.tsx
git commit -m "refactor: swap ThemePicker for SettingsSheet in home screen"
```

---

## Chunk 3: Loading Polish

### Task 5: Create SkeletonPulse and SessionSkeleton components

**Files:**
- Create: `mobile/src/components/SkeletonPulse.tsx`

- [ ] **Step 1: Create the component**

Create `mobile/src/components/SkeletonPulse.tsx`:

```tsx
import React, { useEffect, useRef } from 'react';
import { View, Animated } from 'react-native';
import { useColors } from '../store/settings';

interface SkeletonPulseProps {
  width: number | string;
  height: number;
  borderRadius?: number;
}

export function SkeletonPulse({ width, height, borderRadius = 4 }: SkeletonPulseProps) {
  const colors = useColors();
  const opacity = useRef(new Animated.Value(0.3)).current;
  const animRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.7, duration: 800, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.3, duration: 800, useNativeDriver: true }),
      ])
    );
    animRef.current = anim;
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
```

- [ ] **Step 2: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/SkeletonPulse.tsx
git commit -m "feat: add SkeletonPulse and SessionSkeleton components"
```

---

### Task 6: Replace ActivityIndicator loading state with skeletons in index.tsx

**Files:**
- Modify: `mobile/app/index.tsx`

- [ ] **Step 1: Add import**

In `mobile/app/index.tsx`, add import:

```ts
import { SessionSkeleton } from '../src/components/SkeletonPulse';
```

- [ ] **Step 2: Replace loading state JSX**

In `mobile/app/index.tsx`, replace the loading block (around lines 337-343):

```tsx
// old
{loading && (
  <View className="flex-1 items-center justify-center">
    <ActivityIndicator color={colors.accent.primary} />
    <Text className="mt-3 text-sm" style={{ color: colors.text.subtle }}>
      scanning sessions...
    </Text>
  </View>
)}

// new
{loading && (
  <View className="flex-1 pt-4">
    <SessionSkeleton />
    <SessionSkeleton />
    <SessionSkeleton />
  </View>
)}
```

- [ ] **Step 3: Remove unused ActivityIndicator import**

Remove `ActivityIndicator` from the import on line 7 — it has no remaining usages after the skeleton swap.

- [ ] **Step 4: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mobile/app/index.tsx
git commit -m "feat: replace loading spinner with skeleton cards"
```

---

## Chunk 4: Streaming Performance

### Task 7: Restructure useStreaming with throttled flush

**Files:**
- Modify: `mobile/src/hooks/useStreaming.ts`

- [ ] **Step 1: Rewrite useStreaming.ts**

Replace the contents of `mobile/src/hooks/useStreaming.ts` with:

```ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { useMessageStore, ClaudeEvent, ChatMessage } from '../store/messages';
import { parseContentBlocks } from './parseContentBlocks';

const THROTTLE_MS = 66;
let nextId = 0;

export function useStreaming(sessionId: string): ChatMessage[] {
  const eventsLength = useMessageStore((s) => s.events[sessionId]?.length ?? 0);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const resultRef = useRef<ChatMessage[]>([]);
  const lastProcessedRef = useRef(0);
  const streamBufferRef = useRef('');
  const lastFlushRef = useRef(0);
  const pendingFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // reset all state when session changes
  useEffect(() => {
    resultRef.current = [];
    lastProcessedRef.current = 0;
    streamBufferRef.current = '';
    lastFlushRef.current = 0;
    if (pendingFlushRef.current) clearTimeout(pendingFlushRef.current);
    pendingFlushRef.current = null;
    setMessages([]);
  }, [sessionId]);

  const flush = useCallback(() => {
    if (pendingFlushRef.current) {
      clearTimeout(pendingFlushRef.current);
      pendingFlushRef.current = null;
    }
    lastFlushRef.current = Date.now();
    setMessages([...resultRef.current]);
  }, []);

  useEffect(() => {
    if (eventsLength === lastProcessedRef.current) return;

    const events = useMessageStore.getState().events[sessionId] ?? [];
    const newEvents = events.slice(lastProcessedRef.current);
    let hasNonStreamEvent = false;

    for (const raw of newEvents) {
      const evt = raw as ClaudeEvent;
      if (evt.type !== 'claude_event' || !evt.event) continue;
      const inner = evt.event;

      if (inner.type !== 'stream_event') {
        hasNonStreamEvent = true;
      }
      processEvent(inner, resultRef.current, streamBufferRef);
    }

    lastProcessedRef.current = events.length;

    if (hasNonStreamEvent) {
      flush();
    } else {
      const elapsed = Date.now() - lastFlushRef.current;
      if (elapsed >= THROTTLE_MS) {
        flush();
      } else if (!pendingFlushRef.current) {
        pendingFlushRef.current = setTimeout(flush, THROTTLE_MS - elapsed);
      }
    }
  }, [eventsLength, sessionId, flush]);

  // cleanup pending flush on unmount
  useEffect(() => {
    return () => {
      if (pendingFlushRef.current) {
        clearTimeout(pendingFlushRef.current);
      }
    };
  }, []);

  return messages;
}

function processEvent(
  inner: Record<string, unknown>,
  result: ChatMessage[],
  streamBufferRef: React.MutableRefObject<string>,
) {
  switch (inner.type) {
    case 'system':
      break;

    case 'stream_event': {
      const delta = inner as { type: string; event?: { type?: string; delta?: { text?: string } } };
      const textDelta = delta.event?.delta?.text;
      if (typeof textDelta !== 'string') break;

      streamBufferRef.current += textDelta;
      const lastMsg = result[result.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        result[result.length - 1] = { ...lastMsg, content: streamBufferRef.current };
      } else {
        result.push({
          id: `stream-${nextId++}`,
          role: 'assistant',
          content: streamBufferRef.current,
          timestamp: Date.now(),
          isStreaming: true,
        });
      }
      break;
    }

    case 'assistant': {
      const msg = inner as { type: string; message?: { content?: unknown[] } };
      const blocks = parseContentBlocks(msg.message?.content);
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');

      const finalText = streamBufferRef.current || text;
      streamBufferRef.current = '';

      const lastMsg = result[result.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        result[result.length - 1] = { ...lastMsg, content: finalText, contentBlocks: blocks, isStreaming: false };
      } else {
        result.push({
          id: `asst-${nextId++}`,
          role: 'assistant',
          content: text,
          contentBlocks: blocks,
          timestamp: Date.now(),
          isStreaming: false,
        });
      }
      break;
    }

    case 'user': {
      const userEvt = inner as { type: string; message?: { content?: unknown[] | string } };
      let content = '';
      let blocks: ReturnType<typeof parseContentBlocks> | undefined;
      if (typeof userEvt.message?.content === 'string') {
        content = userEvt.message.content;
      } else if (Array.isArray(userEvt.message?.content)) {
        content = userEvt.message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text ?? '')
          .join('');
        const hasToolResults = userEvt.message.content.some((b: any) => b.type === 'tool_result');
        if (hasToolResults) {
          blocks = parseContentBlocks(userEvt.message.content as unknown[]);
          result.push({
            id: `toolres-${nextId++}`,
            role: 'user',
            content: '',
            contentBlocks: blocks,
            timestamp: Date.now(),
          });
          break;
        }
      }
      if (!content || isSystemInjected(content)) break;

      result.push({
        id: `user-${nextId++}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      });
      break;
    }

    case 'result': {
      const lastMsg = result[result.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        result[result.length - 1] = { ...lastMsg, isStreaming: false };
      }
      streamBufferRef.current = '';
      break;
    }
  }
}

function isSystemInjected(text: string): boolean {
  if (text.startsWith('<command-name>')) return true;
  if (text.startsWith('<system-reminder>')) return true;
  if (text.startsWith('<EXTREMELY')) return true;
  if (/^---\s*\nname:/.test(text)) return true;
  if (text.length > 500) {
    const headerCount = (text.match(/^#{1,3}\s/gm) || []).length;
    if (headerCount >= 3) return true;
  }
  return false;
}
```

Key changes from original:
- `useMemo` → `useRef` + `useState` + `useEffect`
- Throttle gate: `stream_event` deltas only flush at ~15fps, with trailing-edge `setTimeout`
- Non-stream events (`assistant`, `user`, `result`, `system`) always flush immediately
- Module-scoped `nextId` counter replaces `Date.now()` for IDs
- Cleanup on unmount

- [ ] **Step 2: Type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add mobile/src/hooks/useStreaming.ts
git commit -m "perf: throttle streaming updates to ~15fps with trailing-edge flush"
```

---

## Chunk 5: Final Verification

### Task 8: Full type check and cleanup

- [ ] **Step 1: Run full type check**

Run: `cd mobile && npx tsc --noEmit`
Expected: PASS with zero errors

- [ ] **Step 2: Verify no stale imports**

Check that no file still imports ThemePicker:

```bash
grep -r "ThemePicker" mobile/src mobile/app --include="*.ts" --include="*.tsx"
```

Expected: zero results

- [ ] **Step 3: Verify file inventory matches spec**

Files created: `SettingsSheet.tsx`, `SkeletonPulse.tsx`
Files modified: `ConnectionBadge.tsx`, `colors.ts`, `useStreaming.ts`, `index.tsx`
Files deleted: `ThemePicker.tsx`

- [ ] **Step 4: Final commit if any cleanup needed**

Only if previous steps revealed issues to fix.
