import React, { useEffect } from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { useMessageStore, EMPTY_COMPONENTS } from '../store/messages';
import type { SessionMetadata, WorkspaceCanvas } from '../store/message-types';
import { MetadataPanel } from './MetadataPanel';
import { DynamicRenderer } from './DynamicRenderer';
import { FileBrowser } from './FileBrowser';
import { useFileBrowser } from '../hooks/useFileBrowser';

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
  const [workspaceTab, setWorkspaceTab] = React.useState<'canvas' | 'files'>('files');

  const componentList = React.useMemo(() => {
    return Object.values(components).filter(
      (c): c is DynamicComponent => c != null && typeof c === 'object' && 'id' in c && 'type' in c,
    );
  }, [components]);

  const hasMetadata = !!(metadata.model || metadata.cwd);
  const hasComponents = componentList.length > 0;
  const hasCanvas = canvas !== null;

  // auto-switch to canvas when content arrives
  React.useEffect(() => {
    if (hasCanvas || hasComponents) setWorkspaceTab('canvas');
  }, [hasCanvas, hasComponents]);

  const showTabBar = hasCanvas || hasComponents;

  return (
    <View className="flex-1">
      {hasMetadata ? <MetadataPanel metadata={metadata} /> : null}

      {showTabBar ? (
        <View className="flex-row px-4 py-1.5 border-b border-[#27272a]">
          <Pressable onPress={() => setWorkspaceTab('canvas')}>
            <Text className="text-xs mr-4" style={{ color: workspaceTab === 'canvas' ? '#fafafa' : '#52525b' }}>
              {canvas?.title || 'content'}
            </Text>
          </Pressable>
          <Pressable onPress={() => setWorkspaceTab('files')}>
            <Text className="text-xs" style={{ color: workspaceTab === 'files' ? '#fafafa' : '#52525b' }}>
              files
            </Text>
          </Pressable>
        </View>
      ) : null}

      {workspaceTab === 'files' || (!hasCanvas && !hasComponents) ? (
        <View style={{ display: workspaceTab === 'files' || (!hasCanvas && !hasComponents) ? 'flex' : 'none', flex: 1 }}>
          <WorkspaceFileBrowser sessionId={sessionId} />
        </View>
      ) : null}

      {workspaceTab === 'canvas' && hasCanvas ? (
        <CanvasWebView canvas={canvas} />
      ) : workspaceTab === 'canvas' && hasComponents ? (
        <ScrollView className="flex-1" contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          {componentList.map((comp) => (
            <View key={comp.id} className="mb-3">
              <DynamicRenderer component={comp} onInteraction={onComponentInteraction} />
            </View>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}

const DESKTOP_WIDTH = 1280;

const DESKTOP_VIEWPORT_JS = `(function(){
  var meta = document.querySelector('meta[name="viewport"]');
  if (!meta) { meta = document.createElement('meta'); meta.name = 'viewport'; document.head.appendChild(meta); }
  meta.content = 'width=${DESKTOP_WIDTH}';
})(); true;`;

function CanvasWebView({ canvas }: { canvas: WorkspaceCanvas }) {
  const [viewport, setViewport] = React.useState<'mobile' | 'desktop'>('mobile');

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

  const isDesktop = viewport === 'desktop';

  const source = canvas.mode === 'html'
    ? { html: wrapHtml(canvas.html ?? '', isDesktop) }
    : { uri: canvas.url ?? '' };

  return (
    <View className="flex-1">
      <View className="px-4 py-1.5 border-b border-[#27272a] flex-row items-center justify-between">
        <Text className="text-[#71717a] text-[10px] flex-1" numberOfLines={1}>
          {canvas.title ?? ''}
        </Text>
        <ViewportToggle
          mode={viewport}
          onToggle={() => setViewport((m) => (m === 'mobile' ? 'desktop' : 'mobile'))}
        />
      </View>

      <WebView
        key={viewport}
        source={source}
        style={{ flex: 1, backgroundColor: '#0a0a0a' }}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        startInLoadingState
        scalesPageToFit={isDesktop}
        injectedJavaScriptBeforeContentLoaded={isDesktop && canvas.mode === 'url' ? DESKTOP_VIEWPORT_JS : undefined}
      />
    </View>
  );
}

function ViewportToggle({ mode, onToggle }: { mode: 'mobile' | 'desktop'; onToggle: () => void }) {
  const isMobile = mode === 'mobile';
  return (
    <Pressable
      onPress={onToggle}
      className="flex-row items-center rounded px-2 py-1"
      style={{ backgroundColor: '#18181b', gap: 6 }}
    >
      <PhoneIcon active={isMobile} />
      <MonitorIcon active={!isMobile} />
    </Pressable>
  );
}

function PhoneIcon({ active }: { active: boolean }) {
  return (
    <View
      style={{
        width: 9,
        height: 15,
        borderRadius: 2,
        borderWidth: 1.5,
        borderColor: active ? '#3b82f6' : '#52525b',
      }}
    />
  );
}

function MonitorIcon({ active }: { active: boolean }) {
  const color = active ? '#3b82f6' : '#52525b';
  return (
    <View style={{ alignItems: 'center' }}>
      <View
        style={{
          width: 15,
          height: 10,
          borderRadius: 1.5,
          borderWidth: 1.5,
          borderColor: color,
        }}
      />
      <View style={{ width: 7, height: 0, borderBottomWidth: 1.5, borderColor: color }} />
    </View>
  );
}

function wrapHtml(html: string, desktop?: boolean): string {
  const viewportWidth = desktop ? `${DESKTOP_WIDTH}` : 'device-width';
  const viewportMeta = `<meta name="viewport" content="width=${viewportWidth},initial-scale=1">`;

  // full HTML document — replace or inject viewport meta
  if (html.includes('<html') || html.includes('<!DOCTYPE')) {
    const viewportRegex = /<meta[^>]*name=["']viewport["'][^>]*>/i;
    if (viewportRegex.test(html)) {
      return html.replace(viewportRegex, viewportMeta);
    }
    return html.replace(/<head[^>]*>/i, `$&\n${viewportMeta}`);
  }

  return `<!DOCTYPE html>
<html><head>
${viewportMeta}
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { background: #0a0a0a; color: #fafafa; font-family: -apple-system, system-ui, sans-serif; padding: 16px; }
</style>
</head><body>${html}</body></html>`;
}

function WorkspaceFileBrowser({ sessionId }: { sessionId: string }) {
  const fb = useFileBrowser(sessionId);

  useEffect(() => {
    fb.browse();
  }, []);

  return (
    <FileBrowser
      entries={fb.entries}
      currentPath={fb.currentPath}
      onNavigate={fb.browse}
      onFileSelect={fb.viewFile}
      fileContent={fb.fileContent}
      fileName={fb.fileName}
      loading={fb.loading}
      onBack={fb.navigateUp}
    />
  );
}

function BlueprintEmpty() {
  return (
    <View className="flex-1 items-center justify-center" style={{ backgroundColor: '#0a0a0a' }}>
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
          connect to a session to begin
        </Text>
      </View>
    </View>
  );
}
