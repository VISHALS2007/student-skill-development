import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  setDoc,
  serverTimestamp,
  limit,
} from "firebase/firestore";
import { db } from "../firebase";

export const ALLOWED_SITES = [
  "geeksforgeeks.org",
  "leetcode.com",
  "hackerrank.com",
  "codechef.com",
  "codeforces.com",
];

export const PLATFORM_URLS = {
  "geeksforgeeks.org": "https://www.geeksforgeeks.org",
  "leetcode.com": "https://leetcode.com",
  "hackerrank.com": "https://www.hackerrank.com",
  "codechef.com": "https://www.codechef.com",
  "codeforces.com": "https://codeforces.com",
};

export const formatDateKey = (date = new Date()) => date.toISOString().slice(0, 10);

const defaultDay = (dateKey) => ({
  date: dateKey,
  totalFocusMs: 0,
  sessionCount: 0,
  sitesUsed: {},
  sessions: [],
});

export const msToHHMMSS = (ms = 0) => {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${hours}:${minutes}:${seconds}`;
};

export const isAllowedDomain = (domain) => ALLOWED_SITES.some((d) => domain?.includes(d));

export async function recordFocusSession(userId, session) {
  if (!userId || !session || !session.durationMs || session.durationMs <= 0) return null;
  const dateKey = session.dateKey || formatDateKey(new Date(session.startedAt || Date.now()));
  const dayRef = doc(collection(db, "users", userId, "focusSessions"), dateKey);
  const snap = await getDoc(dayRef);
  const existing = snap.exists() ? snap.data() : defaultDay(dateKey);

  const sitesUsed = { ...(existing.sitesUsed || {}) };
  const domain = session.domain || "unknown";
  sitesUsed[domain] = (sitesUsed[domain] || 0) + session.durationMs;

  const newSessions = Array.isArray(existing.sessions) ? [...existing.sessions] : [];
  newSessions.unshift({
    startedAt: session.startedAt || new Date().toISOString(),
    endedAt: session.endedAt || new Date().toISOString(),
    durationMs: session.durationMs,
    domain,
    platformName: session.platformName || domain,
    tabSwitches: session.tabSwitches || 0,
    pausedMs: session.pausedMs || 0,
    status: session.status || "complete",
    interruptions: session.interruptions || session.tabSwitches || 0,
    focusScore: session.focusScore,
    events: Array.isArray(session.events) ? session.events.slice(0, 50) : [],
  });

  const payload = {
    date: dateKey,
    totalFocusMs: (existing.totalFocusMs || 0) + session.durationMs,
    sessionCount: (existing.sessionCount || 0) + 1,
    sitesUsed,
    sessions: newSessions.slice(0, 20),
    updatedAt: serverTimestamp(),
  };

  await setDoc(dayRef, payload, { merge: true });
  return payload;
}

export async function fetchDayFocus(userId, dateKey = formatDateKey()) {
  if (!userId) return null;
  const dayRef = doc(collection(db, "users", userId, "focusSessions"), dateKey);
  const snap = await getDoc(dayRef);
  if (!snap.exists()) return null;
  return snap.data();
}

export async function fetchFocusSummary(userId, days = 14) {
  if (!userId) return null;
  const q = query(
    collection(db, "users", userId, "focusSessions"),
    orderBy("date", "desc"),
    limit(Math.max(7, days))
  );

  const snap = await getDocs(q);
  const weekly = [];
  const sitesUsed = {};
  let totalFocusMs = 0;
  let sessionCount = 0;
  let history = [];

  snap.forEach((docSnap) => {
    const data = docSnap.data();
    const dayTotal = data.totalFocusMs || 0;
    const dayDate = data.date;
    weekly.push({ date: dayDate, totalFocusMs: dayTotal });
    totalFocusMs += dayTotal;
    sessionCount += data.sessionCount || 0;
    Object.entries(data.sitesUsed || {}).forEach(([domain, ms]) => {
      sitesUsed[domain] = (sitesUsed[domain] || 0) + ms;
    });
    if (Array.isArray(data.sessions)) {
      history = history.concat(
        data.sessions.map((s) => ({ ...s, date: dayDate }))
      );
    }
  });

  const mostUsedDomain = Object.entries(sitesUsed).sort((a, b) => b[1] - a[1])[0]?.[0] || "-";
  const trimmedWeekly = weekly.slice().reverse().slice(-7);
  const daysList = trimmedWeekly.map((d) => ({ date: d.date, status: d.totalFocusMs > 0 ? "done" : "miss" }));
  const sortedHistory = history
    .sort((a, b) => new Date(b.startedAt || b.date) - new Date(a.startedAt || a.date))
    .slice(0, 10);

  return {
    totalFocusMs,
    sessionCount,
    sitesUsed,
    mostUsedDomain,
    weekly: trimmedWeekly,
    history: sortedHistory,
    days: daysList,
  };
}
