import { execSync, spawn } from "node:child_process";
import readline from "node:readline";

const procs = [];
const APP_BACKEND_PORT = Number(process.env.APP_BACKEND_PORT || 4000);
const APP_FRONTEND_PORT = Number(process.env.APP_FRONTEND_PORT || 5175);
const STARTUP_TIMEOUT_MS = Number(process.env.DEV_STARTUP_TIMEOUT_MS || 25000);

function freePort(port, label) {
  if (process.platform !== "win32") return;

  try {
    const pid = execSync(
      `powershell -NoProfile -Command "(Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -First 1)"`,
      { stdio: ["ignore", "pipe", "ignore"] }
    )
      .toString()
      .trim();

    if (!pid) return;

    execSync(`powershell -NoProfile -Command "Stop-Process -Id ${pid} -Force"`, {
      stdio: ["ignore", "ignore", "ignore"],
    });
    console.log(`[dev] Freed ${label} port ${port} (stopped PID ${pid}).`);
  } catch {
    // Ignore errors; startup will print a clear message if port remains in use.
  }
}

function pipeLines(stream, label, useStderr = false) {
  const output = useStderr ? process.stderr : process.stdout;
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    output.write(`[${label}] ${line}\n`);
  });
}

function run(label, command) {
  const child = spawn(command, {
    stdio: ["ignore", "pipe", "pipe"],
    shell: true,
    env: process.env,
  });

  pipeLines(child.stdout, label);
  pipeLines(child.stderr, label, true);

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  procs.push(child);
  return child;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url, timeoutMs = STARTUP_TIMEOUT_MS) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(url, { method: "GET" });
      if (res.ok) return true;
    } catch {
      // Keep retrying until timeout.
    }
    await delay(500);
  }
  return false;
}

async function monitorStartup() {
  const backendUrl = `http://localhost:${APP_BACKEND_PORT}/health`;
  const frontendUrl = `http://localhost:${APP_FRONTEND_PORT}/`;

  const backendReady = await waitForHttp(backendUrl);
  if (backendReady) {
    console.log(`[dev] Backend ready at ${backendUrl}`);
  } else {
    console.error(`[dev] Backend readiness check timed out at ${backendUrl}`);
  }

  const frontendReady = await waitForHttp(frontendUrl);
  if (frontendReady) {
    console.log(`[dev] Frontend ready at ${frontendUrl}`);
  } else {
    console.error(`[dev] Frontend readiness check timed out at ${frontendUrl}`);
  }
}

freePort(APP_BACKEND_PORT, "backend");
freePort(APP_FRONTEND_PORT, "frontend");

run("backend", "npm --prefix server run dev");
run("frontend", "npm --prefix frontend run dev");
monitorStartup().catch(() => {
  console.error("[dev] Startup monitor failed.");
});

function shutdown(signal) {
  for (const p of procs) {
    if (!p.killed) p.kill(signal);
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
