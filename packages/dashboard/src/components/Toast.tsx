import { useState, useEffect, createContext, useContext, useCallback } from "react";

interface ToastMessage {
  id: number;
  text: string;
  type: "error" | "success" | "warning";
}

const TOAST_STYLES: Record<string, { bg: string; border: string; color: string }> = {
  error:   { bg: "#1a0a0a", border: "#7f1d1d", color: "#f87171" },
  success: { bg: "#0a1a14", border: "#064e3b", color: "#34d399" },
  warning: { bg: "#1a1508", border: "#78350f", color: "#fbbf24" },
};

const ToastContext = createContext<{
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  showWarning: (msg: string) => void;
}>({
  showError: () => {},
  showSuccess: () => {},
  showWarning: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: "error" | "success" | "warning") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 5000);
  }, []);

  const showError = useCallback((msg: string) => addToast(msg, "error"), [addToast]);
  const showSuccess = useCallback((msg: string) => addToast(msg, "success"), [addToast]);
  const showWarning = useCallback((msg: string) => addToast(msg, "warning"), [addToast]);

  return (
    <ToastContext.Provider value={{ showError, showSuccess, showWarning }}>
      {children}
      <div style={{ position: "fixed", top: "1rem", left: "50%", transform: "translateX(-50%)", display: "flex", flexDirection: "column", gap: "0.5rem", zIndex: 9999 }}>
        {toasts.map(t => {
          const s = TOAST_STYLES[t.type] || TOAST_STYLES.error;
          return (
            <div
              key={t.id}
              style={{
                padding: "0.85rem 1.5rem",
                background: s.bg,
                border: `1px solid ${s.border}`,
                color: s.color,
                borderRadius: "0.5rem",
                fontSize: "0.95rem",
                fontWeight: 500,
                maxWidth: "500px",
                textAlign: "center",
                boxShadow: "0 4px 20px rgba(0,0,0,0.5)",
                cursor: "pointer",
              }}
              onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            >
              {t.text}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
