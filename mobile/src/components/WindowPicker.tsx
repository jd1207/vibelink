import React from "react";
import { View, Text, TouchableOpacity, ScrollView, Modal } from "react-native";
import { useStreamStore, EMPTY_WINDOW_LIST } from "../store/stream-store";
import type { WindowInfo } from "../store/message-types";
import { useColors } from "../store/settings";

interface Props {
  sessionId: string;
  visible: boolean;
  onClose: () => void;
  onSelect: (window: WindowInfo) => void;
  onRefresh: () => void;
}

export function WindowPicker({ sessionId, visible, onClose, onSelect, onRefresh }: Props) {
  const colors = useColors();
  const windows = useStreamStore((s) => s.windowLists[sessionId] ?? EMPTY_WINDOW_LIST);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.5)" }}>
        <View style={{ backgroundColor: colors.bg.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "60%" }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border.default }}>
            <Text style={{ color: colors.text.secondary, fontSize: 16, fontWeight: "600" }}>open windows</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={{ color: colors.text.muted, fontSize: 14 }}>close</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 400 }}>
            {windows.length === 0 ? (
              <Text style={{ color: colors.text.dim, padding: 24, textAlign: "center" }}>no windows found</Text>
            ) : (
              windows.map((w) => (
                <TouchableOpacity
                  key={w.id}
                  onPress={() => { onSelect(w); onClose(); }}
                  style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: colors.bg.primary, flexDirection: "row", justifyContent: "space-between" }}
                >
                  <View style={{ flex: 1, marginRight: 12 }}>
                    <Text style={{ color: colors.text.secondary, fontSize: 14 }} numberOfLines={1}>{w.title}</Text>
                    {w.className ? <Text style={{ color: colors.text.subtle, fontSize: 11 }}>{w.className}</Text> : null}
                  </View>
                  <Text style={{ color: colors.text.dim, fontSize: 12 }}>{w.width}x{w.height}</Text>
                </TouchableOpacity>
              ))
            )}
          </ScrollView>

          <TouchableOpacity onPress={onRefresh} style={{ padding: 14, borderTopWidth: 1, borderTopColor: colors.border.default, alignItems: "center" }}>
            <Text style={{ color: colors.accent.primary, fontSize: 13 }}>refresh list</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
