const LIVE_TIMER_PIN_KEY = "liveTimerPinState:v1";
const LIVE_TIMER_PIN_WINDOW_NAME = "skill-live-timer-pin";

const getPinWindowHtml = () => `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Live Timer</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #0f172a;
      --card: #111827;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --run: #10b981;
      --pause: #f59e0b;
      --done: #6366f1;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: Segoe UI, Tahoma, sans-serif;
      background: radial-gradient(circle at top, #1e293b 0%, var(--bg) 65%);
      color: var(--text);
      padding: 10px;
    }
    .card {
      border: 1px solid rgba(148, 163, 184, 0.24);
      border-radius: 14px;
      background: linear-gradient(160deg, rgba(30, 41, 59, 0.95), var(--card));
      padding: 10px;
      display: grid;
      gap: 8px;
      box-shadow: 0 14px 34px rgba(2, 6, 23, 0.4);
    }
    .label {
      font-size: 11px;
      letter-spacing: 0.04em;
      color: var(--muted);
      text-transform: uppercase;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .time {
      font-size: 36px;
      font-weight: 800;
      letter-spacing: 0.06em;
      line-height: 1;
    }
    .meta {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 11px;
      color: var(--muted);
    }
    .status {
      border-radius: 999px;
      border: 1px solid transparent;
      padding: 2px 8px;
      font-weight: 700;
      text-transform: capitalize;
    }
    .status.running {
      color: var(--run);
      border-color: rgba(16, 185, 129, 0.45);
      background: rgba(16, 185, 129, 0.12);
    }
    .status.paused {
      color: var(--pause);
      border-color: rgba(245, 158, 11, 0.45);
      background: rgba(245, 158, 11, 0.12);
    }
    .status.completed {
      color: var(--done);
      border-color: rgba(99, 102, 241, 0.45);
      background: rgba(99, 102, 241, 0.12);
    }
    .status.idle {
      color: var(--muted);
      border-color: rgba(148, 163, 184, 0.35);
      background: rgba(148, 163, 184, 0.08);
    }
    .empty {
      color: var(--muted);
      font-size: 12px;
      text-align: center;
      padding: 12px 4px;
    }
  </style>
</head>
<body>
  <div class="card" id="root"></div>
  <script>
    (() => {
      const KEY = "${LIVE_TIMER_PIN_KEY}";

      const formatDuration = (ms) => {
        const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        if (hours > 0) {
          return String(hours).padStart(2, "0") + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
        }
        return String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
      };

      const root = document.getElementById("root");

      const render = () => {
        let data = null;
        try {
          data = JSON.parse(localStorage.getItem(KEY) || "null");
        } catch {
          data = null;
        }

        if (!data || typeof data !== "object") {
          root.innerHTML = '<div class="empty">No active timer</div>';
          document.title = "Live Timer";
          return;
        }

        const label = String(data.label || "Practice Timer");
        const status = String(data.status || "idle").toLowerCase();
        const remainingMs = Number.isFinite(Number(data.remainingMs)) ? Number(data.remainingMs) : null;
        const elapsedMs = Number.isFinite(Number(data.elapsedMs)) ? Number(data.elapsedMs) : 0;
        const mode = remainingMs !== null ? "Remaining" : "Elapsed";
        const value = remainingMs !== null ? formatDuration(remainingMs) : formatDuration(elapsedMs);

        root.innerHTML =
          '<div class="label">' + label + '</div>' +
          '<div class="time">' + value + '</div>' +
          '<div class="meta">' +
          '  <span>' + mode + '</span>' +
          '  <span class="status ' + status + '">' + status + '</span>' +
          '</div>';

        document.title = value + " - " + label;
      };

      window.addEventListener("storage", (event) => {
        if (event.key === KEY) render();
      });

      render();
      setInterval(render, 500);
    })();
  </script>
</body>
</html>`;

export const openLiveTimerPinWindow = () => {
  const width = 300;
  const height = 190;
  const left = Math.max(0, Number(window.screen?.availWidth || 1280) - width - 16);
  const top = 16;
  const features = `popup=yes,width=${width},height=${height},left=${left},top=${top}`;

  let popup = null;
  try {
    popup = window.open("", LIVE_TIMER_PIN_WINDOW_NAME, features);
  } catch {
    return null;
  }
  if (!popup) return null;

  try {
    popup.document.open();
    popup.document.write(getPinWindowHtml());
    popup.document.close();
    popup.focus();
    return popup;
  } catch {
    try {
      popup.close();
    } catch {
      // Ignore close failures.
    }
    return null;
  }
};

export const updateLiveTimerPin = (state) => {
  try {
    localStorage.setItem(
      LIVE_TIMER_PIN_KEY,
      JSON.stringify({
        label: String(state?.label || "Practice Timer"),
        status: String(state?.status || "idle").toLowerCase(),
        remainingMs: Number.isFinite(Number(state?.remainingMs)) ? Number(state.remainingMs) : null,
        elapsedMs: Number.isFinite(Number(state?.elapsedMs)) ? Number(state.elapsedMs) : 0,
        updatedAt: Date.now(),
      })
    );
  } catch {
    // Ignore localStorage write failures.
  }
};

export const clearLiveTimerPin = () => {
  try {
    localStorage.removeItem(LIVE_TIMER_PIN_KEY);
  } catch {
    // Ignore localStorage cleanup failures.
  }
};
