import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import {
  FiBookOpen,
  FiLogOut,
  FiActivity,
  FiTrendingUp,
  FiTarget,
  FiLayers,
  FiEdit3,
  FiTrash2,
  FiPlus,
  FiCheck,
  FiX,
  FiCalendar,
  FiLink2,
  FiRefreshCw,
  FiMessageSquare,
  FiMoon,
  FiSun,
} from "react-icons/fi";
import DashboardCard from "../components/DashboardCard";
import ConfirmDialog from "../components/ConfirmDialog";
import CountUpValue from "../components/CountUpValue";
import LoadingSpinner from "../components/LoadingSpinner";
import { useTheme } from "../lib/ThemeContext";
import { toast } from "react-toastify";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: FiActivity },
  { id: "skills", label: "My Courses", icon: FiTarget },
  { id: "addSkill", label: "Add Course", icon: FiPlus },
  { id: "courses", label: "My Courses", icon: FiBookOpen },
  { id: "assignments", label: "Assessments", icon: FiEdit3 },
  { id: "communication", label: "Communication", icon: FiMessageSquare },
  { id: "attendance", label: "Attendance", icon: FiCalendar },
  { id: "resources", label: "Resources", icon: FiLink2 },
];

const emptySkill = {
  title: "",
  description: "",
};

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const configuredApiBase = String(import.meta.env.VITE_API_BASE || "").trim().replace(/\/$/, "");
const configuredApiHost = (() => {
  if (!configuredApiBase) return "";
  try {
    const parsed = new URL(configuredApiBase);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return configuredApiBase.replace(/\/api$/i, "");
  }
})();

const API_HOSTS = Array.from(new Set([configuredApiHost, "", "http://localhost:4000", "http://localhost:5000"].filter(Boolean)));
const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);
const STUDENT_DASHBOARD_CACHE_KEY = "studentDashboardCache:v1";
const STUDENT_DASHBOARD_CACHE_TTL_MS = 30000;
const COURSES_PAGE_SIZE = 6;
const IN_FLIGHT_GET_REQUESTS = new Map();

const requestWithFallback = async (path, options = {}, timeoutMs = 8000) => {
  const method = String(options?.method || "GET").toUpperCase();
  const isGet = method === "GET";
  const dedupeKey = isGet ? `${path}::${JSON.stringify(options?.headers || {})}` : "";

  if (isGet && dedupeKey && IN_FLIGHT_GET_REQUESTS.has(dedupeKey)) {
    return IN_FLIGHT_GET_REQUESTS.get(dedupeKey);
  }

  const task = (async () => {
    let lastError = null;

    for (const host of API_HOSTS) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${host}${path}`, {
          ...options,
          method,
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => ({}));

        if (!response.ok) {
          const error = new Error(payload?.error || `Request failed (${response.status})`);
          error.status = response.status;
          if (RETRYABLE_STATUS.has(Number(response.status))) {
            lastError = error;
            continue;
          }
          throw error;
        }

        return payload;
      } catch (err) {
        if (err?.status && !RETRYABLE_STATUS.has(Number(err.status))) {
          throw err;
        }
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }

    throw new Error(lastError?.message || "Cannot connect to backend server");
  })();

  if (isGet && dedupeKey) {
    IN_FLIGHT_GET_REQUESTS.set(dedupeKey, task);
    task.finally(() => {
      IN_FLIGHT_GET_REQUESTS.delete(dedupeKey);
    });
  }

  return task;
};

const normalizeSkillRecord = (skill = {}, index = 0) => {
  const rawTitle = String(skill?.title || skill?.skillName || skill?.name || "").trim();
  const normalizedSource = String(skill?.addedBy || skill?.source || "student").trim().toLowerCase();
  const isAdminSkill =
    normalizedSource === "admin" ||
    normalizedSource === "main_admin" ||
    normalizedSource === "sub_admin" ||
    normalizedSource === "allocated";

  return {
    ...skill,
    id: skill?.id || skill?._id || `${rawTitle || "skill"}-${index}`,
    title: rawTitle || "Untitled Skill",
    description: String(skill?.description || skill?.notes || "").trim(),
    addedBy: isAdminSkill ? "admin" : "student",
  };
};

const splitSkillsByOwner = (items = []) => {
  const normalized = (items || []).map((skill, index) => normalizeSkillRecord(skill, index));
  return {
    allocated: normalized.filter((skill) => skill.addedBy === "admin"),
    personal: normalized.filter((skill) => skill.addedBy === "student"),
  };
};

export default function StudentDashboard() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const loggedInEmail = auth.currentUser?.email || "";
  const loggedInName = auth.currentUser?.displayName || "";
  const [activeSection, setActiveSection] = useState("dashboard");
  const [student, setStudent] = useState(null);
  const [allocatedSkills, setAllocatedSkills] = useState([]);
  const [mySkills, setMySkills] = useState([]);
  const [courses, setCourses] = useState([]);
  const [allocatedCourses, setAllocatedCourses] = useState([]);
  const [registeredCourses, setRegisteredCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [progress, setProgress] = useState([]);
  const [resources, setResources] = useState([]);
  const [skillForm, setSkillForm] = useState(emptySkill);
  const [editingSkillId, setEditingSkillId] = useState("");
  const [status, setStatus] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState("");
  const [skillPendingDelete, setSkillPendingDelete] = useState(null);
  const [assessmentPendingSubmit, setAssessmentPendingSubmit] = useState(null);
  const [courseSearch, setCourseSearch] = useState("");
  const [debouncedCourseSearch, setDebouncedCourseSearch] = useState("");
  const [courseStatusFilter, setCourseStatusFilter] = useState("all");
  const [courseCategoryFilter, setCourseCategoryFilter] = useState("all");
  const [courseDateFilter, setCourseDateFilter] = useState("");
  const [allocatedCoursePage, setAllocatedCoursePage] = useState(1);
  const [registeredCoursePage, setRegisteredCoursePage] = useState(1);
  const [communicationSkills, setCommunicationSkills] = useState([]);
  const [communicationDrafts, setCommunicationDrafts] = useState({});
  const [communicationLoading, setCommunicationLoading] = useState(false);

  const applyDashboardPayload = useCallback((data = {}) => {
    const profile = data.profile || {};
    const skillsData = Array.isArray(data.skills) ? data.skills : [];
    const splitSkills = splitSkillsByOwner(skillsData);
    const coursePayload = data.courses || {};
    const allocated = coursePayload.allocatedCourses || [];
    const registered = coursePayload.registeredCourses || [];
    const combinedCourses = coursePayload.items || [...allocated, ...registered];

    setStudent({
      ...profile,
      name: profile.name || loggedInName,
      email: profile.email || loggedInEmail,
    });
    setAllocatedSkills(splitSkills.allocated);
    setMySkills(splitSkills.personal);
    setCourses(combinedCourses);
    setAllocatedCourses(
      allocated.length
        ? allocated
        : combinedCourses.filter(
            (course) =>
              String(course.source || "admin").toLowerCase() !== "student" &&
              String(course.status || "").toLowerCase() !== "registered"
          )
    );
    setRegisteredCourses(
      registered.length
        ? registered
        : combinedCourses.filter(
            (course) =>
              String(course.source || "").toLowerCase() === "student" ||
              String(course.status || "").toLowerCase() === "registered"
          )
    );
    setAssignments(data.assignments || []);
    setAttendance(data.attendance || []);
    setProgress(data.progress || []);
    setResources(data.resources || []);
  }, [loggedInEmail, loggedInName]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCourseSearch(String(courseSearch || "").trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [courseSearch]);

  // Fetch student data on mount
  useEffect(() => {
    const loadStudentData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) {
          navigate("/login");
          return;
        }

        let hasFreshCache = false;
        try {
          const cachedRaw = sessionStorage.getItem(STUDENT_DASHBOARD_CACHE_KEY);
          if (cachedRaw) {
            const cached = JSON.parse(cachedRaw);
            if (cached?.ts && Date.now() - cached.ts < STUDENT_DASHBOARD_CACHE_TTL_MS && cached?.item) {
              applyDashboardPayload(cached.item);
              hasFreshCache = true;
              setIsLoading(false);
            }
          }
        } catch {
          // ignore cache parse errors
        }

        if (!hasFreshCache) {
          setIsLoading(true);
        }

        // Always show the currently logged-in identity in the student panel.
        setStudent((prev) => ({
          ...(prev || {}),
          name: (prev && prev.name) || loggedInName,
          email: (prev && prev.email) || loggedInEmail,
        }));

        const idToken = await currentUser.getIdToken();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
          "x-student-session": JSON.stringify({ uid: currentUser.uid, email: currentUser.email || "", role: "student" }),
        };

        const fetchJson = async (url) => requestWithFallback(url, { headers });

        // Fast path: load all dashboard data in a single API call.
        try {
          const bundle = await fetchJson("/api/student/dashboard");
          const data = bundle?.item || {};
          applyDashboardPayload(data);
          try {
            sessionStorage.setItem(STUDENT_DASHBOARD_CACHE_KEY, JSON.stringify({ ts: Date.now(), item: data }));
          } catch {
            // ignore cache write errors
          }
          setStatus("");
          return;
        } catch {
          // Fallback to legacy parallel endpoints for backward compatibility.
        }

        const [studentRes, skillsRes, coursesRes, assignmentsRes, attendanceRes, progressRes, resourcesRes] = await Promise.allSettled([
          fetchJson("/api/student/profile"),
          fetchJson("/api/student/skills"),
          fetchJson("/api/student/courses"),
          fetchJson("/api/student/assessments"),
          fetchJson("/api/student/attendance"),
          fetchJson("/api/student/progress"),
          fetchJson("/api/student/resources"),
        ]);

        if (studentRes.status === "fulfilled") {
          const item = studentRes.value?.item || {};
          setStudent({
            ...item,
            name: item.name || loggedInName,
            email: item.email || loggedInEmail,
          });
        }
        
        // Separate allocated skills (admin-given) and personal skills (student-added)
        if (skillsRes.status === "fulfilled") {
          const skillsData = skillsRes.value?.items || [];
          const splitSkills = splitSkillsByOwner(skillsData);
          setAllocatedSkills(splitSkills.allocated);
          setMySkills(splitSkills.personal);
        }

        if (coursesRes.status === "fulfilled") {
          const allocated = coursesRes.value?.allocatedCourses || [];
          const registered = coursesRes.value?.registeredCourses || [];
          const combinedCourses = coursesRes.value?.items || [...allocated, ...registered];
          setCourses(combinedCourses);
          setAllocatedCourses(allocated.length ? allocated : combinedCourses.filter((course) => String(course.source || "admin").toLowerCase() !== "student" && String(course.status || "").toLowerCase() !== "registered"));
          setRegisteredCourses(registered.length ? registered : combinedCourses.filter((course) => String(course.source || "").toLowerCase() === "student" || String(course.status || "").toLowerCase() === "registered"));
        }

        if (assignmentsRes.status === "fulfilled") setAssignments(assignmentsRes.value?.items || []);
        if (attendanceRes.status === "fulfilled") setAttendance(attendanceRes.value?.items || []);
        if (progressRes.status === "fulfilled") setProgress(progressRes.value?.items || []);
        if (resourcesRes.status === "fulfilled") setResources(resourcesRes.value?.items || []);

        const firstError = [studentRes, skillsRes, coursesRes, assignmentsRes, attendanceRes, progressRes, resourcesRes]
          .find((result) => result.status === "rejected");

        if (firstError?.status === "rejected") {
          setStatus(firstError.reason?.message || "Some student data could not be loaded");
        } else {
          setStatus("");
        }
      } catch (err) {
        setStatus(err.message || "Failed to load student data");
      } finally {
        setIsLoading(false);
      }
    };

    loadStudentData();
  }, [navigate, loggedInEmail, loggedInName, applyDashboardPayload]);

  const analytics = useMemo(() => {
    const allCourses = [...allocatedCourses, ...registeredCourses];
    const completedCourses = allCourses.filter((c) => String(c.status || "").toLowerCase() === "completed").length;
    const pendingCourses = allCourses.filter((c) => String(c.status || "").toLowerCase() !== "completed").length;
    const attendancePct = attendance.length
      ? Math.round((attendance.filter((a) => a.status === "present").length / attendance.length) * 100)
      : 0;
    const pendingAssignments = assignments.filter((a) => a.status !== "completed").length;

    return [
      { label: "Allocated Courses", value: allocatedSkills.length, icon: FiTarget, tone: "text-indigo-600 bg-indigo-50" },
      { label: "Completed Courses", value: completedCourses, icon: FiCheck, tone: "text-emerald-600 bg-emerald-50" },
      { label: "Pending Courses", value: pendingCourses, icon: FiTarget, tone: "text-amber-600 bg-amber-50" },
      { label: "Attendance %", value: attendancePct, suffix: "%", icon: FiActivity, tone: "text-sky-600 bg-sky-50" },
      { label: "Pending Assessments", value: pendingAssignments, icon: FiEdit3, tone: "text-purple-600 bg-purple-50" },
    ];
  }, [allocatedSkills, mySkills, allocatedCourses, registeredCourses, assignments, attendance]);

  const courseProgressMap = useMemo(() => {
    const map = new Map();
    (progress || []).forEach((p) => {
      const key = String(p.courseId || p.courseName || p.skillName || "").toLowerCase();
      map.set(key, p.completionPercent || 0);
    });
    return map;
  }, [progress]);

  const courseCategories = useMemo(() => {
    return Array.from(new Set(courses.map((c) => (c.category === "custom" ? c.customCategory : c.category)).filter(Boolean)));
  }, [courses]);

  const filteredCourses = useMemo(() => {
    const q = debouncedCourseSearch;
    return allocatedCourses.filter((course) => {
      const title = String(course.title || course.course_name || "").toLowerCase();
      const desc = String(course.description || "").toLowerCase();
      const category = String((course.category === "custom" ? course.customCategory : course.category) || "").toLowerCase();
      const statusNorm = String(course.status || "active").toLowerCase();
      const startDate = String(course.startDate || "");
      const textOk = !q || title.includes(q) || desc.includes(q);
      const statusOk =
        courseStatusFilter === "all" ||
        (courseStatusFilter === "completed" && statusNorm === "completed") ||
        (courseStatusFilter === "pending" && statusNorm !== "completed") ||
        (courseStatusFilter === "active" && statusNorm === "active");
      const categoryOk = courseCategoryFilter === "all" || category === String(courseCategoryFilter).toLowerCase();
      const dateOk = !courseDateFilter || startDate === courseDateFilter;
      return textOk && statusOk && categoryOk && dateOk;
    });
  }, [allocatedCourses, debouncedCourseSearch, courseStatusFilter, courseCategoryFilter, courseDateFilter]);

  const filteredRegisteredCourses = useMemo(() => {
    const q = debouncedCourseSearch;
    return registeredCourses.filter((course) => {
      const title = String(course.title || course.course_name || "").toLowerCase();
      const desc = String(course.description || "").toLowerCase();
      const category = String((course.category === "custom" ? course.customCategory : course.category) || "").toLowerCase();
      const statusNorm = String(course.status || "registered").toLowerCase();
      const startDate = String(course.startDate || "");
      const textOk = !q || title.includes(q) || desc.includes(q);
      const statusOk =
        courseStatusFilter === "all" ||
        (courseStatusFilter === "completed" && statusNorm === "completed") ||
        (courseStatusFilter === "pending" && statusNorm !== "completed") ||
        (courseStatusFilter === "active" && statusNorm === "active");
      const categoryOk = courseCategoryFilter === "all" || category === String(courseCategoryFilter).toLowerCase();
      const dateOk = !courseDateFilter || startDate === courseDateFilter;
      return textOk && statusOk && categoryOk && dateOk;
    });
  }, [registeredCourses, debouncedCourseSearch, courseStatusFilter, courseCategoryFilter, courseDateFilter]);

  useEffect(() => {
    setAllocatedCoursePage(1);
    setRegisteredCoursePage(1);
  }, [debouncedCourseSearch, courseStatusFilter, courseCategoryFilter, courseDateFilter]);

  const allocatedCourseTotalPages = Math.max(1, Math.ceil(filteredCourses.length / COURSES_PAGE_SIZE));
  const registeredCourseTotalPages = Math.max(1, Math.ceil(filteredRegisteredCourses.length / COURSES_PAGE_SIZE));

  useEffect(() => {
    if (allocatedCoursePage > allocatedCourseTotalPages) {
      setAllocatedCoursePage(allocatedCourseTotalPages);
    }
  }, [allocatedCoursePage, allocatedCourseTotalPages]);

  useEffect(() => {
    if (registeredCoursePage > registeredCourseTotalPages) {
      setRegisteredCoursePage(registeredCourseTotalPages);
    }
  }, [registeredCoursePage, registeredCourseTotalPages]);

  const pagedAllocatedCourses = useMemo(() => {
    const start = (allocatedCoursePage - 1) * COURSES_PAGE_SIZE;
    return filteredCourses.slice(start, start + COURSES_PAGE_SIZE);
  }, [filteredCourses, allocatedCoursePage]);

  const pagedRegisteredCourses = useMemo(() => {
    const start = (registeredCoursePage - 1) * COURSES_PAGE_SIZE;
    return filteredRegisteredCourses.slice(start, start + COURSES_PAGE_SIZE);
  }, [filteredRegisteredCourses, registeredCoursePage]);

  const handleLogout = async () => {
    localStorage.removeItem("studentSession:v1");
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  const addSkill = async () => {
    if (actionLoading) return;
    if (!skillForm.title.trim()) {
      setStatus("Course title is required");
      toast.error("Course title is required", { containerId: "global-toasts" });
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      const message = "Login session expired. Please login again.";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
      return;
    }

    setActionLoading("saveSkill");
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };

      const method = editingSkillId ? "PUT" : "POST";
      const url = editingSkillId ? `/api/student/skills/${editingSkillId}` : "/api/student/skills";

      await requestWithFallback(url, {
        method,
        headers,
        body: JSON.stringify({ ...skillForm, addedBy: "student" }),
      });

      setStatus(editingSkillId ? "Course updated" : "Course added");
      toast.success(editingSkillId ? "Course updated successfully" : "Course added successfully", { containerId: "global-toasts" });
      setSkillForm(emptySkill);
      setEditingSkillId("");

      // Clear dashboard cache so next load fetches fresh data
      sessionStorage.removeItem("studentDashboardCache:v1");

      // Reload skills
      const skillsRes = await requestWithFallback("/api/student/skills", { headers });
      const splitSkills = splitSkillsByOwner(skillsRes.items || []);
      setAllocatedSkills(splitSkills.allocated);
      setMySkills(splitSkills.personal);
    } catch (err) {
      const message = err.message || "Failed to save skill";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setActionLoading("");
    }
  };

  const editSkill = (skill) => {
    setSkillForm({ title: skill.title, description: skill.description });
    setEditingSkillId(skill.id);
  };

  const deleteSkill = async (skillId) => {
    if (actionLoading) return;
    const user = auth.currentUser;
    if (!user) {
      const message = "Login session expired. Please login again.";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
      return;
    }

    setActionLoading(`deleteSkill:${skillId}`);
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };

      await requestWithFallback(`/api/student/skills/${skillId}`, { method: "DELETE", headers });

      setStatus("Course deleted");
      toast.success("Course deleted successfully", { containerId: "global-toasts" });
      setMySkills((prev) => prev.filter((s) => s.id !== skillId));
      // Clear dashboard cache so next load fetches fresh data
      sessionStorage.removeItem("studentDashboardCache:v1");
    } catch (err) {
      const message = err.message || "Failed to delete skill";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setActionLoading("");
    }
  };

  const confirmDeleteSkill = async () => {
    if (!skillPendingDelete?.id) return;
    await deleteSkill(skillPendingDelete.id);
    setSkillPendingDelete(null);
  };

  const markAssignmentComplete = async (assignmentId, assessment) => {
    if (actionLoading) return;
    const user = auth.currentUser;
    if (!user) {
      const message = "Login session expired. Please login again.";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
      return;
    }

    setActionLoading(`submitAssessment:${assignmentId}`);
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };

      const payload = await requestWithFallback(`/api/student/assessments/${assignmentId}/attempt`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          assessmentId: assignmentId,
          answers: Array(Number(assessment?.numberOfQuestions || 0)).fill(""),
          code: String(assessment?.assessmentType || "") === "coding" ? "function solve(input){ return String(input).split('').reverse().join(''); }" : "",
          programmingLanguage: assessment?.programmingLanguage || "javascript",
        }),
      });

      setStatus("Assessment submitted and evaluated");
      toast.success("Assessment submitted successfully", { containerId: "global-toasts" });
      setAssignments((prev) => prev.map((a) => (a.id === assignmentId ? { ...a, status: "completed", score: payload?.item?.marks ?? a.score, attemptedAt: payload?.item?.submittedAt || new Date().toISOString() } : a)));
    } catch (err) {
      const message = err.message || "Failed to submit assessment";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setActionLoading("");
    }
  };

  const confirmSubmitAssessment = async () => {
    if (!assessmentPendingSubmit?.id) return;
    await markAssignmentComplete(assessmentPendingSubmit.id, assessmentPendingSubmit);
    setAssessmentPendingSubmit(null);
  };

  const loadCommunicationPractice = useCallback(async () => {
    const user = auth.currentUser;
    if (!user) return;
    setCommunicationLoading(true);
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };

      const [tasksRes, submissionsRes] = await Promise.all([
        requestWithFallback("/api/student/communication/tasks", { headers }),
        requestWithFallback("/api/student/communication/submissions", { headers }),
      ]);

      const submissionByTask = new Map(
        (submissionsRes.items || []).map((row) => [String(row.taskId || ""), row])
      );
      const groups = (tasksRes.skills || []).map((group) => ({
        ...group,
        tasks: (group.tasks || []).map((task) => ({
          ...task,
          submission: submissionByTask.get(String(task.id || "")) || task.submission || null,
        })),
      }));

      setCommunicationSkills(groups);
    } catch (err) {
      setStatus(err.message || "Failed to load communication tasks");
    } finally {
      setCommunicationLoading(false);
    }
  }, []);

  const submitCommunicationResponse = async (skillId, taskId) => {
    if (actionLoading) return;
    const user = auth.currentUser;
    if (!user) {
      toast.error("Login session expired. Please login again.", { containerId: "global-toasts" });
      return;
    }

    const key = `${skillId}__${taskId}`;
    const draft = communicationDrafts[key] || { response: "", responseUrl: "" };
    if (!String(draft.response || "").trim() && !String(draft.responseUrl || "").trim()) {
      toast.error("Add a response or upload link", { containerId: "global-toasts" });
      return;
    }

    setActionLoading(`communication:${taskId}`);
    try {
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${await user.getIdToken()}`,
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };

      await requestWithFallback("/api/student/communication/submissions", {
        method: "POST",
        headers,
        body: JSON.stringify({
          skillId,
          taskId,
          response: String(draft.response || "").trim(),
          responseUrl: String(draft.responseUrl || "").trim(),
        }),
      });

      toast.success("Response submitted", { containerId: "global-toasts" });
      setCommunicationDrafts((prev) => ({ ...prev, [key]: { response: "", responseUrl: "" } }));
      await loadCommunicationPractice();
    } catch (err) {
      const message = err.message || "Failed to submit response";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setActionLoading("");
    }
  };

  useEffect(() => {
    if (activeSection !== "communication") return;
    loadCommunicationPractice();
  }, [activeSection, loadCommunicationPractice]);

  // Section: Dashboard
  const dashboardSection = (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-5">
        {analytics.map((item) => {
          const Icon = item.icon;
          return (
            <div key={item.label} className="dashboard-metric-card">
              <div className="dashboard-metric-content">
                <span className={`p-2 rounded-lg ${item.tone}`}>
                  <Icon className="text-[20px]" />
                </span>
                <div className="dashboard-metric-text">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{item.label}</div>
                    <div className="text-3xl font-bold text-slate-900">
                      <CountUpValue value={item.value} suffix={item.suffix || ""} />
                    </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardCard title="Learning" subtitle="Overview" icon={FiTrendingUp} accent="indigo">
          <div className="space-y-3 text-sm text-slate-700">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="font-semibold">Allocated Courses: {allocatedSkills.length}</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="font-semibold">Active Courses: {courses.length}</div>
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
              <div className="font-semibold">Completed: {courses.filter((c) => c.status === "completed").length}</div>
            </div>
          </div>
        </DashboardCard>


        <DashboardCard title="Quick Actions" subtitle="Actions" icon={FiPlus} accent="purple">
          <div className="grid grid-cols-2 gap-3">
            {[
              ["My Courses", "skills"],
              ["My Courses", "courses"],
              ["Assessments", "assignments"],
              ["Communication", "communication"],
              ["Progress", "progress"],
              ["Attendance", "attendance"],
              ["Resources", "resources"],
            ].map(([label, section]) => (
              <button
                key={section}
                className="rounded-xl border border-slate-100 bg-white p-3 text-sm font-semibold text-slate-800 hover:bg-slate-50 transition-all duration-200"
                onClick={() => setActiveSection(section)}
              >
                {label}
              </button>
            ))}
          </div>
        </DashboardCard>
      </div>
    </div>
  );

  // Section: My Courses
  const skillsSection = (
    <div className="space-y-6">
      <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
        <div className="section-head section-head-indigo">
          <h3 className="text-lg">Allocated Courses</h3>
        </div>
        <div className="p-6">
          {allocatedSkills.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No allocated courses yet</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {allocatedSkills.map((skill) => (
                <div key={skill.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900">{skill.title}</h4>
                      <p className="text-sm text-slate-600 mt-1">{skill.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-indigo-600 bg-indigo-100 px-3 py-1 rounded-full">Admin</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
        <div className="section-head section-head-emerald">
          <h3 className="text-lg">My Courses</h3>
        </div>
        <div className="p-6">
          {mySkills.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No courses added yet.</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
              {mySkills.map((skill) => (
                <div key={skill.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900">{skill.title}</h4>
                      <p className="text-sm text-slate-600 mt-1">{skill.description}</p>
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 px-3 py-1 rounded-full">Personal</span>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={() => editSkill(skill)}
                      disabled={Boolean(actionLoading)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-blue-100 text-blue-700 font-semibold text-sm hover:bg-blue-200 transition-all duration-200"
                    >
                      <FiEdit3 className="text-[14px]" /> Edit
                    </button>
                    <button
                      onClick={() => setSkillPendingDelete({ id: skill.id, title: skill.title })}
                      disabled={Boolean(actionLoading)}
                      className="flex-1 flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-red-100 text-red-700 font-semibold text-sm hover:bg-red-200 transition-all duration-200"
                    >
                      <FiTrash2 className="text-[14px]" /> Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Section: Add Course
  const addSkillSection = (
    <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-6">
      <div className="mb-6">
        <h3 className="text-lg font-bold text-slate-900">Add Course</h3>
      </div>

      <div className="space-y-4 max-w-2xl">
        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Course Title</label>
          <input
            type="text"
            value={skillForm.title}
            onChange={(e) => setSkillForm({ ...skillForm, title: e.target.value })}
            placeholder="Course name"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all duration-200"
          />
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-2">Notes</label>
          <textarea
            value={skillForm.description}
            onChange={(e) => setSkillForm({ ...skillForm, description: e.target.value })}
            placeholder="Notes"
            rows="4"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 outline-none transition-all duration-200"
          />
        </div>

        <div className="flex items-center justify-between gap-3">
          {editingSkillId ? (
            <button
              onClick={() => {
                setSkillForm(emptySkill);
                setEditingSkillId("");
              }}
              disabled={actionLoading === "saveSkill"}
              className="px-4 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-all duration-200"
            >
              Cancel
            </button>
          ) : (
            <span />
          )}
          <button
            onClick={addSkill}
            disabled={actionLoading === "saveSkill"}
            className="px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all duration-200"
          >
            {actionLoading === "saveSkill" ? "Saving..." : editingSkillId ? "Save" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );

  // Section: My Courses
  const coursesSection = (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
        <div className="section-head section-head-blue">
          <h3 className="text-lg">Allocated Courses</h3>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
            <input
              value={courseSearch}
              onChange={(e) => setCourseSearch(e.target.value)}
              placeholder="Search courses"
              className="rounded-xl border border-slate-200 px-3 py-2"
            />
            <select value={courseStatusFilter} onChange={(e) => setCourseStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
              <option value="all">All</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="active">Active</option>
            </select>
            <select value={courseCategoryFilter} onChange={(e) => setCourseCategoryFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
              <option value="all">All Categories</option>
              {courseCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <input type="date" value={courseDateFilter} onChange={(e) => setCourseDateFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          {allocatedCourses.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No courses allocated yet</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {pagedAllocatedCourses.map((course) => {
                const progressKey = String(course.id || course.title || course.course_name || "").toLowerCase();
                const visualProgress =
                  courseProgressMap.get(progressKey) ??
                  courseProgressMap.get(String(course.title || course.course_name || "").toLowerCase()) ??
                  (String(course.status || "").toLowerCase() === "completed" ? 100 : 0);
                return (
                <div key={course.id} className="rounded-xl border border-slate-200 bg-white p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-bold text-slate-900 flex-1">{course.title || course.course_name}</h4>
                    <span
                      className={`text-xs font-semibold px-3 py-1 rounded-full ${
                        course.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                      }`}
                    >
                      {course.status === "completed" ? "Completed" : "Active"}
                    </span>
                  </div>
                  <p className="text-slate-600 text-sm mb-3">{course.description}</p>
                  <div className="space-y-2 text-sm text-slate-600 mb-3">
                    <div>Category: {course.category || "General"}</div>
                    <div>Duration: {course.durationDays || "-"} days</div>
                    <div>{formatDate(course.startDate)} to {formatDate(course.endDate)}</div>
                    <div>Difficulty: {course.difficulty || "N/A"}</div>
                  </div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{visualProgress}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full bg-indigo-500" style={{ width: `${visualProgress}%` }} />
                    </div>
                  </div>
                  {course.links && course.links.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <p className="text-xs font-semibold text-slate-700 mb-2">Resources:</p>
                      <div className="space-y-1">
                        {course.links.map((link, idx) => (
                          <a
                            key={idx}
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:text-indigo-700 block truncate"
                          >
                            {link.type}: {link.url}
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          )}
          {filteredCourses.length > COURSES_PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Page {allocatedCoursePage} of {allocatedCourseTotalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setAllocatedCoursePage((prev) => Math.max(1, prev - 1))}
                  disabled={allocatedCoursePage <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setAllocatedCoursePage((prev) => Math.min(allocatedCourseTotalPages, prev + 1))}
                  disabled={allocatedCoursePage >= allocatedCourseTotalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
        <div className="section-head section-head-emerald">
          <h3 className="text-lg">Registered Courses</h3>
        </div>
        <div className="p-6">
          {registeredCourses.length === 0 ? (
            <div className="text-center py-8 text-slate-500">No registered courses yet</div>
          ) : (
            <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
              {pagedRegisteredCourses.map((course) => (
                <div key={course.id} className="rounded-xl border border-slate-200 bg-white p-6 hover:shadow-md transition-all duration-200">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-bold text-slate-900 flex-1">{course.title || course.course_name}</h4>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-100 text-emerald-700">Registered</span>
                  </div>
                  <p className="text-slate-600 text-sm mb-3">{course.description}</p>
                  <div className="space-y-2 text-sm text-slate-600 mb-3">
                    <div>Category: {course.category || "General"}</div>
                    <div>Duration: {course.durationDays || "-"} days</div>
                    <div>{formatDate(course.startDate)} to {formatDate(course.endDate)}</div>
                    <div>Difficulty: {course.difficulty || "N/A"}</div>
                  </div>
                  <div className="mb-3">
                    <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                      <span>Progress</span>
                      <span className="font-semibold">{courseProgressMap.get(String(course.id || course.title || course.course_name || "").toLowerCase()) || 0}%</span>
                    </div>
                    <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                      <div className="h-full bg-emerald-500" style={{ width: `${courseProgressMap.get(String(course.id || course.title || course.course_name || "").toLowerCase()) || 0}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          {filteredRegisteredCourses.length > COURSES_PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-slate-500">
                Page {registeredCoursePage} of {registeredCourseTotalPages}
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setRegisteredCoursePage((prev) => Math.max(1, prev - 1))}
                  disabled={registeredCoursePage <= 1}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Previous
                </button>
                <button
                  type="button"
                  onClick={() => setRegisteredCoursePage((prev) => Math.min(registeredCourseTotalPages, prev + 1))}
                  disabled={registeredCoursePage >= registeredCourseTotalPages}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Section: Assessments
  const assignmentsSection = (
    <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
      <div className="section-head section-head-amber">
        <h3 className="text-lg">Assessments</h3>
      </div>
      <div className="p-6">
        {assignments.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No assessments assigned yet</div>
        ) : (
          <div className="space-y-4">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h4 className="font-bold text-slate-900">{assignment.title}</h4>
                    <p className="text-slate-600 text-sm mt-1">{assignment.description}</p>
                  </div>
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ml-3 ${
                      assignment.status === "completed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {assignment.status === "completed" ? "Submitted" : "Ready"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm text-slate-600 mb-4">
                  <div>Course: {assignment.courseName || "-"}</div>
                  <div>Due: {formatDate(assignment.dueDate)}</div>
                  <div>Type: {String(assignment.assessmentType || "mcq").toUpperCase()}</div>
                  <div>Time: {Number(assignment.timeLimitMinutes || 0)} min</div>
                  <div>Pass: {Number(assignment.passingMarks || 0)}/{Number(assignment.totalMarks || 0)}</div>
                  <div>Score: {assignment.score == null ? "-" : `${assignment.score}/${Number(assignment.totalMarks || 0)}`}</div>
                </div>

                {assignment.instructions && (
                  <div className="bg-white rounded-lg p-3 mb-4 text-sm text-slate-700 border border-slate-200">
                    <p className="font-semibold text-slate-900 mb-1">Instructions:</p>
                    <p>{assignment.instructions}</p>
                  </div>
                )}

                {assignment.status !== "completed" && (
                  <button
                    onClick={() => setAssessmentPendingSubmit(assignment)}
                    disabled={actionLoading === `submitAssessment:${assignment.id}`}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-500 text-white font-semibold hover:bg-emerald-600 transition-all duration-200"
                  >
                    <FiCheck /> {actionLoading === `submitAssessment:${assignment.id}` ? "Submitting..." : "Submit"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const communicationSection = (
    <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
      <div className="section-head section-head-indigo">
        <h3 className="text-lg">Communication Practice</h3>
      </div>
      <div className="p-6">
        {communicationLoading ? (
          <div className="text-sm text-slate-500">Loading communication tasks...</div>
        ) : communicationSkills.length === 0 ? (
          <div className="text-sm text-slate-500">No communication tasks assigned yet.</div>
        ) : (
          <div className="space-y-4">
            {communicationSkills.map((group) => (
              <div key={group.skillId} className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div>
                  <p className="font-semibold text-slate-900">{group.title}</p>
                  <p className="text-xs text-slate-500">Communication skill</p>
                </div>
                {(group.tasks || []).map((task) => {
                  const draftKey = `${group.skillId}__${task.id}`;
                  const draft = communicationDrafts[draftKey] || { response: "", responseUrl: "" };
                  const submission = task.submission || null;
                  return (
                    <div key={task.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">Day {task.dayNumber} - {task.practiceType}</p>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${submission ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
                          {submission ? (submission.status || "submitted") : "pending"}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700">{task.description}</p>
                      {task.instructions && <p className="text-xs text-slate-500">Instructions: {task.instructions}</p>}
                      {task.referenceLink && (
                        <a href={task.referenceLink} target="_blank" rel="noreferrer" className="text-xs text-indigo-600">
                          Reference Link
                        </a>
                      )}
                      <textarea
                        rows={2}
                        value={draft.response}
                        onChange={(e) => setCommunicationDrafts((prev) => ({ ...prev, [draftKey]: { ...draft, response: e.target.value } }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Write your response"
                      />
                      <input
                        value={draft.responseUrl}
                        onChange={(e) => setCommunicationDrafts((prev) => ({ ...prev, [draftKey]: { ...draft, responseUrl: e.target.value } }))}
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                        placeholder="Upload response link (optional)"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white"
                          onClick={() => submitCommunicationResponse(group.skillId, task.id)}
                          disabled={actionLoading === `communication:${task.id}`}
                        >
                          {actionLoading === `communication:${task.id}` ? "Submitting..." : "Upload Response"}
                        </button>
                        <button
                          className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white"
                          onClick={() => submitCommunicationResponse(group.skillId, task.id)}
                          disabled={actionLoading === `communication:${task.id}`}
                        >
                          Mark Completed
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Section: Attendance
  const attendanceSection = (
    <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
      <div className="section-head section-head-cyan">
        <h3 className="text-lg">Attendance</h3>
      </div>
      <div className="p-6">
        {attendance.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No attendance records yet</div>
        ) : (
          <div className="space-y-3">
            {attendance.map((record) => (
              <div key={record.id} className="flex items-center justify-between p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div>
                  <p className="font-semibold text-slate-900">{formatDate(record.date)}</p>
                  <p className="text-sm text-slate-600">{record.courseName || "General"}</p>
                </div>
                <span
                  className={`text-sm font-bold px-4 py-2 rounded-lg flex items-center gap-2 ${
                    record.status === "present"
                      ? "bg-emerald-100 text-emerald-700"
                      : record.status === "partial"
                      ? "bg-amber-100 text-amber-700"
                      : "bg-red-100 text-red-700"
                  }`}
                >
                  {record.status === "present" ? <FiCheck /> : record.status === "partial" ? <FiActivity /> : <FiX />}
                  {record.status === "present" ? "Present" : record.status === "partial" ? "Partial" : "Absent"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  // Section: Resources
  const resourcesSection = (
    <div className="rounded-2xl bg-white shadow-md border border-slate-100 overflow-hidden">
      <div className="section-head section-head-teal">
        <h3 className="text-lg">Resources</h3>
      </div>
      <div className="p-6">
        {resources.length === 0 ? (
          <div className="text-center py-8 text-slate-500">No resources available</div>
        ) : (
          <div className="space-y-6">
            {resources.reduce((acc, resource) => {
              const existing = acc.find((r) => r.courseName === resource.courseName);
              if (existing) {
                existing.links.push(resource);
              } else {
                acc.push({ courseName: resource.courseName, links: [resource] });
              }
              return acc;
            }, []).map((courseResources) => (
              <div key={courseResources.courseName} className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                <h4 className="font-bold text-slate-900 mb-4">{courseResources.courseName}</h4>
                <div className="space-y-3">
                  {courseResources.links.map((link, idx) => (
                    <a
                      key={`${courseResources.courseName}-${idx}`}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-3 p-3 rounded-lg bg-white border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 transition-all duration-200"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900 capitalize">{link.type}</p>
                        <p className="text-xs text-slate-600 truncate">{link.url}</p>
                      </div>
                      <FiLink2 className="text-indigo-600 shrink-0" />
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );

  const sections = {
    dashboard: dashboardSection,
    skills: skillsSection,
    addSkill: addSkillSection,
    courses: coursesSection,
    assignments: assignmentsSection,
    communication: communicationSection,
    attendance: attendanceSection,
    resources: resourcesSection,
  };

  return (
    <div className="ui-shell min-h-screen bg-[#f8fafc] px-4 lg:px-6 py-6">
      <div className="ui-page relative max-w-7xl mx-auto flex lg:flex-row flex-col items-start gap-6">
        {/* Sidebar Navigation */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="app-sidebar-panel p-4 shadow-sm sticky top-4">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">STUDENT</p>
              <h2 className="text-xl font-bold text-slate-900 mt-1">Dashboard</h2>
              <p className="text-xs text-slate-500 mt-1">{student?.name || student?.email || loggedInEmail || "Student"}</p>
            </div>
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`app-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 border ${
                      active ? "is-active border-indigo-500" : "border-transparent hover:border-indigo-100"
                    }`}
                  >
                    <Icon className="text-[18px]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-5 pt-4 border-t border-slate-200 space-y-2">
              <button
                onClick={() => window.location.reload()}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 transition-all duration-200"
              >
                <FiRefreshCw /> Refresh
              </button>
              <button
                onClick={handleLogout}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition-all duration-200"
              >
                <FiLogOut /> Logout
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <div className="ui-main flex-1 w-full min-w-0 flex flex-col gap-6">
          <header className="ui-card px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-600">Student</p>
              <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 text-sm font-semibold"
              >
                {resolvedTheme === "dark" ? <FiSun /> : <FiMoon />}
                {resolvedTheme === "dark" ? "Light" : "Dark"}
              </button>
              {status && (
                <div
                  className={`status-banner ${/fail|error|cannot|unable/i.test(status) ? "bg-red-100 text-red-700 border-red-200" : "bg-emerald-100 text-emerald-700 border-emerald-200"}`}
                >
                  {status}
                </div>
              )}
            </div>
          </header>

          <main className="space-y-6" aria-busy={isLoading ? "true" : "false"}>
            {isLoading ? (
              <div className="ui-card p-6 space-y-4">
                <div className="flex items-center gap-3 text-slate-700">
                  <LoadingSpinner label="Loading student data" />
                  <span className="text-sm font-medium">Loading dashboard...</span>
                </div>
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                  <div className="ui-skeleton h-20 rounded-xl" />
                  <div className="ui-skeleton h-20 rounded-xl" />
                  <div className="ui-skeleton h-20 rounded-xl" />
                  <div className="ui-skeleton h-20 rounded-xl" />
                </div>
              </div>
            ) : (
              sections[activeSection] || sections.dashboard
            )}
          </main>
        </div>
      </div>
      <ConfirmDialog
        open={Boolean(skillPendingDelete)}
        title="Delete skill"
        message={`Delete ${skillPendingDelete?.title || "this skill"}?`}
        confirmText="Delete"
        cancelText="Cancel"
        danger
        loading={actionLoading === `deleteSkill:${skillPendingDelete?.id || ""}`}
        onCancel={() => setSkillPendingDelete(null)}
        onConfirm={confirmDeleteSkill}
      />
      <ConfirmDialog
        open={Boolean(assessmentPendingSubmit)}
        title="Submit assessment"
        message={`Submit ${assessmentPendingSubmit?.title || "this assessment"}?`}
        confirmText="Submit"
        cancelText="Cancel"
        loading={actionLoading === `submitAssessment:${assessmentPendingSubmit?.id || ""}`}
        onCancel={() => setAssessmentPendingSubmit(null)}
        onConfirm={confirmSubmitAssessment}
      />
    </div>
  );
}
