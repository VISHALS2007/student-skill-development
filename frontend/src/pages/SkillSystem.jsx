import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { useSkills } from "../lib/SkillsContext";
import { db } from "../firebase";
import { DEFAULT_SKILLS, SKILL_SITE_DEFAULTS } from "../lib/skillDefaults";
import { apiRequestWithFallback } from "../lib/apiClient";
import { clearLiveTimerPin, openLiveTimerPinWindow, updateLiveTimerPin } from "../lib/liveTimerPin";
import { updateAttendanceRecord } from "../services/attendanceService";
import { toast, ToastContainer } from "react-toastify";

const requestWithFallback = (path, options = {}, timeoutMs = 8000) =>
  apiRequestWithFallback(path, options, {
    timeoutMs,
    networkErrorMessage: "Cannot connect to backend server. Start backend: cd server ; npm run dev",
  });

const SKILL_SYSTEM_CACHE_KEY = "skill-system:cache:v1";
const SKILL_SYSTEM_CACHE_TTL_MS = 60000;

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

const readSkillSystemCache = (uid = "") => {
  try {
    const raw = sessionStorage.getItem(SKILL_SYSTEM_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > SKILL_SYSTEM_CACHE_TTL_MS) return null;
    if (uid && String(parsed?.uid || "") !== String(uid)) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeSkillSystemCache = (uid = "", payload = {}) => {
  try {
    sessionStorage.setItem(
      SKILL_SYSTEM_CACHE_KEY,
      JSON.stringify({
        uid,
        ts: Date.now(),
        apiSkills: Array.isArray(payload.apiSkills) ? payload.apiSkills : [],
        progress: payload.progress && typeof payload.progress === "object" ? payload.progress : { totalMinutes: 0, totalActivities: 0, bySkill: {} },
        activityCompletions:
          payload.activityCompletions && typeof payload.activityCompletions === "object" ? payload.activityCompletions : {},
      })
    );
  } catch {
    // ignore cache write failures
  }
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


const SkillSystem = () => {
  const { user } = useAuth();
  const { skills, fetchSkills } = useSkills();
  const navigate = useNavigate();
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [skillForm, setSkillForm] = useState({ name: "", duration: 30, websites: [], extraWebsites: [{ title: "", url: "" }] });
  const [activityForm, setActivityForm] = useState({ name: "", duration: 10, platform: "", platformUrl: "" });
  const [editingSkillId, setEditingSkillId] = useState(null);
  const [editingActivityId, setEditingActivityId] = useState(null);
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTimer, setActiveTimer] = useState(null); // { activityId, activityName, skillName, durationMs, startedAt, durationMinutes }
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef(null);
  const [progress, setProgress] = useState({ totalMinutes: 0, totalActivities: 0, bySkill: {} });
  const [activityCompletions, setActivityCompletions] = useState({});
  const [skillSuggestionsOpen, setSkillSuggestionsOpen] = useState(false);
  const [skillError, setSkillError] = useState("");
  const [banner, setBanner] = useState({ type: "", message: "" });
  const [apiSkills, setApiSkills] = useState([]);
  const [allocatedCourses, setAllocatedCourses] = useState([]);
  const [allocatedCourseTitleKeys, setAllocatedCourseTitleKeys] = useState([]);
  const [loadingApiSkills, setLoadingApiSkills] = useState(false);
  const cacheReadyRef = useRef(false);

  const notify = (type, message) => {
    setBanner({ type, message });
    if (!message) return;
    const opts = { containerId: "global-toasts" };
    if (type === "success") toast.success(message, { autoClose: 2000, ...opts });
    else toast.error(message, { autoClose: 2500, ...opts });
  };

  const normalizeName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const normalizeWebsiteEntry = (site = "") => {
    if (typeof site === "string") {
      const url = normalizeExternalUrl(site);
      return {
        title: url.replace(/^https?:\/\//i, "").replace(/\/$/, ""),
        url,
      };
    }

    const url = normalizeExternalUrl(site?.url || "");
    const fallbackTitle = url.replace(/^https?:\/\//i, "").replace(/\/$/, "");
    const title = String(site?.title || site?.label || site?.type || fallbackTitle || "").trim();

    return {
      title: title || fallbackTitle,
      url,
    };
  };

  const getSkillWebsites = (skillName, explicitSites = []) => {
    if (explicitSites && explicitSites.length) return explicitSites;
    const key = normalizeName(skillName);
    return SKILL_SITE_DEFAULTS[key] || [];
  };

  const dedupeSkillItems = (items = []) => {
    const dedup = new Map();
    (Array.isArray(items) ? items : []).forEach((item, index) => {
      const key = normalizeName(item?.title || item?.skillName || item?.name || `skill-${index}`);
      if (!key) return;

      const existing = dedup.get(key);
      if (!existing) {
        dedup.set(key, item);
        return;
      }

      const existingAddedBy = String(existing?.addedBy || existing?.source || "student").toLowerCase();
      const nextAddedBy = String(item?.addedBy || item?.source || "student").toLowerCase();
      if (existingAddedBy !== "admin" && nextAddedBy === "admin") {
        dedup.set(key, item);
        return;
      }

      const existingTs = Number(new Date(existing?.updatedAt || existing?.createdAt || 0));
      const nextTs = Number(new Date(item?.updatedAt || item?.createdAt || 0));
      if (nextTs >= existingTs) {
        dedup.set(key, item);
      }
    });

    return Array.from(dedup.values());
  };

  const ADMIN_ALLOCATED_SOURCES = new Set(["admin", "main_admin", "sub_admin", "allocated"]);

  const isAdminAllocatedSkill = (skill = {}) =>
    ADMIN_ALLOCATED_SOURCES.has(String(skill?.addedBy || skill?.source || "").toLowerCase());

  const getAuthHeaders = async () => {
    const headers = {
      "Content-Type": "application/json",
      "x-student-session": JSON.stringify({ uid: user?.uid || "", email: user?.email || "", role: "student" }),
    };

    const token = await getQuickToken(user);
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }

    return headers;
  };

  const loadStudentSkills = async () => {
    if (!user) return;
    setLoadingApiSkills(true);
    try {
      const headers = await getAuthHeaders();
      const [skillsData, coursesData] = await Promise.all([
        requestWithFallback("/api/student/skills", { headers }),
        requestWithFallback("/student/courses", { headers }).catch(() => ({ items: [], allocatedCourses: [] })),
      ]);

      const items = (skillsData.items || []).map((item) => ({
        ...item,
        defaultDuration: Number(item?.defaultDuration) || 30,
        skillWebsites: Array.isArray(item?.skillWebsites) ? item.skillWebsites : [],
      }));
      setApiSkills(dedupeSkillItems(items));

      const allocatedCourses = Array.isArray(coursesData?.allocatedCourses)
        ? coursesData.allocatedCourses
        : (Array.isArray(coursesData?.items) ? coursesData.items : []).filter((item) => {
            const source = String(item?.source || "admin").toLowerCase();
            const status = String(item?.status || "active").toLowerCase();
            return source !== "student" && status !== "registered";
          });

      setAllocatedCourses(Array.isArray(allocatedCourses) ? allocatedCourses : []);

      const titleKeys = allocatedCourses
        .map((course) =>
          normalizeName(
            course?.title ||
              course?.course_name ||
              course?.skillName ||
              course?.skillTitle ||
              course?.name ||
              course?.courseTitle ||
              ""
          )
        )
        .filter(Boolean);
      setAllocatedCourseTitleKeys(Array.from(new Set(titleKeys)));
    } catch (err) {
      console.error("Failed to load student skills", err);
      setApiSkills([]);
      setAllocatedCourses([]);
      setAllocatedCourseTitleKeys([]);
    } finally {
      setLoadingApiSkills(false);
    }
  };

  const allocatedSkills = useMemo(() => {
    const dedup = new Map();
    (Array.isArray(allocatedCourses) ? allocatedCourses : []).forEach((course, index) => {
      const title = String(
        course?.title ||
          course?.course_name ||
          course?.skillName ||
          course?.skillTitle ||
          course?.name ||
          course?.courseTitle ||
          ""
      ).trim();
      if (!title) return;
      const key = normalizeName(title) || `allocated-${index}`;
      if (!dedup.has(key)) {
        dedup.set(key, { id: String(course?.id || course?.allocationId || `allocated-${index}`), title });
      }
    });
    return Array.from(dedup.values());
  }, [allocatedCourses]);

  const allocatedCourseSkills = useMemo(
    () =>
      (Array.isArray(allocatedCourses) ? allocatedCourses : []).map((course, index) => {
        const title = String(
          course?.title ||
            course?.course_name ||
            course?.skillName ||
            course?.skillTitle ||
            course?.name ||
            course?.courseTitle ||
            ""
        ).trim();

        return {
          id: String(course?.id || course?.allocationId || `allocated-course-${index}`),
          title,
          skillName: title,
          defaultDuration: Math.max(1, Number(course?.defaultDuration || 30) || 30),
          skillWebsites: Array.isArray(course?.links)
            ? course.links
                .map((link) => ({
                  label: String(link?.type || link?.label || "Resource").trim(),
                  url: String(link?.url || "").trim(),
                }))
                .filter((link) => link.url)
            : [],
          skillCategory: String(course?.category || course?.customCategory || "").trim(),
          websiteRef: String(course?.websiteRef || "").trim(),
          addedBy: "admin",
          source: "admin",
          allocationStatus: String(course?.status || "").trim(),
          updatedAt: course?.updatedAt || course?.assignedAt || course?.startDate || "",
        };
      }),
    [allocatedCourses]
  );

  const mySkills = useMemo(
    () => dedupeSkillItems([...allocatedCourseSkills, ...apiSkills]),
    [allocatedCourseSkills, apiSkills]
  );

  const normalizedExisting = useMemo(() => {
    const map = new Map();
    apiSkills.forEach((s) => {
      const key = normalizeName(s.title || s.skillName);
      if (!key) return;
      const existingIds = map.get(key) || [];
      existingIds.push(String(s.id));
      map.set(key, existingIds);
    });
    allocatedCourseTitleKeys.forEach((key, idx) => {
      if (!key) return;
      const existingIds = map.get(key) || [];
      existingIds.push(`allocated-course-${idx}`);
      map.set(key, existingIds);
    });
    return map;
  }, [apiSkills, allocatedCourseTitleKeys]);

  const suggestedSkillNames = useMemo(() => {
    const names = new Set();
    DEFAULT_SKILLS.forEach((s) => names.add(s.name));
    Object.keys(SKILL_SITE_DEFAULTS).forEach((k) => names.add(k.replace(/\b\w/g, (c) => c.toUpperCase())));
    return Array.from(names);
  }, []);

  const filteredSkillSuggestions = useMemo(() => {
    const search = skillForm.name.trim().toLowerCase();
    const visible = suggestedSkillNames.filter((name) => {
      if (!search) return true;
      return name.toLowerCase().includes(search);
    });

    visible.sort((a, b) => {
      if (!search) return a.localeCompare(b);
      const aStarts = a.toLowerCase().startsWith(search);
      const bStarts = b.toLowerCase().startsWith(search);
      if (aStarts !== bStarts) return aStarts ? -1 : 1;
      return a.localeCompare(b);
    });

    return visible;
  }, [skillForm.name, suggestedSkillNames]);

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const ensureDefaults = async () => {
    if (!user) return;
    try {
      const seedKey = `defaultsSeeded:${user.uid}`;
      const alreadySeeded = localStorage.getItem(seedKey) === "1";
      const q = query(collection(db, "users", user.uid, "skills"));
      const snap = await getDocs(q);
      if (alreadySeeded || !snap.empty) {
        localStorage.setItem(seedKey, "1");
        return;
      }
      const addSkill = async (skill) => {
        const ref = await addDoc(collection(db, "users", user.uid, "skills"), {
          userId: user.uid,
          skillName: skill.name,
          defaultDuration: skill.defaultDuration || 30,
          skillWebsites: skill.websites || [],
          createdAt: serverTimestamp(),
        });
        const activityAdds = skill.activities.map((activity) =>
          addDoc(collection(db, "users", user.uid, "activities"), {
            userId: user.uid,
            skillId: ref.id,
            skillName: skill.name,
            activityName: activity,
            defaultDuration: 10,
            createdAt: serverTimestamp(),
          })
        );
        await Promise.all(activityAdds);
      };
      for (const skill of DEFAULT_SKILLS) {
        await addSkill(skill);
      }
      localStorage.setItem(seedKey, "1");
      await fetchSkills(true);
    } catch (err) {
      console.error("Failed to ensure default skills", err);
    }
  };

  const loadActivities = async (skillId) => {
    if (!user || !skillId) return;
    setLoadingActivities(true);
    try {
      const q = query(
        collection(db, "users", user.uid, "activities"),
        where("skillId", "==", skillId),
        orderBy("createdAt", "desc")
      );
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setActivities(list);
    } catch (err) {
      console.error("Failed to load activities", err);
    } finally {
      setLoadingActivities(false);
    }
  };

  const loadTodayHistory = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(collection(db, "users", user.uid, "activityHistory"), where("date", "==", today));
      const snap = await getDocs(q);
      let totalMinutes = 0;
      let totalActivities = 0;
      const bySkill = {};
      const completionsMap = {};
      snap.forEach((d) => {
        const data = d.data();
        const mins = Number(data?.duration) || 0;
        totalMinutes += mins;
        totalActivities += 1;
        if (data?.skillName) {
          bySkill[data.skillName] = (bySkill[data.skillName] || 0) + mins;
        }
        if (data?.skillName && data?.activityName) {
          completionsMap[`${data.skillName}__${data.activityName}`] = true;
        }
      });
      setProgress({ totalMinutes, totalActivities, bySkill });
      setActivityCompletions(completionsMap);
    } catch (err) {
      console.error("Failed to load activity history", err);
    }
  };

  const resetSkillForm = (closeDropdown = true) => {
    setSkillForm({ name: "", duration: 30, websites: [], extraWebsites: [{ title: "", url: "" }] });
    setEditingSkillId(null);
    setSkillError("");
    if (closeDropdown) {
      setSkillSuggestionsOpen(false);
    }
  };

  const saveSkill = async (e) => {
    e.preventDefault();
    if (!user) return;
    const skillName = skillForm.name.trim();
    if (!skillName) {
      setSkillError("Course name is required");
      return;
    }
    setSaving(true);
    const normalizedName = normalizeName(skillName);
    const existingIds = normalizedExisting.get(normalizedName) || [];
    const editingId = String(editingSkillId || "");

    if (!editingSkillId && existingIds.length > 0) {
      setSkillError("Duplicate course is not allowed. Update or delete the existing course.");
      setSaving(false);
      return;
    }

    const hasAnotherWithSameName = existingIds.some((id) => id !== editingId);
    if (editingSkillId && hasAnotherWithSameName) {
      setSkillError("Duplicate course is not allowed. Update or delete the existing course.");
      setSaving(false);
      return;
    }
    setSkillError("");
    const defaultSites = getSkillWebsites(skillName, skillForm.websites);
    const cleanedExtras = (skillForm.extraWebsites || [])
      .map((site) => normalizeWebsiteEntry(site))
      .filter((site) => site.url.length > 0);
    const cleanedSites = (defaultSites || [])
      .map((site) => {
        const normalized = normalizeWebsiteEntry(site);
        return {
          label: normalized.title,
          title: normalized.title,
          url: normalized.url,
        };
      })
      .filter((site) => site.label || site.url)
      .concat(
        cleanedExtras.map((site) => ({
          label: site.title,
          title: site.title,
          url: site.url,
        }))
      );
    try {
      if (editingSkillId) {
        const headers = await getAuthHeaders();
        await requestWithFallback(`/api/student/skills/${editingSkillId}`, {
          method: "PUT",
          headers,
          body: JSON.stringify({
            title: skillName,
            description: "",
            defaultDuration: Number(skillForm.duration) || 30,
            skillWebsites: cleanedSites,
          }),
        });
        await loadStudentSkills();
        notify("success", "Course updated successfully");
      } else {
        const headers = await getAuthHeaders();
        await requestWithFallback("/api/student/skills", {
          method: "POST",
          headers,
          body: JSON.stringify({
            title: skillName,
            description: "",
            defaultDuration: Number(skillForm.duration) || 30,
            skillWebsites: cleanedSites,
          }),
        });
        await loadStudentSkills();
        sessionStorage.setItem("skillJustAdded", skillName);
        notify("success", "Course added successfully");
      }
      resetSkillForm(true);
    } catch (err) {
      console.error("Failed to save skill", err);
      const message = String(err?.message || "").trim();
      notify("error", message || "Could not save course. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const cancelSkillEdit = () => {
    resetSkillForm(true);
  };

  const handleSkillFormKeyDown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      cancelSkillEdit();
      return;
    }
  };

  const saveActivity = async (e) => {
    e.preventDefault();
    if (!user || !selectedSkillId || !activityForm.name || !activityForm.duration) return;
    setSaving(true);
    const skill = skills.find((s) => s.id === selectedSkillId);
    const normalizedPlatformUrl = normalizeExternalUrl(activityForm.platformUrl || activityForm.platform);
    try {
      if (editingActivityId) {
        await updateDoc(doc(db, "users", user.uid, "activities", editingActivityId), {
          activityName: activityForm.name,
          defaultDuration: Number(activityForm.duration),
          platform: activityForm.platform,
          platformUrl: normalizedPlatformUrl,
        });
        setActivities((prev) =>
          prev.map((a) =>
            a.id === editingActivityId
              ? { ...a, ...activityForm, platformUrl: normalizedPlatformUrl, defaultDuration: Number(activityForm.duration) }
              : a
          )
        );
        notify("success", "Activity updated");
      } else {
        const ref = await addDoc(collection(db, "users", user.uid, "activities"), {
          userId: user.uid,
          skillId: selectedSkillId,
          skillName: skill?.skillName || "",
          activityName: activityForm.name,
          defaultDuration: Number(activityForm.duration),
          platform: activityForm.platform,
          platformUrl: normalizedPlatformUrl,
          createdAt: serverTimestamp(),
        });
        setActivities((prev) => [
          {
            id: ref.id,
            userId: user.uid,
            skillId: selectedSkillId,
            skillName: skill?.skillName || "",
            activityName: activityForm.name,
            defaultDuration: Number(activityForm.duration),
            platform: activityForm.platform,
            platformUrl: normalizedPlatformUrl,
          },
          ...prev,
        ]);
        notify("success", "Activity added");
      }
      setActivityForm({ name: "", duration: 10, platform: "", platformUrl: "" });
      setEditingActivityId(null);
    } catch (err) {
      console.error("Failed to save activity", err);
      notify("error", "Could not save activity.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (skillId) => {
    if (!user) return;
    const confirmed = window.confirm("Are you sure you want to delete?");
    if (!confirmed) return;
    try {
      const headers = await getAuthHeaders();
      await requestWithFallback(`/api/student/skills/${skillId}`, { method: "DELETE", headers });
      await loadStudentSkills();
      setSkillError("");
      notify("success", "Course deleted successfully");
      if (selectedSkillId === skillId) {
        setSelectedSkillId(null);
        setActivities([]);
      }
    } catch (err) {
      console.error("Failed to delete skill", err);
      notify("error", "Could not delete course.");
    }
  };

  const deleteActivity = async (activityId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "activities", activityId));
      setActivities((prev) => prev.filter((a) => a.id !== activityId));
      if (activeTimer?.activityId === activityId) {
        clearTimer();
        setActiveTimer(null);
        setRemainingSeconds(0);
        sessionStorage.removeItem("activeSkillActivityTimer");
      }
      notify("success", "Activity removed");
    } catch (err) {
      console.error("Failed to delete activity", err);
      notify("error", "Could not delete activity.");
    }
  };

  const saveHistory = async ({ skillName, activityName, duration }) => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      await addDoc(collection(db, "users", user.uid, "activityHistory"), {
        userId: user.uid,
        skillName,
        activityName,
        date: today,
        duration,
        status: "completed",
        createdAt: serverTimestamp(),
      });
        setActivityCompletions((prev) => ({ ...prev, [`${skillName}__${activityName}`]: true }));
        setProgress((prev) => ({
          totalMinutes: (Number(prev?.totalMinutes) || 0) + (Number(duration) || 0),
          totalActivities: (Number(prev?.totalActivities) || 0) + 1,
          bySkill: {
            ...(prev?.bySkill || {}),
            [skillName]: ((prev?.bySkill || {})[skillName] || 0) + (Number(duration) || 0),
          },
        }));
    } catch (err) {
      console.error("Failed to record activity history", err);
    }
  };

  const completeActivity = async (timerState) => {
    clearTimer();
    setActiveTimer(null);
    setRemainingSeconds(0);
    sessionStorage.removeItem("activeSkillActivityTimer");
    await saveHistory({
      skillName: timerState.skillName,
      activityName: timerState.activityName,
      duration: timerState.durationMinutes,
    });
    updateAttendanceRecord(user?.uid, skills).catch(() => {});
    alert(`${timerState.activityName} completed!`);
  };

  const startActivity = (activity) => {
    if (!activity || !selectedSkillId) return;
    const skill = skills.find((s) => s.id === selectedSkillId);
    const durationMinutes = activity.defaultDuration || 10;

    if (skill?.skillName?.toLowerCase().includes("communication")) {
      const payload = {
        taskName: skill.skillName,
        skillName: skill.skillName,
        activityName: activity.activityName,
        durationMinutes,
        category: "Communication",
        autoStart: true,
        resumeSession: false,
        sessionInstanceId: String(Date.now()),
        skillsSnapshot: (skills || [])
          .map((item) => ({ id: item?.id, skillName: String(item?.skillName || item?.title || item?.name || "").trim() }))
          .filter((item) => item.skillName),
      };
      sessionStorage.removeItem("commSessionState:v1");
      sessionStorage.setItem("commSessionInfo", JSON.stringify(payload));
      navigate("/communication-session", { state: payload });
      return;
    }

    const durationMs = durationMinutes * 60 * 1000;
    const startedAt = Date.now();
    const timerState = {
      activityId: activity.id,
      activityName: activity.activityName,
      skillName: skill?.skillName,
      durationMs,
      startedAt,
      durationMinutes,
      platformUrl: normalizeExternalUrl(activity.platformUrl || activity.platform || ""),
    };
    openLiveTimerPinWindow();
    if (timerState.platformUrl) {
      openPracticeWindow(timerState.platformUrl);
    }
    setActiveTimer(timerState);
    setRemainingSeconds(Math.ceil(durationMs / 1000));
    sessionStorage.setItem("activeSkillActivityTimer", JSON.stringify(timerState));
    clearTimer();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = durationMs - elapsed;
      if (remaining <= 0) {
        completeActivity(timerState);
        return;
      }
      setRemainingSeconds(Math.ceil(remaining / 1000));
    }, 1000);
  };

  const stopActiveTimer = () => {
    clearTimer();
    setActiveTimer(null);
    setRemainingSeconds(0);
    sessionStorage.removeItem("activeSkillActivityTimer");
  };

  useEffect(() => {
    if (!user) return;
    cacheReadyRef.current = false;

    const cached = readSkillSystemCache(user.uid);
    if (cached?.apiSkills?.length) {
      setApiSkills(cached.apiSkills);
    }
    if (cached?.progress) {
      setProgress(cached.progress);
    }
    if (cached?.activityCompletions) {
      setActivityCompletions(cached.activityCompletions);
    }

    loadTodayHistory().catch(() => {});
    loadStudentSkills().finally(() => {
      cacheReadyRef.current = true;
    });

    ensureDefaults()
      .then(() => fetchSkills())
      .catch((err) => {
        console.error("Failed to initialize default skills", err);
      });
  }, [user]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!cacheReadyRef.current) return;
    writeSkillSystemCache(user.uid, { apiSkills, progress, activityCompletions });
  }, [apiSkills, progress, activityCompletions, user?.uid]);

  useEffect(() => {
    if (!banner.message) return undefined;
    const t = setTimeout(() => setBanner({ type: "", message: "" }), 3500);
    return () => clearTimeout(t);
  }, [banner]);

  useEffect(() => {
    if (!banner.message) return;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [banner.message]);

  useEffect(() => {
    if (selectedSkillId) loadActivities(selectedSkillId);
  }, [selectedSkillId]);

  useEffect(() => {
    if (!selectedSkillId && skills.length > 0) {
      setSelectedSkillId(skills[0].id);
    }
  }, [skills, selectedSkillId]);

  useEffect(() => {
    const stored = sessionStorage.getItem("activeSkillActivityTimer");
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (!parsed?.startedAt || !parsed?.durationMs) return;
    const elapsed = Date.now() - parsed.startedAt;
    if (elapsed >= parsed.durationMs) {
      sessionStorage.removeItem("activeSkillActivityTimer");
      return;
    }
    setActiveTimer(parsed);
    const remaining = parsed.durationMs - elapsed;
    setRemainingSeconds(Math.ceil(remaining / 1000));
    clearTimer();
    timerRef.current = setInterval(() => {
      const nowElapsed = Date.now() - parsed.startedAt;
      const remain = parsed.durationMs - nowElapsed;
      if (remain <= 0) {
        completeActivity(parsed);
        return;
      }
      setRemainingSeconds(Math.ceil(remain / 1000));
    }, 1000);
  }, []);

  useEffect(() => () => clearTimer(), []);

  useEffect(() => {
    if (!activeTimer) {
      clearLiveTimerPin();
      return;
    }

    const totalMs = Math.max(0, Number(activeTimer.durationMs) || 0);
    const remainingMs = Math.max(0, Number(remainingSeconds) * 1000);
    const elapsedMs = Math.max(0, totalMs - remainingMs);

    updateLiveTimerPin({
      label: `${activeTimer.skillName || "Skill"}: ${activeTimer.activityName || "Activity"}`,
      status: remainingMs > 0 ? "running" : "completed",
      remainingMs,
      elapsedMs,
    });
  }, [activeTimer, remainingSeconds]);

  useEffect(
    () => () => {
      clearLiveTimerPin();
    },
    []
  );

  const formatMMSS = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const selectedSkill = skills.find((s) => s.id === selectedSkillId);
  const selectedSkillSites = selectedSkill ? getSkillWebsites(selectedSkill.skillName, selectedSkill.skillWebsites) : [];
  const canSaveSkill = Boolean(skillForm.name.trim()) && Number(skillForm.duration) > 0 && !skillError && !saving;

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <ToastContainer
          position="top-center"
          autoClose={2500}
          newestOnTop
          closeOnClick
          pauseOnHover={false}
          draggable
          theme="colored"
          style={{ zIndex: 9999 }}
        />
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-600">Course Improvement System</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Manage your courses</h1>
            <p className="text-slate-600 text-base">Add, edit, or remove courses, set their timers and platforms. Dashboard auto-syncs to these courses.</p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:shadow-md disabled:opacity-60"
              onClick={() => {
                loadStudentSkills();
                notify("success", "Courses refreshed");
              }}
              disabled={saving || loadingApiSkills}
            >
              Refresh courses
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-300"
              onClick={() => navigate("/dashboard")}
            >
              Back to dashboard
            </button>
          </div>
        </div>

        {banner.message && (
          <div
            className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
              banner.type === "success"
                ? "bg-emerald-50 text-emerald-700 border-emerald-100"
                : "bg-rose-50 text-rose-700 border-rose-100"
            }`}
          >
            {banner.message}
          </div>
        )}

        <div className="space-y-5">
          <DashboardCard title={editingSkillId ? "Edit course" : "Add course"} subtitle="Create or update" accent="indigo">
            <form className="space-y-3" onSubmit={saveSkill} onKeyDown={handleSkillFormKeyDown} noValidate>
              <div className="space-y-1 relative">
                <label className="text-sm font-semibold text-slate-700">Search course name</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Search or type course name"
                  value={skillForm.name}
                  onFocus={() => setSkillSuggestionsOpen(true)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSkillSuggestionsOpen(true);
                    setSkillError("");
                    setSkillForm((prev) => ({ ...prev, name: value }));
                  }}
                  aria-invalid={Boolean(skillError)}
                  aria-describedby={skillError ? "skill-name-error" : undefined}
                />
                {skillSuggestionsOpen && (
                  <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <div className="max-h-56 overflow-y-auto overscroll-contain p-1">
                      {filteredSkillSuggestions.length > 0 ? (
                        filteredSkillSuggestions.map((name) => {
                          const matchedDefault = DEFAULT_SKILLS.find((s) => s.name.toLowerCase() === name.toLowerCase());
                          const defaultSites = getSkillWebsites(name, matchedDefault?.websites || []);
                          const defaultDuration = matchedDefault?.defaultDuration || 30;
                          return (
                            <button
                              key={name}
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm rounded-lg hover:bg-indigo-50 cursor-pointer"
                              onMouseDown={(event) => event.preventDefault()}
                              onClick={() => {
                                setSkillForm({
                                  name,
                                  duration: defaultDuration,
                                  websites: defaultSites,
                                  extraWebsites: [{ title: "", url: "" }],
                                });
                                setSkillSuggestionsOpen(false);
                                setSkillError("");
                              }}
                            >
                              {name}
                              <span className="text-xs text-slate-500 ml-2">{defaultDuration} min suggested</span>
                            </button>
                          );
                        })
                      ) : (
                        <div className="px-3 py-2 text-sm text-slate-500">No courses found</div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">Timer duration (minutes)</label>
                <input
                  type="number"
                  min="1"
                  max="240"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  value={skillForm.duration}
                  onChange={(e) => setSkillForm((prev) => ({ ...prev, duration: Number(e.target.value) || 1 }))}
                />
              </div>

              {skillError && (
                <p id="skill-name-error" className="text-sm text-rose-600 font-semibold">
                  {skillError}
                </p>
              )}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Default resources (auto)</label>
                {getSkillWebsites(skillForm.name, skillForm.websites).length ? (
                  <div className="flex flex-wrap gap-2">
                    {getSkillWebsites(skillForm.name, skillForm.websites).map((site, idx) => (
                      <span key={`${site.label}-${idx}`} className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                        {normalizeWebsiteEntry(site).title || site.label || "Website"}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No defaults found. You can add extra course resources below.</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-semibold text-slate-700">Add additional websites (optional)</label>
                  <button
                    type="button"
                    className="text-xs font-semibold text-indigo-700"
                    onClick={() =>
                      setSkillForm((prev) => ({
                        ...prev,
                        extraWebsites: [...(prev.extraWebsites || []), { title: "", url: "" }],
                      }))
                    }
                  >
                    + Add website
                  </button>
                </div>
                <div className="space-y-2">
                  {(skillForm.extraWebsites || []).map((site, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="Website title"
                        value={site?.title || ""}
                        onChange={(e) =>
                          setSkillForm((prev) => {
                            const next = [...(prev.extraWebsites || [])];
                            next[idx] = { ...(next[idx] || {}), title: e.target.value };
                            return { ...prev, extraWebsites: next };
                          })
                        }
                      />
                      <input
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="https://"
                        value={site?.url || ""}
                        onChange={(e) =>
                          setSkillForm((prev) => {
                            const next = [...(prev.extraWebsites || [])];
                            next[idx] = { ...(next[idx] || {}), url: e.target.value };
                            return { ...prev, extraWebsites: next };
                          })
                        }
                      />
                      <button
                        type="button"
                        className="text-xs font-semibold text-rose-600"
                        onClick={() =>
                          setSkillForm((prev) => ({
                            ...prev,
                            extraWebsites: (prev.extraWebsites || []).filter((_, i) => i !== idx),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-sm font-semibold shadow transition ${
                    canSaveSkill ? "bg-emerald-600 text-white hover:shadow-md" : "bg-emerald-100 text-emerald-700 cursor-not-allowed"
                  }`}
                  disabled={!canSaveSkill}
                >
                  {editingSkillId ? "Update Course" : "Add Course"}
                </button>
                <button
                  type="button"
                  className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-300"
                  onClick={cancelSkillEdit}
                >
                  Cancel
                </button>
              </div>
            </form>
          </DashboardCard>

          <DashboardCard title="Admin Allocated Courses" subtitle="Assigned by admin (read-only)" accent="blue">
            {loadingApiSkills ? (
              <p className="text-sm text-slate-600">Loading courses...</p>
            ) : allocatedSkills.length === 0 ? (
              <p className="text-sm text-slate-500">No allocated courses yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {allocatedSkills.map((skill) => (
                  <div key={skill.id} className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-900 truncate">{skill.title}</p>
                      <span className="inline-flex shrink-0 items-center rounded-full border border-rose-200 bg-rose-100 px-2.5 py-1 text-[11px] font-semibold text-rose-700">
                        Compulsory
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">Read-only (allocated course)</p>
                  </div>
                ))}
              </div>
            )}
          </DashboardCard>

          <DashboardCard title="My Courses" subtitle="Student-managed courses" accent="purple">
            {loadingApiSkills ? (
              <p className="text-sm text-slate-600">Loading courses...</p>
            ) : mySkills.length === 0 ? (
              <p className="text-sm text-slate-500">No personal courses yet. Add one above.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {mySkills.map((skill) => {
                  const adminAllocated = isAdminAllocatedSkill(skill);
                  return (
                    <div
                      key={skill.id}
                      className={`rounded-xl border px-4 py-3 shadow-sm h-full flex items-center justify-between gap-3 ${
                        adminAllocated
                          ? "border-rose-200 bg-rose-50"
                          : selectedSkillId === skill.id
                            ? "border-indigo-300 bg-indigo-50"
                            : "border-slate-100 bg-white"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div>
                          <p className="font-semibold text-slate-900 truncate">{skill.title || skill.skillName}</p>
                          <p className="text-xs text-slate-500 mt-1">Timer: {Number(skill.defaultDuration) || 30} min</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs items-center justify-end">
                        {adminAllocated ? (
                          <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-100 px-3 py-1 font-semibold text-rose-700">
                            Compulsory
                          </span>
                        ) : (
                          <>
                            <button
                              className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100 flex items-center justify-center"
                              onClick={() => {
                                setSelectedSkillId(skill.id);
                                setEditingSkillId(skill.id);
                                const skillName = skill.title || skill.skillName || "";
                                const fallbackSites = getSkillWebsites(skillName, skill.skillWebsites || []);
                                const defaultSites = getSkillWebsites(skillName, []);
                                const normalizedSites = (skill.skillWebsites || []).map((site) => normalizeWebsiteEntry(site));
                                const extraSites = normalizedSites.filter(
                                  (site) => !defaultSites.some((defaultSite) => normalizeWebsiteEntry(defaultSite).url === site.url)
                                );
                                setSkillForm({
                                  name: skillName,
                                  duration: skill.defaultDuration || 30,
                                  websites: fallbackSites || [],
                                  extraWebsites: extraSites.length
                                    ? extraSites.map((site) => ({ title: site.title || site.label || "", url: site.url || "" }))
                                    : [{ title: "", url: "" }],
                                });
                              }}
                            >
                              Edit
                            </button>
                            <button
                              className="h-9 px-3 rounded-lg bg-rose-50 text-rose-700 font-semibold border border-rose-100 flex items-center justify-center"
                              onClick={() => deleteSkill(skill.id)}
                            >
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </DashboardCard>
        </div>

        {activeTimer && activeTimer.skillName && !activeTimer.skillName.toLowerCase().includes("communication") && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6 space-y-4 text-center">
              <p className="text-sm uppercase tracking-wide text-slate-500 font-semibold">Activity timer</p>
              <h2 className="text-2xl font-bold text-slate-900">{activeTimer.activityName}</h2>
              <p className="text-sm text-slate-600">Course: {activeTimer.skillName}</p>
              <div className="text-5xl font-bold text-indigo-600 tracking-tight">{formatMMSS(remainingSeconds)}</div>
              <div className="flex justify-center gap-3">
                <button
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold shadow hover:shadow-md"
                  onClick={stopActiveTimer}
                >
                  Stop
                </button>
              </div>
              <p className="text-xs text-slate-500">Timer auto-completes at zero and logs to history.</p>
            </div>
          </div>
        )}
      </div>
    </GlobalLayout>
  );
};

export default SkillSystem;
