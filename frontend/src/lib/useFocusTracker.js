import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { recordFocusSession, ALLOWED_SITES, PLATFORM_URLS, formatDateKey } from "./focusService";

const nowIso = () => new Date().toISOString();
const isAllowedDomain = (domain, allowedSites) => {
  if (!domain) return false;
  return allowedSites.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`));
};
const getWindowDomain = (winRef) => {
  try {
    const host = winRef?.location?.hostname || "";
    return host || "";
  } catch (err) {
    return "";
  }
};

export function useFocusTracker(userId, config = {}) {
  const allowedSites = config.allowedSites && config.allowedSites.length ? config.allowedSites : ALLOWED_SITES;
  const platformUrls = useMemo(() => ({ ...PLATFORM_URLS, ...(config.platformUrls || {}) }), [config.platformUrls]);
  const storageKeyPrefix = config.storageKeyPrefix || "focus";
  const storageKeys = useMemo(
    () => ({
      start: `${storageKeyPrefix}StartTime`,
      paused: `${storageKeyPrefix}PausedTime`,
    }),
    [storageKeyPrefix]
  );
  const targetStorageKey = useMemo(() => `${storageKeyPrefix}Targets`, [storageKeyPrefix]);
  const inactivityStorageKey = useMemo(() => `${storageKeyPrefix}InactivitySeconds`, [storageKeyPrefix]);

  const [status, setStatus] = useState("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [activeDomain, setActiveDomain] = useState("");
  const [platformName, setPlatformName] = useState("");
  const [message, setMessage] = useState("Idle");
  const [tabSwitches, setTabSwitches] = useState(0);
  const [selectedDomain, setSelectedDomain] = useState(allowedSites[0]);
  const [targetMinutes, setTargetMinutes] = useState(30);
  const [completionStatus, setCompletionStatus] = useState("pending");
  const [perSiteTargets, setPerSiteTargets] = useState(() => {
    const fallback = allowedSites.reduce((acc, site) => ({ ...acc, [site]: 30 }), {});
    try {
      const stored = localStorage.getItem(targetStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        return { ...fallback, ...parsed };
      }
    } catch (err) {
      /* ignore */
    }
    return fallback;
  });
  const [inactivitySeconds, setInactivitySeconds] = useState(() => {
    try {
      const stored = Number(localStorage.getItem(inactivityStorageKey));
      return Number.isFinite(stored) && stored >= 10 ? stored : 45;
    } catch (err) {
      return 45;
    }
  });
  const [eventLog, setEventLog] = useState([]);

  const startRef = useRef(null);
  const startTimeRef = useRef(null);
  const pauseStartRef = useRef(null);
  const pausedTimeRef = useRef(0);
  const targetMsRef = useRef(targetMinutes * 60 * 1000);
  const intervalRef = useRef(null);
  const statusRef = useRef("idle");
  const windowRef = useRef(null);
  const stopRef = useRef(null);
  const lastActivityRef = useRef(Date.now());
  const eventLogRef = useRef([]);

  const detectedDomain = useMemo(() => {
    const host = window?.location?.hostname || "";
    const match = allowedSites.find((d) => host.includes(d));
    return match || "";
  }, [allowedSites]);

  const allowedDomain = useMemo(() => {
    if (detectedDomain) return detectedDomain;
    return selectedDomain;
  }, [detectedDomain, selectedDomain]);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const resetAll = useCallback(() => {
    setStatus("idle");
    statusRef.current = "idle";
    setElapsedMs(0);
    setActiveDomain("");
    setPlatformName("");
    setMessage("Idle");
    setTabSwitches(0);
    setCompletionStatus("pending");
    setEventLog([]);
    eventLogRef.current = [];
    pausedTimeRef.current = 0;
    startRef.current = null;
    startTimeRef.current = null;
    pauseStartRef.current = null;
    clearTimer();
    windowRef.current = null;
    lastActivityRef.current = Date.now();
  }, [clearTimer]);

  const logEvent = useCallback((type, reason) => {
    const entry = { type, reason, at: new Date().toISOString() };
    eventLogRef.current = [entry, ...eventLogRef.current].slice(0, 50);
    setEventLog(eventLogRef.current);
  }, []);

  const tick = useCallback(() => {
    if (statusRef.current !== "running") return;
    const now = Date.now();

    if (windowRef.current && windowRef.current.closed) {
      clearTimer();
      setStatus("stopped");
      statusRef.current = "stopped";
      setMessage("Stopped (tab closed)");
      windowRef.current = null;
      return;
    }

    const windowDomain = windowRef.current ? getWindowDomain(windowRef.current) : "";
    const domainAllowed = windowDomain ? isAllowedDomain(windowDomain, allowedSites) : isAllowedDomain(allowedDomain, allowedSites);

    if (!domainAllowed) {
      if (pauseStartRef.current === null) pauseStartRef.current = now;
      clearTimer();
      setStatus("paused");
      statusRef.current = "paused";
      setMessage("Paused - non-learning site detected");
      logEvent("pause", "non-learning-site");
      return;
    }

    if (lastActivityRef.current && inactivitySeconds > 0) {
      const inactiveFor = now - lastActivityRef.current;
      if (inactiveFor >= inactivitySeconds * 1000 && statusRef.current === "running") {
        clearTimer();
        setStatus("paused");
        statusRef.current = "paused";
        setMessage("Paused - inactivity");
        logEvent("pause", "inactivity");
        pauseStartRef.current = Date.now();
        return;
      }
    }

    if (pauseStartRef.current !== null) {
      pausedTimeRef.current += now - pauseStartRef.current;
      pauseStartRef.current = null;
    }

    if (windowDomain && windowDomain !== activeDomain) {
      setActiveDomain(windowDomain);
    }

    if (startTimeRef.current === null) startTimeRef.current = now;
    const activeMs = now - startTimeRef.current - pausedTimeRef.current;
    setElapsedMs(activeMs);
    setStatus("running");
    statusRef.current = "running";
    setMessage("Active");

    const hasTarget = targetMsRef.current > 0;
    if (hasTarget && activeMs >= targetMsRef.current) {
      stopRef.current?.();
      return;
    }
  }, [allowedDomain, clearTimer, inactivitySeconds, logEvent, allowedSites]);

  const startInterval = useCallback(() => {
    clearTimer();
    // run an immediate tick to update UI without waiting 1s
    tick();
    intervalRef.current = setInterval(tick, 1000);
  }, [clearTimer, tick]);

  useEffect(() => {
    const safeMinutes = Number.isFinite(targetMinutes) ? Math.max(1, targetMinutes) : 30;
    targetMsRef.current = safeMinutes * 60 * 1000;
  }, [targetMinutes]);

  useEffect(() => {
    try {
      localStorage.setItem(targetStorageKey, JSON.stringify(perSiteTargets));
    } catch (err) {
      /* ignore */
    }
  }, [perSiteTargets, targetStorageKey]);

  useEffect(() => {
    const domainTarget = perSiteTargets[selectedDomain];
    if (domainTarget && domainTarget !== targetMinutes) {
      setTargetMinutes(domainTarget);
    }
  }, [perSiteTargets, selectedDomain]);

  const updateTargetForDomain = useCallback(
    (domain, minutes) => {
      const safe = Math.max(1, minutes || 1);
      setPerSiteTargets((prev) => ({ ...prev, [domain]: safe }));
      if (domain === selectedDomain) {
        setTargetMinutes(safe);
        targetMsRef.current = safe * 60 * 1000;
      }
    },
    [selectedDomain]
  );

  useEffect(() => {
    try {
      localStorage.setItem(inactivityStorageKey, String(inactivitySeconds));
    } catch (err) {
      /* ignore */
    }
  }, [inactivitySeconds, inactivityStorageKey]);

  useEffect(() => {
    const storedStart = sessionStorage.getItem(storageKeys.start);
    const storedPaused = sessionStorage.getItem(storageKeys.paused);
    if (storedStart) {
      startTimeRef.current = Number(storedStart);
      pausedTimeRef.current = storedPaused ? Number(storedPaused) : 0;
      setStatus("running");
      statusRef.current = "running";
      setMessage("Active");
      startInterval();
    }
    return () => {
      clearTimer();
    };
  }, [clearTimer, startInterval, storageKeys.paused, storageKeys.start]);

  const start = useCallback(() => {
    const domain = allowedDomain;
    const url = platformUrls[domain];
    if (!domain) {
      setMessage("Select an allowed site to start");
      return;
    }
    resetAll();
    const targetForDomain = perSiteTargets[domain] || targetMinutes;
    setTargetMinutes(targetForDomain);
    targetMsRef.current = targetForDomain * 60 * 1000;
    const now = Date.now();
    startRef.current = now;
    startTimeRef.current = now;
    sessionStorage.setItem(storageKeys.start, String(now));
    sessionStorage.setItem(storageKeys.paused, "0");
    setActiveDomain(domain);
    setPlatformName(domain);
    setStatus("running");
    statusRef.current = "running";
    setMessage("Active");
    setElapsedMs(0);
    setCompletionStatus("pending");
    logEvent("start", domain);
    lastActivityRef.current = now;
    startInterval();
    if (url) {
      windowRef.current = window.open(url, "_blank", "noopener,noreferrer");
    }
  }, [allowedDomain, resetAll, startInterval, perSiteTargets, logEvent, targetMinutes, platformUrls, storageKeys.paused, storageKeys.start]);

  const startWithPlatform = useCallback(
    (domain) => {
      setSelectedDomain(domain);
      const url = platformUrls[domain];

      // If a session is already running or paused, just switch the active site without resetting the timer.
      if (statusRef.current === "running" || statusRef.current === "paused") {
        setActiveDomain(domain);
        setPlatformName(domain);
        if (url) {
          windowRef.current = window.open(url, "_blank", "noopener,noreferrer");
        }
        logEvent("switch", domain);
        lastActivityRef.current = Date.now();
        return;
      }

      // Fresh start
      resetAll();
      const targetForDomain = perSiteTargets[domain] || targetMinutes;
      setTargetMinutes(targetForDomain);
      targetMsRef.current = targetForDomain * 60 * 1000;
      const now = Date.now();
      startRef.current = now;
      startTimeRef.current = now;
      sessionStorage.setItem(storageKeys.start, String(now));
      sessionStorage.setItem(storageKeys.paused, "0");
      setActiveDomain(domain);
      setPlatformName(domain);
      setStatus("running");
      statusRef.current = "running";
      setMessage("Active");
      setElapsedMs(0);
      setCompletionStatus("pending");
      logEvent("start", domain);
      lastActivityRef.current = now;
      startInterval();
      if (url) {
        windowRef.current = window.open(url, "_blank", "noopener,noreferrer");
      }
    },
    [resetAll, startInterval, perSiteTargets, logEvent, targetMinutes, platformUrls, storageKeys.paused, storageKeys.start]
  );

  const pause = useCallback(() => {
    if (status !== "running") return;
    clearTimer();
    setStatus("paused");
    statusRef.current = "paused";
    setMessage("Paused");
    pauseStartRef.current = Date.now();
    sessionStorage.setItem(storageKeys.paused, String(pausedTimeRef.current));
    logEvent("pause", "manual");
  }, [status, clearTimer, logEvent]);

  const resume = useCallback(() => {
    if (status !== "paused") return;
    const now = Date.now();
    if (pauseStartRef.current !== null) {
      pausedTimeRef.current += now - pauseStartRef.current;
      sessionStorage.setItem(storageKeys.paused, String(pausedTimeRef.current));
      pauseStartRef.current = null;
    }
    startTimeRef.current = startTimeRef.current ?? now;
    setStatus("running");
    statusRef.current = "running";
    setMessage("Active");
    setElapsedMs(now - startTimeRef.current - pausedTimeRef.current);
    lastActivityRef.current = now;
    logEvent("resume", "focus");
    startInterval();
  }, [status, startInterval, logEvent]);

  const classifyCompletion = useCallback((activeMs) => {
    const target = targetMsRef.current || activeMs || 1;
    const ratio = activeMs / target;
    if (ratio < 0.3) return "incomplete";
    if (ratio < 0.7) return "partial";
    return "completed";
  }, []);

  const stop = useCallback(async () => {
    clearTimer();
    const now = Date.now();
    const activeMs = startTimeRef.current ? now - startTimeRef.current - pausedTimeRef.current : elapsedMs;
    const durationMs = Math.max(activeMs, elapsedMs);
    const startedAt = startRef.current ? new Date(startRef.current).toISOString() : nowIso();
    const endedAt = nowIso();
    const completion = classifyCompletion(durationMs);
    setStatus("stopped");
    statusRef.current = "stopped";
    setMessage(`Stopped (${completion})`);
    setCompletionStatus(completion);
    logEvent("stop", completion);
    if (userId && durationMs > 0 && activeDomain) {
      await recordFocusSession(userId, {
        durationMs,
        domain: activeDomain,
        platformName,
        startedAt,
        endedAt,
        tabSwitches,
        pausedMs: pausedTimeRef.current,
        status: completion,
        interruptions: tabSwitches,
        focusScore:
          durationMs + pausedTimeRef.current > 0
            ? Math.round((durationMs / (durationMs + pausedTimeRef.current)) * 100)
            : 100,
        events: eventLogRef.current,
        dateKey: formatDateKey(new Date(startedAt)),
      });
    }
    windowRef.current = null;
    sessionStorage.removeItem(storageKeys.start);
    sessionStorage.removeItem(storageKeys.paused);
    return { durationMs, startedAt, endedAt, completion };
  }, [elapsedMs, userId, activeDomain, platformName, tabSwitches, classifyCompletion, clearTimer, logEvent, storageKeys.paused, storageKeys.start]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden && statusRef.current === "running") {
        setTabSwitches((prev) => prev + 1);
        logEvent("pause", "tab-switch");
        pause();
      } else if (!document.hidden && statusRef.current === "paused") {
        logEvent("resume", "tab-focus");
        resume();
      }
    };

    const handleBlur = () => {
      if (statusRef.current === "running") {
        setTabSwitches((prev) => prev + 1);
        logEvent("pause", "window-blur");
        pause();
      }
    };

    const handleFocus = () => {
      if (statusRef.current === "paused") {
        logEvent("resume", "window-focus");
        resume();
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("focus", handleFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("blur", handleBlur);
      window.removeEventListener("focus", handleFocus);
    };
  }, [pause, resume, logEvent]);

  useEffect(() => {
    const markActive = () => {
      lastActivityRef.current = Date.now();
    };
    window.addEventListener("mousemove", markActive);
    window.addEventListener("keydown", markActive);
    window.addEventListener("pointerdown", markActive);
    return () => {
      window.removeEventListener("mousemove", markActive);
      window.removeEventListener("keydown", markActive);
      window.removeEventListener("pointerdown", markActive);
    };
  }, []);

  return {
    status,
    elapsedMs,
    activeDomain,
    message,
    tabSwitches,
    pausedMs: pausedTimeRef.current,
    targetMinutes,
    setTargetMinutes,
    perSiteTargets,
    setPerSiteTargets,
    inactivitySeconds,
    setInactivitySeconds,
    updateTargetForDomain,
    completionStatus,
    focusScore: elapsedMs + pausedTimeRef.current > 0 ? Math.round((elapsedMs / (elapsedMs + pausedTimeRef.current)) * 100) : 100,
    events: eventLog,
    allowedDomain,
    selectedDomain,
    setSelectedDomain,
    start,
    startWithPlatform,
    pause,
    resume,
    stop,
  };
}