type ToastListener = (message: string) => void;

let listener: ToastListener | null = null;

export const setToastListener = (next: ToastListener | null): void => {
  listener = next;
};

export const showToast = (message: string): void => {
  listener?.(message);
};
