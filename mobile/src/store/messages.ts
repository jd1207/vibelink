import { create } from 'zustand';

interface MessageState {
  // raw NDJSON events per session (for CLI tab)
  events: Map<string, unknown[]>;
  // parsed messages per session (for GUI tab)
  messages: Map<string, unknown[]>;
  // dynamic components per session: sessionId → componentId → component
  components: Map<string, Map<string, unknown>>;
  // dynamic tabs per session
  tabs: Map<string, unknown[]>;
  // streaming state per session
  isStreaming: Map<string, boolean>;

  appendEvent: (sessionId: string, event: unknown) => void;
  appendMessage: (sessionId: string, message: unknown) => void;
  setComponent: (sessionId: string, componentId: string, component: unknown) => void;
  setTabs: (sessionId: string, tabs: unknown[]) => void;
  setStreaming: (sessionId: string, streaming: boolean) => void;
  clearSession: (sessionId: string) => void;
}

export const useMessageStore = create<MessageState>((set) => ({
  events: new Map(),
  messages: new Map(),
  components: new Map(),
  tabs: new Map(),
  isStreaming: new Map(),

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

  clearSession: (sessionId) =>
    set((state) => {
      const events = new Map(state.events);
      const messages = new Map(state.messages);
      const components = new Map(state.components);
      const tabs = new Map(state.tabs);
      const isStreaming = new Map(state.isStreaming);

      events.delete(sessionId);
      messages.delete(sessionId);
      components.delete(sessionId);
      tabs.delete(sessionId);
      isStreaming.delete(sessionId);

      return { events, messages, components, tabs, isStreaming };
    }),
}));
