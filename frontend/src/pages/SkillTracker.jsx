import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { addDoc, collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import GlobalLayout from "../components/GlobalLayout";
import DashboardCard from "../components/DashboardCard";
import { useAuth } from "../lib/AuthContext";
import { db } from "../firebase";

const categories = ["Communication", "Aptitude", "Learning", "Coding", "Other"];

const SkillTracker = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ taskName: "", category: "Communication", durationMinutes: 10 });
  const [activeTimer, setActiveTimer] = useState(null); // { taskId, taskName, category, durationMs, startedAt }
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const timerRef = useRef(null);
  const [progress, setProgress] = useState({ totalMinutes: 0, totalTasks: 0, byCategory: {} });

  const clearTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const fetchTasks = async () => {
    if (!user) return;
    setLoading(true);
    try {
      const q = query(collection(db, "users", user.uid, "tasks"), orderBy("createdAt", "desc"));
      const snap = await getDocs(q);
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTasks(list);
    } catch (err) {
      console.error("Failed to load tasks", err);
    } finally {
      setLoading(false);
    }
  };

  const fetchProgress = async () => {
    if (!user) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      const q = query(
        collection(db, "users", user.uid, "taskHistory"),
        where("date", "==", today)
      );
      const snap = await getDocs(q);
      let totalMinutes = 0;
      let totalTasks = 0;
      const byCategory = {};
      snap.forEach((d) => {
        const data = d.data();
        const mins = Number(data?.durationCompleted) || 0;
        totalMinutes += mins;
        totalTasks += 1;
        if (data?.category) {
          byCategory[data.category] = (byCategory[data.category] || 0) + mins;
        }
      });
      setProgress({ totalMinutes, totalTasks, byCategory });
    } catch (err) {
      console.error("Failed to load progress", err);
    }
  };

  const resetForm = () => {
    setForm({ taskName: "", category: "Communication", durationMinutes: 10 });
    setEditingId(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !form.taskName || !form.durationMinutes) return;
    setSaving(true);
    try {
      if (editingId) {
        const ref = doc(db, "users", user.uid, "tasks", editingId);
        await updateDoc(ref, {
          taskName: form.taskName,
          category: form.category,
          durationMinutes: Number(form.durationMinutes),
        });
      } else {
        await addDoc(collection(db, "users", user.uid, "tasks"), {
          userId: user.uid,
          taskName: form.taskName,
          category: form.category,
          durationMinutes: Number(form.durationMinutes),
          createdAt: serverTimestamp(),
        });
      }
      await fetchTasks();
      resetForm();
    } catch (err) {
      console.error("Failed to save task", err);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (task) => {
    setForm({ taskName: task.taskName, category: task.category, durationMinutes: task.durationMinutes });
    setEditingId(task.id);
  };

  const handleDelete = async (taskId) => {
    if (!user) return;
    try {
      await deleteDoc(doc(db, "users", user.uid, "tasks", taskId));
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (activeTimer?.taskId === taskId) {
        clearTimer();
        setActiveTimer(null);
        setRemainingSeconds(0);
        sessionStorage.removeItem("activeSkillTimer");
      }
    } catch (err) {
      console.error("Failed to delete task", err);
    }
  };

  const saveHistory = async (task) => {
    if (!user || !task) return;
    const today = new Date().toISOString().split("T")[0];
    try {
      await addDoc(collection(db, "users", user.uid, "taskHistory"), {
        userId: user.uid,
        taskId: task.id || null,
        taskName: task.taskName,
        category: task.category,
        date: today,
        durationCompleted: task.durationMinutes,
        status: "completed",
        createdAt: serverTimestamp(),
      });
      await fetchProgress();
    } catch (err) {
      console.error("Failed to record task history", err);
    }
  };

  const completeTimer = async (task) => {
    clearTimer();
    setActiveTimer(null);
    setRemainingSeconds(0);
    sessionStorage.removeItem("activeSkillTimer");
    await saveHistory(task);
    alert(`${task.taskName} completed!`);
  };

  const startTimer = (task) => {
    if (!task) return;
    if (task.category === "Communication") {
      const payload = {
        taskId: task.id,
        taskName: task.taskName,
        category: task.category,
        durationMinutes: task.durationMinutes,
      };
      sessionStorage.setItem("commSessionInfo", JSON.stringify(payload));
      navigate("/communication-session", { state: payload });
      return;
    }

    const durationMs = task.durationMinutes * 60 * 1000;
    const startedAt = Date.now();
    const timerState = { taskId: task.id, taskName: task.taskName, category: task.category, durationMs, startedAt, durationMinutes: task.durationMinutes };
    setActiveTimer(timerState);
    setRemainingSeconds(Math.ceil(durationMs / 1000));
    sessionStorage.setItem("activeSkillTimer", JSON.stringify(timerState));
    clearTimer();
    timerRef.current = setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = durationMs - elapsed;
      if (remaining <= 0) {
        clearTimer();
        completeTimer(task);
        return;
      }
      setRemainingSeconds(Math.ceil(remaining / 1000));
    }, 1000);
  };

  const stopActiveTimer = () => {
    clearTimer();
    setActiveTimer(null);
    setRemainingSeconds(0);
    sessionStorage.removeItem("activeSkillTimer");
  };

  useEffect(() => {
    if (!user) return;
    fetchTasks();
    fetchProgress();
  }, [user]);

  useEffect(() => {
    const stored = sessionStorage.getItem("activeSkillTimer");
    if (!stored) return;
    const parsed = JSON.parse(stored);
    if (!parsed?.startedAt || !parsed?.durationMs) return;
    const elapsed = Date.now() - parsed.startedAt;
    if (elapsed >= parsed.durationMs) {
      sessionStorage.removeItem("activeSkillTimer");
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
        clearTimer();
        completeTimer({
          id: parsed.taskId,
          taskName: parsed.taskName,
          category: parsed.category,
          durationMinutes: parsed.durationMinutes,
        });
        return;
      }
      setRemainingSeconds(Math.ceil(remain / 1000));
    }, 1000);
  }, []);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  const formatMMSS = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const addDefaults = async () => {
    if (!user) return;
    const defaults = [
      { taskName: "Communication Practice", category: "Communication", durationMinutes: 5 },
      { taskName: "Aptitude Practice", category: "Aptitude", durationMinutes: 20 },
      { taskName: "Coding Practice", category: "Coding", durationMinutes: 30 },
      { taskName: "Learning", category: "Learning", durationMinutes: 40 },
    ];
    setSaving(true);
    try {
      const batchAdds = defaults.map((task) =>
        addDoc(collection(db, "users", user.uid, "tasks"), {
          userId: user.uid,
          ...task,
          createdAt: serverTimestamp(),
        })
      );
      await Promise.all(batchAdds);
      await fetchTasks();
    } catch (err) {
      console.error("Failed to add default tasks", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-indigo-600">Skill Improvement Tracker</p>
            <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Manage your practice tasks</h1>
            <p className="text-slate-600 text-base">Create tasks, run timers, and log completions by category.</p>
          </div>
          <div className="flex gap-2">
            <button
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold shadow hover:shadow-md disabled:opacity-60"
              onClick={addDefaults}
              disabled={saving}
            >
              Add default tasks
            </button>
            <button
              className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-300"
              onClick={() => navigate("/dashboard")}
            >
              Back to dashboard
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <DashboardCard title={editingId ? "Edit task" : "Add task"} subtitle="Create or update" accent="indigo">
            <form className="space-y-3" onSubmit={handleSubmit}>
              <div className="space-y-1">
                <label className="text-sm font-semibold text-slate-700">Task name</label>
                <input
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-200"
                  placeholder="e.g., Mock Interview"
                  value={form.taskName}
                  onChange={(e) => setForm((prev) => ({ ...prev, taskName: e.target.value }))}
                  required
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700">Category</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={form.category}
                    onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value }))}
                  >
                    {categories.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-semibold text-slate-700">Duration (minutes)</label>
                  <input
                    type="number"
                    min="1"
                    max="180"
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    value={form.durationMinutes}
                    onChange={(e) => setForm((prev) => ({ ...prev, durationMinutes: Number(e.target.value) }))}
                    required
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold shadow hover:shadow-md disabled:opacity-60"
                  disabled={saving}
                >
                  {editingId ? "Update task" : "Add task"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    className="px-4 py-2 rounded-xl bg-slate-200 text-slate-800 text-sm font-semibold border border-slate-300 hover:bg-slate-300"
                    onClick={resetForm}
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </DashboardCard>

          <div className="lg:col-span-2 space-y-4">
            <DashboardCard title="Your tasks" subtitle="Tap start to begin" accent="purple">
              {loading ? (
                <p className="text-sm text-slate-600">Loading tasks...</p>
              ) : tasks.length === 0 ? (
                <p className="text-sm text-slate-500">No tasks yet. Add one to get started.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {tasks.map((task) => (
                    <div key={task.id} className="rounded-xl border border-slate-100 bg-white px-4 py-3 shadow-sm space-y-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-semibold text-slate-900">{task.taskName}</p>
                          <p className="text-xs text-slate-500">Category: {task.category}</p>
                        </div>
                        <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">{task.durationMinutes} min</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-sm">
                        <button
                          className="px-3 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:shadow-md transition disabled:opacity-60"
                          onClick={() => startTimer(task)}
                          disabled={activeTimer && activeTimer.taskId !== task.id}
                        >
                          Start
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-semibold border border-emerald-100 hover:bg-emerald-100"
                          onClick={() => handleEdit(task)}
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-2 rounded-xl bg-rose-50 text-rose-700 font-semibold border border-rose-100 hover:bg-rose-100"
                          onClick={() => handleDelete(task.id)}
                        >
                          Delete
                        </button>
                      </div>
                      {activeTimer?.taskId === task.id && task.category !== "Communication" && (
                        <div className="text-sm text-indigo-700 font-semibold">Remaining: {formatMMSS(remainingSeconds)}</div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DashboardCard>

            <DashboardCard title="Today" subtitle="Progress by category" accent="green">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center shadow-sm">
                  <div className="text-xs text-slate-500">Tasks completed</div>
                  <div className="text-lg font-semibold text-slate-900">{progress.totalTasks}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center shadow-sm">
                  <div className="text-xs text-slate-500">Time spent</div>
                  <div className="text-lg font-semibold text-slate-900">{progress.totalMinutes} min</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-center shadow-sm">
                  <div className="text-xs text-slate-500">Active</div>
                  <div className="text-lg font-semibold text-indigo-700">{activeTimer ? activeTimer.taskName : "None"}</div>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {categories.map((c) => (
                  <div key={c} className="rounded-xl border border-slate-100 bg-white px-3 py-2 shadow-sm">
                    <div className="text-xs text-slate-500">{c}</div>
                    <div className="text-sm font-semibold text-slate-900">{progress.byCategory[c] ? `${progress.byCategory[c]} min` : "0 min"}</div>
                  </div>
                ))}
              </div>
            </DashboardCard>
          </div>
        </div>

        {activeTimer && activeTimer.category !== "Communication" && (
          <div className="fixed inset-0 z-[2000] bg-slate-900/80 backdrop-blur-sm flex items-center justify-center px-4">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl border border-slate-200 p-6 space-y-4 text-center">
              <p className="text-sm uppercase tracking-wide text-slate-500 font-semibold">Study timer</p>
              <h2 className="text-2xl font-bold text-slate-900">{activeTimer.taskName}</h2>
              <p className="text-sm text-slate-600">Category: {activeTimer.category}</p>
              <div className="text-5xl font-bold text-indigo-600 tracking-tight">{formatMMSS(remainingSeconds)}</div>
              <div className="flex justify-center gap-3">
                <button
                  className="px-4 py-2 rounded-xl bg-rose-500 text-white font-semibold shadow hover:shadow-md"
                  onClick={stopActiveTimer}
                >
                  Stop
                </button>
              </div>
              <p className="text-xs text-slate-500">Timer auto-completes when it reaches zero and logs to history.</p>
            </div>
          </div>
        )}
      </div>
    </GlobalLayout>
  );
};

export default SkillTracker;
