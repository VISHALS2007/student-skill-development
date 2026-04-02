import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "../firebase";

export async function getUserProfile(uid) {
  if (!uid) return null;
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function ensureUserProfile(user, extraData = {}) {
  if (!user?.uid) return null;
  const existing = await getUserProfile(user.uid);
  if (existing) return existing;

  const role = extraData.role || "student";
  const payload = {
    id: user.uid,
    name: user.displayName || extraData.name || "",
    email: user.email || extraData.email || "",
    role,
    createdAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, "users", user.uid), payload, { merge: true });
    return payload;
  } catch (err) {
    // Keep login flow alive even if profile write is blocked by rules.
    return { ...payload, createdAt: new Date().toISOString() };
  }
}

export function resolveHomeRouteByRole(role) {
  return role === "admin" ? "/admin/dashboard" : "/dashboard";
}
