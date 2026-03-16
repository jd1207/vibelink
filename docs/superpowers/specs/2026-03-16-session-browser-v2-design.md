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
| **terminal** | green "terminal" | green filled dot with glow | Active list | Watch mode (read-only + take-over banner) |
| **vibelink** | blue "vibelink" | blue ring (hollow dot) with glow | Active list | Chat mode (full control, auto-resumes) |
| **idle** | gray "resume" label | gray dash | "Other sessions" | Tap to resume as vibelink |

**Accessibility:** Status is communicated through both color AND shape (filled dot vs ring vs dash) so colorblind users can distinguish states. The type badge text ("terminal"/"vibelink"/"resume") provides a third signal. Screen reader labels on each row: "[Project name], [state], [last message], [time ago]".

A vibelink session stays vibelink (active, blue) even after Claude's process exits. It only becomes idle when the user explicitly taps "end."

A terminal session becomes idle when the terminal Claude process exits (PID dies) — detected either during the 5-second session list poll, or by the JSONL watcher's PID health check while actively watching (see below).

### Session List

**Active area (top):** All terminal + vibelink sessions, sorted by last activity descending, interleaved (not grouped by type).

Each row shows:
- Status indicator (filled dot / ring / dash — see states table)
- Project name (or `--name` if Claude was started with one)
- Last message preview (truncated) — shows last assistant message for better differentiation
- Relative time ("2m ago")
- Badges: type (terminal/vibelink), git branch
- Model badge omitted from default view to reduce clutter (available in session detail metadata panel)

**"End" action:** Swipe-to-reveal gesture (not a visible button) to prevent accidental taps. Swiping reveals a red "End" button. For terminal sessions, tapping "End" shows a confirmation: "This will kill the terminal Claude process. Continue?" For vibelink sessions, no confirmation needed (non-destructive to other devices).

**Other sessions (collapsible):** Idle sessions sorted by last activity. Section header always visible showing count: "Other sessions (5)" with chevron. Auto-expands when no active sessions exist.

Each idle row shows:
- Gray dash indicator
- Project name, last message preview, relative time
- Gray "resume" label (right side) — signals tappability
- "delete" action via swipe gesture — shows confirmation: "This permanently deletes the conversation. Continue?"
- Tapping a row resumes it as a vibelink session (moves to active area)

**Empty states:**
- No active + has idle: "Other sessions" auto-expands, message above: "No active sessions. Tap one below to resume, or start new."
- No active + no idle: Full-screen guidance: "Start Claude in your terminal to see sessions here, or tap + to create one."
- Has active + no idle: No "Other sessions" section shown.

**Polling:** Refresh session list every 5 seconds (unchanged from current).

### JSONL File Watcher

New bridge component that enables watching terminal sessions from the phone.

**Watch session creation:** Phone calls `POST /sessions/watch` REST endpoint with `{ claudeSessionId }`. Bridge creates a lightweight "watch session" — a bridge session with an EventBuffer but no Claude subprocess — and returns `{ sessionId, wsUrl }`. Phone then connects to `/ws/<watchSessionId>` using the standard WebSocket path. This reuses the existing EventBuffer, `broadcastToSession`, and reconnect infrastructure.

Using REST (not WebSocket) for watch creation avoids routing ambiguity — the phone doesn't need an existing WS connection to initiate a watch.

**JSONL path resolution:** The bridge scans `~/.claude/projects/*/` directories for a file named `<claudeSessionId>.jsonl` — the same scan pattern used by `readSessionHistory()` in `session-scanner.ts`. If the file is not found, the REST endpoint returns `{ error: "JSONL file not found" }` and no watch session is created. The phone shows a toast: "Session data not found" and stays on the session list.

**PID lookup and validation:** The bridge finds the terminal PID by scanning `~/.claude/sessions/*.json` files for the entry whose `sessionId` field matches the `claudeSessionId` (reuses `loadActivePids()` from `session-scanner.ts`). Before sending any signal to a PID, the bridge validates the process is actually Claude by reading `/proc/<pid>/cmdline` and checking it contains `claude`. If validation fails, the PID is treated as stale (session already dead). This prevents killing unrelated processes when PIDs are recycled.

**Lifecycle:**
1. Phone calls `POST /sessions/watch` with `claudeSessionId` → gets `{ sessionId, wsUrl }`
2. Phone connects to the watch session's WebSocket
3. Bridge reads the tail of the JSONL (last 65KB), parses up to last 4 user turns (same depth as `readSessionHistory()`), pushes to phone as `claude_event` messages via the watch session's EventBuffer
4. Bridge starts `fs.watch()` on the JSONL file
5. On file change: bridge `stat()`s the file to get current size. If size > last offset, reads delta bytes, parses complete JSONL lines, pushes new events. If size < last offset (truncation), resets offset to 0 and re-reads. If size == last offset, skips (spurious event).
6. After each file change, bridge also checks `isPidAlive()` for the terminal PID (with `/proc/<pid>/cmdline` validation). If the PID is dead or not Claude, bridge emits `watch_ended` with reason `process_exited`.
7. Bridge polls PID liveness every 2 seconds while watching (catches exits without a final JSONL write)
8. If `fs.watch()` fires no events for 10 seconds despite PID being alive, bridge falls back to `fs.watchFile()` polling (2-second interval) for resilience
9. When phone disconnects or navigates back to list, bridge stops the watcher and removes the watch session

**Watch session cleanup:** A `ws.on('close')` handler specific to watch sessions triggers cleanup (stop watcher, remove session). A reaper runs every 10 seconds and removes watch sessions with 0 connected clients for more than 5 seconds (handles phone crashes where WS close isn't clean, detected by heartbeat timeout).

**Concurrency limits:** Maximum 5 concurrent watch sessions. If a JSONL file is already being watched by another session, the watcher is shared (fan out events to multiple watch sessions) rather than creating duplicate `fs.watch()` instances.

**Important limitation:** JSONL is written after complete messages, not during streaming. The phone sees complete turns (user message → full assistant response), not token-by-token streaming. When a user message appears in the JSONL without a subsequent assistant response, the phone shows a "Claude is responding..." indicator in the message list until the response appears.

**fs.watch reliability:** This assumes Claude CLI appends to the JSONL file in place (not atomic rename). The `fs.watchFile()` fallback (polling) handles cases where inotify is unreliable.

**Implementation:** New file `bridge/src/jsonl-watcher.ts` — a class that wraps `fs.watch()` with `fs.watchFile()` fallback, tracks file offset with stat-based delta reads, validates PIDs via `/proc/<pid>/cmdline`, and emits structured events.

### Watch Mode (Terminal Session Detail)

When the user taps a terminal session:

- **Same chat UI** as vibelink sessions — messages, tool calls, code blocks render identically
- **No input bar** — the bottom of the screen shows a sticky banner instead
- **Banner:** "Live from terminal" on the left, "Take Over" button on the right
- **Last update timestamp** in the banner: "Last update: 2m ago" — so user knows if session is actively being used or sitting idle
- Messages appear as the JSONL updates (complete turns, not streaming)
- When waiting for Claude's response (user message without subsequent assistant message): "Claude is responding..." indicator
- Workspace tab available if applicable
- Events use the same `claude_event` type as vibelink sessions (no separate `watch_event` type). The mobile message store and rendering pipeline handle them identically.

**Watch error handling:** If the REST `POST /sessions/watch` returns an error, the phone shows a toast ("Session data not found") and stays on the session list. If the WebSocket connection fails after creation, the phone shows an inline error in the session detail view with a "Retry" button.

**Session-ended-while-watching:** If the terminal Claude process exits while the user is in watch mode (detected by the watcher's PID health check):
- Bridge sends `watch_ended` with reason `process_exited`
- A visual separator appears in the message list: "Terminal session ended"
- Banner transitions from "Live from terminal — Take Over" to "Session ended — Resume"
- Tapping "Resume" creates a vibelink session with `--resume`, same as take-over but without killing a process
- This handles the case where the terminal user naturally exits Claude

### Take-Over Flow

1. User taps "Take Over" on the watch mode banner
2. Confirmation dialog: "This will end the terminal session. Continue?"
3. Banner shows loading state: "Taking over..." (existing messages stay visible, read-only)
4. On confirm: phone sends `take_over` message to bridge via the watch session's WebSocket
5. Bridge looks up the terminal PID via `loadActivePids()` scan
6. Bridge validates PID is a Claude process by reading `/proc/<pid>/cmdline`. If PID is stale or not Claude, skip to step 9 (treat as already dead — proceed to resume)
7. Bridge sends `SIGTERM` to the validated PID
8. Bridge waits up to 5 seconds for process exit (polling every 500ms), re-validating `/proc/<pid>/cmdline` before escalating to `SIGKILL`
9. Bridge stops the JSONL watcher and removes the watch session
10. Bridge creates a new vibelink session with `--resume <sessionId>` and `skipPermissions` inherited
11. Hydrates the event buffer with recent conversation history
12. Bridge sends `take_over_complete` with the new `sessionId` and `wsUrl`
13. Phone closes the watch session WebSocket, opens a new WebSocket to the vibelink session's `wsUrl`
14. Phone merges hydrated history into the existing message store (preserves visual continuity — no flash or re-render). The new session ID replaces the old one internally but the user sees a seamless transition.
15. Banner disappears, input bar appears, badge changes from green "terminal" to blue "vibelink"
16. User can now send messages

**Take-over failure:** If `--resume` fails after killing the terminal process (e.g., corrupt JSONL, CLI update), bridge sends `take_over_failed` with an error message. Phone shows error on the banner: "Take-over failed — session saved." The session appears as idle in "Other sessions" (the JSONL still exists and can be resumed later). User can retry from there.

**Concurrent watchers during take-over:** When a take-over happens, the bridge broadcasts `watch_ended` with reason `taken_over` to all OTHER watchers of the same `claudeSessionId`. Those phones show "Session taken over by another device" instead of a "Resume" button.

**Terminal side:** Claude receives SIGTERM and exits normally. The terminal user sees their shell prompt. If they run `claude --continue` later, they get the full conversation including everything that happened on the phone (it's all in the same JSONL).

### Session Continuity (Auto-Resume)

When a vibelink session's Claude process has exited and the user sends a new message:

1. The WebSocket `user_message` handler in `server.ts` checks `session.process.alive` and `session.respawning`
2. If `respawning === true`, the message is queued (pushed to a per-session message queue)
3. If dead and not respawning, handler sets `session.respawning = true` and calls `SessionManager.respawn(sessionId)` which:
   - Spawns new Claude with `--resume <resumeSessionId>` using the session ID from the last `result` event
   - Replaces the dead process in the session object
   - Hydrates buffer with recent history from JSONL
   - Sets `session.respawning = false`
   - Flushes any queued messages to the new process
4. Once the new process is ready, handler sends the user's message to it
5. From the phone: seamless — user typed, Claude responded

**Auto-resume failure:** If `respawn()` fails, the phone receives no response. After a 15-second timeout with no `claude_event`, the phone shows an inline error: "Could not reconnect — tap to retry." Tapping retries the respawn. The `respawning` flag is cleared on failure so retries work.

This means "end" on a vibelink session is soft — the session moves to idle, but the conversation is preserved. Tapping it in "other sessions" or even creating a new session with the same resume ID brings it back.

### "End" Action

**End on terminal session:**
- Bridge looks up PID via `loadActivePids()` scan, validates via `/proc/<pid>/cmdline`
- Sends SIGTERM, waits up to 5 seconds, then SIGKILL if needed (same escalation as take-over)
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
- Last message preview (primary differentiator — uses last assistant message)
- Relative time
- Git branch (if different)
- Claude's `--name` flag (if set) — shown instead of project name

**Vibelink sessions store their `resumeSessionId`** (the CLI session ID they were created with or resumed from). This is used for matching — the phone identifies sessions by `claudeSessionId`, not `projectPath`, preventing mismatches when multiple sessions share a project.

**Cross-device continuity:**
- Terminal → Phone: automatic (phone sees terminal sessions via session scanner)
- Phone → Terminal: user runs `claude --continue` in the project directory (picks up most recent session, including phone conversations)

**System prompt note:** `--append-system-prompt` is ephemeral and not preserved on `--resume`. After take-over, the bridge re-injects the VibeLink system prompt. This means the conversation may behave slightly differently after take-over (Claude gains awareness of VibeLink workspace tools). This is expected and beneficial.

### REST API Changes

**Modified endpoints:**

`GET /claude-sessions` — add `name` field (from `--name` flag if present in JSONL metadata).

`POST /sessions` — no changes (already supports `resumeSessionId`).

`DELETE /sessions/:id` — no changes (already kills process, removes from SessionManager, preserves JSONL).

**New endpoints:**

`POST /sessions/watch` — create a watch session for a terminal session. Body: `{ claudeSessionId }`. Returns `{ sessionId, wsUrl }` on success, `{ error }` on failure (JSONL not found, etc.). This is the primary entry point for watching (not a WebSocket message).

`POST /sessions/:id/take-over` — initiate take-over of a terminal session. Body: `{ claudeSessionId }`. Returns `{ sessionId, wsUrl }` on success. Performs PID validation, kill, resume. Alternative to the WebSocket-based `take_over` message for cases where REST is preferred.

### WebSocket Protocol Changes

Messages sent on the **watch session's** WebSocket (after connecting to the URL from `POST /sessions/watch`):

**Client → Bridge:**
```json
{"type": "stop_watching"}
```
Sent on the watch session's WebSocket. Bridge stops the JSONL watcher and cleans up the watch session.

```json
{"type": "take_over", "claudeSessionId": "<cli-session-id>"}
```
Sent on the watch session's WebSocket. Triggers the take-over flow.

**Bridge → Client:**
```json
{"type": "claude_event", "event": {...}, "eventId": 1}
```
A parsed JSONL event. Same type as live subprocess events — the mobile rendering pipeline handles them identically.

```json
{"type": "watch_ended", "reason": "process_exited" | "taken_over" | "file_deleted" | "error", "message": "..."}
```
The watch ended. Reasons: `process_exited` (terminal Claude exited), `taken_over` (another device took over), `file_deleted` (JSONL removed), `error` (fs.watch failure or other).

```json
{"type": "take_over_complete", "sessionId": "<new-vibelink-session-id>", "wsUrl": "ws://..."}
```
Take-over succeeded. Phone closes this WebSocket, connects to `wsUrl`, merges hydrated history into existing message store.

```json
{"type": "take_over_failed", "message": "Resume failed: ..."}
```
Take-over killed the terminal process but could not resume. Session is now idle.

### Files Changed

**Bridge:**
- `bridge/src/jsonl-watcher.ts` — new file, JSONL file watcher class (fs.watch + fs.watchFile fallback, stat-based delta reads, PID validation via /proc/pid/cmdline, event parsing, shared watcher deduplication)
- `bridge/src/server.ts` — new REST endpoints (POST /sessions/watch, POST /sessions/:id/take-over), new WS message handlers (stop_watching, take_over), watch session lifecycle and cleanup reaper
- `bridge/src/session-scanner.ts` — add `name` field extraction from JSONL, export `loadActivePids()` for reuse, add `validatePid()` helper
- `bridge/src/session-manager.ts` — add `respawn(sessionId)` method with locking flag for auto-resume, add `createWatchSession()` for lightweight watch sessions, add per-session message queue for respawn

**Mobile:**
- `mobile/app/index.tsx` — redesigned session list (active/other split, shape+color indicators, swipe-to-end/delete, collapsible other section with auto-expand, empty states, accessibility labels)
- `mobile/app/session/[id].tsx` — watch mode (banner with loading states, no input bar, "Claude is responding..." indicator, "Terminal session ended" separator, take-over with visual continuity via message merge), error/retry states for watch and take-over failures
- `mobile/src/store/sessions.ts` — add session type tracking (terminal/vibelink/idle), watch state, `resumeSessionId` for identity matching
- `mobile/src/services/bridge-api.ts` — add watch session creation, take-over, end session API calls

### Not In Scope

- Token-level streaming for terminal sessions (JSONL is complete messages only)
- PTY wrapper for bidirectional terminal injection (future consideration)
- Terminal-side notification when take-over happens (Claude just exits normally)
- Automatic session naming / AI-generated session titles
- Skip-permissions preference on idle session resume (inherits from original session or defaults to off)
