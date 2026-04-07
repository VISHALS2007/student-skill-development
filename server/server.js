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

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
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
    } else {
      console.log("Default admin user already exists");
    }
  })
  .catch((err) => {
    console.error("Failed to ensure default admin user", err);
  });

startAttendanceSyncScheduler();

app.listen(port, () => {
  console.log(`Focus tracker API listening on ${port}`);
});
