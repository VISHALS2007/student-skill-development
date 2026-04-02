import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { startSession, pauseSession, resumeSession, stopSession, getTodayTotal } from "../controllers/sessionController.js";

const router = Router();

router.post("/start", verifyAuth, startSession);
router.post("/pause", verifyAuth, pauseSession);
router.post("/resume", verifyAuth, resumeSession);
router.post("/stop", verifyAuth, stopSession);
router.get("/today/:userId", verifyAuth, getTodayTotal);

export default router;
