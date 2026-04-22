import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { FiAlertCircle, FiCheckCircle, FiExternalLink } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { db } from "../firebase";
import { clearLiveTimerPin, openLiveTimerPinWindow, updateLiveTimerPin } from "../lib/liveTimerPin";
import { SKILL_SITE_DEFAULTS } from "../lib/skillDefaults";
import { updateAttendanceRecord } from "../services/attendanceService";

const normalizeName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const getSkillSites = (skillName, skillWebsites = []) => {
  if (skillWebsites && skillWebsites.length) return skillWebsites;
  const key = normalizeName(skillName);
  return SKILL_SITE_DEFAULTS[key] || [];
};

const getDurationMs = (skill) => (Number(skill?.defaultDuration) || 30) * 60 * 1000;

const TIMERS_KEY = "skillTimers:v1";
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

const requestWithFallback = async (path, options = {}, timeoutMs = 5000) => {
  let lastError = null;
  for (const host of API_HOSTS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${host}${path}`, { ...options, signal: controller.signal });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        const err = new Error(payload?.error || `Request failed (${res.status})`);
        err.status = res.status;
        if (RETRYABLE_STATUS.has(Number(res.status))) {
          lastError = err;
          continue;
        }
        throw err;
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
  throw new Error(lastError?.message || "Unable to connect to backend");
};

const normalizeApiSkill = (skill = {}, index = 0) => ({
  id: skill?.id || skill?._id || `skill-${index}`,
  skillName: String(skill?.skillName || skill?.title || skill?.name || "Untitled Skill").trim(),
  defaultDuration: Math.max(1, Number(skill?.defaultDuration || skill?.timerDuration || 30) || 30),
  skillWebsites: Array.isArray(skill?.skillWebsites) ? skill.skillWebsites : Array.isArray(skill?.websites) ? skill.websites : [],
  addedBy: String(skill?.addedBy || skill?.source || "student").toLowerCase(),
});

const persistSkillTimers = (timers) => {
  try {
    sessionStorage.setItem(TIMERS_KEY, JSON.stringify(timers));
  } catch (err) {
    console.warn("Failed to persist timers", err);
  }
};

const loadSkillTimers = () => {
  try {
    const raw = sessionStorage.getItem(TIMERS_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (err) {
    console.warn("Failed to load timers", err);
    return {};
  }
};

const formatMMSS = (ms) => {
  const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
};

const openPracticeWindow = (url) => {
  const targetUrl = String(url || "").trim();
  if (!targetUrl) return null;

  const screenWidth = Math.max(1024, Number(window.screen?.availWidth || window.innerWidth || 1280));
  const screenHeight = Math.max(700, Number(window.screen?.availHeight || window.innerHeight || 800));
  const features = [
    "popup=yes",
    "noopener",
    "noreferrer",
    `width=${screenWidth}`,
    `height=${screenHeight}`,
    "left=0",
    "top=0",
  ].join(",");

  let popup = null;
  try {
    popup = window.open(targetUrl, "_blank", features);
  } catch {
    popup = null;
  }

  if (popup) {
    try {
      popup.focus();
      popup.moveTo?.(0, 0);
      popup.resizeTo?.(screenWidth, screenHeight);
    } catch {
      // Ignore browser restrictions for popup move/resize.
    }
    return popup;
  }

  return window.open(targetUrl, "_blank", "noopener,noreferrer");
};

const dedupeSkills = (skills) => {
  const seen = new Set();
  const unique = [];
  for (const skill of skills) {
    const key = normalizeName(skill.skillName);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(skill);
  }
  return unique;
};

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { skills, loading: skillsLoading, initialized } = useSkills();
  const [apiSkills, setApiSkills] = useState([]);
  const [apiSkillsLoading, setApiSkillsLoading] = useState(false);
  const [completedToday, setCompletedToday] = useState({});
  const [skillTimers, setSkillTimers] = useState(() => loadSkillTimers()); // { [skillId]: { status, elapsedMs, durationMs, startedAt?, skillName, skillId } }
  const [currentRunningId, setCurrentRunningId] = useState(null);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const timerRef = useRef(null);
  const runningRef = useRef(null);

  const stopTick = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const loadStudentSkills = async () => {
    if (!user) return;
    setApiSkillsLoading(true);
    try {
      const token = await user.getIdToken();
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };
      const data = await requestWithFallback("/api/student/skills", { headers });
      const normalized = dedupeSkills((data?.items || []).map((item, idx) => normalizeApiSkill(item, idx)));
      setApiSkills(normalized);
      setError("");
    } catch (err) {
      setApiSkills([]);
    } finally {
      setApiSkillsLoading(false);
    }
  };

  const fallbackSkills = Array.isArray(skills) ? dedupeSkills(skills) : [];
  const safeSkills = apiSkills.length > 0 ? apiSkills : fallbackSkills;

  const loadCompletions = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(collection(db, "users", user.uid, "activityHistory"), where("date", "==", today));
      const snap = await getDocs(q);
      const map = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        if (data?.skillName) map[data.skillName] = true;
      });
      setCompletedToday(map);
    } catch (err) {
      console.error("Failed to load task completions", err);
    }
  };

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    const hydrate = async () => {
      try {
        await Promise.all([loadCompletions(), loadStudentSkills()]);
        if (mounted) setError("");
      } catch (err) {
        console.error("Dashboard hydrate failed", err);
        if (mounted) setError("We could not load your dashboard data. Please retry.");
      }
    };
    hydrate();
    return () => {
      mounted = false;
    };
  }, [user]);

  useEffect(() => {
    const justAdded = sessionStorage.getItem("skillJustAdded");
    if (justAdded) {
      setBanner(`Skill "${justAdded}" added`);
      sessionStorage.removeItem("skillJustAdded");
    }
  }, []);

  useEffect(() => {
    if (!banner) return undefined;
    const t = setTimeout(() => setBanner(""), 3000);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    persistSkillTimers(skillTimers);
  }, [skillTimers]);

  useEffect(() => {
    const runningEntry = Object.values(skillTimers || {}).find((entry) => entry?.status === "running" && entry?.skillName);
    if (runningEntry) {
      const totalMs = Math.max(0, Number(runningEntry.durationMs) || 0);
      const elapsedMs = Math.max(0, Number(runningEntry.elapsedMs) || 0);
      updateLiveTimerPin({
        label: runningEntry.skillName || "Practice Timer",
        status: "running",
        remainingMs: Math.max(0, totalMs - elapsedMs),
        elapsedMs,
      });
      return;
    }

    const pausedEntry = Object.values(skillTimers || {}).find((entry) => entry?.status === "paused" && entry?.skillName);
    if (pausedEntry) {
      const totalMs = Math.max(0, Number(pausedEntry.durationMs) || 0);
      const elapsedMs = Math.max(0, Number(pausedEntry.elapsedMs) || 0);
      updateLiveTimerPin({
        label: pausedEntry.skillName || "Practice Timer",
        status: "paused",
        remainingMs: Math.max(0, totalMs - elapsedMs),
        elapsedMs,
      });
      return;
    }

    clearLiveTimerPin();
  }, [skillTimers]);

  useEffect(
    () => () => {
      clearLiveTimerPin();
    },
    []
  );

  useEffect(() => {
    stopTick();
    timerRef.current = setInterval(() => {
      setSkillTimers((prev) => {
        const runningId = runningRef.current;
        if (!runningId) return prev;
        const entry = prev[runningId];
        if (!entry || entry.status !== "running") return prev;
        // Only update elapsed time if startedAt is a valid number
        const validStartedAt = typeof entry.startedAt === "number" && entry.startedAt > 0;
        if (!validStartedAt) return prev; // Skip update if startedAt is not valid
        const elapsedMs = Math.min(Date.now() - entry.startedAt, entry.durationMs);
        return { ...prev, [runningId]: { ...entry, elapsedMs } };
      });
    }, 1000);
    return () => stopTick();
  }, []);

  useEffect(() => {
    const runningId = currentRunningId;
    if (!runningId) return;
    const entry = skillTimers[runningId];
    if (entry && entry.status === "running" && entry.elapsedMs >= entry.durationMs) {
      finalizeCompletion(entry);
    }
  }, [skillTimers, currentRunningId]);

  useEffect(() => {
    if (!completedToday || Object.keys(completedToday).length === 0) return;
    setSkillTimers((prev) => {
      const next = { ...prev };
      Object.values(prev).forEach((entry) => {
        if (completedToday[entry.skillName]) {
          next[entry.skillId] = { ...entry, status: "completed", elapsedMs: entry.durationMs, startedAt: null };
        }
      });
      return next;
    });
  }, [completedToday]);

  useEffect(() => {
    if (!Array.isArray(safeSkills) || safeSkills.length === 0) return;
    setSkillTimers((prev) => {
      const next = {};
      safeSkills.forEach((skill) => {
        const existing = prev[skill.id];
        const durationMs = getDurationMs(skill);
        const defaultStatus = completedToday[skill.skillName] ? "completed" : "idle";
        const base = existing || { status: defaultStatus, elapsedMs: 0 };
        const elapsedMs = base.status === "completed" ? durationMs : Math.min(base.elapsedMs || 0, durationMs);
        next[skill.id] = {
          ...base,
          skillId: skill.id,
          skillName: skill.skillName,
          durationMs,
          elapsedMs,
          status: base.status || defaultStatus,
          // Preserve startedAt if status is running, otherwise set to null
          startedAt: base.status === "running" ? base.startedAt : null,
        };
      });
      return next;
    });
  }, [safeSkills, completedToday]);

  const pauseSkill = (skillId) => {
    if (!skillId) return;
    setSkillTimers((prev) => {
      const entry = prev[skillId];
      if (!entry) return prev;
      // Only calculate elapsed time if startedAt is valid
      let elapsedMs = entry.elapsedMs || 0;
      if (entry.status === "running" && typeof entry.startedAt === "number" && entry.startedAt > 0) {
        elapsedMs = Math.min(Date.now() - entry.startedAt, entry.durationMs);
      }
      return { ...prev, [skillId]: { ...entry, status: "paused", elapsedMs, startedAt: null } };
    });
    if (currentRunningId === skillId) {
      setCurrentRunningId(null);
      runningRef.current = null;
    }
  };

  const finalizeCompletion = async (entry) => {
    runningRef.current = null;
    setCurrentRunningId(null);
    setSkillTimers((prev) => {
      const existing = prev[entry.skillId] || entry;
      return { ...prev, [entry.skillId]: { ...existing, status: "completed", elapsedMs: existing.durationMs, startedAt: null } };
    });
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      await addDoc(collection(db, "users", user.uid, "activityHistory"), {
        userId: user.uid,
        skillId: entry.skillId,
        skillName: entry.skillName,
        activityName: `${entry.skillName} practice`,
        date: today,
        duration: (entry.durationMs || 0) / 60000,
        status: "completed",
        createdAt: serverTimestamp(),
      });
      setCompletedToday((prev) => ({ ...prev, [entry.skillName]: true }));
      updateAttendanceRecord(user.uid, safeSkills).catch(() => {});
    } catch (err) {
      console.error("Failed to save skill completion", err);
    }
  };

  const startSkill = (skill) => {
    if (!skill) return;
    const isCommunication = skill.skillName?.toLowerCase().includes("communication");
    if (isCommunication) {
      const payload = {
        taskName: skill.skillName || "Communication Practice",
        durationMinutes: Math.round((skill.defaultDuration || 5)),
        category: "Communication",
        autoStart: true,
      };
      sessionStorage.setItem("commSessionInfo", JSON.stringify(payload));
      navigate("/communication-session", { state: payload });
      return;
    }
    if (currentRunningId && currentRunningId !== skill.id) {
      pauseSkill(currentRunningId);
    }
    const durationMs = getDurationMs(skill);
    const now = Date.now();
    setSkillTimers((prev) => {
      const prevEntry = prev[skill.id] || {};
      const elapsedMs = Math.min(prevEntry.elapsedMs || 0, durationMs);
      return {
        ...prev,
        [skill.id]: {
          ...prevEntry,
          skillId: skill.id,
          skillName: skill.skillName,
          durationMs,
          elapsedMs,
          startedAt: now - elapsedMs,
          status: "running",
        },
      };
    });
    setCurrentRunningId(skill.id);
    runningRef.current = skill.id;
  };

  const handleSiteClick = (skill, url) => {
    const isCommunication = skill.skillName?.toLowerCase().includes("communication");
    if (isCommunication) {
      const payload = {
        taskName: skill.skillName || "Communication Practice",
        durationMinutes: Math.round((skill.defaultDuration || 5)),
        category: "Communication",
        autoStart: true,
      };
      if (url) openPracticeWindow(url);
      sessionStorage.setItem("commSessionInfo", JSON.stringify(payload));
      navigate("/communication-session", { state: payload });
      return;
    }
    // Open website AND start timer for regular skills
    if (url) openPracticeWindow(url);
    startSkill(skill);
  };

  const isLoading = (apiSkillsLoading || skillsLoading || !initialized) && safeSkills.length === 0;

  return (
    <GlobalLayout>
      <div className="space-y-6">
        {banner && (
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 px-3 py-2 text-sm font-semibold">
            {banner}
          </div>
        )}
        {error && (
          <div className="rounded-xl border border-rose-100 bg-rose-50 text-rose-700 px-3 py-2 text-sm font-semibold">
            {error}
          </div>
        )}
        <div>
          <p className="text-sm font-semibold text-indigo-600">Dashboard</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Skill study tracker</h1>
          <p className="text-slate-600 text-base">Registered skills with timers and quick practice links. Manage durations in Manage Skills.</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {isLoading ? (
            Array.from({ length: 6 }).map((_, idx) => (
              <div key={`skeleton-${idx}`} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                <div className="h-5 bg-slate-200 rounded w-2/3" />
                <div className="h-4 bg-slate-100 rounded w-1/2" />
                <div className="h-3 bg-slate-100 rounded w-full" />
                <div className="h-10 bg-slate-100 rounded" />
              </div>
            ))
          ) : safeSkills.length === 0 ? (
            <p className="text-sm text-slate-600">No skills yet. Go to Manage Skills to add one.</p>
          ) : (
            safeSkills.map((skill) => {
              const sites = getSkillSites(skill.skillName, skill.skillWebsites);
              const timer = skillTimers[skill.id] || {};
              const durationMs = timer.durationMs || getDurationMs(skill);
              const elapsedMs = timer.elapsedMs || 0;
              const remainingMs = Math.max(durationMs - elapsedMs, 0);
              const status = timer.status || (completedToday[skill.skillName] ? "completed" : "idle");
              const isRunning = status === "running";
              const isCompleted = status === "completed" || completedToday[skill.skillName];
              const primaryLabel = isCompleted ? "Completed" : isRunning ? "Pause" : timer.status === "paused" ? "Resume" : "Start";
              return (
                <DashboardCard key={skill.id} title={skill.skillName || "Untitled skill"} subtitle={`Timer: ${Math.round(durationMs / 60000)} min`} accent="indigo">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-600 font-semibold">
                          <FiCheckCircle className="text-[16px]" /> Completed today
                        </span>
                      ) : status === "running" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-emerald-700 font-semibold">
                          <FiCheckCircle className="text-[16px]" /> Running
                        </span>
                      ) : status === "paused" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-3 py-1 text-amber-600 font-semibold">
                          <FiAlertCircle className="text-[16px]" /> Paused
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 px-3 py-1 text-orange-500 font-semibold">
                          <FiAlertCircle className="text-[16px]" /> Incomplete
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <span className="px-2 py-1 rounded-lg bg-slate-100">Elapsed: {formatMMSS(elapsedMs)}</span>
                      <span className="px-2 py-1 rounded-lg bg-slate-100">Remaining: {formatMMSS(remainingMs)}</span>
                    </div>

                    {sites.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {sites.map((site, idx) => (
                          <button
                            key={`${skill.id}-${idx}`}
                            type="button"
                            className="px-3 py-2 rounded-xl bg-white text-indigo-700 text-xs font-semibold border border-indigo-100 shadow-sm hover:bg-indigo-50 inline-flex items-center gap-1"
                            onClick={() => handleSiteClick(skill, site.url)}
                          >
                            <FiExternalLink className="text-[14px]" /> {site.label || "Open"}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        className={`px-3 py-2 rounded-xl font-semibold shadow transition ${isCompleted ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-indigo-600 text-white hover:shadow-md"}`}
                        onClick={() => (isRunning ? pauseSkill(skill.id) : startSkill(skill))}
                        disabled={!!isCompleted}
                      >
                        {primaryLabel}
                      </button>
                      <button
                        className="px-3 py-2 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200 hover:bg-slate-200"
                        onClick={() => navigate("/manage-skills")}
                      >
                        Manage
                      </button>
                    </div>
                  </div>
                </DashboardCard>
              );
            })
          )}
        </div>
      </div>
    </GlobalLayout>
  );
};

export default Dashboard;
