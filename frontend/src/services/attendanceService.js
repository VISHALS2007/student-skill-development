import { collection, doc, getDoc, getDocs, orderBy, query, setDoc, where } from "firebase/firestore";
import { auth, db } from "../firebase";

const todayKey = () => new Date().toISOString().split("T")[0];
const normalize = (name = "") => name.toLowerCase().trim();
const CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes

const cacheKey = (uid) => (uid ? `attendanceCache:v1:${uid}` : "attendanceCache:v1");

const readCache = (uid) => {
  try {
    const raw = localStorage.getItem(cacheKey(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || !Array.isArray(parsed.list)) return null;
    const fresh = Date.now() - parsed.ts < CACHE_TTL_MS;
    if (!fresh) return null;
    return parsed.list;
  } catch (err) {
    return null;
  }
};

const writeCache = (uid, list) => {
  try {
    localStorage.setItem(cacheKey(uid), JSON.stringify({ ts: Date.now(), list }));
  } catch (err) {
    /* ignore */
  }
};

const resolveUser = (maybeUserId) => maybeUserId || auth?.currentUser?.uid || null;

async function fetchSkills(userId) {
  const snap = await getDocs(query(collection(db, "users", userId, "skills")));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => (a.skillName || "").localeCompare(b.skillName || ""));
}

async function fetchCompletedSkillNames(userId, dateKey = todayKey()) {
  const snap = await getDocs(query(collection(db, "users", userId, "activityHistory"), where("date", "==", dateKey)));
  const set = new Set();
  snap.forEach((docSnap) => {
    const data = docSnap.data();
    if (data?.skillName) set.add(normalize(data.skillName));
  });
  return set;
}

export async function computeAttendance(userId, providedSkills) {
  const uid = resolveUser(userId);
  if (!uid) return null;
  const date = todayKey();
  const skills = providedSkills || (await fetchSkills(uid));
  const completed = await fetchCompletedSkillNames(uid, date);
  const completedSkills = [];
  const incompleteSkills = [];

  skills.forEach((s) => {
    const name = s.skillName || "";
    const key = normalize(name);
    if (completed.has(key)) completedSkills.push(name);
    else incompleteSkills.push(name);
  });

  const status = skills.length > 0 && completedSkills.length === skills.length ? "present" : "absent";

  return { date, status, completedSkills, incompleteSkills };
}

export async function updateAttendanceRecord(userId, providedSkills) {
  const uid = resolveUser(userId);
  if (!uid) return null;
  const attendance = await computeAttendance(uid, providedSkills);
  if (!attendance) return null;
  const ref = doc(db, "users", uid, "attendance", attendance.date);
  await setDoc(ref, { ...attendance, updatedAt: new Date().toISOString() }, { merge: true });
  // refresh cache with latest day at the top
  try {
    const cached = readCache(uid) || [];
    const filtered = cached.filter((item) => item.date !== attendance.date);
    writeCache(uid, [{ ...attendance }, ...filtered]);
  } catch (err) {
    /* ignore cache errors */
  }
  return attendance;
}

export async function fetchAttendance(userId, days = 14) {
  const uid = resolveUser(userId);
  if (!uid) return [];
  const cached = readCache(uid);
  if (cached) return cached.slice(0, days);
  const snap = await getDocs(query(collection(db, "users", uid, "attendance"), orderBy("date", "desc")));
  const list = snap.docs.map((d) => d.data());
  writeCache(uid, list);
  return list.slice(0, days);
}

// Compatibility helpers for Calendar page
export async function listAttendance(userId, days = 30) {
  return fetchAttendance(userId, days);
}

export async function getAttendanceByDate(date, userId) {
  const uid = resolveUser(userId);
  if (!uid || !date) return null;
  const cached = readCache(uid);
  if (cached) {
    const hit = cached.find((item) => item.date === date);
    if (hit) return hit;
  }
  const ref = doc(db, "users", uid, "attendance", date);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data();
}

export async function computeTodayAttendance(userId, providedSkills) {
  return updateAttendanceRecord(userId, providedSkills);
}
