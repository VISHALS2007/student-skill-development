import { auth, firestore } from "../firebaseAdmin.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || (IS_PRODUCTION ? "" : "skilldev-admin-secret");
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_STUDENT_DB_PATH = path.join(__dirname, "..", "data", "local-student-db.json");

const normalizeRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  if (normalized === "admin") return "main_admin";
  return normalized;
};

const isAdminRole = (role = "") => {
  const normalized = normalizeRole(role);
  return normalized === "main_admin" || normalized === "sub_admin";
};

const seedLocalStudentProfile = (uid, email = "") => {
  try {
    const dir = path.dirname(LOCAL_STUDENT_DB_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    let db = { users: {} };
    if (fs.existsSync(LOCAL_STUDENT_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_STUDENT_DB_PATH, "utf8");
      const parsed = JSON.parse(raw || "{}");
      db = { users: parsed.users || {} };
    }

    if (!db.users[uid]) {
      db.users[uid] = {
        profile: {
          id: uid,
          name: "",
          email,
          role: "student",
          enabled: true,
        },
        skills: [],
        courses: [],
        assignments: [],
        attendance: [],
        progress: [],
        resources: [],
      };
    } else {
      const prev = db.users[uid].profile || {};
      db.users[uid].profile = {
        ...prev,
        id: uid,
        role: "student",
        enabled: prev.enabled !== false,
        email: prev.email || email,
      };
    }

    fs.writeFileSync(LOCAL_STUDENT_DB_PATH, JSON.stringify(db, null, 2));
  } catch (err) {
    console.warn("seedLocalStudentProfile failed:", err?.message || err);
  }
};

export async function verifyAuth(req, res, next) {
  try {
    const sessionRaw = req.headers["x-admin-session"];
    if (sessionRaw) {
      try {
        const parsed = JSON.parse(sessionRaw);
        const role = normalizeRole(parsed?.role);
        if (isAdminRole(role)) {
          req.user = { uid: parsed.id || "admin-session", role, email: parsed?.email || "" };
          return next();
        }
      } catch {
        // Fall through to bearer token validation.
      }
    }

    const studentSessionRaw = req.headers["x-student-session"];
    if (studentSessionRaw) {
      try {
        const parsed = JSON.parse(studentSessionRaw);
        if (parsed?.uid) {
          const parsedRole = normalizeRole(parsed?.role);
          const role = isAdminRole(parsedRole) ? parsedRole : "student";
          const email = parsed?.email || "";
          if (role === "student") {
            seedLocalStudentProfile(parsed.uid, email);
          }
          req.user = { uid: parsed.uid, role, email };
          return next();
        }
      } catch {
        // Fall through to bearer token validation.
      }
    }

    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.replace("Bearer ", "") : null;
    if (!token) {
      return res.status(401).json({ error: "Missing auth token" });
    }

    // Allow admin JWTs for admin panel endpoints.
    if (ADMIN_JWT_SECRET) {
      try {
        const adminPayload = jwt.verify(token, ADMIN_JWT_SECRET);
        const role = normalizeRole(adminPayload?.role);
        if (isAdminRole(role)) {
          req.user = { uid: adminPayload.id || "admin", role, email: adminPayload.email || "" };
          return next();
        }
      } catch {
        // Not an admin JWT, continue with Firebase verification.
      }
    }

    const decoded = await auth.verifyIdToken(token);
    try {
      const userDoc = await firestore.collection("users").doc(decoded.uid).get();
      if (!userDoc.exists) {
        seedLocalStudentProfile(decoded.uid, decoded.email || "");
        req.user = { uid: decoded.uid, role: "student", email: decoded.email || "" };
        return next();
      }
      const profile = userDoc.data() || {};
      if (profile.enabled === false) {
        return res.status(403).json({ error: "Account is disabled" });
      }
      req.user = { uid: decoded.uid, role: normalizeRole(profile.role) || "student", email: decoded.email || "" };
      return next();
    } catch (firestoreErr) {
      console.warn("verifyAuth firestore lookup unavailable; continuing in local fallback mode:", firestoreErr?.message || firestoreErr);
      seedLocalStudentProfile(decoded.uid, decoded.email || "");
      req.user = { uid: decoded.uid, role: "student", email: decoded.email || "" };
      return next();
    }
  } catch (err) {
    console.error("Auth verify failed", err);
    res.status(401).json({ error: "Invalid auth token" });
  }
}
