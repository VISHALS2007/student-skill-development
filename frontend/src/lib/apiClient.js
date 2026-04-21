const configuredApiBase = String(import.meta.env.VITE_API_BASE || "").trim().replace(/\/$/, "");
const isDevRuntime = Boolean(import.meta.env.DEV);
const runtimeProtocol = typeof window !== "undefined" ? String(window.location?.protocol || "http:") : "http:";
const runtimeHost = typeof window !== "undefined" ? String(window.location?.hostname || "").trim() : "";

const isLocalHostRuntime =
  /^(localhost|127\.0\.0\.1)$/i.test(runtimeHost);

const RETRYABLE_STATUS = new Set([404, 405, 408, 429, 500, 502, 503, 504]);
const DEFAULT_TIMEOUT_MS = isDevRuntime || isLocalHostRuntime ? 3000 : 8000;
const BASE_FAILURE_COOLDOWN_MS = 15000;

const ensureApiBase = (base = "") => {
  const normalized = String(base || "").trim().replace(/\/$/, "");
  if (!normalized) return "";
  if (/\/api$/i.test(normalized)) return normalized;
  return `${normalized}/api`;
};

const uniqueBases = (bases = []) => {
  const seen = new Set();
  return bases.filter((base) => {
    const key = String(base || "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const normalizeApiPath = (path = "") => {
  let normalized = String(path || "").trim();
  if (!normalized) return "";
  if (!normalized.startsWith("/")) normalized = `/${normalized}`;
  return normalized.replace(/^\/api(?=\/|$)/i, "");
};

const runtimeHostApiBase = (() => {
  if (!runtimeHost || isLocalHostRuntime) return "";
  if (runtimeProtocol !== "http:" && runtimeProtocol !== "https:") return "";
  return ensureApiBase(`${runtimeProtocol}//${runtimeHost}:4000`);
})();

const localApiBases = [
  "http://localhost:4000",
  "http://127.0.0.1:4000",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  runtimeHostApiBase,
].map(ensureApiBase);

const API_BASES = isDevRuntime
  ? uniqueBases(["/api", ...localApiBases, ensureApiBase(configuredApiBase)])
  : uniqueBases([ensureApiBase(configuredApiBase), "/api", ...(isLocalHostRuntime ? localApiBases : [])]);

let preferredApiBase = "";
const baseFailureUntil = new Map();

const rankBases = (bases = []) => {
  const now = Date.now();
  const available = [];
  const coolingDown = [];

  bases.forEach((base) => {
    const blockedUntil = Number(baseFailureUntil.get(base) || 0);
    if (blockedUntil > now) {
      coolingDown.push(base);
    } else {
      available.push(base);
    }
  });

  return available.length ? [...available, ...coolingDown] : bases;
};

const markBaseFailed = (base) => {
  if (!base) return;
  baseFailureUntil.set(base, Date.now() + BASE_FAILURE_COOLDOWN_MS);
};

const markBaseHealthy = (base) => {
  if (!base) return;
  preferredApiBase = base;
  baseFailureUntil.delete(base);
};

export async function apiRequestWithFallback(path, options = {}, config = {}) {
  const timeoutMs = Number(config.timeoutMs || DEFAULT_TIMEOUT_MS);
  const networkErrorMessage =
    String(config.networkErrorMessage || "").trim() ||
    "Cannot connect to backend server. Start backend: cd server ; npm run dev";

  const retryableStatus = config.retryableStatus instanceof Set ? config.retryableStatus : RETRYABLE_STATUS;
  const normalizedPath = normalizeApiPath(path);
  const bases = rankBases(uniqueBases([preferredApiBase, ...API_BASES]));

  let lastError = null;
  for (const base of bases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${normalizedPath}`, {
        ...options,
        signal: controller.signal,
      });

      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      const expectsJson = !String(config.expectJson || "").trim() || Boolean(config.expectJson);
      if (response.ok && expectsJson && !contentType.includes("application/json")) {
        const error = new Error("Non-JSON response received from API base");
        error.status = 502;
        markBaseFailed(base);
        lastError = error;
        continue;
      }

      const text = await response.text();
      const data = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })();

      if (!response.ok) {
        const error = new Error(data?.error || `Request failed (${response.status})`);
        error.status = response.status;
        if (retryableStatus.has(Number(response.status))) {
          markBaseFailed(base);
          lastError = error;
          continue;
        }
        throw error;
      }

      markBaseHealthy(base);
      return data;
    } catch (err) {
      if (err?.status && !retryableStatus.has(Number(err.status))) {
        throw err;
      }
      markBaseFailed(base);
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  const message = String(lastError?.message || "").toLowerCase();
  const isNetworkIssue =
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("abort");

  if (isNetworkIssue) {
    throw new Error(networkErrorMessage);
  }

  throw new Error(lastError?.message || networkErrorMessage);
}
