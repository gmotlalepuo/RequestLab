import { Alert, Platform } from 'react-native';
import { showToast } from './toast';

/** Non-blocking notification shown as a toast on every platform. */
export const notify = (message: string): void => {
  showToast(message);
};

type ConfirmOptions = {
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
};

/** Confirmation dialog: native Alert on iOS/Android, window.confirm on web. */
export const confirmAction = ({
  title,
  message,
  confirmLabel = 'OK',
  destructive = false,
  onConfirm,
}: ConfirmOptions): void => {
  if (Platform.OS === 'web') {
    const confirmed = (globalThis as unknown as { confirm(text: string): boolean }).confirm(
      `${title}\n\n${message}`,
    );
    if (confirmed) {
      onConfirm();
    }
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: destructive ? 'destructive' : 'default',
      onPress: onConfirm,
    },
  ]);
};
