'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

/**
 * Toasts — transient confirmation for actions whose result is otherwise
 * invisible (a form that redirects, a mutation with no obvious page change).
 * Errors that a user must act on still belong inline, next to the field.
 */

export type ToastVariant = 'success' | 'error' | 'info';

export interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (message: string, variant?: ToastVariant) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const toast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = nextId.current++;
      setToasts((prev) => [...prev, { id, message, variant }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), DURATION_MS),
      );
    },
    [dismiss],
  );

  // Timers outlive the toasts they belong to if the tree unmounts mid-flight.
  useEffect(() => {
    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used inside <ToastProvider>');
  }
  return ctx;
}

/**
 * Fires a toast once per distinct action result. Server actions return a new
 * state object on every submit, so keying on identity gives one toast per
 * submission — including two identical failures in a row.
 */
export function useActionToast(
  state: {
    error?: string;
    success?: boolean | string;
    retryAfterSec?: number;
  } | null,
  successMessage?: string,
): void {
  const { toast } = useToast();
  const seen = useRef<unknown>(null);

  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;

    // A throttle is reported inline with a live countdown next to the control
    // it blocks. Toasting it as well would say the same thing twice, and the
    // toast would expire while the wait it describes is still running.
    if (state.retryAfterSec) return;

    if (state.error) {
      toast(state.error, 'error');
    } else if (state.success) {
      toast(
        typeof state.success === 'string'
          ? state.success
          : (successMessage ?? 'Done'),
        'success',
      );
    }
  }, [state, toast, successMessage]);
}

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success:
    'border-emerald-500/30 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/70 dark:text-emerald-100',
  error:
    'border-rose-500/30 bg-rose-50 text-rose-900 dark:bg-rose-950/70 dark:text-rose-100',
  info: 'border-zinc-200 bg-white text-zinc-900 dark:border-white/[0.08] dark:bg-ink-900 dark:text-zinc-100',
};

const VARIANT_GLYPH: Record<ToastVariant, string> = {
  success: '✓',
  error: '!',
  info: 'i',
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: number) => void;
}) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-4 sm:inset-x-auto sm:right-0 sm:items-end sm:px-6 sm:pb-6"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`lc-toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-sm ${VARIANT_STYLES[t.variant]}`}
        >
          <span
            aria-hidden
            className="mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-black/[0.07] text-[11px] font-bold dark:bg-white/10"
          >
            {VARIANT_GLYPH[t.variant]}
          </span>
          <p className="flex-1 text-sm leading-relaxed">{t.message}</p>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss notification"
            className="-mr-1 shrink-0 rounded px-1.5 text-lg leading-none opacity-40 transition-opacity hover:opacity-100"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
