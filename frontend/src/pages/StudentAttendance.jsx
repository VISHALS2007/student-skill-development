import React, { useEffect, useMemo, useRef, useState } from "react";
import { FiActivity, FiCalendar, FiCheckCircle, FiLayers, FiXCircle } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { apiRequestWithFallback } from "../lib/apiClient";
import { fetchAttendance } from "../services/attendanceService";

const toDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
};

const normalizeStatus = (value) => (String(value || "").toLowerCase() === "present" ? "present" : "absent");
const normalizeNameKey = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

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

const normalizeSummary = (value) => {
  if (!value || typeof value !== "object") return null;
  const total = Number(value.total || 0);
  const present = Number(value.present || 0);
  const absent = Number(value.absent || Math.max(total - present, 0));
  const percent = total ? Math.round((present / total) * 10000) / 100 : 0;
  return {
    total: Number.isFinite(total) ? total : 0,
    present: Number.isFinite(present) ? present : 0,
    absent: Number.isFinite(absent) ? absent : 0,
    percent,
  };
};

const metricCardClass =
  "rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition-shadow duration-200 hover:shadow-md";
const ATTENDANCE_FETCH_LIMIT = 120;

const STUDENT_ATTENDANCE_CACHE_KEY = "student-attendance:cache:v1";
const STUDENT_ATTENDANCE_CACHE_TTL_MS = 60000;

const getQuickToken = async (user, timeoutMs = 700) => {
  if (!user || typeof user.getIdToken !== "function") return "";
  try {
    const token = await Promise.race([
      user.getIdToken(),
      new Promise((resolve) => setTimeout(() => resolve(""), timeoutMs)),
    ]);
    return typeof token === "string" ? token : "";
  } catch {
    return "";
  }
};

const buildFallbackMySkillRows = (skillsCatalog = [], attendanceDocs = [], dateFilter = "") => {
  const normalizedSkills = dedupeRows(
    (skillsCatalog || [])
      .map((skill, index) => ({
        id: String(skill.id || skill.skillId || skill.skill_id || `skill-${index}`),
        title: String(skill.title || skill.skillName || skill.name || "").trim(),
      }))
      .filter((skill) => skill.title),
    (skill) => normalizeNameKey(skill.title)
  );

  if (!normalizedSkills.length) return [];

  const docsByDate = new Map();
  (attendanceDocs || []).forEach((item) => {
    const date = toDateKey(item?.date);
    if (!date) return;
    docsByDate.set(date, item || {});
  });

  const dateSet = new Set();
  if (dateFilter) {
    const normalizedFilter = toDateKey(dateFilter);
    if (!normalizedFilter || !docsByDate.has(normalizedFilter)) return [];
    dateSet.add(normalizedFilter);
  } else {
    docsByDate.forEach((_item, date) => dateSet.add(date));
  }

  if (!dateSet.size) return [];

  const rows = [];
  dateSet.forEach((date) => {
    const dayDoc = docsByDate.get(date) || {};
    const completedList = Array.isArray(dayDoc.completedSkills) ? dayDoc.completedSkills : [];
    const incompleteList = Array.isArray(dayDoc.incompleteSkills) ? dayDoc.incompleteSkills : [];
    if (!completedList.length && !incompleteList.length) return;

    const completedSet = new Set(completedList.map((name) => normalizeNameKey(name)));
    const incompleteSet = new Set(incompleteList.map((name) => normalizeNameKey(name)));

    normalizedSkills.forEach((skill) => {
      const key = normalizeNameKey(skill.title);
      const present = completedSet.has(key);
      const absent = incompleteSet.has(key) || !present;
      rows.push({
        id: `${skill.id}__${date}`,
        skillId: skill.id,
        skillName: skill.title,
        date,
        status: present ? "present" : absent ? "absent" : "absent",
      });
    });
  });

  return rows;
};

const readAttendanceCache = (uid = "") => {
  try {
    const raw = sessionStorage.getItem(STUDENT_ATTENDANCE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > STUDENT_ATTENDANCE_CACHE_TTL_MS) return null;
    if (uid && String(parsed?.uid || "") !== String(uid)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeAttendanceCache = (uid = "", payload = {}) => {
  try {
    sessionStorage.setItem(
      STUDENT_ATTENDANCE_CACHE_KEY,
      JSON.stringify({
        uid,
        ts: Date.now(),
        allocatedRows: Array.isArray(payload.allocatedRows) ? payload.allocatedRows : [],
        mySkillRows: Array.isArray(payload.mySkillRows) ? payload.mySkillRows : [],
        fallbackSkillCatalog: Array.isArray(payload.fallbackSkillCatalog) ? payload.fallbackSkillCatalog : [],
        fallbackAttendanceDocs: Array.isArray(payload.fallbackAttendanceDocs) ? payload.fallbackAttendanceDocs : [],
        selectedDate: String(payload.selectedDate || ""),
        allocatedSummary: payload.allocatedSummary || null,
        mySkillsSummary: payload.mySkillsSummary || null,
      })
    );
  } catch {
    // ignore cache write failures
  }
};


export default function StudentAttendance() {
  const { user } = useAuth();
  const { skills: contextSkills = [] } = useSkills();
  const [allocatedRows, setAllocatedRows] = useState([]);
  const [mySkillRows, setMySkillRows] = useState([]);
  const [fallbackSkillCatalog, setFallbackSkillCatalog] = useState([]);
  const [fallbackAttendanceDocs, setFallbackAttendanceDocs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [dateLoading, setDateLoading] = useState(false);
  const [dateError, setDateError] = useState("");
  const [requestedDates, setRequestedDates] = useState({});
  const [apiSummary, setApiSummary] = useState({ allocated: null, mySkills: null });
  const cacheReadyRef = useRef(false);

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!user?.uid) return;
      cacheReadyRef.current = false;

      const cached = readAttendanceCache(user.uid);
      if (cached) {
        setAllocatedRows(Array.isArray(cached.allocatedRows) ? cached.allocatedRows : []);
        setMySkillRows(Array.isArray(cached.mySkillRows) ? cached.mySkillRows : []);
        setFallbackSkillCatalog(Array.isArray(cached.fallbackSkillCatalog) ? cached.fallbackSkillCatalog : []);
        setFallbackAttendanceDocs(Array.isArray(cached.fallbackAttendanceDocs) ? cached.fallbackAttendanceDocs : []);
        setApiSummary({
          allocated: normalizeSummary(cached.allocatedSummary),
          mySkills: normalizeSummary(cached.mySkillsSummary),
        });
        if (cached.selectedDate) {
          setSelectedDate(cached.selectedDate);
        }
      }

      setLoading(true);
      setError("");
      try {
        const headers = {
          "Content-Type": "application/json",
          "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
        };
        const token = await getQuickToken(user);
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        const [allocatedRes, mySkillsRes, mySkillsCatalogRes] = await Promise.all([
          apiRequestWithFallback(`/student/attendance/allocated?limit=${ATTENDANCE_FETCH_LIMIT}`, { headers }, { networkErrorMessage: "Cannot connect to attendance API. Check backend server and VITE_API_BASE." }),
          apiRequestWithFallback(`/student/attendance/myskills?limit=${ATTENDANCE_FETCH_LIMIT}`, { headers }, { networkErrorMessage: "Cannot connect to attendance API. Check backend server and VITE_API_BASE." }),
          apiRequestWithFallback("/student/skills", { headers }, { networkErrorMessage: "Cannot connect to attendance API. Check backend server and VITE_API_BASE." }).catch(() => ({ items: [] })),
        ]);

        if (!Array.isArray(allocatedRes?.items) || !Array.isArray(mySkillsRes?.items)) {
          throw new Error("Attendance response format is invalid");
        }

        const allocatedSummary = normalizeSummary(allocatedRes?.summary);
        const mySkillsSummary = normalizeSummary(mySkillsRes?.summary);
        setApiSummary({ allocated: allocatedSummary, mySkills: mySkillsSummary });

        const apiSkillCatalog = (mySkillsCatalogRes?.items || []).filter(
          (item) => String(item?.addedBy || item?.source || "student").toLowerCase() !== "admin"
        );
        const mergedSkillCatalog = [...apiSkillCatalog, ...(contextSkills || [])];
        setFallbackSkillCatalog(mergedSkillCatalog);

        const mySkillItems = Array.isArray(mySkillsRes?.items) ? mySkillsRes.items : [];
        setFallbackAttendanceDocs([]);

        const nextAllocated = sortRowsByLatest(allocatedRes.items || []);
        const nextMySkills = sortRowsByLatest(
          dedupeRows([...(mySkillItems || [])], (row) => {
            const skillId = row.skillId || row.skill_id || row.id || row.skillName || row.title;
            const date = toDateKey(row.date || row.markedAt || row.createdAt);
            return skillId && date ? `${skillId}__${date}` : "";
          })
        );
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

        writeAttendanceCache(user.uid, {
          allocatedRows: nextAllocated,
          mySkillRows: nextMySkills,
          fallbackSkillCatalog: mergedSkillCatalog,
          fallbackAttendanceDocs: [],
          selectedDate: incomingDates[0] || "",
          allocatedSummary,
          mySkillsSummary,
        });

        if (mySkillItems.length === 0) {
          fetchAttendance(user.uid, 45)
            .then((docs) => {
              if (!active) return;
              const localAttendanceDocs = Array.isArray(docs) ? docs : [];
              setFallbackAttendanceDocs(localAttendanceDocs);
              const fallbackRows = buildFallbackMySkillRows(mergedSkillCatalog, localAttendanceDocs, "");
              if (fallbackRows.length) {
                setMySkillRows((prev) =>
                  sortRowsByLatest(
                    dedupeRows([...(prev || []), ...fallbackRows], (row) => {
                      const skillId = row.skillId || row.skill_id || row.id || row.skillName || row.title;
                      const date = toDateKey(row.date || row.markedAt || row.createdAt);
                      return skillId && date ? `${skillId}__${date}` : "";
                    })
                  )
                );
              }
            })
            .catch(() => {});
        }
      } catch (err) {
        console.error("Failed to load attendance view", err);
        setError(err.message || "Failed to load attendance");
        setAllocatedRows([]);
        setMySkillRows([]);
        setApiSummary({ allocated: null, mySkills: null });
      } finally {
        cacheReadyRef.current = true;
        setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [user, contextSkills]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!cacheReadyRef.current) return;
    writeAttendanceCache(user.uid, {
      allocatedRows,
      mySkillRows,
      fallbackSkillCatalog,
      fallbackAttendanceDocs,
      selectedDate,
      allocatedSummary: apiSummary.allocated,
      mySkillsSummary: apiSummary.mySkills,
    });
  }, [allocatedRows, mySkillRows, fallbackSkillCatalog, fallbackAttendanceDocs, selectedDate, user?.uid, apiSummary]);

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
        const headers = {
          "Content-Type": "application/json",
          "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
        };
        const token = await getQuickToken(user);
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }
        const query = `?${new URLSearchParams({ date: activeDate, limit: String(ATTENDANCE_FETCH_LIMIT) }).toString()}`;
        const [allocatedRes, mySkillsRes] = await Promise.all([
          apiRequestWithFallback(`/student/attendance/allocated${query}`, { headers }, { networkErrorMessage: "Cannot connect to attendance API. Check backend server and VITE_API_BASE." }),
          apiRequestWithFallback(`/student/attendance/myskills${query}`, { headers }, { networkErrorMessage: "Cannot connect to attendance API. Check backend server and VITE_API_BASE." }),
        ]);

        if (!Array.isArray(allocatedRes?.items) || !Array.isArray(mySkillsRes?.items)) {
          throw new Error("Attendance response format is invalid");
        }

        const fallbackRows = buildFallbackMySkillRows(fallbackSkillCatalog, fallbackAttendanceDocs, activeDate);

        setAllocatedRows((prev) => sortRowsByLatest([...prev, ...(allocatedRes.items || [])]));
        setMySkillRows((prev) =>
          sortRowsByLatest(
            dedupeRows([...(prev || []), ...(mySkillsRes.items || []), ...fallbackRows], (row) => {
              const skillId = row.skillId || row.skill_id || row.id || row.skillName || row.title;
              const date = toDateKey(row.date || row.markedAt || row.createdAt);
              return skillId && date ? `${skillId}__${date}` : "";
            })
          )
        );
      } catch (err) {
        setDateError(err?.message || "Unable to fetch selected date attendance");
      } finally {
        setRequestedDates((prev) => ({ ...prev, [activeDate]: true }));
        setDateLoading(false);
      }
    };

    loadMissingDay();
  }, [activeDate, fallbackAttendanceDocs, fallbackSkillCatalog, loading, normalizedAllocatedRows, normalizedMySkillRows, requestedDates, user]);

  const allocatedDayRows = useMemo(
    () => (activeDate ? normalizedAllocatedRows.filter((row) => row.date === activeDate) : []),
    [normalizedAllocatedRows, activeDate]
  );

  const mySkillDayRows = useMemo(
    () => (activeDate ? normalizedMySkillRows.filter((row) => row.date === activeDate) : []),
    [normalizedMySkillRows, activeDate]
  );

  const allocatedStats = useMemo(
    () => apiSummary.allocated || buildStats(normalizedAllocatedRows),
    [apiSummary.allocated, normalizedAllocatedRows]
  );
  const mySkillStats = useMemo(
    () => apiSummary.mySkills || buildStats(normalizedMySkillRows),
    [apiSummary.mySkills, normalizedMySkillRows]
  );
  const overallStats = useMemo(() => {
    const total = Number(allocatedStats.total || 0) + Number(mySkillStats.total || 0);
    const present = Number(allocatedStats.present || 0) + Number(mySkillStats.present || 0);
    const absent = Math.max(total - present, 0);
    const percent = total ? Math.round((present / total) * 10000) / 100 : 0;
    return { total, present, absent, percent };
  }, [allocatedStats, mySkillStats]);
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
              {activeDate ? <span className="text-sm text-slate-500">Showing {formatDate(activeDate)}</span> : null}
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
