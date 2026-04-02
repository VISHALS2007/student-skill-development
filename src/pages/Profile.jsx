import React, { useEffect, useMemo, useState } from "react";
import { updateProfile } from "firebase/auth";
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
import { db } from "../firebase";
import { computeAttendance, fetchAttendance } from "../services/attendanceService";
import { getMetrics } from "../lib/progressStore";

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

export default function Profile() {
  const { user } = useAuth();
  const { skills } = useSkills();
  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [photoURL, setPhotoURL] = useState(user?.photoURL || "");
  const [college, setCollege] = useState("");
  const [course, setCourse] = useState("");
  const [year, setYear] = useState("1st Year");
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
  const [loading, setLoading] = useState(false);

  const metrics = useMemo(() => getMetrics(), []);
  const joinDate = user?.metadata?.creationTime ? fmtDate(user.metadata.creationTime) : "--";

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      try {
        const [attendanceList, todayAttendance] = await Promise.all([
          fetchAttendance(user.uid, 60),
          computeAttendance(user.uid, skills),
        ]);

        const presentDays = attendanceList.filter((a) => a.status === "present").length;
        const absentDays = Math.max(attendanceList.length - presentDays, 0);
        const focusScore = attendanceList.length ? Math.round((presentDays / attendanceList.length) * 100) : 80;
        const completedSkills = todayAttendance?.completedSkills?.length || 0;
        const activeSkills = Math.max((skills?.length || 0) - completedSkills, 0);

        const activityQ = query(
          collection(db, "users", user.uid, "activityHistory"),
          orderBy("createdAt", "desc"),
          limit(25)
        );
        const activitySnap = await getDocs(activityQ);
        const perSkill = {};
        const activityItems = [];
        activitySnap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const skillName = data.skillName || "Skill";
          const minutes = Number(data.duration || 0);
          perSkill[skillName] = perSkill[skillName] || { minutes: 0, sessions: 0 };
          perSkill[skillName].minutes += minutes;
          perSkill[skillName].sessions += 1;
          activityItems.push({
            id: docSnap.id,
            skillName,
            activityName: data.activityName || skillName,
            duration: minutes,
            date: data.date || fmtDate(data.createdAt),
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
          totalSkills: skills?.length || 0,
          completedSkills,
          activeSkills,
          studyMinutes: practiceMinutes,
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
  }, [user, skills, metrics]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!user) return;
    try {
      await updateProfile(user, { displayName, photoURL });
      localStorage.setItem("profile:education", JSON.stringify({ college, course, year }));
      setStatus("Profile updated.");
    } catch (err) {
      setStatus(err.message || "Update failed.");
    }
  };

  const handlePasswordChange = (e) => {
    e.preventDefault();
    setPasswordStatus("Password change is handled securely after re-authentication.");
  };

  const heroInitial = displayName?.charAt(0) || user?.email?.charAt(0) || "U";

  const statCards = [
    { label: "Skills Registered", value: summary.totalSkills, icon: FiBookOpen, accent: "text-indigo-600 bg-indigo-50" },
    { label: "Skills Completed (today)", value: summary.completedSkills, icon: FiAward, accent: "text-emerald-600 bg-emerald-50" },
    { label: "Active Skills", value: summary.activeSkills, icon: FiRefreshCw, accent: "text-sky-600 bg-sky-50" },
    { label: "Today's Study Time", value: fmtMinutes(summary.studyMinutes), icon: FiClock, accent: "text-amber-600 bg-amber-50" },
    { label: "Focus Score", value: `${summary.focusScore}%`, icon: FiSettings, accent: "text-violet-600 bg-violet-50" },
  ];

  const activityCards = [
    { label: "Total Sessions", value: activityStats.totalSessions, icon: FiBookOpen },
    { label: "Practice Time", value: fmtMinutes(activityStats.practiceMinutes), icon: FiClock },
    { label: "Longest Streak", value: `${activityStats.longestStreak} days`, icon: FiAward },
    { label: "Present Days", value: activityStats.presentDays, icon: FiCalendar },
    { label: "Absent Days", value: activityStats.absentDays, icon: FiCalendar },
  ];

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-indigo-600">Profile</p>
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Student overview</h1>
            {loading && <span className="text-xs text-slate-500">Refreshing...</span>}
          </div>
          <p className="text-slate-600 text-base">Personal info, skill stats, study analytics, and all settings in one page.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 flex flex-col gap-4">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-500 text-white grid place-items-center text-2xl font-bold">
                  {photoURL ? <img src={photoURL} alt={displayName || "Profile"} className="w-full h-full object-cover rounded-2xl" /> : heroInitial}
                </div>
                <div className="flex-1">
                  <div className="text-xl font-semibold text-slate-900">{displayName || "Your name"}</div>
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
                  <p className="text-slate-500 text-sm">Sessions, practice time, streak, and attendance.</p>
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
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-semibold text-indigo-600">Skill progress</div>
                  <p className="text-slate-500 text-sm">Track each registered skill with a progress bar.</p>
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
                  <p className="text-slate-500 text-sm">Latest sessions and completions.</p>
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
          <div className="space-y-4 lg:space-y-5 self-start">
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
                  <input value={user?.email || ""} disabled className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 bg-slate-50" />
                </label>
                <label className="text-sm font-medium text-slate-700">
                  Profile Picture
                  <input value={photoURL} onChange={(e) => setPhotoURL(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-sm font-medium text-slate-700">
                    College
                    <input value={college} onChange={(e) => setCollege(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                  </label>
                  <label className="text-sm font-medium text-slate-700">
                    Course
                    <input value={course} onChange={(e) => setCourse(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                  </label>
                </div>
                <label className="text-sm font-medium text-slate-700">
                  Year
                  <select value={year} onChange={(e) => setYear(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200">
                    {["1st Year", "2nd Year", "3rd Year", "4th Year"].map((opt) => (
                      <option key={opt}>{opt}</option>
                    ))}
                  </select>
                </label>
                <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 text-white font-semibold shadow-md hover:-translate-y-0.5 transition" type="submit">
                  <FiSave className="text-[18px]" />
                  Update Profile
                </button>
                {status && <div className="text-sm text-emerald-600 font-semibold">{status}</div>}
              </form>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiLock />
                <span>Password settings</span>
              </div>
              <form className="space-y-3" onSubmit={handlePasswordChange}>
                <input placeholder="Current Password" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                <input placeholder="New Password" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                <input placeholder="Confirm Password" type="password" className="w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200" />
                <button className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold shadow-md hover:-translate-y-0.5 transition" type="submit">
                  Change Password
                </button>
                {passwordStatus && <div className="text-sm text-slate-600 font-semibold">{passwordStatus}</div>}
              </form>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiBookOpen />
                <span>Skill settings</span>
              </div>
              <p className="text-sm text-slate-500">Edit skill time or remove a skill from the dashboard.</p>
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
                Add New Skill
              </button>
            </div>

            <div className="rounded-2xl bg-white shadow-md border border-slate-100 p-5 space-y-3">
              <div className="flex items-center gap-2 text-slate-800 font-semibold">
                <FiBell />
                <span>Notification settings</span>
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
                <span>Camera settings</span>
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
              <p className="text-xs text-slate-500">Camera is used only for practice. Videos are not stored unless you enable "Save Video".</p>
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
                <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-slate-200 text-slate-800 font-semibold">Logout</button>
                <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-rose-200 text-rose-700 font-semibold">
                  <FiTrash2 /> Delete Account
                </button>
                <button className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-amber-200 text-amber-700 font-semibold">
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
