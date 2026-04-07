import React, { useEffect, useMemo, useState } from "react";
import { signOut, updateProfile } from "firebase/auth";
import { collection, getDocs, limit, orderBy, query } from "firebase/firestore";
import {
  FiUser,
  FiMail,
  FiCalendar,
  FiSave,
  FiAward,
  FiClock,
  FiBookOpen,
  FiBell,
  FiSettings,
  FiCamera,
  FiSun,
  FiMoon,
  FiMonitor,
  FiLogOut,
  FiTrash2,
  FiRefreshCw,
  FiLock,
} from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { useTheme } from "../lib/ThemeContext";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import { computeAttendance, fetchAttendance } from "../services/attendanceService";
import { getMetrics } from "../lib/progressStore";

const DEFAULT_PROFILE_IMAGE = "https://ui-avatars.com/api/?name=Student&background=4f46e5&color=ffffff&bold=true";

const fmtDate = (value) => {
  if (!value) return "--";
  try {
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch (err) {
    return String(value);
  }
};

const fmtMinutes = (mins) => {
  if (!mins) return "0m";
  const hours = Math.floor(mins / 60);
  const minutes = Math.round(mins % 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

const computeLongestStreak = (attendance = []) => {
  if (!attendance.length) return 0;
  const byDate = [...attendance].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let best = 0;
  let current = 0;
  let prevDate = null;
  byDate.forEach((item) => {
    if (item.status !== "present") {
      current = 0;
      prevDate = item.date;
      return;
    }
    if (!prevDate) {
      current = 1;
    } else {
      const diff = (new Date(item.date) - new Date(prevDate)) / (1000 * 60 * 60 * 24);
      current = diff === 1 ? current + 1 : 1;
    }
    prevDate = item.date;
    best = Math.max(best, current);
  });
  return Math.max(best, current);
};

const isValidHttpUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (err) {
    return false;
  }
};

export default function Profile() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { skills } = useSkills();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [college, setCollege] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("1st Year");
  const [initialProfile, setInitialProfile] = useState({
    displayName: "",
    photoURL: "",
    course: "",
    year: "1st Year",
  });
  const [status, setStatus] = useState("");
  const [passwordStatus, setPasswordStatus] = useState("");
  const { theme, setTheme } = useTheme();
  const [notifications, setNotifications] = useState({ daily: true, session: true, email: false });
  const [cameraSettings, setCameraSettings] = useState({ camera: true, mic: true, save: false });
  const [skillStats, setSkillStats] = useState([]);
  const [recentActivity, setRecentActivity] = useState([]);
  const [summary, setSummary] = useState({
    totalSkills: 0,
    completedSkills: 0,
    activeSkills: 0,
    studyMinutes: 0,
    focusScore: 0,
  });
  const [activityStats, setActivityStats] = useState({
    totalSessions: 0,
    practiceMinutes: 0,
    longestStreak: 0,
    presentDays: 0,
    absentDays: 0,
  });
  const [attendanceSummary, setAttendanceSummary] = useState({ present: 0, absent: 0, percentage: 0 });
  const [allocatedCourseNames, setAllocatedCourseNames] = useState([]);
  const [loading, setLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [accountActionLoading, setAccountActionLoading] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const metrics = useMemo(() => getMetrics(), []);
  const joinDate = user?.metadata?.creationTime ? fmtDate(user.metadata.creationTime) : "--";

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const savedEducation = (() => {
          try {
            return JSON.parse(localStorage.getItem("profile:education") || "{}");
          } catch (err) {
            return {};
          }
        })();

        const token = await user.getIdToken();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
        };

        const fetchJson = async (url) => {
          try {
            const res = await fetch(url, { headers });
            if (!res.ok) return null;
            return await res.json();
          } catch (err) {
            return null;
          }
        };

        const [attendanceList, todayAttendance, allocatedAttendanceRes, courseRes, studentProfileRes, studentSkillsRes] = await Promise.all([
          fetchAttendance(user.uid, 60),
          computeAttendance(user.uid, skills),
          fetchJson("/api/student/attendance/allocated"),
          fetchJson("/api/student/courses"),
          fetchJson("/api/student/profile"),
          fetchJson("/api/student/skills"),
        ]);

        const profileItem = studentProfileRes?.item || {};
        const resolvedName = String(profileItem.name || user.displayName || savedEducation.displayName || "").trim();
        const resolvedCourse = String(profileItem.course || savedEducation.course || "").trim();
        const resolvedYear = String(profileItem.year || savedEducation.year || "1st Year").trim();
        const resolvedPhotoUrl = String(user.photoURL || savedEducation.photoURL || "").trim();

        setDisplayName(resolvedName);
        setCourse(resolvedCourse);
        setYear(resolvedYear || "1st Year");
        setPhotoURL(resolvedPhotoUrl);
        setCollege("BITSATHY");
        setInitialProfile({
          displayName: resolvedName,
          photoURL: resolvedPhotoUrl,
          course: resolvedCourse,
          year: resolvedYear || "1st Year",
        });

        const presentDays = attendanceList.filter((a) => a.status === "present").length;
        const absentDays = Math.max(attendanceList.length - presentDays, 0);

        const completedTodaySet = new Set((todayAttendance?.completedSkills || []).map((s) => String(s || "").toLowerCase().trim()));
        const skillRows = Array.isArray(studentSkillsRes?.items) ? studentSkillsRes.items : [];
        const normalizedSkillRows = skillRows.map((item) => ({
          ...item,
          statusNorm: String(item.status || item.skill_status || item.progressStatus || "").toLowerCase(),
          titleNorm: String(item.title || item.skillName || "").toLowerCase().trim(),
        }));
        const registeredFromApi = normalizedSkillRows.length;
        const registeredFromLocal = skills?.length || 0;
        const totalSkills = Math.max(registeredFromApi, registeredFromLocal);

        const completedByStatusApi = normalizedSkillRows.filter((s) => s.statusNorm === "completed").length;
        const completedByStatusLocal = (skills || []).filter((s) => String(s.status || "").toLowerCase() === "completed").length;
        const completedByToday = normalizedSkillRows.filter((s) => completedTodaySet.has(s.titleNorm)).length;

        const allocatedAndRegisteredCourses = [
          ...(courseRes?.allocatedCourses || []),
          ...(courseRes?.registeredCourses || []),
        ];
        const completedFromCourses = allocatedAndRegisteredCourses.filter((c) => String(c.status || "").toLowerCase() === "completed").length;
        const completedSkills = Math.max(completedByStatusApi, completedByStatusLocal, completedByToday, completedFromCourses);

        const activeByStatusApi = normalizedSkillRows.filter((s) => {
          return s.statusNorm === "active" || s.statusNorm === "ongoing" || s.statusNorm === "in_progress";
        }).length;
        const activeByStatusLocal = (skills || []).filter((s) => {
          const status = String(s.status || "").toLowerCase();
          return status === "active" || status === "ongoing" || status === "in_progress";
        }).length;
        const activeFromCourses = allocatedAndRegisteredCourses.filter((c) => {
          const status = String(c.status || "").toLowerCase();
          return status === "active" || status === "ongoing" || status === "in_progress" || status === "pending";
        }).length;
        const activeFallback = Math.max(totalSkills - completedSkills, 0);
        const activeSkills = Math.max(activeByStatusApi, activeByStatusLocal, activeFromCourses, activeFallback);

        // Profile statistics must use admin-allocated attendance only.
        const allocatedAttendanceRows = allocatedAttendanceRes?.items || [];
        const attendanceRows = allocatedAttendanceRows;
        const attendancePresent = attendanceRows.filter((r) => String(r.status || "").toLowerCase() === "present").length;
        const attendanceAbsent = Math.max(attendanceRows.length - attendancePresent, 0);
        const attendancePercentage = attendanceRows.length
          ? Math.round((attendancePresent / attendanceRows.length) * 100)
          : (attendanceList.length ? Math.round((presentDays / attendanceList.length) * 100) : 0);

        const completionPercentage = totalSkills ? Math.round((completedSkills / totalSkills) * 100) : 0;
        const focusScore = Math.round((attendancePercentage + completionPercentage) / 2);

        const allocatedNames = [];
        const addedNames = new Set();
        (courseRes?.allocatedCourses || []).forEach((courseItem) => {
          const name = String(courseItem?.title || courseItem?.course_name || "").trim();
          if (!name) return;
          const key = name.toLowerCase();
          if (addedNames.has(key)) return;
          addedNames.add(key);
          allocatedNames.push(name);
        });
        setAllocatedCourseNames(allocatedNames);
        setAttendanceSummary({
          present: attendancePresent,
          absent: attendanceAbsent,
          percentage: Math.min(100, Math.max(0, attendancePercentage || 0)),
        });

        const activityQ = query(
          collection(db, "users", user.uid, "activityHistory"),
          orderBy("createdAt", "desc"),
          limit(25)
        );
        const activitySnap = await getDocs(activityQ);
        const perSkill = {};
        const activityItems = [];
        const todayKey = new Date().toISOString().split("T")[0];
        let todayStudyMinutes = 0;
        activitySnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const skillName = data.skillName || "Skill";
          const minutes = Number(data.duration || 0);
          const createdAtDate = data.createdAt?.toDate ? data.createdAt.toDate() : null;
          const dateKey = data.date || (createdAtDate ? createdAtDate.toISOString().split("T")[0] : "");
          perSkill[skillName] = perSkill[skillName] || { minutes: 0, sessions: 0 };
          perSkill[skillName].minutes += minutes;
          perSkill[skillName].sessions += 1;
          if (dateKey === todayKey) {
            todayStudyMinutes += minutes;
          }
          activityItems.push({
            id: docSnap.id,
            skillName,
            activityName: data.activityName || skillName,
            duration: minutes,
            date: dateKey || fmtDate(data.createdAt),
            status: data.status || "completed",
          });
        });

        const totalSessions = Math.max(metrics.totals.sessions || 0, activitySnap.size);
        const practiceMinutes = Math.max(metrics.totals.minutes || 0, activityItems.reduce((sum, item) => sum + (item.duration || 0), 0));
        const longestStreak = Math.max(metrics.streak || 0, computeLongestStreak(attendanceList));

        const progressCards = (skills || []).map((skill) => {
          const bucket = perSkill[skill.skillName] || { minutes: 0, sessions: 0 };
          const target = Math.max(Number(skill.defaultDuration) || 30, 15);
          const percent = Math.min(100, Math.round((bucket.minutes / target) * 20));
          return {
            name: skill.skillName || "Skill",
            percent,
            minutes: bucket.minutes,
            sessions: bucket.sessions,
          };
        });

        setSkillStats(progressCards);
        setRecentActivity(activityItems.slice(0, 8));
        setSummary({
          totalSkills,
          completedSkills,
          activeSkills,
          studyMinutes: todayStudyMinutes,
          focusScore: Math.min(100, focusScore || 0),
        });
        setActivityStats({ totalSessions, practiceMinutes, longestStreak, presentDays, absentDays });
        setStatus("");
      } catch (err) {
        console.error("Profile load failed", err);
        setStatus("We could not load your profile stats.");
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user, skills, metrics, reloadToken]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (profileSaving) return;

    const nextName = String(displayName || "").trim();
    if (!nextName) {
      setStatus("Name is required");
      return;
    }

    const normalizedPhoto = String(photoURL || "").trim();
    if (normalizedPhoto && !isValidHttpUrl(normalizedPhoto)) {
      setStatus("Please enter a valid profile image URL.");
      return;
    }

    try {
      setProfileSaving(true);
      await updateProfile(user, { displayName: nextName, photoURL: normalizedPhoto || DEFAULT_PROFILE_IMAGE });
      localStorage.setItem(
        "profile:education",
        JSON.stringify({
          displayName: nextName,
          photoURL: normalizedPhoto,
          course,
          year,
          college: "BITSATHY",
        })
      );
      setInitialProfile({ displayName: nextName, photoURL: normalizedPhoto, course, year });
      setStatus("Profile updated successfully.");
      toast.success("Profile updated successfully", { containerId: "global-toasts" });
      setReloadToken((prev) => prev + 1);
    } catch (err) {
      const message = err.message || "Update failed.";
      setStatus(message);
      toast.error(message, { containerId: "global-toasts" });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleReset = () => {
    setDisplayName(initialProfile.displayName || "");
    setPhotoURL(initialProfile.photoURL || "");
    setCourse(initialProfile.course || "");
    setYear(initialProfile.year || "1st Year");
    setStatus("");
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setPasswordStatus("Password change is handled securely after re-authentication.");
    toast.info("Password change requires re-authentication.", { containerId: "global-toasts" });
  };

  const handleLogout = async () => {
    if (accountActionLoading) return;
    setAccountActionLoading("logout");
    try {
      await signOut(auth);
      toast.success("Logged out successfully", { containerId: "global-toasts" });
      navigate("/login", { replace: true });
    } catch (err) {
      toast.error(err?.message || "Failed to logout", { containerId: "global-toasts" });
    } finally {
      setAccountActionLoading("");
    }
  };

  const handleDeleteAccount = () => {
    if (!window.confirm("Delete account request cannot be undone. Continue?")) return;
    toast.error("Account deletion must be done by admin for safety.", { containerId: "global-toasts" });
  };

  const handleResetData = () => {
    if (!window.confirm("Reset local profile preferences and refresh stats?")) return;
    localStorage.removeItem("profile:education");
    setReloadToken((prev) => prev + 1);
    toast.success("Local profile data reset", { containerId: "global-toasts" });
  };

  const safeDisplayName = String(displayName || "").trim();
  const heroInitial = safeDisplayName?.charAt(0) || user?.email?.charAt(0) || "U";
  const avatarUrl = isValidHttpUrl(photoURL) ? photoURL : DEFAULT_PROFILE_IMAGE;

  const statCards = [
    { label: "Skills", value: summary.totalSkills, icon: FiBookOpen, accent: "text-indigo-600 bg-indigo-50" },
    { label: "Completed", value: summary.completedSkills, icon: FiAward, accent: "text-emerald-600 bg-emerald-50" },
    { label: "Active Skills", value: summary.activeSkills, icon: FiRefreshCw, accent: "text-sky-600 bg-sky-50" },
    { label: "Study Time", value: fmtMinutes(summary.studyMinutes), icon: FiClock, accent: "text-amber-600 bg-amber-50" },
    { label: "Attendance %", value: `${attendanceSummary.percentage}%`, icon: FiCalendar, accent: "text-cyan-600 bg-cyan-50" },
    { label: "Focus", value: `${summary.focusScore}%`, icon: FiSettings, accent: "text-violet-600 bg-violet-50" },
  ];

  const activityCards = [
    { label: "Total Sessions", value: activityStats.totalSessions, icon: FiBookOpen },
    { label: "Practice Time", value: fmtMinutes(activityStats.practiceMinutes), icon: FiClock },
    { label: "Streak", value: `${activityStats.longestStreak} days`, icon: FiAward },
    { label: "Present Days", value: activityStats.presentDays, icon: FiCalendar },
    { label: "Absent Days", value: activityStats.absentDays, icon: FiCalendar },
  ];

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-indigo-600">Profile</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Profile</h1>
            {loading && <span className="text-xs text-slate-500">Refreshing...</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white grid place-items-center text-2xl font-bold">
                  <img
                    src={avatarUrl}
                    alt={displayName || "Profile"}
                    className="w-full h-full object-cover rounded-2xl"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
                    }}
                  />
                </div>
                <div className="flex-1">
                  <div className="text-xl font-semibold text-slate-900">{safeDisplayName || heroInitial}</div>
                  <div className="text-sm text-slate-500">{user?.email}</div>
                  <div className="flex flex-wrap gap-2 mt-2 text-xs text-slate-600">
                    <span className="px-3 py-1 rounded-full bg-slate-100 font-semibold">{course || "Course"}</span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 font-semibold">{year}</span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 font-semibold">Joined {joinDate}</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {statCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm flex flex-col gap-1 h-full">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className={`p-2 rounded-lg ${card.accent}`}><Icon className="text-[16px]" /></span>
                        <span className="font-semibold">{card.label}</span>
                      </div>
                      <div className="text-xl font-bold text-slate-900">{card.value}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-indigo-600">Activity statistics</div>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {activityCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm flex items-center gap-3">
                      <span className="p-2 rounded-lg bg-indigo-50 text-indigo-600"><Icon /></span>
                      <div>
                        <div className="text-xs text-slate-500 font-semibold uppercase tracking-wide">{card.label}</div>
                        <div className="text-lg font-bold text-slate-900">{card.value}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-indigo-600">Attendance summary</div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Present</div>
                  <div className="text-xl font-bold text-emerald-700">{attendanceSummary.present}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Absent</div>
                  <div className="text-xl font-bold text-rose-700">{attendanceSummary.absent}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
                  <div className="text-xs uppercase tracking-wide text-slate-500 font-semibold">Percentage</div>
                  <div className="text-xl font-bold text-indigo-700">{attendanceSummary.percentage}%</div>
                </div>
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-4">
              <div>
                <div className="text-sm font-semibold text-indigo-600">Allocated courses</div>
              </div>
              {allocatedCourseNames.length === 0 ? (
                <p className="text-sm text-slate-500">No allocated courses yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {allocatedCourseNames.map((name) => (
                    <div key={name} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm text-sm font-semibold text-slate-800">
                      {name}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-indigo-600">Skill progress</div>
                </div>
              </div>
              {skillStats.length === 0 ? (
                <p className="text-sm text-slate-500">No skills yet. Add a skill to see progress.</p>
              ) : (
                <div className="space-y-3">
                  {skillStats.map((skill) => (
                    <div key={skill.name} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm">
                      <div className="flex items-center justify-between text-sm font-semibold text-slate-800">
                        <span>{skill.name}</span>
                        <span className="text-indigo-600">{skill.percent}%</span>
                      </div>
                      <div className="mt-2 h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                        <div className="h-full bg-gradient-to-r from-indigo-500 to-sky-500" style={{ width: `${skill.percent}%` }} />
                      </div>
                      <div className="mt-2 text-xs text-slate-500 flex gap-3">
                        <span>{fmtMinutes(skill.minutes)}</span>
                        <span>{skill.sessions} sessions</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-indigo-600">Recent activity</div>
                </div>
              </div>
              {recentActivity.length === 0 ? (
                <p className="text-sm text-slate-500">No recent activity yet.</p>
              ) : (
                <div className="space-y-3">
                  {recentActivity.map((item) => (
                    <div key={item.id} className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 shadow-sm flex items-center justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.activityName}</div>
                        <div className="text-xs text-slate-500">{item.skillName}</div>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <div className="font-semibold text-slate-800">{fmtMinutes(item.duration)}</div>
                        <div>{fmtDate(item.date)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="space-y-4 lg:space-y-5 self-start lg:sticky lg:top-4">
            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiUser />
                <span>Account settings</span>
              </div>
              <form className="space-y-3" onSubmit={handleSave}>
                <label className="text-sm font-medium text-slate-700">
                  Name
                  <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Email
                  <input value={user?.email || ""} disabled className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 cursor-not-allowed" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Profile Picture
                  <input value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm font-medium text-slate-700">
                    College
                    <input value={college || "BITSATHY"} readOnly className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 cursor-not-allowed" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Course
                    <input value={course} onChange={(e) => setCourse(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                  </label>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Joined Date
                  <input value={joinDate} readOnly className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-slate-50 cursor-not-allowed" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Year
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200">
                    {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold hover:bg-indigo-700 transition disabled:opacity-60" type="submit" disabled={profileSaving}>
                  <FiSave className="text-[18px]" />
                  {profileSaving ? "Saving..." : "Save"}
                </button>
                <button
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-300 text-slate-800 font-semibold hover:bg-slate-50"
                  type="button"
                  onClick={handleReset}
                  disabled={profileSaving}
                >
                  Reset
                </button>
                {status && <div className={`text-sm font-semibold ${/fail|error|invalid|unable/i.test(status) ? "text-red-500" : "text-emerald-600"}`}>{status}</div>}
              </form>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiLock />
                <span>Password settings</span>
              </div>
              <form className="space-y-3" onSubmit={handlePasswordChange}>
                <input placeholder="Current password" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                <input placeholder="New password" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                <input placeholder="Confirm password" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold transition" type="submit">
                  Save
                </button>
                {passwordStatus && <div className="text-sm text-slate-600 font-semibold">{passwordStatus}</div>}
              </form>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiBookOpen />
                <span>Skill settings</span>
              </div>
              <div className="space-y-2 max-h-64 overflow-auto pr-1">
                {(skills || []).map((skill) => (
                  <div key={skill.id} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    <div>
                      <div className="font-semibold text-slate-800">{skill.skillName}</div>
                      <div className="text-xs text-slate-500">Default {skill.defaultDuration || 30} min</div>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button className="px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 font-semibold">Edit</button>
                      <button className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold">Remove</button>
                    </div>
                  </div>
                ))}
                {(!skills || skills.length === 0) && <p className="text-sm text-slate-500">No skills yet.</p>}
              </div>
              <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-dashed border-slate-300 text-slate-700 font-semibold hover:border-indigo-300">
                Add Skill
              </button>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiBell />
                <span>Notifications</span>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { key: "daily", label: "Daily Study Reminder" },
                  { key: "session", label: "Session Complete Notification" },
                  { key: "email", label: "Email Notifications" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={notifications[item.key]}
                      onChange={(e) => setNotifications((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                      className="h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiCamera />
                <span>Camera</span>
              </div>
              <div className="space-y-2 text-sm">
                {[
                  { key: "camera", label: "Camera Access" },
                  { key: "mic", label: "Microphone Access" },
                  { key: "save", label: "Save Video" },
                ].map((item) => (
                  <label key={item.key} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={cameraSettings[item.key]}
                      onChange={(e) => setCameraSettings((prev) => ({ ...prev, [item.key]: e.target.checked }))}
                      className="h-4 w-4"
                    />
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiSettings />
                <span>Theme</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                {[{ key: "light", label: "Light", icon: FiSun }, { key: "dark", label: "Dark", icon: FiMoon }, { key: "system", label: "System", icon: FiMonitor }].map((opt) => {
                  const Icon = opt.icon;
                  const active = theme === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setTheme(opt.key)}
                      type="button"
                      className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border font-semibold ${
                        active ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-slate-50 text-slate-700"
                      }`}
                    >
                      <Icon />
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiLogOut />
                <span>Account actions</span>
              </div>
              <div className="grid grid-cols-1 gap-2 text-sm">
                <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-800 font-semibold disabled:opacity-60" onClick={handleLogout} disabled={accountActionLoading === "logout"}>
                  {accountActionLoading === "logout" ? "Logging out..." : "Logout"}
                </button>
                <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-rose-200 text-rose-700 font-semibold" onClick={handleDeleteAccount}>
                  <FiTrash2 /> Delete Account
                </button>
                <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-amber-200 text-amber-700 font-semibold" onClick={handleResetData}>
                  <FiRefreshCw /> Reset Data
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}
