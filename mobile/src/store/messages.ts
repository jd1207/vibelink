import { create } from 'zustand';
import type { ClaudeEvent, ChatMessage, InputRequest } from './message-types';

export type { ClaudeEvent, ChatMessage, ContentBlock, InputRequest } from './message-types';

interface MessageState {
  events: Map<string, ClaudeEvent[]>;
  messages: Map<string, ChatMessage[]>;
  components: Map<string, Map<string, unknown>>;
  tabs: Map<string, unknown[]>;
  isStreaming: Map<string, boolean>;
  lastEventId: Map<string, string>;
  inputRequests: Map<string, InputRequest | null>;
  sessionMetadata: Map<string, Record<string, unknown>>;

  appendEvent: (sessionId: string, event: ClaudeEvent) => void;
  appendMessage: (sessionId: string, message: ChatMessage) => void;
  updateLastMessage: (sessionId: string, updater: (msg: ChatMessage) => ChatMessage) => void;
  setComponent: (sessionId: string, componentId: string, component: unknown) => void;
  setTabs: (sessionId: string, tabs: unknown[]) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  setLastEventId: (sessionId: string, eventId: string) => void;
  setInputRequest: (sessionId: string, request: InputRequest | null) => void;
  setSessionMetadata: (sessionId: string, metadata: Record<string, unknown>) => void;
  clearSession: (sessionId: string) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  events: new Map(),
  messages: new Map(),
  components: new Map(),
  tabs: new Map(),
  isStreaming: new Map(),
  lastEventId: new Map(),
  inputRequests: new Map(),
  sessionMetadata: new Map(),

  appendEvent: (sessionId, event) =>
    set((state) => {
      const next = new Map(state.events);
      const existing = next.get(sessionId) ?? [];
      next.set(sessionId, [...existing, event]);
      return { events: next };
    }),

  appendMessage: (sessionId, message) =>
    set((state) => {
      const next = new Map(state.messages);
      const existing = next.get(sessionId) ?? [];
      next.set(sessionId, [...existing, message]);
      return { messages: next };
    }),

  updateLastMessage: (sessionId, updater) =>
    set((state) => {
      const next = new Map(state.messages);
      const existing = next.get(sessionId) ?? [];
      if (existing.length === 0) return state;
      const updated = [...existing];
      updated[updated.length - 1] = updater(updated[updated.length - 1]);
      next.set(sessionId, updated);
      return { messages: next };
    }),

  setComponent: (sessionId, componentId, component) =>
    set((state) => {
      const nextComponents = new Map(state.components);
      const sessionComponents = new Map(nextComponents.get(sessionId) ?? new Map());
      sessionComponents.set(componentId, component);
      nextComponents.set(sessionId, sessionComponents);
      return { components: nextComponents };
    }),

  setTabs: (sessionId, tabs) =>
    set((state) => {
      const next = new Map(state.tabs);
      next.set(sessionId, tabs);
      return { tabs: next };
    }),

  setStreaming: (sessionId, streaming) =>
    set((state) => {
      const next = new Map(state.isStreaming);
      next.set(sessionId, streaming);
      return { isStreaming: next };
    }),

  setLastEventId: (sessionId, eventId) =>
    set((state) => {
      const next = new Map(state.lastEventId);
      next.set(sessionId, eventId);
      return { lastEventId: next };
    }),

  setInputRequest: (sessionId, request) =>
    set((state) => {
      const next = new Map(state.inputRequests);
      next.set(sessionId, request);
      return { inputRequests: next };
    }),

  setSessionMetadata: (sessionId, metadata) =>
    set((state) => {
      const next = new Map(state.sessionMetadata);
      next.set(sessionId, metadata);
      return { sessionMetadata: next };
    }),

  clearSession: (sessionId) =>
    set((state) => {
      const events = new Map(state.events);
      const messages = new Map(state.messages);
      const components = new Map(state.components);
      const tabs = new Map(state.tabs);
      const isStreaming = new Map(state.isStreaming);
      const lastEventId = new Map(state.lastEventId);
      const inputRequests = new Map(state.inputRequests);
      const sessionMetadata = new Map(state.sessionMetadata);

      events.delete(sessionId);
      messages.delete(sessionId);
      components.delete(sessionId);
      tabs.delete(sessionId);
      isStreaming.delete(sessionId);
      lastEventId.delete(sessionId);
      inputRequests.delete(sessionId);
      sessionMetadata.delete(sessionId);

      return { events, messages, components, tabs, isStreaming, lastEventId, inputRequests, sessionMetadata };
    }),
}));
