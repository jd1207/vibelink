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
  error?: string;
  resumable?: boolean;
  reason?: string;
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
