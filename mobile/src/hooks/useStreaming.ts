import { useState, useRef, useEffect } from 'react';
import { useMessageStore, ClaudeEvent, ChatMessage } from '../store/messages';
import { parseContentBlocks } from './parseContentBlocks';

export function useStreaming(sessionId: string): ChatMessage[] {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const lastProcessedRef = useRef(0);
  const streamBufferRef = useRef('');
  const prevSessionIdRef = useRef(sessionId);

  // subscribe to event changes and process incrementally
  useEffect(() => {
    // reset on session change
    if (prevSessionIdRef.current !== sessionId) {
      prevSessionIdRef.current = sessionId;
      lastProcessedRef.current = 0;
      streamBufferRef.current = '';
      setMessages([]);
    }

    const processNewEvents = () => {
      const events = useMessageStore.getState().events[sessionId] ?? [];
      if (events.length <= lastProcessedRef.current) return;

      const newEvents = events.slice(lastProcessedRef.current);
      lastProcessedRef.current = events.length;

      setMessages((prev) => {
        const result = [...prev];
        for (const raw of newEvents) {
          const evt = raw as ClaudeEvent;
          if (evt.type !== 'claude_event' || !evt.event) continue;
          processEvent(evt, result, streamBufferRef);
        }
        return result;
      });
    };

    // process any existing events immediately
    processNewEvents();

    // subscribe to store changes
    const unsub = useMessageStore.subscribe(() => processNewEvents());
    return () => unsub();
  }, [sessionId]);

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
          id: `stream-${Date.now()}`,
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
          id: `asst-${Date.now()}`,
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
            id: `toolres-${Date.now()}`,
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
        id: `user-${Date.now()}`,
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
