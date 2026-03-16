import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, Pressable, ActivityIndicator, Alert } from 'react-native';
import { useMessageStore, EMPTY_WATCH_INFO } from '../store/messages';
import { bridgeApi } from '../services/bridge-api';
import { useColors } from '../store/settings';
import type { WatchState } from '../store/message-types';

interface WatchBannerProps {
  sessionId: string;
  claudeSessionId: string | undefined;
  projectPath: string | undefined;
  sendRaw: (msg: { type: string; [key: string]: unknown }) => void;
  onSessionSwap: (newSessionId: string, watching: boolean) => void;
}

export function WatchBanner({ sessionId, claudeSessionId, projectPath, sendRaw, onSessionSwap }: WatchBannerProps) {
  const colors = useColors();
  const watchInfo = useMessageStore((s) => s.watchInfo[sessionId] ?? EMPTY_WATCH_INFO);
  const [timeAgo, setTimeAgo] = useState('just now');
  const autoWatchAttemptedRef = useRef(false);

  // update relative timestamp every 10s
  useEffect(() => {
    if (!watchInfo.lastUpdate) return;
    const update = () => {
      const seconds = Math.floor((Date.now() - watchInfo.lastUpdate) / 1000);
      if (seconds < 10) setTimeAgo('just now');
      else if (seconds < 60) setTimeAgo(`${seconds}s ago`);
      else setTimeAgo(`${Math.floor(seconds / 60)}m ago`);
    };
    update();
    const interval = setInterval(update, 10000);
    return () => clearInterval(interval);
  }, [watchInfo.lastUpdate]);

  // swap session in-place after successful take-over (no navigation)
  useEffect(() => {
    if (watchInfo.takenOverSessionId) {
      onSessionSwap(watchInfo.takenOverSessionId, false);
    }
  }, [watchInfo.takenOverSessionId, onSessionSwap]);

  // auto-reconnect watch when terminal resumes
  const state: WatchState = watchInfo.state;
  const isTerminalResumed = watchInfo.error === 'continued in terminal';
  useEffect(() => {
    if (state !== 'ended' || !isTerminalResumed || !claudeSessionId) return;
    if (autoWatchAttemptedRef.current) return;
    autoWatchAttemptedRef.current = true;

    bridgeApi.watchSession(claudeSessionId).then((result) => {
      useMessageStore.getState().setWatchState(result.sessionId, 'watching');
      onSessionSwap(result.sessionId, true);
    }).catch(() => {
      // watch failed (no JSONL yet) — leave banner showing, user can tap manually
      autoWatchAttemptedRef.current = false;
    });
  }, [state, isTerminalResumed, claudeSessionId, onSessionSwap]);

  // reset auto-watch flag when state changes away from ended
  useEffect(() => {
    if (state !== 'ended') {
      autoWatchAttemptedRef.current = false;
    }
  }, [state]);

  const handleTakeOver = useCallback(() => {
    if (!claudeSessionId) return;
    Alert.alert('take over', 'this will end the terminal session. continue?', [
      { text: 'cancel', style: 'cancel' },
      {
        text: 'take over', style: 'destructive',
        onPress: () => {
          useMessageStore.getState().setWatchState(sessionId, 'taking_over');
          sendRaw({ type: 'take_over', claudeSessionId });
        },
      },
    ]);
  }, [claudeSessionId, sessionId, sendRaw]);

  const handleResume = useCallback(async () => {
    if (!claudeSessionId || !projectPath) return;
    try {
      const result = await bridgeApi.createSession(projectPath, false, claudeSessionId);
      onSessionSwap(result.id, false);
    } catch (err: any) {
      Alert.alert('resume failed', err.message);
    }
  }, [claudeSessionId, projectPath, onSessionSwap]);

  const isTakenOver = watchInfo.error === 'session taken over by another device';
  const endedMessage = isTerminalResumed
    ? 'continued in terminal'
    : isTakenOver
    ? 'session taken over by another device'
    : 'session ended';

  if (state === 'watching') {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: colors.bg.surface, borderTopWidth: 1, borderTopColor: colors.border.default,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.status.success }} />
          <View>
            <Text style={{ color: colors.text.secondary, fontSize: 13, fontWeight: '600' }}>live from terminal</Text>
            {watchInfo.lastUpdate > 0 ? (
              <Text style={{ color: colors.text.subtle, fontSize: 11 }}>last update: {timeAgo}</Text>
            ) : null}
          </View>
        </View>
        {watchInfo.error ? (
          <Text style={{ color: colors.status.warning, fontSize: 11, flex: 1, textAlign: 'center' }}>
            {watchInfo.error}
          </Text>
        ) : null}
        <Pressable
          onPress={handleTakeOver}
          style={{
            backgroundColor: colors.accent.primary, borderRadius: 8,
            paddingHorizontal: 16, paddingVertical: 10,
          }}
        >
          <Text style={{ color: colors.text.onAccent, fontSize: 13, fontWeight: '700' }}>take over</Text>
        </Pressable>
      </View>
    );
  }

  if (state === 'taking_over') {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: colors.bg.surface, borderTopWidth: 1, borderTopColor: colors.border.default,
      }}>
        <ActivityIndicator size="small" color={colors.text.muted} />
        <Text style={{ color: colors.text.muted, fontSize: 13 }}>taking over...</Text>
      </View>
    );
  }

  if (state === 'ended') {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: colors.bg.surface, borderTopWidth: 1, borderTopColor: colors.border.default,
      }}>
        <Text style={{ color: colors.text.muted, fontSize: 13 }}>
          {endedMessage}
        </Text>
        {isTerminalResumed && claudeSessionId ? (
          <Pressable
            onPress={() => {
              bridgeApi.watchSession(claudeSessionId).then((result) => {
                useMessageStore.getState().setWatchState(result.sessionId, 'watching');
                onSessionSwap(result.sessionId, true);
              }).catch(() => {});
            }}
            style={{
              backgroundColor: colors.accent.primary, borderRadius: 8,
              paddingHorizontal: 16, paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text.onAccent, fontSize: 13, fontWeight: '700' }}>watch</Text>
          </Pressable>
        ) : !isTakenOver && claudeSessionId && projectPath ? (
          <Pressable
            onPress={handleResume}
            style={{
              backgroundColor: colors.accent.primary, borderRadius: 8,
              paddingHorizontal: 16, paddingVertical: 10,
            }}
          >
            <Text style={{ color: colors.text.onAccent, fontSize: 13, fontWeight: '700' }}>resume</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        paddingHorizontal: 16, paddingVertical: 14,
        backgroundColor: colors.bg.surface, borderTopWidth: 1, borderTopColor: colors.status.errorDark + '33',
      }}>
        <Text style={{ color: colors.status.error, fontSize: 13 }}>
          {watchInfo.error ?? 'unknown error'}
        </Text>
      </View>
    );
  }

  return null;
}
