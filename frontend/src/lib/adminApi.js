import { auth } from "../firebase";

const ADMIN_SESSION_KEY = "adminSession:v1";
const ADMIN_TOKEN_KEY = "adminToken:v1";
const configuredApiBase = String(import.meta.env.VITE_API_BASE || "").trim().replace(/\/$/, "");
const configuredAdminBase = (() => {
  if (!configuredApiBase) return "";
  if (/\/api\/admin$/i.test(configuredApiBase)) return configuredApiBase;
  if (/\/api$/i.test(configuredApiBase)) return `${configuredApiBase}/admin`;
  return `${configuredApiBase}/api/admin`;
})();
const ADMIN_API_BASES = Array.from(
  new Set([configuredAdminBase, "/api/admin", "http://localhost:4000/api/admin", "http://localhost:5000/api/admin"].filter(Boolean))
);
const DASHBOARD_CACHE_TTL_MS = 30000;
const COURSES_CACHE_TTL_MS = 60000;
const STUDENTS_CACHE_TTL_MS = 30000;
const dashboardCache = new Map();
const coursesCache = new Map();
const studentsCache = new Map();

const getAdminSessionHeader = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return {};
    return { "x-admin-session": raw };
  } catch {
    return {};
  }
};

const getAdminTokenHeader = () => {
  try {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    return token ? { Authorization: `Bearer ${token}` } : {};
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

const withTimeout = async (promise, timeoutMs = 6000) => {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Request timeout")), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timer);
  }
};

async function adminRequest(path, options = {}, requestConfig = {}) {
  const authHeader = await getAuthHeader();
  const adminTokenHeader = getAdminTokenHeader();
  const includeSessionHeader = requestConfig.includeSessionHeader !== false;
  const includeAuthHeader = requestConfig.includeAuthHeader !== false;

  const shouldRetryHttpStatus = (status) => [404, 405, 408, 429, 500, 502, 503, 504].includes(Number(status));

  let lastError = null;
  for (const base of ADMIN_API_BASES) {
    try {
      const response = await withTimeout(
        fetch(`${base}${path}`, {
          ...options,
          headers: {
            "Content-Type": "application/json",
            ...(includeSessionHeader ? getAdminSessionHeader() : {}),
            ...(includeAuthHeader ? (Object.keys(authHeader).length ? authHeader : adminTokenHeader) : {}),
            ...(options.headers || {}),
          },
        })
      );

      const text = await response.text();
      const data = (() => {
        try {
          return text ? JSON.parse(text) : {};
        } catch {
          return {};
        }
      })();

      if (!response.ok) {
        const httpError = new Error(data?.error || `Admin request failed (${response.status})`);
        httpError.isHttpError = true;
        httpError.status = response.status;
        httpError.base = base;
        httpError.path = path;

        // Retry on likely endpoint/base/server issues before failing hard.
        if (shouldRetryHttpStatus(response.status)) {
          lastError = httpError;
          continue;
        }

        throw httpError;
      }

      return data;
    } catch (err) {
      // If the server responded with an HTTP error, surface it immediately.
      if (err?.isHttpError) {
        if (shouldRetryHttpStatus(err.status)) {
          lastError = err;
          continue;
        }
        throw err;
      }
      lastError = err;
    }
  }

  const lastMessage = String(lastError?.message || "");
  const isNetworkIssue =
    lastMessage.toLowerCase().includes("failed to fetch") ||
    lastMessage.toLowerCase().includes("network") ||
    lastMessage.toLowerCase().includes("timeout");

  if (isNetworkIssue) {
    throw new Error("Cannot connect to admin server. Start backend: cd server ; npm run dev");
  }

  if (lastError?.isHttpError && shouldRetryHttpStatus(lastError.status)) {
    throw new Error("Cannot connect to admin server. Start backend: cd server ; npm run dev");
  }

  throw new Error(lastMessage || "Cannot reach admin API. Start backend: cd server ; npm run dev");
}

export const adminApi = {
  login: (payload) =>
    adminRequest(
      "/login",
      { method: "POST", body: JSON.stringify(payload) },
      { includeSessionHeader: false, includeAuthHeader: false }
    ),
  logout: () => adminRequest("/logout", { method: "POST" }),
  health: () => adminRequest("/health", { method: "GET" }, { includeAuthHeader: false }),
  getDashboardSummary: (options = {}) => {
    const params = new URLSearchParams();
    if (options.include) params.set("include", String(options.include));
    const query = params.toString();
    const key = query || "__default__";
    const cached = dashboardCache.get(key);
    if (!options.force && cached && Date.now() - cached.ts < DASHBOARD_CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    }

    return adminRequest(`/dashboard${query ? `?${query}` : ""}`, { method: "GET" }).then((data) => {
      dashboardCache.set(key, { ts: Date.now(), data });
      return data;
    });
  },
  clearDashboardCache: () => {
    dashboardCache.clear();
  },
  getUsers: (search = "", options = {}) => {
    const params = new URLSearchParams({ role: String(options.role || "student") });
    if (search) params.set("search", search);
    if (options.fields) params.set("fields", options.fields);
    if (options.status && options.status !== "all") params.set("status", options.status);
    if (options.page) params.set("page", String(options.page));
    if (options.pageSize) params.set("pageSize", String(options.pageSize));
    return adminRequest(`/users?${params.toString()}`, { method: "GET" });
  },
  getStudents: (options = {}) => {
    const params = new URLSearchParams({ role: "student" });
    if (options.search) params.set("search", String(options.search));
    if (options.department) params.set("department", String(options.department));
    if (options.batch) params.set("batch", String(options.batch));
    if (options.year) params.set("year", String(options.year));
    if (options.status && options.status !== "all") params.set("status", String(options.status));
    if (options.fields) params.set("fields", String(options.fields));
    if (options.page) params.set("page", String(options.page));
    if (options.pageSize) params.set("pageSize", String(options.pageSize));

    const query = params.toString();
    const key = query || "__default__";
    const cached = studentsCache.get(key);
    if (!options.force && cached && Date.now() - cached.ts < STUDENTS_CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    }

    return adminRequest(`/students?${query}`, { method: "GET" }).then((data) => {
      studentsCache.set(key, { ts: Date.now(), data });
      return data;
    });
  },
  clearStudentsCache: () => {
    studentsCache.clear();
  },
  deleteUser: (userId) => adminRequest(`/users/${userId}`, { method: "DELETE" }),
  updateUserStatus: (userId, payload) => adminRequest(`/users/${userId}/status`, { method: "PATCH", body: JSON.stringify(payload) }),
  updateUserRole: (userId, payload) => adminRequest(`/users/${userId}/role`, { method: "PATCH", body: JSON.stringify(payload) }),
  resetStudentPassword: (userId, payload) => adminRequest(`/users/${userId}/password`, { method: "PATCH", body: JSON.stringify(payload) }),
  getUserProgress: (userId) => adminRequest(`/progress/${userId}`, { method: "GET" }),
  getCourses: (options = {}) => {
    const params = new URLSearchParams();
    if (options.search) params.set("search", String(options.search));
    if (options.category && options.category !== "all") params.set("category", String(options.category));
    if (options.status && options.status !== "all") params.set("status", String(options.status));
    if (options.date) params.set("date", String(options.date));
    if (options.fields) params.set("fields", String(options.fields));
    if (options.page) params.set("page", String(options.page));
    if (options.pageSize) params.set("pageSize", String(options.pageSize));

    const query = params.toString();
    const key = query || "__default__";
    const cached = coursesCache.get(key);
    if (!options.force && cached && Date.now() - cached.ts < COURSES_CACHE_TTL_MS) {
      return Promise.resolve(cached.data);
    }

    return adminRequest(`/courses${query ? `?${query}` : ""}`, { method: "GET" }).then((data) => {
      coursesCache.set(key, { ts: Date.now(), data });
      return data;
    });
  },
  clearCoursesCache: () => {
    coursesCache.clear();
  },
  createCourse: (payload) => adminRequest("/courses", { method: "POST", body: JSON.stringify(payload) }),
  updateCourse: (courseId, payload) => adminRequest(`/courses/${courseId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteCourse: (courseId) => adminRequest(`/courses/${courseId}`, { method: "DELETE" }),
  assignCourseToAll: (payload) => adminRequest("/courses/assign/all", { method: "POST", body: JSON.stringify(payload) }),
  assignCourseToSelected: (payload) => adminRequest("/courses/assign/selected", { method: "POST", body: JSON.stringify(payload) }),
  allocateCourse: (payload) => adminRequest("/allocate", { method: "POST", body: JSON.stringify(payload) }),
  listAllocations: (query = "") => adminRequest(`/allocations${query}`, { method: "GET" }),
  deleteAllocation: (allocationId, courseId = "") => {
    const query = courseId ? `?${new URLSearchParams({ courseId }).toString()}` : "";
    return adminRequest(`/allocations/${allocationId}${query}`, { method: "DELETE" });
  },
  getCourseAllocations: (courseId) => adminRequest(`/courses/${courseId}/allocations`, { method: "GET" }),
  getAllottedSkills: (query = "") => adminRequest(`/allotted-skills${query}`, { method: "GET" }),
  getCommunicationTasks: (skillId) => adminRequest(`/communication/tasks?${new URLSearchParams({ skillId }).toString()}`, { method: "GET" }),
  createCommunicationTask: (payload) => adminRequest("/communication/tasks", { method: "POST", body: JSON.stringify(payload) }),
  updateCommunicationTask: (taskId, payload) => adminRequest(`/communication/tasks/${taskId}`, { method: "PUT", body: JSON.stringify(payload) }),
  getCommunicationSubmissions: (query = "") => adminRequest(`/communication/submissions${query}`, { method: "GET" }),
  reviewCommunicationSubmission: (submissionId, payload) =>
    adminRequest(`/communication/submissions/${submissionId}/review`, { method: "PATCH", body: JSON.stringify(payload) }),
  removeAssignedCourse: (userId, courseId) => adminRequest(`/courses/assign/${userId}/${courseId}`, { method: "DELETE" }),
  getAssessments: () => adminRequest("/assessments", { method: "GET" }),
  createAssessment: (payload) => adminRequest("/assessments", { method: "POST", body: JSON.stringify(payload) }),
  updateAssessment: (assessmentId, payload) => adminRequest(`/assessments/${assessmentId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAssessment: (assessmentId) => adminRequest(`/assessments/${assessmentId}`, { method: "DELETE" }),
  submitAssessmentAttempt: (payload) => adminRequest("/attempt", { method: "POST", body: JSON.stringify(payload) }),
  getAssessmentResults: (query = "") => adminRequest(`/results${query}`, { method: "GET" }),
  getRecentAssessmentResults: () => adminRequest("/recent-results", { method: "GET" }),
  getAssignments: () => adminRequest("/assessments", { method: "GET" }),
  createAssignment: (payload) => adminRequest("/assessments", { method: "POST", body: JSON.stringify(payload) }),
  updateAssignment: (assignmentId, payload) => adminRequest(`/assessments/${assignmentId}`, { method: "PUT", body: JSON.stringify(payload) }),
  deleteAssignment: (assignmentId) => adminRequest(`/assessments/${assignmentId}`, { method: "DELETE" }),
  getAssignmentProgress: (assignmentId) => adminRequest(`/assignments/progress/${assignmentId}`, { method: "GET" }),
  getDailyProgress: (query = "") => adminRequest(`/progress${query}`, { method: "GET" }),
  getLeaderboard: () => adminRequest("/leaderboard", { method: "GET" }),
  getReports: () => adminRequest("/reports", { method: "GET" }),
  getAttendance: (query = "") => adminRequest(`/attendance${query}`, { method: "GET" }),
  markAttendance: (payload) => adminRequest("/attendance", { method: "POST", body: JSON.stringify(payload) }),
  markBulkAttendance: (payload) => adminRequest("/attendance/bulk", { method: "POST", body: JSON.stringify(payload) }),
  sendNotification: (payload) => adminRequest("/notifications", { method: "POST", body: JSON.stringify(payload) }),
};
