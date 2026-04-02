import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "../firebase";

/**
 * Create or update user document in Firestore.
 * Used on register (email) and Google login (when new user).
 */
export async function createOrUpdateUser(user, extraData = {}) {
  if (!user?.uid) return;

  const userRef = doc(db, "users", user.uid);
  const existing = await getDoc(userRef);

  const userData = {
    id: user.uid,
    name: user.displayName || extraData.name || "",
    email: user.email || extraData.email || "",
    photoURL: user.photoURL || null,
    role: extraData.role || existing.data()?.role || "student",
    ...extraData,
  };

  // If new user, set createdAt
  if (!existing.exists()) {
    userData.createdAt = new Date().toISOString();
  }

  await setDoc(userRef, userData, { merge: true });
}
