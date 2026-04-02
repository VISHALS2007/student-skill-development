import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import { createAssignment, deleteAssignment, getAssignmentProgress, listAssignmentSubmissions, listAssignments, submitAssignment, updateAssignment } from "../controllers/adminController.js";

const router = Router();

router.get("/", verifyAuth, verifyAdmin, listAssignments);
router.post("/create", verifyAuth, verifyAdmin, createAssignment);
router.post("/assign", verifyAuth, verifyAdmin, submitAssignment);
router.get("/progress/:id", verifyAuth, verifyAdmin, getAssignmentProgress);
router.get("/submissions", verifyAuth, verifyAdmin, listAssignmentSubmissions);
router.put("/:assignmentId", verifyAuth, verifyAdmin, updateAssignment);
router.delete("/:assignmentId", verifyAuth, verifyAdmin, deleteAssignment);

export default router;
