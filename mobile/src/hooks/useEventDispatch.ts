import { useCallback } from 'react';
import { useMessageStore, ClaudeEvent } from '../store/messages';

export function useEventDispatch(sessionId: string) {
  const appendEvent = useMessageStore((s) => s.appendEvent);
  const setStreaming = useMessageStore((s) => s.setStreaming);
  const setLastEventId = useMessageStore((s) => s.setLastEventId);
  const setComponent = useMessageStore((s) => s.setComponent);
  const setInputRequest = useMessageStore((s) => s.setInputRequest);
  const setSessionMetadata = useMessageStore((s) => s.setSessionMetadata);

  const dispatch = useCallback((data: ClaudeEvent) => {
    if (data.eventId) {
      setLastEventId(sessionId, data.eventId);
    }

    // always store raw event for CLI tab
    appendEvent(sessionId, data);

    switch (data.type) {
      case 'claude_event':
        if (data.event?.type === 'system') {
          setSessionMetadata(sessionId, data.event as Record<string, unknown>);
        }
        if (data.event?.type === 'stream_event') {
          setStreaming(sessionId, true);
        }
        if (data.event?.type === 'assistant' || data.event?.type === 'result') {
          setStreaming(sessionId, false);
        }
        break;
      case 'ui_update':
        if (data.component && typeof data.component === 'object') {
          const comp = data.component as { id?: string };
          if (comp.id) {
            setComponent(sessionId, comp.id, data.component);
          }
        }
        break;
      case 'input_request':
        if (data.requestId) {
          setInputRequest(sessionId, {
            requestId: data.requestId,
            prompt: data.prompt ?? '',
            options: data.options,
          });
        }
        break;
      case 'session_error':
      case 'session_ended':
        setStreaming(sessionId, false);
        break;
    }
  }, [sessionId, appendEvent, setStreaming, setLastEventId, setComponent, setInputRequest, setSessionMetadata]);

  return dispatch;
}
