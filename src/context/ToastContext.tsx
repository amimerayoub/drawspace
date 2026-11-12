import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { Check, Info, X, AlertCircle } from 'lucide-react';
import type { Toast } from '@/types';

interface ToastCtx {
  toast: (message: string, kind?: Toast['kind'], action?: { label: string; onAction: () => void }) => void;
}

const Ctx = createContext<ToastCtx>({ toast: () => {} });

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((ts) => ts.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((message: string, kind: Toast['kind'] = 'info', action?: { label: string; onAction: () => void }) => {
    idRef.current += 1;
    const id = idRef.current;
    setToasts((ts) => [...ts.slice(-3), { id, message, kind, actionLabel: action?.label, onAction: action?.onAction }]);
    window.setTimeout(() => dismiss(id), 4200);
  }, [dismiss]);

  return (
    <Ctx.Provider value={{ toast }}>
      {children}
      <div className="toast-stack" aria-live="polite" role="status">
        {toasts.map((t) => (
          <div key={t.id} className={`toast toast-${t.kind}`}>
            <span className="toast-icon">
              {t.kind === 'success' ? <Check size={15} /> : t.kind === 'error' ? <AlertCircle size={15} /> : <Info size={15} />}
            </span>
            <span className="toast-message">{t.message}</span>
            {t.actionLabel && (
              <button
                className="toast-action"
                onClick={() => {
                  t.onAction?.();
                  dismiss(t.id);
                }}
              >
                {t.actionLabel}
              </button>
            )}
            <button className="toast-close" onClick={() => dismiss(t.id)} aria-label="Dismiss">
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);