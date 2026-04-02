import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import { assignCourseToAll, assignCourseToSelected, createCourse, deleteCourse, listCourses, removeAssignedCourse, updateCourse } from "../controllers/adminController.js";

const router = Router();

router.get("/", verifyAuth, verifyAdmin, listCourses);
router.post("/", verifyAuth, verifyAdmin, createCourse);
router.put("/:courseId", verifyAuth, verifyAdmin, updateCourse);
router.delete("/:courseId", verifyAuth, verifyAdmin, deleteCourse);

router.post("/assign/all", verifyAuth, verifyAdmin, assignCourseToAll);
router.post("/assign/selected", verifyAuth, verifyAdmin, assignCourseToSelected);
router.delete("/assign/:userId/:courseId", verifyAuth, verifyAdmin, removeAssignedCourse);

export default router;
