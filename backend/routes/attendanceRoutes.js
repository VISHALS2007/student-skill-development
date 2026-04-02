import express from "express";
import { computeToday, getByDate, listAttendance, resetSkillsForNewDay } from "../controllers/attendanceController.js";

const router = express.Router();

router.post("/compute", computeToday);
router.get("/", listAttendance);
router.get("/:date", getByDate);
router.post("/reset", resetSkillsForNewDay);

export default router;
