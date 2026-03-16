# Mobile UI Polish — Design Spec

**Date:** 2026-03-16
**Branch:** ai/mobile-polish
**Scope:** SettingsSheet, claude-chat-dark theme, loading polish, streaming perf, ConnectionBadge theme fix

## Task 1 — SettingsSheet (replaces ThemePicker)

### Overview

Create `mobile/src/components/SettingsSheet.tsx` as a sectioned bottom sheet that replaces `ThemePicker.tsx`. Same props (`visible`, `onClose`, `onDisconnect`) for drop-in replacement. Uses the same `Modal` + backdrop `Pressable` pattern as the existing `ThemePicker` — no third-party bottom sheet library.

### Sections

1. **Connection** — read-only row showing bridge hostname (strip `http://` prefix, show just `host:port`) + green/red connection dot from `useConnectionStore`. Shows "not connected" when `bridgeUrl` is empty. Informational only, not editable.

2. **Appearance** — collapsed by default. Shows current theme name + accent color swatch. Tap to expand the accordion within the sheet (does NOT close the whole sheet). Animate with `LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)` before toggling — no manual height measurement needed. Selecting a theme collapses just the accordion back, keeping the sheet open. Each theme option shows: accent swatch circle, theme name, checkmark if active. Accordion resets to collapsed state when the sheet closes and reopens.

3. **Disconnect** — red text button at bottom, separated by a divider. Same behavior as current ThemePicker: closes sheet, then calls `onDisconnect` after 300ms delay.

### Accessibility

- `accessibilityRole="button"` on the Appearance accordion toggle
- `accessibilityState={{ expanded: isOpen }}` on the accordion
- `accessibilityLabel="disconnect from bridge"` on the disconnect button
- `accessibilityRole="radiogroup"` on the theme list, `accessibilityRole="radio"` + `accessibilityState={{ checked }}` on each theme option

### Integration

Update `mobile/app/index.tsx`: swap `import { ThemePicker }` to `import { SettingsSheet }` and rename the JSX usage. Minimal diff — same props.

Note to orchestrator: this touches `index.tsx` which was originally assigned to another worker. The change is a single import swap + component rename, no logic changes.

### Files

- **Create:** `mobile/src/components/SettingsSheet.tsx`
- **Modify:** `mobile/app/index.tsx` (import swap + skeleton loading state)
- **Delete:** `mobile/src/components/ThemePicker.tsx` (only consumer is `index.tsx`, confirmed by grep)

## Task 2 — New `claude-chat-dark` Theme

### Overview

Add a 5th theme to `mobile/src/constants/colors.ts` that matches Claude's web UI dark mode — the dark complement to the existing `claude-chat` light theme.

### Palette

```
claude-chat-dark:
  mode: 'dark'
  bg.primary:     #2A2A2A   (warm charcoal)
  bg.secondary:   #1F1F1E   (deeper warm)
  bg.surface:     #333330   (slightly lighter warm)
  bg.elevated:    #3D3D39   (card/elevated surfaces)
  bg.inset:       #1F1F1E   (inset areas)
  bg.badge:       #3D3D39   (badge background)
  text.primary:   #ECECEA   (cream/sandy white)
  text.secondary: #D4D4D0   (warm light gray)
  text.muted:     #A8A8A0   (warm mid gray)
  text.subtle:    #807E78   (warm dim)
  text.dim:       #5C5B56   (warm faint)
  text.onAccent:  #FFFFFF
  accent.primary:     #D97757   (terracotta — same as claude-chat light)
  accent.light:       #E8A088
  accent.lighter:     #F0C4B0
  accent.dark:        #C15F3C
  accent.userBubble:  #D97757
  accent.assistantBubble: #333330
  status: darkStatus (shared)
  border.default: #4A4A44   (warm border)
  border.subtle:  #3D3D39
  code.text:       #D4D4D0
  code.inline:     #E8A088
  code.background: #1F1F1E
  code.lineNumber: #5C5B56
  code.added:      #4ADE80
  code.removed:    #F87171
  code.blockOverlay:  rgba(0,0,0,0.4)
  code.inlineOverlay: rgba(0,0,0,0.2)
  interactive.selected:    #3D2518
  interactive.hover:       #333330
  interactive.successTint: rgba(6, 78, 59, 0.3)
```

### themeList entry

```ts
{ key: 'claude-chat-dark', name: 'claude chat dark', accent: '#2A2A2A' }
```

Note: swatch uses `bg.primary` (#2A2A2A) instead of `accent.primary` to visually distinguish from `claude-code` which also uses terracotta. The warm charcoal swatch with a terracotta border (when selected) communicates "dark claude chat" clearly.

### Files

- **Modify:** `mobile/src/constants/colors.ts`

## Task 3 — Loading Polish + Streaming Performance

### Skeleton Pulse Component

Create a reusable `SkeletonPulse` component — an `Animated.View` with looping opacity pulse (0.3 → 0.7 → 0.3). Uses `useNativeDriver: true` for smooth animation regardless of JS thread load. Configurable `width`, `height`, `borderRadius`. Uses `colors.border.default` as background. Store the `Animated.CompositeAnimation` ref and call `.stop()` in `useEffect` cleanup to prevent warnings on fast unmount.

**File:** `mobile/src/components/SkeletonPulse.tsx`

### Home Screen Skeletons

Replace the current loading state (`ActivityIndicator` + "scanning sessions...") with 3 skeleton session cards matching the shape of `SessionRow` — rounded rectangle with inner lines for title, status row, and message preview. Always render exactly 3 skeleton cards regardless of screen size — this is a brief loading state, not a permanent placeholder. Export `SessionSkeleton` from `SkeletonPulse.tsx`.

**File:** `mobile/app/index.tsx` and `mobile/src/components/SkeletonPulse.tsx`

### Streaming Throttle (Animation Jank Fix)

**Problem:** `useStreaming.ts` creates a new message object on every `stream_event` delta. During heavy workloads (rapid tool use, long outputs), this triggers a re-render cascade through the entire message list, causing visible UI jank.

**Fix:** Restructure from `useMemo` to `useRef` + `useState` with an explicit flush timer. Mechanism:

1. Replace `useMemo` with a `useEffect` that watches `eventsLength`
2. On each trigger, process all new events into `streamBufferRef` and the internal `resultRef` array (same `processEvent` logic)
3. For `stream_event` deltas: check if within throttle window (66ms). If so, schedule a trailing-edge flush via `setTimeout(flush, 66)` stored in `pendingFlushRef`. If outside window, flush immediately
4. `flush` sets `messagesState` (the `useState` value) to the current `resultRef` snapshot and updates `lastFlushRef.current = Date.now()`. Clear any pending timeout
5. `assistant`, `user`, `result`, and `system` events always flush immediately — throttling only applies to `stream_event` deltas
6. Cleanup: clear `pendingFlushRef` timeout on unmount
7. Use an incrementing module-scoped counter for message IDs (`let nextId = 0; id: \`stream-${nextId++}\``) instead of `Date.now()` to prevent collision under throttle

The trailing-edge flush guarantees that if Claude pauses mid-stream, the latest buffered content renders within 66ms of the last delta — no stale text during pauses.

**File:** `mobile/src/hooks/useStreaming.ts`

## Task 4 — ConnectionBadge Theme Fix

### Overview

Replace 4 hardcoded Tailwind color classes with `useColors()` style props. Remove color classes from `className`, keep layout classes only (`text-xs`, `flex-row`, `items-center`, `gap-1.5`, `w-2`, `h-2`, `rounded-full`). Apply all colors via `style` prop to avoid NativeWind class/style conflicts.

### Mapping

| Hardcoded | Themed |
|-----------|--------|
| `bg-emerald-500` | `colors.status.success` |
| `text-emerald-400` | `colors.status.success` |
| `bg-red-500` | `colors.status.error` |
| `text-red-400` | `colors.status.error` |

Colors remain green/red (universal connected/disconnected signal) but are adjusted per theme for readability (e.g. darker variants on light backgrounds).

### File

- **Modify:** `mobile/src/components/ConnectionBadge.tsx`

## Out of Scope

- **Session notification badges** — requires bridge-side changes. Specced separately at `docs/specs/session-notification-badges.md`.
- **PermissionBanner on home screen** — dependent on session notification badges.
- **Pull-to-refresh** — the home screen already auto-refreshes every 5s. Not needed.

## File Ownership Summary

| File | Action |
|------|--------|
| `mobile/src/components/SettingsSheet.tsx` | create |
| `mobile/src/components/SkeletonPulse.tsx` | create |
| `mobile/src/components/ThemePicker.tsx` | delete |
| `mobile/src/components/ConnectionBadge.tsx` | modify |
| `mobile/src/constants/colors.ts` | modify |
| `mobile/src/hooks/useStreaming.ts` | modify |
| `mobile/app/index.tsx` | modify (import swap + skeleton loading state) |
