import { auth } from "../firebase";

const ADMIN_SESSION_KEY = "adminSession:v1";

const getAdminSessionHeader = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return {};
    return { "x-admin-session": raw };
  } catch {
    return {};
  }
};

async function getAuthHeader() {
  try {
    if (!auth.currentUser) return {};
    const token = await auth.currentUser.getIdToken();
    if (!token) return {};
    return { Authorization: `Bearer ${token}` };
  } catch {
    return {};
  }
}

async function adminRequest(path, options = {}) {
  const authHeader = await getAuthHeader();
  const response = await fetch(`/api/admin${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...getAdminSessionHeader(),
      ...authHeader,
      ...(options.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || "Admin request failed");
  }
  return data;
}

export const adminApi = {
  health: () => adminRequest("/health", { method: "GET" }),
  getUsers: (search = "") => adminRequest(`/users${search ? `?search=${encodeURIComponent(search)}` : ""}`, { method: "GET" }),
  getUserProgress: (userId) => adminRequest(`/progress/${userId}`, { method: "GET" }),
  getCourses: () => adminRequest("/courses", { method: "GET" }),
  createCourse: (payload) => adminRequest("/courses", { method: "POST", body: JSON.stringify(payload) }),
  updateCourse: (courseId, payload) => adminRequest(`/courses/${courseId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCourse: (courseId) => adminRequest(`/courses/${courseId}`, { method: "DELETE" }),
  assignCourseToAll: (payload) => adminRequest("/courses/assign/all", { method: "POST", body: JSON.stringify(payload) }),
  assignCourseToSelected: (payload) => adminRequest("/courses/assign/selected", { method: "POST", body: JSON.stringify(payload) }),
  getAssignments: () => adminRequest("/assignments", { method: "GET" }),
  createAssignment: (payload) => adminRequest("/assignments", { method: "POST", body: JSON.stringify(payload) }),
  updateAssignment: (assignmentId, payload) => adminRequest(`/assignments/${assignmentId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAssignment: (assignmentId) => adminRequest(`/assignments/${assignmentId}`, { method: "DELETE" }),
  getAssignmentProgress: (assignmentId) => adminRequest(`/assignments/progress/${assignmentId}`, { method: "GET" }),
  getDailyProgress: (query = "") => adminRequest(`/progress${query}`, { method: "GET" }),
  getReports: () => adminRequest("/reports", { method: "GET" }),
  getAttendance: (query = "") => adminRequest(`/attendance${query}`, { method: "GET" }),
  markAttendance: (payload) => adminRequest("/attendance", { method: "POST", body: JSON.stringify(payload) }),
  markBulkAttendance: (payload) => adminRequest("/attendance/bulk", { method: "POST", body: JSON.stringify(payload) }),
  sendNotification: (payload) => adminRequest("/notifications", { method: "POST", body: JSON.stringify(payload) }),
};
