import { Router } from "express";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { verifyMainAdmin, verifyMainOrSubAdmin, verifySubAdmin } from "../middleware/adminMiddleware.js";
import {
  adminLogin,
  adminLogout,
  allocateCourse,
  assignCourseToAll,
  assignCourseToSelected,
  createCourse,
  createAssignment,
  deleteAllocation,
  deleteCourse,
  deleteAssignment,
  createAssessment,
  deleteUser,
  deleteAssessment,
  getDashboardSummary,
  listAssessments,
  listAssessmentResults,
  listRecentAssessmentResults,
  getReports,
  listAllottedSkills,
  listCommunicationTasks,
  createCommunicationTask,
  updateCommunicationTask,
  listCommunicationSubmissions,
  reviewCommunicationSubmission,
  updateAssessment,
  getAssignmentProgress,
  getDailyProgress,
  getLeaderboard,
  getStudentProgress,
  getUserProfileById,
  listAttendance,
  listAssignments,
  listAllocations,
  listCourseAllocations,
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
  updateUserRole,
  updateUserStatus,
} from "../controllers/adminController.js";

const router = Router();

router.get("/health", (_req, res) => res.json({ ok: true, message: "Admin API connected" }));
router.post("/login", adminLogin);
router.post("/logout", verifyAuth, verifyMainOrSubAdmin, adminLogout);
router.get("/dashboard", verifyAuth, verifyMainOrSubAdmin, getDashboardSummary);

router.get("/courses", verifyAuth, verifyMainOrSubAdmin, listCourses);
router.post("/courses", verifyAuth, verifySubAdmin, createCourse);
router.put("/courses/:courseId", verifyAuth, verifySubAdmin, updateCourse);
router.delete("/courses/:courseId", verifyAuth, verifySubAdmin, deleteCourse);

router.get("/assignments", verifyAuth, verifyMainOrSubAdmin, listAssignments);
router.post("/assignments", verifyAuth, verifySubAdmin, createAssignment);
router.put("/assignments/:assignmentId", verifyAuth, verifySubAdmin, updateAssignment);
router.delete("/assignments/:assignmentId", verifyAuth, verifySubAdmin, deleteAssignment);
router.get("/assignments/progress/:assignmentId", verifyAuth, verifyMainOrSubAdmin, getAssignmentProgress);
router.get("/assignments/submissions", verifyAuth, verifyMainOrSubAdmin, listAssignmentSubmissions);
router.post("/assignments/submissions", verifyAuth, verifySubAdmin, submitAssignment);
router.get("/assessments", verifyAuth, verifyMainOrSubAdmin, listAssessments);
router.post("/assessment", verifyAuth, verifySubAdmin, createAssessment);
router.post("/assessments", verifyAuth, verifySubAdmin, createAssessment);
router.put("/assessments/:assessmentId", verifyAuth, verifySubAdmin, updateAssessment);
router.delete("/assessments/:assessmentId", verifyAuth, verifySubAdmin, deleteAssessment);
router.post("/attempt", verifyAuth, verifySubAdmin, submitAssignment);
router.get("/results", verifyAuth, verifyMainOrSubAdmin, listAssessmentResults);
router.get("/recent-results", verifyAuth, verifyMainOrSubAdmin, listRecentAssessmentResults);

router.post("/courses/assign/all", verifyAuth, verifySubAdmin, assignCourseToAll);
router.post("/courses/assign/selected", verifyAuth, verifySubAdmin, assignCourseToSelected);
router.post("/allocate", verifyAuth, verifySubAdmin, allocateCourse);
router.get("/courses/:courseId/allocations", verifyAuth, verifyMainOrSubAdmin, listCourseAllocations);
router.get("/allocations", verifyAuth, verifyMainOrSubAdmin, listAllocations);
router.delete("/allocations/:allocationId", verifyAuth, verifySubAdmin, deleteAllocation);
router.delete("/courses/assign/:userId/:courseId", verifyAuth, verifySubAdmin, removeAssignedCourse);
router.get("/allotted-skills", verifyAuth, verifyMainOrSubAdmin, listAllottedSkills);
router.get("/communication/tasks", verifyAuth, verifyMainOrSubAdmin, listCommunicationTasks);
router.post("/communication/tasks", verifyAuth, verifySubAdmin, createCommunicationTask);
router.put("/communication/tasks/:taskId", verifyAuth, verifySubAdmin, updateCommunicationTask);
router.get("/communication/submissions", verifyAuth, verifyMainOrSubAdmin, listCommunicationSubmissions);
router.patch("/communication/submissions/:submissionId/review", verifyAuth, verifySubAdmin, reviewCommunicationSubmission);

router.get("/users", verifyAuth, verifyMainAdmin, listUsers);
router.get("/students", verifyAuth, verifyMainOrSubAdmin, listUsers);
router.get("/users/:userId", verifyAuth, verifyMainAdmin, getUserProfileById);
router.delete("/users/:userId", verifyAuth, verifyMainAdmin, deleteUser);
router.patch("/users/:userId/status", verifyAuth, verifyMainAdmin, updateUserStatus);
router.patch("/users/:userId/password", verifyAuth, verifyMainAdmin, resetStudentPassword);
router.patch("/users/:userId/role", verifyAuth, verifyMainAdmin, updateUserRole);

router.get("/progress/:userId", verifyAuth, verifyMainOrSubAdmin, getStudentProgress);
router.get("/progress", verifyAuth, verifyMainOrSubAdmin, getDailyProgress);
router.get("/leaderboard", verifyAuth, verifyMainOrSubAdmin, getLeaderboard);
router.post("/attendance", verifyAuth, verifySubAdmin, markAttendance);
router.post("/attendance/mark", verifyAuth, verifySubAdmin, markAttendance);
router.post("/attendance/bulk", verifyAuth, verifySubAdmin, markBulkAttendance);
router.get("/attendance", verifyAuth, verifyMainOrSubAdmin, listAttendance);
router.get("/reports", verifyAuth, verifyMainAdmin, getReports);
router.get("/reports/attendance", verifyAuth, verifyMainAdmin, getReports);
router.post("/notifications", verifyAuth, verifyMainAdmin, sendNotification);

export default router;
