import express from "express";
import {
  getStudentDashboard,
  getStudentProfile,
  getStudentSkills,
  addStudentSkill,
  updateStudentSkill,
  deleteStudentSkill,
  getStudentCourses,
  getStudentAssignments,
  getStudentAssessmentResults,
  markAssignmentComplete,
  submitAssessmentAttempt,
  getStudentCommunicationTasks,
  submitStudentCommunicationResponse,
  getStudentCommunicationSubmissions,
  getStudentAttendance,
  getStudentAllocatedAttendance,
  getStudentMySkillsAttendance,
  getStudentProgress,
  getStudentResources,
} from "../controllers/studentController.js";
import { verifyAuth } from "../middleware/authMiddleware.js";

const router = express.Router();

// All student routes require authentication
router.use(verifyAuth);

// Profile
router.get("/dashboard", getStudentDashboard);
router.get("/profile", getStudentProfile);

// Skills
router.get("/skills", getStudentSkills);
router.post("/skills", addStudentSkill);
router.put("/skills/:skillId", updateStudentSkill);
router.delete("/skills/:skillId", deleteStudentSkill);

// Courses
router.get("/courses", getStudentCourses);

// Assignments
router.get("/assignments", getStudentAssignments);
router.put("/assignments/:assignmentId/complete", markAssignmentComplete);
router.get("/assessments", getStudentAssignments);
router.post("/assessments/:assessmentId/attempt", submitAssessmentAttempt);
router.post("/submit", submitAssessmentAttempt);
router.get("/results", getStudentAssessmentResults);
router.get("/communication/tasks", getStudentCommunicationTasks);
router.post("/communication/submissions", submitStudentCommunicationResponse);
router.get("/communication/submissions", getStudentCommunicationSubmissions);

// Attendance (view-only)
router.get("/attendance", getStudentAttendance);
router.get("/attendance/allocated", getStudentAllocatedAttendance);
router.get("/attendance/myskills", getStudentMySkillsAttendance);

// Progress
router.get("/progress", getStudentProgress);

// Resources
router.get("/resources", getStudentResources);

export default router;
