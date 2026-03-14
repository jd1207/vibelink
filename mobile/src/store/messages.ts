import { create } from 'zustand';
import type { ClaudeEvent, ChatMessage, InputRequest } from './message-types';

export type { ClaudeEvent, ChatMessage, ContentBlock, InputRequest } from './message-types';

// use plain objects instead of Maps to avoid getSnapshot reference issues
interface MessageState {
  events: Record<string, ClaudeEvent[]>;
  components: Record<string, Record<string, unknown>>;
  tabs: Record<string, unknown[]>;
  isStreaming: Record<string, boolean>;
  lastEventId: Record<string, string>;
  inputRequests: Record<string, InputRequest | null>;
  permissionRequests: Record<string, { requestId: string; toolName: string; toolInput: Record<string, unknown> } | null>;

  appendEvent: (sessionId: string, event: ClaudeEvent) => void;
  setComponent: (sessionId: string, componentId: string, component: unknown) => void;
  updateComponent: (sessionId: string, componentId: string, updates: Record<string, unknown>) => void;
  addTab: (sessionId: string, tab: unknown) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setLastEventId: (sessionId: string, eventId: string) => void;
  setInputRequest: (sessionId: string, request: InputRequest | null) => void;
  setPermissionRequest: (sessionId: string, request: { requestId: string; toolName: string; toolInput: Record<string, unknown> } | null) => void;
  clearSession: (sessionId: string) => void;
}

// stable empty values to return from selectors — avoids new reference per render
const EMPTY_EVENTS: ClaudeEvent[] = [];
const EMPTY_COMPONENTS: Record<string, unknown> = {};
const EMPTY_TABS: unknown[] = [];

export { EMPTY_EVENTS, EMPTY_COMPONENTS, EMPTY_TABS };

export const useMessageStore = create<MessageState>((set) => ({
  events: {},
  components: {},
  tabs: {},
  isStreaming: {},
  lastEventId: {},
  inputRequests: {},
  permissionRequests: {},

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

  setPermissionRequest: (sessionId, request) =>
    set((state) => ({
      permissionRequests: { ...state.permissionRequests, [sessionId]: request },
    })),

  clearSession: (sessionId) =>
    set((state) => {
      const { [sessionId]: _e, ...events } = state.events;
      const { [sessionId]: _c, ...components } = state.components;
      const { [sessionId]: _t, ...tabs } = state.tabs;
      const { [sessionId]: _s, ...isStreaming } = state.isStreaming;
      const { [sessionId]: _l, ...lastEventId } = state.lastEventId;
      const { [sessionId]: _i, ...inputRequests } = state.inputRequests;
      const { [sessionId]: _p, ...permissionRequests } = state.permissionRequests;
      return { events, components, tabs, isStreaming, lastEventId, inputRequests, permissionRequests };
    }),
}));
