import { firestore } from "../firebaseAdmin.js";

const USERS = "users";
const SESSIONS = "sessions";
const allowedSites = [
  "geeksforgeeks.org",
  "leetcode.com",
  "hackerrank.com",
  "codechef.com",
  "codeforces.com",
];

const now = () => new Date();

const isAllowedSite = (site) => allowedSites.includes(site);

const sessionDoc = (userId, sessionId) =>
  firestore.collection(USERS).doc(userId).collection(SESSIONS).doc(sessionId);

export async function startSession(req, res) {
  try {
    const { userId, site } = req.body;
    if (!userId || !site) return res.status(400).json({ error: "userId and site are required" });
    if (!isAllowedSite(site)) return res.status(400).json({ error: "Site not allowed" });

    const startedAt = now();
    const docRef = await firestore
      .collection(USERS)
      .doc(userId)
      .collection(SESSIONS)
      .add({
        site,
        startTime: startedAt,
        endTime: null,
        durationSeconds: 0,
        status: "active",
        createdAt: startedAt,
        updatedAt: startedAt,
        lastResumedAt: startedAt,
      });

    res.json({ sessionId: docRef.id, startTime: startedAt.toISOString(), status: "active" });
  } catch (err) {
    console.error("startSession error", err);
    res.status(500).json({ error: "Failed to start session" });
  }
}

export async function pauseSession(req, res) {
  try {
    const { sessionId } = req.body;
    const userId = req.user?.uid;
    if (!userId || !sessionId) return res.status(400).json({ error: "sessionId required" });

    const ref = sessionDoc(userId, sessionId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });
    const data = snap.data();
    if (data.status !== "active") return res.status(400).json({ error: "Session not active" });

    const nowTs = now();
    const lastResumedAt = data.lastResumedAt?.toDate ? data.lastResumedAt.toDate() : data.lastResumedAt;
    const delta = lastResumedAt ? Math.floor((nowTs - lastResumedAt) / 1000) : 0;
    const durationSeconds = (data.durationSeconds || 0) + delta;

    await ref.update({
      status: "paused",
      durationSeconds,
      lastResumedAt: null,
      updatedAt: nowTs,
    });

    res.json({ sessionId, status: "paused", durationSeconds });
  } catch (err) {
    console.error("pauseSession error", err);
    res.status(500).json({ error: "Failed to pause session" });
  }
}

export async function resumeSession(req, res) {
  try {
    const { sessionId } = req.body;
    const userId = req.user?.uid;
    if (!userId || !sessionId) return res.status(400).json({ error: "sessionId required" });

    const ref = sessionDoc(userId, sessionId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });
    const data = snap.data();
    if (data.status !== "paused") return res.status(400).json({ error: "Session not paused" });

    const nowTs = now();
    await ref.update({ status: "active", lastResumedAt: nowTs, updatedAt: nowTs });
    res.json({ sessionId, status: "active", resumedAt: nowTs.toISOString() });
  } catch (err) {
    console.error("resumeSession error", err);
    res.status(500).json({ error: "Failed to resume session" });
  }
}

export async function stopSession(req, res) {
  try {
    const { sessionId } = req.body;
    const userId = req.user?.uid;
    if (!userId || !sessionId) return res.status(400).json({ error: "sessionId required" });

    const ref = sessionDoc(userId, sessionId);
    const snap = await ref.get();
    if (!snap.exists) return res.status(404).json({ error: "Session not found" });
    const data = snap.data();

    const nowTs = now();
    let durationSeconds = data.durationSeconds || 0;
    if (data.status === "active" && data.lastResumedAt) {
      const lastResumedAt = data.lastResumedAt?.toDate ? data.lastResumedAt.toDate() : data.lastResumedAt;
      durationSeconds += Math.floor((nowTs - lastResumedAt) / 1000);
    }

    await ref.update({
      status: "completed",
      endTime: nowTs,
      durationSeconds,
      lastResumedAt: null,
      updatedAt: nowTs,
    });

    res.json({ sessionId, status: "completed", durationSeconds, endTime: nowTs.toISOString() });
  } catch (err) {
    console.error("stopSession error", err);
    res.status(500).json({ error: "Failed to stop session" });
  }
}

export async function getTodayTotal(req, res) {
  try {
    const { userId } = req.params;
    const requester = req.user?.uid;
    if (!userId || requester !== userId) return res.status(403).json({ error: "Forbidden" });

    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 999);

    const snap = await firestore
      .collection(USERS)
      .doc(userId)
      .collection(SESSIONS)
      .where("createdAt", ">=", start)
      .where("createdAt", "<=", end)
      .get();

    let totalSeconds = 0;
    snap.forEach((doc) => {
      const d = doc.data();
      totalSeconds += d.durationSeconds || 0;
    });

    res.json({ totalSeconds, totalHours: Number((totalSeconds / 3600).toFixed(2)) });
  } catch (err) {
    console.error("getTodayTotal error", err);
    res.status(500).json({ error: "Failed to fetch totals" });
  }
}
