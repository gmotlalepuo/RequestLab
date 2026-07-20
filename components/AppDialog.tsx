"use client";

import { FormEvent, useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

type DialogRequest = {
  title: string;
  message?: string;
  label?: string;
  initialValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  inputType?: "text" | "password";
  minLength?: number;
  options?: { label: string; value: string }[];
};

type Pending = DialogRequest & { resolve: (value: string | null) => void };

export function useAppDialog() {
  const [pending, setPending] = useState<Pending | null>(null);
  const ask = useCallback((request: DialogRequest) => new Promise<string | null>((resolve) => setPending({ ...request, resolve })), []);
  const confirm = useCallback(async (request: Omit<DialogRequest, "initialValue" | "label">) => (await ask(request)) === "confirmed", [ask]);
  const close = useCallback((value: string | null) => {
    setPending((current) => { current?.resolve(value); return null; });
  }, []);
  const dialog = <AppDialog request={pending} onClose={close} />;
  return { ask, confirm, dialog };
}

function AppDialog({ request, onClose }: { request: Pending | null; onClose: (value: string | null) => void }) {
  const [value, setValue] = useState("");
  const titleId = useId();
  const descriptionId = useId();
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const hasInput = Boolean(request?.label || request?.options);
  useEffect(() => {
    if (!request) return;
    setValue(request.initialValue ?? request.options?.[0]?.value ?? "");
    const previous = document.activeElement as HTMLElement | null;
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose(null);
      if (event.key !== "Tab" || !formRef.current) return;
      const focusable = [...formRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')];
      if (!focusable.length) return;
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => { window.clearTimeout(timer); document.removeEventListener("keydown", keyboard); previous?.focus(); };
  }, [request, onClose]);
  if (!request) return null;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (hasInput && value.trim().length < (request.minLength ?? 1)) return;
    onClose(hasInput ? value.trim() : "confirmed");
  };
  return <div className="modal-scrim app-dialog-scrim" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose(null)}>
    <form ref={formRef} className="app-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={request.message ? descriptionId : undefined} onSubmit={submit}>
      <header><span className={request.destructive ? "dialog-icon destructive" : "dialog-icon"}>{request.destructive ? <AlertTriangle/> : null}</span><div><h2 id={titleId}>{request.title}</h2>{request.message && <p id={descriptionId}>{request.message}</p>}</div><button type="button" className="icon-button" aria-label="Close dialog" onClick={() => onClose(null)}><X/></button></header>
      {request.options ? <label>{request.label || "Choose an option"}<select ref={inputRef as React.RefObject<HTMLSelectElement>} value={value} onChange={(event) => setValue(event.target.value)}>{request.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
        : request.label ? <label>{request.label}<input ref={inputRef as React.RefObject<HTMLInputElement>} type={request.inputType ?? "text"} value={value} minLength={request.minLength} placeholder={request.placeholder} autoComplete={request.inputType === "password" ? "new-password" : "off"} onChange={(event) => setValue(event.target.value)}/></label> : null}
      <footer><button type="button" className="secondary" onClick={() => onClose(null)}>Cancel</button><button className={request.destructive ? "danger-button" : "primary"} disabled={hasInput && value.trim().length < (request.minLength ?? 1)}>{request.confirmLabel ?? (request.destructive ? "Delete" : "Save")}</button></footer>
    </form>
  </div>;
}
