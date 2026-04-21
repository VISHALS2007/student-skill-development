import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";
import { updateAttendanceRecord } from "../services/attendanceService";
import "../styles/CommunicationSession.css";

const TOPICS = [
  "Introduce yourself",
  "Explain your favorite programming language",
  "Describe a project you worked on",
  "Explain how the internet works",
  "Talk about your career goal",
  "Describe a problem you solved",
  "Explain artificial intelligence in simple terms",
  "Describe your favorite technology",
  "Explain what motivates you",
  "Talk about a challenge you faced",
  "Describe your dream job",
  "Explain the importance of teamwork",
  "Describe your learning strategy",
  "Explain cloud computing",
  "Describe how you manage time",
  "Explain your favorite algorithm",
  "Talk about your strengths",
  "Talk about your weaknesses",
  "Explain a recent technology trend",
  "Describe your college experience",
  "Explain why communication skills are important",
  "Describe a leadership experience",
  "Explain problem solving strategy",
  "Talk about your biggest achievement",
  "Explain how you handle stress",
  "Describe your ideal workplace",
  "Explain version control to a beginner",
  "Describe a time you resolved conflict",
  "Explain how you learn new tech quickly",
  "Describe an app idea and why",
];

const SESSION_STATE_KEY = "commSessionState:v1";
const COMM_SESSION_COMPLETED_KEY = "commSessionCompleted:v1";

const getRandomTopic = () => TOPICS[Math.floor(Math.random() * TOPICS.length)];

const CommunicationSession = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const shellRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const finishedRef = useRef(false);
  const runEndAtRef = useRef(null);
  const remainingTimeRef = useRef(0);

  const sessionInfo = useMemo(() => {
    const stored = sessionStorage.getItem("commSessionInfo");
    if (state?.durationMinutes) return state;
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch (err) {
        console.error("Invalid stored session info", err);
      }
    }
    return { taskName: "Communication Practice", category: "Communication", durationMinutes: 5 };
  }, [state]);

  const durationMinutes = Number(sessionInfo?.durationMinutes) || 5;
  const resumeSession = Boolean(sessionInfo?.resumeSession);
  const sessionInstanceId = String(sessionInfo?.sessionInstanceId || "").trim();
  const sessionKey = useMemo(
    () => `${String(sessionInfo?.taskName || "Communication Practice")}::${durationMinutes}::${sessionInstanceId || "default"}`,
    [durationMinutes, sessionInfo?.taskName, sessionInstanceId]
  );

  const [remainingTime, setRemainingTime] = useState(durationMinutes * 60);
  const [topic, setTopic] = useState(getRandomTopic());
  const [isManualPaused, setIsManualPaused] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [isFinished, setIsFinished] = useState(false);
  const [error, setError] = useState("");
  const shouldRunTimer = hydrated && isFullscreen && !isManualPaused && !isFinished;

  useEffect(() => {
    remainingTimeRef.current = Math.max(0, Number(remainingTime) || 0);
  }, [remainingTime]);

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const exitFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement && document.exitFullscreen) {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore fullscreen exit failures.
    }
  }, []);

  const requestFullscreen = useCallback(async () => {
    const node = shellRef.current;
    if (!node?.requestFullscreen) {
      setError("Fullscreen is not supported in this browser.");
      return;
    }
    try {
      await node.requestFullscreen();
      setError("");
    } catch {
      setError("Tap Enter Full Screen to start timer.");
    }
  }, []);

  const saveCompletion = useCallback(async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const normalizedSkillName = String(sessionInfo?.skillName || sessionInfo?.taskName || "Communication Practice").trim();
      await addDoc(collection(db, "users", user.uid, "activityHistory"), {
        userId: user.uid,
        skillName: normalizedSkillName,
        activityName: sessionInfo?.activityName || sessionInfo?.taskName || "Communication Practice",
        duration: durationMinutes,
        date: today,
        status: "completed",
        createdAt: serverTimestamp(),
      });

      await updateAttendanceRecord(
        user.uid,
        Array.isArray(sessionInfo?.skillsSnapshot) && sessionInfo.skillsSnapshot.length > 0 ? sessionInfo.skillsSnapshot : undefined
      ).catch(() => null);

      try {
        sessionStorage.setItem(
          COMM_SESSION_COMPLETED_KEY,
          JSON.stringify({
            skillName: normalizedSkillName,
            taskName: String(sessionInfo?.taskName || normalizedSkillName),
            durationMinutes,
            date: today,
            at: Date.now(),
          })
        );
      } catch {
        // Ignore session storage errors.
      }
    } catch (err) {
      console.error("Failed to save communication session", err);
    }
  }, [durationMinutes, sessionInfo?.activityName, sessionInfo?.skillName, sessionInfo?.skillsSnapshot, sessionInfo?.taskName, user]);

  const saveSessionSummary = useCallback((status = "completed") => {
    const today = new Date().toISOString().split("T")[0];
    try {
      sessionStorage.setItem(
        COMM_SESSION_COMPLETED_KEY,
        JSON.stringify({
          skillName: String(sessionInfo?.skillName || sessionInfo?.taskName || "Communication Practice").trim(),
          taskName: String(sessionInfo?.taskName || sessionInfo?.skillName || "Communication Practice").trim(),
          durationMinutes,
          remainingTime: Math.max(0, Math.round(remainingTimeRef.current || remainingTime || 0)),
          status,
          date: today,
          at: Date.now(),
        })
      );
    } catch {
      // Ignore session storage errors.
    }
  }, [durationMinutes, remainingTime, sessionInfo?.skillName, sessionInfo?.taskName]);

  const completeSession = useCallback(async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    setIsFinished(true);
    stopCamera();
    sessionStorage.removeItem("commSessionInfo");
    sessionStorage.removeItem(SESSION_STATE_KEY);
    sessionStorage.removeItem("commSessionState:v1");
    clearInterval(intervalRef.current);
    await exitFullscreen();
    await saveCompletion();
    navigate("/dashboard", { replace: true });
  }, [exitFullscreen, navigate, saveCompletion, stopCamera]);

  const startCamera = useCallback(async () => {
    if (!navigator?.mediaDevices) {
      setError("Camera is not supported on this device.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setError("");
    } catch (err) {
      console.error("Unable to start camera", err);
      setError("Unable to access camera. Please check permissions.");
    }
  }, []);

  useEffect(() => {
    setHydrated(false);
    setIsFinished(false);
    finishedRef.current = false;
    const fallbackRemaining = Math.max(0, Number(sessionInfo?.remainingTime || durationMinutes * 60) || durationMinutes * 60);
    const sessionResumeRemaining = Math.max(0, Number(sessionInfo?.remainingTime || fallbackRemaining) || fallbackRemaining);

    if (!resumeSession) {
      sessionStorage.removeItem(SESSION_STATE_KEY);
      setRemainingTime(durationMinutes * 60);
      setTopic(getRandomTopic());
      setIsManualPaused(false);
      setHydrated(true);
      return;
    }

    const raw = sessionStorage.getItem(SESSION_STATE_KEY);
    if (!raw) {
      setRemainingTime(sessionResumeRemaining);
      setTopic(getRandomTopic());
      setIsManualPaused(Boolean(sessionInfo?.isManualPaused));
      setHydrated(true);
      return;
    }

    try {
      const parsed = JSON.parse(raw);
      if (parsed?.sessionKey === sessionKey) {
        const nextRemaining = Number(parsed?.remainingTime);
        setRemainingTime(Number.isFinite(nextRemaining) ? Math.max(0, nextRemaining) : durationMinutes * 60);
        setTopic(String(parsed?.topic || "").trim() || getRandomTopic());
        setIsManualPaused(Boolean(parsed?.isManualPaused));
        setHydrated(true);
        return;
      }
    } catch {
      // Ignore invalid state and continue with defaults.
    }

    setRemainingTime(fallbackRemaining);
    setTopic(getRandomTopic());
    setIsManualPaused(Boolean(sessionInfo?.isManualPaused));
    setHydrated(true);
  }, [durationMinutes, resumeSession, sessionInfo?.isManualPaused, sessionInfo?.remainingTime, sessionKey]);

  useEffect(() => {
    if (!hydrated || isFinished || finishedRef.current) return;
    const sessionStatus = shouldRunTimer ? "running" : isManualPaused ? "paused" : "idle";
    sessionStorage.setItem(
      "commSessionInfo",
      JSON.stringify({
        ...sessionInfo,
        remainingTime,
        isManualPaused,
        status: sessionStatus,
        resumeSession: true,
        sessionInstanceId,
      })
    );
    sessionStorage.setItem(
      SESSION_STATE_KEY,
      JSON.stringify({
        sessionKey,
        sessionInstanceId,
        resumeSession: true,
        taskName: sessionInfo?.taskName || "Communication Practice",
        skillName: sessionInfo?.skillName || sessionInfo?.taskName || "Communication Practice",
        activityName: sessionInfo?.activityName || sessionInfo?.taskName || "Communication Practice",
        durationMinutes,
        remainingTime,
        topic,
        isManualPaused,
        status: sessionStatus,
        updatedAt: Date.now(),
      })
    );
  }, [hydrated, isFinished, isManualPaused, remainingTime, sessionInfo, sessionKey, sessionInstanceId, shouldRunTimer, topic, durationMinutes]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };

    handleFullscreenChange();
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  useEffect(() => {
    startCamera();
    requestFullscreen();
    return () => {
      clearInterval(intervalRef.current);
      stopCamera();
    };
  }, [requestFullscreen, startCamera, stopCamera]);

  const syncRemainingFromClock = useCallback(() => {
    const endAt = Number(runEndAtRef.current || 0);
    if (!endAt) return;
    const nextRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
    setRemainingTime((prev) => (prev === nextRemaining ? prev : nextRemaining));
  }, []);

  useEffect(() => {
    clearInterval(intervalRef.current);
    if (!shouldRunTimer) {
      syncRemainingFromClock();
      runEndAtRef.current = null;
      return;
    }

    const nextEndAt = Date.now() + remainingTimeRef.current * 1000;
    runEndAtRef.current = nextEndAt;

    intervalRef.current = setInterval(() => {
      const endAt = Number(runEndAtRef.current || 0);
      if (!endAt) return;
      const nextRemaining = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));

      if (nextRemaining <= 0) {
        clearInterval(intervalRef.current);
        runEndAtRef.current = null;
        setRemainingTime(0);
        completeSession();
        return;
      }

      setRemainingTime((prev) => (prev === nextRemaining ? prev : nextRemaining));
    }, 250);

    return () => {
      clearInterval(intervalRef.current);
    };
  }, [completeSession, shouldRunTimer, syncRemainingFromClock]);

  const handleStop = async () => {
    finishedRef.current = true;
    setIsFinished(true);
    clearInterval(intervalRef.current);
    stopCamera();
    saveSessionSummary(isManualPaused ? "paused" : "stopped");
    sessionStorage.removeItem("commSessionInfo");
    sessionStorage.removeItem(SESSION_STATE_KEY);
    sessionStorage.removeItem("commSessionState:v1");
    await exitFullscreen();
    navigate("/dashboard", { replace: true });
  };

  const handleDashboard = async () => {
    finishedRef.current = true;
    setIsFinished(true);
    clearInterval(intervalRef.current);
    stopCamera();
    saveSessionSummary(isManualPaused ? "paused" : "stopped");
    sessionStorage.removeItem("commSessionInfo");
    sessionStorage.removeItem(SESSION_STATE_KEY);
    sessionStorage.removeItem("commSessionState:v1");
    await exitFullscreen();
    navigate("/dashboard", { replace: true });
  };

  const togglePause = () => {
    setIsManualPaused((prev) => !prev);
  };

  return (
    <div className="comm-fullshell" ref={shellRef}>
      <video ref={videoRef} autoPlay playsInline className="comm-video-full" muted />

      <div className="comm-overlay-top">
        <div className="comm-top-left">
          <p className="comm-pill">Communication Practice</p>
          <h1 className="comm-headline">Improve speaking with camera + prompts</h1>
          <p className="comm-note">Timer runs only in full screen. Press Esc to exit full screen and pause timer.</p>
        </div>

        <div className="comm-top-right">
          <div className="comm-timer-large">{formatTime(remainingTime)}</div>
          <div className={`comm-pill ${shouldRunTimer ? "is-running" : "is-paused"}`}>
            {shouldRunTimer ? "Running" : "Paused"}
          </div>
        </div>
      </div>

      <div className="comm-overlay-bottom">
        <div className="comm-topic-row">
          <span className="comm-topic-label">Speak about</span>
          <span className="comm-topic-text">{topic}</span>
        </div>

        <div className="comm-actions-inline">
          <button className="topic-refresh" onClick={() => setTopic(getRandomTopic())}>
            New topic
          </button>
          <button className="comm-btn secondary" onClick={togglePause}>
            {isManualPaused ? "Resume" : "Pause"}
          </button>
          {!isFullscreen ? (
            <button className="comm-btn secondary" onClick={requestFullscreen}>
              Enter Full Screen
            </button>
          ) : null}
          <button className="comm-btn secondary" onClick={handleDashboard}>
            Dashboard
          </button>
          <button className="comm-btn primary" onClick={handleStop}>
            Stop
          </button>
        </div>
      </div>

      {error ? <div className="comm-error">{error}</div> : null}
    </div>
  );
};

export default CommunicationSession;
