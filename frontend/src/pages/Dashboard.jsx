import React, { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import { FiAlertCircle, FiCheckCircle, FiExternalLink } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { db } from "../firebase";
import { SKILL_SITE_DEFAULTS } from "../lib/skillDefaults";
import { apiRequestWithFallback } from "../lib/apiClient";
import { clearLiveTimerPin, openLiveTimerPinWindow, updateLiveTimerPin } from "../lib/liveTimerPin";
import { updateAttendanceRecord } from "../services/attendanceService";

const normalizeName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const CATEGORY_TO_DEFAULT_KEY = {
  learning: "learning",
  aptitude: "aptitude practice",
  "problem-solving": "problem solving",
  "problem solving": "problem solving",
  coding: "coding practice",
  communication: "communication practice",
};

const normalizeExternalUrl = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";

  const withLeadingProtocol = raw.startsWith("//") ? `https:${raw}` : raw;
  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(withLeadingProtocol)
    ? withLeadingProtocol
    : `https://${withLeadingProtocol}`;

  try {
    const parsed = new URL(withProtocol);
    if (!/^https?:$/i.test(parsed.protocol)) return "";
    return parsed.toString();
  } catch {
    return "";
  }
};

const getWebsiteTitle = (site = {}, url = "") => {
  const fallbackUrl =
    String(url || site?.url || site?.link || "").trim() ||
    normalizeExternalUrl(url || site?.url || site?.link || "");
  const fallbackTitle = fallbackUrl.replace(/^https?:\/\//i, "").replace(/\/$/, "");
  return String(site?.title || site?.label || site?.type || fallbackTitle || "Open").trim();
};

const normalizeSites = (sites = []) =>
  (Array.isArray(sites) ? sites : [])
    .map((site) => {
      const rawUrl = typeof site === "string" ? site : site?.url || site?.link || "";
      const url = normalizeExternalUrl(rawUrl);
      return {
        label: getWebsiteTitle(site, url),
        title: getWebsiteTitle(site, url),
        url,
      };
    })
    .filter((site) => Boolean(site.url));

const getSkillSites = (skillName, skillWebsites = [], skillCategory = "", websiteRef = "") => {
  const explicitSites = normalizeSites(skillWebsites);
  if (explicitSites.length) return explicitSites;

  const byName = SKILL_SITE_DEFAULTS[normalizeName(skillName)] || [];
  const normalizedByName = normalizeSites(byName);
  if (normalizedByName.length) return normalizedByName;

  const byCategoryKey = CATEGORY_TO_DEFAULT_KEY[normalizeName(skillCategory)] || "";
  const byCategory = byCategoryKey ? SKILL_SITE_DEFAULTS[byCategoryKey] || [] : [];
  const normalizedByCategory = normalizeSites(byCategory);
  if (normalizedByCategory.length) return normalizedByCategory;

  const fallbackUrl = String(websiteRef || "").trim();
  if (/^https?:\/\//i.test(fallbackUrl)) {
    return [{ label: getWebsiteTitle({}, fallbackUrl), title: getWebsiteTitle({}, fallbackUrl), url: fallbackUrl }];
  }

  return [];
};

const getDurationMs = (skill) => (Number(skill?.defaultDuration) || 30) * 60 * 1000;

const TIMERS_KEY = "skillTimers:v1";
const COMM_SESSION_STATE_KEY = "commSessionState:v1";
const COMM_SESSION_COMPLETED_KEY = "commSessionCompleted:v1";
const DASHBOARD_CACHE_KEY = "dashboard:skills-cache:v1";
const DASHBOARD_CACHE_TTL_MS = 45000;

const isLikelyIdLabel = (value = "") => {
  const normalized = String(value || "").trim();
  if (!normalized) return true;
  if (/^[a-f0-9]{24,}$/i.test(normalized)) return true;
  if (/^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(normalized)) return true;
  return false;
};

const pickSkillTitle = (course = {}) => {
  const options = [course.title, course.course_name, course.skillName, course.skillTitle, course.name, course.courseTitle]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  const bestTitle = options.find((value) => !isLikelyIdLabel(value));
  return bestTitle || "Allocated Skill";
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
  const targetUrl = normalizeExternalUrl(url);
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

const loadCommunicationSessionState = () => {
  try {
    const raw = sessionStorage.getItem(COMM_SESSION_STATE_KEY);
    const completionRaw = sessionStorage.getItem(COMM_SESSION_COMPLETED_KEY);
    if (!raw) {
      if (!completionRaw) return null;
      const completion = JSON.parse(completionRaw);
      const completionDate = String(completion?.date || "").trim();
      const today = new Date().toISOString().split("T")[0];
      if (completionDate !== today) return null;
      const durationMinutes = Math.max(1, Number(completion?.durationMinutes || 5) || 5);
      const remainingTime = Number.isFinite(Number(completion?.remainingTime)) ? Math.max(0, Math.round(Number(completion.remainingTime))) : 0;
      const status = String(completion?.status || (remainingTime <= 0 ? "completed" : "stopped")).toLowerCase();
      return {
        taskName: completion?.taskName || completion?.skillName || "Communication Practice",
        skillName: completion?.skillName || completion?.taskName || "Communication Practice",
        activityName: completion?.taskName || completion?.skillName || "Communication Practice",
        durationMinutes,
        remainingTime,
        status,
      };
    }
    const parsed = JSON.parse(raw);
    const remaining = Number(parsed?.remainingTime);
    if (!Number.isFinite(remaining)) return null;
    return {
      ...parsed,
      remainingTime: Math.max(0, Math.round(remaining)),
      status: String(parsed?.status || (remaining <= 0 ? "completed" : parsed?.isManualPaused ? "paused" : "running")).toLowerCase(),
    };
  } catch {
    return null;
  }
};

const loadCommunicationSessionInfo = () => {
  try {
    const raw = sessionStorage.getItem("commSessionInfo");
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const readCommunicationCompletion = () => {
  try {
    const raw = sessionStorage.getItem(COMM_SESSION_COMPLETED_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const toEpochMs = (value) => {
  if (!value) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value?.toDate === "function") {
    const dt = value.toDate();
    return Number.isFinite(dt?.getTime?.()) ? dt.getTime() : 0;
  }
  const ts = Date.parse(String(value));
  return Number.isNaN(ts) ? 0 : ts;
};

const isSkillCompletedToday = ({ completedMap = {}, skillName = "", durationMinutes = 0, updatedAt = "" }) => {
  const key = normalizeName(skillName);
  const direct = completedMap?.[key];
  const fallback = key.includes("communication") ? completedMap?.__communication : null;
  const record = direct || fallback;

  if (!record) return false;
  if (record === true) return true;

  const requiredMinutes = Math.max(1, Number(durationMinutes) || 1);
  const completedMinutes = Math.max(0, Number(record?.durationMinutes || 0));
  if (completedMinutes + 0.001 < requiredMinutes) return false;

  const updatedAtMs = toEpochMs(updatedAt);
  const completedAtMs = toEpochMs(record?.completedAtMs);
  if (updatedAtMs > 0 && completedAtMs > 0 && completedAtMs < updatedAtMs) return false;

  return true;
};

const normalizeAllocationStatus = (value = "") => {
  const status = String(value || "").trim().toLowerCase();
  if (!status) return "active";
  if (status === "assigned") return "active";
  return status;
};

const mapAllocatedCourseToSkill = (course = {}, index = 0) => ({
  id: `allocated-${course.allocationId || course.id || index}`,
  skillName: pickSkillTitle(course),
  defaultDuration: Math.max(1, Number(course.defaultDuration || 30) || 30),
  skillWebsites: Array.isArray(course.links)
    ? course.links
        .map((link) => ({
          label: String(link?.type || link?.label || "Resource").trim(),
          url: normalizeExternalUrl(link?.url || ""),
        }))
        .filter((link) => link.url)
    : [],
  skillCategory: String(course.category || course.customCategory || "").trim(),
  websiteRef: String(course.websiteRef || "").trim(),
  addedBy: "admin",
  allocationStatus: normalizeAllocationStatus(course.status),
  startDate: course.startDate || "",
  endDate: course.endDate || "",
  updatedAt: course.updatedAt || course.assignedAt || course.startDate || "",
});

const dedupeSkillsByName = (items = []) => {
  const map = new Map();
  (items || []).forEach((skill, index) => {
    const key = normalizeName(skill?.skillName || skill?.title || skill?.name || `skill-${index}`);
    if (!key) return;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, skill);
      return;
    }

    if (String(existing?.addedBy || "").toLowerCase() !== "admin" && String(skill?.addedBy || "").toLowerCase() === "admin") {
      map.set(key, skill);
      return;
    }

    const existingTs = Number(new Date(existing?.updatedAt || existing?.createdAt || 0));
    const nextTs = Number(new Date(skill?.updatedAt || skill?.createdAt || 0));
    if (nextTs >= existingTs) {
      map.set(key, skill);
    }
  });
  return Array.from(map.values());
};

const readDashboardCache = (uid = "") => {
  try {
    const raw = sessionStorage.getItem(DASHBOARD_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > DASHBOARD_CACHE_TTL_MS) return null;
    if (uid && String(parsed?.uid || "") !== String(uid)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeDashboardCache = (uid = "", payload = {}) => {
  try {
    sessionStorage.setItem(
      DASHBOARD_CACHE_KEY,
      JSON.stringify({
        uid,
        ts: Date.now(),
        apiSkills: Array.isArray(payload.apiSkills) ? payload.apiSkills : [],
        completedToday: payload.completedToday && typeof payload.completedToday === "object" ? payload.completedToday : {},
      })
    );
  } catch {
    // ignore cache write failures
  }
};

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

const Dashboard = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { skills } = useSkills();
  const [apiSkills, setApiSkills] = useState([]);
  const [apiSkillsLoading, setApiSkillsLoading] = useState(false);
  const [completedToday, setCompletedToday] = useState({});
  const [skillTimers, setSkillTimers] = useState(() => loadSkillTimers()); // { [skillId]: { status, elapsedMs, durationMs, startedAt?, skillName, skillId } }
  const [currentRunningId, setCurrentRunningId] = useState(null);
  const [banner, setBanner] = useState("");
  const [error, setError] = useState("");
  const [commSessionState, setCommSessionState] = useState(() => loadCommunicationSessionState());
  const timerRef = useRef(null);
  const runningRef = useRef(null);
  const cacheReadyRef = useRef(false);
  const lastCommCompletionRef = useRef("");

  const refreshCommSessionState = useCallback(() => {
    setCommSessionState(loadCommunicationSessionState());
  }, []);

  const stopTick = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const loadStudentSkills = useCallback(async () => {
    if (!user) return;
    setApiSkillsLoading(true);
    try {
      const headers = {
        "Content-Type": "application/json",
        "x-student-session": JSON.stringify({ uid: user.uid, email: user.email || "", role: "student" }),
      };
      const token = await getQuickToken(user);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      const [skillsRes, coursesRes] = await Promise.all([
        apiRequestWithFallback("/api/student/skills", { headers }),
        apiRequestWithFallback("/student/courses", { headers }).catch(() => ({ items: [], allocatedCourses: [] })),
      ]);

      const normalizedSkills = (skillsRes?.items || []).map((item, idx) => normalizeApiSkill(item, idx));

      const allocatedCourses = Array.isArray(coursesRes?.allocatedCourses)
        ? coursesRes.allocatedCourses
        : (Array.isArray(coursesRes?.items) ? coursesRes.items : []).filter((item) => {
            const source = String(item?.source || "admin").toLowerCase();
            const status = String(item?.status || "active").toLowerCase();
            return source !== "student" && status !== "registered";
          });

      const allocatedSkills = allocatedCourses.map((course, idx) => mapAllocatedCourseToSkill(course, idx));
      const normalized = dedupeSkillsByName([...allocatedSkills, ...normalizedSkills]);

      setApiSkills(normalized);
      setError("");
    } catch (err) {
      setApiSkills([]);
    } finally {
      setApiSkillsLoading(false);
    }
  }, [user]);

  const fallbackSkills = Array.isArray(skills) ? dedupeSkillsByName(skills) : [];
  const safeSkills = apiSkills.length > 0 ? apiSkills : fallbackSkills;

  const loadCompletions = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(collection(db, "users", user.uid, "activityHistory"), where("date", "==", today));
      const snap = await getDocs(q);
      const map = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data();
        const skillKey = normalizeName(data?.skillName || data?.taskName || "");
        if (!skillKey) return;

        const nextRecord = {
          durationMinutes: Math.max(0, Number(data?.duration || 0)),
          completedAtMs: toEpochMs(data?.createdAt || data?.updatedAt || data?.at || Date.now()),
        };

        const prev = map[skillKey];
        if (!prev || toEpochMs(prev?.completedAtMs) <= nextRecord.completedAtMs) {
          map[skillKey] = nextRecord;
        }

        if (skillKey.includes("communication")) {
          const prevComm = map.__communication;
          if (!prevComm || toEpochMs(prevComm?.completedAtMs) <= nextRecord.completedAtMs) {
            map.__communication = nextRecord;
          }
        }
      });
      setCompletedToday(map);
    } catch (err) {
      console.error("Failed to load task completions", err);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let mounted = true;
    cacheReadyRef.current = false;

    const cached = readDashboardCache(user.uid);
    if (cached?.apiSkills?.length) {
      setApiSkills(cached.apiSkills);
    }
    if (cached?.completedToday && Object.keys(cached.completedToday).length) {
      setCompletedToday(cached.completedToday);
    }

    const hydrate = async () => {
      try {
        loadCompletions().catch(() => {});
        await loadStudentSkills();
        if (mounted) setError("");
      } catch (err) {
        console.error("Dashboard hydrate failed", err);
        if (mounted) setError("We could not load your dashboard data. Please retry.");
      } finally {
        if (mounted) {
          cacheReadyRef.current = true;
        }
      }
    };
    hydrate();
    return () => {
      mounted = false;
    };
  }, [user, loadCompletions, loadStudentSkills]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!cacheReadyRef.current) return;
    writeDashboardCache(user.uid, { apiSkills, completedToday });
  }, [apiSkills, completedToday, user?.uid]);

  useEffect(() => {
    refreshCommSessionState();
    const handleFocus = () => refreshCommSessionState();
    const handleVisibility = () => {
      if (!document.hidden) refreshCommSessionState();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [refreshCommSessionState]);

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
    const completion = readCommunicationCompletion();
    if (!completion) return;
    const today = new Date().toISOString().split("T")[0];
    if (String(completion?.date || "") === today) {
      const completionKey = `${String(completion?.date || "")}::${String(completion?.taskName || completion?.skillName || "") }::${String(completion?.at || "")}`;
      if (lastCommCompletionRef.current === completionKey) return;
      lastCommCompletionRef.current = completionKey;
      const key = normalizeName(completion?.skillName || completion?.taskName || "Communication Practice");
      const nextRecord = {
        durationMinutes: Math.max(0, Number(completion?.durationMinutes || 0)),
        completedAtMs: toEpochMs(completion?.at || Date.now()),
      };
      const isCompletionFinished = String(completion?.status || "").toLowerCase() === "completed" || Math.max(0, Number(completion?.remainingTime || 0)) <= 0;
      if (isCompletionFinished) {
        setCompletedToday((prev) => ({
          ...prev,
          ...(key ? { [key]: nextRecord } : {}),
          __communication: nextRecord,
        }));
        setBanner(`Communication session completed: ${completion?.taskName || "Communication Practice"}`);
      } else {
        setCommSessionState(loadCommunicationSessionState());
        setBanner(`Communication session ${String(completion?.status || "stopped")}: ${completion?.taskName || "Communication Practice"}`);
      }
    }
  }, []);

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
        const elapsedMs = Math.min(Date.now() - (entry.startedAt || Date.now()), entry.durationMs);
        return { ...prev, [runningId]: { ...entry, elapsedMs } };
      });
    }, 1000);
    return () => stopTick();
  }, []);

  useEffect(() => {
    const runningEntry = Object.values(skillTimers || {}).find((entry) => entry?.status === "running" && entry?.skillId);
    if (runningEntry?.skillId) {
      runningRef.current = runningEntry.skillId;
      if (currentRunningId !== runningEntry.skillId) {
        setCurrentRunningId(runningEntry.skillId);
      }
      return;
    }

    runningRef.current = null;
    if (currentRunningId !== null) {
      setCurrentRunningId(null);
    }
  }, [skillTimers, currentRunningId]);

  useEffect(() => {
    if (!completedToday || Object.keys(completedToday).length === 0) return;
    setSkillTimers((prev) => {
      const next = { ...prev };
      Object.values(prev).forEach((entry) => {
        const done = isSkillCompletedToday({
          completedMap: completedToday,
          skillName: entry.skillName,
          durationMinutes: (entry.durationMs || 0) / 60000,
        });
        if (done) {
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
        const defaultStatus = isSkillCompletedToday({
          completedMap: completedToday,
          skillName: skill.skillName,
          durationMinutes: durationMs / 60000,
          updatedAt: skill.updatedAt || skill.createdAt || "",
        })
          ? "completed"
          : "idle";
        const base = existing || { status: defaultStatus, elapsedMs: 0 };
        const elapsedMs = base.status === "completed" ? durationMs : Math.min(base.elapsedMs || 0, durationMs);
        next[skill.id] = {
          ...base,
          skillId: skill.id,
          skillName: skill.skillName,
          durationMs,
          elapsedMs,
          status: base.status || defaultStatus,
          startedAt: base.startedAt || null,
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
      const elapsedMs = entry.status === "running" ? Math.min(Date.now() - (entry.startedAt || Date.now()), entry.durationMs) : entry.elapsedMs || 0;
      return { ...prev, [skillId]: { ...entry, status: "paused", elapsedMs, startedAt: null } };
    });
    if (currentRunningId === skillId) {
      setCurrentRunningId(null);
      runningRef.current = null;
    }
  };

  const finalizeCompletion = useCallback(async (entry) => {
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
      setCompletedToday((prev) => {
        const nextRecord = {
          durationMinutes: Math.max(0, Number(entry?.durationMs || 0) / 60000),
          completedAtMs: Date.now(),
        };
        const isCommunication = normalizeName(entry.skillName).includes("communication");
        return {
          ...prev,
          [normalizeName(entry.skillName)]: nextRecord,
          ...(isCommunication ? { __communication: nextRecord } : {}),
        };
      });
      updateAttendanceRecord(user.uid, safeSkills).catch(() => {});
    } catch (err) {
      console.error("Failed to save skill completion", err);
    }
  }, [safeSkills, user]);

  useEffect(() => {
    const runningId = currentRunningId;
    if (!runningId) return;
    const entry = skillTimers[runningId];
    if (entry && entry.status === "running" && entry.elapsedMs >= entry.durationMs) {
      finalizeCompletion(entry);
    }
  }, [skillTimers, currentRunningId, finalizeCompletion]);

  const createCommunicationPayload = (skill) => ({
    taskName: skill?.skillName || "Communication Practice",
    skillName: skill?.skillName || "Communication Practice",
    activityName: skill?.skillName || "Communication Practice",
    durationMinutes: Math.round(skill?.defaultDuration || 5),
    category: "Communication",
    autoStart: true,
    resumeSession: false,
    sessionInstanceId: String(Date.now()),
    skillsSnapshot: (safeSkills || [])
      .map((item) => ({ id: item?.id, skillName: String(item?.skillName || "").trim() }))
      .filter((item) => item.skillName),
  });

  const resumeCommunicationSession = () => {
    const sessionInfo = loadCommunicationSessionInfo();
    const resumedRemainingTime = Number.isFinite(Number(commSessionState?.remainingTime))
      ? Number(commSessionState.remainingTime)
      : Number.isFinite(Number(sessionInfo?.remainingTime))
        ? Number(sessionInfo.remainingTime)
        : null;
    const resumedStatus = String(commSessionState?.status || sessionInfo?.status || (commSessionState?.isManualPaused || sessionInfo?.isManualPaused ? "paused" : "running")).toLowerCase();
    const nextPayload = {
      taskName: sessionInfo?.taskName || commSessionState?.taskName || "Communication Practice",
      skillName: sessionInfo?.skillName || commSessionState?.skillName || sessionInfo?.taskName || "Communication Practice",
      activityName: sessionInfo?.activityName || sessionInfo?.taskName || "Communication Practice",
      durationMinutes: Number(sessionInfo?.durationMinutes || commSessionState?.durationMinutes || 5) || 5,
      ...(resumedRemainingTime === null ? {} : { remainingTime: resumedRemainingTime }),
      isManualPaused: Boolean(commSessionState?.isManualPaused || sessionInfo?.isManualPaused),
      status: resumedStatus,
      category: "Communication",
      autoStart: true,
      resumeSession: true,
      sessionInstanceId: String(sessionInfo?.sessionInstanceId || commSessionState?.sessionInstanceId || ""),
      skillsSnapshot: Array.isArray(sessionInfo?.skillsSnapshot)
        ? sessionInfo.skillsSnapshot
        : (safeSkills || [])
            .map((item) => ({ id: item?.id, skillName: String(item?.skillName || "").trim() }))
            .filter((item) => item.skillName),
    };
    sessionStorage.setItem("commSessionInfo", JSON.stringify(nextPayload));
    navigate("/communication-session", { state: nextPayload });
  };

  const clearCommunicationTimer = () => {
    sessionStorage.removeItem(COMM_SESSION_STATE_KEY);
    sessionStorage.removeItem("commSessionInfo");
    sessionStorage.removeItem(COMM_SESSION_COMPLETED_KEY);
    setCommSessionState(null);
  };

  const startSkill = (skill) => {
    if (!skill) return;
    const isCommunication = skill.skillName?.toLowerCase().includes("communication");
    if (isCommunication) {
      const payload = createCommunicationPayload(skill);
      sessionStorage.removeItem(COMM_SESSION_STATE_KEY);
      sessionStorage.removeItem(COMM_SESSION_COMPLETED_KEY);
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
      const payload = createCommunicationPayload(skill);
      sessionStorage.removeItem(COMM_SESSION_STATE_KEY);
      sessionStorage.removeItem(COMM_SESSION_COMPLETED_KEY);
      sessionStorage.setItem("commSessionInfo", JSON.stringify(payload));
      navigate("/communication-session", { state: payload });
      return;
    }
    openLiveTimerPinWindow();
    if (url) openPracticeWindow(url);
    startSkill(skill);
  };

  const isLoading = apiSkillsLoading && safeSkills.length === 0;

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
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Skill Study Tracker</h1>
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
              const owner = String(skill?.addedBy || skill?.source || "student").toLowerCase();
              const isAdminAllotted = owner === "admin" || owner === "main_admin" || owner === "sub_admin" || owner === "allocated";
              const isCommunicationSkill = normalizeName(skill.skillName).includes("communication");
              const cardCommSession = isCommunicationSkill && commSessionState ? commSessionState : null;
              const sites = getSkillSites(skill.skillName, skill.skillWebsites, skill.skillCategory, skill.websiteRef);
              const timer = skillTimers[skill.id] || {};
              const baseDurationMs = timer.durationMs || getDurationMs(skill);
              const commDurationMs = cardCommSession
                ? Math.max(1, Number(cardCommSession.durationMinutes || Math.round(baseDurationMs / 60000) || 1)) * 60 * 1000
                : baseDurationMs;
              const durationMs = commDurationMs;
              const elapsedMs = cardCommSession
                ? Math.max(durationMs - cardCommSession.remainingTime * 1000, 0)
                : (timer.elapsedMs || 0);
              const remainingMs = cardCommSession
                ? Math.max(cardCommSession.remainingTime * 1000, 0)
                : Math.max(durationMs - elapsedMs, 0);
              const doneToday = isSkillCompletedToday({
                completedMap: completedToday,
                skillName: skill.skillName,
                durationMinutes: durationMs / 60000,
                updatedAt: skill.updatedAt || skill.createdAt || "",
              });
              const status = cardCommSession
                ? String(cardCommSession.status || (cardCommSession.isManualPaused ? "paused" : "running")).toLowerCase()
                : (timer.status || (doneToday ? "completed" : "idle"));
              const isRunning = status === "running";
              const isFinishedSession = cardCommSession && status === "stopped" && remainingMs <= 0;
              const isCompleted = status === "completed" || isFinishedSession || doneToday;
              const primaryLabel = isCompleted ? "Completed" : isRunning ? "Pause" : status === "paused" ? "Resume" : status === "stopped" ? "Review" : "Start";
              return (
                <DashboardCard key={skill.id} title={skill.skillName || "Untitled skill"} subtitle={`Timer: ${Math.round(durationMs / 60000)} min`} accent="indigo">
                  <div className="space-y-3">
                    {isAdminAllotted && (
                      <div className="flex items-center gap-2 text-xs">
                        <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 font-semibold text-rose-700">
                          Compulsory (Admin Allotted)
                        </span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 text-sm">
                      {isCompleted ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-3 py-1 text-emerald-600 font-semibold">
                          <FiCheckCircle className="text-[16px]" /> Completed today
                        </span>
                      ) : cardCommSession ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-3 py-1 text-indigo-700 font-semibold">
                          <FiAlertCircle className="text-[16px]" /> {status === "running" ? "Running (fullscreen)" : status === "stopped" && remainingMs <= 0 ? "Completed" : status === "stopped" ? "Stopped" : "Paused (fullscreen)"}
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
                            <FiExternalLink className="text-[14px]" /> {site.title || site.label || "Open"}
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center gap-3">
                      <button
                        className={`px-3 py-2 rounded-xl font-semibold shadow transition ${isCompleted ? "bg-slate-200 text-slate-500 cursor-not-allowed" : "bg-indigo-600 text-white hover:shadow-md"}`}
                        onClick={() => {
                          if (isCompleted) return;
                          if (cardCommSession) {
                            resumeCommunicationSession();
                            return;
                          }
                          if (isRunning) {
                            pauseSkill(skill.id);
                            return;
                          }
                          startSkill(skill);
                        }}
                        disabled={!!isCompleted}
                      >
                        {isCompleted ? "Completed" : cardCommSession ? "Resume" : primaryLabel}
                      </button>
                      {cardCommSession && (
                        <button
                          className="px-3 py-2 rounded-xl bg-white text-slate-700 text-xs font-semibold border border-slate-200 hover:bg-slate-100"
                          onClick={clearCommunicationTimer}
                        >
                          Clear
                        </button>
                      )}
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
