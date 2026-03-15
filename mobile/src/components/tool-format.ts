// shared tool formatting for ToolActivity bubbles and permission bar

const TOOL_DESCRIPTIONS: Record<string, string> = {
  Read: 'read file',
  Write: 'write file',
  Edit: 'edit file',
  Bash: 'run command',
  Glob: 'find files',
  Grep: 'search code',
  Agent: 'run agent',
  WebFetch: 'fetch url',
  WebSearch: 'web search',
  NotebookEdit: 'edit notebook',
  Skill: 'use skill',
};

// primary param to show for each tool type
const PRIMARY_PARAMS: Record<string, string[]> = {
  Read: ['file_path'],
  Write: ['file_path'],
  Edit: ['file_path'],
  Bash: ['command', 'description'],
  Glob: ['pattern', 'path'],
  Grep: ['pattern', 'path'],
  Agent: ['description', 'prompt'],
  WebFetch: ['url'],
  WebSearch: ['query'],
  Skill: ['skill'],
};

// format tool name: "Read — read file", "vibelink: render_ui"
export function formatToolName(name: string): string {
  if (name.startsWith('mcp__')) {
    const parts = name.split('__');
    return parts.length >= 3 ? `${parts[1]}: ${parts.slice(2).join('_')}` : name;
  }
  const desc = TOOL_DESCRIPTIONS[name];
  return desc ? `${name} — ${desc}` : name;
}

// extract the most useful param value for display
export function formatToolParam(toolName: string, input: Record<string, unknown>): string {
  const keys = PRIMARY_PARAMS[toolName];
  if (keys) {
    for (const key of keys) {
      const val = input[key];
      if (typeof val === 'string' && val.length > 0) {
        return truncateParam(toolName, key, val);
      }
    }
  }

  // fallback: first string param
  for (const [key, val] of Object.entries(input)) {
    if (typeof val === 'string' && val.length > 0) {
      return truncateParam(toolName, key, val);
    }
  }

  return '';
}

// format for permission bar: richer, two lines possible
export function formatToolInput(toolName: string, input: Record<string, unknown>): string {
  const param = formatToolParam(toolName, input);
  if (param) return param;

  // last resort: compact JSON
  const json = JSON.stringify(input);
  return json.length > 100 ? json.substring(0, 97) + '...' : json;
}

function truncateParam(toolName: string, key: string, val: string): string {
  // for file paths, show just the filename or last 2 segments
  if (key === 'file_path' || key === 'path' || key === 'filename') {
    const segments = val.split('/').filter(Boolean);
    return segments.length > 2
      ? segments.slice(-2).join('/')
      : segments.join('/') || val;
  }

  // for commands, show description if available or truncated command
  if (key === 'description') {
    return val.length > 60 ? val.substring(0, 57) + '...' : val;
  }

  if (key === 'command') {
    return val.length > 50 ? val.substring(0, 47) + '...' : val;
  }

  // default truncation
  return val.length > 60 ? val.substring(0, 57) + '...' : val;
}
