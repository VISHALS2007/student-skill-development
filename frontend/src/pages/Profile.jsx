import React, { useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
import {
  FiUser,
  FiCalendar,
  FiSave,
  FiAward,
  FiClock,
  FiBookOpen,
} from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { apiRequestWithFallback } from "../lib/apiClient";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { computeAttendance, fetchAttendance } from "../services/attendanceService";
import { getMetrics } from "../lib/progressStore";

const DEFAULT_PROFILE_IMAGE = "https://ui-avatars.com/api/?name=Student&background=0f766e&color=ffffff&bold=true";

const fmtDate = (value) => {
  if (!value) return "--";
  try {
    const date = typeof value.toDate === "function" ? value.toDate() : new Date(value);
    return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  } catch {
    return String(value);
  }
};

const fmtMinutes = (mins) => {
  const safeMinutes = Math.max(Number(mins) || 0, 0);
  if (!safeMinutes) return "0m";
  const hours = Math.floor(safeMinutes / 60);
  const minutes = Math.round(safeMinutes % 60);
  if (hours <= 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
};

const isValidHttpUrl = (value) => {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

export default function Profile() {
  const { user } = useAuth();
  const { skills } = useSkills();

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("1st Year");
  const [initialProfile, setInitialProfile] = useState({
    displayName: "",
    photoURL: "",
    course: "",
    year: "1st Year",
  });
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState({
    totalSkills: 0,
    completedSkills: 0,
    activeSkills: 0,
    studyMinutes: 0,
    focusScore: 0,
  });
  const [attendanceSummary, setAttendanceSummary] = useState({ present: 0, absent: 0, percentage: 0 });
  const [loading, setLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const metrics = useMemo(() => getMetrics(), [reloadToken]);
  const joinDate = user?.metadata?.creationTime ? fmtDate(user.metadata.creationTime) : "--";
  const completionPercentage = summary.totalSkills ? Math.round((summary.completedSkills / summary.totalSkills) * 100) : 0;

  useEffect(() => {
    if (!user) return;

    const load = async () => {
      setLoading(true);
      try {
        const savedEducation = (() => {
          try {
            return JSON.parse(localStorage.getItem("profile:education") || "{}");
          } catch {
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
            return await apiRequestWithFallback(url, { headers }, {
              networkErrorMessage: "Cannot connect to backend server. Start backend: cd server ; npm run dev",
            });
          } catch {
            return null;
          }
        };

        const [attendanceList, todayAttendance, studentProfileRes, studentSkillsRes] = await Promise.all([
          fetchAttendance(user.uid, 60),
          computeAttendance(user.uid, skills),
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
        setInitialProfile({
          displayName: resolvedName,
          photoURL: resolvedPhotoUrl,
          course: resolvedCourse,
          year: resolvedYear || "1st Year",
        });

        const skillRows = Array.isArray(studentSkillsRes?.items) ? studentSkillsRes.items : [];
        const normalizedSkillRows = skillRows.map((item) => ({
          statusNorm: String(item.status || item.skill_status || item.progressStatus || "").toLowerCase(),
          titleNorm: String(item.title || item.skillName || "").toLowerCase().trim(),
        }));

        const totalSkills = Math.max(normalizedSkillRows.length, skills?.length || 0);
        const completedTodaySet = new Set((todayAttendance?.completedSkills || []).map((s) => String(s || "").toLowerCase().trim()));
        const completedByStatusApi = normalizedSkillRows.filter((s) => s.statusNorm === "completed").length;
        const completedByStatusLocal = (skills || []).filter((s) => String(s.status || "").toLowerCase() === "completed").length;
        const completedByToday = normalizedSkillRows.filter((s) => completedTodaySet.has(s.titleNorm)).length;
        const completedSkills = Math.max(completedByStatusApi, completedByStatusLocal, completedByToday);

        const activeByStatusApi = normalizedSkillRows.filter((s) => {
          return s.statusNorm === "active" || s.statusNorm === "ongoing" || s.statusNorm === "in_progress";
        }).length;
        const activeByStatusLocal = (skills || []).filter((s) => {
          const normalized = String(s.status || "").toLowerCase();
          return normalized === "active" || normalized === "ongoing" || normalized === "in_progress";
        }).length;
        const activeSkills = Math.max(activeByStatusApi, activeByStatusLocal, Math.max(totalSkills - completedSkills, 0));

        const attendancePresent = attendanceList.filter((item) => String(item.status || "").toLowerCase() === "present").length;
        const attendanceAbsent = Math.max(attendanceList.length - attendancePresent, 0);
        const attendancePercentage = attendanceList.length
          ? Math.round((attendancePresent / attendanceList.length) * 100)
          : 0;
        const completionPct = totalSkills ? Math.round((completedSkills / totalSkills) * 100) : 0;
        const focusScore = Math.min(100, Math.round((attendancePercentage + completionPct) / 2));

        setAttendanceSummary({
          present: attendancePresent,
          absent: attendanceAbsent,
          percentage: attendancePercentage,
        });
        setSummary({
          totalSkills,
          completedSkills,
          activeSkills,
          studyMinutes: Number(metrics?.totals?.minutes || 0),
          focusScore,
        });
        setStatus("");
      } catch (err) {
        console.error("Profile load failed", err);
        setStatus("We could not load your profile.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [user, skills, metrics, reloadToken]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user || profileSaving) return;

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
        })
      );
      setInitialProfile({ displayName: nextName, photoURL: normalizedPhoto, course, year });
      setStatus("Profile updated successfully.");
      toast.success("Profile updated successfully", { containerId: "global-toasts" });
      setReloadToken((prev) => prev + 1);
    } catch (err) {
      const message = err?.message || "Update failed.";
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

  const safeDisplayName = String(displayName || "").trim();
  const heroInitial = safeDisplayName?.charAt(0) || user?.email?.charAt(0) || "U";
  const avatarUrl = isValidHttpUrl(photoURL) ? photoURL : DEFAULT_PROFILE_IMAGE;

  const statCards = [
    { label: "Skills", value: summary.totalSkills, icon: FiBookOpen, accent: "text-teal-700 bg-teal-50" },
    { label: "Completed", value: summary.completedSkills, icon: FiAward, accent: "text-emerald-700 bg-emerald-50" },
    { label: "Study Time", value: fmtMinutes(summary.studyMinutes), icon: FiClock, accent: "text-cyan-700 bg-cyan-50" },
    { label: "Attendance", value: `${attendanceSummary.percentage}%`, icon: FiCalendar, accent: "text-sky-700 bg-sky-50" },
  ];

  return (
    <GlobalLayout>
      <div className="mx-auto w-full max-w-6xl space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-teal-50 p-5 shadow-sm">
          <p className="text-xs font-semibold tracking-[0.08em] uppercase text-teal-700">Profile</p>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-[28px] font-bold text-slate-900 tracking-tight">My Profile</h1>
            {loading && <span className="text-xs text-slate-500">Refreshing...</span>}
          </div>
          <p className="mt-1 text-sm text-slate-600">Manage your personal details and learning summary in one place.</p>
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-5 gap-6 items-start">
          <div className="xl:col-span-3 space-y-5">
            <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5 flex flex-col gap-4">
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white grid place-items-center text-2xl font-bold overflow-hidden shrink-0">
                  <img
                    src={avatarUrl}
                    alt={displayName || "Profile"}
                    className="w-full h-full object-cover rounded-2xl"
                    onError={(e) => {
                      e.currentTarget.src = DEFAULT_PROFILE_IMAGE;
                    }}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-2xl leading-[1.15] font-bold text-slate-900 truncate tracking-tight">{safeDisplayName || heroInitial}</div>
                  <div className="text-sm text-slate-500 truncate mt-1 tracking-[0.005em]">{user?.email}</div>
                  <div className="flex flex-wrap gap-2 mt-3 text-xs text-slate-600">
                    <span className="px-3 py-1 rounded-full bg-slate-100 font-semibold">{course || "Course Not Set"}</span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 font-semibold">{year}</span>
                    <span className="px-3 py-1 rounded-full bg-slate-100 font-semibold">Joined {joinDate}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
                {statCards.map((card) => {
                  const Icon = card.icon;
                  return (
                    <div key={card.label} className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 shadow-sm flex flex-col gap-2 min-h-[116px]">
                      <div className="flex items-center gap-2 text-sm text-slate-600">
                        <span className={`p-2 rounded-lg ${card.accent}`}>
                          <Icon className="text-[16px]" />
                        </span>
                        <span className="font-semibold leading-tight">{card.label}</span>
                      </div>
                      <div className="text-[35px] font-bold text-slate-900 tabular-nums leading-tight mt-auto tracking-tight">{card.value}</div>
                    </div>
                  );
                })}
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-4">
                <div className="flex items-center justify-between text-sm font-semibold text-slate-700 tracking-tight">
                  <span>Skill Completion</span>
                  <span className="text-teal-700">{completionPercentage}%</span>
                </div>
                <div className="mt-2 h-2.5 w-full bg-slate-200 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-teal-500 to-cyan-500" style={{ width: `${completionPercentage}%` }} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-600">
                  <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 font-semibold">Present: {attendanceSummary.present}</span>
                  <span className="px-3 py-1 rounded-full bg-rose-50 text-rose-700 font-semibold">Absent: {attendanceSummary.absent}</span>
                  <span className="px-3 py-1 rounded-full bg-cyan-50 text-cyan-700 font-semibold">Focus: {summary.focusScore}%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="xl:col-span-2 space-y-4 self-start">
            <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5 space-y-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-slate-800 font-semibold">
                  <FiUser />
                  <span className="tracking-tight">Account Settings</span>
                </div>
                <p className="text-xs text-slate-500">Update your core profile information.</p>
              </div>
              <form className="space-y-4" onSubmit={handleSave}>
                <label className="block text-sm font-medium text-slate-700">
                  <span className="text-sm font-semibold tracking-[0.01em]">Name</span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm tracking-[0.005em] focus:ring-2 focus:ring-teal-200"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="text-sm font-semibold tracking-[0.01em]">Email</span>
                  <input
                    value={user?.email || ""}
                    disabled
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm tracking-[0.005em] bg-slate-50 cursor-not-allowed"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="text-sm font-semibold tracking-[0.01em]">Course</span>
                  <input
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm tracking-[0.005em] focus:ring-2 focus:ring-teal-200"
                  />
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="text-sm font-semibold tracking-[0.01em]">Year</span>
                  <select
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm tracking-[0.005em] focus:ring-2 focus:ring-teal-200"
                  >
                    {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </label>

                <label className="block text-sm font-medium text-slate-700">
                  <span className="text-sm font-semibold tracking-[0.01em]">Profile Image URL (Optional)</span>
                  <input
                    value={photoURL}
                    onChange={(e) => setPhotoURL(e.target.value)}
                    placeholder="https://..."
                    className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 px-4 py-2 text-sm tracking-[0.005em] focus:ring-2 focus:ring-teal-200"
                  />
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  <button
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold tracking-[0.01em] hover:bg-teal-700 transition disabled:opacity-60"
                    type="submit"
                    disabled={profileSaving}
                  >
                    <FiSave className="text-[18px]" />
                    {profileSaving ? "Saving..." : "Save Changes"}
                  </button>

                  <button
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-slate-800 text-sm font-semibold tracking-[0.01em] hover:bg-slate-50"
                    type="button"
                    onClick={handleReset}
                    disabled={profileSaving}
                  >
                    Reset
                  </button>
                </div>

                {status && (
                  <div
                    className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                      /fail|error|invalid|unable/i.test(status)
                        ? "bg-rose-50 text-rose-600"
                        : "bg-emerald-50 text-emerald-600"
                    }`}
                  >
                    {status}
                  </div>
                )}
              </form>
            </div>

            <div className="rounded-2xl bg-white shadow-sm border border-slate-200 p-5 space-y-3">
              <div className="text-sm font-semibold text-slate-700">Settings moved</div>
              <p className="text-sm text-slate-600 leading-relaxed">Theme preferences and account actions are now available in Settings.</p>
              <Link
                to="/settings"
                className="inline-flex items-center justify-center w-full px-4 py-2.5 rounded-xl bg-teal-600 text-white font-semibold hover:bg-teal-700 transition"
              >
                Open Settings
              </Link>
            </div>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}
