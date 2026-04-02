import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import { listAttendance, markAttendance } from "../controllers/adminController.js";

const router = Router();

router.post("/mark", verifyAuth, verifyAdmin, markAttendance);
router.get("/report", verifyAuth, verifyAdmin, listAttendance);
router.get("/", verifyAuth, verifyAdmin, listAttendance);

export default router;
