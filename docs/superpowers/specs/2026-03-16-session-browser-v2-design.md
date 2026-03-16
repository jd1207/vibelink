# Session Browser v2 — Design Spec

## Problem

The current session list is confusing:
- Terminal sessions are visible but not interactable from the phone
- Phone sessions show "ended" after one exchange even though they're resumable
- A graveyard of dead sessions piles up with no way to clean them
- Starting a session in the terminal vs the phone creates fragmented, disconnected experiences
- Resuming a conversation requires creating a new session — breaking continuity

## Goal

One unified session experience. Start anywhere (terminal or phone), continue anywhere. Every conversation is always accessible. No graveyard. Clean UX with three clear states.

## Constraints (from research)

- Claude CLI has no IPC/socket/API for external tools to inject messages into a running interactive process
- The only shared state between terminal and phone is the JSONL session file at `~/.claude/projects/<dir>/<sessionId>.jsonl`
- `--resume` always spawns a new process (reads JSONL history, no connection to original process)
- JSONL is written after complete messages, not during token streaming
- `TIOCSTI` (PTY keystroke injection) is disabled on Linux 6.2+ kernels
- Every competitor (claude.ai/code remote-control, Happy Coder, Claude Relay) spawns new processes — none attach to existing terminal sessions
- Claude CLI appends to the JSONL file in place (not atomic rename) — verified by inspecting the append-only read pattern in `session-scanner.ts`

## Design

### Session States

Every session is in exactly one of three states:

| State | Badge | Indicator | Where it lives | Tap action |
|-------|-------|-----------|---------------|------------|
| **terminal** | green "terminal" | green dot with glow | Active list | Watch mode (read-only + take-over banner) |
| **vibelink** | blue "vibelink" | blue dot with glow | Active list | Chat mode (full control, auto-resumes) |
| **idle** | none | gray dot, no glow | "Other sessions" (collapsed) | Tap to resume as vibelink |

A vibelink session stays vibelink (active, blue) even after Claude's process exits. It only becomes idle when the user explicitly taps "end."

A terminal session becomes idle when the terminal Claude process exits (PID dies) — detected either during the 5-second session list poll, or by the JSONL watcher's PID health check while actively watching (see below).

### Session List

**Active area (top):** All terminal + vibelink sessions, sorted by last activity descending, interleaved (not grouped by type).

Each row shows:
- Status dot (green/blue with glow)
- Project name (or `--name` if Claude was started with one)
- Last message preview (truncated)
- Relative time ("2m ago")
- Badges: type (terminal/vibelink), model (opus/sonnet), git branch
- "end" button (right side)

**Other sessions (collapsible, collapsed by default):** Idle sessions sorted by last activity. Each row shows:
- Gray dot (no glow)
- Project name, last message preview, relative time
- "delete" button (right side) — permanently deletes the JSONL file, conversation cannot be recovered
- Slightly dimmed (opacity ~0.7)
- Tapping a row resumes it as a vibelink session (moves to active area)

**Polling:** Refresh session list every 5 seconds (unchanged from current).

### JSONL File Watcher

New bridge component that enables watching terminal sessions from the phone.

**WebSocket routing:** When the phone taps a terminal session, the bridge creates a lightweight "watch session" — a bridge session with an EventBuffer but no Claude subprocess. The phone connects to `/ws/<watchSessionId>` using the standard WebSocket path. This reuses the existing EventBuffer, `broadcastToSession`, and reconnect infrastructure. The watch session is cleaned up when the phone disconnects or navigates away.

**JSONL path resolution:** The bridge receives a `claudeSessionId` and must find the corresponding JSONL file. It scans `~/.claude/projects/*/` directories for a file named `<claudeSessionId>.jsonl` — the same scan pattern used by `readSessionHistory()` in `session-scanner.ts`. If the file is not found, the bridge responds with a `watch_error` event.

**Lifecycle:**
1. Phone taps a terminal session → sends `watch_session` with `claudeSessionId`
2. Bridge creates a watch session (no subprocess), returns `sessionId` and `wsUrl`
3. Phone connects to the watch session's WebSocket
4. Bridge reads the tail of the JSONL (last 65KB), parses recent messages, pushes to phone as `claude_event` messages via the watch session's EventBuffer
5. Bridge starts `fs.watch()` on the JSONL file
6. On file change: bridge reads new bytes from the last-known file offset, parses complete JSONL lines, pushes new events as `claude_event` messages
7. After each file change, bridge also checks `isPidAlive()` for the terminal PID. If the PID is dead, bridge emits `watch_ended` with reason `process_exited`
8. Bridge also polls PID liveness every 2 seconds while watching (catches cases where the process exits without a final JSONL write)
9. When phone disconnects or navigates back to list, bridge stops the watcher and removes the watch session

**PID lookup:** The bridge finds the terminal PID by scanning `~/.claude/sessions/*.json` files for the entry whose `sessionId` field matches the `claudeSessionId`. This reuses the existing `loadActivePids()` function from `session-scanner.ts`.

**Important limitation:** JSONL is written after complete messages, not during streaming. The phone sees complete turns (user message → full assistant response), not token-by-token streaming. This is acceptable for v1 — the UX is "watching a conversation unfold" not "watching Claude think."

**fs.watch reliability:** This assumes Claude CLI appends to the JSONL file in place (not atomic rename). If the write strategy changes in a future Claude version, the watcher may need `fs.watchFile()` (polling) as a fallback.

**Implementation:** New file `bridge/src/jsonl-watcher.ts` — a class that wraps `fs.watch()`, tracks file offset, reads incremental bytes, parses JSONL lines, checks PID liveness, and emits structured events.

### Watch Mode (Terminal Session Detail)

When the user taps a terminal session:

- **Same chat UI** as vibelink sessions — messages, tool calls, code blocks render identically
- **No input bar** — the bottom of the screen shows a sticky banner instead
- **Banner:** "Live from terminal" on the left, "Take Over" button on the right
- Messages appear as the JSONL updates (complete turns, not streaming)
- Workspace tab available if applicable
- Events use the same `claude_event` type as vibelink sessions (no separate `watch_event` type). The mobile message store and rendering pipeline handle them identically.

**Session-ended-while-watching:** If the terminal Claude process exits while the user is in watch mode (detected by the watcher's PID health check):
- Bridge sends `watch_ended` with reason `process_exited`
- Banner transitions from "Live from terminal — Take Over" to "Session ended — Resume"
- Tapping "Resume" creates a vibelink session with `--resume`, same as take-over but without killing a process
- This handles the case where the terminal user naturally exits Claude

### Take-Over Flow

1. User taps "Take Over" on the watch mode banner
2. Confirmation dialog: "This will end the terminal session. Continue?"
3. On confirm: phone sends `take_over` message to bridge
4. Bridge looks up the terminal PID by scanning `~/.claude/sessions/*.json` for the entry matching the `claudeSessionId`
5. Bridge sends `SIGTERM` to the PID
6. Bridge waits up to 5 seconds for process exit, then `SIGKILL` if needed
7. Bridge stops the JSONL watcher and removes the watch session
8. Bridge creates a new vibelink session with `--resume <sessionId>` and `skipPermissions` inherited
9. Hydrates the event buffer with recent conversation history
10. Bridge sends `take_over_complete` with the new `sessionId` and `wsUrl`
11. Phone closes the watch session WebSocket, opens a new WebSocket to the vibelink session's `wsUrl`
12. Phone resets its message store for the new session ID — the hydrated history provides conversation continuity
13. Banner disappears, input bar appears, badge changes from green "terminal" to blue "vibelink"
14. User can now send messages

**Terminal side:** Claude receives SIGTERM and exits normally. The terminal user sees their shell prompt. If they run `claude --continue` later, they get the full conversation including everything that happened on the phone (it's all in the same JSONL).

### Session Continuity (Auto-Resume)

When a vibelink session's Claude process has exited and the user sends a new message:

1. The WebSocket `user_message` handler in `server.ts` checks `session.process.alive`
2. If dead, handler calls a new `SessionManager.respawn(sessionId)` method which:
   - Spawns new Claude with `--resume <resumeSessionId>` using the session ID from the last `result` event
   - Replaces the dead process in the session object
   - Hydrates buffer with recent history from JSONL
3. Once the new process is ready, handler sends the user's message to it
4. From the phone: seamless — user typed, Claude responded

This means "end" on a vibelink session is soft — the session moves to idle, but the conversation is preserved. Tapping it in "other sessions" or even creating a new session with the same resume ID brings it back.

### "End" Action

**End on terminal session:**
- Bridge looks up PID via `loadActivePids()` scan and sends SIGTERM
- Session transitions to idle on the next poll (PID is dead, scanner marks it not alive)
- No bridge session involved — just kills the terminal process

**End on vibelink session:**
- Bridge kills the Claude process and removes the session from `SessionManager`
- The JSONL file remains on disk at `~/.claude/projects/<dir>/<sessionId>.jsonl`
- Session transitions to idle — now only visible via `/claude-sessions` (the JSONL scanner)
- This is the same as the current `DELETE /sessions/:id` behavior but the JSONL is preserved (current DELETE already preserves JSONL; only `DELETE /claude-sessions/:sessionId` removes the file)

Both actions have the same UX: session disappears from active, appears in "other."

**Note:** `SessionManager` does not need an "idle" state. Ending a vibelink session removes it from SessionManager entirely. Idle sessions exist only as JSONL files on disk, discovered by the session scanner via `/claude-sessions`.

### Session Identity

**Same project, multiple sessions:** When two sessions exist in the same project directory, they're differentiated by:
- Last message preview (primary differentiator)
- Relative time
- Git branch (if different)
- Claude's `--name` flag (if set) — shown instead of project name

**Cross-device continuity:**
- Terminal → Phone: automatic (phone sees terminal sessions via session scanner)
- Phone → Terminal: user runs `claude --continue` in the project directory (picks up most recent session, including phone conversations)

### WebSocket Protocol Changes

New message types for watching:

**Client → Bridge:**
```json
{"type": "watch_session", "claudeSessionId": "<cli-session-id>"}
```
Tells the bridge to create a watch session and start the JSONL watcher. Bridge responds with `watch_started`.

```json
{"type": "stop_watching"}
```
Tells the bridge to stop the JSONL watcher and clean up the watch session.

```json
{"type": "take_over", "claudeSessionId": "<cli-session-id>"}
```
Triggers the take-over flow (kill terminal process, resume as vibelink).

**Bridge → Client:**
```json
{"type": "watch_started", "sessionId": "<watch-session-id>", "wsUrl": "ws://..."}
```
Watch session created. Phone should connect to this WebSocket URL to receive events.

```json
{"type": "claude_event", "event": {...}, "eventId": 1}
```
A parsed JSONL event from the terminal session. Same type as live subprocess events — the mobile rendering pipeline handles them identically.

```json
{"type": "watch_ended", "reason": "process_exited" | "error"}
```
The terminal session ended (PID died) or the watcher encountered an error.

```json
{"type": "watch_error", "message": "JSONL file not found"}
```
The watch request failed (file not found, permission error, etc.).

```json
{"type": "take_over_complete", "sessionId": "<new-vibelink-session-id>", "wsUrl": "ws://..."}
```
Take-over succeeded. Phone should close the current (watch) WebSocket, open a new connection to `wsUrl`, and reset its message store for the new session ID. Hydrated history provides conversation continuity.

### REST API Changes

**Modified endpoints:**

`GET /claude-sessions` — add `name` field (from `--name` flag if present in JSONL metadata).

`POST /sessions` — no changes (already supports `resumeSessionId`).

`DELETE /sessions/:id` — no changes (already kills process, removes from SessionManager, preserves JSONL).

**New endpoint:**

`POST /sessions/watch` — create a watch session (alternative to the WebSocket-based `watch_session` message, for cases where the phone needs the session ID before connecting). Returns `{ sessionId, wsUrl }`. Optional — the WebSocket flow may be sufficient.

### Files Changed

**Bridge:**
- `bridge/src/jsonl-watcher.ts` — new file, JSONL file watcher class (fs.watch, offset tracking, PID health check, event parsing)
- `bridge/src/server.ts` — new WebSocket message handlers (watch_session, stop_watching, take_over), watch session lifecycle
- `bridge/src/session-scanner.ts` — add `name` field extraction from JSONL, export `loadActivePids()` for reuse
- `bridge/src/session-manager.ts` — add `respawn(sessionId)` method for auto-resume, add `createWatchSession()` for lightweight watch sessions

**Mobile:**
- `mobile/app/index.tsx` — redesigned session list (active/other split, new badges, end/delete actions, collapsible other section)
- `mobile/app/session/[id].tsx` — watch mode (banner, no input bar, claude_event handling from watcher), take-over flow with WebSocket reconnection, session-ended-while-watching state transition
- `mobile/src/store/sessions.ts` — add session type tracking (terminal/vibelink/idle), watch state
- `mobile/src/services/bridge-api.ts` — add end session API call

### Not In Scope

- Token-level streaming for terminal sessions (JSONL is complete messages only)
- PTY wrapper for bidirectional terminal injection (future consideration)
- Terminal-side notification when take-over happens (Claude just exits normally)
- Automatic session naming / AI-generated session titles
