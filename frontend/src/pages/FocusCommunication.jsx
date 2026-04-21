import React, { useCallback, useEffect, useRef, useState } from "react";
import { addDoc, collection, getDocs, query, serverTimestamp, where } from "firebase/firestore";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";

const topics = [
  "Introduce yourself",
  "Explain your favorite programming language",
  "Describe a project you worked on",
  "Explain how the internet works",
  "Talk about your career goals",
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
  "Explain your problem solving strategy",
  "Talk about your biggest achievement",
  "Explain how you handle stress",
  "Describe your ideal workplace",
];

const FIVE_MINUTES_MS = 5 * 60 * 1000;

const FocusCommunication = () => {
  const { user } = useAuth();
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const timerRef = useRef(null);
  const fullscreenTargetRef = useRef(null);
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [remainingMs, setRemainingMs] = useState(5 * 60 * 1000);
  const [status, setStatus] = useState("idle");
  const [topic, setTopic] = useState(topics[0]);
  const [sessionStart, setSessionStart] = useState("");
  const [completedToday, setCompletedToday] = useState(false);
  const [loading, setLoading] = useState(true);

  const formatTime = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(total / 60)
      .toString()
      .padStart(2, "0");
    const s = (total % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const pickTopic = () => {
    const idx = Math.floor(Math.random() * topics.length);
    setTopic(topics[idx]);
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const markCompletion = useCallback(async () => {
    if (!user?.uid) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      await addDoc(collection(db, "users", user.uid, "dailyTasks"), {
        taskName: "communication",
        durationMinutes: durationMinutes,
        date: today,
        status: "completed",
        createdAt: serverTimestamp(),
      });
      await addDoc(collection(db, "users", user.uid, "taskSessions"), {
        taskType: "communication",
        platform: "speaking-practice",
        durationMinutes,
        durationMs: durationMinutes * 60 * 1000,
        date: today,
        focusScore: 100,
        completion: "completed",
        startTime: sessionStart || new Date(Date.now() - FIVE_MINUTES_MS).toISOString(),
        endTime: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      setCompletedToday(true);
    } catch (err) {
      console.error("Failed to log communication completion", err);
    }
  }, [durationMinutes, sessionStart, user?.uid]);

  useEffect(() => {
    const loadCompletion = async () => {
      if (!user?.uid) {
        setLoading(false);
        return;
      }
      const today = new Date().toISOString().split("T")[0];
      try {
        const q = query(collection(db, "users", user.uid, "dailyTasks"), where("date", "==", today), where("taskName", "==", "communication"));
        const snap = await getDocs(q);
        setCompletedToday(!snap.empty);
      } catch (err) {
        console.error("Failed to load communication completion", err);
      } finally {
        setLoading(false);
      }
    };

    loadCompletion();
  }, [user]);

  const exitFullscreen = useCallback(async () => {
    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
      } catch (err) {
        console.error("Exit fullscreen failed", err);
      }
    }
  }, []);

  const stopTimer = useCallback((completed = false) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus(completed ? "completed" : "idle");
    stopCamera();
    exitFullscreen();
    if (completed) {
      markCompletion();
    }
  }, [exitFullscreen, markCompletion, stopCamera]);

  const startTimer = async () => {
    if (completedToday || loading) return;
    const totalMs = Math.max(1, durationMinutes) * 60 * 1000;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
    } catch (err) {
      console.error("Camera access blocked", err);
      return;
    }

    if (fullscreenTargetRef.current && !document.fullscreenElement) {
      try {
        await fullscreenTargetRef.current.requestFullscreen();
      } catch (err) {
        console.error("Fullscreen request failed", err);
      }
    }

    setSessionStart(new Date().toISOString());
    pickTopic();
    setStatus("running");
    setRemainingMs(totalMs);
    const startedAt = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remain = totalMs - elapsed;
      if (remain <= 0) {
        setRemainingMs(0);
        stopTimer(true);
        return;
      }
      setRemainingMs(remain);
    }, 500);
  };

  const pauseTimer = () => {
    if (status !== "running") return;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus("paused");
  };

  const resumeTimer = () => {
    if (status !== "paused") return;
    const totalMs = Math.max(1, durationMinutes) * 60 * 1000;
    const alreadyElapsed = totalMs - remainingMs;
    const startedAt = Date.now() - alreadyElapsed;
    setStatus("running");
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remain = totalMs - elapsed;
      if (remain <= 0) {
        setRemainingMs(0);
        stopTimer(true);
        return;
      }
      setRemainingMs(remain);
    }, 500);
  };

  useEffect(() => () => {
    stopTimer(false);
  }, [stopTimer]);

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Communication</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Speaking Practice</h1>
          <p className="text-slate-600 text-base">Enter focus mode with camera, fullscreen, and a timed speaking prompt.</p>
        </div>

        <DashboardCard title="Communication Focus" subtitle="Fullscreen + camera" icon={null}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Status:</span>
              <span className="font-semibold text-indigo-600 capitalize">{status === "running" ? "Active" : status === "completed" ? "Completed" : status === "paused" ? "Paused" : "Idle"}</span>
              {completedToday && (
                <span className="rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold px-2 py-1 border border-emerald-100">Completed today</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3 text-sm text-slate-700">
              <label className="font-semibold text-slate-900">Duration (min)</label>
              <input
                type="number"
                min="1"
                max="60"
                className="w-24 rounded-lg border border-slate-200 px-2 py-1 text-sm"
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Math.max(1, Number(e.target.value) || 1))}
                disabled={status === "running"}
              />
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <span className="font-semibold text-slate-900">Remaining</span>
                <span className="px-3 py-1 rounded-lg bg-slate-100 font-semibold text-indigo-700 text-lg">{formatTime(remainingMs)}</span>
              </div>
            </div>

            <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-3 py-3 flex flex-col gap-2">
              <div className="text-sm font-semibold text-slate-900">Topic</div>
              <div className="text-base font-bold text-indigo-700">{topic}</div>
              <button
                className="self-start mt-1 px-3 py-1 rounded-lg bg-white text-indigo-700 text-xs font-semibold border border-indigo-100 hover:bg-indigo-100 transition"
                onClick={pickTopic}
                disabled={status === "running"}
              >
                New topic
              </button>
            </div>

            <div className="relative rounded-2xl overflow-hidden border border-slate-200 bg-black min-h-[320px] md:min-h-[420px]" ref={fullscreenTargetRef}>
              <video ref={videoRef} className="w-full h-full object-cover" muted playsInline />
              {(status === "running" || status === "paused") && (
                <div className="pointer-events-none absolute inset-0 flex flex-col justify-between px-4 py-4 md:px-8 md:py-8 text-white">
                  <div className="self-start rounded-lg bg-black/50 px-3 py-2 text-base md:text-lg font-semibold max-w-xl">Topic: {topic}</div>
                  <div className="self-center rounded-lg bg-black/50 px-4 py-2 text-2xl md:text-3xl font-bold tracking-tight">{formatTime(remainingMs)}</div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                className="px-3 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={startTimer}
                disabled={status === "running" || completedToday || loading}
              >
                Start Communication Practice
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-amber-500 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={pauseTimer}
                disabled={status !== "running"}
              >
                Pause
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={resumeTimer}
                disabled={status !== "paused"}
              >
                Resume
              </button>
              <button
                className="px-3 py-2 rounded-xl bg-rose-500 text-white text-sm font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                onClick={() => stopTimer(false)}
                disabled={status === "idle"}
              >
                Stop
              </button>
            </div>

            <p className="text-xs text-slate-500 leading-relaxed">Starts fullscreen speaking practice with camera on. Countdown ends marks Communication completed for today, stops camera, and exits fullscreen.</p>
          </div>
        </DashboardCard>
      </div>
    </GlobalLayout>
  );
};

export default FocusCommunication;
