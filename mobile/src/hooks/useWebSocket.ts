import { useEffect, useRef, useCallback, useState } from 'react';
import { useConnectionStore } from '../store/connection';
import { useMessageStore, ClaudeEvent } from '../store/messages';
import { useEventDispatch } from './useEventDispatch';

interface QueuedMessage {
  type: string;
  [key: string]: unknown;
}

const MAX_BACKOFF_MS = 30000;
const INITIAL_BACKOFF_MS = 1000;

export function useWebSocket(sessionId: string) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<QueuedMessage[]>([]);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const bridgeUrl = useConnectionStore((s) => s.bridgeUrl);
  const authToken = useConnectionStore((s) => s.authToken);
  const dispatchEvent = useEventDispatch(sessionId);

  const flushQueue = useCallback((ws: WebSocket) => {
    while (queueRef.current.length > 0) {
      const msg = queueRef.current.shift()!;
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);

    const delay = backoffRef.current;
    backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);

    reconnectTimerRef.current = setTimeout(() => {
      if (mountedRef.current) connect();
    }, delay);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = useCallback(() => {
    if (!bridgeUrl || !sessionId) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = bridgeUrl.startsWith('https') ? 'wss' : 'ws';
    const host = bridgeUrl.replace(/^https?:\/\//, '');
    const url = `${protocol}://${host}/ws/${sessionId}?token=${encodeURIComponent(authToken)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      backoffRef.current = INITIAL_BACKOFF_MS;

      const lastId = useMessageStore.getState().lastEventId.get(sessionId);
      if (lastId) {
        ws.send(JSON.stringify({ type: 'reconnect', sessionId, lastEventId: lastId }));
      }
      flushQueue(ws);
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string) as ClaudeEvent;
        dispatchEvent(data);
      } catch {
        // ignore malformed messages
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      wsRef.current = null;
      scheduleReconnect();
    };

    ws.onerror = () => {
      // onclose fires after onerror, reconnect handled there
    };
  }, [bridgeUrl, authToken, sessionId, dispatchEvent, flushQueue, scheduleReconnect]);

  const sendRaw = useCallback((msg: QueuedMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    } else {
      queueRef.current.push(msg);
    }
  }, []);

  const sendMessage = useCallback((content: string) => {
    sendRaw({ type: 'user_message', content });
  }, [sendRaw]);

  const sendInputResponse = useCallback((requestId: string, value: string) => {
    sendRaw({ type: 'input_response', requestId, value });
  }, [sendRaw]);

  useEffect(() => {
    mountedRef.current = true;
    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, sendMessage, sendInputResponse, sendRaw };
}
