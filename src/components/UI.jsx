import { createContext, useContext, useEffect, useRef, useState } from "react";
import { Activity, X, AlertCircle, Inbox, LoaderCircle } from "lucide-react";
const ToastContext = createContext(() => {});
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(t);
  }, [toast]);
  return (
    <ToastContext.Provider
      value={(message, error = false) => setToast({ message, error })}
    >
      {children}
      {toast && (
        <div
          role={toast.error ? "alert" : "status"}
          className={`toast ${toast.error ? "error" : ""}`}
        >
          {toast.message}
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </ToastContext.Provider>
  );
}
export const useToast = () => useContext(ToastContext);
export function Brand() {
  return (
    <span className="brand">
      <Activity />
      <span>
        PULSE<span className="brand-dot">.</span>
      </span>
    </span>
  );
}
export function Status({ status }) {
  return (
    <span className={`status ${status?.toLowerCase()}`}>
      <i />
      {status || "DRAFT"}
    </span>
  );
}
export function Loading() {
  return (
    <div className="loading" role="status">
      <LoaderCircle className="spin" /> Loading your event…
    </div>
  );
}
export function ErrorBox({ message }) {
  return message ? (
    <div className="error-box" role="alert">
      <AlertCircle size={18} />
      {message}
    </div>
  ) : null;
}
export function Empty({ title = "Nothing here yet", children }) {
  return (
    <div className="empty">
      <Inbox size={36} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Modal({ title, children, onClose, wide = false }) {
  const ref = useRef();
  useEffect(() => {
    const el = ref.current;
    el.showModal();
    return () => el.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={wide ? "wide" : ""}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button aria-label="Close dialog" onClick={onClose}>
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function Stat({ icon: Icon, label, value, detail }) {
  return (
    <div className="stat panel">
      <span className="stat-icon">
        <Icon size={23} />
      </span>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        {detail && <small>{detail}</small>}
      </div>
    </div>
  );
}
