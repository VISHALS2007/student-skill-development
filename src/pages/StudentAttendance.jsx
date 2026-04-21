import React, { useEffect, useMemo, useState } from "react";
import { FiActivity, FiCalendar, FiCheckCircle, FiLayers, FiXCircle } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import { useAuth } from "../lib/AuthContext";

const configuredApiBase = String(import.meta.env.VITE_API_BASE || "").trim().replace(/\/$/, "");
const isLocalHostRuntime =
  typeof window !== "undefined" && /^(localhost|127\.0\.0\.1)$/i.test(String(window.location?.hostname || ""));
const API_BASES = Array.from(
  new Set(
    [
      ...(configuredApiBase ? [configuredApiBase] : []),
      "/api",
      ...(isLocalHostRuntime ? ["http://localhost:4000/api", "http://localhost:5000/api"] : []),
    ].filter(Boolean)
  )
);
const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);
let preferredApiBase = "";
const ATTENDANCE_FETCH_LIMIT = 120;

const toDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const normalizeStatus = (value) => (String(value || "").toLowerCase() === "present" ? "present" : "absent");

const dedupeRows = (rows = [], keySelector) => {
  const deduped = new Map();
  rows.forEach((row) => {
    const key = keySelector(row);
    if (!key) return;
    const existing = deduped.get(key);
    if (!existing || (existing.status !== "present" && row.status === "present")) {
      deduped.set(key, row);
    }
  });
  return Array.from(deduped.values());
};

const sortRowsByLatest = (rows = []) => {
  const copy = [...rows];
  copy.sort((a, b) => {
    const byDate = new Date(b.date || 0) - new Date(a.date || 0);
    if (byDate !== 0) return byDate;
    return String(a.title || a.courseName || a.skillName || "").localeCompare(String(b.title || b.courseName || b.skillName || ""));
  });
  return copy;
};

const buildStats = (rows = []) => {
  const total = rows.length;
  const present = rows.filter((row) => row.status === "present").length;
  const absent = Math.max(total - present, 0);
  const percent = total ? Math.round((present / total) * 10000) / 100 : 0;
  return { total, present, absent, percent };
};

const isLikelyIdLabel = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  if (/^[a-f0-9]{24,}$/i.test(normalized)) return true;
  if (/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(normalized)) return true;
  return false;
};

const resolveDisplayTitle = (row = {}, fallback = "Allocated Course") => {
  const candidates = [row.courseName, row.course_name, row.title, row.courseTitle, row.skillName, row.skillTitle, row.name]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const title = candidates.find((value) => !isLikelyIdLabel(value));
  return title || fallback;
};

const metricCardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md";

const uniqueBases = (bases = []) => {
  const seen = new Set();
  return bases.filter((base) => {
    const key = String(base || "");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const requestWithFallback = async (path, options = {}, timeoutMs = 9000) => {
  let lastError = null;
  const bases = uniqueBases([preferredApiBase, ...API_BASES]);

  for (const base of bases) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${base}${path}`, { ...options, signal: controller.signal });
      const contentType = String(response.headers.get("content-type") || "").toLowerCase();
      if (response.ok && !contentType.includes("application/json")) {
        const err = new Error("Non-JSON response received from API base");
        err.status = 502;
        lastError = err;
        continue;
      }
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        const err = new Error(data?.error || `Request failed (${response.status})`);
        err.status = response.status;
        if (RETRYABLE_STATUS.has(Number(response.status))) {
          lastError = err;
          continue;
        }
        throw err;
      }
      preferredApiBase = base;
      return data;
    } catch (err) {
      if (err?.status && !RETRYABLE_STATUS.has(Number(err.status))) {
        throw err;
      }
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  const message = String(lastError?.message || "");
  const isNetworkIssue =
    message.toLowerCase().includes("failed to fetch") ||
    message.toLowerCase().includes("network") ||
    message.toLowerCase().includes("timeout") ||
    message.toLowerCase().includes("abort");

  if (isNetworkIssue) {
    throw new Error("Cannot connect to attendance API. Check backend server and VITE_API_BASE.");
  }

  throw new Error(message || "Unable to connect to backend");
};

export default function StudentAttendance() {
  const { user } = useAuth();
  const [allocatedRows, setAllocatedRows] = useState([]);
  const [mySkillRows, setMySkillRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState("");
  const [requestedDates, setRequestedDates] = useState({});

  useEffect(() => {
    const load = async () => {
      if (!user?.uid) return;
      setLoading(true);
      setError("");
      try {
        const token = await user.getIdToken();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
        };

        const [allocatedRes, mySkillsRes] = await Promise.all([
          requestWithFallback(`/student/attendance/allocated?limit=${ATTENDANCE_FETCH_LIMIT}`, { headers }),
          requestWithFallback(`/student/attendance/myskills?limit=${ATTENDANCE_FETCH_LIMIT}`, { headers }),
        ]);

        if (!Array.isArray(allocatedRes?.items) || !Array.isArray(mySkillsRes?.items)) {
          throw new Error("Attendance response format is invalid");
        }

        const nextAllocated = sortRowsByLatest(allocatedRes.items || []);
        const nextMySkills = sortRowsByLatest(mySkillsRes.items || []);
        setAllocatedRows(nextAllocated);
        setMySkillRows(nextMySkills);
        setRequestedDates({});

        const incomingDates = Array.from(
          new Set([
            ...nextAllocated.map((row) => toDateKey(row.date)),
            ...nextMySkills.map((row) => toDateKey(row.date)),
          ].filter(Boolean))
        ).sort((a, b) => new Date(b) - new Date(a));

        setSelectedDate((prev) => {
          if (prev && incomingDates.includes(prev)) return prev;
          return incomingDates[0] || "";
        });
      } catch (err) {
        console.error("Failed to load attendance view", err);
        setError(err.message || "Failed to load attendance");
        setAllocatedRows([]);
        setMySkillRows([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [user]);

  const formatDate = (value) => {
    if (!value) return "-";
    const dt = new Date(toDateKey(value) || value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const normalizedAllocatedRows = useMemo(() => {
    const allocated = (allocatedRows || []).map((row, index) => ({
      id: `allocated-${row.id || `${row.courseId || "course"}-${index}`}`,
      entityId: row.courseId || row.course_id || row.courseName || row.course_name || `course-${index}`,
      date: toDateKey(row.date || row.markedAt),
      title: resolveDisplayTitle(row, "Allocated Course"),
      subtitle: "Admin Allocated",
      status: normalizeStatus(row.status),
      source: "allocated",
    }));

    return sortRowsByLatest(dedupeRows(allocated, (row) => `${row.entityId}__${row.date}`));
  }, [allocatedRows]);

  const normalizedMySkillRows = useMemo(() => {
    const skills = (mySkillRows || []).map((row, index) => ({
      id: `myskill-${row.id || `${row.skillId || "skill"}-${index}`}`,
      entityId: row.skillId || row.skill_id || row.skillName || row.title || `skill-${index}`,
      date: toDateKey(row.date || row.markedAt || row.createdAt),
      title: row.skillName || row.title || row.skillTitle || row.skillId || row.skill_id || "My Skill",
      subtitle: "Student Added",
      status: normalizeStatus(row.status),
      source: "myskills",
    }));

    return sortRowsByLatest(dedupeRows(skills, (row) => `${row.entityId}__${row.date}`));
  }, [mySkillRows]);

  const normalizedRows = useMemo(
    () => sortRowsByLatest([...normalizedAllocatedRows, ...normalizedMySkillRows]),
    [normalizedAllocatedRows, normalizedMySkillRows]
  );

  const availableDates = useMemo(() => {
    return Array.from(new Set(normalizedRows.map((row) => row.date).filter(Boolean))).sort((a, b) => new Date(b) - new Date(a));
  }, [normalizedRows]);

  const activeDate = selectedDate && (availableDates.includes(selectedDate) || /^\d{4}-\d{2}-\d{2}$/.test(selectedDate))
    ? selectedDate
    : availableDates[0] || "";

  useEffect(() => {
    const loadMissingDay = async () => {
      if (!user?.uid || !activeDate || loading || !/^\d{4}-\d{2}-\d{2}$/.test(activeDate)) return;
      if (requestedDates[activeDate]) return;

      const hasAllocatedForDay = normalizedAllocatedRows.some((row) => row.date === activeDate);
      const hasMySkillsForDay = normalizedMySkillRows.some((row) => row.date === activeDate);
      if (hasAllocatedForDay && hasMySkillsForDay) return;

      setDateLoading(true);
      setDateError("");
      try {
        const token = await user.getIdToken();
        const headers = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
        };
        const query = `?${new URLSearchParams({ date: activeDate, limit: String(ATTENDANCE_FETCH_LIMIT) }).toString()}`;
        const [allocatedRes, mySkillsRes] = await Promise.all([
          requestWithFallback(`/student/attendance/allocated${query}`, { headers }),
          requestWithFallback(`/student/attendance/myskills${query}`, { headers }),
        ]);

        if (!Array.isArray(allocatedRes?.items) || !Array.isArray(mySkillsRes?.items)) {
          throw new Error("Attendance response format is invalid");
        }

        setAllocatedRows((prev) => sortRowsByLatest([...prev, ...(allocatedRes.items || [])]));
        setMySkillRows((prev) => sortRowsByLatest([...prev, ...(mySkillsRes.items || [])]));
      } catch (err) {
        setDateError(err?.message || "Unable to fetch selected date attendance");
      } finally {
        setRequestedDates((prev) => ({ ...prev, [activeDate]: true }));
        setDateLoading(false);
      }
    };

    loadMissingDay();
  }, [activeDate, loading, normalizedAllocatedRows, normalizedMySkillRows, requestedDates, user]);

  const allocatedDayRows = useMemo(
    () => (activeDate ? normalizedAllocatedRows.filter((row) => row.date === activeDate) : []),
    [normalizedAllocatedRows, activeDate]
  );

  const mySkillDayRows = useMemo(
    () => (activeDate ? normalizedMySkillRows.filter((row) => row.date === activeDate) : []),
    [normalizedMySkillRows, activeDate]
  );

  const overallStats = useMemo(() => buildStats(normalizedRows), [normalizedRows]);
  const allocatedStats = useMemo(() => buildStats(normalizedAllocatedRows), [normalizedAllocatedRows]);
  const mySkillStats = useMemo(() => buildStats(normalizedMySkillRows), [normalizedMySkillRows]);
  const allocatedDayStats = useMemo(() => buildStats(allocatedDayRows), [allocatedDayRows]);
  const mySkillDayStats = useMemo(() => buildStats(mySkillDayRows), [mySkillDayRows]);

  const renderSection = (title, subtitle, rows, stats, dayRows, dayStats, noDataLabel) => (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <FiLayers />
          </span>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
          {stats.percent}%
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Present</p>
          <p className="text-xl font-semibold text-emerald-600">{stats.present}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Absent</p>
          <p className="text-xl font-semibold text-rose-600">{stats.absent}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
          <p className="text-xs text-slate-500">Total</p>
          <p className="text-xl font-semibold text-slate-800">{stats.total}</p>
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <p className="text-xs text-slate-500">Selected Day</p>
        <p className="text-sm font-medium text-slate-700">
          {activeDate ? formatDate(activeDate) : "-"} | Present {dayStats.present} | Absent {dayStats.absent}
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">{noDataLabel}</p>
        ) : dayRows.length === 0 && activeDate ? (
          <p className="rounded-xl border border-dashed border-slate-300 px-3 py-4 text-sm text-slate-500">
            No records for {formatDate(activeDate)}
          </p>
        ) : (
          dayRows.map((item) => {
            const present = item.status === "present";
            return (
              <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-900">{item.title}</p>
                    <p className="text-xs text-slate-500">{item.subtitle}</p>
                  </div>
                  <span
                    className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${
                      present ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                    }`}
                  >
                    {present ? <FiCheckCircle /> : <FiXCircle />}
                    {present ? "Present" : "Absent"}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );

  return (
    <GlobalLayout>
      <div className="mx-auto w-full max-w-6xl space-y-4 sm:space-y-5">
        <div className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-slate-50 to-indigo-50 px-5 py-5 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Attendance</p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Attendance</h1>
          <p className="mt-1 text-sm text-slate-600">Track Admin Allotted and My Skills attendance separately</p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className={metricCardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-4xl font-bold text-indigo-600">{overallStats.percent}</p>
                <p className="text-sm font-medium text-slate-600">Attendance %</p>
              </div>
              <span className="rounded-xl bg-indigo-50 p-2 text-indigo-600">
                <FiActivity />
              </span>
            </div>
          </div>
          <div className={metricCardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-4xl font-bold text-emerald-600">{overallStats.present}</p>
                <p className="text-sm font-medium text-slate-600">Present</p>
              </div>
              <span className="rounded-xl bg-emerald-50 p-2 text-emerald-600">
                <FiCheckCircle />
              </span>
            </div>
          </div>
          <div className={metricCardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-4xl font-bold text-rose-600">{overallStats.absent}</p>
                <p className="text-sm font-medium text-slate-600">Absent</p>
              </div>
              <span className="rounded-xl bg-rose-50 p-2 text-rose-600">
                <FiXCircle />
              </span>
            </div>
          </div>
          <div className={metricCardClass}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-4xl font-bold text-slate-800">{overallStats.total}</p>
                <p className="text-sm font-medium text-slate-600">Total Records</p>
              </div>
              <span className="rounded-xl bg-slate-100 p-2 text-slate-700">
                <FiLayers />
              </span>
            </div>
          </div>
        </div>

        {loading ? <p className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">Fetching attendance...</p> : null}
        {dateLoading ? <p className="rounded-xl bg-indigo-50 px-4 py-3 text-sm text-indigo-700">Fetching selected day attendance...</p> : null}
        {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p> : null}
        {dateError ? <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-700">{dateError}</p> : null}

        {!loading && !error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <FiCalendar />
              <span className="text-sm font-medium">Select Date</span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                type="date"
                value={activeDate}
                onChange={(event) => setSelectedDate(event.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 outline-none ring-0 focus:border-indigo-400"
              />
              {availableDates.slice(0, 8).map((dateKey) => (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDate(dateKey)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    activeDate === dateKey ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  {formatDate(dateKey)}
                </button>
              ))}
              {availableDates.length === 0 ? <span className="text-sm text-slate-500">No attendance available</span> : null}
            </div>
          </div>
        ) : null}

        {!loading && !error ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {renderSection(
              "Admin Allotted Courses",
              "Attendance marked for admin-assigned courses",
              normalizedAllocatedRows,
              allocatedStats,
              allocatedDayRows,
              allocatedDayStats,
              "No admin allotted attendance records yet"
            )}
            {renderSection(
              "My Skills",
              "Attendance tracked for your self-added skills",
              normalizedMySkillRows,
              mySkillStats,
              mySkillDayRows,
              mySkillDayStats,
              "No my-skills attendance records yet"
            )}
          </div>
        ) : null}

        {!loading && !error && normalizedRows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
            Attendance is empty for this account. Once admin marks attendance or you complete daily skills, records will appear here.
          </div>
        ) : null}
      </div>
    </GlobalLayout>
  );
}
