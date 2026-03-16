import { create } from 'zustand';
import type { ClaudeEvent, ChatMessage, InputRequest, SessionMetadata, WorkspaceCanvas, WatchInfo, WatchState } from './message-types';

export type { ClaudeEvent, ChatMessage, ContentBlock, InputRequest, SessionMetadata, WorkspaceCanvas, WatchInfo, WatchState } from './message-types';

// use plain objects instead of Maps to avoid getSnapshot reference issues
interface MessageState {
  events: Record<string, ClaudeEvent[]>;
  components: Record<string, Record<string, unknown>>;
  tabs: Record<string, unknown[]>;
  isStreaming: Record<string, boolean>;
  lastEventId: Record<string, string>;
  inputRequests: Record<string, InputRequest | null>;
  permissionQueue: Record<string, { requestId: string; toolName: string; toolInput: Record<string, unknown> }[]>;
  metadata: Record<string, SessionMetadata>;
  canvas: Record<string, WorkspaceCanvas | null>;
  watchInfo: Record<string, WatchInfo>;

  appendEvent: (sessionId: string, event: ClaudeEvent) => void;
  setComponent: (sessionId: string, componentId: string, component: unknown) => void;
  updateComponent: (sessionId: string, componentId: string, updates: Record<string, unknown>) => void;
  addTab: (sessionId: string, tab: unknown) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setLastEventId: (sessionId: string, eventId: string) => void;
  setInputRequest: (sessionId: string, request: InputRequest | null) => void;
  pushPermission: (sessionId: string, request: { requestId: string; toolName: string; toolInput: Record<string, unknown> }) => void;
  shiftPermission: (sessionId: string) => void;
  setMetadata: (sessionId: string, metadata: SessionMetadata) => void;
  updateUsage: (sessionId: string, usage: Partial<SessionMetadata>) => void;
  setCanvas: (sessionId: string, canvas: WorkspaceCanvas | null) => void;
  setWatchState: (sessionId: string, state: WatchState, error?: string | null) => void;
  setWatchTakeOver: (sessionId: string, newSessionId: string, wsUrl: string) => void;
  updateWatchTimestamp: (sessionId: string) => void;
  clearSession: (sessionId: string) => void;
}

// stable empty values to return from selectors — avoids new reference per render
const EMPTY_EVENTS: ClaudeEvent[] = [];
const EMPTY_COMPONENTS: Record<string, unknown> = {};
const EMPTY_TABS: unknown[] = [];
const EMPTY_PERMISSION_QUEUE: { requestId: string; toolName: string; toolInput: Record<string, unknown> }[] = [];

const EMPTY_WATCH_INFO: WatchInfo = { state: null, error: null, lastUpdate: 0 };

export { EMPTY_EVENTS, EMPTY_COMPONENTS, EMPTY_TABS, EMPTY_PERMISSION_QUEUE, EMPTY_WATCH_INFO };

export const useMessageStore = create<MessageState>((set) => ({
  events: {},
  components: {},
  tabs: {},
  isStreaming: {},
  lastEventId: {},
  inputRequests: {},
  permissionQueue: {},
  metadata: {},
  canvas: {},
  watchInfo: {},

  appendEvent: (sessionId, event) =>
    set((state) => {
      const existing = state.events[sessionId] ?? [];
      return {
        events: { ...state.events, [sessionId]: [...existing, event] },
      };
    }),

  setComponent: (sessionId, componentId, component) =>
    set((state) => {
      const existing = state.components[sessionId] ?? {};
      return {
        components: {
          ...state.components,
          [sessionId]: { ...existing, [componentId]: component },
        },
      };
    }),

  updateComponent: (sessionId, componentId, updates) =>
    set((state) => {
      const existing = state.components[sessionId]?.[componentId];
      if (!existing || typeof existing !== 'object') return state;
      return {
        components: {
          ...state.components,
          [sessionId]: {
            ...state.components[sessionId],
            [componentId]: { ...(existing as Record<string, unknown>), ...updates },
          },
        },
      };
    }),

  addTab: (sessionId, tab) =>
    set((state) => {
      const existing = state.tabs[sessionId] ?? [];
      return {
        tabs: { ...state.tabs, [sessionId]: [...existing, tab] },
      };
    }),

  setStreaming: (sessionId, streaming) =>
    set((state) => ({
      isStreaming: { ...state.isStreaming, [sessionId]: streaming },
    })),

  setLastEventId: (sessionId, eventId) =>
    set((state) => ({
      lastEventId: { ...state.lastEventId, [sessionId]: eventId },
    })),

  setInputRequest: (sessionId, request) =>
    set((state) => ({
      inputRequests: { ...state.inputRequests, [sessionId]: request },
    })),

  pushPermission: (sessionId, request) =>
    set((state) => {
      const existing = state.permissionQueue[sessionId] ?? [];
      return {
        permissionQueue: { ...state.permissionQueue, [sessionId]: [...existing, request] },
      };
    }),

  shiftPermission: (sessionId) =>
    set((state) => {
      const existing = state.permissionQueue[sessionId] ?? [];
      return {
        permissionQueue: { ...state.permissionQueue, [sessionId]: existing.slice(1) },
      };
    }),

  setMetadata: (sessionId, metadata) =>
    set((state) => ({
      metadata: { ...state.metadata, [sessionId]: metadata },
    })),

  updateUsage: (sessionId, usage) =>
    set((state) => {
      const existing = state.metadata[sessionId] ?? {};
      return {
        metadata: { ...state.metadata, [sessionId]: { ...existing, ...usage } },
      };
    }),

  setCanvas: (sessionId, canvas) =>
    set((state) => ({
      canvas: { ...state.canvas, [sessionId]: canvas },
    })),

  setWatchState: (sessionId, watchState, error) =>
    set((state) => {
      const existing = state.watchInfo[sessionId] ?? EMPTY_WATCH_INFO;
      return {
        watchInfo: {
          ...state.watchInfo,
          [sessionId]: { ...existing, state: watchState, error: error ?? null },
        },
      };
    }),

  setWatchTakeOver: (sessionId, newSessionId, wsUrl) =>
    set((state) => {
      const existing = state.watchInfo[sessionId] ?? EMPTY_WATCH_INFO;
      return {
        watchInfo: {
          ...state.watchInfo,
          [sessionId]: { ...existing, state: 'taking_over', takenOverSessionId: newSessionId, takenOverWsUrl: wsUrl },
        },
      };
    }),

  updateWatchTimestamp: (sessionId) =>
    set((state) => {
      const existing = state.watchInfo[sessionId] ?? EMPTY_WATCH_INFO;
      return {
        watchInfo: {
          ...state.watchInfo,
          [sessionId]: { ...existing, lastUpdate: Date.now() },
        },
      };
    }),

  clearSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _e, ...events } = state.events;
      const { [sessionId]: _c, ...components } = state.components;
      const { [sessionId]: _t, ...tabs } = state.tabs;
      const { [sessionId]: _s, ...isStreaming } = state.isStreaming;
      const { [sessionId]: _l, ...lastEventId } = state.lastEventId;
      const { [sessionId]: _i, ...inputRequests } = state.inputRequests;
      const { [sessionId]: _p, ...permissionQueue } = state.permissionQueue;
      const { [sessionId]: _m, ...metadata } = state.metadata;
      const { [sessionId]: _cv, ...canvas } = state.canvas;
      const { [sessionId]: _w, ...watchInfo } = state.watchInfo;
      return { events, components, tabs, isStreaming, lastEventId, inputRequests, permissionQueue, metadata, canvas, watchInfo };
    }),
}));
