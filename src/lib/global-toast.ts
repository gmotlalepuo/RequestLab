export const GLOBAL_TOAST_EVENT = "requestlab:toast";

export function showGlobalToast(message: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GLOBAL_TOAST_EVENT, { detail: message }));
}
