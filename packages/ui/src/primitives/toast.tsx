// Toast — the in-house toast queue (R7KIT.2; REQ-KIT-2). There is deliberately no
// `@radix-ui/react-toast` in the ADR-129 stack, so the queue is owned here: a provider holds the
// list, `useToast()` returns `push`/`dismiss`, and the viewport renders a fixed `role="region"`
// live area. Styling is `.ui-toast*` from `uiCss()`; every user-facing string — including the
// dismiss button's `aria-label` and the region's `aria-label` — is a required/optional prop
// (REQ-UX-12, no copy in primitives).

import { createContext, useCallback, useContext, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { IconButton } from "./button.js";

export type ToastTone = "neutral" | "ok" | "attention" | "danger";

export interface ToastInput {
  /** The toast heading. */
  title: ReactNode;
  /** Optional body line under the title. */
  body?: ReactNode;
  tone?: ToastTone;
  /** Auto-dismiss after this many ms (default: the provider's `durationMs`). */
  durationMs?: number;
  /** Optional trailing action node (a Button/ActionLink). */
  action?: ReactNode;
}

interface ToastRecord extends ToastInput {
  id: string;
}

export interface ToastQueue {
  push: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastQueue | null>(null);

/** The queue handle — throws outside a provider so a missed mount is loud, not silent. */
export function useToast(): ToastQueue {
  const ctx = useContext(ToastContext);
  if (ctx == null) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}

export interface ToastProviderProps {
  children?: ReactNode;
  /** Default auto-dismiss ms (per-toast `durationMs` overrides). */
  durationMs?: number;
  /** Required — the dismiss button's accessible name (from the app's copy table). */
  dismissLabel: string;
  /** The viewport region's accessible name. */
  viewportLabel?: string;
}

export function ToastProvider({
  children,
  durationMs = 6000,
  dismissLabel,
  viewportLabel,
}: ToastProviderProps): ReactNode {
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);
  const idBase = useId();
  const counter = useRef(0);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const t = timers.current.get(id);
    if (t != null) {
      clearTimeout(t);
      timers.current.delete(id);
    }
    setToasts((cur) => cur.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (input: ToastInput): string => {
      counter.current += 1;
      const id = `${idBase}-${counter.current}`;
      setToasts((cur) => [...cur, { ...input, id }]);
      const ms = input.durationMs ?? durationMs;
      if (ms > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ms),
        );
      }
      return id;
    },
    [dismiss, durationMs, idBase],
  );

  const queue = useMemo<ToastQueue>(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={queue}>
      {children}
      <ul className="ui-toast-viewport" role="region" aria-label={viewportLabel}>
        {toasts.map((toast) => (
          <li
            key={toast.id}
            role="status"
            className={`ui-toast ui-toast--${toast.tone ?? "neutral"}`}
          >
            <span className="ui-toast-body-wrap">
              <span className="ui-toast-title">{toast.title}</span>
              {toast.body != null ? <span className="ui-toast-body">{toast.body}</span> : null}
            </span>
            {toast.action}
            <IconButton
              className="ui-toast-dismiss"
              aria-label={dismissLabel}
              onClick={() => dismiss(toast.id)}
            >
              ×
            </IconButton>
          </li>
        ))}
      </ul>
    </ToastContext.Provider>
  );
}
