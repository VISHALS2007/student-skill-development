import React, { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";
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
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const intervalRef = useRef(null);
  const finishedRef = useRef(false);
  const pausedRef = useRef(false);

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
    } catch (err) {
      console.error("Failed to save communication session", err);
    }
  };

  const completeSession = async () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    stopCamera();
    sessionStorage.removeItem("commSessionInfo");
    clearInterval(intervalRef.current);
    await saveCompletion();
    navigate("/dashboard", { replace: true });
  };

  const startCamera = async () => {
    if (!navigator?.mediaDevices) {
      alert("Camera not supported on this device.");
      navigate("/dashboard", { replace: true });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Unable to start camera", err);
      alert("Unable to access camera. Please check permissions.");
      navigate("/dashboard", { replace: true });
    }
  };

  useEffect(() => {
    sessionStorage.setItem("commSessionInfo", JSON.stringify(sessionInfo));
    setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)]);
    startCamera();
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

    return () => {
      clearInterval(intervalRef.current);
      stopCamera();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExit = () => {
    stopCamera();
    sessionStorage.removeItem("commSessionInfo");
    clearInterval(intervalRef.current);
    navigate("/dashboard", { replace: true });
  };

  const handlePause = () => {
    pausedRef.current = true;
    setIsPaused(true);
  };
  const handleResume = () => {
    pausedRef.current = false;
    setIsPaused(false);
  };

  return (
    <div className="communication-shell">
      <div className="comm-card">
        <div className="comm-header">
          <div>
            <p className="comm-eyebrow">Communication Practice</p>
            <h1 className="comm-title">Improve speaking with camera + prompts</h1>
          </div>
          <div className="comm-timer">{formatTime(remainingTime)}</div>
        </div>

        <div className="comm-topic">
          <div className="topic-label">Speak about</div>
          <div className="topic-row">
            <p className="topic-text">{topic}</p>
            <button className="topic-refresh" onClick={() => setTopic(TOPICS[Math.floor(Math.random() * TOPICS.length)])}>
              New topic
            </button>
          </div>
        </div>

        <div className="comm-video-wrap">
          <video ref={videoRef} autoPlay playsInline className="comm-video" muted />
        </div>

        <div className="comm-actions">
          <button className="comm-btn secondary" onClick={handleExit}>Stop</button>
          {isPaused ? (
            <button className="comm-btn primary" onClick={handleResume}>Resume</button>
          ) : (
            <button className="comm-btn primary" onClick={handlePause}>Pause</button>
          )}
        </div>
      </div>
    </div>
  );
};

export default CommunicationSession;
