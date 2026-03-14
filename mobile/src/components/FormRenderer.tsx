import React, { useState, useCallback } from 'react';
import { View, Text, TextInput, Switch, Pressable, Alert } from 'react-native';
import * as Haptics from 'expo-haptics';

interface FormField {
  id: string;
  label: string;
  type: 'text' | 'select' | 'checkbox';
  options?: string[];
  placeholder?: string;
  required?: boolean;
}

interface FormRendererProps {
  fields: FormField[];
  submitLabel?: string;
  onInteraction?: (action: string, value: unknown) => void;
}

export function FormRenderer({ fields, submitLabel, onInteraction }: FormRendererProps) {
  const [values, setValues] = useState<Record<string, string | boolean>>({});

  const updateField = useCallback((fieldId: string, value: string | boolean) => {
    setValues((prev) => ({ ...prev, [fieldId]: value }));
  }, []);

  const handleSubmit = useCallback(() => {
    const missing = fields.filter(
      (f) => f.required && !values[f.id] && values[f.id] !== false,
    );
    if (missing.length > 0) {
      Alert.alert('required fields', `please fill: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onInteraction?.('submit', values);
  }, [fields, values, onInteraction]);

  return (
    <View className="my-2 bg-[#18181b] rounded-lg p-4">
      {fields.map((field) => (
        <FormFieldRow
          key={field.id}
          field={field}
          value={values[field.id]}
          onChange={(v) => updateField(field.id, v)}
        />
      ))}
      <Pressable
        onPress={handleSubmit}
        className="bg-[#3b82f6] rounded-xl py-3 items-center mt-3 active:opacity-80"
      >
        <Text className="text-white font-semibold text-sm">{submitLabel ?? 'submit'}</Text>
      </Pressable>
    </View>
  );
}

interface FormFieldRowProps {
  field: FormField;
  value: string | boolean | undefined;
  onChange: (v: string | boolean) => void;
}

function FormFieldRow({ field, value, onChange }: FormFieldRowProps) {
  const label = field.label + (field.required ? ' *' : '');

  if (field.type === 'checkbox') {
    return (
      <View className="flex-row items-center justify-between mb-3">
        <Text className="text-[#a1a1aa] text-sm">{label}</Text>
        <Switch
          value={!!value}
          onValueChange={onChange}
          trackColor={{ false: '#27272a', true: '#3b82f6' }}
          thumbColor="#fafafa"
        />
      </View>
    );
  }

  if (field.type === 'select' && field.options) {
    const selected = (value as string) ?? '';
    return (
      <View className="mb-3">
        <Text className="text-[#a1a1aa] text-sm mb-1.5">{label}</Text>
        <View className="flex-row flex-wrap gap-2">
          {field.options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => onChange(opt)}
              className={`rounded-lg px-3 py-2 border ${
                selected === opt
                  ? 'border-[#3b82f6] bg-[#1e3a5f]'
                  : 'border-[#27272a] bg-[#0a0a0a]'
              }`}
            >
              <Text
                className={`text-xs ${selected === opt ? 'text-[#60a5fa]' : 'text-[#a1a1aa]'}`}
              >
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View className="mb-3">
      <Text className="text-[#a1a1aa] text-sm mb-1.5">{label}</Text>
      <TextInput
        className="bg-[#0a0a0a] border border-[#27272a] rounded-lg px-3 py-2.5 text-[#fafafa] text-sm"
        placeholder={field.placeholder ?? ''}
        placeholderTextColor="#52525b"
        value={(value as string) ?? ''}
        onChangeText={onChange}
      />
    </View>
  );
}
