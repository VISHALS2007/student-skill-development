import React, { useCallback, useEffect, useMemo, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useFocusTracker } from "../lib/useFocusTracker";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";
import { msToHHMMSS } from "../lib/focusService";

// Reusable page that mirrors the Focus Session UI but allows custom site lists per skill category.
const FocusSessionTemplate = ({
  title,
  subtitle,
  description,
  taskKey,
  storageKeyPrefix,
  initialTargetMinutes,
  siteButtons = [],
}) => {
  const { user } = useAuth();
  const allowedSites = useMemo(() => siteButtons.map((s) => s.domain), [siteButtons]);
  const platformUrls = useMemo(
    () =>
      siteButtons.reduce((acc, site) => {
        if (site.domain && site.url) acc[site.domain] = site.url;
        return acc;
      }, {}),
    [siteButtons]
  );

  const {
    status,
    elapsedMs,
    activeDomain,
    tabSwitches,
    targetMinutes,
    setTargetMinutes,
    perSiteTargets,
    updateTargetForDomain,
    inactivitySeconds,
    setInactivitySeconds,
    completionStatus,
    focusScore,
    events,
    allowedDomain,
    selectedDomain,
    setSelectedDomain,
    startWithPlatform,
    pause,
    resume,
    stop,
  } = useFocusTracker(user?.uid, { allowedSites, platformUrls, storageKeyPrefix });

  const [todayGoalMinutes] = useState(120);
  const [completedToday, setCompletedToday] = useState(false);
  const [sessionLogged, setSessionLogged] = useState(false);
  const [sessionStart, setSessionStart] = useState("");

  const formatMMSS = (ms) => {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const m = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
    const s = String(totalSeconds % 60).padStart(2, "0");
    return `${m}:${s}`;
  };

  const completionText = useMemo(() => {
    if (completedToday) return "Completed";
    if (status === "running") return "Active";
    if (status === "paused") return "Paused";
    if (status === "stopped") return completionStatus;
    return "Idle";
  }, [completedToday, status, completionStatus]);

  const loadCompletion = async () => {
    if (!user?.uid || !taskKey) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(collection(db, "users", user.uid, "dailyTasks"), where("date", "==", today), where("taskName", "==", taskKey));
      const snap = await getDocs(q);
      setCompletedToday(!snap.empty);
    } catch (err) {
      console.error("Failed to load daily completion", err);
    }
  };

  useEffect(() => {
    loadCompletion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, taskKey]);

  useEffect(() => {
    const target = Number(initialTargetMinutes);
    if (Number.isFinite(target) && target > 0) {
      setTargetMinutes(target);
    }
  }, [initialTargetMinutes, setTargetMinutes]);

  const recordCompletion = useCallback(
    async (durationMinutes) => {
      if (!user?.uid || !taskKey) return;
      const today = new Date().toISOString().split("T")[0];
      try {
        await addDoc(collection(db, "users", user.uid, "dailyTasks"), {
          taskName: taskKey,
          durationMinutes,
          date: today,
          status: "completed",
          createdAt: serverTimestamp(),
        });
        setCompletedToday(true);
      } catch (err) {
        console.error("Failed to record completion", err);
      }
    },
    [taskKey, user?.uid]
  );

  const logSessionData = useCallback(
    async (durationMs, completionState, startedAtArg, endedAtArg) => {
      const durationMinutes = Math.max(1, Math.round(durationMs / 60000));
      const startedAt = startedAtArg || sessionStart || new Date().toISOString();
      const endedAt = endedAtArg || new Date().toISOString();
      const dateKey = startedAt.split("T")[0];

      if (user?.uid && taskKey) {
        try {
          await addDoc(collection(db, "users", user.uid, "taskSessions"), {
            taskType: taskKey,
            platform: activeDomain || selectedDomain || "unknown",
            durationMinutes,
            durationMs,
            date: dateKey,
            focusScore,
            completion: completionState,
            startTime: startedAt,
            endTime: endedAt,
            createdAt: serverTimestamp(),
          });
        } catch (err) {
          console.error("Failed to save session entry", err);
        }
      }

      if (completionState === "completed" && !completedToday) {
        await recordCompletion(durationMinutes);
      }
    },
    [activeDomain, completedToday, focusScore, recordCompletion, selectedDomain, sessionStart, taskKey, user?.uid]
  );

  const handleStop = async () => {
    const result = await stop();
    const durationMs = result?.durationMs || elapsedMs;
    const completionState = result?.completion || completionStatus;
    const startedAt = result?.startedAt || sessionStart || new Date().toISOString();
    const endedAt = result?.endedAt || new Date().toISOString();
    await logSessionData(durationMs, completionState, startedAt, endedAt);
    setSessionLogged(true);
  };

  const handleManualComplete = async () => {
    if (completedToday) return;
    const now = new Date().toISOString();
    await logSessionData(targetMinutes * 60 * 1000, "completed", now, now);
    setSessionLogged(true);
  };

  useEffect(() => {
    if (status === "stopped" && !sessionLogged && elapsedMs > 0) {
      const startedAt = sessionStart || new Date(Date.now() - elapsedMs).toISOString();
      const endedAt = new Date().toISOString();
      logSessionData(elapsedMs, completionStatus, startedAt, endedAt).finally(() => setSessionLogged(true));
    }
  }, [status, sessionLogged, elapsedMs, completionStatus, logSessionData]);

  const handleStart = (domain) => {
    if (completedToday) return;
    setSessionLogged(false);
    setSessionStart(new Date().toISOString());
    setSelectedDomain(domain);
    startWithPlatform(domain);
  };

  const remainingMs = Math.max(0, targetMinutes * 60 * 1000 - elapsedMs);

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Tracker</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">{title}</h1>
          <p className="text-slate-600 text-base">{subtitle}</p>
        </div>

        <DashboardCard title="Focus Session" subtitle={description} icon={null}>
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 text-sm text-slate-700 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">Target (min)</span>
                  <input
                    type="number"
                    min="5"
                    max="240"
                    value={targetMinutes}
                    onChange={(e) => setTargetMinutes(Number(e.target.value))}
                    className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex items-center gap-2 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Remaining</span>
                  <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold text-indigo-700">{formatMMSS(remainingMs)}</span>
                </div>
              </div>
              <div className="text-xs rounded-lg bg-slate-100 text-slate-700 px-3 py-2 font-semibold">Focus score: {focusScore}%</div>
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Inactivity pause (sec)</span>
                <input
                  type="number"
                  min="10"
                  max="600"
                  value={inactivitySeconds}
                  onChange={(e) => setInactivitySeconds(Number(e.target.value))}
                  className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                />
              </div>
              <div className="text-xs text-slate-600">Auto-pause after no activity.</div>
            </div>

            <div className="grid gap-2 sm:grid-cols-2">
              {siteButtons.map((site) => (
                <button
                  key={site.domain}
                  className="w-full px-3 py-2 rounded-xl bg-indigo-50 text-slate-800 text-sm font-semibold border border-indigo-100 hover:bg-indigo-100 transition disabled:opacity-60"
                  onClick={() => handleStart(site.domain)}
                  disabled={completedToday || (status === "running" && selectedDomain !== site.domain)}
                >
                  {site.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
              <div className="flex items-center justify-between">
                <span>Status</span>
                <span className="font-semibold text-indigo-600 capitalize">{completionText}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Sessions today</span>
                <span className="font-semibold text-slate-900">{completedToday ? "1/1" : "0/1"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Active site</span>
                <span className="font-semibold text-slate-900">{activeDomain || allowedDomain || "Select site"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Elapsed</span>
                <span className="font-semibold text-slate-900">{msToHHMMSS(elapsedMs)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Interruptions</span>
                <span className="font-semibold text-slate-900">{tabSwitches}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Completion</span>
                <span className="font-semibold text-slate-900 capitalize">{completionStatus}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Today goal</span>
                <span className="font-semibold text-slate-900">{completedToday ? "Done" : `0% of ${todayGoalMinutes}m`}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Events</span>
                <span className="font-semibold text-slate-900">{events?.length || 0}</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={pause}
                disabled={status !== "running"}
              >
                Pause
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={resume}
                disabled={status !== "paused"}
              >
                Resume
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-rose-500 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={handleStop}
                disabled={status === "idle"}
              >
                Stop
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-emerald-700 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={handleManualComplete}
                disabled={completedToday}
              >
                Mark Complete
              </button>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed">
              Opens the chosen site in a new tab and tracks time while that tab stays open. Closing the tab stops the timer. One completion per day is recorded for this category.
            </p>

            <div className="space-y-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
              <div className="text-sm font-semibold text-slate-800">Per-site targets</div>
              <div className="grid gap-2 sm:grid-cols-2">
                {siteButtons.map((site) => (
                  <div key={`target-${site.domain}`} className="flex items-center justify-between gap-2 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">{site.domain}</span>
                    <input
                      type="number"
                      min="5"
                      max="300"
                      value={perSiteTargets[site.domain] || 30}
                      onChange={(e) => updateTargetForDomain(site.domain, Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                    />
                  </div>
                ))}
              </div>
            </div>

            {completedToday && (
              <div className="rounded-xl border border-emerald-100 bg-emerald-50 text-emerald-700 text-sm font-semibold px-3 py-2">
                Completed for today
              </div>
            )}
          </div>
        </DashboardCard>
      </div>
    </GlobalLayout>
  );
};

export default FocusSessionTemplate;
