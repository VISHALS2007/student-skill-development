const STORAGE_KEY = "skilldev-progress";

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    return null;
  }
}

function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    /* ignore */
  }
}

const defaultState = {
  attendance: {}, // { date: "present" | "absent" }
  lastActiveDate: null,
  streak: 0,
  totals: {
    minutes: 0,
    sessions: 0
  },
  skills: {
    aptitude: { minutes: 0, sessions: 0 },
    coding: { minutes: 0, sessions: 0 },
    problem: { minutes: 0, sessions: 0 },
    communication: { minutes: 0, sessions: 0 }
  },
  weekly: [], // { date, sessionId, minutes }
  history: [] // richer activity log
};

function getState() {
  const stored = loadState() || {};
  return {
    ...defaultState,
    ...stored,
    attendance: stored.attendance || {},
    totals: stored.totals || { ...defaultState.totals },
    skills: { ...defaultState.skills, ...(stored.skills || {}) },
    weekly: Array.isArray(stored.weekly) ? stored.weekly : [],
    history: Array.isArray(stored.history) ? stored.history : []
  };
}

function updateAttendanceForToday(state) {
  const today = todayKey();
  state.attendance[today] = "present";
  if (state.lastActiveDate === today) {
    return state;
  }
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yKey = yesterday.toISOString().slice(0, 10);
  if (state.lastActiveDate === yKey) {
    state.streak = (state.streak || 0) + 1;
  } else {
    state.streak = 1;
  }
  state.lastActiveDate = today;
  return state;
}

function ensureSkillBucket(state, sessionId) {
  if (!state.skills) {
    state.skills = { ...defaultState.skills };
  }
  if (!state.skills[sessionId]) {
    state.skills[sessionId] = { minutes: 0, sessions: 0 };
  }
  return state.skills[sessionId];
}

function buildMonthlyAttendance(state) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const todayDate = now.getDate();
  const days = [];
  let presentCount = 0;

  for (let day = 1; day <= todayDate; day += 1) {
    const key = `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const status = state.attendance[key] === "present" ? "present" : "absent";
    if (status === "present") presentCount += 1;
    days.push({ date: key, status });
  }

  const percentage = todayDate ? Math.round((presentCount / todayDate) * 100) : 0;
  return { days, percentage };
}

export function markSessionStarted() {
  const state = getState();
  updateAttendanceForToday(state);
  state.history = Array.isArray(state.history) ? state.history : [];
  state.history.unshift({
    date: new Date().toISOString(),
    sessionId: "any",
    minutes: 0,
    type: "start"
  });
  state.history = state.history.slice(0, 50);
  saveState(state);
  return state;
}

export function recordSessionComplete(sessionId, minutes) {
  const state = getState();
  updateAttendanceForToday(state);
  const safeMinutes = Math.max(0, minutes || 0);
  state.totals.minutes += safeMinutes;
  state.totals.sessions += 1;
  const bucket = ensureSkillBucket(state, sessionId || "general");
  bucket.minutes += safeMinutes;
  bucket.sessions += 1;

  const entry = { date: todayKey(), sessionId, minutes: safeMinutes };
  state.weekly.unshift(entry);
  state.weekly = state.weekly.slice(0, 30);

  state.history = Array.isArray(state.history) ? state.history : [];
  state.history.unshift({
    date: new Date().toISOString(),
    sessionId,
    minutes: safeMinutes,
    type: "complete"
  });
  state.history = state.history.slice(0, 50);

  saveState(state);
  return state;
}

export function getMetrics() {
  const state = getState();
  const today = todayKey();
  const last7 = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    last7.push({ date: key, status: state.attendance[key] === "present" ? "present" : "absent" });
  }
  const weeklyMinutes = state.weekly
    .filter((item) => {
      const diff = (new Date(today) - new Date(item.date)) / (1000 * 60 * 60 * 24);
      return diff <= 7 && diff >= 0;
    })
    .reduce((sum, item) => sum + (item.minutes || 0), 0);

  const monthly = buildMonthlyAttendance(state);

  return {
    attendance: state.attendance,
    streak: state.streak,
    totals: state.totals,
    skills: state.skills || { ...defaultState.skills },
    last7,
    weeklyMinutes,
    monthly,
    history: Array.isArray(state.history) ? state.history.slice(0, 20) : []
  };
}
