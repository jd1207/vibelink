import type { ContentBlock } from '../store/messages';

export function parseContentBlocks(content: unknown[] | undefined): ContentBlock[] {
  if (!Array.isArray(content)) return [];

  return content.map((block) => {
    const b = block as Record<string, unknown>;
    return {
      type: (b.type as ContentBlock['type']) ?? 'text',
      text: b.text as string | undefined,
      id: (b.id ?? b.tool_use_id) as string | undefined,
      name: b.name as string | undefined,
      input: b.input,
      content: typeof b.content === 'string' ? b.content : undefined,
      isComplete: b.type === 'tool_result',
    };
  });
}
