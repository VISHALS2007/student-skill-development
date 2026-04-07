import { firestore } from "../firebaseAdmin.js";

const USERS = "users";
const ADMIN_SESSION_HEADER = "x-admin-session";

const ADMIN_ROLES = new Set(["main_admin", "sub_admin"]);

const normalizeAdminRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "main_admin";
  return normalized;
};

const isAdminRole = (role = "") => ADMIN_ROLES.has(normalizeAdminRole(role));

const toAdminContext = ({ id = "", uid = "", email = "", role = "" } = {}) => ({
  id: id || uid || "",
  email,
  role: normalizeAdminRole(role),
});

const readAdminFromRequest = async (req) => {
  const authRole = normalizeAdminRole(req.user?.role);
  if (isAdminRole(authRole)) {
    return toAdminContext({ uid: req.user.uid, email: req.user.email || "", role: authRole });
  }

  const sessionRaw = req.headers[ADMIN_SESSION_HEADER];
  if (sessionRaw) {
    const parsed = JSON.parse(sessionRaw);
    const sessionRole = normalizeAdminRole(parsed?.role);
    if (isAdminRole(sessionRole)) {
      return toAdminContext({ id: parsed?.id || "admin-session", email: parsed?.email || "", role: sessionRole });
    }
  }

  const uid = req.user?.uid;
  if (!uid) return null;

  const snap = await firestore.collection(USERS).doc(uid).get();
  if (!snap.exists) return null;

  const data = snap.data() || {};
  const profileRole = normalizeAdminRole(data.role);
  if (!isAdminRole(profileRole)) return null;

  return toAdminContext({ id: uid, email: data.email || req.user?.email || "", role: profileRole });
};

export function requireAdminRoles(allowedRoles = []) {
  const normalizedAllowed = new Set(allowedRoles.map((role) => normalizeAdminRole(role)).filter((role) => ADMIN_ROLES.has(role)));

  return async function roleGuard(req, res, next) {
    try {
      const admin = await readAdminFromRequest(req);
      if (!admin) {
        return res.status(403).json({ error: "Admin access required" });
      }

      req.admin = admin;

      if (normalizedAllowed.size > 0 && !normalizedAllowed.has(admin.role)) {
        return res.status(403).json({ error: "Insufficient admin permissions" });
      }

      return next();
    } catch (err) {
      console.error("requireAdminRoles error", err);
      return res.status(500).json({ error: "Failed to verify admin role" });
    }
  };
}

export async function verifyAdmin(req, res, next) {
  return requireAdminRoles(["main_admin", "sub_admin"])(req, res, next);
}

export const verifyMainAdmin = requireAdminRoles(["main_admin"]);
export const verifySubAdmin = requireAdminRoles(["sub_admin"]);
export const verifyMainOrSubAdmin = requireAdminRoles(["main_admin", "sub_admin"]);
