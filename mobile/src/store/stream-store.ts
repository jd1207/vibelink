import { create } from "zustand";
import type { StreamTab, WindowInfo } from "./message-types";

interface StreamState {
  streamTabs: Record<string, Record<string, StreamTab>>;
  windowLists: Record<string, WindowInfo[]>;
  pickerOpen: Record<string, boolean>;

  addStreamTab: (sessionId: string, windowId: string, title: string, status?: StreamTab["status"]) => void;
  updateStreamTab: (sessionId: string, windowId: string, updates: Partial<StreamTab>) => void;
  removeStreamTab: (sessionId: string, windowId: string) => void;
  setWindowList: (sessionId: string, windows: WindowInfo[]) => void;
  setPickerOpen: (sessionId: string, open: boolean) => void;
  clearSession: (sessionId: string) => void;
}

export const useStreamStore = create<StreamState>((set) => ({
  streamTabs: {},
  windowLists: {},
  pickerOpen: {},

  addStreamTab: (sessionId, windowId, title, status = "streaming") =>
    set((s) => ({
      streamTabs: {
        ...s.streamTabs,
        [sessionId]: {
          ...s.streamTabs[sessionId],
          [windowId]: { windowId, windowTitle: title, status },
        },
      },
    })),

  updateStreamTab: (sessionId, windowId, updates) =>
    set((s) => {
      const tab = s.streamTabs[sessionId]?.[windowId];
      if (!tab) return s;
      return {
        streamTabs: {
          ...s.streamTabs,
          [sessionId]: {
            ...s.streamTabs[sessionId],
            [windowId]: { ...tab, ...updates },
          },
        },
      };
    }),

  removeStreamTab: (sessionId, windowId) =>
    set((s) => {
      const tabs = { ...s.streamTabs[sessionId] };
      delete tabs[windowId];
      return {
        streamTabs: { ...s.streamTabs, [sessionId]: tabs },
      };
    }),

  setWindowList: (sessionId, windows) =>
    set((s) => ({
      windowLists: { ...s.windowLists, [sessionId]: windows },
    })),

  setPickerOpen: (sessionId, open) =>
    set((s) => ({
      pickerOpen: { ...s.pickerOpen, [sessionId]: open },
    })),

  clearSession: (sessionId) =>
    set((s) => {
      const streamTabs = { ...s.streamTabs };
      const windowLists = { ...s.windowLists };
      const pickerOpen = { ...s.pickerOpen };
      delete streamTabs[sessionId];
      delete windowLists[sessionId];
      delete pickerOpen[sessionId];
      return { streamTabs, windowLists, pickerOpen };
    }),
}));
