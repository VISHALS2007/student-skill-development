import React from "react";
import "./ProgressBar.css";

const clamp = (value) => {
  if (Number.isNaN(Number(value))) return 0;
  return Math.min(100, Math.max(0, Number(value)));
};

export default function ProgressBar({ value = 0, label }) {
  const pct = clamp(value);
  return (
    <div className="progress-shell" aria-label={label || "Progress"}>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>
      <span className="progress-value">{pct}%</span>
    </div>
  );
}
