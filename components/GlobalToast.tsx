"use client";

import { useEffect, useRef, useState } from "react";
import { GLOBAL_TOAST_EVENT } from "@/src/lib/global-toast";

export default function GlobalToast() {
  const [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onToast = (event: Event) => {
      const next = (event as CustomEvent<string>).detail;
      if (!next) return;
      setMessage(next);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setMessage(""), 2800);
    };
    window.addEventListener(GLOBAL_TOAST_EVENT, onToast);
    return () => {
      window.removeEventListener(GLOBAL_TOAST_EVENT, onToast);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  if (!message) return null;
  return <div className="global-toast" role="status" aria-live="polite">{message}</div>;
}
