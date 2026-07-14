import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, spacing } from '../theme';
import { KeyValue } from '../types';
import { newId } from '../lib/id';

type Props = {
  items: KeyValue[];
  onChange: (items: KeyValue[]) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
};

export default function KeyValueEditor({
  items,
  onChange,
  keyPlaceholder = 'Key',
  valuePlaceholder = 'Value',
}: Props) {
  const updateItem = (id: string, patch: Partial<KeyValue>) => {
    onChange(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    onChange(items.filter((item) => item.id !== id));
  };

  const addItem = () => {
    onChange([...items, { id: newId(), key: '', value: '', enabled: true }]);
  };

  return (
    <View>
      {items.map((item) => (
        <View key={item.id} style={styles.row}>
          <Pressable
            style={[styles.checkbox, item.enabled && styles.checkboxOn]}
            onPress={() => updateItem(item.id, { enabled: !item.enabled })}
            hitSlop={8}
          >
            {item.enabled && <Text style={styles.checkmark}>✓</Text>}
          </Pressable>
          <TextInput
            style={[styles.input, styles.keyInput, !item.enabled && styles.disabled]}
            value={item.key}
            onChangeText={(key) => updateItem(item.id, { key })}
            placeholder={keyPlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, styles.valueInput, !item.enabled && styles.disabled]}
            value={item.value}
            onChangeText={(value) => updateItem(item.id, { value })}
            placeholder={valuePlaceholder}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <Pressable onPress={() => removeItem(item.id)} hitSlop={8}>
            <Text style={styles.remove}>✕</Text>
          </Pressable>
        </View>
      ))}
      <Pressable style={styles.addButton} onPress={addItem}>
        <Text style={styles.addText}>+ Add</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  checkmark: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 14,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    fontSize: 14,
    color: colors.text,
  },
  keyInput: {
    flex: 2,
  },
  valueInput: {
    flex: 3,
  },
  disabled: {
    opacity: 0.5,
  },
  remove: {
    color: colors.textMuted,
    fontSize: 15,
    paddingHorizontal: 2,
  },
  addButton: {
    alignSelf: 'flex-start',
    paddingVertical: 6,
  },
  addText: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '600',
  },
});
