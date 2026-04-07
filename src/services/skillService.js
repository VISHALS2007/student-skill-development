const configuredBase = String(import.meta.env.VITE_API_BASE || "").trim().replace(/\/$/, "");
const API_BASES = [
  configuredBase,
  "/api",
  "http://localhost:4000/api",
  "http://localhost:5000/api",
].filter(Boolean);

const REQUEST_TIMEOUT_MS = 7000;

const withTimeout = async (url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const shouldRetryStatus = (status) => [404, 408, 429, 500, 502, 503, 504].includes(Number(status));

const request = async (path, options = {}) => {
  let lastError;

  for (const base of API_BASES) {
    try {
      const response = await withTimeout(`${base}${path}`, options);
      if (!response.ok) {
        const text = await response.text().catch(() => "");
        const error = new Error(text || `Request failed (${response.status})`);
        error.status = response.status;
        if (shouldRetryStatus(response.status)) {
          lastError = error;
          continue;
        }
        throw error;
      }
      return response;
    } catch (err) {
      if (err?.status && !shouldRetryStatus(err.status)) {
        throw err;
      }
      lastError = err;
    }
  }

  throw new Error(lastError?.message || "Cannot connect to backend API");
};

const handleResponse = async (res) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  return res.json();
};

export const getSkills = async () => {
  const res = await request("/skills");
  return handleResponse(res);
};

export const addSkill = async (payload) => {
  const res = await request("/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const updateSkill = async (id, payload) => {
  const res = await request(`/skills/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const deleteSkill = async (id) => {
  const res = await request(`/skills/${id}`, { method: "DELETE" });
  return handleResponse(res);
};

export const updateTimer = async (id, payload) => {
  const res = await request(`/skills/${id}/timer`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};
