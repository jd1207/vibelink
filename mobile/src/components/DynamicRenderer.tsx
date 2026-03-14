import React, { useCallback } from 'react';
import { View, Text } from 'react-native';
import { DecisionTable } from './DecisionTable';
import { CodeViewer } from './CodeViewer';
import { FormRenderer } from './FormRenderer';
import { TreeView } from './TreeView';
import { ProgressBar } from './ProgressBar';
import { MarkdownContent } from './MarkdownRenderer';

interface DynamicComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
}

interface DynamicRendererProps {
  component: DynamicComponent;
  onInteraction?: (componentId: string, action: string, value: unknown) => void;
}

export const DynamicRenderer = React.memo(function DynamicRenderer({ component, onInteraction }: DynamicRendererProps) {
  const props = component.props ?? {};

  const handleInteraction = useCallback(
    (action: string, value: unknown) => {
      onInteraction?.(component.id, action, value);
    },
    [component.id, onInteraction],
  );

  switch (component.type) {
    case 'decision_table':
      return (
        <DecisionTable
          columns={(props.columns as string[]) ?? []}
          rows={(props.rows as string[][]) ?? []}
          selectable={props.selectable as boolean | undefined}
          title={props.title as string | undefined}
          onInteraction={handleInteraction}
        />
      );

    case 'code_viewer':
      return (
        <CodeViewer
          code={(props.code as string) ?? ''}
          language={props.language as string | undefined}
          diff={props.diff as boolean | undefined}
          title={props.title as string | undefined}
        />
      );

    case 'form':
      return (
        <FormRenderer
          fields={(props.fields as Array<{ id: string; label: string; type: 'text' | 'select' | 'checkbox'; options?: string[]; placeholder?: string; required?: boolean }>) ?? []}
          submitLabel={props.submitLabel as string | undefined}
          onInteraction={handleInteraction}
        />
      );

    case 'markdown':
      return (
        <View className="my-2 px-1">
          <MarkdownContent text={(props.text as string) ?? ''} isUser={false} />
        </View>
      );

    case 'progress':
      return (
        <ProgressBar
          value={(props.value as number) ?? 0}
          max={props.max as number | undefined}
          label={props.label as string | undefined}
        />
      );

    case 'tree_view':
      return (
        <TreeView
          items={(props.items as Array<{ name: string; type: 'file' | 'folder'; children?: unknown[] }>) ?? []}
          onInteraction={handleInteraction}
        />
      );

    case 'chart':
      return <ChartPlaceholder data={props} />;

    case 'image_gallery':
      return <ImageGallery images={(props.images as string[]) ?? []} />;

    default:
      return <JsonFallback data={component} />;
  }
});

// placeholder until a real charting lib is added
function ChartPlaceholder({ data }: { data: Record<string, unknown> }) {
  return (
    <View className="my-2 bg-[#18181b] rounded-lg p-4">
      <Text className="text-[#71717a] text-xs mb-1">chart (placeholder)</Text>
      <Text className="text-[#a1a1aa] text-xs font-mono" selectable>
        {JSON.stringify(data, null, 2)}
      </Text>
    </View>
  );
}

function ImageGallery({ images }: { images: string[] }) {
  return (
    <View className="my-2 flex-row flex-wrap gap-2">
      {images.map((uri, i) => (
        <View key={i} className="bg-[#18181b] rounded-lg p-2 w-24 h-24 items-center justify-center">
          <Text className="text-[#52525b] text-[10px] text-center" numberOfLines={2}>
            {uri}
          </Text>
        </View>
      ))}
    </View>
  );
}

function JsonFallback({ data }: { data: unknown }) {
  return (
    <View className="my-2 bg-[#111] rounded-lg p-3">
      <Text className="text-[#71717a] text-[10px] mb-1">unknown component</Text>
      <Text className="text-[#a1a1aa] text-xs font-mono" selectable>
        {JSON.stringify(data, null, 2)}
      </Text>
    </View>
  );
}
