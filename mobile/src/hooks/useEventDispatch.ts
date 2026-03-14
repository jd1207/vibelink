import { useCallback } from 'react';
import { useMessageStore, ClaudeEvent } from '../store/messages';

export function useEventDispatch(sessionId: string) {
  // grab actions once — they're stable references from zustand
  const appendEvent = useMessageStore((s) => s.appendEvent);
  const setStreaming = useMessageStore((s) => s.setStreaming);
  const setLastEventId = useMessageStore((s) => s.setLastEventId);
  const setComponent = useMessageStore((s) => s.setComponent);
  const setInputRequest = useMessageStore((s) => s.setInputRequest);
  const addTab = useMessageStore((s) => s.addTab);

  const dispatch = useCallback((data: ClaudeEvent) => {
    if (data.eventId) {
      setLastEventId(sessionId, String(data.eventId));
    }

    // always store raw event for CLI tab
    appendEvent(sessionId, data);

    switch (data.type) {
      case 'claude_event':
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
          if (comp.id) setComponent(sessionId, comp.id, data.component);
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
      case 'session_error':
      case 'session_ended':
        setStreaming(sessionId, false);
        break;
    }
  }, [sessionId, appendEvent, setStreaming, setLastEventId, setComponent, setInputRequest, addTab]);

  return dispatch;
}
