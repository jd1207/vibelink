import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Switch, Pressable, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useColors } from '../store/settings';

interface FormField {
  id: string; label: string; type: 'text' | 'select' | 'checkbox';
  options?: string[]; placeholder?: string; required?: boolean;
}

interface FormRendererProps {
  fields: FormField[]; submitLabel?: string;
  onInteraction?: (action: string, value: unknown) => void;
}

export function FormRenderer({ fields, submitLabel, onInteraction }: FormRendererProps) {
  const colors = useColors();
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const updateField = useCallback((id: string, v: string | boolean) => setValues((p) => ({ ...p, [id]: v })), []);

  const handleSubmit = useCallback(() => {
    const missing = fields.filter((f) => f.required && !values[f.id] && values[f.id] !== false);
    if (missing.length > 0) { Alert.alert('required fields', `please fill: ${missing.map((f) => f.label).join(', ')}`); return; }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onInteraction?.('submit', values);
  }, [fields, values, onInteraction]);

  return (
    <View className="my-2 rounded-lg p-4" style={{ backgroundColor: colors.bg.surface }}>
      {fields.map((field) => (
        <FormFieldRow key={field.id} field={field} value={values[field.id]} onChange={(v) => updateField(field.id, v)} />
      ))}
      <Pressable onPress={handleSubmit} className="rounded-xl py-3 items-center mt-3 active:opacity-80"
        style={{ backgroundColor: colors.accent.primary }}>
        <Text className="font-semibold text-sm" style={{ color: colors.text.onAccent }}>{submitLabel ?? 'submit'}</Text>
      </Pressable>
    </View>
  );
}

function FormFieldRow({ field, value, onChange }: { field: FormField; value: string | boolean | undefined; onChange: (v: string | boolean) => void }) {
  const colors = useColors();
  const label = field.label + (field.required ? ' *' : '');

  if (field.type === 'checkbox') {
    return (
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-sm" style={{ color: colors.text.muted }}>{label}</Text>
        <Switch value={!!value} onValueChange={onChange}
          trackColor={{ false: colors.border.subtle, true: colors.accent.primary }} thumbColor={colors.text.primary} />
      </View>
    );
  }
  if (field.type === 'select' && field.options) {
    const selected = (value as string) ?? '';
    return (
      <View className="mb-3">
        <Text className="text-sm mb-1.5" style={{ color: colors.text.muted }}>{label}</Text>
        <View className="flex-row flex-wrap gap-2">
          {field.options.map((opt) => (
            <Pressable key={opt} onPress={() => onChange(opt)} className="rounded-lg px-3 py-2 border"
              style={{ borderColor: selected === opt ? colors.accent.primary : colors.border.default,
                backgroundColor: selected === opt ? colors.interactive.selected : colors.bg.secondary }}>
              <Text className="text-xs" style={{ color: selected === opt ? colors.accent.light : colors.text.muted }}>{opt}</Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }
  return (
    <View className="mb-3">
      <Text className="text-sm mb-1.5" style={{ color: colors.text.muted }}>{label}</Text>
      <TextInput className="rounded-lg px-3 py-2.5 text-sm border"
        style={{ backgroundColor: colors.bg.secondary, borderColor: colors.border.default, color: colors.text.primary }}
        placeholder={field.placeholder ?? ''} placeholderTextColor={colors.text.dim}
        value={(value as string) ?? ''} onChangeText={onChange} />
    </View>
  );
}
