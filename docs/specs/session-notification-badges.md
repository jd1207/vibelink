# Session Notification Badges

**Status:** not started — requires bridge + mobile work
**Origin:** mobile-polish brainstorm (ai/mobile-polish branch, 2026-03-16)

## Problem

User is on the home screen when a permission request or new assistant reply arrives in an active session. There's no way to know without opening each session individually.

## Solution — Bridge Side

- Extend `GET /claude-sessions` response to include per-session fields:
  - `pendingPermissions: number` — count of unanswered permission requests
  - `unreadEvents: number` — count of events since the client's last-seen marker
  - `lastEventId: string` — so mobile can detect new activity since last visit
- Bridge already tracks the permission queue and event buffer per session — just surface the counts in the existing REST response
- No new endpoints needed, just extend the existing payload

## Solution — Mobile Side

- Home screen already polls `/claude-sessions` every 5s — read the new fields
- Show badge on session cards:
  - Amber dot + count for pending permissions
  - Blue dot for unread replies
- Track `lastSeenEventId` per session in Zustand (or SecureStore for persistence)
- Badge clears when user opens the session and addresses permissions / scrolls to bottom

## Why This Can't Be Mobile-Only

The WebSocket connection is per-session and only alive while the user is viewing that session. The home screen has no real-time channel to other sessions. The bridge is the only component that knows about all sessions simultaneously — the counts must come from there.

## Scope

- **Bridge worker:** extend `/claude-sessions` response shape, track counts
- **Mobile worker:** read new fields, render badges on session cards, track last-seen state
