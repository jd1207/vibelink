import { useCallback } from 'react';
import { useMessageStore, ClaudeEvent, SessionMetadata } from '../store/messages';
import { useStreamStore } from "../store/stream-store";

export function useEventDispatch(sessionId: string) {
  // grab actions once — they're stable references from zustand
  const appendEvent = useMessageStore((s) => s.appendEvent);
  const setStreaming = useMessageStore((s) => s.setStreaming);
  const setLastEventId = useMessageStore((s) => s.setLastEventId);
  const setComponent = useMessageStore((s) => s.setComponent);
  const updateComponent = useMessageStore((s) => s.updateComponent);
  const setInputRequest = useMessageStore((s) => s.setInputRequest);
  const pushPermission = useMessageStore((s) => s.pushPermission);
  const addTab = useMessageStore((s) => s.addTab);
  const setMetadata = useMessageStore((s) => s.setMetadata);
  const updateUsage = useMessageStore((s) => s.updateUsage);
  const setCanvas = useMessageStore((s) => s.setCanvas);
  const setWatchState = useMessageStore((s) => s.setWatchState);
  const setWatchTakeOver = useMessageStore((s) => s.setWatchTakeOver);
  const updateWatchTimestamp = useMessageStore((s) => s.updateWatchTimestamp);

  const { addStreamTab, updateStreamTab, removeStreamTab, setWindowList } = useStreamStore.getState();

  const dispatch = useCallback((data: ClaudeEvent) => {
    if (data.eventId) {
      setLastEventId(sessionId, String(data.eventId));
    }

    // always store raw event for CLI tab
    appendEvent(sessionId, data);

    switch (data.type) {
      case 'claude_event':
        updateWatchTimestamp(sessionId);
        if (data.event?.type === 'stream_event') {
          setStreaming(sessionId, true);
        }
        if (data.event?.type === 'assistant' || data.event?.type === 'result') {
          setStreaming(sessionId, false);
        }
        if (data.event?.type === 'system' && data.event?.subtype === 'init') {
          const evt = data.event as Record<string, unknown>;
          const meta: SessionMetadata = {
            cwd: evt.cwd as string | undefined,
            model: evt.model as string | undefined,
            sessionId: evt.session_id as string | undefined,
            permissionMode: (evt.permissionMode ?? evt.permission_mode) as string | undefined,
            tools: Array.isArray(evt.tools)
              ? evt.tools.map((t: unknown) => (typeof t === 'string' ? t : (t as { name?: string })?.name ?? String(t)))
              : undefined,
            mcpServers: Array.isArray(evt.mcp_servers)
              ? evt.mcp_servers.map((s: unknown) => (typeof s === 'string' ? s : (s as { name?: string })?.name ?? String(s)))
              : undefined,
            sessionStartedAt: Date.now(),
          };
          setMetadata(sessionId, meta);
        }
        if (data.event?.type === 'result') {
          const evt = data.event as Record<string, unknown>;
          const usage = evt.usage as Record<string, number> | undefined;
          updateUsage(sessionId, {
            inputTokens: usage?.input_tokens,
            outputTokens: usage?.output_tokens,
            cacheReadTokens: usage?.cache_read_input_tokens,
            cacheCreationTokens: usage?.cache_creation_input_tokens,
            costUsd: evt.cost_usd as number | undefined,
            durationMs: evt.duration_ms as number | undefined,
            numTurns: evt.num_turns as number | undefined,
          });
        }
        break;
      case 'ui_update':
        if (data.component && typeof data.component === 'object') {
          const comp = data.component as { id?: string };
          if (comp.id) setComponent(sessionId, comp.id, data.component);
        }
        break;
      case 'ui_modify':
        if (data.componentId && data.updates && typeof data.updates === 'object') {
          updateComponent(sessionId, String(data.componentId), data.updates as Record<string, unknown>);
        }
        break;
      case 'tab_create':
        if (data.tab) addTab(sessionId, data.tab);
        break;
      case 'input_request':
        if (data.requestId) {
          setInputRequest(sessionId, {
            requestId: String(data.requestId),
            prompt: String(data.prompt ?? ''),
            options: data.options as string[] | undefined,
          });
        }
        break;
      case 'permission_request':
        if (data.requestId) {
          pushPermission(sessionId, {
            requestId: String(data.requestId),
            toolName: String(data.toolName ?? 'unknown'),
            toolInput: (data.toolInput as Record<string, unknown>) ?? {},
          });
        }
        break;
      case 'workspace_html':
        if (typeof data.html === 'string') {
          setCanvas(sessionId, { mode: 'html', html: data.html, title: data.title as string | undefined });
        }
        break;
      case 'workspace_url':
        if (typeof data.url === 'string') {
          setCanvas(sessionId, { mode: 'url', url: data.url, title: data.title as string | undefined });
        }
        break;
      case 'workspace_clear':
        setCanvas(sessionId, null);
        break;
      case 'session_error':
      case 'session_ended':
        setStreaming(sessionId, false);
        break;
      case 'watch_ended': {
        const reason = data.reason as string | undefined;
        const csid = data.claudeSessionId as string | undefined;
        if (reason === 'taken_over') {
          setWatchState(sessionId, 'ended', 'session taken over by another device');
        } else if (reason === 'terminal_resumed') {
          setWatchState(sessionId, 'ended', 'continued in terminal', csid ?? undefined);
        } else if (reason === 'process_exited') {
          setWatchState(sessionId, 'ended');
        } else {
          setWatchState(sessionId, 'error', String(data.error ?? 'watch ended unexpectedly'));
        }
        break;
      }
      case 'take_over_complete':
        if (data.sessionId && data.wsUrl) {
          setWatchTakeOver(sessionId, String(data.sessionId), String(data.wsUrl));
        }
        break;
      case 'take_over_failed':
        setWatchState(sessionId, 'watching', String(data.error ?? 'take over failed'));
        break;
      case "window_list":
        setWindowList(sessionId, data.windows ?? []);
        break;
      case "stream_confirm":
        addStreamTab(sessionId, data.windowId!, data.windowTitle ?? data.windowId!, "confirming");
        break;
      case "stream_started":
        addStreamTab(sessionId, data.windowId!, data.windowTitle ?? data.windowId!, "streaming");
        break;
      case "stream_stopped":
        removeStreamTab(sessionId, data.windowId!);
        break;
      case "stream_error":
        updateStreamTab(sessionId, data.windowId!, {
          status: "error",
          errorMessage: data.error,
        });
        break;
      case "stream_status":
        updateStreamTab(sessionId, data.windowId!, {
          fps: data.fps,
          frameSize: data.frameSize,
        });
        break;
    }
  }, [sessionId, appendEvent, setStreaming, setLastEventId, setComponent, updateComponent, setInputRequest, pushPermission, addTab, setMetadata, updateUsage, setCanvas, setWatchState, setWatchTakeOver, updateWatchTimestamp]);

  return dispatch;
}
