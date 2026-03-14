import { useMemo, useRef } from 'react';
import { useMessageStore, ClaudeEvent, ChatMessage } from '../store/messages';
import { parseContentBlocks } from './parseContentBlocks';

export function useStreaming(sessionId: string): ChatMessage[] {
  const eventsLength = useMessageStore((s) => s.events[sessionId]?.length ?? 0);
  const lastProcessedRef = useRef(0);
  const messagesRef = useRef<ChatMessage[]>([]);
  const streamBufferRef = useRef('');

  return useMemo(() => {
    if (eventsLength === lastProcessedRef.current) {
      return messagesRef.current;
    }

    const events = useMessageStore.getState().events[sessionId] ?? [];
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
  }, [eventsLength, sessionId]);
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

      // use streamed text if we have it, otherwise use the assistant message text
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
        // tool_result-only messages: no bubble, but keep contentBlocks so tool_use can mark complete
        const hasOnlyToolResults = userEvt.message.content.every((b: any) => b.type === 'tool_result');
        if (hasOnlyToolResults) {
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
      if (!content) break;

      result.push({
        id: `user-${Date.now()}`,
        role: 'user',
        content,
        timestamp: Date.now(),
      });
      break;
    }

    case 'result': {
      // force-finalize any streaming message
      const lastMsg = result[result.length - 1];
      if (lastMsg?.role === 'assistant' && lastMsg.isStreaming) {
        result[result.length - 1] = { ...lastMsg, isStreaming: false };
      }
      streamBufferRef.current = '';
      break;
    }
  }
}
