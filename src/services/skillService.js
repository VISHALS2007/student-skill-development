const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5000/api";

const handleResponse = async (res) => {
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || "Request failed");
  }
  return res.json();
};

export const getSkills = async () => {
  const res = await fetch(`${API_BASE}/skills`);
  return handleResponse(res);
};

export const addSkill = async (payload) => {
  const res = await fetch(`${API_BASE}/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const updateSkill = async (id, payload) => {
  const res = await fetch(`${API_BASE}/skills/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};

export const deleteSkill = async (id) => {
  const res = await fetch(`${API_BASE}/skills/${id}`, { method: "DELETE" });
  return handleResponse(res);
};

export const updateTimer = async (id, payload) => {
  const res = await fetch(`${API_BASE}/skills/${id}/timer`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(res);
};
