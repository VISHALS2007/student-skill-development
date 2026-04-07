import React from "react";

export default function LoadingSpinner({ label = "Loading" }) {
  return (
    <span className="ui-spinner-wrap" role="status" aria-live="polite" aria-label={label}>
      <span className="ui-spinner" />
      <span className="sr-only">{label}</span>
    </span>
  );
}
