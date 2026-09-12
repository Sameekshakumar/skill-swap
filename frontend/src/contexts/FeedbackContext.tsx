import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import '../components/feedback/Feedback.css';

type ToastTone = 'success' | 'error';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ConfirmRequest {
  message: string;
  confirmLabel: string;
  resolve: (confirmed: boolean) => void;
}

interface FeedbackContextType {
  notify: (message: string, tone?: ToastTone) => void;
  // Replaces window.confirm: returns a promise instead of blocking the page.
  confirm: (message: string, confirmLabel?: string) => Promise<boolean>;
}

const FeedbackContext = createContext<FeedbackContextType | undefined>(undefined);

export const FeedbackProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const nextId = useRef(1);

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++;
    setToasts((current) => [...current, { id, message, tone }]);
    setTimeout(() => {
      setToasts((current) => current.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const confirm = useCallback(
    (message: string, confirmLabel = 'Confirm') =>
      new Promise<boolean>((resolve) => setRequest({ message, confirmLabel, resolve })),
    []
  );

  const settle = (confirmed: boolean) => {
    request?.resolve(confirmed);
    setRequest(null);
  };

  const value = useMemo(() => ({ notify, confirm }), [notify, confirm]);

  return (
    <FeedbackContext.Provider value={value}>
      {children}

      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            {toast.message}
          </div>
        ))}
      </div>

      {request && (
        <div className="confirm-backdrop" role="dialog" aria-modal="true">
          <div className="confirm-box">
            <p className="confirm-message">{request.message}</p>
            <div className="confirm-actions">
              <button type="button" className="confirm-cancel" onClick={() => settle(false)}>
                Keep it
              </button>
              <button type="button" className="confirm-accept" onClick={() => settle(true)} autoFocus>
                {request.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </FeedbackContext.Provider>
  );
};

export const useFeedback = (): FeedbackContextType => {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useFeedback must be used within FeedbackProvider');
  return context;
};
