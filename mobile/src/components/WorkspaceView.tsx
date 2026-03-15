import React from 'react';
import { View, Text, ScrollView } from 'react-native';
import { useMessageStore, EMPTY_COMPONENTS } from '../store/messages';
import type { SessionMetadata, WorkspaceCanvas } from '../store/message-types';
import { MetadataPanel } from './MetadataPanel';
import { DynamicRenderer } from './DynamicRenderer';

// conditional load — react-native-webview not available in Expo Go
let WebView: React.ComponentType<any> | null = null;
try {
  WebView = require('react-native-webview').WebView;
} catch {
  // expo go or missing native module
}

const EMPTY_METADATA: SessionMetadata = {};

interface DynamicComponent {
  id: string;
  type: string;
  props?: Record<string, unknown>;
}

interface WorkspaceViewProps {
  sessionId: string;
  onComponentInteraction: (componentId: string, action: string, value: unknown) => void;
}

export function WorkspaceView({ sessionId, onComponentInteraction }: WorkspaceViewProps) {
  const metadata = useMessageStore((s) => s.metadata[sessionId] ?? EMPTY_METADATA);
  const components = useMessageStore((s) => s.components[sessionId] ?? EMPTY_COMPONENTS);
  const canvas = useMessageStore((s) => s.canvas[sessionId] ?? null);

  const componentList = React.useMemo(() => {
    return Object.values(components).filter(
      (c): c is DynamicComponent => c != null && typeof c === 'object' && 'id' in c && 'type' in c,
    );
  }, [components]);

  const hasMetadata = !!(metadata.model || metadata.cwd);
  const hasComponents = componentList.length > 0;
  const hasCanvas = canvas !== null;

  return (
    <View className="flex-1">
      {hasMetadata ? <MetadataPanel metadata={metadata} /> : null}

      {hasCanvas ? (
        <CanvasWebView canvas={canvas} />
      ) : hasComponents ? (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {componentList.map((comp) => (
            <View key={comp.id} className="mb-3">
              <DynamicRenderer component={comp} onInteraction={onComponentInteraction} />
            </View>
          ))}
        </ScrollView>
      ) : (
        <BlueprintEmpty hasMetadata={hasMetadata} />
      )}
    </View>
  );
}

function CanvasWebView({ canvas }: { canvas: WorkspaceCanvas }) {
  if (!WebView) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-[#52525b] text-sm">webview requires standalone apk build</Text>
        {canvas.url ? (
          <Text className="text-[#3b82f6] text-xs mt-2" selectable>{canvas.url}</Text>
        ) : null}
      </View>
    );
  }

  const source = canvas.mode === 'html'
    ? { html: wrapHtml(canvas.html ?? '') }
    : { uri: canvas.url ?? '' };

  return (
    <View className="flex-1">
      {canvas.title ? (
        <View className="px-4 py-1.5 border-b border-[#27272a]">
          <Text className="text-[#71717a] text-[10px]">{canvas.title}</Text>
        </View>
      ) : null}
      <WebView
        source={source}
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState
        scalesPageToFit={false}
      />
    </View>
  );
}

function wrapHtml(html: string): string {
  if (html.includes('<html') || html.includes('<!DOCTYPE')) return html;
  return `<!DOCTYPE html>
<html><head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; padding: 16px; }
</style>
</head><body>${html}</body></html>`;
}

function BlueprintEmpty({ hasMetadata }: { hasMetadata: boolean }) {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
      {/* blueprint grid lines */}
      <View className="absolute inset-0 opacity-[0.04]">
        {Array.from({ length: 20 }).map((_, i) => (
          <View
            key={`h-${i}`}
            className="absolute left-0 right-0"
            style={{ top: i * 40, height: 1, backgroundColor: '#3b82f6' }}
          />
        ))}
        {Array.from({ length: 12 }).map((_, i) => (
          <View
            key={`v-${i}`}
            className="absolute top-0 bottom-0"
            style={{ left: i * 40, width: 1, backgroundColor: '#3b82f6' }}
          />
        ))}
      </View>

      <View className="items-center z-10">
        <Text className="text-[#1e293b] text-5xl font-light mb-2">workspace</Text>
        <Text className="text-[#27272a] text-sm text-center leading-5 px-8">
          {hasMetadata
            ? 'claude can render artifacts and previews here'
            : 'connect to a session to begin'}
        </Text>
      </View>
    </View>
  );
}
