import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import {
  FiBookOpen,
  FiUsers,
  FiUpload,
  FiEdit3,
  FiBarChart2,
  FiBell,
  FiAward,
  FiPieChart,
  FiLogOut,
  FiTrendingUp,
  FiActivity,
  FiTarget,
  FiLayers,
  FiPlus,
  FiSearch,
  FiTrash2,
  FiCalendar,
  FiClipboard,
  FiRefreshCw,
  FiSettings,
  FiUser,
} from "react-icons/fi";
import { auth } from "../firebase";
import DashboardCard from "../components/DashboardCard";
import { adminApi } from "../lib/adminApi";

const ADMIN_SESSION_KEY = "adminSession:v1";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: FiPieChart },
  { id: "users", label: "Users", icon: FiUsers },
  { id: "courses", label: "Courses", icon: FiBookOpen },
  { id: "assignments", label: "Assignments", icon: FiClipboard },
  { id: "attendance", label: "Attendance", icon: FiCalendar },
  { id: "progress", label: "Progress Tracking", icon: FiActivity },
  { id: "reports", label: "Reports", icon: FiBarChart2 },
  { id: "notifications", label: "Notifications", icon: FiBell },
  { id: "settings", label: "Settings", icon: FiSettings },
];

const formatDate = (value) => {
  if (!value) return "-";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
};

const emptyCourse = { course_name: "", description: "" };
const emptyAssignment = {
  title: "",
  description: "",
  openDate: "",
  dueDate: "",
  instructions: "",
  assignTo: "all",
  courseId: "",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState("dashboard");
  const [courses, setCourses] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [users, setUsers] = useState([]);
  const [reports, setReports] = useState(null);
  const [attendance, setAttendance] = useState([]);
  const [selectedAssignment, setSelectedAssignment] = useState(null);
  const [assignmentProgress, setAssignmentProgress] = useState(null);
  const [search, setSearch] = useState("");
  const [attendanceCourseId, setAttendanceCourseId] = useState("");
  const [attendanceDate, setAttendanceDate] = useState("");
  const [courseForm, setCourseForm] = useState(emptyCourse);
  const [editingCourseId, setEditingCourseId] = useState("");
  const [assignmentForm, setAssignmentForm] = useState(emptyAssignment);
  const [editingAssignmentId, setEditingAssignmentId] = useState("");
  const [notificationForm, setNotificationForm] = useState({ title: "", message: "", audience: "all" });
  const [studentPassword, setStudentPassword] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assignMode, setAssignMode] = useState("selected");
  const [attendanceDraft, setAttendanceDraft] = useState({});
  const [progressCourseId, setProgressCourseId] = useState("");
  const [progressDate, setProgressDate] = useState(new Date().toISOString().slice(0, 10));
  const [dailyProgress, setDailyProgress] = useState([]);
  const [status, setStatus] = useState("");

  const analytics = useMemo(() => {
    const totalUsers = reports?.item?.totalUsers ?? users.length;
    const activeUsers = reports?.item?.activeUsers ?? users.filter((u) => u.enabled !== false).length;
    const totalCourses = reports?.item?.totalCourses ?? courses.length;
    const completedCourseCount = reports?.item?.completedCourseCount ?? 0;
    return [
      { label: "Total Users", value: totalUsers, icon: FiLayers, tone: "text-indigo-600 bg-indigo-50" },
      { label: "Active Users", value: activeUsers, icon: FiActivity, tone: "text-emerald-600 bg-emerald-50" },
      { label: "Courses", value: totalCourses, icon: FiTarget, tone: "text-sky-600 bg-sky-50" },
      { label: "Completed Courses", value: completedCourseCount, icon: FiTrendingUp, tone: "text-purple-600 bg-purple-50" },
    ];
  }, [reports, users, courses]);

  const loadAll = async () => {
    try {
      const [usersRes, coursesRes, assignmentsRes, reportsRes, attendanceRes] = await Promise.all([
        adminApi.getUsers(search),
        adminApi.getCourses(),
        adminApi.getAssignments(),
        adminApi.getReports(),
        adminApi.getAttendance(attendanceCourseId || attendanceDate ? `?${new URLSearchParams({ ...(attendanceCourseId ? { courseId: attendanceCourseId } : {}), ...(attendanceDate ? { date: attendanceDate } : {}) }).toString()}` : ""),
      ]);

      setUsers(usersRes.items || []);
      setCourses(coursesRes.items || []);
      setAssignments(assignmentsRes.items || []);
      setReports(reportsRes || null);
      setAttendance(attendanceRes.items || []);

      if (selectedUserId) {
        const existing = (usersRes.items || []).find((u) => u.id === selectedUserId) || null;
        setSelectedUser(existing);
      }
    } catch (err) {
      setStatus(err.message || "Failed to load admin data");
    }
  };

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    localStorage.removeItem(ADMIN_SESSION_KEY);
    await signOut(auth);
    navigate("/admin/login", { replace: true });
  };

  const saveCourse = async () => {
    try {
      if (editingCourseId) {
        await adminApi.updateCourse(editingCourseId, courseForm);
        setStatus("Course updated");
      } else {
        await adminApi.createCourse(courseForm);
        setStatus("Course created");
      }
      setCourseForm(emptyCourse);
      setEditingCourseId("");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to save course");
    }
  };

  const saveAssignment = async () => {
    try {
      if (editingAssignmentId) {
        await adminApi.updateAssignment(editingAssignmentId, assignmentForm);
        setStatus("Assignment updated");
      } else {
        await adminApi.createAssignment(assignmentForm);
        setStatus("Assignment created");
      }
      setAssignmentForm(emptyAssignment);
      setEditingAssignmentId("");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to save assignment");
    }
  };

  const saveNotification = async () => {
    try {
      await adminApi.sendNotification(notificationForm);
      setNotificationForm({ title: "", message: "", audience: "all" });
      setStatus("Notification sent");
    } catch (err) {
      setStatus(err.message || "Failed to send notification");
    }
  };

  const deleteUser = async (userId) => {
    try {
      await adminApi.deleteUser(userId);
      setStatus("User deleted");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to delete user");
    }
  };

  const deleteCourse = async (courseId) => {
    try {
      await adminApi.deleteCourse(courseId);
      setStatus("Course deleted");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to delete course");
    }
  };

  const deleteAssignment = async (assignmentId) => {
    try {
      await adminApi.deleteAssignment(assignmentId);
      setStatus("Assignment deleted");
      if (selectedAssignment === assignmentId) setSelectedAssignment("");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to delete assignment");
    }
  };

  const resetStudentPassword = async () => {
    if (!selectedUserId || !studentPassword.trim()) {
      setStatus("Select a user and enter a new password");
      return;
    }
    try {
      await fetch(`/api/admin/users/${selectedUserId}/password`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "x-admin-session": localStorage.getItem(ADMIN_SESSION_KEY) || "",
        },
        body: JSON.stringify({ password: studentPassword }),
      });
      setStudentPassword("");
      setStatus("Student password reset");
    } catch (err) {
      setStatus("Failed to reset password");
    }
  };

  const showProfile = async (userId) => {
    const found = users.find((u) => u.id === userId) || null;
    setSelectedUser(found);
    setSelectedUserId(userId);
  };

  const filteredUsers = useMemo(() => {
    if (!search.trim()) return users;
    const q = search.toLowerCase();
    return users.filter((u) => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(q));
  }, [users, search]);

  const userProgressStats = assignmentProgress?.item || null;
  const studentUsers = useMemo(() => filteredUsers.filter((u) => (u.role || "student") === "student"), [filteredUsers]);

  const toggleUserSelection = (userId) => {
    setSelectedUserIds((prev) => (prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]));
  };

  const toggleSelectAllUsers = () => {
    const visibleIds = studentUsers.map((u) => u.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedUserIds.includes(id));
    setSelectedUserIds(allSelected ? selectedUserIds.filter((id) => !visibleIds.includes(id)) : Array.from(new Set([...selectedUserIds, ...visibleIds])));
  };

  const assignCourse = async () => {
    if (!assignCourseId) {
      setStatus("Select a course to assign");
      return;
    }
    try {
      if (assignMode === "all") {
        await adminApi.assignCourseToAll({ course_id: assignCourseId, status: "assigned" });
      } else {
        if (!selectedUserIds.length) {
          setStatus("Select at least one user");
          return;
        }
        await adminApi.assignCourseToSelected({ course_id: assignCourseId, user_ids: selectedUserIds, status: "assigned" });
      }
      setStatus("Course assigned successfully");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to assign course");
    }
  };

  const saveBulkAttendance = async () => {
    if (!attendanceCourseId || !attendanceDate) {
      setStatus("Select course and date for attendance");
      return;
    }
    const entries = studentUsers.map((user) => ({ user_id: user.id, status: attendanceDraft[user.id] ? "present" : "absent" }));
    try {
      await adminApi.markBulkAttendance({ course_id: attendanceCourseId, date: attendanceDate, entries });
      setStatus("Attendance saved");
      await loadAll();
    } catch (err) {
      setStatus(err.message || "Failed to save attendance");
    }
  };

  const loadDailyProgress = async () => {
    try {
      const query = new URLSearchParams({ ...(progressCourseId ? { courseId: progressCourseId } : {}), ...(progressDate ? { date: progressDate } : {}) }).toString();
      const res = await adminApi.getDailyProgress(query ? `?${query}` : "");
      setDailyProgress(res.items || []);
    } catch (err) {
      setStatus(err.message || "Failed to fetch daily progress");
    }
  };
  const sections = {
    dashboard: (
      <div className="space-y-6">
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
          {analytics.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-2xl bg-white shadow-md hover:shadow-lg transition-all duration-200 p-5 border border-slate-100">
                <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">{item.label}</div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-3xl font-bold text-slate-900">{item.value}</div>
                  <span className={`p-2 rounded-lg ${item.tone}`}>
                    <Icon className="text-[20px]" />
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <DashboardCard title="Professional Workflow" subtitle="Admin process" icon={FiRefreshCw} accent="indigo">
            <div className="space-y-3 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Admin Login → Dashboard</div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Create Course → Search Users → Assign Course</div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">Track Progress → Mark Attendance → Monitor Completion</div>
            </div>
          </DashboardCard>
          <DashboardCard title="Quick Actions" subtitle="Admin controls" icon={FiSettings} accent="purple">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Course Management", "courses"],
                ["Assignments", "assignments"],
                ["User Management", "users"],
                ["Reports", "reports"],
              ].map(([label, section]) => (
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
        <DashboardCard title="User Management" subtitle="Registered users" icon={FiUsers} accent="blue">
          <div className="flex gap-2 mb-4">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50">
              <FiSearch className="text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by email or name" className="w-full bg-transparent outline-none text-sm" />
            </div>
            <button className="px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold" onClick={loadAll}>Search</button>
          </div>
          <div className="flex items-center justify-between mb-3 text-xs text-slate-500">
            <span>{selectedUserIds.length} selected</span>
            <button className="font-semibold text-indigo-600" onClick={toggleSelectAllUsers}>Select all visible</button>
          </div>
          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
            {filteredUsers.map((user) => (
              <div key={user.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {(user.role || "student") === "student" ? (
                    <input type="checkbox" checked={selectedUserIds.includes(user.id)} onChange={() => toggleUserSelection(user.id)} />
                  ) : (
                    <span className="w-4" />
                  )}
                  <div>
                    <p className="font-semibold text-slate-900">{user.name || user.email}</p>
                    <p className="text-xs text-slate-500">{user.email} · {user.role || "student"}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={() => showProfile(user.id)}>View</button>
                  <button className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold" onClick={() => deleteUser(user.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>

        <div className="space-y-4">
          <DashboardCard title="Assign Course" subtitle="Selected users" icon={FiUpload} accent="indigo">
            <div className="space-y-3">
              <select value={assignCourseId} onChange={(e) => setAssignCourseId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.course_name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <label className="rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-2">
                  <input type="radio" name="assignMode" value="all" checked={assignMode === "all"} onChange={(e) => setAssignMode(e.target.value)} />
                  All Users
                </label>
                <label className="rounded-xl border border-slate-200 px-3 py-2 flex items-center gap-2">
                  <input type="radio" name="assignMode" value="selected" checked={assignMode === "selected"} onChange={(e) => setAssignMode(e.target.value)} />
                  Selected Users
                </label>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3 text-xs text-slate-600 max-h-32 overflow-auto">
                {selectedUserIds.length ? selectedUserIds.map((id) => {
                  const user = users.find((u) => u.id === id);
                  return <div key={id}>• {user?.email || id}</div>;
                }) : <span>No users selected</span>}
              </div>
              <button className="w-full rounded-xl bg-indigo-600 text-white font-semibold px-4 py-2" onClick={assignCourse}>Assign</button>
            </div>
          </DashboardCard>

          <DashboardCard title="User Profile" subtitle="Selected student" icon={FiUser} accent="green">
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
                <p className="text-xs text-slate-500">Role</p>
                <p className="font-semibold text-slate-900">{selectedUser.role || "student"} · {selectedUser.enabled === false ? "Disabled" : "Enabled"}</p>
              </div>
              <div className="space-y-2">
                <input value={studentPassword} onChange={(e) => setStudentPassword(e.target.value)} placeholder="Reset password" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
                <button className="w-full rounded-xl bg-indigo-600 text-white font-semibold px-4 py-2" onClick={resetStudentPassword}>Reset Student Password</button>
              </div>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Select a user to view profile and reset password.</p>
          )}
          </DashboardCard>
        </div>
      </div>
    ),
    courses: (
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <DashboardCard title={editingCourseId ? "Edit Course" : "Course Management"} subtitle="Add / update course" icon={FiBookOpen} accent="indigo">
          <div className="space-y-3">
            <input value={courseForm.course_name} onChange={(e) => setCourseForm((p) => ({ ...p, course_name: e.target.value }))} placeholder="Course name" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <textarea value={courseForm.description} onChange={(e) => setCourseForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold" onClick={saveCourse}>{editingCourseId ? "Update" : "Add"} Course</button>
              <button className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 font-semibold" onClick={() => { setCourseForm(emptyCourse); setEditingCourseId(""); }}>Cancel</button>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="All Courses" subtitle="View / edit / delete" icon={FiClipboard} accent="purple">
          <div className="space-y-2 max-h-[520px] overflow-auto pr-1">
            {courses.map((course) => (
              <div key={course.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-slate-900">{course.course_name}</p>
                  <p className="text-xs text-slate-500">{course.description || "No description"}</p>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 text-xs font-semibold" onClick={() => { setCourseForm({ course_name: course.course_name || "", description: course.description || "" }); setEditingCourseId(course.id); }}>Edit</button>
                  <button className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 text-rose-700 text-xs font-semibold" onClick={() => deleteCourse(course.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    ),
    assignments: (
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <DashboardCard title={editingAssignmentId ? "Edit Assignment" : "Create Assignment"} subtitle="Assignment management" icon={FiEdit3} accent="orange">
          <div className="grid gap-3">
            <input value={assignmentForm.title} onChange={(e) => setAssignmentForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <textarea value={assignmentForm.description} onChange={(e) => setAssignmentForm((p) => ({ ...p, description: e.target.value }))} placeholder="Description" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input type="date" value={assignmentForm.openDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, openDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
              <input type="date" value={assignmentForm.dueDate} onChange={(e) => setAssignmentForm((p) => ({ ...p, dueDate: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            </div>
            <textarea value={assignmentForm.instructions} onChange={(e) => setAssignmentForm((p) => ({ ...p, instructions: e.target.value }))} placeholder="Instructions" rows={3} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <select value={assignmentForm.assignTo} onChange={(e) => setAssignmentForm((p) => ({ ...p, assignTo: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="all">All Users</option>
                <option value="selected">Selected Users</option>
                <option value="course">By Course</option>
              </select>
              <select value={assignmentForm.courseId} onChange={(e) => setAssignmentForm((p) => ({ ...p, courseId: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
                <option value="">Select Course</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.course_name}</option>)}
              </select>
            </div>
            <div className="flex gap-2">
              <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold" onClick={saveAssignment}>{editingAssignmentId ? "Update" : "Save"} Assignment</button>
              <button className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 font-semibold" onClick={() => { setAssignmentForm(emptyAssignment); setEditingAssignmentId(""); }}>Cancel</button>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard title="Assignments" subtitle="View | Edit | Delete" icon={FiClipboard} accent="green">
          <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
            {assignments.map((assignment) => (
              <div key={assignment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{assignment.title}</p>
                    <p className="text-xs text-slate-500">Open: {formatDate(assignment.openDate)} · Due: {formatDate(assignment.dueDate)} · Assigned: {assignment.assignTo || "all"}</p>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 font-semibold" onClick={() => setSelectedAssignment(assignment.id)}>View</button>
                    <button className="px-3 py-1 rounded-lg bg-white border border-slate-200 font-semibold" onClick={() => { setAssignmentForm({
                      title: assignment.title || "",
                      description: assignment.description || "",
                      openDate: assignment.openDate || "",
                      dueDate: assignment.dueDate || "",
                      instructions: assignment.instructions || "",
                      assignTo: assignment.assignTo || "all",
                      courseId: assignment.courseId || "",
                    }); setEditingAssignmentId(assignment.id); }}>Edit</button>
                    <button className="px-3 py-1 rounded-lg bg-rose-50 border border-rose-100 font-semibold text-rose-700" onClick={() => deleteAssignment(assignment.id)}>Delete</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DashboardCard>
      </div>
    ),
    attendance: (
      <DashboardCard title="Attendance Management" subtitle="Mark and monitor attendance" icon={FiCalendar} accent="blue">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <select value={attendanceCourseId} onChange={(e) => setAttendanceCourseId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
            <option value="">Select Course</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.course_name}</option>)}
          </select>
          <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          <button className="w-full rounded-xl bg-slate-900 text-white font-semibold px-4 py-2" onClick={loadAll}>Load</button>
          <button className="w-full rounded-xl bg-emerald-600 text-white font-semibold px-4 py-2" onClick={saveBulkAttendance}>Save Attendance</button>
        </div>
        <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 space-y-2 max-h-[280px] overflow-auto">
          {studentUsers.map((user) => (
            <label key={user.id} className="flex items-center justify-between rounded-lg bg-white border border-slate-100 px-3 py-2 text-sm">
              <span>{user.name || user.email}</span>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(attendanceDraft[user.id])}
                  onChange={(e) => setAttendanceDraft((prev) => ({ ...prev, [user.id]: e.target.checked }))}
                />
                <span>{attendanceDraft[user.id] ? "Present" : "Absent"}</span>
              </div>
            </label>
          ))}
        </div>
        <div className="grid gap-2 max-h-[220px] overflow-auto pr-1 mt-4">
          {attendance.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-100 bg-white p-3 flex items-center justify-between">
              <div>
                <p className="font-semibold text-slate-900">{item.user_id}</p>
                <p className="text-xs text-slate-500">Course: {item.course_id} · Date: {item.date}</p>
              </div>
              <span className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-50 border border-slate-200 uppercase">{item.status}</span>
            </div>
          ))}
        </div>
      </DashboardCard>
    ),
    progress: (
      <DashboardCard title="Daily Progress Tracking" subtitle="Completed / Incomplete / In Progress" icon={FiBarChart2} accent="purple">
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mb-4">
          <select value={progressCourseId} onChange={(e) => setProgressCourseId(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2">
            <option value="">All Courses</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.course_name}</option>)}
          </select>
          <input type="date" value={progressDate} onChange={(e) => setProgressDate(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          <button className="w-full rounded-xl bg-slate-900 text-white font-semibold px-4 py-2" onClick={loadDailyProgress}>Track Progress</button>
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
                <div className="col-span-2">{row.progressPercent}%</div>
                <div className="col-span-2 uppercase text-xs">{row.attendanceStatus}</div>
              </div>
            ))}
            {!dailyProgress.length && <div className="px-3 py-6 text-sm text-slate-500">No progress rows found for selected filters.</div>}
          </div>
        </div>
      </DashboardCard>
    ),
    reports: (
      <div className="grid gap-4 lg:grid-cols-2">
        <DashboardCard title="Reports & Analytics" subtitle="Performance summary" icon={FiBarChart2} accent="purple">
          <div className="space-y-3 text-sm">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Total Users</span><strong>{reports?.item?.totalUsers ?? 0}</strong></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Active Users</span><strong>{reports?.item?.activeUsers ?? 0}</strong></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Courses</span><strong>{reports?.item?.totalCourses ?? 0}</strong></div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex justify-between"><span>Completed Course Count</span><strong>{reports?.item?.completedCourseCount ?? 0}</strong></div>
          </div>
        </DashboardCard>
        <DashboardCard title="Student Progress" subtitle="Assignment progress" icon={FiActivity} accent="green">
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
        </DashboardCard>
      </div>
    ),
    notifications: (
      <DashboardCard title="Notifications" subtitle="Broadcast alerts" icon={FiBell} accent="indigo">
        <div className="space-y-3">
          <input value={notificationForm.title} onChange={(e) => setNotificationForm((p) => ({ ...p, title: e.target.value }))} placeholder="Title" className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          <textarea value={notificationForm.message} onChange={(e) => setNotificationForm((p) => ({ ...p, message: e.target.value }))} placeholder="Message" rows={4} className="w-full rounded-xl border border-slate-200 px-3 py-2" />
          <select value={notificationForm.audience} onChange={(e) => setNotificationForm((p) => ({ ...p, audience: e.target.value }))} className="w-full rounded-xl border border-slate-200 px-3 py-2">
            <option value="all">All Users</option>
            <option value="students">Students</option>
            <option value="admins">Admins</option>
          </select>
          <button className="px-4 py-2 rounded-xl bg-emerald-600 text-white font-semibold" onClick={saveNotification}>Send Notification</button>
        </div>
      </DashboardCard>
    ),
    settings: (
      <DashboardCard title="Admin Settings" subtitle="Module controls" icon={FiSettings} accent="orange">
        <p className="text-sm text-slate-600">Set admin preferences, notification rules, and system options here.</p>
      </DashboardCard>
    ),
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f8fafc] via-[#eef2f7] to-[#e2e8f0] px-4 sm:px-6 py-6 sm:py-8">
      <div className="relative max-w-7xl mx-auto flex lg:flex-row flex-col gap-6 lg:gap-8">
        <aside className="w-full lg:w-64 shrink-0">
          <div className="rounded-2xl bg-slate-900 text-white p-5 shadow-2xl border border-white/10 sticky top-4">
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wide text-slate-300 font-semibold">ADMIN PANEL</p>
              <h2 className="text-xl font-bold mt-1">Dashboard</h2>
            </div>
            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeSection === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setActiveSection(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-2xl text-sm font-semibold transition-all duration-200 border ${active ? "bg-white/10 border-white/20" : "border-transparent hover:border-white/10 hover:bg-white/5"}`}
                  >
                    <Icon className="text-[18px]" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="mt-5 pt-4 border-t border-white/10 space-y-2">
              <button onClick={loadAll} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-white text-slate-900 font-semibold">
                <FiRefreshCw /> Refresh
              </button>
              <button onClick={handleLogout} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-orange-400 text-white font-semibold">
                <FiLogOut /> Logout
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col gap-6 lg:gap-8 min-w-0">
          <header className="rounded-2xl bg-white/90 backdrop-blur-sm shadow-md px-5 sm:px-6 py-4 border border-slate-100/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-indigo-600">Administrator Module</p>
              <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight">Professional Admin Dashboard</h1>
              <p className="text-slate-600 text-sm sm:text-base">Manage courses, assignments, users, attendance, notifications, and reports.</p>
            </div>
            {status && <div className="text-sm text-slate-600 font-semibold">{status}</div>}
          </header>

          <main className="space-y-6 sm:space-y-8">
            {sections[activeSection] || sections.dashboard}
          </main>
        </div>
      </div>
    </div>
  );
}
