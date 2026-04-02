import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { verifyAdmin } from "../middleware/adminMiddleware.js";
import {
  adminLogin,
  assignCourseToAll,
  assignCourseToSelected,
  createCourse,
  createAssignment,
  deleteCourse,
  deleteAssignment,
  deleteUser,
  getReports,
  getAssignmentProgress,
  getDailyProgress,
  getStudentProgress,
  getUserProfileById,
  listAttendance,
  listAssignments,
  listCourses,
  listAssignmentSubmissions,
  listUsers,
  markAttendance,
  markBulkAttendance,
  removeAssignedCourse,
  resetStudentPassword,
  submitAssignment,
  sendNotification,
  updateCourse,
  updateAssignment,
  updateUserStatus,
} from "../controllers/adminController.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, message: "Admin API connected" }));
router.post("/login", adminLogin);

router.get("/courses", verifyAuth, verifyAdmin, listCourses);
router.post("/courses", verifyAuth, verifyAdmin, createCourse);
router.put("/courses/:courseId", verifyAuth, verifyAdmin, updateCourse);
router.delete("/courses/:courseId", verifyAuth, verifyAdmin, deleteCourse);

router.get("/assignments", verifyAuth, verifyAdmin, listAssignments);
router.post("/assignments", verifyAuth, verifyAdmin, createAssignment);
router.put("/assignments/:assignmentId", verifyAuth, verifyAdmin, updateAssignment);
router.delete("/assignments/:assignmentId", verifyAuth, verifyAdmin, deleteAssignment);
router.get("/assignments/progress/:assignmentId", verifyAuth, verifyAdmin, getAssignmentProgress);
router.get("/assignments/submissions", verifyAuth, verifyAdmin, listAssignmentSubmissions);
router.post("/assignments/submissions", verifyAuth, verifyAdmin, submitAssignment);

router.post("/courses/assign/all", verifyAuth, verifyAdmin, assignCourseToAll);
router.post("/courses/assign/selected", verifyAuth, verifyAdmin, assignCourseToSelected);
router.delete("/courses/assign/:userId/:courseId", verifyAuth, verifyAdmin, removeAssignedCourse);

router.get("/users", verifyAuth, verifyAdmin, listUsers);
router.get("/users/:userId", verifyAuth, verifyAdmin, getUserProfileById);
router.delete("/users/:userId", verifyAuth, verifyAdmin, deleteUser);
router.patch("/users/:userId/status", verifyAuth, verifyAdmin, updateUserStatus);
router.patch("/users/:userId/password", verifyAuth, verifyAdmin, resetStudentPassword);

router.get("/progress/:userId", verifyAuth, verifyAdmin, getStudentProgress);
router.get("/progress", verifyAuth, verifyAdmin, getDailyProgress);
router.post("/attendance", verifyAuth, verifyAdmin, markAttendance);
router.post("/attendance/bulk", verifyAuth, verifyAdmin, markBulkAttendance);
router.get("/attendance", verifyAuth, verifyAdmin, listAttendance);
router.get("/reports", verifyAuth, verifyAdmin, getReports);
router.post("/notifications", verifyAuth, verifyAdmin, sendNotification);

export default router;
