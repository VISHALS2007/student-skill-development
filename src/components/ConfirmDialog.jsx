import React from "react";

export default function ConfirmDialog({ open, title, message, confirmText = "Confirm", cancelText = "Cancel", onConfirm, onCancel, danger = false, loading = false }) {
  if (!open) return null;

  return (
    <div className="ui-modal-backdrop" role="dialog" aria-modal="true" aria-label={title || "Confirmation dialog"}>
      <div className="ui-modal">
        <h3 className="section-title text-slate-900">{title || "Please confirm"}</h3>
        <p className="text-sm text-slate-600 mt-2">{message || "Are you sure you want to continue?"}</p>
        <div className="ui-modal-actions">
          <button type="button" className="ui-btn ui-btn-secondary disabled:opacity-60" onClick={onCancel} disabled={loading}>
            {cancelText}
          </button>
          <button
            type="button"
            className={`ui-btn ${danger ? "ui-btn-danger" : "ui-btn-primary"} disabled:opacity-60`}
            onClick={onConfirm}
            disabled={loading}
            autoFocus
          >
            {loading ? "Processing..." : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
