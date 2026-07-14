import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { methodColors } from '../theme';
import { HttpMethod } from '../types';

type Props = {
  method: HttpMethod;
  size?: 'sm' | 'md';
};

export default function MethodBadge({ method, size = 'sm' }: Props) {
  return (
    <Text
      style={[
        styles.badge,
        { color: methodColors[method] },
        size === 'md' && styles.md,
      ]}
    >
      {method === 'DELETE' ? 'DEL' : method === 'OPTIONS' ? 'OPT' : method}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 12,
    fontWeight: '700',
    width: 44,
  },
  md: {
    fontSize: 14,
    width: 56,
  },
});
