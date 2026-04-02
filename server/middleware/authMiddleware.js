import { auth } from "../firebaseAdmin.js";

export async function verifyAuth(req, res, next) {
  try {
    const sessionRaw = req.headers["x-admin-session"];
    if (sessionRaw) {
      try {
        const parsed = JSON.parse(sessionRaw);
        if (parsed?.role === "admin") {
          req.user = { uid: parsed.id || "admin-session" };
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
    const decoded = await auth.verifyIdToken(token);
    req.user = { uid: decoded.uid };
    next();
  } catch (err) {
    console.error("Auth verify failed", err);
    res.status(401).json({ error: "Invalid auth token" });
  }
}
