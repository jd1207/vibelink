import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MarkdownContent } from './MarkdownRenderer';
import { useColors } from '../store/settings';

export interface FileEntry {
  name: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
}

interface FileBrowserProps {
  entries: FileEntry[];
  currentPath: string;
  onNavigate: (path: string) => void;
  onFileSelect: (path: string) => void;
  fileContent?: string | null;
  fileName?: string | null;
  loading?: boolean;
  onBack?: () => void;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en', { month: 'short' });
  const day = d.getDate();
  const hours = d.getHours().toString().padStart(2, '0');
  const mins = d.getMinutes().toString().padStart(2, '0');
  return `${month} ${day} ${hours}:${mins}`;
}

function fileIcon(name: string): string {
  if (name.endsWith('.ts') || name.endsWith('.tsx')) return '\u{1F1F9}';
  if (name.endsWith('.js') || name.endsWith('.jsx')) return '\u{1F1EF}';
  if (name.endsWith('.json')) return '{}';
  if (name.endsWith('.md')) return '\u{1F4D6}';
  if (name.endsWith('.sh')) return '$';
  if (name.endsWith('.css')) return '#';
  if (name.endsWith('.html')) return '<>';
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.svg')) return '\u{1F5BC}';
  return '\u{1F4C4}';
}

export function FileBrowser({
  entries,
  currentPath,
  onNavigate,
  onFileSelect,
  fileContent,
  fileName,
  loading,
  onBack,
}: FileBrowserProps) {
  const colors = useColors();

  // file content view
  if (fileName && fileContent != null) {
    const isMarkdown = fileName.endsWith('.md');
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
        <Pressable
          onPress={onBack}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingHorizontal: 16,
            paddingVertical: 12,
            backgroundColor: colors.bg.surface,
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderBottomColor: colors.border.default,
          }}
        >
          <Text style={{ color: colors.accent.primary, fontSize: 14, fontWeight: '600', marginRight: 8 }}>
            {'\u2190'}
          </Text>
          <Text style={{ color: colors.text.primary, fontSize: 14, fontFamily: 'monospace', flex: 1 }} numberOfLines={1}>
            {fileName}
          </Text>
        </Pressable>
        <ScrollView style={{ flex: 1, paddingHorizontal: 16, paddingVertical: 12 }}>
          {isMarkdown ? (
            <MarkdownContent text={fileContent} isUser={false} />
          ) : (
            <FileContentView content={fileContent} />
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      </View>
    );
  }

  // directory listing view
  const isRoot = currentPath === '.' || currentPath === '';
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg.primary }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: colors.bg.surface,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border.default,
        }}
      >
        {!isRoot && (
          <Pressable onPress={onBack} style={{ marginRight: 8 }}>
            <Text style={{ color: colors.accent.primary, fontSize: 14, fontWeight: '600' }}>
              {'\u2190'}
            </Text>
          </Pressable>
        )}
        <Text style={{ color: colors.text.muted, fontSize: 12, fontFamily: 'monospace', flex: 1 }} numberOfLines={1}>
          /{currentPath === '.' ? '' : currentPath}
        </Text>
        <Text style={{ color: colors.text.dim, fontSize: 12, marginLeft: 8 }}>
          {entries.length} items
        </Text>
      </View>

      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.accent.primary} />
        </View>
      ) : (
        <ScrollView style={{ flex: 1 }}>
          {!isRoot && (
            <ParentDirRow onPress={onBack!} />
          )}
          {entries.map((entry) => (
            <FileRow
              key={entry.name}
              entry={entry}
              onPress={() => {
                if (entry.type === 'directory') {
                  onNavigate(
                    currentPath === '.' || currentPath === ''
                      ? entry.name
                      : `${currentPath}/${entry.name}`
                  );
                } else {
                  onFileSelect(
                    currentPath === '.' || currentPath === ''
                      ? entry.name
                      : `${currentPath}/${entry.name}`
                  );
                }
              }}
            />
          ))}
          {entries.length === 0 && (
            <Text style={{ color: colors.text.dim, fontSize: 14, textAlign: 'center', marginTop: 32 }}>
              empty directory
            </Text>
          )}
          <View style={{ height: 32 }} />
        </ScrollView>
      )}
    </View>
  );
}

interface FileRowProps {
  entry: FileEntry;
  onPress: () => void;
}

function FileRow({ entry, onPress }: FileRowProps) {
  const colors = useColors();
  const isDir = entry.type === 'directory';
  const [pressed, setPressed] = useState(false);
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border.default,
        backgroundColor: pressed ? colors.bg.elevated : 'transparent',
      }}
    >
      <Text style={{ fontSize: 16, width: 32, textAlign: 'center' }}>
        {isDir ? '\u{1F4C1}' : fileIcon(entry.name)}
      </Text>
      <View style={{ flex: 1, marginLeft: 8 }}>
        <Text
          style={{
            fontSize: 14,
            fontFamily: 'monospace',
            color: isDir ? colors.accent.light : colors.text.primary,
            fontWeight: isDir ? '600' : '400',
          }}
          numberOfLines={1}
        >
          {entry.name}
        </Text>
        <Text style={{ color: colors.text.dim, fontSize: 12, marginTop: 2 }}>
          {isDir ? 'directory' : formatSize(entry.size)}
          {'  '}
          {formatDate(entry.modified)}
        </Text>
      </View>
      {isDir && (
        <Text style={{ color: colors.text.dim, fontSize: 14 }}>{'\u203A'}</Text>
      )}
    </Pressable>
  );
}

function ParentDirRow({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const [pressed, setPressed] = useState(false);
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border.default,
        backgroundColor: pressed ? colors.bg.elevated : 'transparent',
      }}
    >
      <Text style={{ fontSize: 16, width: 32, textAlign: 'center' }}>{'\u2190'}</Text>
      <Text style={{ color: colors.accent.light, fontSize: 14, fontFamily: 'monospace', marginLeft: 8 }}>..</Text>
    </Pressable>
  );
}

function FileContentView({ content }: { content: string }) {
  const colors = useColors();
  const lines = content.split('\n');
  return (
    <View
      style={{
        backgroundColor: colors.bg.secondary,
        borderRadius: 8,
        padding: 12,
      }}
    >
      {lines.map((line, i) => (
        <View key={i} style={{ flexDirection: 'row' }}>
          <Text style={{ color: colors.text.dim, fontSize: 12, fontFamily: 'monospace', width: 40, textAlign: 'right', marginRight: 12 }}>
            {i + 1}
          </Text>
          <Text
            style={{ color: colors.text.secondary, fontSize: 12, fontFamily: 'monospace', flex: 1 }}
            selectable
          >
            {line || ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}
