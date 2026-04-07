import { firestore } from "../firebaseAdmin.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import { submitAssignment } from "./adminController.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_STUDENT_DB_PATH = path.join(__dirname, "..", "data", "local-student-db.json");
const LOCAL_ADMIN_DB_PATH = path.join(__dirname, "..", "data", "local-admin-db.json");
const COMMUNICATION_TASKS = "communication_tasks";
const STUDENT_SUBMISSIONS = "student_submissions";
const ATTENDANCE = "attendance";

const ensureLocalStudentDb = () => {
  const dir = path.dirname(LOCAL_STUDENT_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOCAL_STUDENT_DB_PATH)) {
    fs.writeFileSync(LOCAL_STUDENT_DB_PATH, JSON.stringify({ users: {} }, null, 2));
  }
};

const readLocalStudentDb = () => {
  ensureLocalStudentDb();
  try {
    const raw = fs.readFileSync(LOCAL_STUDENT_DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return { users: parsed.users || {} };
  } catch {
    return { users: {} };
  }
};

const writeLocalStudentDb = (db) => {
  ensureLocalStudentDb();
  fs.writeFileSync(LOCAL_STUDENT_DB_PATH, JSON.stringify(db, null, 2));
};

const getLocalStudentBucket = (db, userId, fallbackEmail = "") => {
  if (!db.users[userId]) {
    db.users[userId] = {
      profile: {
        id: userId,
        name: "",
        email: fallbackEmail,
        role: "student",
      },
      skills: [],
      courses: [],
      assignments: [],
      attendance: [],
      progress: [],
      resources: [],
    };
  }
  return db.users[userId];
};

const toDateKey = (value) => {
  if (!value) return "";
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const todayDateKey = () => new Date().toISOString().slice(0, 10);
const attendanceDocId = (userId, courseId, date) => `${userId}_${courseId}_${date}`;
const normalizeSkillCategory = (course = {}) => {
  const base = String(course?.category || "").trim().toLowerCase();
  const custom = String(course?.customCategory || "").trim().toLowerCase();
  const merged = `${base} ${custom}`.trim();
  if (merged.includes("communication")) return "communication";
  if (merged.includes("aptitude")) return "aptitude";
  if (merged.includes("coding") || merged.includes("problem") || merged.includes("learning")) return "coding";
  return "others";
};

const ensureLocalAdminDb = () => {
  const dir = path.dirname(LOCAL_ADMIN_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(LOCAL_ADMIN_DB_PATH)) {
    fs.writeFileSync(
      LOCAL_ADMIN_DB_PATH,
      JSON.stringify({ courses: [], assessments: [], submissions: [], assessmentResults: [], communicationTasks: [], studentSubmissions: [] }, null, 2)
    );
  }
};

const readLocalAdminDb = () => {
  ensureLocalAdminDb();
  try {
    const raw = fs.readFileSync(LOCAL_ADMIN_DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return {
      courses: Array.isArray(parsed.courses) ? parsed.courses : [],
      communicationTasks: Array.isArray(parsed.communicationTasks) ? parsed.communicationTasks : [],
      studentSubmissions: Array.isArray(parsed.studentSubmissions) ? parsed.studentSubmissions : [],
    };
  } catch {
    return { courses: [], communicationTasks: [], studentSubmissions: [] };
  }
};

const writeLocalAdminDb = (db) => {
  ensureLocalAdminDb();
  fs.writeFileSync(LOCAL_ADMIN_DB_PATH, JSON.stringify(db, null, 2));
};

const toEpoch = (value) => {
  const ts = Date.parse(value || "");
  return Number.isNaN(ts) ? 0 : ts;
};

const normalizeDurationMinutes = (value, fallback = 30) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(240, Math.max(1, Math.round(n)));
};

const normalizeSkillWebsites = (value) => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === "string") {
        const url = entry.trim();
        if (!url) return null;
        return { label: url.replace(/https?:\/\//i, ""), url };
      }

      const label = String(entry?.label || "").trim();
      const url = String(entry?.url || "").trim();
      if (!label && !url) return null;
      return { label, url };
    })
    .filter(Boolean);
};

const normalizeSkillItem = (item = {}) => ({
  ...item,
  defaultDuration: normalizeDurationMinutes(item.defaultDuration, 30),
  skillWebsites: normalizeSkillWebsites(item.skillWebsites),
});

export const getStudentDashboard = async (req, res) => {
  const userId = req.user.uid;

  try {
    const [userDoc, skillsSnapshots, allocationsSnapshot, assignmentsSnapshot, submissionsSnapshot, attendanceSnapshot, progressSnapshot] = await Promise.all([
      firestore.collection("users").doc(userId).get(),
      firestore.collection("user_skills").where("user_id", "==", userId).get(),
      firestore.collection("user_courses").where("user_id", "==", userId).get(),
      firestore.collection("assignments").get(),
      firestore.collection("assignment_submissions").where("userId", "==", userId).get(),
      firestore.collection("attendance").where("user_id", "==", userId).get(),
      firestore.collection("user_progress").where("user_id", "==", userId).get(),
    ]);

    const profile = userDoc.exists ? (userDoc.data() || {}) : { id: userId, email: req.user.email || "", role: "student" };

    const skills = [];
    skillsSnapshots.forEach((docSnap) => {
      skills.push({ id: docSnap.id, ...docSnap.data() });
    });

    const submissionByAssessment = new Map();
    const submissions = [];
    submissionsSnapshot.forEach((docSnap) => {
      const row = { id: docSnap.id, ...(docSnap.data() || {}) };
      submissions.push(row);
      if (row.assignmentId) submissionByAssessment.set(row.assignmentId, row);
    });

    const allocatedCourses = [];
    const registeredCourses = [];
    const studentCourseIds = new Set();
    const allocationRows = allocationsSnapshot.docs.map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }));
    const courseDocById = new Map();

    await Promise.all(
      allocationRows.map(async (allocation) => {
        const courseId = allocation.course_id;
        if (!courseId || courseDocById.has(courseId)) return;
        const courseDoc = await firestore.collection("courses").doc(courseId).get();
        if (courseDoc.exists) {
          courseDocById.set(courseId, { id: courseDoc.id, ...(courseDoc.data() || {}) });
        }
      })
    );

    allocationRows.forEach((allocation) => {
      const courseId = allocation.course_id;
      const courseData = courseDocById.get(courseId);
      if (!courseData) return;
      studentCourseIds.add(courseId);

      const courseItem = {
        id: allocation.id,
        ...courseData,
        allocationId: allocation.id,
        status: allocation.status || "active",
        startDate: allocation.startDate,
        endDate: allocation.endDate,
        source: allocation.source || "admin",
      };

      if (String(courseItem.source || "admin").toLowerCase() === "student" || String(courseItem.status || "").toLowerCase() === "registered") {
        registeredCourses.push(courseItem);
      } else {
        allocatedCourses.push(courseItem);
      }
    });

    const assignments = [];
    assignmentsSnapshot.forEach((docSnap) => {
      const assignmentData = docSnap.data() || {};
      const isForAllStudents = assignmentData.assignTo === "all";
      const isForThisStudent = (assignmentData.userIds || assignmentData.assignedUsers || []).includes(userId);
      const isCourseAssignment = studentCourseIds.has(assignmentData.courseId);

      if ((isForAllStudents || isForThisStudent) && isCourseAssignment) {
        const attempt = submissionByAssessment.get(docSnap.id);
        assignments.push({
          id: docSnap.id,
          ...assignmentData,
          courseName: assignmentData.courseName || "General",
          status: attempt ? "completed" : "pending",
          score: attempt?.marks ?? null,
          totalMarks: attempt?.totalMarks ?? assignmentData.totalMarks ?? null,
          attemptedAt: attempt?.submittedAt || null,
        });
      }
    });

    const attendance = attendanceSnapshot.docs
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .sort((a, b) => toEpoch(b.date) - toEpoch(a.date));

    const progress = progressSnapshot.docs.map((docSnap) => {
      const data = docSnap.data() || {};
      return {
        id: docSnap.id,
        ...data,
        completionPercent: Math.round(((data.completedLessons || 0) / (data.totalLessons || 1)) * 100),
      };
    });

    const resources = [];
    courseDocById.forEach((course, courseId) => {
      const courseName = course.title || course.course_name || "Untitled Course";
      if (Array.isArray(course.links)) {
        course.links.forEach((link) => {
          resources.push({
            courseName,
            courseId,
            url: link.url,
            type: link.type || "link",
          });
        });
      }
    });

    const recentActivity = submissions
      .slice()
      .sort((a, b) => toEpoch(b.submittedAt || b.createdAt) - toEpoch(a.submittedAt || a.createdAt))
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        type: "assessment",
        title: row.assignmentTitle || "Assessment submission",
        status: row.status || "submitted",
        at: row.submittedAt || row.createdAt || new Date().toISOString(),
      }));

    return res.json({
      ok: true,
      item: {
        profile,
        skills,
        courses: {
          items: [...allocatedCourses, ...registeredCourses],
          allocatedCourses,
          registeredCourses,
        },
        assignments,
        attendance,
        progress,
        resources,
        recentActivity,
      },
    });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, userId, req.user.email || "");
    writeLocalStudentDb(db);

    const profile = bucket.profile || { id: userId, email: req.user.email || "", role: "student" };
    const skills = bucket.skills || [];
    const allocatedCourses = bucket.courses || [];
    const registeredCourses = [];
    const assignments = (bucket.assignments || []).map((a) => ({ ...a, status: a.status || "pending", score: a.score ?? null }));
    const attendance = (bucket.attendance || []).slice().sort((a, b) => toEpoch(b.date) - toEpoch(a.date));
    const progress = bucket.progress || [];
    const resources = bucket.resources || [];
    const recentActivity = assignments
      .filter((row) => row.attemptedAt || row.updatedAt || row.createdAt)
      .slice()
      .sort((a, b) => toEpoch(b.attemptedAt || b.updatedAt || b.createdAt) - toEpoch(a.attemptedAt || a.updatedAt || a.createdAt))
      .slice(0, 5)
      .map((row) => ({
        id: row.id,
        type: "assessment",
        title: row.title || "Assessment",
        status: row.status || "pending",
        at: row.attemptedAt || row.updatedAt || row.createdAt || new Date().toISOString(),
      }));

    return res.json({
      ok: true,
      item: {
        profile,
        skills,
        courses: {
          items: [...allocatedCourses, ...registeredCourses],
          allocatedCourses,
          registeredCourses,
        },
        assignments,
        attendance,
        progress,
        resources,
        recentActivity,
      },
      source: "local-fallback",
    });
  }
};

// Get student profile
export const getStudentProfile = async (req, res) => {
  try {
    const userId = req.user.uid;
    const userDoc = await firestore.collection("users").doc(userId).get();
    
    if (!userDoc.exists) {
      return res.status(404).json({ error: "Student not found" });
    }

    res.json({ item: userDoc.data() });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    writeLocalStudentDb(db);
    res.json({ item: bucket.profile, source: "local-fallback" });
  }
};

// Get student's allocated and personal skills
export const getStudentSkills = async (req, res) => {
  try {
    const userId = req.user.uid;
    const skillsSnapshots = await firestore.collection("user_skills").where("user_id", "==", userId).get();
    
    const items = [];
    skillsSnapshots.forEach((doc) => {
      items.push(normalizeSkillItem({ id: doc.id, ...doc.data() }));
    });

    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    writeLocalStudentDb(db);
    res.json({ items: (bucket.skills || []).map((item) => normalizeSkillItem(item)), source: "local-fallback" });
  }
};

// Add personal skill
export const addStudentSkill = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { title, description, defaultDuration, skillWebsites } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Skill title is required" });
    }

    const nextDuration = normalizeDurationMinutes(defaultDuration, 30);
    const nextWebsites = normalizeSkillWebsites(skillWebsites);

    const skillRef = await firestore.collection("user_skills").add({
      user_id: userId,
      title: title.trim(),
      description: description?.trim() || "",
      defaultDuration: nextDuration,
      skillWebsites: nextWebsites,
      addedBy: "student",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    res.json({
      item: {
        id: skillRef.id,
        user_id: userId,
        title,
        description,
        defaultDuration: nextDuration,
        skillWebsites: nextWebsites,
        addedBy: "student",
      },
    });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const nextDuration = normalizeDurationMinutes(req.body?.defaultDuration, 30);
    const nextWebsites = normalizeSkillWebsites(req.body?.skillWebsites);
    const item = {
      id: randomUUID(),
      user_id: req.user.uid,
      title: String(req.body?.title || "").trim(),
      description: String(req.body?.description || "").trim(),
      defaultDuration: nextDuration,
      skillWebsites: nextWebsites,
      addedBy: "student",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    bucket.skills.push(item);
    writeLocalStudentDb(db);
    res.json({ item: normalizeSkillItem(item), source: "local-fallback" });
  }
};

// Update personal skill
export const updateStudentSkill = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { skillId } = req.params;
    const { title, description, defaultDuration, skillWebsites } = req.body;

    if (!title) {
      return res.status(400).json({ error: "Skill title is required" });
    }

    const nextDuration = normalizeDurationMinutes(defaultDuration, 30);
    const nextWebsites = normalizeSkillWebsites(skillWebsites);

    const skillDoc = await firestore.collection("user_skills").doc(skillId).get();
    if (!skillDoc.exists || skillDoc.data().user_id !== userId) {
      return res.status(403).json({ error: "Cannot update this skill" });
    }

    // Prevent editing admin-allocated skills
    if (skillDoc.data().addedBy === "admin") {
      return res.status(403).json({ error: "Cannot edit admin-allocated skills" });
    }

    await firestore.collection("user_skills").doc(skillId).update({
      title: title.trim(),
      description: description?.trim() || "",
      defaultDuration: nextDuration,
      skillWebsites: nextWebsites,
      updatedAt: new Date(),
    });

    res.json({ item: { id: skillId, title, description, defaultDuration: nextDuration, skillWebsites: nextWebsites } });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const idx = bucket.skills.findIndex((s) => s.id === req.params.skillId);
    if (idx === -1) return res.status(404).json({ error: "Skill not found" });
    if (bucket.skills[idx].addedBy === "admin") return res.status(403).json({ error: "Cannot edit admin-allocated skills" });
    const nextDuration = normalizeDurationMinutes(req.body?.defaultDuration, bucket.skills[idx].defaultDuration || 30);
    const nextWebsites = normalizeSkillWebsites(req.body?.skillWebsites);
    bucket.skills[idx] = {
      ...bucket.skills[idx],
      title: String(req.body?.title || "").trim(),
      description: String(req.body?.description || "").trim(),
      defaultDuration: nextDuration,
      skillWebsites: nextWebsites,
      updatedAt: new Date().toISOString(),
    };
    writeLocalStudentDb(db);
    res.json({ item: normalizeSkillItem(bucket.skills[idx]), source: "local-fallback" });
  }
};

// Delete personal skill
export const deleteStudentSkill = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { skillId } = req.params;

    const skillDoc = await firestore.collection("user_skills").doc(skillId).get();
    if (!skillDoc.exists || skillDoc.data().user_id !== userId) {
      return res.status(403).json({ error: "Cannot delete this skill" });
    }

    // Prevent deleting admin-allocated skills
    if (skillDoc.data().addedBy === "admin") {
      return res.status(403).json({ error: "Cannot delete admin-allocated skills" });
    }

    await firestore.collection("user_skills").doc(skillId).delete();
    res.json({ message: "Skill deleted" });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const existing = bucket.skills.find((s) => s.id === req.params.skillId);
    if (!existing) return res.status(404).json({ error: "Skill not found" });
    if (existing.addedBy === "admin") return res.status(403).json({ error: "Cannot delete admin-allocated skills" });
    bucket.skills = bucket.skills.filter((s) => s.id !== req.params.skillId);
    writeLocalStudentDb(db);
    res.json({ message: "Skill deleted", source: "local-fallback" });
  }
};

// Get student's allocated courses with progress
export const getStudentCourses = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Get student's course allocations
    const allocationsSnapshot = await firestore
      .collection("user_courses")
      .where("user_id", "==", userId)
      .get();

    const allocatedCourses = [];
    const registeredCourses = [];
    for (const doc of allocationsSnapshot.docs) {
      const allocationData = doc.data();
      const courseDoc = await firestore.collection("courses").doc(allocationData.course_id).get();
      
      if (courseDoc.exists) {
        const courseData = courseDoc.data();
        const courseItem = {
          id: doc.id,
          ...courseData,
          allocationId: doc.id,
          status: allocationData.status || "active",
          startDate: allocationData.startDate,
          endDate: allocationData.endDate,
          source: allocationData.source || "admin",
        };

        if (String(courseItem.source || "admin").toLowerCase() === "student" || String(courseItem.status || "").toLowerCase() === "registered") {
          registeredCourses.push(courseItem);
        } else {
          allocatedCourses.push(courseItem);
        }
      }
    }

    res.json({ items: [...allocatedCourses, ...registeredCourses], allocatedCourses, registeredCourses });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const allocatedCourses = Array.isArray(bucket.courses) ? bucket.courses : [];
    const registeredCourses = [];
    res.json({ items: [...allocatedCourses, ...registeredCourses], allocatedCourses, registeredCourses, source: "local-fallback" });
  }
};

// Get student's assignments
export const getStudentAssignments = async (req, res) => {
  try {
    const userId = req.user.uid;
    
    // Get all assignments and filter for this student
    const [assignmentsSnapshot, submissionsSnapshot] = await Promise.all([
      firestore.collection("assignments").get(),
      firestore.collection("assignment_submissions").where("userId", "==", userId).get(),
    ]);
    
    const items = [];
    const userCoursesSnapshot = await firestore
      .collection("user_courses")
      .where("user_id", "==", userId)
      .get();

    const studentCourseIds = new Set();
    userCoursesSnapshot.forEach((doc) => {
      studentCourseIds.add(doc.data().course_id);
    });

    const submissionByAssessment = new Map();
    submissionsSnapshot.forEach((doc) => {
      const data = doc.data() || {};
      if (data.assignmentId) submissionByAssessment.set(data.assignmentId, { id: doc.id, ...data });
    });

    assignmentsSnapshot.forEach((doc) => {
      const assignmentData = doc.data();
      const isForAllStudents = assignmentData.assignTo === "all";
      const isForThisStudent = (assignmentData.userIds || assignmentData.assignedUsers || []).includes(userId);
      const isCourseAssignment = studentCourseIds.has(assignmentData.courseId);

      if ((isForAllStudents || isForThisStudent) && isCourseAssignment) {
        const attempt = submissionByAssessment.get(doc.id);
        items.push({
          id: doc.id,
          ...assignmentData,
          courseName: assignmentData.courseName || "General",
          status: attempt ? "completed" : "pending",
          score: attempt?.marks ?? null,
          totalMarks: attempt?.totalMarks ?? assignmentData.totalMarks ?? null,
          attemptedAt: attempt?.submittedAt || null,
        });
      }
    });

    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const items = (bucket.assignments || []).map((a) => ({
      ...a,
      status: a.status || "pending",
      score: a.score ?? null,
      attemptedAt: a.attemptedAt || null,
    }));
    res.json({ items, source: "local-fallback" });
  }
};

// Mark assignment as complete
export const markAssignmentComplete = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    assignmentId: req.params.assignmentId,
    userId: req.user.uid,
    submittedAt: new Date().toISOString(),
  };
  return submitAssignment(req, res);
};

// Submit assessment attempt with optional answers/code payload
export const submitAssessmentAttempt = async (req, res) => {
  req.body = {
    ...(req.body || {}),
    assignmentId: req.params.assessmentId || req.body?.assessmentId,
    userId: req.user.uid,
    submittedAt: new Date().toISOString(),
  };
  return submitAssignment(req, res);
};

// Student result history
export const getStudentAssessmentResults = async (req, res) => {
  const userId = req.user.uid;
  try {
    const snap = await firestore.collection("assignment_submissions").where("userId", "==", userId).get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    return res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, userId, req.user.email || "");
    const items = (bucket.assignments || [])
      .filter((a) => a.userId === userId || !a.userId)
      .map((a) => ({
        id: a.id,
        assignmentId: a.id,
        userId,
        marks: a.score ?? 0,
        totalMarks: a.totalMarks ?? 0,
        status: a.status || "pending",
        submittedAt: a.attemptedAt || a.updatedAt || a.createdAt || "",
      }))
      .sort((a, b) => new Date(b.submittedAt || 0) - new Date(a.submittedAt || 0));
    return res.json({ items, source: "local-fallback" });
  }
};

// Get student's attendance records (view-only)
export const getStudentAttendance = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { courseId } = req.query;

    let query = firestore.collection("attendance").where("user_id", "==", userId);

    if (courseId) {
      query = query.where("course_id", "==", courseId);
    }

    const attendanceSnapshot = await query.get();
    const items = [];

    attendanceSnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });

    // Sort by date descending
    items.sort((a, b) => new Date(b.date) - new Date(a.date));

    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const items = (bucket.attendance || []).slice().sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ items, source: "local-fallback" });
  }
};

// Get student's attendance for admin-allocated courses only (view-only)
export const getStudentAllocatedAttendance = async (req, res) => {
  try {
    const userId = req.user.uid;

    const [userCoursesSnap, attendanceSnap, coursesSnap] = await Promise.all([
      firestore.collection("user_courses").where("user_id", "==", userId).get(),
      firestore.collection("attendance").where("user_id", "==", userId).get(),
      firestore.collection("courses").get(),
    ]);

    const allocatedCourseIds = new Set();
    userCoursesSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const source = String(data.source || "admin").toLowerCase();
      const status = String(data.status || "active").toLowerCase();
      if (data.course_id && source !== "student" && status !== "registered") {
        allocatedCourseIds.add(data.course_id);
      }
    });

    const coursesById = {};
    coursesSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      coursesById[docSnap.id] = data.title || data.course_name || "Untitled Course";
    });

    // Prevent duplicates: one row per (course_id, date), prioritizing present over absent.
    const deduped = new Map();
    attendanceSnap.forEach((docSnap) => {
      const row = { id: docSnap.id, ...(docSnap.data() || {}) };
      if (!row.course_id || !allocatedCourseIds.has(row.course_id)) return;
      const dateKey = String(row.date || "");
      const key = `${row.course_id}__${dateKey}`;
      const statusNorm = String(row.status || "absent").toLowerCase();
      const existing = deduped.get(key);
      if (!existing) {
        deduped.set(key, row);
        return;
      }
      const existingNorm = String(existing.status || "absent").toLowerCase();
      if (existingNorm !== "present" && statusNorm === "present") {
        deduped.set(key, row);
      }
    });

    const items = Array.from(deduped.values()).map((row) => ({
      id: row.id,
      courseId: row.course_id,
      courseName: coursesById[row.course_id] || row.course_id,
      date: row.date,
      status: String(row.status || "absent").toLowerCase() === "present" ? "present" : "absent",
    }));

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const allocatedCourseIds = new Set(
      (bucket.courses || [])
        .filter((c) => String(c.source || "admin").toLowerCase() !== "student")
        .map((c) => c.course_id || c.id)
        .filter(Boolean)
    );

    const dedup = new Map();
    (bucket.attendance || []).forEach((row) => {
      const courseId = row.course_id || row.courseId;
      if (!courseId || !allocatedCourseIds.has(courseId)) return;
      const date = row.date || "";
      if (!date) return;
      const key = `${courseId}__${date}`;
      const status = String(row.status || "absent").toLowerCase() === "present" ? "present" : "absent";
      const existing = dedup.get(key);
      if (!existing || (existing.status !== "present" && status === "present")) {
        dedup.set(key, {
          id: row.id || attendanceDocId(req.user.uid, courseId, date),
          courseId,
          courseName: courseId,
          date,
          status,
        });
      }
    });

    const items = Array.from(dedup.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ items, source: "local-fallback" });
  }
};

// Get student's attendance for self-registered skills only (view-only)
export const getStudentMySkillsAttendance = async (req, res) => {
  try {
    const userId = req.user.uid;

    const [skillsSnap, attendanceDailySnap] = await Promise.all([
      firestore.collection("users").doc(userId).collection("skills").get(),
      firestore.collection("users").doc(userId).collection("attendance").get(),
    ]);

    const skillsByName = new Map();
    skillsSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const name = String(data.skillName || "").trim();
      if (!name) return;
      skillsByName.set(name.toLowerCase(), { id: docSnap.id, name });
    });

    const deduped = new Map();
    attendanceDailySnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const date = data.date || docSnap.id;
      const done = Array.isArray(data.completedSkills) ? data.completedSkills : [];
      const missed = Array.isArray(data.incompleteSkills) ? data.incompleteSkills : [];

      done.forEach((skillName) => {
        const normalized = String(skillName || "").trim().toLowerCase();
        if (!normalized) return;
        const skillMeta = skillsByName.get(normalized);
        if (!skillMeta) return;
        const key = `${skillMeta.id}__${date}`;
        deduped.set(key, {
          id: key,
          skillId: skillMeta.id,
          skillName: skillMeta.name,
          date,
          status: "present",
        });
      });

      missed.forEach((skillName) => {
        const normalized = String(skillName || "").trim().toLowerCase();
        if (!normalized) return;
        const skillMeta = skillsByName.get(normalized);
        if (!skillMeta) return;
        const key = `${skillMeta.id}__${date}`;
        // Do not overwrite a present row for the same skill/date.
        if (!deduped.has(key)) {
          deduped.set(key, {
            id: key,
            skillId: skillMeta.id,
            skillName: skillMeta.name,
            date,
            status: "absent",
          });
        }
      });
    });

    const items = Array.from(deduped.values());
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    res.json({ items: bucket.attendance || [], source: "local-fallback" });
  }
};

export const getStudentCommunicationTasks = async (req, res) => {
  try {
    const userId = req.user.uid;
    const skillIdFilter = String(req.query?.skillId || "").trim();

    const allocationsSnap = await firestore.collection("user_courses").where("user_id", "==", userId).get();
    const allocatedIds = Array.from(
      new Set(
        allocationsSnap.docs
          .map((docSnap) => String((docSnap.data() || {}).course_id || ""))
          .filter(Boolean)
          .filter((courseId) => (skillIdFilter ? courseId === skillIdFilter : true))
      )
    );

    if (!allocatedIds.length) {
      return res.json({ items: [], skills: [] });
    }

    const courseDocs = await Promise.all(allocatedIds.map((id) => firestore.collection("courses").doc(id).get()));
    const communicationCourses = courseDocs
      .filter((docSnap) => docSnap.exists)
      .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
      .filter((course) => normalizeSkillCategory(course) === "communication");

    if (!communicationCourses.length) {
      return res.json({ items: [], skills: [] });
    }

    const tasksPerSkill = await Promise.all(
      communicationCourses.map(async (course) => {
        const tasksSnap = await firestore.collection(COMMUNICATION_TASKS).where("skillId", "==", course.id).get();
        return {
          skillId: course.id,
          title: course.title || course.course_name || "Communication Skill",
          tasks: tasksSnap.docs
            .map((d) => ({ id: d.id, ...(d.data() || {}) }))
            .sort((a, b) => Number(a.dayNumber || 0) - Number(b.dayNumber || 0)),
        };
      })
    );

    const submissionSnap = await firestore.collection(STUDENT_SUBMISSIONS).where("studentId", "==", userId).get();
    const submissionByTask = new Map(
      submissionSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .map((row) => [String(row.taskId || ""), row])
    );

    const skills = tasksPerSkill
      .map((group) => ({
        ...group,
        tasks: (group.tasks || []).map((task) => ({
          ...task,
          submission: submissionByTask.get(String(task.id || "")) || null,
        })),
      }))
      .filter((group) => group.tasks.length > 0);

    const items = skills.flatMap((group) =>
      group.tasks.map((task) => ({
        skillId: group.skillId,
        skillTitle: group.title,
        ...task,
      }))
    );

    return res.json({ items, skills });
  } catch (err) {
    const userId = req.user.uid;
    const skillIdFilter = String(req.query?.skillId || "").trim();
    const studentDb = readLocalStudentDb();
    const adminDb = readLocalAdminDb();
    const bucket = getLocalStudentBucket(studentDb, userId, req.user.email || "");
    const allocatedIds = new Set(
      (bucket.courses || [])
        .map((course) => String(course.course_id || course.id || ""))
        .filter(Boolean)
        .filter((courseId) => (skillIdFilter ? courseId === skillIdFilter : true))
    );

    const skills = (adminDb.courses || [])
      .filter((course) => allocatedIds.has(String(course.id || "")))
      .filter((course) => normalizeSkillCategory(course) === "communication")
      .map((course) => {
        const tasks = (adminDb.communicationTasks || [])
          .filter((task) => String(task.skillId || task.courseId || "") === String(course.id || ""))
          .sort((a, b) => Number(a.dayNumber || 0) - Number(b.dayNumber || 0))
          .map((task) => {
            const submission = (adminDb.studentSubmissions || []).find(
              (row) => String(row.studentId || row.userId || "") === userId && String(row.taskId || "") === String(task.id || "")
            );
            return { ...task, submission: submission || null };
          });
        return {
          skillId: String(course.id || ""),
          title: course.title || course.course_name || "Communication Skill",
          tasks,
        };
      })
      .filter((group) => group.tasks.length > 0);

    const items = skills.flatMap((group) =>
      group.tasks.map((task) => ({
        skillId: group.skillId,
        skillTitle: group.title,
        ...task,
      }))
    );

    writeLocalStudentDb(studentDb);
    return res.json({ items, skills, source: "local-fallback" });
  }
};

export const submitStudentCommunicationResponse = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { skillId = "", taskId = "", response = "", responseUrl = "" } = req.body || {};
    if (!String(skillId).trim() || !String(taskId).trim()) {
      return res.status(400).json({ ok: false, error: "skillId and taskId are required" });
    }
    if (!String(response).trim() && !String(responseUrl).trim()) {
      return res.status(400).json({ ok: false, error: "response or responseUrl is required" });
    }

    const allocationSnap = await firestore
      .collection("user_courses")
      .where("user_id", "==", userId)
      .where("course_id", "==", String(skillId).trim())
      .limit(1)
      .get();
    if (allocationSnap.empty) {
      return res.status(403).json({ ok: false, error: "Skill not allocated to this student" });
    }

    const taskSnap = await firestore.collection(COMMUNICATION_TASKS).doc(String(taskId).trim()).get();
    if (!taskSnap.exists) return res.status(404).json({ ok: false, error: "Task not found" });
    const task = taskSnap.data() || {};
    if (String(task.skillId || "") !== String(skillId).trim()) {
      return res.status(400).json({ ok: false, error: "Task does not belong to this skill" });
    }

    const submissionId = `${userId}_${String(taskId).trim()}`;
    const now = new Date().toISOString();
    const payload = {
      submissionId,
      studentId: userId,
      skillId: String(skillId).trim(),
      taskId: String(taskId).trim(),
      response: String(response || "").trim(),
      responseUrl: String(responseUrl || "").trim(),
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    };
    await firestore.collection(STUDENT_SUBMISSIONS).doc(submissionId).set(payload, { merge: true });

    await firestore.collection(ATTENDANCE).doc(attendanceDocId(userId, String(skillId).trim(), todayDateKey())).set(
      {
        user_id: userId,
        course_id: String(skillId).trim(),
        date: todayDateKey(),
        status: "present",
        source: "communication-practice",
        markedAt: now,
      },
      { merge: true }
    );

    return res.status(201).json({ ok: true, item: payload });
  } catch (err) {
    const userId = req.user.uid;
    const { skillId = "", taskId = "", response = "", responseUrl = "" } = req.body || {};
    if (!String(skillId).trim() || !String(taskId).trim()) {
      return res.status(400).json({ ok: false, error: "skillId and taskId are required" });
    }
    if (!String(response).trim() && !String(responseUrl).trim()) {
      return res.status(400).json({ ok: false, error: "response or responseUrl is required" });
    }

    const studentDb = readLocalStudentDb();
    const adminDb = readLocalAdminDb();
    const bucket = getLocalStudentBucket(studentDb, userId, req.user.email || "");
    const hasAllocation = (bucket.courses || []).some((course) => String(course.course_id || course.id || "") === String(skillId).trim());
    if (!hasAllocation) {
      return res.status(403).json({ ok: false, error: "Skill not allocated to this student" });
    }
    const task = (adminDb.communicationTasks || []).find((row) => String(row.id || "") === String(taskId).trim());
    if (!task) return res.status(404).json({ ok: false, error: "Task not found" });
    if (String(task.skillId || task.courseId || "") !== String(skillId).trim()) {
      return res.status(400).json({ ok: false, error: "Task does not belong to this skill" });
    }

    const submissionId = `${userId}_${String(taskId).trim()}`;
    const now = new Date().toISOString();
    const payload = {
      id: submissionId,
      submissionId,
      studentId: userId,
      skillId: String(skillId).trim(),
      taskId: String(taskId).trim(),
      response: String(response || "").trim(),
      responseUrl: String(responseUrl || "").trim(),
      status: "submitted",
      submittedAt: now,
      updatedAt: now,
    };

    const existingIndex = (adminDb.studentSubmissions || []).findIndex((row) => String(row.id || row.submissionId || "") === submissionId);
    if (existingIndex >= 0) {
      adminDb.studentSubmissions[existingIndex] = {
        ...adminDb.studentSubmissions[existingIndex],
        ...payload,
      };
    } else {
      adminDb.studentSubmissions.push(payload);
    }

    bucket.attendance = Array.isArray(bucket.attendance) ? bucket.attendance : [];
    const attendanceId = attendanceDocId(userId, String(skillId).trim(), todayDateKey());
    const attendanceIndex = bucket.attendance.findIndex((row) => String(row.id || "") === attendanceId);
    const attendancePayload = {
      id: attendanceId,
      user_id: userId,
      course_id: String(skillId).trim(),
      date: todayDateKey(),
      status: "present",
      source: "communication-practice",
      markedAt: now,
    };
    if (attendanceIndex >= 0) bucket.attendance[attendanceIndex] = attendancePayload;
    else bucket.attendance.push(attendancePayload);

    writeLocalAdminDb(adminDb);
    writeLocalStudentDb(studentDb);
    return res.status(201).json({ ok: true, item: payload, source: "local-fallback" });
  }
};

export const getStudentCommunicationSubmissions = async (req, res) => {
  try {
    const userId = req.user.uid;
    const skillId = String(req.query?.skillId || "").trim();
    let query = firestore.collection(STUDENT_SUBMISSIONS).where("studentId", "==", userId);
    if (skillId) query = query.where("skillId", "==", skillId);
    const snap = await query.get();
    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a, b) => toEpoch(b.submittedAt || b.updatedAt || b.createdAt) - toEpoch(a.submittedAt || a.updatedAt || a.createdAt));
    return res.json({ items });
  } catch (err) {
    const userId = req.user.uid;
    const skillId = String(req.query?.skillId || "").trim();
    const adminDb = readLocalAdminDb();
    const items = (adminDb.studentSubmissions || [])
      .filter((row) => String(row.studentId || row.userId || "") === userId)
      .filter((row) => (skillId ? String(row.skillId || row.courseId || "") === skillId : true))
      .sort((a, b) => toEpoch(b.submittedAt || b.updatedAt || b.createdAt) - toEpoch(a.submittedAt || a.updatedAt || a.createdAt));
    return res.json({ items, source: "local-fallback" });
  }
};

// Get student's progress
export const getStudentProgress = async (req, res) => {
  try {
    const userId = req.user.uid;
    const { courseId } = req.query;

    let query = firestore.collection("user_progress").where("user_id", "==", userId);

    if (courseId) {
      query = query.where("course_id", "==", courseId);
    }

    const progressSnapshot = await query.get();
    const items = [];

    progressSnapshot.forEach((doc) => {
      const data = doc.data();
      items.push({
        id: doc.id,
        ...data,
        completionPercent: Math.round((data.completedLessons || 0) / (data.totalLessons || 1) * 100),
      });
    });

    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    res.json({ items: bucket.progress || [], source: "local-fallback" });
  }
};

// Get student's resource links from assigned courses
export const getStudentResources = async (req, res) => {
  try {
    const userId = req.user.uid;

    // Get student's course allocations
    const allocationsSnapshot = await firestore
      .collection("user_courses")
      .where("user_id", "==", userId)
      .get();

    const items = [];
    const processedCourses = new Set();

    for (const doc of allocationsSnapshot.docs) {
      const courseId = doc.data().course_id;
      if (processedCourses.has(courseId)) continue;
      processedCourses.add(courseId);

      const courseDoc = await firestore.collection("courses").doc(courseId).get();
      if (!courseDoc.exists) continue;

      const courseData = courseDoc.data();
      const courseName = courseData.title || courseData.course_name;

      // Process resource links
      if (courseData.links && Array.isArray(courseData.links)) {
        courseData.links.forEach((link) => {
          items.push({
            courseName,
            courseId,
            url: link.url,
            type: link.type || "link",
          });
        });
      }
    }

    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    res.json({ items: bucket.resources || [], source: "local-fallback" });
  }
};
