import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { useStreamStore } from "../store/stream-store";

let WebView: React.ComponentType<any> | null = null;
try {
  WebView = require("react-native-webview").WebView;
} catch {
  // dev client not available
}

interface Props {
  sessionId: string;
  windowId: string;
  wsUrl: string;
  onConfirm?: (windowId: string) => void;
  onReject?: (windowId: string) => void;
}

// opens its own WebSocket to bridge for binary MJPEG frames
// separate connection from the main useWebSocket hook (JSON events)
function streamHtml(wsUrl: string, windowId: string): string {
  return `<!DOCTYPE html>
<html><head><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  * { margin:0; padding:0; }
  body { background:#0f172a; display:flex; flex-direction:column; height:100vh; }
  img { width:100%; object-fit:contain; flex:1; }
  .stats { color:#94a3b8; font:11px monospace; padding:4px 8px; background:#1e293b; }
  .empty { color:#475569; text-align:center; padding:40px; font:14px system-ui; }
</style></head><body>
<div class="stats" id="s">connecting...</div>
<img id="f" style="display:none" />
<div class="empty" id="p">waiting for stream...</div>
<script>
const ws = new WebSocket('${wsUrl}');
const f = document.getElementById('f');
const p = document.getElementById('p');
const s = document.getElementById('s');
const wid = '${windowId}';
let fc=0, lt=0, fps=0, prev=null;
ws.binaryType = 'arraybuffer';
ws.onopen = () => { s.textContent = 'connected'; };
ws.onclose = () => { s.textContent = 'disconnected'; };
ws.onmessage = (e) => {
  if (typeof e.data === 'string') return;
  const buf = new Uint8Array(e.data);
  if (buf.length < 20) return;
  if (buf[0]!==0x56||buf[1]!==0x4C||buf[2]!==0x53||buf[3]!==0x46) return;
  const id = new TextDecoder().decode(buf.slice(4,16)).replace(/^0+/,'');
  if (id !== wid) return;
  const jpeg = buf.slice(20);
  const blob = new Blob([jpeg], {type:'image/jpeg'});
  const url = URL.createObjectURL(blob);
  if (prev) URL.revokeObjectURL(prev);
  prev = url;
  f.src = url; f.style.display='block'; p.style.display='none';
  fc++;
  const now = performance.now();
  if (lt > 0) fps = 0.9*fps + 0.1*(1000/(now-lt));
  lt = now;
  s.textContent = fps.toFixed(1)+' fps | '+(jpeg.length/1024|0)+' KB';
};
</script></body></html>`;
}

export function StreamView({ sessionId, windowId, wsUrl, onConfirm, onReject }: Props) {
  const tab = useStreamStore((s) => s.streamTabs[sessionId]?.[windowId]);

  if (!tab) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" }}>
        <Text style={{ color: "#475569" }}>stream not found</Text>
      </View>
    );
  }

  if (tab.status === "error") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" }}>
        <Text style={{ color: "#f87171", fontSize: 14 }}>stream error</Text>
        <Text style={{ color: "#94a3b8", fontSize: 12, marginTop: 8 }}>{tab.errorMessage}</Text>
      </View>
    );
  }

  if (tab.status === "confirming") {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" }}>
        <Text style={{ color: "#e2e8f0", fontSize: 14, marginBottom: 16 }}>
          stream {tab.windowTitle}?
        </Text>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <TouchableOpacity
            onPress={() => onConfirm?.(windowId)}
            style={{ backgroundColor: "#2563eb", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 6 }}
          >
            <Text style={{ color: "#fff", fontSize: 14 }}>yes</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onReject?.(windowId)}
            style={{ backgroundColor: "#334155", paddingHorizontal: 24, paddingVertical: 10, borderRadius: 6 }}
          >
            <Text style={{ color: "#94a3b8", fontSize: 14 }}>cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!WebView) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", backgroundColor: "#0f172a" }}>
        <Text style={{ color: "#94a3b8" }}>WebView not available (use dev client)</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#0f172a" }}>
      <WebView
        source={{ html: streamHtml(wsUrl, windowId) }}
        style={{ flex: 1, backgroundColor: "#0f172a" }}
        javaScriptEnabled
        originWhitelist={["*"]}
      />
    </View>
  );
}
