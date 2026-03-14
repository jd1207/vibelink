import { useMemo, useRef, useState, useEffect } from 'react';
import { useMessageStore, ClaudeEvent, ChatMessage } from '../store/messages';
import { parseContentBlocks } from './parseContentBlocks';

const THROTTLE_MS = 16;

export function useStreaming(sessionId: string): ChatMessage[] {
  const events = useMessageStore((s) => s.events.get(sessionId) ?? []);
  const [tick, setTick] = useState(0);
  const lastProcessedRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamBufferRef = useRef('');
  const pendingUpdateRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (events.length === lastProcessedRef.current) return;
    if (pendingUpdateRef.current) return;
    pendingUpdateRef.current = setTimeout(() => {
      pendingUpdateRef.current = null;
      setTick((t) => t + 1);
    }, THROTTLE_MS);

    return () => {
      if (pendingUpdateRef.current) {
        clearTimeout(pendingUpdateRef.current);
        pendingUpdateRef.current = null;
      }
    };
  }, [events.length]);

  const messages = useMemo(() => {
    const result: ChatMessage[] = [...messagesRef.current];
    const newEvents = events.slice(lastProcessedRef.current);

    for (const raw of newEvents) {
      const evt = raw as ClaudeEvent;
      if (evt.type !== 'claude_event' || !evt.event) continue;
      processEvent(evt, result, streamBufferRef);
    }

    lastProcessedRef.current = events.length;
    messagesRef.current = result;
    return result;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events.length, tick, sessionId]);

  return messages;
}

function processEvent(
  evt: ClaudeEvent,
  result: ChatMessage[],
  streamBufferRef: React.MutableRefObject<string>,
) {
  const inner = evt.event!;

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
          id: evt.eventId ?? `stream-${Date.now()}`,
          role: 'assistant',
          content: streamBufferRef.current,
          timestamp: Date.now(),
          isStreaming: true,
        });
      }
      break;
    }

    case 'assistant': {
      streamBufferRef.current = '';
      const msg = inner as { type: string; message?: { content?: unknown[] } };
      const blocks = parseContentBlocks(msg.message?.content);
      const text = blocks.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');

      const lastMsg = result[result.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        result[result.length - 1] = { ...lastMsg, content: text, contentBlocks: blocks, isStreaming: false };
      } else {
        result.push({
          id: evt.eventId ?? `asst-${Date.now()}`,
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
      const content = typeof userEvt.message?.content === 'string'
        ? userEvt.message.content
        : JSON.stringify(userEvt.message?.content ?? '');
      const blocks = Array.isArray(userEvt.message?.content)
        ? parseContentBlocks(userEvt.message?.content)
        : undefined;

      result.push({
        id: evt.eventId ?? `user-${Date.now()}`,
        role: 'user',
        content,
        contentBlocks: blocks,
        timestamp: Date.now(),
      });
      break;
    }

    case 'result':
      streamBufferRef.current = '';
      break;
  }
}
