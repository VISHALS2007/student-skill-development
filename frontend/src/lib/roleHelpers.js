import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";
import { parseAcademicDetailsFromEmail } from "./emailPolicy";

const PROFILE_CACHE_PREFIX = "profile-cache:v1";
const PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

function readCachedProfile(uid) {
  try {
    const raw = sessionStorage.getItem(`${PROFILE_CACHE_PREFIX}:${uid}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.ts || Date.now() - parsed.ts > PROFILE_CACHE_TTL_MS) {
      sessionStorage.removeItem(`${PROFILE_CACHE_PREFIX}:${uid}`);
      return null;
    }
    return parsed.data || null;
  } catch {
    return null;
  }
}

function writeCachedProfile(uid, data) {
  try {
    sessionStorage.setItem(`${PROFILE_CACHE_PREFIX}:${uid}`, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Ignore cache write failures.
  }
}

export async function getUserProfile(uid) {
  if (!uid) return null;
  const cached = readCachedProfile(uid);
  if (cached) return cached;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const profile = { id: snap.id, ...snap.data() };
  writeCachedProfile(uid, profile);
  return profile;
}

export async function ensureUserProfile(user, extraData = {}) {
  if (!user?.uid) return null;
  const existing = await getUserProfile(user.uid);

  const detectedAcademic = parseAcademicDetailsFromEmail(
    extraData.email || user.email || existing?.email || ""
  );

  if (existing) {
    const patch = {};
    if (!existing.department && (extraData.department || detectedAcademic.department)) {
      patch.department = extraData.department || detectedAcademic.department;
    }
    if (!existing.departmentCode && (extraData.departmentCode || detectedAcademic.departmentCode)) {
      patch.departmentCode = extraData.departmentCode || detectedAcademic.departmentCode;
    }
    if (!existing.batch && (extraData.batch || detectedAcademic.batch)) {
      patch.batch = extraData.batch || detectedAcademic.batch;
    }
    if (!existing.year && (extraData.year || detectedAcademic.year)) {
      patch.year = extraData.year || detectedAcademic.year;
    }

    if (Object.keys(patch).length) {
      await setDoc(doc(db, "users", user.uid), patch, { merge: true });
      const merged = { ...existing, ...patch };
      writeCachedProfile(user.uid, merged);
      return merged;
    }

    return existing;
  }

  const role = extraData.role || "student";
  const payload = {
    id: user.uid,
    name: user.displayName || extraData.name || "",
    email: user.email || extraData.email || "",
    role,
    department: extraData.department || detectedAcademic.department || "",
    departmentCode: extraData.departmentCode || detectedAcademic.departmentCode || "",
    batch: extraData.batch || detectedAcademic.batch || "",
    year: extraData.year || detectedAcademic.year || "",
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, "users", user.uid), payload, { merge: true });
    writeCachedProfile(user.uid, payload);
    return payload;
  } catch (err) {
    // Keep login flow alive even if profile write is blocked by rules.
    const fallback = { ...payload, createdAt: new Date().toISOString() };
    writeCachedProfile(user.uid, fallback);
    return fallback;
  }
}

export function resolveHomeRouteByRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "main_admin" || normalized === "admin") return "/main-admin";
  if (normalized === "sub_admin") return "/sub-admin";
  return "/dashboard";
}
