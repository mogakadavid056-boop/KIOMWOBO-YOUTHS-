import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  showToast: (message: string, variant?: ToastVariant) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, variant: ToastVariant = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, variant }]);
      window.setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        aria-live="polite"
        className="fixed top-4 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto royal-glass-elevated rounded-xl px-4 py-3 flex items-start gap-3 text-sm transition-all ${
              toast.variant === 'error'
                ? 'border-red-400/50 text-red-100'
                : toast.variant === 'success'
                ? 'border-[#D4AF37]/60 text-[#F5F1FF]'
                : 'border-[#C7A4FF]/40 text-[#F5F1FF]'
            }`}
          >
            <span className="shrink-0 mt-0.5">
              {toast.variant === 'success' && <CheckCircle2 className="w-4 h-4 text-[#F5D88A]" />}
              {toast.variant === 'error' && <AlertCircle className="w-4 h-4 text-red-400" />}
              {toast.variant === 'info' && <Info className="w-4 h-4 text-[#C7A4FF]" />}
            </span>
            <p className="flex-1 text-slate-900 dark:text-[#F5F1FF] leading-snug">{toast.message}</p>
            <button
              type="button"
              onClick={() => removeToast(toast.id)}
              className="shrink-0 p-1 rounded-lg text-slate-500 hover:text-slate-900 dark:text-[#C7A4FF] dark:hover:text-[#F5F1FF]"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
