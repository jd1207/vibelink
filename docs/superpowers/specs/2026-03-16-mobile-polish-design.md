# Mobile UI Polish — Design Spec

**Date:** 2026-03-16
**Branch:** ai/mobile-polish
**Scope:** SettingsSheet, claude-chat-dark theme, loading polish, streaming perf, ConnectionBadge theme fix

## Task 1 — SettingsSheet (replaces ThemePicker)

### Overview

Create `mobile/src/components/SettingsSheet.tsx` as a sectioned bottom sheet that replaces `ThemePicker.tsx`. Same props (`visible`, `onClose`, `onDisconnect`) for drop-in replacement.

### Sections

1. **Connection** — read-only row showing bridge hostname (strip `http://` prefix, show just `host:port`) + green/red connection dot from `useConnectionStore`. Shows "not connected" when `bridgeUrl` is empty. Informational only, not editable.

2. **Appearance** — collapsed by default. Shows current theme name + accent color swatch. Tap to expand the accordion within the sheet (does NOT close the whole sheet). Selecting a theme collapses just the accordion back, keeping the sheet open. Each theme option shows: accent swatch circle, theme name, checkmark if active. This differs from the old ThemePicker which closed the entire modal on selection.

3. **Disconnect** — red text button at bottom, separated by a divider. Same behavior as current ThemePicker: closes sheet, then calls `onDisconnect` after 300ms delay.

### Integration

Update `mobile/app/index.tsx`: swap `import { ThemePicker }` to `import { SettingsSheet }` and rename the JSX usage. Minimal diff — same props.

Note to orchestrator: this touches `index.tsx` which was originally assigned to another worker. The change is a single import swap + component rename, no logic changes.

### Files

- **Create:** `mobile/src/components/SettingsSheet.tsx`
- **Modify:** `mobile/app/index.tsx` (import swap only)
- **Keep:** `mobile/src/components/ThemePicker.tsx` (leave in place until integration confirms no other consumers)

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
{ key: 'claude-chat-dark', name: 'claude chat dark', accent: '#D97757' }
```

### Files

- **Modify:** `mobile/src/constants/colors.ts`

## Task 3 — Loading Polish + Streaming Performance

### Skeleton Pulse Component

Create a reusable `SkeletonPulse` component — an `Animated.View` with looping opacity pulse (0.3 → 0.7 → 0.3). Uses `useNativeDriver: true` for smooth animation regardless of JS thread load. Configurable `width`, `height`, `borderRadius`. Uses `colors.border.default` as background.

**File:** `mobile/src/components/SkeletonPulse.tsx`

### Home Screen Skeletons

Replace the current loading state (`ActivityIndicator` + "scanning sessions...") with 3 skeleton session cards matching the shape of `SessionRow` — rounded rectangle with inner lines for title, status row, and message preview.

**File:** `mobile/app/index.tsx` (user approved this worker to modify it) and `mobile/src/components/SkeletonPulse.tsx` (exports `SessionSkeleton`)

### Pull-to-Refresh

Add `RefreshControl` to the home screen's `SectionList`. Calls existing `loadSessions()`. Uses `colors.accent.primary` as tint color.

**File:** `mobile/app/index.tsx`

### Streaming Throttle (Animation Jank Fix)

**Problem:** `useStreaming.ts` creates a new message object on every `stream_event` delta. During heavy workloads (rapid tool use, long outputs), this triggers a re-render cascade through the entire message list, causing visible UI jank.

**Fix:** Throttle stream delta updates to ~15fps (~66ms) inside the existing `useMemo` in `useStreaming.ts`. Mechanism:

1. Continue processing all events into `streamBufferRef` on every trigger (no data loss)
2. Before producing a new array reference for `stream_event` deltas, check `Date.now() - lastFlushRef.current < 66` — if within throttle window, return previous `messagesRef.current` without creating new objects
3. When outside the throttle window, produce the new array with updated content and set `lastFlushRef.current = Date.now()`
4. `assistant` (final), `user`, `result`, and `system` event types always process immediately — throttling only applies to `stream_event` deltas

This keeps the `useMemo` structure intact (no restructuring to useState/useEffect), keeps `AnimatedDots` smooth (already on native driver), and prevents JS thread saturation from rapid re-renders.

**File:** `mobile/src/hooks/useStreaming.ts`

## Task 4 — ConnectionBadge Theme Fix

### Overview

Replace 4 hardcoded Tailwind color classes with `useColors()` style props.

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

## File Ownership Summary

| File | Action |
|------|--------|
| `mobile/src/components/SettingsSheet.tsx` | create |
| `mobile/src/components/SkeletonPulse.tsx` | create |
| `mobile/src/components/ConnectionBadge.tsx` | modify |
| `mobile/src/constants/colors.ts` | modify |
| `mobile/src/hooks/useStreaming.ts` | modify |
| `mobile/app/index.tsx` | modify (import swap + skeletons + pull-to-refresh) |
| `mobile/app/_layout.tsx` | no changes needed (originally planned for PermissionBanner, now descoped) |
