import { apiRequestWithFallback } from "../lib/apiClient";

const REQUEST_TIMEOUT_MS = 7000;

const request = async (path, options = {}) => {
  return apiRequestWithFallback(path, options, {
    timeoutMs: REQUEST_TIMEOUT_MS,
    networkErrorMessage: "Cannot connect to backend API. Start backend: cd server ; npm run dev",
  });
};

export const getSkills = async () => {
  return request("/skills");
};

export const addSkill = async (payload) => {
  return request("/skills", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const updateSkill = async (id, payload) => {
  return request(`/skills/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};

export const deleteSkill = async (id) => {
  return request(`/skills/${id}`, { method: "DELETE" });
};

export const updateTimer = async (id, payload) => {
  return request(`/skills/${id}/timer`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
};
