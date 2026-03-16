import { useEffect, useRef, useCallback, useState } from 'react';
import { useConnectionStore } from '../store/connection';
import { useMessageStore } from '../store/messages';
import { useEventDispatch } from './useEventDispatch';

interface QueuedMessage {
  type: string;
  [key: string]: unknown;
}

const MAX_BACKOFF_MS = 30000;
const INITIAL_BACKOFF_MS = 1000;

export function useWebSocket(sessionId: string, onSessionLost?: () => void) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const queueRef = useRef<QueuedMessage[]>([]);
  const backoffRef = useRef(INITIAL_BACKOFF_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  const onSessionLostRef = useRef(onSessionLost);
  onSessionLostRef.current = onSessionLost;

  // read store values via refs to avoid re-render dependency
  const bridgeUrlRef = useRef(useConnectionStore.getState().bridgeUrl);
  const authTokenRef = useRef(useConnectionStore.getState().authToken);
  const dispatchEvent = useEventDispatch(sessionId);
  const dispatchRef = useRef(dispatchEvent);
  dispatchRef.current = dispatchEvent;

  // sync refs when store changes
  useEffect(() => {
    const unsub = useConnectionStore.subscribe((s) => {
      bridgeUrlRef.current = s.bridgeUrl;
      authTokenRef.current = s.authToken;
    });
    return unsub;
  }, []);

  const connect = useCallback(() => {
    const bridgeUrl = bridgeUrlRef.current;
    const authToken = authTokenRef.current;
    if (!bridgeUrl || !sessionId) {
      console.log('[ws] skipping connect — no bridgeUrl or sessionId', { bridgeUrl: !!bridgeUrl, sessionId });
      return;
    }
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    const host = bridgeUrl.replace(/^https?:\/\//, '').replace(/\/$/, '');
    const url = `ws://${host}/ws/${sessionId}?token=${encodeURIComponent(authToken)}`;
    console.log('[ws] connecting to:', url);

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      console.log('[ws] connected!');
      setIsConnected(true);
      useConnectionStore.getState().setConnected(true);
      backoffRef.current = INITIAL_BACKOFF_MS;

      const lastId = useMessageStore.getState().lastEventId[sessionId];
      if (lastId) {
        ws.send(JSON.stringify({ type: 'reconnect', sessionId, lastEventId: lastId }));
      }

      // flush queued messages
      while (queueRef.current.length > 0) {
        const msg = queueRef.current.shift()!;
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (event) => {
      if (!mountedRef.current) return;
      try {
        const data = JSON.parse(event.data as string);
        dispatchRef.current(data);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = (event) => {
      if (!mountedRef.current) return;
      console.log('[ws] closed, code:', event.code, 'reason:', event.reason);
      setIsConnected(false);
      useConnectionStore.getState().setConnected(false);
      wsRef.current = null;

      if (event.code === 1008) {
        console.log('[ws] session unknown — not reconnecting');
        onSessionLostRef.current?.();
        return;
      }

      // schedule reconnect with backoff
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      const delay = backoffRef.current;
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF_MS);
      reconnectTimerRef.current = setTimeout(() => {
        if (mountedRef.current) connect();
      }, delay);
    };

    ws.onerror = (e) => {
      console.log('[ws] error:', (e as any)?.message ?? 'unknown');
    };
  }, [sessionId]); // only depends on sessionId — stable

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

  return { isConnected, sendMessage, sendInputResponse, sendRaw };
}
