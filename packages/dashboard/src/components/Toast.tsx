import { useState, useEffect, createContext, useContext, useCallback } from "react";

interface ToastMessage {
  id: number;
  text: string;
  type: "error" | "success";
}

const ToastContext = createContext<{ showError: (msg: string) => void; showSuccess: (msg: string) => void }>({
  showError: () => {},
  showSuccess: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((text: string, type: "error" | "success") => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, text, type }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  }, []);

  const showError = useCallback((msg: string) => addToast(msg, "error"), [addToast]);
  const showSuccess = useCallback((msg: string) => addToast(msg, "success"), [addToast]);

  return (
    <ToastContext.Provider value={{ showError, showSuccess }}>
      {children}
      <div style={{ position: "fixed", bottom: "1.5rem", right: "1.5rem", display: "flex", flexDirection: "column", gap: "0.5rem", zIndex: 9999 }}>
        {toasts.map(t => (
          <div
            key={t.id}
            style={{
              padding: "0.75rem 1rem",
              background: t.type === "error" ? "#1a0a0a" : "#0a1a14",
              border: `1px solid ${t.type === "error" ? "#7f1d1d" : "#064e3b"}`,
              color: t.type === "error" ? "#f87171" : "#34d399",
              borderRadius: "0.5rem",
              fontSize: "0.85rem",
              maxWidth: "350px",
              animation: "slideInRight 0.3s ease",
              cursor: "pointer",
            }}
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
          >
            {t.text}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
