import { useEffect, useMemo, useRef, useState } from "react";
import { FiClock, FiPlay, FiPause, FiTarget, FiZap, FiCheckCircle, FiBookOpen, FiRotateCcw } from "react-icons/fi";
import GlobalLayout from "../components/GlobalLayout";
import ProgressBar from "../components/ProgressBar";
import { useAuth } from "../lib/AuthContext";
import {
  microLessons,
  getLessonById,
  getLessonsByCategory,
  getUserProgress,
  getCategoryProgress,
  recordMicroCompletion,
} from "../lib/microLearningData";
import "../styles/MicroLearning.css";

const SESSION_KEY = "skilldev-micro-active";

const formatTime = (ms) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
};

const statusLabel = {
  idle: "Pending",
  running: "In Progress",
  paused: "Paused",
  completed: "Completed",
};

function MicroLearning() {
  const { user } = useAuth();
  const userId = user?.uid;

  const [category, setCategory] = useState("All");
  const [activeLesson, setActiveLesson] = useState(null);
  const [status, setStatus] = useState("idle");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pausedMs, setPausedMs] = useState(0);
  const [interruptions, setInterruptions] = useState(0);
  const [history, setHistory] = useState([]);
  const [lessonProgress, setLessonProgress] = useState({});

  const startRef = useRef(null);
  const pauseRef = useRef(null);
  const intervalRef = useRef(null);

  const lessons = useMemo(() => getLessonsByCategory(category === "All" ? undefined : category), [category]);
  const categories = useMemo(() => ["All", ...new Set(microLessons.map((l) => l.category))], []);

  useEffect(() => {
    const state = getUserProgress(userId);
    setLessonProgress(state.lessons || {});
    setHistory(state.history || []);
  }, [userId]);

  useEffect(() => {
    const stored = sessionStorage.getItem(SESSION_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored);
      const lesson = getLessonById(parsed.lessonId);
      if (!lesson) return;
      setActiveLesson(lesson);
      setStatus(parsed.status || "paused");
      startRef.current = parsed.startedAt ? Number(parsed.startedAt) : Date.now();
      pauseRef.current = parsed.pausedAt || null;
      setPausedMs(parsed.pausedMs || 0);
      setElapsedMs(parsed.elapsedMs || 0);
      setInterruptions(parsed.interruptions || 0);
    } catch (err) {
      /* ignore corrupt session */
    }
  }, []);

  useEffect(() => {
    if (!activeLesson) {
      sessionStorage.removeItem(SESSION_KEY);
      return;
    }
    const payload = {
      lessonId: activeLesson.id,
      status,
      startedAt: startRef.current,
      pausedAt: pauseRef.current,
      pausedMs,
      elapsedMs,
      interruptions,
    };
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(payload));
  }, [activeLesson, status, pausedMs, elapsedMs, interruptions]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "hidden") {
        setInterruptions((prev) => prev + 1);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  useEffect(() => {
    if (status !== "running") {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      if (!startRef.current) startRef.current = Date.now();
      const now = Date.now();
      const pausedDelta = pauseRef.current ? now - pauseRef.current : 0;
      setElapsedMs(now - startRef.current - pausedMs - pausedDelta);
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [status, pausedMs]);

  const clearSession = () => {
    setActiveLesson(null);
    setStatus("idle");
    setElapsedMs(0);
    setPausedMs(0);
    setInterruptions(0);
    startRef.current = null;
    pauseRef.current = null;
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = null;
    sessionStorage.removeItem(SESSION_KEY);
  };

  const handleStart = (lesson) => {
    setActiveLesson(lesson);
    setStatus("running");
    setElapsedMs(0);
    setPausedMs(0);
    setInterruptions(0);
    startRef.current = Date.now();
    pauseRef.current = null;
  };

  const handlePause = () => {
    if (status !== "running") return;
    pauseRef.current = Date.now();
    setStatus("paused");
  };

  const handleResume = () => {
    if (status !== "paused") return;
    if (pauseRef.current) {
      const delta = Date.now() - pauseRef.current;
      setPausedMs((prev) => prev + delta);
    }
    pauseRef.current = null;
    setStatus("running");
  };

  const handleComplete = async () => {
    if (!activeLesson || status === "completed" || !userId) return;
    const durationMs = Math.max(0, elapsedMs + pausedMs);
    setStatus("completed");

    await recordMicroCompletion(userId, activeLesson, {
      durationMs,
      interruptions,
      pausedMs,
      score: null,
    });

    const state = getUserProgress(userId);
    setLessonProgress(state.lessons || {});
    setHistory(state.history || []);
  };

  const overallCompletion = useMemo(() => {
    const completed = microLessons.filter((l) => lessonProgress[l.id]?.status === "completed").length;
    return Math.round((completed / microLessons.length) * 100);
  }, [lessonProgress]);

  const categoryProgress = useMemo(() => getCategoryProgress(userId), [userId, lessonProgress]);

  const activeTarget = activeLesson?.estimatedMinutes || 10;
  const progressValue = Math.min(100, Math.round((elapsedMs / (activeTarget * 60000)) * 100));

  return (
    <GlobalLayout>
      <div className="ml-shell">
        <div className="ml-body-grid">
          <div className="ml-main">
            <div className="ml-top">
              <div>
                <div className="ml-kicker">Micro Sprint</div>
                <h1 className="ml-heading">Focused micro-learning, faster wins</h1>
              </div>
              <button className="ml-icon-btn" onClick={clearSession} title="Reset session">
                <FiRotateCcw />
              </button>
            </div>

            <div className="ml-hero-card">
              <div className="ml-hero-overlay" />
              <div className="ml-hero-content">
                <div className="ml-hero-left">
                  <div className="ml-hero-date">
                    <FiClock /> Today
                  </div>
                  <div className="ml-pill-row">
                    <span className="ml-pill">ML</span>
                    <span className="ml-pill">10m</span>
                    <span className="ml-pill">Focus</span>
                  </div>
                  <div>
                    <div className="ml-course-title">One card, one goal</div>
                    <p className="ml-course-subtitle">Pick a micro-lesson, hit start, pause when needed, then mark complete.</p>
                  </div>

                  <div className="ml-progress-row">
                    <div className="ml-progress">
                      <span className="ml-progress-label">Overall</span>
                      <div className="ml-progress-track">
                        <div className="ml-progress-fill" style={{ width: `${overallCompletion}%` }} />
                      </div>
                      <span className="ml-progress-value">{overallCompletion}%</span>
                    </div>
                    <div className={`ml-status ${status}`}>
                      {statusLabel[status] || "Pending"}
                    </div>
                    <div className="ml-progress" style={{ minWidth: "180px" }}>
                      <span className="ml-progress-label">Active</span>
                      <div className="ml-progress-track">
                        <div className="ml-progress-fill" style={{ width: `${progressValue}%`, background: "linear-gradient(90deg,#f9d65c,#6ef3ff)" }} />
                      </div>
                      <span className="ml-progress-value">{progressValue}%</span>
                    </div>
                  </div>

                  <div className="ml-cta-row">
                    <span className="ml-status pending">{activeLesson ? activeLesson.title : "Select a lesson"}</span>
                    <button
                      className="ml-primary-btn"
                      onClick={() => (status === "running" ? handlePause() : activeLesson ? handleResume() : null)}
                      disabled={!activeLesson}
                    >
                      {status === "running" ? <FiPause /> : <FiPlay />} {status === "running" ? "Pause" : "Resume"}
                    </button>
                    <button className="ml-primary-btn" onClick={handleComplete} disabled={!activeLesson || status === "idle"}>
                      <FiCheckCircle /> Complete
                    </button>
                  </div>
                </div>

                <div className="ml-hero-illustration">
                  <div className="ml-react-orb">*</div>
                  <div className="ml-device-card">
                    <FiTarget /> {activeLesson ? activeLesson.estimatedMinutes : 10}m target
                  </div>
                  <div className="ml-device-card small">
                    <FiZap /> {formatTime(elapsedMs)} elapsed
                  </div>
                </div>
              </div>
            </div>

            <div className="ml-section">
              <div className="ml-section-head">
                <h2>Browse micro-lessons</h2>
                <div className="ml-chip-row">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      className={`ml-chip ${cat === category ? "success" : ""}`}
                      onClick={() => setCategory(cat)}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="ml-prev-grid">
                {lessons.map((lesson) => {
                  const prog = lessonProgress[lesson.id];
                  const completed = prog?.status === "completed";
                  const inProgress = activeLesson?.id === lesson.id && status === "running";
                  return (
                    <div key={lesson.id} className="ml-prev-card">
                      <div className="ml-prev-date">{lesson.estimatedMinutes} min</div>
                      <div className="ml-prev-main">
                        <div className="ml-prev-title">{lesson.title}</div>
                        <div className="ml-prev-desc">{lesson.summary}</div>
                        <div className="ml-chip-row">
                          <span className="ml-chip">{lesson.category}</span>
                          <span className="ml-chip">{lesson.difficulty}</span>
                          {completed && <span className="ml-chip success">Completed</span>}
                        </div>
                      </div>
                      <div className="ml-prev-meta">
                        <button
                          className="ml-mark-btn"
                          onClick={() => handleStart(lesson)}
                          disabled={inProgress}
                        >
                          {inProgress ? "Running" : completed ? "Restart" : "Start"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="ml-section">
              <div className="ml-section-head">
                <h2>Recent completions</h2>
              </div>
              {history.length === 0 && <p>No completions yet. Start a micro-lesson to track progress.</p>}
              <div className="ml-prev-grid">
                {history.map((item) => {
                  const lesson = getLessonById(item.lessonId) || { title: item.lessonId, category: item.category };
                  return (
                    <div key={`${item.lessonId}-${item.completedAt}`} className="ml-prev-card">
                      <div className="ml-prev-date">{item.durationMinutes || 0} min</div>
                      <div className="ml-prev-main">
                        <div className="ml-prev-title">{lesson.title}</div>
                        <div className="ml-prev-desc">{lesson.category}</div>
                        <div className="ml-chip-row">
                          <span className="ml-chip success">Focus {item.focusScore || 0}%</span>
                          <span className="ml-chip">Interruptions {item.interruptions || 0}</span>
                        </div>
                      </div>
                      <div className="ml-prev-meta">
                        <FiBookOpen />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="ml-streak">
            <div className="ml-streak-label">Category completion</div>
            <div className="ml-streak-value">{overallCompletion}%</div>
            <p className="ml-streak-subtext">Finish micro lessons to boost your streak.</p>
            <div className="ml-collapsed">
              {Object.entries(categoryProgress || {}).map(([cat, data]) => (
                <div
                  key={cat}
                  style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "6px", marginBottom: "8px" }}
                >
                  <span>{cat}</span>
                  <span className="ml-status-pill completed">
                    {data.completed}/{data.total} | {data.minutes}m
                  </span>
                  <ProgressBar value={Math.round((data.completed / data.total) * 100)} />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}

export default MicroLearning;
