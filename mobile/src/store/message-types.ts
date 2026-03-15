export interface ClaudeEvent {
  eventId: string;
  type: string;
  event?: {
    type: string;
    [key: string]: unknown;
  };
  component?: unknown;
  requestId?: string;
  prompt?: string;
  options?: string[];
  toolName?: string;
  toolInput?: unknown;
  componentId?: string;
  updates?: unknown;
  tab?: unknown;
  html?: string;
  url?: string;
  title?: string;
  error?: string;
  resumable?: boolean;
  reason?: string;
  windowId?: string;
  windowTitle?: string;
  windows?: WindowInfo[];
  accepted?: boolean;
  fps?: number;
  frameSize?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  contentBlocks?: ContentBlock[];
  timestamp: number;
  isStreaming?: boolean;
}

export interface ContentBlock {
  type: 'text' | 'tool_use' | 'tool_result';
  text?: string;
  id?: string;
  name?: string;
  input?: unknown;
  content?: string;
  isComplete?: boolean;
}

export interface InputRequest {
  requestId: string;
  prompt: string;
  options?: string[];
}

export interface SessionMetadata {
  model?: string;
  cwd?: string;
  sessionId?: string;
  permissionMode?: string;
  tools?: string[];
  mcpServers?: string[];
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  costUsd?: number;
  durationMs?: number;
  numTurns?: number;
  sessionStartedAt?: number;
}

export interface WorkspaceCanvas {
  mode: 'html' | 'url';
  html?: string;
  url?: string;
  title?: string;
}

export interface StreamTab {
  windowId: string;
  windowTitle: string;
  status: 'confirming' | 'streaming' | 'stopped' | 'error';
  fps?: number;
  frameSize?: number;
  errorMessage?: string;
}

export interface WindowInfo {
  id: string;
  title: string;
  className: string;
  width: number;
  height: number;
}
