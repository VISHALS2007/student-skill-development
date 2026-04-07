import React, { useEffect, useMemo, useState } from "react";
import { FiCalendar, FiCheckCircle, FiClock, FiXCircle } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import { useAuth } from "../lib/AuthContext";

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

const API_HOSTS = [configuredApiHost, "", "http://localhost:4000", "http://localhost:5000"].filter(Boolean);
const RETRYABLE_STATUS = new Set([404, 408, 429, 500, 502, 503, 504]);

const requestWithFallback = async (path, options = {}, timeoutMs = 8000) => {
  let lastError = null;

  for (const host of API_HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${host}${path}`, { ...options, signal: controller.signal });
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

  throw new Error(lastError?.message || "Unable to connect to backend");
};

export default function StudentAttendance() {
  const { user } = useAuth();
  const [allocatedRows, setAllocatedRows] = useState([]);
  const [mySkillRows, setMySkillRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

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
          requestWithFallback("/api/student/attendance/allocated", { headers }),
          requestWithFallback("/api/student/attendance/myskills", { headers }),
        ]);

        const sortByLatest = (list = []) => {
          const copy = [...list];
          copy.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
          return copy;
        };

        const nextAllocated = sortByLatest(allocatedRes.items || []);
        const nextMySkills = sortByLatest(mySkillsRes.items || []);
        setAllocatedRows(nextAllocated);
        setMySkillRows(nextMySkills);

        const latestDate = (nextAllocated[0]?.date || nextMySkills[0]?.date || "").slice(0, 10);
        setSelectedDate((prev) => prev || latestDate);
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
    const dt = new Date(value);
    if (Number.isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  const normalizedRows = useMemo(() => {
    const allocated = (allocatedRows || []).map((row, index) => ({
      id: `allocated-${row.id || index}`,
      date: String(row.date || "").slice(0, 10),
      title: row.courseName || row.courseId || "Allocated Course",
      subtitle: "Admin Allocated",
      status: String(row.status || "absent").toLowerCase() === "present" ? "present" : "absent",
      source: "allocated",
    }));

    const skills = (mySkillRows || []).map((row, index) => ({
      id: `myskill-${row.id || index}`,
      date: String(row.date || "").slice(0, 10),
      title: row.skillName || row.skillId || "My Skill",
      subtitle: "Self Learning",
      status: String(row.status || "absent").toLowerCase() === "present" ? "present" : "absent",
      source: "myskills",
    }));

    return [...allocated, ...skills].sort((a, b) => {
      const byDate = new Date(b.date || 0) - new Date(a.date || 0);
      if (byDate !== 0) return byDate;
      return a.title.localeCompare(b.title);
    });
  }, [allocatedRows, mySkillRows]);

  const availableDates = useMemo(() => {
    return Array.from(new Set(normalizedRows.map((row) => row.date).filter(Boolean))).sort((a, b) => new Date(b) - new Date(a));
  }, [normalizedRows]);

  const activeDate = selectedDate || availableDates[0] || "";

  const dayRows = useMemo(() => {
    if (!activeDate) return [];
    return normalizedRows.filter((row) => row.date === activeDate);
  }, [normalizedRows, activeDate]);

  const summary = useMemo(() => {
    const total = normalizedRows.length;
    const present = normalizedRows.filter((row) => row.status === "present").length;
    const absent = Math.max(total - present, 0);
    const percent = total ? Math.round((present / total) * 10000) / 100 : 0;
    return { total, present, absent, percent };
  }, [normalizedRows]);

  return (
    <GlobalLayout>
      <div className="mx-auto w-full max-w-3xl space-y-4 sm:space-y-5">
        <div className="ui-card px-5 py-4">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">My Attendance</h1>
          <p className="mt-1 text-sm text-slate-600">Daily attendance summary</p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-4xl font-bold text-indigo-600">{summary.percent}</p>
            <p className="text-3xl font-bold text-indigo-600">%</p>
            <p className="mt-1 text-sm font-medium text-slate-600">Attendance</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-4xl font-bold text-emerald-600">{summary.present}</p>
            <p className="mt-1 text-sm font-medium text-slate-600">Present</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-4xl font-bold text-rose-600">{summary.absent}</p>
            <p className="mt-1 text-sm font-medium text-slate-600">Absent</p>
          </div>
        </div>

        {loading ? <p className="rounded-xl bg-white px-4 py-3 text-sm text-slate-600">Fetching attendance...</p> : null}
        {error ? <p className="rounded-xl bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-600">{error}</p> : null}

        {!loading && !error ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-slate-500">
              <FiCalendar />
              <span className="text-sm font-medium">Select Date</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {availableDates.length === 0 ? (
                <span className="text-sm text-slate-500">No attendance available</span>
              ) : (
                availableDates.map((dateKey) => (
                  <button
                    key={dateKey}
                    onClick={() => setSelectedDate(dateKey)}
                    className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                      activeDate === dateKey
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    {formatDate(dateKey)}
                  </button>
                ))
              )}
            </div>
          </div>
        ) : null}

        {!loading && !error && activeDate ? (
          <div className="space-y-3">
            {dayRows.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-5 text-sm text-slate-500">
                No records for {formatDate(activeDate)}
              </div>
            ) : (
              dayRows.map((item, index) => {
                const present = item.status === "present";
                return (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                          <FiClock />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-xl font-semibold text-slate-900">{item.title}</p>
                          <p className="text-base text-slate-500">{item.subtitle}</p>
                          {index >= 2 ? (
                            <div className="mt-3 border-t border-slate-200 pt-3 text-sm text-slate-500">
                              <p>Marked by:</p>
                              <p className="font-semibold">-</p>
                            </div>
                          ) : null}
                        </div>
                      </div>
                      <span
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full px-4 py-1.5 text-sm font-semibold ${
                          present
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-rose-50 text-rose-600"
                        }`}
                      >
                        {present ? <FiCheckCircle className="text-base" /> : <FiXCircle className="text-base" />}
                        {present ? "Present" : "Absent"}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        ) : null}
      </div>
    </GlobalLayout>
  );
}
