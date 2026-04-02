import express from "express";
import cors from "cors";
import { config as loadEnv } from "dotenv";
import sessionRoutes from "./routes/sessionRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import { ensureDefaultAdminUser } from "./controllers/adminController.js";

loadEnv();

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: process.env.CORS_ORIGIN || true }));
app.use(express.json());

app.get("/health", (_req, res) => res.json({ ok: true }));
app.use("/api/session", sessionRoutes);
app.use("/api/admin", adminRoutes);

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

app.listen(port, () => {
  console.log(`Focus tracker API listening on ${port}`);
});
