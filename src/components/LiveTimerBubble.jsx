import React, { useEffect, useMemo, useState } from "react";

const LIVE_TIMER_PIN_KEY = "liveTimerPinState:v1";

const formatDuration = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
};

const readPinState = () => {
  try {
    const raw = localStorage.getItem(LIVE_TIMER_PIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const LiveTimerBubble = () => {
  const [pinState, setPinState] = useState(() => readPinState());

  useEffect(() => {
    const refresh = () => setPinState(readPinState());

    refresh();
    const tick = setInterval(refresh, 500);
    const onStorage = (event) => {
      if (event.key === LIVE_TIMER_PIN_KEY) refresh();
    };

    window.addEventListener("storage", onStorage);
    return () => {
      clearInterval(tick);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const view = useMemo(() => {
    if (!pinState) return null;

    const status = String(pinState.status || "idle").toLowerCase();
    const remainingMs = Number.isFinite(Number(pinState.remainingMs)) ? Number(pinState.remainingMs) : null;
    const elapsedMs = Number.isFinite(Number(pinState.elapsedMs)) ? Number(pinState.elapsedMs) : 0;
    const label = String(pinState.label || "Practice Timer");

    return {
      status,
      mode: remainingMs !== null ? "Remaining" : "Elapsed",
      value: remainingMs !== null ? formatDuration(remainingMs) : formatDuration(elapsedMs),
      label,
    };
  }, [pinState]);

  if (!view) return null;

  const statusClass =
    view.status === "running"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : view.status === "paused"
        ? "bg-amber-50 text-amber-700 border-amber-200"
        : view.status === "completed"
          ? "bg-indigo-50 text-indigo-700 border-indigo-200"
          : "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <div className="fixed bottom-4 right-4 z-[1200] w-[220px] rounded-2xl border border-slate-200 bg-white/95 backdrop-blur shadow-xl p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] uppercase tracking-wide font-semibold text-slate-500 truncate">{view.label}</p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.removeItem(LIVE_TIMER_PIN_KEY);
            } catch {
              // Ignore localStorage cleanup failures.
            }
            setPinState(null);
          }}
          className="text-slate-400 hover:text-slate-700 text-xs leading-none"
          aria-label="Close live timer bubble"
          title="Hide"
        >
          x
        </button>
      </div>

      <div className="mt-1 text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{view.value}</div>

      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11px] text-slate-500">{view.mode}</span>
        <span className={`text-[11px] px-2 py-0.5 rounded-full border font-semibold capitalize ${statusClass}`}>{view.status}</span>
      </div>
    </div>
  );
};

export default LiveTimerBubble;
