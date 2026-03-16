import React, { useEffect, useState, useCallback } from 'react';
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
  const [swapping, setSwapping] = useState(false);

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

  // handle take_over_complete — swap session in-place
  useEffect(() => {
    if (watchInfo.takenOverSessionId) {
      onSessionSwap(watchInfo.takenOverSessionId, false);
    }
  }, [watchInfo.takenOverSessionId]);

  const state: WatchState = watchInfo.state;
  const isTerminalResumed = watchInfo.error === 'continued in terminal';
  const isTakenOver = watchInfo.error === 'session taken over by another device';

  // take over: kill terminal, get vibelink control
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

  // take over from "continued in terminal" state — create watch first, then take over
  const handleTakeOverFromTerminal = useCallback(async () => {
    if (!claudeSessionId || swapping) return;
    setSwapping(true);
    try {
      // create a watch session first
      const watchResult = await bridgeApi.watchSession(claudeSessionId);
      // swap to the watch session
      useMessageStore.getState().setWatchState(watchResult.sessionId, 'watching');
      onSessionSwap(watchResult.sessionId, true);
    } catch (err: any) {
      Alert.alert('failed', err.message || 'could not connect to terminal session');
      setSwapping(false);
    }
  }, [claudeSessionId, swapping, onSessionSwap]);

  // resume from ended state — create vibelink session
  const handleResume = useCallback(async () => {
    if (!claudeSessionId || !projectPath || swapping) return;
    setSwapping(true);
    try {
      const result = await bridgeApi.createSession(projectPath, false, claudeSessionId);
      onSessionSwap(result.id, false);
    } catch (err: any) {
      Alert.alert('resume failed', err.message);
      setSwapping(false);
    }
  }, [claudeSessionId, projectPath, swapping, onSessionSwap]);

  // --- watching state: live dot + take over button ---
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

  // --- taking over: loading spinner ---
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

  // --- ended state ---
  if (state === 'ended') {
    const message = isTerminalResumed
      ? 'continued in terminal'
      : isTakenOver
      ? 'taken over by another device'
      : 'session ended';

    // determine which button to show
    let button = null;
    if (isTerminalResumed && claudeSessionId) {
      // user went back to terminal — offer take over (goes through watch first)
      button = (
        <Pressable
          onPress={handleTakeOverFromTerminal}
          disabled={swapping}
          style={{
            backgroundColor: colors.accent.primary, borderRadius: 8,
            paddingHorizontal: 16, paddingVertical: 10,
            opacity: swapping ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.text.onAccent, fontSize: 13, fontWeight: '700' }}>
            {swapping ? 'connecting...' : 'take over'}
          </Text>
        </Pressable>
      );
    } else if (!isTakenOver && claudeSessionId && projectPath) {
      // session ended normally — offer resume
      button = (
        <Pressable
          onPress={handleResume}
          disabled={swapping}
          style={{
            backgroundColor: colors.accent.primary, borderRadius: 8,
            paddingHorizontal: 16, paddingVertical: 10,
            opacity: swapping ? 0.5 : 1,
          }}
        >
          <Text style={{ color: colors.text.onAccent, fontSize: 13, fontWeight: '700' }}>resume</Text>
        </Pressable>
      );
    }

    return (
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingVertical: 12,
        backgroundColor: colors.bg.surface, borderTopWidth: 1, borderTopColor: colors.border.default,
      }}>
        <Text style={{ color: colors.text.muted, fontSize: 13 }}>{message}</Text>
        {button}
      </View>
    );
  }

  // --- error state ---
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
