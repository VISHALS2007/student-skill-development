import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  FiBookOpen,
  FiUsers,
  FiUpload,
  FiEdit3,
  FiBarChart2,
  FiPieChart,
  FiLogOut,
  FiTrendingUp,
  FiActivity,
  FiTarget,
  FiLayers,
  FiSearch,
  FiCalendar,
  FiClipboard,
  FiMessageSquare,
  FiRefreshCw,
  FiUser,
  FiCheck,
  FiX,
  FiMoon,
  FiSun,
} from "react-icons/fi";
import { auth } from "../firebase";
import DashboardCard from "../components/DashboardCard";
import CountUpValue from "../components/CountUpValue";
import LoadingSpinner from "../components/LoadingSpinner";
import AdminCourses from "./AdminCourses";
import { adminApi } from "../lib/adminApi";
import { useTheme } from "../lib/ThemeContext";
import { toast } from "react-toastify";
import { useAuth } from "../lib/AuthContext";
import { getUserProfile } from "../lib/roleHelpers";

const ADMIN_SESSION_KEY = "adminSession:v1";
const ADMIN_TOKEN_KEY = "adminToken:v1";
const DASHBOARD_CACHE_KEY = "adminDashboardCache:v1";
const DASHBOARD_CACHE_TTL_MS = 45 * 1000;

const normalizeAdminRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" ? "main_admin" : normalized;
};

const isMainAdminRole = (role = "") => normalizeAdminRole(role) === "main_admin";
const isSubAdminRole = (role = "") => normalizeAdminRole(role) === "sub_admin";
const allAdminRoles = ["main_admin", "sub_admin"];
const mainAdminRoles = ["main_admin"];
const subAdminRoles = ["sub_admin"];

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: FiPieChart, roles: allAdminRoles },
  { id: "users", label: "Students", icon: FiUsers, roles: allAdminRoles },
  { id: "attendance", label: "Attendance", icon: FiCalendar, roles: mainAdminRoles },
  { id: "progress", label: "Performance", icon: FiActivity, roles: mainAdminRoles },
  { id: "reports", label: "Reports", icon: FiBarChart2, roles: mainAdminRoles },
  { id: "courses", label: "Courses", icon: FiBookOpen, roles: subAdminRoles },
  { id: "allocation", label: "Allocation", icon: FiUpload, roles: subAdminRoles },
  { id: "assignments", label: "Assessments", icon: FiClipboard, roles: subAdminRoles },
];

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const dedupeRepeatedMessage = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.length % 2 === 0) {
    const half = text.slice(0, text.length / 2);
    if (half === text.slice(text.length / 2)) return half.trim();
  }
  return text;
};

const normalizeTopPanelStatus = (value = "") => {
  const message = dedupeRepeatedMessage(value);
  if (!message) return "";
  if (/cannot connect to admin server/i.test(message)) {
    return "Backend server is offline. Please start the server.";
  }
  return message;
};

const csvCell = (value) => {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
};

const emptyCourse = { course_name: "", description: "" };
const emptyCommunicationTask = {
  dayNumber: 1,
  practiceType: "speaking",
  description: "",
  referenceLink: "",
  instructions: "",
  evaluationMarks: 10,
};
const emptyAssignment = {
  title: "",
  description: "",
  openDate: "",
  dueDate: "",
  instructions: "",
  assessmentType: "mcq",
  timeLimitMinutes: 20,
  totalMarks: 20,
  passingMarks: 10,
  numberOfQuestions: 10,
  autoEvaluate: true,
  programmingLanguage: "javascript",
  problemStatement: "",
  testCases: "[]",
  assignTo: "all",
  courseId: "",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { resolvedTheme, setTheme } = useTheme();
  const { user } = useAuth();
  const [adminRole, setAdminRole] = useState("");
  const [activeSection, setActiveSection] = useState("");
  const [roleResolved, setRoleResolved] = useState(false);
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [leaderboard, setLeaderboard] = useState([]);
  const [reports, setReports] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [assignmentProgress, setAssignmentProgress] = useState(null);
  const [search, setSearch] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userRoleFilter, setUserRoleFilter] = useState("all");
  const [courseSearch, setCourseSearch] = useState("");
  const [courseCategoryFilter, setCourseCategoryFilter] = useState("all");
  const [courseStatusFilter, setCourseStatusFilter] = useState("all");
  const [courseDateFilter, setCourseDateFilter] = useState("");
  const [debouncedCourseSearch, setDebouncedCourseSearch] = useState("");
  const [coursesFeed, setCoursesFeed] = useState([]);
  const [coursesPage, setCoursesPage] = useState(1);
  const [coursesTotal, setCoursesTotal] = useState(0);
  const [coursesHasMore, setCoursesHasMore] = useState(false);
  const [coursesFeedLoading, setCoursesFeedLoading] = useState(false);
  const [reportSearch, setReportSearch] = useState("");
  const [reportStatusFilter, setReportStatusFilter] = useState("all");
  const [reportCourseFilter, setReportCourseFilter] = useState("all");
  const [reportDateFilter, setReportDateFilter] = useState("");
  const [attendanceCourseId, setAttendanceCourseId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState("");
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourseId, setEditingCourseId] = useState("");
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [editingAssignmentId, setEditingAssignmentId] = useState("");
  const [assessmentResults, setAssessmentResults] = useState([]);
  const [recentAssessmentResults, setRecentAssessmentResults] = useState([]);
  const [studentPassword, setStudentPassword] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assignDepartment, setAssignDepartment] = useState("");
  const [assignBatch, setAssignBatch] = useState("");
  const [assignYear, setAssignYear] = useState("");
  const [allocationSearch, setAllocationSearch] = useState("");
  const [debouncedAllocationSearch, setDebouncedAllocationSearch] = useState("");
  const [allocationStudents, setAllocationStudents] = useState([]);
  const [allocationStudentsPage, setAllocationStudentsPage] = useState(1);
  const [allocationStudentsTotal, setAllocationStudentsTotal] = useState(0);
  const [allocationStudentsHasMore, setAllocationStudentsHasMore] = useState(false);
  const [allocationStudentsLoading, setAllocationStudentsLoading] = useState(false);
  const [allocationListSearch, setAllocationListSearch] = useState("");
  const [assignStartDate, setAssignStartDate] = useState("");
  const [assignEndDate, setAssignEndDate] = useState("");
  const [courseAllocations, setCourseAllocations] = useState([]);
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [progressCourseId, setProgressCourseId] = useState("");
  const [progressDate, setProgressDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyProgress, setDailyProgress] = useState([]);
  const [allottedSkills, setAllottedSkills] = useState([]);
  const [allottedSkillsPage, setAllottedSkillsPage] = useState(1);
  const [allottedSkillsTotal, setAllottedSkillsTotal] = useState(0);
  const [allottedSkillsHasMore, setAllottedSkillsHasMore] = useState(false);
  const [allottedSkillsLoading, setAllottedSkillsLoading] = useState(false);
  const [selectedCommunicationSkillId, setSelectedCommunicationSkillId] = useState("");
  const [communicationTasks, setCommunicationTasks] = useState([]);
  const [communicationTaskForm, setCommunicationTaskForm] = useState(emptyCommunicationTask);
  const [communicationTaskDrafts, setCommunicationTaskDrafts] = useState({});
  const [communicationSubmissions, setCommunicationSubmissions] = useState([]);
  const [communicationSubmissionsPage, setCommunicationSubmissionsPage] = useState(1);
  const [communicationSubmissionsHasMore, setCommunicationSubmissionsHasMore] = useState(false);
  const [communicationSubmissionsTotal, setCommunicationSubmissionsTotal] = useState(0);
  const [communicationSubmissionStatus, setCommunicationSubmissionStatus] = useState("all");
  const [communicationReviewDrafts, setCommunicationReviewDrafts] = useState({});
  const [status, setStatus] = useState("");
  const [loadingSection, setLoadingSection] = useState(false);
  const [savingAction, setSavingAction] = useState("");
  const [usersPage, setUsersPage] = useState(1);
  const [usersPageSize, setUsersPageSize] = useState(10);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const loadedSectionsRef = useRef(new Set());
  const topPanelStatus = useMemo(() => normalizeTopPanelStatus(status), [status]);

  useEffect(() => {
    let active = true;

    const resolveRole = async () => {
      let resolvedRole = "main_admin";
      try {
        const raw = localStorage.getItem(ADMIN_SESSION_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        const sessionRole = normalizeAdminRole(parsed?.role || "");
        if (isMainAdminRole(sessionRole) || isSubAdminRole(sessionRole)) {
          resolvedRole = sessionRole;
        } else if (user?.uid) {
          const profile = await getUserProfile(user.uid);
          const profileRole = normalizeAdminRole(profile?.role || "");
          if (isMainAdminRole(profileRole) || isSubAdminRole(profileRole)) {
            resolvedRole = profileRole;
          }
        }
      } catch {
        resolvedRole = "main_admin";
      }

      if (!active) return;

      setAdminRole(resolvedRole);
      const firstAllowedSection = navItems.find((item) => item.roles.includes(resolvedRole))?.id || "dashboard";
      setActiveSection(firstAllowedSection);
      setRoleResolved(true);
      setStatus("");
    };

    resolveRole();

    return () => {
      active = false;
    };
  }, [user?.uid]);

  const visibleNavItems = useMemo(
    () => navItems.filter((item) => item.roles.includes(adminRole)),
    [adminRole]
  );

  const canAccessSection = useCallback(
    (sectionId) => visibleNavItems.some((item) => item.id === sectionId),
    [visibleNavItems]
  );

  const canManageUsers = isMainAdminRole(adminRole);

  useEffect(() => {
    if (!roleResolved) return;
    if (!canAccessSection(activeSection)) {
      setActiveSection(visibleNavItems[0]?.id || "");
      return;
    }

    if (status && /insufficient admin permissions|do not have permission/i.test(status)) {
      setStatus("");
    }
  }, [roleResolved, activeSection, canAccessSection, visibleNavItems, status]);

  const readDashboardCache = useCallback(() => {
    try {
      const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.ts || Date.now() - parsed.ts > DASHBOARD_CACHE_TTL_MS) {
        sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
        return null;
      }
      return parsed.data || null;
    } catch {
      return null;
    }
  }, []);

  const writeDashboardCache = useCallback((data) => {
    try {
      sessionStorage.setItem(DASHBOARD_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {
      // ignore cache write errors
    }
  }, []);

  const invalidateDashboardCache = useCallback(() => {
    try {
      sessionStorage.removeItem(DASHBOARD_CACHE_KEY);
    } catch {
      // ignore cache delete errors
    }
  }, []);

  const analytics = useMemo(() => {
    const todayKey = new Date().toISOString().slice(0, 10);
    const totalUsers = users.length;
    const totalCourses = reports?.item?.totalCourses ?? courses.length;
    const activeAssignments = assignments.length;
    const todaysRows = attendance.filter((item) => String(item.date || "") === todayKey);
    const presentToday = todaysRows.filter((item) => String(item.status || "").toLowerCase() === "present").length;
    const absentToday = todaysRows.filter((item) => String(item.status || "").toLowerCase() !== "present").length;
    const avgPerformance = leaderboard.length
      ? Math.round(leaderboard.reduce((sum, row) => sum + Number(row.completionPct || 0), 0) / leaderboard.length)
      : 0;
    const assignedStudents = allocationStudentsTotal || new Set(attendance.map((item) => String(item.user_id || "")).filter(Boolean)).size;

    if (isSubAdminRole(adminRole)) {
      return [
        { label: "Assigned Students", value: assignedStudents, icon: FiUsers, tone: "text-indigo-600 bg-indigo-50" },
        { label: "Active Courses", value: totalCourses, icon: FiTarget, tone: "text-sky-600 bg-sky-50" },
        { label: "Assessments Created", value: activeAssignments, icon: FiClipboard, tone: "text-amber-600 bg-amber-50" },
        { label: "Allocation Status", value: courseAllocations.length, suffix: " Active", icon: FiUpload, tone: "text-emerald-600 bg-emerald-50" },
      ];
    }

    return [
      { label: "Total Students", value: totalUsers, icon: FiLayers, tone: "text-indigo-600 bg-indigo-50" },
      { label: "Active Courses", value: totalCourses, icon: FiTarget, tone: "text-sky-600 bg-sky-50" },
      { label: "Present Today", value: presentToday, icon: FiCheck, tone: "text-emerald-600 bg-emerald-50" },
      { label: "Absent Today", value: absentToday, icon: FiX, tone: "text-rose-600 bg-rose-50" },
      { label: "Average Performance", value: avgPerformance, suffix: "%", icon: FiTrendingUp, tone: "text-purple-600 bg-purple-50" },
    ];
  }, [adminRole, reports, users, courses, assignments, attendance, leaderboard, allocationStudentsTotal, courseAllocations]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setUsersPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedCourseSearch(courseSearch.trim());
      setCoursesPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [courseSearch]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedAllocationSearch(allocationSearch.trim());
      setAllocationStudentsPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [allocationSearch]);

  const loadDashboardData = useCallback(async (allowCache = true) => {
    if (allowCache) {
      const cached = readDashboardCache();
      if (cached) {
        setCourses(cached.courses || []);
        setAssignments(cached.assignments || []);
        setReports(cached.reports || null);
        setAttendance(cached.attendance || []);
        setLeaderboard(cached.leaderboard || []);
        setAssessmentResults(cached.assessmentResults || []);
        setRecentAssessmentResults(cached.recentAssessmentResults || []);
        return;
      }
    }

    const attendanceQuery =
      attendanceCourseId || attendanceDate
        ? `?${new URLSearchParams({
            ...(attendanceCourseId ? { courseId: attendanceCourseId } : {}),
            ...(attendanceDate ? { date: attendanceDate } : {}),
          }).toString()}`
        : "";

    const requests = [
      { key: "courses", run: () => adminApi.getCourses({ page: 1, pageSize: 200, force: true }) },
      { key: "assignments", run: () => adminApi.getAssessments() },
      { key: "results", run: () => adminApi.getAssessmentResults() },
      { key: "recent", run: () => adminApi.getRecentAssessmentResults() },
      { key: "attendance", run: () => adminApi.getAttendance(attendanceQuery) },
      { key: "leaderboard", run: () => adminApi.getLeaderboard() },
    ];

    if (isMainAdminRole(adminRole)) {
      requests.push({ key: "reports", run: () => adminApi.getDashboardSummary().catch(() => adminApi.getReports()) });
    }

    const settled = await Promise.allSettled(requests.map((item) => item.run()));
    const byKey = new Map();
    settled.forEach((result, idx) => {
      byKey.set(requests[idx].key, result);
    });

    const firstError = settled.find(
      (result) =>
        result.status === "rejected" &&
        !/insufficient admin permissions|admin access required/i.test(String(result.reason?.message || ""))
    );

    const coursesRes = byKey.get("courses");
    const assignmentsRes = byKey.get("assignments");
    const reportsRes = byKey.get("reports");
    const attendanceRes = byKey.get("attendance");
    const leaderboardRes = byKey.get("leaderboard");
    const resultsRes = byKey.get("results");
    const recentRes = byKey.get("recent");

    const nextCourses = coursesRes?.status === "fulfilled" ? coursesRes.value.items || [] : courses;
    const nextAssignments = assignmentsRes?.status === "fulfilled" ? assignmentsRes.value.items || [] : assignments;
    const nextReports = isMainAdminRole(adminRole)
      ? (reportsRes?.status === "fulfilled" ? reportsRes.value || null : reports)
      : null;
    const nextAttendance = attendanceRes?.status === "fulfilled" ? attendanceRes.value.items || [] : attendance;
    const nextLeaderboard = leaderboardRes?.status === "fulfilled" ? leaderboardRes.value.items || [] : leaderboard;
    const nextResults = resultsRes?.status === "fulfilled" ? resultsRes.value.items || [] : assessmentResults;
    const nextRecent = recentRes?.status === "fulfilled" ? recentRes.value.items || [] : recentAssessmentResults;

    if (coursesRes?.status === "fulfilled") setCourses(nextCourses);
    if (assignmentsRes?.status === "fulfilled") setAssignments(nextAssignments);
    if (isMainAdminRole(adminRole)) {
      if (reportsRes?.status === "fulfilled") setReports(nextReports);
    } else {
      setReports(null);
    }
    if (attendanceRes?.status === "fulfilled") setAttendance(nextAttendance);
    if (leaderboardRes?.status === "fulfilled") setLeaderboard(nextLeaderboard);
    if (resultsRes?.status === "fulfilled") setAssessmentResults(nextResults);
    if (recentRes?.status === "fulfilled") setRecentAssessmentResults(nextRecent);

    writeDashboardCache({
      courses: nextCourses,
      assignments: nextAssignments,
      reports: nextReports,
      attendance: nextAttendance,
      leaderboard: nextLeaderboard,
      assessmentResults: nextResults,
      recentAssessmentResults: nextRecent,
    });

    if (firstError?.status === "rejected") {
      setStatus(firstError.reason?.message || "Some admin data could not be loaded");
    }
  }, [adminRole, attendanceCourseId, attendanceDate, readDashboardCache, writeDashboardCache, courses, assignments, reports, attendance, leaderboard, assessmentResults, recentAssessmentResults]);

  const loadUsersOnly = useCallback(async () => {
    if (isSubAdminRole(adminRole)) {
      const usersRes = await adminApi.getStudents({
        search: debouncedSearch,
        fields: "name,email,enabled,role,department,departmentCode,batch,course,year",
        status: userStatusFilter,
        page: usersPage,
        pageSize: usersPageSize,
      });
      const nextUsers = (usersRes.items || []).map((item) => ({ ...item, role: "student" }));
      setUsers(nextUsers);
      setUsersTotal(usersRes.total || 0);
      setUsersHasMore(Boolean(usersRes.hasMore));
      if (selectedUserId) {
        const existing = nextUsers.find((u) => u.id === selectedUserId) || null;
        if (existing) setSelectedUser(existing);
      }
      return;
    }

    const usersRes = await adminApi.getUsers(debouncedSearch, {
      role: userRoleFilter,
      fields: "name,email,enabled,role,department,departmentCode,batch,course,year",
      status: userStatusFilter,
      page: usersPage,
      pageSize: usersPageSize,
    });
    const nextUsers = usersRes.items || [];
    setUsers(nextUsers);
    setUsersTotal(usersRes.total || 0);
    setUsersHasMore(Boolean(usersRes.hasMore));
    if (selectedUserId) {
      const existing = nextUsers.find((u) => u.id === selectedUserId) || null;
      if (existing) setSelectedUser(existing);
    }
  }, [adminRole, debouncedSearch, userRoleFilter, userStatusFilter, usersPage, usersPageSize, selectedUserId]);

  const loadCoursesFeed = useCallback(async ({ append = false, force = false, pageOverride = null } = {}) => {
    const targetPage = pageOverride ?? (append ? coursesPage + 1 : 1);
    setCoursesFeedLoading(true);
    try {
      const result = await adminApi.getCourses({
        search: debouncedCourseSearch,
        category: courseCategoryFilter,
        status: courseStatusFilter,
        date: courseDateFilter,
        fields: "title,course_name,category,customCategory,description,startDate,endDate,durationDays,difficulty,status,links,websiteRef",
        page: targetPage,
        pageSize: 10,
        force,
      });

      const nextItems = result.items || [];
      setCoursesFeed((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setCoursesPage(targetPage);
      setCoursesTotal(result.total || 0);
      setCoursesHasMore(Boolean(result.hasMore));
    } catch (err) {
      setStatus(err.message || "Failed to load courses");
    } finally {
      setCoursesFeedLoading(false);
    }
  }, [debouncedCourseSearch, courseCategoryFilter, courseStatusFilter, courseDateFilter, coursesPage]);

  const loadAllocationStudents = useCallback(async ({ append = false, force = false, pageOverride = null } = {}) => {
    if (!assignCourseId) {
      setAllocationStudents([]);
      setAllocationStudentsTotal(0);
      setAllocationStudentsHasMore(false);
      return;
    }

    const targetPage = pageOverride ?? (append ? allocationStudentsPage + 1 : 1);
    setAllocationStudentsLoading(true);
    try {
      const res = await adminApi.getStudents({
        search: debouncedAllocationSearch,
        department: assignDepartment,
        batch: assignBatch,
        year: assignYear,
        fields: "name,email,enabled,role,department,departmentCode,batch,course,year",
        page: targetPage,
        pageSize: 10,
        force,
      });
      const nextItems = res.items || [];
      setAllocationStudents((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setAllocationStudentsPage(targetPage);
      setAllocationStudentsTotal(res.total || 0);
      setAllocationStudentsHasMore(Boolean(res.hasMore));
    } catch (err) {
      setStatus(err.message || "Failed to load students for allocation");
    } finally {
      setAllocationStudentsLoading(false);
    }
  }, [assignCourseId, debouncedAllocationSearch, assignDepartment, assignBatch, assignYear, allocationStudentsPage]);

  const loadAllottedSkills = useCallback(async ({ append = false, pageOverride = null } = {}) => {
    const targetPage = pageOverride ?? (append ? allottedSkillsPage + 1 : 1);
    setAllottedSkillsLoading(true);
    try {
      const query = `?${new URLSearchParams({ page: String(targetPage), pageSize: "6" }).toString()}`;
      const res = await adminApi.getAllottedSkills(query);
      const nextItems = res.items || [];
      setAllottedSkills((prev) => (append ? [...prev, ...nextItems] : nextItems));
      setAllottedSkillsPage(targetPage);
      setAllottedSkillsTotal(res.total || 0);
      setAllottedSkillsHasMore(Boolean(res.hasMore));

      if (!selectedCommunicationSkillId) {
        const firstCommunication = nextItems.find((item) => item.category === "communication");
        if (firstCommunication?.id) setSelectedCommunicationSkillId(firstCommunication.id);
      }
    } catch (err) {
      setStatus(err.message || "Failed to load allotted skills");
    } finally {
      setAllottedSkillsLoading(false);
    }
  }, [allottedSkillsPage, selectedCommunicationSkillId]);

  const loadCommunicationSubmissions = useCallback(async ({ pageOverride = 1, statusOverride = communicationSubmissionStatus } = {}) => {
    if (!selectedCommunicationSkillId) {
      setCommunicationSubmissions([]);
      setCommunicationSubmissionsTotal(0);
      setCommunicationSubmissionsHasMore(false);
      return;
    }
    const query = new URLSearchParams({
      skillId: selectedCommunicationSkillId,
      status: statusOverride || "all",
      page: String(pageOverride),
      pageSize: "8",
    }).toString();
    const res = await adminApi.getCommunicationSubmissions(`?${query}`);
    setCommunicationSubmissions(res.items || []);
    setCommunicationSubmissionsTotal(res.total || 0);
    setCommunicationSubmissionsHasMore(Boolean(res.hasMore));
    setCommunicationSubmissionsPage(pageOverride);
    setCommunicationReviewDrafts(
      Object.fromEntries(
        (res.items || []).map((item) => [item.id, { status: item.status || "submitted", marks: Number(item.marks || 0), feedback: item.feedback || "" }])
      )
    );
  }, [selectedCommunicationSkillId, communicationSubmissionStatus]);

  const loadCommunicationTasksAndSubmissions = useCallback(async () => {
    if (!selectedCommunicationSkillId) {
      setCommunicationTasks([]);
      return;
    }

    const [tasksRes] = await Promise.all([
      adminApi.getCommunicationTasks(selectedCommunicationSkillId),
      loadCommunicationSubmissions({ pageOverride: 1 }),
    ]);

    const nextTasks = tasksRes.items || [];
    setCommunicationTasks(nextTasks);
    setCommunicationTaskDrafts(
      Object.fromEntries(
        nextTasks.map((task) => [
          task.id,
          {
            dayNumber: Number(task.dayNumber || 1),
            practiceType: task.practiceType || "speaking",
            description: task.description || "",
            referenceLink: task.referenceLink || "",
            instructions: task.instructions || "",
            evaluationMarks: Number(task.evaluationMarks || 0),
          },
        ])
      )
    );
  }, [selectedCommunicationSkillId, loadCommunicationSubmissions]);

  const loadSectionData = useCallback(async (section, force = false) => {
    if (!section) return;
    if (!canAccessSection(section)) {
      setStatus("You do not have permission for this section");
      return;
    }
    if (!force && loadedSectionsRef.current.has(section)) return;
    setLoadingSection(true);
    try {
      if (section === "users") {
        await loadUsersOnly();
      } else if (section === "courses") {
        await loadCoursesFeed({ append: false, force, pageOverride: 1 });
      } else {
        await loadDashboardData(section === "allocation" ? false : !force);
      }
      loadedSectionsRef.current.add(section);
    } catch (err) {
      setStatus(err.message || "Failed to load data");
    } finally {
      setLoadingSection(false);
    }
  }, [canAccessSection, loadDashboardData, loadUsersOnly, loadCoursesFeed]);

  const loadAll = useCallback(async () => {
    setLoadingSection(true);
    try {
      await Promise.all([loadDashboardData(false), loadUsersOnly()]);
    } catch (err) {
      setStatus(err.message || "Failed to refresh dashboard");
    } finally {
      setLoadingSection(false);
    }
  }, [loadDashboardData, loadUsersOnly]);

  useEffect(() => {
    if (!roleResolved) return;
    const firstSection = visibleNavItems[0]?.id;
    if (!firstSection) return;
    loadSectionData(firstSection);
  }, [roleResolved, visibleNavItems, loadSectionData]);

  useEffect(() => {
    if (!roleResolved || !activeSection) return;
    loadSectionData(activeSection);
  }, [roleResolved, activeSection, loadSectionData]);

  useEffect(() => {
    if (!roleResolved) return;
    if (activeSection === "users") {
      loadUsersOnly().catch((err) => setStatus(err.message || "Failed to load users"));
    }
  }, [roleResolved, activeSection, loadUsersOnly]);

  useEffect(() => {
    if (!roleResolved) return;
    if (activeSection === "courses") {
      loadCoursesFeed({ append: false, pageOverride: 1 }).catch((err) => setStatus(err.message || "Failed to load courses"));
    }
  }, [roleResolved, activeSection, loadCoursesFeed]);

  useEffect(() => {
    if (!roleResolved) return;
    if (activeSection === "allocation") {
      loadAllocationStudents({ append: false, pageOverride: 1 }).catch((err) => setStatus(err.message || "Failed to load students"));
      loadAllottedSkills({ append: false, pageOverride: 1 }).catch((err) => setStatus(err.message || "Failed to load allotted skills"));
    }
  }, [roleResolved, activeSection, loadAllocationStudents, loadAllottedSkills]);

  useEffect(() => {
    if (!roleResolved || activeSection !== "allocation") return;
    loadCommunicationTasksAndSubmissions().catch((err) => setStatus(err.message || "Failed to load communication data"));
  }, [roleResolved, activeSection, selectedCommunicationSkillId, communicationSubmissionStatus, loadCommunicationTasksAndSubmissions]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (activeSection === "dashboard") {
        loadSectionData("dashboard", true);
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [activeSection, loadSectionData]);

  useEffect(() => {
    if (!selectedAssignment) {
      setAssignmentProgress(null);
      return;
    }
    adminApi.getAssignmentProgress(selectedAssignment).then(setAssignmentProgress).catch((err) => {
      setStatus(err.message || "Failed to load assignment progress");
    });
  }, [selectedAssignment]);

  const handleLogout = async () => {
    try {
      await adminApi.logout();
    } catch {
      // Ignore API logout failures and clear local auth state anyway.
    }
    localStorage.removeItem(ADMIN_SESSION_KEY);
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  const saveCourse = async () => {
    if (savingAction) return;
    setSavingAction("saveCourse");
    try {
      if (editingCourseId) {
        await adminApi.updateCourse(editingCourseId, courseForm);
        setStatus("Course updated");
        toast.success("Course updated", { containerId: "global-toasts" });
      } else {
        await adminApi.createCourse(courseForm);
        setStatus("Course created");
        toast.success("Course created", { containerId: "global-toasts" });
      }
      setCourseForm(emptyCourse);
      setEditingCourseId("");
      invalidateDashboardCache();
      await loadSectionData("courses", true);
    } catch (err) {
      const message = err.message || "Failed to save course";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const saveAssignment = async () => {
    if (savingAction) return;
    if (!assignmentForm.title.trim()) {
      const message = "Assessment title is required";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
      return;
    }
    if (Number(assignmentForm.totalMarks || 0) <= 0 || Number(assignmentForm.passingMarks || 0) < 0) {
      const message = "Enter valid total and passing marks";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
      return;
    }
    setSavingAction("saveAssignment");
    try {
      if (editingAssignmentId) {
        await adminApi.updateAssessment(editingAssignmentId, assignmentForm);
        setStatus("Assessment updated");
        toast.success("Assessment updated", { containerId: "global-toasts" });
      } else {
        await adminApi.createAssessment(assignmentForm);
        setStatus("Assessment created");
        toast.success("Assessment created", { containerId: "global-toasts" });
      }
      setAssignmentForm(emptyAssignment);
      setEditingAssignmentId("");
      invalidateDashboardCache();
      await loadSectionData("assignments", true);
    } catch (err) {
      const message = err.message || "Failed to save assessment";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const toggleUserStatus = async (user) => {
    if (!canManageUsers) {
      setStatus("Only main admin can enable or disable users");
      return;
    }
    if (savingAction) return;
    const actionLabel = user.enabled === false ? "enable" : "disable";
    if (!window.confirm(`Are you sure you want to ${actionLabel} this user?`)) return;
    setSavingAction(`toggleUser:${user.id}`);
    try {
      await adminApi.updateUserStatus(user.id, { enabled: user.enabled === false });
      const message = user.enabled === false ? "User enabled" : "User disabled";
      setStatus(message);
      toast.success(message, { containerId: "global-toasts" });
      await loadUsersOnly();
    } catch (err) {
      const message = err.message || "Failed to update user status";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const updateUserRole = async (user, nextRole) => {
    if (!canManageUsers) {
      setStatus("Only main admin can update user roles");
      return;
    }
    if (!user?.id) return;
    if (normalizeAdminRole(user.role) === "main_admin") {
      setStatus("Main admin role cannot be changed");
      return;
    }
    if (savingAction) return;
    setSavingAction(`updateRole:${user.id}`);
    try {
      await adminApi.updateUserRole(user.id, { role: nextRole });
      const message = `Role updated to ${nextRole}`;
      setStatus(message);
      toast.success(message, { containerId: "global-toasts" });
      await loadUsersOnly();
    } catch (err) {
      const message = err.message || "Failed to update user role";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const deleteUser = async (userId) => {
    if (!canManageUsers) {
      setStatus("Only main admin can delete users");
      return;
    }
    if (savingAction) return;
    if (!window.confirm("Delete this user account permanently?")) return;
    setSavingAction(`deleteUser:${userId}`);
    try {
      await adminApi.deleteUser(userId);
      setStatus("User deleted");
      toast.success("User deleted", { containerId: "global-toasts" });
      await loadUsersOnly();
    } catch (err) {
      const message = err.message || "Failed to delete user";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const deleteCourse = async (courseId) => {
    setSavingAction(`deleteCourse:${courseId}`);
    try {
      await adminApi.deleteCourse(courseId);
      setStatus("Course deleted");
      invalidateDashboardCache();
      await loadSectionData("courses", true);
    } catch (err) {
      setStatus(err.message || "Failed to delete course");
    } finally {
      setSavingAction("");
    }
  };

  const deleteAssignment = async (assignmentId) => {
    if (savingAction) return;
    if (!window.confirm("Delete this assessment? This action cannot be undone.")) return;
    setSavingAction(`deleteAssignment:${assignmentId}`);
    try {
      await adminApi.deleteAssessment(assignmentId);
      setStatus("Assessment deleted");
      toast.success("Assessment deleted", { containerId: "global-toasts" });
      if (selectedAssignment === assignmentId) setSelectedAssignment("");
      invalidateDashboardCache();
      await loadSectionData("assignments", true);
    } catch (err) {
      const message = err.message || "Failed to delete assessment";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const resetStudentPassword = async () => {
    if (!canManageUsers) {
      setStatus("Only main admin can reset passwords");
      return;
    }
    if (!selectedUserId || !studentPassword.trim()) {
      setStatus("Select a user and enter a new password");
      toast.error("Select a user and enter a new password", { containerId: "global-toasts" });
      return;
    }
    if (studentPassword.trim().length < 6) {
      setStatus("Password must be at least 6 characters");
      toast.error("Password must be at least 6 characters", { containerId: "global-toasts" });
      return;
    }
    if (savingAction) return;
    setSavingAction("resetPassword");
    try {
      await adminApi.resetStudentPassword(selectedUserId, { password: studentPassword });
      setStudentPassword("");
      setStatus("Student password reset");
      toast.success("Student password reset", { containerId: "global-toasts" });
    } catch (err) {
      const message = err.message || "Failed to reset password";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const showProfile = async (userId) => {
    const found = users.find((u) => u.id === userId) || null;
    setSelectedUser(found);
    setSelectedUserId(userId);
  };

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const searchOk = !q || `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q);
      const statusOk =
        userStatusFilter === "all" ||
        (userStatusFilter === "enabled" && u.enabled !== false) ||
        (userStatusFilter === "disabled" && u.enabled === false);
      return searchOk && statusOk;
    });
  }, [users, search, userStatusFilter]);

  const userProgressStats = assignmentProgress?.item || null;
  const studentUsers = useMemo(() => filteredUsers.filter((u) => (u.role || "student") === "student"), [filteredUsers]);

  const courseCategories = useMemo(() => {
    return Array.from(new Set(courses.map((c) => (c.category === "custom" ? c.customCategory : c.category)).filter(Boolean)));
  }, [courses]);

  const courseById = useMemo(() => {
    const map = new Map();
    courses.forEach((c) => {
      map.set(c.id, c);
    });
    return map;
  }, [courses]);

  const allocatedUserIdsSet = useMemo(() => new Set((courseAllocations || []).map((a) => a.user_id).filter(Boolean)), [courseAllocations]);

  const allocationTargetUsers = useMemo(() => {
    const base = (allocationStudents || []).filter((u) => !allocatedUserIdsSet.has(u.id));
    return base;
  }, [allocationStudents, allocatedUserIdsSet]);

  const allocationDepartments = useMemo(() => {
    return Array.from(
      new Set(
        (allocationStudents || [])
          .map((u) => String(u.department || u.departmentCode || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [allocationStudents]);

  const allocationBatches = useMemo(() => {
    return Array.from(
      new Set(
        (allocationStudents || [])
          .map((u) => String(u.batch || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [allocationStudents]);

  const allocationYears = useMemo(() => {
    return Array.from(
      new Set(
        (allocationStudents || [])
          .map((u) => String(u.year || "").trim())
          .filter(Boolean)
      )
    ).sort((a, b) => a.localeCompare(b));
  }, [allocationStudents]);

  const filteredAllocationRows = useMemo(() => {
    const q = allocationListSearch.trim().toLowerCase();
    if (!q) return courseAllocations;
    return (courseAllocations || []).filter((item) => {
      const email = String(item.user?.email || item.user_id || "").toLowerCase();
      return email.includes(q);
    });
  }, [courseAllocations, allocationListSearch]);

  const communicationSkills = useMemo(
    () => allottedSkills.filter((item) => String(item.category || "").toLowerCase() === "communication"),
    [allottedSkills]
  );

  const filteredLeaderboard = useMemo(() => {
    return leaderboard.filter((row) => {
      const searchOk = !reportSearch.trim() || `${row.name || ""} ${row.email || ""}`.toLowerCase().includes(reportSearch.trim().toLowerCase());
      const statusOk =
        reportStatusFilter === "all" ||
        (reportStatusFilter === "completed" && row.completionPct >= 100) ||
        (reportStatusFilter === "active" && row.completionPct > 0 && row.completionPct < 100) ||
        (reportStatusFilter === "pending" && row.completionPct === 0);
      const courseOk = reportCourseFilter === "all" || String(reportCourseFilter) === "all";
      return searchOk && statusOk && courseOk;
    });
  }, [leaderboard, reportSearch, reportStatusFilter, reportCourseFilter]);

  const filteredReportRows = useMemo(() => {
    return dailyProgress.filter((row) => {
      const searchOk = !reportSearch.trim() || `${row.userEmail || ""} ${row.userName || ""}`.toLowerCase().includes(reportSearch.trim().toLowerCase());
      const statusOk = reportStatusFilter === "all" || String(row.status || "").toLowerCase() === reportStatusFilter.toLowerCase();
      const courseOk = reportCourseFilter === "all" || String(row.courseId || "") === reportCourseFilter;
      return searchOk && statusOk && courseOk;
    });
  }, [dailyProgress, reportSearch, reportStatusFilter, reportCourseFilter]);

  useEffect(() => {
    const visibleIds = new Set(allocationTargetUsers.map((u) => u.id));
    setSelectedUserIds((prev) => prev.filter((id) => visibleIds.has(id)));
  }, [allocationTargetUsers]);

  useEffect(() => {
    // Course change should start with a clean student selection set.
    setSelectedUserIds([]);
    setCourseAllocations([]);
    setAllocationListSearch("");
  }, [assignCourseId]);

  useEffect(() => {
    if (!communicationSkills.length) {
      setSelectedCommunicationSkillId("");
      return;
    }
    if (!selectedCommunicationSkillId || !communicationSkills.some((item) => item.id === selectedCommunicationSkillId)) {
      setSelectedCommunicationSkillId(communicationSkills[0].id);
    }
  }, [communicationSkills, selectedCommunicationSkillId]);

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const toggleSelectAllUsers = () => {
    const visibleIds = allocationTargetUsers.map((u) => u.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedUserIds.includes(id));
    setSelectedUserIds(allSelected ? selectedUserIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedUserIds, ...visibleIds])));
  };

  const loadMoreAllocationStudents = useCallback(() => {
    if (!allocationStudentsHasMore || allocationStudentsLoading) return;
    loadAllocationStudents({ append: true });
  }, [allocationStudentsHasMore, allocationStudentsLoading, loadAllocationStudents]);

  const handleAllocationStudentsScroll = useCallback(
    (event) => {
      const el = event.currentTarget;
      const remaining = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (remaining < 120) {
        loadMoreAllocationStudents();
      }
    },
    [loadMoreAllocationStudents]
  );

  const assignCourse = async () => {
    if (!assignCourseId) {
      setStatus("Select a course to assign");
      toast.error("Select a course to assign", { containerId: "global-toasts" });
      return;
    }
    if (!assignStartDate || !assignEndDate || new Date(assignStartDate) > new Date(assignEndDate)) {
      setStatus("Select a valid start and end date");
      toast.error("Select a valid start and end date", { containerId: "global-toasts" });
      return;
    }
    setSavingAction("assignCourse");
    try {
      if (!selectedUserIds.length) {
        setStatus("Select at least one user");
        toast.error("Select at least one user", { containerId: "global-toasts" });
        return;
      }
      const dedupedSelected = selectedUserIds.filter((id) => !allocatedUserIdsSet.has(id));
      if (!dedupedSelected.length) {
        setStatus("Selected users are already allocated");
        toast.error("Selected users are already allocated", { containerId: "global-toasts" });
        return;
      }
      await adminApi.assignCourseToSelected({
        course_id: assignCourseId,
        user_ids: dedupedSelected,
        status: "assigned",
        start_date: assignStartDate,
        end_date: assignEndDate,
      });
      setStatus("Course assigned successfully");
      toast.success("Course assigned successfully", { containerId: "global-toasts" });
      if (assignCourseId) {
        const allocations = await adminApi.getCourseAllocations(assignCourseId);
        setCourseAllocations(allocations.items || []);
      }
      adminApi.clearStudentsCache();
      setSelectedUserIds([]);
      setAssignDepartment("");
      setAssignBatch("");
      setAssignYear("");
      setAllocationSearch("");
      setDebouncedAllocationSearch("");
      setAssignStartDate("");
      setAssignEndDate("");
      await loadAllocationStudents({ append: false, force: true, pageOverride: 1 });
      invalidateDashboardCache();
      await loadSectionData("allocation", true);
    } catch (err) {
      setStatus(err.message || "Failed to assign course");
      toast.error(err.message || "Failed to assign course", { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const removeAllocation = async (allocationId, userId) => {
    if (!assignCourseId || !userId || !allocationId) return;
    if (savingAction) return;
    if (!window.confirm("Remove this student from the allocated course?")) return;
    setSavingAction(`removeAllocation:${userId}`);
    try {
      await adminApi.deleteAllocation(allocationId, assignCourseId);
      const allocations = await adminApi.getCourseAllocations(assignCourseId);
      setCourseAllocations(allocations.items || []);
      setStatus("Student removed from course");
      toast.success("Allocation removed", { containerId: "global-toasts" });
      setSelectedUserIds((prev) => prev.filter((id) => id !== userId));
      adminApi.clearStudentsCache();
      await loadAllocationStudents({ append: false, force: true, pageOverride: 1 });
    } catch (err) {
      setStatus(err.message || "Failed to remove student from course");
      toast.error(err.message || "Failed to remove student from course", { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const addCommunicationTask = async () => {
    if (!selectedCommunicationSkillId) {
      setStatus("Select a communication skill");
      return;
    }
    if (savingAction) return;
    if (!String(communicationTaskForm.description || "").trim()) {
      toast.error("Task description is required", { containerId: "global-toasts" });
      return;
    }
    setSavingAction("createCommunicationTask");
    try {
      await adminApi.createCommunicationTask({
        skillId: selectedCommunicationSkillId,
        ...communicationTaskForm,
      });
      toast.success("Task created", { containerId: "global-toasts" });
      setCommunicationTaskForm(emptyCommunicationTask);
      await loadCommunicationTasksAndSubmissions();
      await loadAllottedSkills({ append: false, pageOverride: 1 });
    } catch (err) {
      const message = err.message || "Failed to create task";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const saveCommunicationTask = async (taskId) => {
    if (savingAction) return;
    const draft = communicationTaskDrafts[taskId];
    if (!draft) return;
    if (!String(draft.description || "").trim()) {
      toast.error("Task description is required", { containerId: "global-toasts" });
      return;
    }
    setSavingAction(`saveCommunicationTask:${taskId}`);
    try {
      await adminApi.updateCommunicationTask(taskId, draft);
      toast.success("Task updated", { containerId: "global-toasts" });
      await loadCommunicationTasksAndSubmissions();
    } catch (err) {
      const message = err.message || "Failed to update task";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const reviewCommunicationSubmission = async (submissionId, statusOverride = "reviewed") => {
    if (savingAction) return;
    const draft = communicationReviewDrafts[submissionId] || {};
    setSavingAction(`reviewCommunication:${submissionId}`);
    try {
      await adminApi.reviewCommunicationSubmission(submissionId, {
        status: statusOverride || draft.status || "reviewed",
        marks: Number(draft.marks || 0),
        feedback: String(draft.feedback || "").trim(),
      });
      toast.success("Submission reviewed", { containerId: "global-toasts" });
      await loadCommunicationSubmissions({ pageOverride: communicationSubmissionsPage });
      await loadAllottedSkills({ append: false, pageOverride: 1 });
    } catch (err) {
      const message = err.message || "Failed to review submission";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const saveBulkAttendance = async () => {
    if (!attendanceCourseId || !attendanceDate) {
      setStatus("Select course and date for attendance");
      toast.error("Select course and date for attendance", { containerId: "global-toasts" });
      return;
    }
    if (savingAction) return;
    const entries = studentUsers.map((user) => ({ user_id: user.id, status: attendanceDraft[user.id] ? "present" : "absent" }));
    setSavingAction("saveAttendance");
    try {
      await adminApi.markBulkAttendance({ course_id: attendanceCourseId, date: attendanceDate, entries });
      setStatus("Attendance saved");
      toast.success("Attendance saved", { containerId: "global-toasts" });
      invalidateDashboardCache();
      await loadSectionData("attendance", true);
    } catch (err) {
      const message = err.message || "Failed to save attendance";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const loadDailyProgress = async () => {
    if (savingAction) return;
    setSavingAction("loadProgress");
    try {
      const query = new URLSearchParams({ ...(progressCourseId ? { courseId: progressCourseId } : {}), ...(progressDate ? { date: progressDate } : {}) }).toString();
      const res = await adminApi.getDailyProgress(query ? `?${query}` : "");
      setDailyProgress(res.items || []);
      toast.success("Progress loaded", { containerId: "global-toasts" });
    } catch (err) {
      const message = err.message || "Failed to fetch daily progress";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const exportReportCsv = () => {
    if (savingAction) return;
    setSavingAction("exportReport");
    try {
      const rows = filteredReportRows;
      if (!rows.length) {
        setStatus("No report rows to export");
        toast.error("No report rows to export", { containerId: "global-toasts" });
        return;
      }

      const header = ["student_id", "student_name", "student_email", "course_id", "status", "progress_percent", "attendance_status"];
      const body = rows.map((row) => [
        row.userId || "",
        row.userName || "",
        row.userEmail || "",
        row.courseId || "",
        row.status || "",
        row.progressPercent ?? 0,
        row.attendanceStatus || "",
      ]);

      const csv = [header, ...body].map((line) => line.map(csvCell).join(",")).join("\n");
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);
      anchor.href = url;
      anchor.download = `attendance-report-${stamp}.csv`;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      setStatus("Report exported successfully");
      toast.success("Report exported successfully", { containerId: "global-toasts" });
    } catch (err) {
      const message = err.message || "Failed to export report";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  const applyReportFilters = async () => {
    if (savingAction) return;
    setSavingAction("applyReportFilters");
    try {
      const query = new URLSearchParams({ ...(reportCourseFilter !== "all" ? { courseId: reportCourseFilter } : {}), ...(reportDateFilter ? { date: reportDateFilter } : {}) }).toString();
      const res = await adminApi.getDailyProgress(query ? `?${query}` : "");
      setDailyProgress(res.items || []);
      toast.success("Report filters applied", { containerId: "global-toasts" });
    } catch (err) {
      const message = err.message || "Failed to load report rows";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setSavingAction("");
    }
  };

  useEffect(() => {
    const loadAllocations = async () => {
      if (!assignCourseId) {
        setCourseAllocations([]);
        return;
      }
      try {
        const res = await adminApi.getCourseAllocations(assignCourseId);
        setCourseAllocations(res.items || []);
      } catch (err) {
        setStatus(err.message || "Failed to load course allocations");
      }
    };
    loadAllocations();
  }, [assignCourseId]);
  const sections = {
    dashboard: (
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
          <DashboardCard title="Workflow" subtitle="Overview" icon={FiRefreshCw} accent="indigo">
            <div className="space-y-3 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Single login</div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Users and attendance</div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Courses and allocation</div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Assessments and reports</div>
            </div>
          </DashboardCard>
          <DashboardCard title="Quick Actions" subtitle="Actions" icon={FiUpload} accent="purple">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Students", "users"],
                ["Courses", "courses"],
                ["Assessments", "assignments"],
                ["Allocation", "allocation"],
                ["Attendance", "attendance"],
                ["Performance", "progress"],
                ["Reports", "reports"],
              ].filter(([, section]) => canAccessSection(section)).map(([label, section]) => (
                <button key={section} className="rounded-xl border border-slate-100 bg-white p-3 text-sm font-semibold text-slate-800" onClick={() => setActiveSection(section)}>
                  {label}
                </button>
              ))}
            </div>
          </DashboardCard>
        </div>
      </div>
    ),
    users: (
      <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
        <DashboardCard title={isMainAdminRole(adminRole) ? "Users" : "Students"} subtitle="List" icon={FiUsers} accent="blue">
          <div className="flex flex-wrap gap-2 mb-4">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
              <FiSearch className="text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email" className="w-full bg-transparent outline-none text-sm" />
            </div>
            {isMainAdminRole(adminRole) && (
              <select value={userRoleFilter} onChange={(e) => setUserRoleFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
                <option value="all">All Roles</option>
                <option value="student">Students</option>
                <option value="sub_admin">Sub Admins</option>
                <option value="main_admin">Main Admin</option>
              </select>
            )}
            <select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white">
              <option value="all">All</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
            <button className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold disabled:opacity-60" onClick={() => loadUsersOnly()} disabled={loadingSection}>
              {loadingSection ? "Loading..." : "Load"}
            </button>
          </div>
          <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
            {filteredUsers.map((user) => (
              <div key={user.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{user.name || user.email}</p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                  <p className="text-xs text-slate-500 uppercase">Role: {normalizeAdminRole(user.role || "student")}</p>
                </div>
                <div className="ui-actions flex gap-2">
                  <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={() => showProfile(user.id)}>View</button>
                  {canManageUsers && normalizeAdminRole(user.role) !== "main_admin" && (
                    <button
                      className="px-3 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-700 text-xs font-semibold"
                      onClick={() => updateUserRole(user, normalizeAdminRole(user.role) === "sub_admin" ? "student" : "sub_admin")}
                      disabled={savingAction === `updateRole:${user.id}`}
                    >
                      {normalizeAdminRole(user.role) === "sub_admin" ? "Set Student" : "Set Sub Admin"}
                    </button>
                  )}
                  {canManageUsers && (
                    <button
                      className="px-3 py-1 rounded-lg bg-amber-50 border border-amber-100 text-amber-700 text-xs font-semibold"
                      onClick={() => toggleUserStatus(user)}
                      disabled={savingAction === `toggleUser:${user.id}`}
                    >
                      {user.enabled === false ? "Enable" : "Disable"}
                    </button>
                  )}
                  {canManageUsers && (
                    <button className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold" onClick={() => deleteUser(user.id)} disabled={savingAction === `deleteUser:${user.id}`}>
                      {savingAction === `deleteUser:${user.id}` ? "Deleting..." : "Delete"}
                    </button>
                  )}
                </div>
              </div>
            ))}
            {!filteredUsers.length && !loadingSection && <div className="text-xs text-slate-500 px-1">No users found.</div>}
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-slate-600">
            <div>Total: {usersTotal}</div>
            <div className="flex items-center gap-2">
              <button
                className="px-2 py-1 rounded border border-slate-200 bg-white disabled:opacity-50"
                onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                disabled={usersPage <= 1}
              >
                Prev
              </button>
              <span>Page {usersPage}</span>
              <button
                className="px-2 py-1 rounded border border-slate-200 bg-white disabled:opacity-50"
                onClick={() => setUsersPage((p) => p + 1)}
                disabled={!usersHasMore}
              >
                Next
              </button>
              <select
                value={usersPageSize}
                onChange={(e) => {
                  setUsersPageSize(Number(e.target.value));
                  setUsersPage(1);
                }}
                className="rounded border border-slate-200 px-2 py-1 bg-white"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Profile" subtitle="Details" icon={FiUser} accent="green">
          {selectedUser ? (
            <div className="space-y-3 text-sm">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500">Name</p>
                <p className="font-semibold text-slate-900">{selectedUser.name || selectedUser.email}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500">Email</p>
                <p className="font-semibold text-slate-900">{selectedUser.email || "-"}</p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <p className="text-xs text-slate-500">Status</p>
                <p className="font-semibold text-slate-900">{selectedUser.enabled === false ? "Disabled" : "Enabled"}</p>
              </div>
              {canManageUsers ? (
                <div className="space-y-2">
                  <input value={studentPassword} onChange={(e) => setStudentPassword(e.target.value)} placeholder="New password" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                  <button className="w-full rounded-xl bg-indigo-600 text-white font-semibold px-4 py-2" onClick={resetStudentPassword} disabled={savingAction === "resetPassword"}>
                    {savingAction === "resetPassword" ? "Resetting..." : "Reset Password"}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-slate-500">Read only for sub admin.</p>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a student to view profile.</p>
          )}
        </DashboardCard>
      </div>
    ),
    allocation: (
      <div className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
          <DashboardCard title="Course Allocation" subtitle="Assign students" icon={FiUpload} accent="indigo">
            <div className="space-y-3">
              <select value={assignCourseId} onChange={(e) => setAssignCourseId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="">Select Course</option>
                {courses.filter((course) => String(course.status || "active").toLowerCase() === "active").map((course) => <option key={course.id} value={course.id}>{course.title || course.course_name}</option>)}
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <input
                  value={allocationSearch}
                  onChange={(e) => setAllocationSearch(e.target.value)}
                  placeholder="Search by email"
                  className="rounded-xl border border-slate-200 px-3 py-2"
                />
                <select value={assignDepartment} onChange={(e) => setAssignDepartment(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">
                  <option value="">All Departments</option>
                  {allocationDepartments.map((dept) => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
                <select value={assignBatch} onChange={(e) => setAssignBatch(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">
                  <option value="">All Batches</option>
                  {allocationBatches.map((batch) => (
                    <option key={batch} value={batch}>{batch}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <select value={assignYear} onChange={(e) => setAssignYear(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2">
                  <option value="">All Academic Years</option>
                  {allocationYears.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
                <div className="rounded-xl border border-slate-200 px-3 py-2 text-xs text-slate-600 flex items-center">
                  Filters: Department, Batch, Year
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <label className="text-xs text-slate-600">
                  Start Date
                  <input type="date" value={assignStartDate} onChange={(e) => setAssignStartDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
                <label className="text-xs text-slate-600">
                  End Date
                  <input type="date" value={assignEndDate} onChange={(e) => setAssignEndDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
                </label>
              </div>
              <div className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700">
                Select students and assign.
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 max-h-56 overflow-auto" onScroll={handleAllocationStudentsScroll}>
                <div className="font-semibold text-slate-700 mb-2">Select Students</div>
                <div className="space-y-2">
                  {allocationStudentsLoading && !allocationTargetUsers.length ? (
                    <div className="rounded-lg bg-white border border-slate-100 px-3 py-2 text-slate-500">Loading students...</div>
                  ) : allocationTargetUsers.length ? (
                    allocationTargetUsers.map((user) => (
                      <label key={user.id} className="flex items-center gap-2 rounded-lg bg-white border border-slate-100 px-2 py-1.5">
                        <input type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={() => toggleUserSelection(user.id)} />
                        <span>
                          {user.email}
                          {(user.department || user.batch) ? ` (${user.department || "-"}${user.batch ? `, ${user.batch}` : ""})` : ""}
                        </span>
                      </label>
                    ))
                  ) : (
                    <div className="rounded-lg bg-white border border-slate-100 px-3 py-2 text-slate-500">
                      No students found.
                    </div>
                  )}
                </div>
                {allocationStudentsLoading && allocationTargetUsers.length > 0 && <div className="text-[11px] text-slate-400 mt-2">Loading more...</div>}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{selectedUserIds.length} students selected</span>
                <label className="inline-flex items-center gap-2 font-semibold text-indigo-600">
                  <input
                    type="checkbox"
                    checked={allocationTargetUsers.length > 0 && allocationTargetUsers.every((u) => selectedUserIds.includes(u.id))}
                    onChange={toggleSelectAllUsers}
                  />
                  Select All
                </label>
              </div>
              <button
                className="w-full rounded-xl bg-indigo-600 text-white font-semibold px-4 py-2 disabled:opacity-60"
                onClick={assignCourse}
                disabled={
                  savingAction === "assignCourse" ||
                  !assignCourseId ||
                  !assignStartDate ||
                  !assignEndDate ||
                  selectedUserIds.length === 0
                }
              >
                {savingAction === "assignCourse" ? "Assigning..." : "Assign Course"}
              </button>
            </div>
          </DashboardCard>

          <DashboardCard title="Existing Allocation" subtitle="Manage" icon={FiUsers} accent="purple">
            <div className="mb-2">
              <input
                value={allocationListSearch}
                onChange={(e) => setAllocationListSearch(e.target.value)}
                placeholder="Search email"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-xs"
              />
            </div>
            <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
              {filteredAllocationRows.length ? (
                filteredAllocationRows.map((item) => (
                  <div key={`${item.user_id}-${item.course_id}`} className="flex items-center justify-between rounded-lg bg-white border border-slate-100 px-3 py-2 text-xs">
                    <div>
                      <p className="font-semibold text-slate-900">{item.user?.email || item.user_id}</p>
                      <p className="text-slate-500">Course: {courseById.get(item.course_id)?.title || courseById.get(item.course_id)?.course_name || item.course_id}</p>
                      <p className="text-slate-500">{formatDate(item.startDate)} to {formatDate(item.endDate)}</p>
                    </div>
                    <button className="px-2 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 font-semibold" onClick={() => removeAllocation(item.id || `${item.user_id}_${item.course_id}`, item.user_id)} disabled={savingAction === `removeAllocation:${item.user_id}`}>
                      {savingAction === `removeAllocation:${item.user_id}` ? "Removing..." : "Remove"}
                    </button>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-500">No students assigned for this course yet.</p>
              )}
            </div>
          </DashboardCard>
        </div>

        <DashboardCard title="Allotted Skills" subtitle="Sub admin view" icon={FiMessageSquare} accent="green">
          <div className="space-y-3">
            {allottedSkills.map((skill) => {
              const firstTask = skill.communication?.tasks?.[0] || null;
              return (
                <div key={skill.id} className="rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-1.5 text-sm text-slate-700">
                      <p className="font-semibold text-slate-900">{skill.title}</p>
                      <p>Category: <span className="font-semibold capitalize">{skill.category}</span></p>
                      <p>Duration: {formatDate(skill.duration?.startDate)} to {formatDate(skill.duration?.endDate)}</p>
                      <p>Students: {skill.assignedStudentsCount}</p>
                      <p>Completion: {skill.completionPercentage}%</p>
                      <p>Attendance: {skill.attendanceStatus}</p>
                      {skill.category === "communication" && (
                        <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50 p-2.5 space-y-1">
                          <p>Practice Type: <span className="font-semibold capitalize">{firstTask?.practiceType || "speaking"}</span></p>
                          <p>Daily Task: {firstTask?.description || "Add a task"}</p>
                          <p>Reference: {firstTask?.referenceLink ? <a href={firstTask.referenceLink} target="_blank" rel="noreferrer" className="text-indigo-600">Open link</a> : "Not set"}</p>
                          <p>Upload Response: Student dashboard</p>
                          <button
                            className="mt-1 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                            onClick={() => setSelectedCommunicationSkillId(skill.id)}
                          >
                            Open Communication Practice
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="w-full md:w-44">
                      <div className="text-xs font-semibold text-slate-500 mb-1">Progress</div>
                      <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                        <div className="h-full bg-indigo-500" style={{ width: `${skill.completionPercentage}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {!allottedSkills.length && !allottedSkillsLoading && (
              <p className="text-sm text-slate-500">No allotted skills found.</p>
            )}

            {allottedSkillsLoading && <p className="text-sm text-slate-500">Loading allotted skills...</p>}

            {allottedSkillsHasMore && (
              <button
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                onClick={() => loadAllottedSkills({ append: true })}
                disabled={allottedSkillsLoading}
              >
                {allottedSkillsLoading ? "Loading..." : "Load More"}
              </button>
            )}

            <p className="text-xs text-slate-500">Showing {allottedSkills.length} of {allottedSkillsTotal}</p>
          </div>
        </DashboardCard>

        {selectedCommunicationSkillId && (
          <DashboardCard title="Communication Practice" subtitle="Tasks and responses" icon={FiMessageSquare} accent="indigo">
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <select
                  value={selectedCommunicationSkillId}
                  onChange={(e) => setSelectedCommunicationSkillId(e.target.value)}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                >
                  {communicationSkills.map((skill) => (
                    <option key={skill.id} value={skill.id}>{skill.title}</option>
                  ))}
                </select>
                <select
                  value={communicationSubmissionStatus}
                  onChange={(e) => {
                    setCommunicationSubmissionStatus(e.target.value);
                    setCommunicationSubmissionsPage(1);
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2"
                >
                  <option value="all">All Responses</option>
                  <option value="submitted">Submitted</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="completed">Completed</option>
                  <option value="incomplete">Incomplete</option>
                </select>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                <p className="text-sm font-semibold text-slate-900">Add Daily Communication Task</p>
                <div className="grid gap-2 md:grid-cols-3">
                  <input type="number" min="1" value={communicationTaskForm.dayNumber} onChange={(e) => setCommunicationTaskForm((p) => ({ ...p, dayNumber: Number(e.target.value) || 1 }))} className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Day" />
                  <select value={communicationTaskForm.practiceType} onChange={(e) => setCommunicationTaskForm((p) => ({ ...p, practiceType: e.target.value }))} className="rounded-lg border border-slate-200 px-3 py-2">
                    <option value="speaking">Speaking</option>
                    <option value="listening">Listening</option>
                    <option value="writing">Writing</option>
                  </select>
                  <input type="number" min="0" value={communicationTaskForm.evaluationMarks} onChange={(e) => setCommunicationTaskForm((p) => ({ ...p, evaluationMarks: Number(e.target.value) || 0 }))} className="rounded-lg border border-slate-200 px-3 py-2" placeholder="Marks" />
                </div>
                <textarea value={communicationTaskForm.description} onChange={(e) => setCommunicationTaskForm((p) => ({ ...p, description: e.target.value }))} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Daily task description" />
                <input value={communicationTaskForm.referenceLink} onChange={(e) => setCommunicationTaskForm((p) => ({ ...p, referenceLink: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Reference link" />
                <textarea value={communicationTaskForm.instructions} onChange={(e) => setCommunicationTaskForm((p) => ({ ...p, instructions: e.target.value }))} rows={2} className="w-full rounded-lg border border-slate-200 px-3 py-2" placeholder="Practice instructions" />
                <button className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white" onClick={addCommunicationTask} disabled={savingAction === "createCommunicationTask"}>
                  {savingAction === "createCommunicationTask" ? "Creating..." : "Create Task"}
                </button>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Daily Tasks</p>
                {communicationTasks.map((task) => {
                  const draft = communicationTaskDrafts[task.id] || task;
                  return (
                    <div key={task.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                      <div className="grid gap-2 md:grid-cols-3">
                        <input type="number" min="1" value={draft.dayNumber || 1} onChange={(e) => setCommunicationTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, dayNumber: Number(e.target.value) || 1 } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                        <select value={draft.practiceType || "speaking"} onChange={(e) => setCommunicationTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, practiceType: e.target.value } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                          <option value="speaking">Speaking</option>
                          <option value="listening">Listening</option>
                          <option value="writing">Writing</option>
                        </select>
                        <input type="number" min="0" value={draft.evaluationMarks ?? 0} onChange={(e) => setCommunicationTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, evaluationMarks: Number(e.target.value) || 0 } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      </div>
                      <textarea value={draft.description || ""} onChange={(e) => setCommunicationTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, description: e.target.value } }))} rows={2} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <input value={draft.referenceLink || ""} onChange={(e) => setCommunicationTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, referenceLink: e.target.value } }))} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <textarea value={draft.instructions || ""} onChange={(e) => setCommunicationTaskDrafts((prev) => ({ ...prev, [task.id]: { ...draft, instructions: e.target.value } }))} rows={2} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
                      <button className="rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700" onClick={() => saveCommunicationTask(task.id)} disabled={savingAction === `saveCommunicationTask:${task.id}`}>
                        {savingAction === `saveCommunicationTask:${task.id}` ? "Saving..." : "Save Task"}
                      </button>
                    </div>
                  );
                })}
                {!communicationTasks.length && <p className="text-xs text-slate-500">No communication tasks yet.</p>}
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-slate-900">Communication Responses</p>
                {communicationSubmissions.map((row) => {
                  const draft = communicationReviewDrafts[row.id] || { status: row.status || "submitted", marks: Number(row.marks || 0), feedback: row.feedback || "" };
                  return (
                    <div key={row.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-semibold text-slate-900">{row.studentEmail || row.studentId}</p>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold uppercase text-slate-700">{row.status || "submitted"}</span>
                      </div>
                      <p className="text-xs text-slate-500">Task: {row.taskId}</p>
                      <p className="text-slate-700">{row.response || "No text response"}</p>
                      {row.responseUrl && <a href={row.responseUrl} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs">Open uploaded response</a>}
                      <div className="grid gap-2 md:grid-cols-3">
                        <select value={draft.status} onChange={(e) => setCommunicationReviewDrafts((prev) => ({ ...prev, [row.id]: { ...draft, status: e.target.value } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm">
                          <option value="submitted">Submitted</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="completed">Completed</option>
                          <option value="incomplete">Incomplete</option>
                        </select>
                        <input type="number" min="0" value={draft.marks} onChange={(e) => setCommunicationReviewDrafts((prev) => ({ ...prev, [row.id]: { ...draft, marks: Number(e.target.value) || 0 } }))} className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="Marks" />
                        <button className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700" onClick={() => reviewCommunicationSubmission(row.id, draft.status)} disabled={savingAction === `reviewCommunication:${row.id}`}>
                          {savingAction === `reviewCommunication:${row.id}` ? "Saving..." : "Save Review"}
                        </button>
                      </div>
                      <textarea value={draft.feedback || ""} onChange={(e) => setCommunicationReviewDrafts((prev) => ({ ...prev, [row.id]: { ...draft, feedback: e.target.value } }))} rows={2} className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-sm" placeholder="Feedback" />
                      <div className="flex flex-wrap gap-2">
                        <button className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => reviewCommunicationSubmission(row.id, "completed")} disabled={savingAction === `reviewCommunication:${row.id}`}>
                          Mark Completed
                        </button>
                        <button className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-white" onClick={() => reviewCommunicationSubmission(row.id, "incomplete")} disabled={savingAction === `reviewCommunication:${row.id}`}>
                          Mark Incomplete
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!communicationSubmissions.length && <p className="text-xs text-slate-500">No submissions found for this filter.</p>}

                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Responses: {communicationSubmissionsTotal}</span>
                  <div className="flex items-center gap-2">
                    <button
                      className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
                      onClick={() => loadCommunicationSubmissions({ pageOverride: Math.max(1, communicationSubmissionsPage - 1) })}
                      disabled={communicationSubmissionsPage <= 1 || savingAction.startsWith("reviewCommunication:")}
                    >
                      Prev
                    </button>
                    <span>Page {communicationSubmissionsPage}</span>
                    <button
                      className="rounded border border-slate-300 px-2 py-1 disabled:opacity-50"
                      onClick={() => loadCommunicationSubmissions({ pageOverride: communicationSubmissionsPage + 1 })}
                      disabled={!communicationSubmissionsHasMore || savingAction.startsWith("reviewCommunication:")}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </DashboardCard>
        )}
      </div>
    ),
    courses: (
      <div className="space-y-4">
        <DashboardCard title="Search" subtitle="Courses" icon={FiSearch} accent="blue">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={courseSearch} onChange={(e) => setCourseSearch(e.target.value)} placeholder="Search courses" className="rounded-xl border border-slate-200 px-3 py-2" />
            <select value={courseCategoryFilter} onChange={(e) => setCourseCategoryFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
              <option value="all">All Categories</option>
              {courseCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <select value={courseStatusFilter} onChange={(e) => setCourseStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="draft">Draft</option>
            </select>
            <input type="date" value={courseDateFilter} onChange={(e) => setCourseDateFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          </div>
        </DashboardCard>
        <AdminCourses
          courses={coursesFeed}
          totalCourses={coursesTotal}
          hasMore={coursesHasMore}
          isListLoading={coursesFeedLoading}
          onLoadMore={() => loadCoursesFeed({ append: true })}
          editingId={editingCourseId}
          status={status}
          isSaving={savingAction === "saveCourse"}
          deletingCourseId={savingAction.startsWith("deleteCourse:") ? savingAction.split(":")[1] : ""}
          onSave={async (formData, courseId) => {
            setSavingAction("saveCourse");
            if (courseId) {
              return adminApi.updateCourse(courseId, formData).then(async () => {
                setStatus("Course updated successfully");
                toast.success("Course updated successfully", { containerId: "global-toasts" });
                setEditingCourseId("");
                invalidateDashboardCache();
                adminApi.clearCoursesCache();
                await loadCoursesFeed({ append: false, force: true, pageOverride: 1 });
                return loadDashboardData(false);
              }).catch((err) => {
                setStatus(err.message || "Failed to save course");
                toast.error(err.message || "Failed to save course", { containerId: "global-toasts" });
                throw err;
              }).finally(() => {
                setSavingAction("");
              });
            } else {
              return adminApi.createCourse(formData).then(async () => {
                setStatus("Course created successfully");
                toast.success("Course Added Successfully", { containerId: "global-toasts" });
                invalidateDashboardCache();
                adminApi.clearCoursesCache();
                await loadCoursesFeed({ append: false, force: true, pageOverride: 1 });
                return loadDashboardData(false);
              }).catch((err) => {
                setStatus(err.message || "Failed to save course");
                toast.error(err.message || "Failed to save course", { containerId: "global-toasts" });
                throw err;
              }).finally(() => {
                setSavingAction("");
              });
            }
          }}
          onDelete={(courseId) => {
            setSavingAction(`deleteCourse:${courseId}`);
            return adminApi
              .deleteCourse(courseId)
              .then(async () => {
                setStatus("Course deleted successfully");
                toast.success("Course deleted successfully", { containerId: "global-toasts" });
                invalidateDashboardCache();
                adminApi.clearCoursesCache();
                await loadCoursesFeed({ append: false, force: true, pageOverride: 1 });
                return loadDashboardData(false);
              })
              .catch((err) => {
                setStatus(err.message || "Failed to delete course");
                toast.error(err.message || "Failed to delete course", { containerId: "global-toasts" });
              })
              .finally(() => {
                setSavingAction("");
              });
          }}
          onEdit={(courseId) => {
            setEditingCourseId(courseId);
          }}
        />
      </div>
    ),
    assignments: (
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <DashboardCard title={editingAssignmentId ? "Edit Assessment" : "Create Assessment"} subtitle="Assessment" icon={FiEdit3} accent="orange">
          <div className="grid gap-3">
            <input value={assignmentForm.title} onChange={(e) => setAssignmentForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={assignmentForm.assessmentType} onChange={(e) => setAssignmentForm((p) => ({ ...p, assessmentType: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white">
                <option value="mcq">MCQ (Aptitude)</option>
                <option value="coding">Coding</option>
                <option value="practice">Daily Practice</option>
                <option value="communication">Communication</option>
                <option value="short-answer">Short Answer</option>
              </select>
              <select value={assignmentForm.courseId} onChange={(e) => setAssignmentForm((p) => ({ ...p, courseId: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.course_name}</option>)}
              </select>
            </div>
            <textarea value={assignmentForm.description} onChange={(e) => setAssignmentForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" rows={2} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="date" value={assignmentForm.openDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, openDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <input type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, dueDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input type="number" min="1" value={assignmentForm.timeLimitMinutes} onChange={(e) => setAssignmentForm((p) => ({ ...p, timeLimitMinutes: Number(e.target.value) || 0 }))} placeholder="Time (min)" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <input type="number" min="0" value={assignmentForm.totalMarks} onChange={(e) => setAssignmentForm((p) => ({ ...p, totalMarks: Number(e.target.value) || 0 }))} placeholder="Total Marks" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <input type="number" min="0" value={assignmentForm.passingMarks} onChange={(e) => setAssignmentForm((p) => ({ ...p, passingMarks: Number(e.target.value) || 0 }))} placeholder="Passing Marks" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <input type="number" min="0" value={assignmentForm.numberOfQuestions} onChange={(e) => setAssignmentForm((p) => ({ ...p, numberOfQuestions: Number(e.target.value) || 0 }))} placeholder="# Questions" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <textarea value={assignmentForm.instructions} onChange={(e) => setAssignmentForm((p) => ({ ...p, instructions: e.target.value }))} placeholder="Instructions" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={assignmentForm.assignTo} onChange={(e) => setAssignmentForm((p) => ({ ...p, assignTo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="all">All Users</option>
                <option value="selected">Selected Users</option>
                <option value="course">By Course</option>
              </select>
              <select value={assignmentForm.autoEvaluate ? "yes" : "no"} onChange={(e) => setAssignmentForm((p) => ({ ...p, autoEvaluate: e.target.value === "yes" }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white">
                <option value="yes">Auto Evaluate: Yes</option>
                <option value="no">Auto Evaluate: No</option>
              </select>
            </div>
            {assignmentForm.assessmentType === "coding" && (
              <>
                <select value={assignmentForm.programmingLanguage} onChange={(e) => setAssignmentForm((p) => ({ ...p, programmingLanguage: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2 bg-white">
                  <option value="javascript">JavaScript</option>
                </select>
                <textarea value={assignmentForm.problemStatement} onChange={(e) => setAssignmentForm((p) => ({ ...p, problemStatement: e.target.value }))} placeholder="Problem statement" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                <textarea value={assignmentForm.testCases} onChange={(e) => setAssignmentForm((p) => ({ ...p, testCases: e.target.value }))} placeholder='Test cases JSON: [{"input":"hello","output":"olleh"}]' rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2 font-mono text-xs" />
              </>
            )}
            <div className="flex items-center justify-between gap-2">
              <button className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 font-semibold" onClick={() => { setAssignmentForm(emptyAssignment); setEditingAssignmentId(""); }}>Cancel</button>
              <button className="px-4 py-2 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700" onClick={saveAssignment} disabled={savingAction === "saveAssignment"}>{editingAssignmentId ? "Update" : "Create"}</button>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Assessment Reports" subtitle="Results" icon={FiClipboard} accent="green">
          <div className="mb-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
            <div className="text-xs text-slate-500 font-semibold mb-1">Recent</div>
            <div className="space-y-1 text-xs">
              {recentAssessmentResults.length ? recentAssessmentResults.map((row) => (
                <div key={row.id} className="flex items-center justify-between rounded-lg bg-white px-2 py-1 border border-slate-100">
                  <span className="truncate pr-2">{row.assessmentTitle || row.assignmentId}</span>
                  <span className="font-semibold">{Number(row.marks || 0)}/{Number(row.totalMarks || 0)}</span>
                </div>
              )) : <div className="text-slate-400">No recent attempts</div>}
            </div>
          </div>
          <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{assignment.title}</p>
                    <p className="text-xs text-slate-500">{String(assignment.assessmentType || "mcq").toUpperCase()} · Open: {formatDate(assignment.openDate)} · Due: {formatDate(assignment.dueDate)} · Assigned: {assignment.assignTo || "all"}</p>
                    <p className="text-xs text-slate-500">{Number(assignment.timeLimitMinutes || 0)} mins · {Number(assignment.totalMarks || 0)} marks · Pass {Number(assignment.passingMarks || 0)}</p>
                  </div>
                  <div className="ui-actions flex gap-2 text-xs">
                    <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 font-semibold" onClick={() => setSelectedAssignment(assignment.id)}>View</button>
                    <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 font-semibold" onClick={() => { setAssignmentForm({
                      title: assignment.title || "",
                      description: assignment.description || "",
                      openDate: assignment.openDate || "",
                      dueDate: assignment.dueDate || "",
                      instructions: assignment.instructions || "",
                      assessmentType: assignment.assessmentType || "mcq",
                      timeLimitMinutes: Number(assignment.timeLimitMinutes || 20),
                      totalMarks: Number(assignment.totalMarks || 20),
                      passingMarks: Number(assignment.passingMarks || 10),
                      numberOfQuestions: Number(assignment.numberOfQuestions || 0),
                      autoEvaluate: assignment.autoEvaluate !== false,
                      programmingLanguage: assignment.programmingLanguage || "javascript",
                      problemStatement: assignment.problemStatement || "",
                      testCases: JSON.stringify(assignment.testCases || [], null, 2),
                      assignTo: assignment.assignTo || "all",
                      courseId: assignment.courseId || "",
                    }); setEditingAssignmentId(assignment.id); }}>Edit</button>
                    <button className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 font-semibold text-rose-700" onClick={() => deleteAssignment(assignment.id)} disabled={savingAction === `deleteAssignment:${assignment.id}`}>
                      {savingAction === `deleteAssignment:${assignment.id}` ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-slate-100 bg-white p-3">
              <div className="font-semibold text-slate-800 mb-2 text-sm">All Attempts</div>
              <div className="space-y-1 text-xs max-h-52 overflow-auto">
                {assessmentResults.length ? assessmentResults.map((row) => (
                  <div key={row.id} className="grid grid-cols-12 gap-2 rounded-lg bg-slate-50 px-2 py-1 border border-slate-100">
                    <span className="col-span-4 truncate">{row.assessmentTitle || row.assignmentId}</span>
                    <span className="col-span-3 truncate">{row.userId}</span>
                    <span className="col-span-2">{Number(row.marks || 0)}/{Number(row.totalMarks || 0)}</span>
                    <span className="col-span-3 uppercase font-semibold">{row.status}</span>
                  </div>
                )) : <div className="text-slate-400">No result records yet</div>}
              </div>
            </div>
          </div>
        </DashboardCard>
      </div>
    ),
    attendance: (
      <DashboardCard title="Attendance" subtitle="Daily records" icon={FiCalendar} accent="blue">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <select value={attendanceCourseId} onChange={(e) => setAttendanceCourseId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Select Course</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.course_name}</option>)}
          </select>
          <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          <button className="w-full rounded-xl bg-slate-900 text-white font-semibold px-4 py-2 disabled:opacity-60" onClick={() => loadSectionData("attendance", true)} disabled={loadingSection}>
            {loadingSection ? "Loading..." : "Load"}
          </button>
        </div>
        <div className="grid gap-2 max-h-[220px] overflow-auto pr-1 mt-4">
          {attendance.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{item.userName || item.userEmail || item.user_id}</p>
                <p className="text-xs text-slate-500">Course: {item.courseTitle || courseById.get(item.course_id)?.title || courseById.get(item.course_id)?.course_name || item.course_id} · Date: {formatDate(item.date)}</p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-50 border border-slate-200 uppercase">{item.status}</span>
            </div>
          ))}
        </div>
      </DashboardCard>
    ),
    progress: (
      <DashboardCard title="Daily Progress" subtitle="Status" icon={FiBarChart2} accent="purple">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <select value={progressCourseId} onChange={(e) => setProgressCourseId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
            <option value="">All Courses</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.title || course.course_name}</option>)}
          </select>
          <input type="date" value={progressDate} onChange={(e) => setProgressDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          <button className="w-full rounded-xl bg-slate-900 text-white font-semibold px-4 py-2 disabled:opacity-60" onClick={loadDailyProgress} disabled={savingAction === "loadProgress"}>
            {savingAction === "loadProgress" ? "Tracking..." : "Track"}
          </button>
          <div className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 flex items-center justify-center">
            Rows: {dailyProgress.length}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-100 text-xs font-semibold text-slate-700 px-3 py-2">
            <div className="col-span-5">Student Email</div>
            <div className="col-span-3">Status</div>
            <div className="col-span-2">Progress</div>
            <div className="col-span-2">Attendance</div>
          </div>
          <div className="max-h-[420px] overflow-auto">
            {dailyProgress.map((row, idx) => (
              <div key={`${row.userId}-${idx}`} className="grid grid-cols-12 px-3 py-2 border-t border-slate-100 text-sm">
                <div className="col-span-5 text-slate-800">{row.userEmail || row.userName || row.userId}</div>
                <div className="col-span-3 font-semibold">{row.status}</div>
                <div className="col-span-2">
                  <div className="text-xs font-semibold mb-1">{row.progressPercent}%</div>
                  <div className="h-2 rounded-full bg-slate-200 overflow-hidden">
                    <div className="h-full bg-indigo-500" style={{ width: `${row.progressPercent}%` }} />
                  </div>
                </div>
                <div className="col-span-2 uppercase text-xs">{row.attendanceStatus}</div>
              </div>
            ))}
            {!dailyProgress.length && <div className="px-3 py-6 text-sm text-slate-500">No progress rows found for selected filters.</div>}
          </div>
        </div>
      </DashboardCard>
    ),
    leaderboard: (
      <DashboardCard title="Leaderboard" subtitle="Student ranking" icon={FiTrendingUp} accent="amber">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
          <input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search student" className="rounded-xl border border-slate-200 px-3 py-2" />
          <select value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
            <option value="all">All</option>
            <option value="completed">Completed</option>
            <option value="active">Active</option>
            <option value="pending">Pending</option>
          </select>
          <select value={reportCourseFilter} onChange={(e) => setReportCourseFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
            <option value="all">All Courses</option>
          </select>
        </div>
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <div className="grid grid-cols-12 bg-slate-100 text-xs font-semibold text-slate-700 px-3 py-2">
            <div className="col-span-1">Rank</div>
            <div className="col-span-4">Name</div>
            <div className="col-span-2">Completion</div>
            <div className="col-span-2">Attendance</div>
            <div className="col-span-2">Assignment</div>
            <div className="col-span-1">Score</div>
          </div>
          <div className="max-h-[480px] overflow-auto">
            {filteredLeaderboard.map((row) => (
              <div key={row.userId} className="grid grid-cols-12 px-3 py-2 border-t border-slate-100 text-sm items-center">
                <div className="col-span-1 font-bold text-slate-900">{row.rank}</div>
                <div className="col-span-4">
                  <div className="font-semibold text-slate-900">{row.name}</div>
                  <div className="text-xs text-slate-500">{row.email}</div>
                </div>
                <div className="col-span-2">{row.completionPct}%</div>
                <div className="col-span-2">{row.attendancePct}%</div>
                <div className="col-span-2">{row.assignmentPct}%</div>
                <div className="col-span-1 font-bold text-indigo-600">{row.score}</div>
              </div>
            ))}
            {!filteredLeaderboard.length && <div className="px-3 py-6 text-sm text-slate-500">No leaderboard data yet.</div>}
          </div>
        </div>
      </DashboardCard>
    ),
    reports: (
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard title="Reports" subtitle="Summary" icon={FiBarChart2} accent="purple">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
            <input value={reportSearch} onChange={(e) => setReportSearch(e.target.value)} placeholder="Search student" className="rounded-xl border border-slate-200 px-3 py-2" />
            <select value={reportCourseFilter} onChange={(e) => setReportCourseFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
              <option value="all">All Courses</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>{course.title || course.course_name}</option>
              ))}
            </select>
            <select value={reportStatusFilter} onChange={(e) => setReportStatusFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2 bg-white">
              <option value="all">All Status</option>
              <option value="Completed">Completed</option>
              <option value="In Progress">In Progress</option>
              <option value="Incomplete">Incomplete</option>
            </select>
            <input type="date" value={reportDateFilter} onChange={(e) => setReportDateFilter(e.target.value)} className="rounded-xl border border-slate-200 px-3 py-2" />
          </div>
          <div className="ui-actions mb-3">
            <button
              className="px-4 py-2 rounded-lg bg-slate-200 text-slate-800 text-sm font-semibold"
              onClick={applyReportFilters}
              disabled={savingAction === "applyReportFilters"}
            >
              {savingAction === "applyReportFilters" ? "Applying..." : "Apply"}
            </button>
            <button
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700"
              onClick={exportReportCsv}
              disabled={savingAction === "exportReport"}
            >
              {savingAction === "exportReport" ? "Exporting..." : "Export CSV"}
            </button>
          </div>
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Total Users</span><strong>{reports?.item?.totalUsers ?? 0}</strong></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Active Users</span><strong>{reports?.item?.activeUsers ?? 0}</strong></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Courses</span><strong>{reports?.item?.totalCourses ?? 0}</strong></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Completed Courses</span><strong>{reports?.item?.completedCourseCount ?? 0}</strong></div>
          </div>
        </DashboardCard>
        <DashboardCard title="Student Progress" subtitle="Details" icon={FiActivity} accent="green">
          {userProgressStats ? (
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Total Students</span><strong>{userProgressStats.totalStudents}</strong></div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Completed</span><strong>{userProgressStats.completed}</strong></div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Pending</span><strong>{userProgressStats.pending}</strong></div>
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Progress</span><strong>{userProgressStats.progressPercent}%</strong></div>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {userProgressStats.students?.map((student) => (
                  <div key={student.id} className="rounded-xl border border-slate-100 bg-white p-3 flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{student.name || student.email}</p>
                      <p className="text-xs text-slate-500">{student.status} · Submitted: {student.submittedOn}</p>
                    </div>
                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-50 border border-slate-200">{student.progress}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select an assignment to see progress.</p>
          )}
          <div className="mt-4 rounded-xl border border-slate-200 overflow-hidden">
            <div className="grid grid-cols-12 bg-slate-100 text-xs font-semibold text-slate-700 px-3 py-2">
              <div className="col-span-5">Student</div>
              <div className="col-span-3">Status</div>
              <div className="col-span-2">Progress</div>
              <div className="col-span-2">Attendance</div>
            </div>
            <div className="max-h-56 overflow-auto">
              {filteredReportRows.map((row, idx) => (
                <div key={`${row.userId}-${idx}`} className="grid grid-cols-12 px-3 py-2 border-t border-slate-100 text-xs">
                  <div className="col-span-5">{row.userEmail || row.userName || row.userId}</div>
                  <div className="col-span-3">{row.status}</div>
                  <div className="col-span-2">{row.progressPercent}%</div>
                  <div className="col-span-2 uppercase">{row.attendanceStatus}</div>
                </div>
              ))}
              {!filteredReportRows.length && <div className="px-3 py-4 text-xs text-slate-500">No rows match report filters.</div>}
            </div>
          </div>
        </DashboardCard>
      </div>
    ),
  };

  return (
    <div className="ui-shell min-h-screen bg-[#f8fafc] px-4 lg:px-6 py-6">
      <div className="ui-page relative max-w-7xl mx-auto flex lg:flex-row flex-col items-start gap-6">
        <aside className="w-full lg:w-64 shrink-0">
          <div className="app-sidebar-panel p-4 shadow-sm sticky top-4">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wide text-slate-500 font-semibold">ADMIN MODULE</p>
              <h2 className="text-xl font-bold text-slate-900 mt-1">Dashboard</h2>
            </div>
            <nav className="space-y-2">
              {visibleNavItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`app-sidebar-item w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-semibold transition-all duration-200 border ${active ? "is-active border-indigo-500" : "border-transparent hover:border-indigo-100"}`}
                  >
                    <Icon className="text-[18px]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-5 pt-4 border-t border-slate-200 space-y-2">
              <button onClick={() => loadSectionData(activeSection, true)} disabled={loadingSection} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-slate-200 text-slate-800 font-semibold hover:bg-slate-300 disabled:opacity-60">
                <FiRefreshCw /> Refresh
              </button>
              <button onClick={handleLogout} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
                <FiLogOut /> Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="ui-main flex-1 w-full min-w-0 flex flex-col gap-6">
          <header className="ui-card px-5 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-600">{isMainAdminRole(adminRole) ? "Main Admin" : "Sub Admin"}</p>
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
              {topPanelStatus && <div className="status-banner">{topPanelStatus}</div>}
            </div>
          </header>

          <main className="space-y-6">
            {loadingSection && (
              <div className="rounded-xl bg-white border border-slate-200 px-4 py-2 text-sm text-slate-600 inline-flex items-center gap-2">
                <LoadingSpinner label={`Loading ${activeSection}`} />
                Loading...
              </div>
            )}
            {canAccessSection(activeSection)
              ? (sections[activeSection] || sections[visibleNavItems[0]?.id] || null)
              : (
                <DashboardCard title="Access Restricted" subtitle="Role access" icon={FiUsers} accent="orange">
                  <p className="text-sm text-slate-600">This section is not available for your role.</p>
                </DashboardCard>
              )}
          </main>
        </div>
      </div>
    </div>
  );
}
