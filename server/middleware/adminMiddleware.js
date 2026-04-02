import { firestore } from "../firebaseAdmin.js";

const USERS = "users";
const ADMIN_SESSION_HEADER = "x-admin-session";

export async function verifyAdmin(req, res, next) {
  try {
    const sessionRaw = req.headers[ADMIN_SESSION_HEADER];
    if (sessionRaw) {
      const parsed = JSON.parse(sessionRaw);
      if (parsed?.role === "admin") {
        req.admin = parsed;
        return next();
      }
    }

    const uid = req.user?.uid;
    if (!uid) return res.status(401).json({ error: "Missing auth context" });

    const snap = await firestore.collection(USERS).doc(uid).get();
    if (!snap.exists) return res.status(403).json({ error: "Admin profile not found" });

    const data = snap.data() || {};
    if (data.role !== "admin") {
      return res.status(403).json({ error: "Admin access required" });
    }

    req.admin = { id: uid, ...data };
    next();
  } catch (err) {
    console.error("verifyAdmin error", err);
    res.status(500).json({ error: "Failed to verify admin role" });
  }
}
