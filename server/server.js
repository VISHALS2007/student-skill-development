import express from "express";
import cors from "cors";
import compression from "compression";
import { config as loadEnv } from "dotenv";
import sessionRoutes from "./routes/sessionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import studentRoutes from "./routes/studentRoutes.js";
import { ensureDefaultAdminUser, getDashboardSummary, startAttendanceSyncScheduler } from "./controllers/adminController.js";
import { verifyAuth } from "./middleware/authMiddleware.js";
import { verifyMainOrSubAdmin } from "./middleware/adminMiddleware.js";

loadEnv();

const app = express();
const port = process.env.PORT || 4000;
const logLocalFallback = String(process.env.LOG_LOCAL_FALLBACK || "").trim().toLowerCase() === "true";
const logStartup = String(process.env.LOG_STARTUP || (String(process.env.NODE_ENV || "").toLowerCase() === "production" ? "true" : "false"))
  .trim()
  .toLowerCase() === "true";
const corsOriginsRaw = String(process.env.CORS_ORIGIN || "").trim();
const corsOrigin = (() => {
  if (!corsOriginsRaw) return true;
  const parsed = corsOriginsRaw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  if (parsed.length === 0) return true;
  if (parsed.length === 1) return parsed[0];
  return parsed;
})();

app.use(cors({ origin: corsOrigin }));
app.use(compression());
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/api/dashboard", verifyAuth, verifyMainOrSubAdmin, getDashboardSummary);
app.use("/api/session", sessionRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/student", studentRoutes);

ensureDefaultAdminUser()
  .then((result) => {
    if (result?.seeded) {
      console.log("Default admin user seeded in users collection");
    } else if (result?.skipped) {
      if (result?.reason === "firestore-not-configured") {
        if (logLocalFallback) {
          console.log("Admin seed skipped: Firestore is not configured; local fallback mode is active.");
        }
      } else if (result?.reason === "password-not-configured") {
        console.log("Admin seed skipped: admin seed passwords are not configured.");
      } else {
        console.log("Admin seed skipped.");
      }
    } else {
      console.log("Default admin user already exists");
    }
  })
  .catch((err) => {
    console.error("Failed to ensure default admin user", err);
  });

startAttendanceSyncScheduler();

app.listen(port, () => {
  if (logStartup) {
    console.log(`Focus tracker API listening on ${port}`);
  }
});
