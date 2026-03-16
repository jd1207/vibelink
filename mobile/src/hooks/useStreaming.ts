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
