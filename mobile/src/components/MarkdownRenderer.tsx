import React, { useCallback } from 'react';
import { View, Text, Pressable } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { colors } from '../constants/colors';

interface MarkdownContentProps {
  text: string;
  isUser: boolean;
}

export function MarkdownContent({ text, isUser }: MarkdownContentProps) {
  const textColor = isUser ? 'text-white' : undefined;
  const textStyle = isUser ? undefined : { color: colors.text.primary };
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];
  let codeKey = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('```')) {
      if (inCodeBlock) {
        const code = codeBuffer.join('\n');
        elements.push(<CodeBlock key={`code-${codeKey++}`} code={code} />);
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      continue;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      continue;
    }

    const headerMatch = line.match(/^(#{1,3})\s+(.+)/);
    if (headerMatch) {
      const level = headerMatch[1].length;
      const sizes = ['text-lg', 'text-base', 'text-sm'];
      elements.push(
        <Text key={i} className={`${textColor ?? ''} ${sizes[level - 1]} font-bold mt-1`} style={textStyle}>
          {headerMatch[2]}
        </Text>
      );
      continue;
    }

    if (line.match(/^[-*]\s+/)) {
      elements.push(
        <View key={i} className="flex-row mt-0.5">
          <Text className={`${textColor ?? ''} text-sm`} style={textStyle}>  {'\u2022'} </Text>
          <Text className={`${textColor ?? ''} text-sm flex-1`} style={textStyle}>
            {renderInline(line.replace(/^[-*]\s+/, ''), isUser)}
          </Text>
        </View>
      );
      continue;
    }

    if (line.trim() === '') {
      elements.push(<View key={i} className="h-2" />);
    } else {
      elements.push(
        <Text key={i} className={`${textColor ?? ''} text-sm`} style={textStyle}>
          {renderInline(line, isUser)}
        </Text>
      );
    }
  }

  if (inCodeBlock && codeBuffer.length > 0) {
    elements.push(<CodeBlock key={`code-${codeKey}`} code={codeBuffer.join('\n')} />);
  }

  return <>{elements}</>;
}

function renderInline(text: string, isUser: boolean): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const codeStyle = isUser ? undefined : { color: colors.code.inline };
  const codeClassName = isUser ? 'font-mono text-orange-100 bg-black/20 text-xs' : 'font-mono bg-black/20 text-xs';
  const linkStyle = isUser ? undefined : { color: colors.accent.light };
  const linkClassName = isUser ? 'text-orange-200 underline' : 'underline';
  const regex = /`([^`]+)`|\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(
        <Text key={match.index} className={codeClassName} style={codeStyle}>
          {match[1]}
        </Text>
      );
    } else if (match[2]) {
      parts.push(<Text key={match.index} className="font-bold">{match[2]}</Text>);
    } else if (match[3]) {
      parts.push(
        <Text key={match.index} className={linkClassName} style={linkStyle}>
          {match[3]}
        </Text>
      );
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function CodeBlock({ code }: { code: string }) {
  const handleCopy = useCallback(async () => {
    await Clipboard.setStringAsync(code);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, [code]);

  return (
    <Pressable onLongPress={handleCopy} className="bg-black/40 rounded-lg p-3 my-1">
      <Text className="font-mono text-xs leading-4" selectable style={{ color: colors.code.text }}>
        {code}
      </Text>
      <Text className="text-[10px] mt-1" style={{ color: colors.text.dim }}>long press to copy</Text>
    </Pressable>
  );
}
