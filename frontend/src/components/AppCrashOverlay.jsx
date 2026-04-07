import React, { useEffect, useState } from "react";

// Captures global errors and renders a visible overlay instead of a blank screen
export default function AppCrashOverlay() {
  const [message, setMessage] = useState("");

  const isIgnorableNetworkError = (rawMessage = "", rawReason = "") => {
    const text = `${String(rawMessage || "")} ${String(rawReason || "")}`.toLowerCase();
    return (
      text.includes("failed to fetch") ||
      text.includes("networkerror") ||
      text.includes("network request failed") ||
      text.includes("load failed") ||
      text.includes("aborterror") ||
      text.includes("the operation was aborted")
    );
  };

  useEffect(() => {
    const handleError = (event) => {
      const msg = event?.error?.message || event?.message || "Unknown error";
      if (isIgnorableNetworkError(msg)) return;
      setMessage(msg);
    };
    const handleRejection = (event) => {
      const reason = event?.reason;
      const msg = reason?.message || String(reason) || "Promise rejection";
      if (isIgnorableNetworkError(msg, reason)) {
        event?.preventDefault?.();
        return;
      }
      setMessage(msg);
    };
    window.addEventListener("error", handleError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  if (!message) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-white/95 backdrop-blur-sm flex items-center justify-center px-4">
      <div className="max-w-lg w-full rounded-2xl border border-rose-100 bg-white shadow-xl p-6 space-y-3 text-center">
        <div className="text-3xl">⚠️</div>
        <h2 className="text-lg font-semibold text-slate-900">The app hit an error</h2>
        <p className="text-sm text-rose-600 break-words">{message}</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700"
        >
          Reload app
        </button>
      </div>
    </div>
  );
}
