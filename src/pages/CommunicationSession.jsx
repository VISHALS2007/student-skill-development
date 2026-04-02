import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";
import "../styles/CommunicationSession.css";
import { updateAttendanceRecord } from "../services/attendanceService";

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

const CommunicationSession = () => {
  const { state } = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const sessionInfo = React.useMemo(() => {
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
  const [remainingTime, setRemainingTime] = useState(durationMinutes * 60);
  const [topic, setTopic] = useState("");
  const [isPaused, setIsPaused] = useState(false);
  const [error, setError] = useState("");
  const [hasStarted, setHasStarted] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const finishedRef = useRef(false);
  const pausedRef = useRef(false);
  const autoStartRef = useRef(false);
  const restartingCamRef = useRef(false);
  const startedRef = useRef(false);

  const attachTrackGuards = (stream) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => {
      track.onended = async () => {
        if (finishedRef.current) return;
        if (restartingCamRef.current) return;
        restartingCamRef.current = true;
        await startCamera();
        restartingCamRef.current = false;
      };
    });
  };

  const formatTime = (totalSeconds) => {
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  const exitFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
  };

  const saveCompletion = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      await addDoc(collection(db, "users", user.uid, "activityHistory"), {
        userId: user.uid,
        skillName: sessionInfo?.skillName || "Communication Skills",
        activityName: sessionInfo?.activityName || sessionInfo?.taskName || "Communication Practice",
        duration: durationMinutes,
        date: today,
        status: "completed",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "users", user.uid, "dailyTasks"), {
        taskName: sessionInfo?.taskName || "communication",
        durationMinutes,
        date: today,
        status: "completed",
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Failed to save communication session", err);
    }
  };

  const completeSession = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    startedRef.current = false;
    stopCamera();
    exitFullscreen();
    sessionStorage.removeItem("commSessionInfo");
    clearInterval(intervalRef.current);
    await saveCompletion();
    updateAttendanceRecord(user?.uid).catch(() => {});
    navigate("/dashboard", { replace: true });
  };

  const requestFullscreen = async () => {
    const target = document.documentElement;
    if (!target.requestFullscreen) return true;
    try {
      await target.requestFullscreen();
      return true;
    } catch (err) {
      console.error("Fullscreen failed", err);
      return false;
    }
  };

  const startCamera = async () => {
    if (!navigator?.mediaDevices) {
      setError("Camera access is required for communication practice.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      attachTrackGuards(stream);
      return true;
    } catch (err) {
      console.error("Unable to start camera", err);
      setError("Camera access is required for communication practice.");
      return false;
    }
  };

  useEffect(() => {
    sessionStorage.setItem("commSessionInfo", JSON.stringify(sessionInfo));

    const handleVisibility = () => {
      if (!startedRef.current) return;
      if (document.hidden) {
        pausedRef.current = true;
        setIsPaused(true);
      } else {
        pausedRef.current = false;
        setIsPaused(false);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      clearInterval(intervalRef.current);
      stopCamera();
      exitFullscreen();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExit = () => {
    startedRef.current = false;
    stopCamera();
    exitFullscreen();
    sessionStorage.removeItem("commSessionInfo");
    clearInterval(intervalRef.current);
    navigate("/dashboard", { replace: true });
  };

  const startCommunicationSession = async () => {
    setError("");
    setIsStarting(true);
    finishedRef.current = false;
    startedRef.current = true;
    const nextTopic = TOPICS[Math.floor(Math.random() * TOPICS.length)];
    setTopic(nextTopic);
    const camOk = await startCamera();
    if (!camOk) {
      setIsStarting(false);
      setHasStarted(false);
      exitFullscreen();
      return;
    }
    const fsOk = await requestFullscreen();
    if (!fsOk) {
      stopCamera();
      setIsStarting(false);
      setHasStarted(false);
      return;
    }
    setHasStarted(true);
    pausedRef.current = false;
    setIsPaused(false);
    setRemainingTime(durationMinutes * 60);
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setRemainingTime((prev) => {
        if (pausedRef.current) return prev;
        if (prev <= 1) {
          clearInterval(intervalRef.current);
          completeSession();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    setIsStarting(false);
  };

  const handlePause = () => {
    pausedRef.current = true;
    setIsPaused(true);
  };
  const handleResume = () => {
    pausedRef.current = false;
    setIsPaused(false);
  };

  useEffect(() => {
    if (state?.autoStart && !hasStarted && !isStarting && !autoStartRef.current) {
      autoStartRef.current = true;
      startCommunicationSession();
    }
  }, [state, hasStarted, isStarting]);

  useEffect(() => {
    const checkCamera = async () => {
      if (!hasStarted || finishedRef.current) return;
      const tracks = streamRef.current?.getTracks() || [];
      const ended = tracks.length === 0 || tracks.every((t) => t.readyState === "ended");
      if (ended && !restartingCamRef.current) {
        restartingCamRef.current = true;
        await startCamera();
        restartingCamRef.current = false;
      }
    };
    const t = setInterval(checkCamera, 3000);
    return () => clearInterval(t);
  }, [hasStarted]);

  return (
    <div className="comm-fullshell">
      <video ref={videoRef} autoPlay playsInline muted className="comm-video-full" />
      <div className="comm-overlay-top">
        <div className="comm-pill">Communication Practice</div>
        <div className="comm-topic-text">
          <span className="comm-topic-label">Topic:</span> {topic || "Tap start to generate"}
        </div>
        <button className="topic-refresh" onClick={() => setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)])} disabled={!hasStarted}>
          New topic
        </button>
      </div>
      <div className="comm-overlay-bottom">
        <div className="comm-timer-large">{formatTime(remainingTime)}</div>
        <div className="comm-actions-inline">
          {!hasStarted ? (
            <button className="comm-btn primary" onClick={startCommunicationSession} disabled={isStarting}>
              {isStarting ? "Starting..." : "Start"}
            </button>
          ) : (
            <>
              <button className="comm-btn secondary" onClick={handleExit}>Stop</button>
              {isPaused ? (
                <button className="comm-btn primary" onClick={handleResume}>Resume</button>
              ) : (
                <button className="comm-btn primary" onClick={handlePause}>Pause</button>
              )}
            </>
          )}
        </div>
      </div>
      {error && <div className="comm-error">{error}</div>}
    </div>
  );
};

export default CommunicationSession;
