import { execSync, spawn } from "node:child_process";

const procs = [];
const APP_BACKEND_PORT = Number(process.env.APP_BACKEND_PORT || 4000);
const APP_FRONTEND_PORT = Number(process.env.APP_FRONTEND_PORT || 5175);

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

function run(label, command) {
  const child = spawn(command, {
    stdio: "inherit",
    shell: true,
    env: process.env,
  });

  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });

  procs.push(child);
  return child;
}

freePort(APP_BACKEND_PORT, "backend");
freePort(APP_FRONTEND_PORT, "frontend");

run("backend", "npm --prefix server run dev");
run("frontend", "npm --prefix frontend run dev");

function shutdown(signal) {
  for (const p of procs) {
    if (!p.killed) p.kill(signal);
  }
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
