import React, { useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { MarkdownContent } from './MarkdownRenderer';

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
  // file content view
  if (fileName && fileContent != null) {
    const isMarkdown = fileName.endsWith('.md');
    return (
      <View className="flex-1 bg-[#0a0a0a]">
        <Pressable
          onPress={onBack}
          className="flex-row items-center px-4 py-3 bg-[#18181b] border-b border-[#27272a]"
        >
          <Text className="text-[#3b82f6] text-sm font-semibold mr-2">{'\u2190'}</Text>
          <Text className="text-[#fafafa] text-sm font-mono flex-1" numberOfLines={1}>
            {fileName}
          </Text>
        </Pressable>
        <ScrollView className="flex-1 px-4 py-3">
          {isMarkdown ? (
            <MarkdownContent text={fileContent} isUser={false} />
          ) : (
            <FileContentView content={fileContent} />
          )}
          <View className="h-8" />
        </ScrollView>
      </View>
    );
  }

  // directory listing view
  const isRoot = currentPath === '.' || currentPath === '';
  return (
    <View className="flex-1 bg-[#0a0a0a]">
      <View className="flex-row items-center px-4 py-3 bg-[#18181b] border-b border-[#27272a]">
        {!isRoot && (
          <Pressable onPress={onBack} className="mr-2">
            <Text className="text-[#3b82f6] text-sm font-semibold">{'\u2190'}</Text>
          </Pressable>
        )}
        <Text className="text-[#a1a1aa] text-xs font-mono flex-1" numberOfLines={1}>
          /{currentPath === '.' ? '' : currentPath}
        </Text>
        <Text className="text-[#52525b] text-xs ml-2">
          {entries.length} items
        </Text>
      </View>

      {loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color="#3b82f6" />
        </View>
      ) : (
        <ScrollView className="flex-1">
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
            <Text className="text-[#52525b] text-sm text-center mt-8">
              empty directory
            </Text>
          )}
          <View className="h-8" />
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
  const isDir = entry.type === 'directory';
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center px-4 py-3 border-b border-[#1a1a1f] active:bg-[#1e1e24]"
    >
      <Text className="text-base w-8 text-center">
        {isDir ? '\u{1F4C1}' : fileIcon(entry.name)}
      </Text>
      <View className="flex-1 ml-2">
        <Text
          className={`text-sm font-mono ${isDir ? 'text-[#60a5fa] font-semibold' : 'text-[#fafafa]'}`}
          numberOfLines={1}
        >
          {entry.name}
        </Text>
        <Text className="text-[#52525b] text-xs mt-0.5">
          {isDir ? 'directory' : formatSize(entry.size)}
          {'  '}
          {formatDate(entry.modified)}
        </Text>
      </View>
      {isDir && (
        <Text className="text-[#52525b] text-sm">{'\u203A'}</Text>
      )}
    </Pressable>
  );
}

function ParentDirRow({ onPress }: { onPress: () => void }) {
  const handlePress = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  }, [onPress]);

  return (
    <Pressable
      onPress={handlePress}
      className="flex-row items-center px-4 py-3 border-b border-[#1a1a1f] active:bg-[#1e1e24]"
    >
      <Text className="text-base w-8 text-center">{'\u2190'}</Text>
      <Text className="text-[#60a5fa] text-sm font-mono ml-2">..</Text>
    </Pressable>
  );
}

function FileContentView({ content }: { content: string }) {
  const lines = content.split('\n');
  return (
    <View className="bg-[#111113] rounded-lg p-3">
      {lines.map((line, i) => (
        <View key={i} className="flex-row">
          <Text className="text-[#3f3f46] text-xs font-mono w-10 text-right mr-3">
            {i + 1}
          </Text>
          <Text
            className="text-[#e2e8f0] text-xs font-mono flex-1"
            selectable
          >
            {line || ' '}
          </Text>
        </View>
      ))}
    </View>
  );
}
