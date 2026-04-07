import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mongoose from "mongoose";
import { connectDB } from "./config/db.js";
import skillRoutes from "./routes/skillRoutes.js";
import attendanceRoutes from "./routes/attendanceRoutes.js";
import { seedDefaults } from "./controllers/skillController.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.use("/api/skills", skillRoutes);
app.use("/api/attendance", attendanceRoutes);

const getDbState = () => {
  const stateMap = {
    0: "disconnected",
    1: "connected",
    2: "connecting",
    3: "disconnecting",
  };
  const readyState = mongoose.connection.readyState;
  return {
    readyState,
    state: stateMap[readyState] || "unknown",
    database: mongoose.connection.name || null,
    host: mongoose.connection.host || null,
  };
};

app.get("/health", (_req, res) => {
  const db = getDbState();
  res.json({ status: "ok", db });
});

app.get("/health/db", (_req, res) => {
  const db = getDbState();
  res.json({ ok: db.state === "connected", db });
});

const start = async () => {
  try {
    await connectDB();
    await seedDefaults();
    app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  } catch (err) {
    console.error("Failed to start server", err);
    process.exit(1);
  }
};

start();
