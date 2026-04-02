import express from "express";
import cors from "cors";
import dotenv from "dotenv";
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

app.get("/health", (_req, res) => res.json({ status: "ok" }));

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
