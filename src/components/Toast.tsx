import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { setToastListener } from '../lib/toast';
import { spacing } from '../theme';

const TOAST_DURATION_MS = 2600;

export default function Toast() {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setToastListener((next) => {
      setMessage(next);
      if (timer.current) {
        clearTimeout(timer.current);
      }
      timer.current = setTimeout(() => setMessage(null), TOAST_DURATION_MS);
    });
    return () => {
      setToastListener(null);
      if (timer.current) {
        clearTimeout(timer.current);
      }
    };
  }, []);

  if (message === null) {
    return null;
  }

  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.toast}>
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
  },
  toast: {
    backgroundColor: 'rgba(33, 33, 33, 0.92)',
    borderRadius: 20,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    maxWidth: '85%',
  },
  text: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '500',
  },
});
