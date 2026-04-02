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
import { updateAttendanceRecord } from "../services/attendanceService";
import { toast, ToastContainer } from "react-toastify";


const SkillSystem = () => {
  const { user } = useAuth();
  const { skills, loading: skillsLoading, addSkill: addSkillCtx, updateSkill: updateSkillCtx, removeSkill: removeSkillCtx, fetchSkills } = useSkills();
  const navigate = useNavigate();
  const [selectedSkillId, setSelectedSkillId] = useState(null);
  const [activities, setActivities] = useState([]);
  const [skillForm, setSkillForm] = useState({ name: "", duration: 30, websites: [], extraWebsites: [""] });
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

  const notify = (type, message) => {
    setBanner({ type, message });
    if (!message) return;
    const opts = { containerId: "global-toasts" };
    if (type === "success") toast.success(message, { autoClose: 2000, ...opts });
    else toast.error(message, { autoClose: 2500, ...opts });
  };

  const normalizeName = (name) => (name || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

  const getSkillWebsites = (skillName, explicitSites = []) => {
    if (explicitSites && explicitSites.length) return explicitSites;
    const key = normalizeName(skillName);
    return SKILL_SITE_DEFAULTS[key] || [];
  };

  const normalizedExisting = useMemo(() => {
    const map = new Map();
    skills.forEach((s) => {
      map.set(normalizeName(s.skillName), s.id);
    });
    return map;
  }, [skills]);

  const suggestedSkillNames = useMemo(() => {
    const names = new Set();
    DEFAULT_SKILLS.forEach((s) => names.add(s.name));
    Object.keys(SKILL_SITE_DEFAULTS).forEach((k) => names.add(k.replace(/\b\w/g, (c) => c.toUpperCase())));
    return Array.from(names);
  }, []);

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

  const loadProgress = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(collection(db, "users", user.uid, "activityHistory"), where("date", "==", today));
      const snap = await getDocs(q);
      let totalMinutes = 0;
      let totalActivities = 0;
      const bySkill = {};
      snap.forEach((d) => {
        const data = d.data();
        const mins = Number(data?.duration) || 0;
        totalMinutes += mins;
        totalActivities += 1;
        if (data?.skillName) {
          bySkill[data.skillName] = (bySkill[data.skillName] || 0) + mins;
        }
      });
      setProgress({ totalMinutes, totalActivities, bySkill });
    } catch (err) {
      console.error("Failed to load progress", err);
    }
  };

  const loadCompletions = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(collection(db, "users", user.uid, "activityHistory"), where("date", "==", today));
      const snap = await getDocs(q);
      const map = {};
      snap.forEach((d) => {
        const data = d.data();
        if (data?.skillName && data?.activityName) {
          map[`${data.skillName}__${data.activityName}`] = true;
        }
      });
      setActivityCompletions(map);
    } catch (err) {
      console.error("Failed to load activity completions", err);
    }
  };

  const saveSkill = async (e) => {
    e.preventDefault();
    if (!user || !skillForm.name) return;
    setSaving(true);
    const normalizedName = normalizeName(skillForm.name);
    const existingId = normalizedExisting.get(normalizedName);
    if (!editingSkillId && existingId) {
      setSkillError("This skill is already registered. Please edit or remove it before adding again.");
      setSaving(false);
      return;
    }
    if (editingSkillId && existingId && existingId !== editingSkillId) {
      setSkillError("Another skill already uses this name. Please choose a different name or edit that skill.");
      setSaving(false);
      return;
    }
    setSkillError("");
    const defaultSites = getSkillWebsites(skillForm.name, skillForm.websites);
    const cleanedExtras = (skillForm.extraWebsites || [])
      .map((url) => url.trim())
      .filter((url) => url.length > 0);
    const cleanedSites = (defaultSites || [])
      .map((w) => ({ label: w.label?.trim(), url: w.url?.trim() }))
      .filter((w) => w.label || w.url)
      .concat(cleanedExtras.map((url) => ({ label: url.replace(/https?:\/\//i, ""), url })));
    try {
      if (editingSkillId) {
        await updateSkillCtx(editingSkillId, {
          skillName: skillForm.name,
          defaultDuration: Number(skillForm.duration) || 10,
          skillWebsites: cleanedSites,
        });
        notify("success", "Skill updated");
      } else {
        await addSkillCtx({
          skillName: skillForm.name,
          defaultDuration: Number(skillForm.duration) || 10,
          skillWebsites: cleanedSites,
        });
        sessionStorage.setItem("skillJustAdded", skillForm.name);
        notify("success", "Skill added");
      }
      setSkillForm({ name: "", duration: 30, websites: [], extraWebsites: [""], });
      setEditingSkillId(null);
    } catch (err) {
      console.error("Failed to save skill", err);
      notify("error", "Could not save skill. Try again.");
    } finally {
      setSaving(false);
    }
  };

  const saveActivity = async (e) => {
    e.preventDefault();
    if (!user || !selectedSkillId || !activityForm.name || !activityForm.duration) return;
    setSaving(true);
    const skill = skills.find((s) => s.id === selectedSkillId);
    try {
      if (editingActivityId) {
        await updateDoc(doc(db, "users", user.uid, "activities", editingActivityId), {
          activityName: activityForm.name,
          defaultDuration: Number(activityForm.duration),
          platform: activityForm.platform,
          platformUrl: activityForm.platformUrl,
        });
        setActivities((prev) => prev.map((a) => (a.id === editingActivityId ? { ...a, ...activityForm, defaultDuration: Number(activityForm.duration) } : a)));
        notify("success", "Activity updated");
      } else {
        const ref = await addDoc(collection(db, "users", user.uid, "activities"), {
          userId: user.uid,
          skillId: selectedSkillId,
          skillName: skill?.skillName || "",
          activityName: activityForm.name,
          defaultDuration: Number(activityForm.duration),
          platform: activityForm.platform,
          platformUrl: activityForm.platformUrl,
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
            platformUrl: activityForm.platformUrl,
          },
          ...prev,
        ]);
        notify("success", "Activity added");
      }
      setActivityForm({ name: "", duration: 10, platform: "", platformUrl: "" });
      setEditingActivityId(null);
      await loadCompletions();
    } catch (err) {
      console.error("Failed to save activity", err);
      notify("error", "Could not save activity.");
    } finally {
      setSaving(false);
    }
  };

  const deleteSkill = async (skillId) => {
    if (!user) return;
    try {
      await removeSkillCtx(skillId);
      setSkillError("");
      notify("success", "Skill removed");
      if (selectedSkillId === skillId) {
        setSelectedSkillId(null);
        setActivities([]);
      }
    } catch (err) {
      console.error("Failed to delete skill", err);
      notify("error", "Could not delete skill.");
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
        await loadProgress();
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
        skillName: skill.skillName,
        activityName: activity.activityName,
        durationMinutes,
      };
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
      platformUrl: activity.platformUrl || activity.platform || "",
    };
    if (timerState.platformUrl) {
      window.open(timerState.platformUrl, "_blank", "noopener");
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
    ensureDefaults().then(() => {
      fetchSkills();
      loadProgress();
      loadCompletions();
    });
  }, [user]);

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
            <p className="text-sm font-semibold text-indigo-600">Skill Improvement System</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Manage your skills</h1>
            <p className="text-slate-600 text-base">Add, edit, or remove skills, set their timers and platforms. Dashboard auto-syncs to these skills.</p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:shadow-md disabled:opacity-60"
              onClick={() => ensureDefaults().then(() => {
                fetchSkills();
                notify("success", "Default skills loaded");
              })}
              disabled={saving}
            >
              Add default skills
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

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <DashboardCard title={editingSkillId ? "Edit skill" : "Add skill"} subtitle="Create or update" accent="indigo">
            <form className="space-y-3" onSubmit={saveSkill}>
              <div className="space-y-1 relative">
                <label className="text-sm font-semibold text-slate-700">Search skill name</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="Search or type skill name"
                  value={skillForm.name}
                  onFocus={() => setSkillSuggestionsOpen(true)}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSkillSuggestionsOpen(true);
                    setSkillError("");
                    setSkillForm((prev) => ({ ...prev, name: value }));
                  }}
                  required
                />
                {skillSuggestionsOpen && (
                  <div className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                    {suggestedSkillNames
                      .filter((name) => name.toLowerCase().includes((skillForm.name || "").toLowerCase()))
                      .map((name) => {
                        const matchedDefault = DEFAULT_SKILLS.find((s) => s.name.toLowerCase() === name.toLowerCase());
                        const defaultSites = getSkillWebsites(name, matchedDefault?.websites || []);
                        const defaultDuration = matchedDefault?.defaultDuration || 30;
                        return (
                          <button
                            key={name}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-indigo-50"
                            onClick={() => {
                              setSkillForm({
                                name,
                                duration: defaultDuration,
                                websites: defaultSites,
                                extraWebsites: [""],
                              });
                              setSkillSuggestionsOpen(false);
                              setSkillError("");
                            }}
                          >
                            {name}
                            <span className="text-xs text-slate-500 ml-2">{defaultDuration} min suggested</span>
                          </button>
                        );
                      })}
                    {suggestedSkillNames.filter((name) => name.toLowerCase().includes((skillForm.name || "").toLowerCase())).length === 0 && (
                      <div className="px-3 py-2 text-sm text-slate-500">No matches. Enter a custom skill.</div>
                    )}
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
                  required
                />
              </div>

              {skillError && <p className="text-sm text-rose-600 font-semibold">{skillError}</p>}
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700">Default websites (auto)</label>
                {getSkillWebsites(skillForm.name, skillForm.websites).length ? (
                  <div className="flex flex-wrap gap-2">
                    {getSkillWebsites(skillForm.name, skillForm.websites).map((site, idx) => (
                      <span key={`${site.label}-${idx}`} className="px-3 py-1 rounded-xl bg-slate-100 text-slate-700 text-xs font-semibold border border-slate-200">
                        {site.label}
                      </span>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No defaults found. You can add extra websites below.</p>
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
                        extraWebsites: [...(prev.extraWebsites || []), ""],
                      }))
                    }
                  >
                    + Add URL
                  </button>
                </div>
                <div className="space-y-2">
                  {(skillForm.extraWebsites || []).map((url, idx) => (
                    <div key={idx} className="flex gap-2 items-center">
                      <input
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                        placeholder="https://"
                        value={url}
                        onChange={(e) =>
                          setSkillForm((prev) => {
                            const next = [...(prev.extraWebsites || [])];
                            next[idx] = e.target.value;
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
                  {editingSkillId ? "Update skill" : "Add skill"}
                </button>
                {editingSkillId && (
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-300"
                    onClick={() => {
                      setEditingSkillId(null);
                      setSkillForm({ name: "", duration: 30, websites: [], extraWebsites: [""] });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </DashboardCard>

          <div className="lg:col-span-2 space-y-4">
            <DashboardCard title="Skills" subtitle="Select to manage activities" accent="purple">
              {skillsLoading ? (
                <p className="text-sm text-slate-600">Loading skills...</p>
              ) : skills.length === 0 ? (
                <p className="text-sm text-slate-500">No skills yet. Add one or load defaults.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                  {skills.map((skill) => (
                    <div
                      key={skill.id}
                      className={`rounded-xl border px-4 py-3 shadow-sm h-full flex items-center justify-between gap-3 ${
                        selectedSkillId === skill.id ? "border-indigo-300 bg-indigo-50" : "border-slate-100 bg-white"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div>
                          <p className="font-semibold text-slate-900 truncate">{skill.skillName}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs items-center justify-end">
                        <button
                          className="h-9 px-3 rounded-lg bg-indigo-100 text-indigo-700 font-semibold flex items-center justify-center"
                          onClick={() => {
                            setSelectedSkillId(skill.id);
                            setActivityForm({ name: "", duration: 10, platform: "", platformUrl: "" });
                            setEditingActivityId(null);
                          }}
                        >
                          Manage
                        </button>
                        <button
                          className="h-9 px-3 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100 flex items-center justify-center"
                          onClick={() => {
                            setEditingSkillId(skill.id);
                            const fallbackSites = getSkillWebsites(skill.skillName, skill.skillWebsites);
                            const defaultSites = getSkillWebsites(skill.skillName, []);
                            const extraSites = (skill.skillWebsites || []).filter(
                              (w) => !defaultSites.some((d) => d.url === w.url && d.label === w.label)
                            );
                            setSkillForm({
                              name: skill.skillName,
                              duration: skill.defaultDuration || 30,
                              websites: fallbackSites,
                              extraWebsites: extraSites.length ? extraSites.map((s) => s.url || "") : [""],
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
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Activities" subtitle="Set duration and start" accent="blue">
              {selectedSkillId ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{selectedSkill?.skillName || "Selected skill"}</p>
                        <p className="text-xs text-slate-500">Related practice platforms</p>
                      </div>
                      <span className="text-xs font-semibold text-indigo-600">Timer continues while you browse</span>
                    </div>
                    {selectedSkillSites.length ? (
                      <div className="flex flex-wrap gap-2">
                        {selectedSkillSites.map((site, idx) => (
                          <button
                            key={`${site.label}-${idx}`}
                            type="button"
                            className="px-3 py-2 rounded-xl bg-white text-indigo-700 text-xs font-semibold border border-indigo-100 shadow-sm hover:bg-indigo-50"
                            onClick={() => site.url && window.open(site.url, "_blank", "noopener")}
                          >
                            {site.label || "Open link"}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">Use the built-in communication practice: camera, random topics, timer.</p>
                    )}
                  </div>

                  <form className="grid grid-cols-1 sm:grid-cols-5 gap-3" onSubmit={saveActivity}>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Activity name"
                      value={activityForm.name}
                      onChange={(e) => setActivityForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                    <input
                      type="number"
                      min="1"
                      max="180"
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                      value={activityForm.duration}
                      onChange={(e) => setActivityForm((prev) => ({ ...prev, duration: Number(e.target.value) }))}
                      required
                    />
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Platform (YouTube, GFG)"
                      value={activityForm.platform}
                      onChange={(e) => setActivityForm((prev) => ({ ...prev, platform: e.target.value }))}
                    />
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                      placeholder="Platform link (optional)"
                      value={activityForm.platformUrl}
                      onChange={(e) => setActivityForm((prev) => ({ ...prev, platformUrl: e.target.value }))}
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:shadow-md disabled:opacity-60"
                        disabled={saving}
                      >
                        {editingActivityId ? "Update" : "Add"}
                      </button>
                      {editingActivityId && (
                        <button
                          type="button"
                          className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-300"
                          onClick={() => {
                            setEditingActivityId(null);
                            setActivityForm({ name: "", duration: 10, platform: "", platformUrl: "" });
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  {loadingActivities ? (
                    <p className="text-sm text-slate-600">Loading activities...</p>
                  ) : activities.length === 0 ? (
                    <p className="text-sm text-slate-500">No activities yet. Add one above.</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {activities.map((activity) => (
                        <div key={activity.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm space-y-2">
                          <div className="flex items-center justify-between">
                            <div>
                              <p className="font-semibold text-slate-900">{activity.activityName}</p>
                              <p className="text-xs text-slate-500">Duration: {activity.defaultDuration} min</p>
                              {activity.platform && <p className="text-xs text-slate-500">Platform: {activity.platform}</p>}
                              {activity.platformUrl && <p className="text-[11px] text-indigo-600 truncate">{activity.platformUrl}</p>}
                            </div>
                            <div className="flex gap-2 text-xs">
                              <button
                                className="px-3 py-1 rounded-lg bg-indigo-600 text-white font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                                onClick={() => startActivity(activity)}
                                disabled={activeTimer && activeTimer.activityId !== activity.id}
                              >
                                Start
                              </button>
                              <button
                                className="px-3 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100"
                                onClick={() => {
                                  setEditingActivityId(activity.id);
                                  setActivityForm({
                                    name: activity.activityName,
                                    duration: activity.defaultDuration,
                                    platform: activity.platform || "",
                                    platformUrl: activity.platformUrl || "",
                                  });
                                }}
                              >
                                Edit
                              </button>
                              <button
                                className="px-3 py-1 rounded-lg bg-rose-50 text-rose-700 font-semibold border border-rose-100"
                                onClick={() => deleteActivity(activity.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                          {activityCompletions[`${activity.skillName}__${activity.activityName}`] && (
                            <div className="rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-1 border border-emerald-100 inline-flex">
                              Completed today
                            </div>
                          )}
                          {activeTimer?.activityId === activity.id && (
                            <div className="text-sm text-indigo-700 font-semibold">Remaining: {formatMMSS(remainingSeconds)}</div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-slate-500">Select a skill to manage activities.</p>
              )}
            </DashboardCard>

            <DashboardCard title="Today" subtitle="Progress overview" accent="green">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center shadow-sm">
                  <div className="text-xs text-slate-500">Activities completed</div>
                  <div className="text-lg font-semibold text-slate-900">{progress.totalActivities}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center shadow-sm">
                  <div className="text-xs text-slate-500">Time spent</div>
                  <div className="text-lg font-semibold text-slate-900">{progress.totalMinutes} min</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center shadow-sm">
                  <div className="text-xs text-slate-500">Active</div>
                  <div className="text-lg font-semibold text-indigo-700">{activeTimer ? activeTimer.activityName : "None"}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {skills.map((s) => (
                  <div key={s.id} className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
                    <div className="text-xs text-slate-500">{s.skillName}</div>
                    <div className="text-sm font-semibold text-slate-900">{progress.bySkill[s.skillName] ? `${progress.bySkill[s.skillName]} min` : "0 min"}</div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
        </div>

        {activeTimer && activeTimer.skillName && !activeTimer.skillName.toLowerCase().includes("communication") && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6 space-y-4 text-center">
              <p className="text-sm uppercase tracking-wide text-slate-500 font-semibold">Activity timer</p>
              <h2 className="text-2xl font-bold text-slate-900">{activeTimer.activityName}</h2>
              <p className="text-sm text-slate-600">Skill: {activeTimer.skillName}</p>
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
