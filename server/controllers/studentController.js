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
    const normalizedEmail = String(fallbackEmail || "").trim().toLowerCase();
    const existingKey = normalizedEmail
      ? Object.keys(db.users || {}).find((key) => {
          const row = db.users[key] || {};
          const rowEmail = String(row?.profile?.email || "").trim().toLowerCase();
          return Boolean(rowEmail) && rowEmail === normalizedEmail;
        })
      : "";

    if (existingKey) {
      db.users[userId] = {
        ...(db.users[existingKey] || {}),
        profile: {
          ...(db.users[existingKey]?.profile || {}),
          id: userId,
          email: db.users[existingKey]?.profile?.email || fallbackEmail,
          role: "student",
        },
      };
      if (existingKey !== userId) {
        delete db.users[existingKey];
      }
    }
  }

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

  if (!Array.isArray(db.users[userId].skills)) db.users[userId].skills = [];
  if (!Array.isArray(db.users[userId].courses)) db.users[userId].courses = [];
  if (!Array.isArray(db.users[userId].assignments)) db.users[userId].assignments = [];
  if (!Array.isArray(db.users[userId].attendance)) db.users[userId].attendance = [];
  if (!Array.isArray(db.users[userId].progress)) db.users[userId].progress = [];
  if (!Array.isArray(db.users[userId].resources)) db.users[userId].resources = [];

  return db.users[userId];
};

const toDateKey = (value) => {
  if (!value) return "";
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const normalizeDateFilter = (value) => {
  const key = toDateKey(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(key) ? key : "";
};

const ATTENDANCE_RESPONSE_CACHE = new Map();
const ATTENDANCE_CACHE_TTL_MS = 20 * 1000;

const normalizeAttendanceLimit = (value, fallback = 120, max = 365) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.round(n)));
};

const buildAttendanceCacheKey = (scope, userId, { dateFilter = "", courseId = "", limit = 0 } = {}) =>
  `${scope}::${userId}::${dateFilter || "all"}::${courseId || "all"}::${limit > 0 ? limit : "all"}`;

const attendanceCacheGet = (key) => {
  const hit = ATTENDANCE_RESPONSE_CACHE.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    ATTENDANCE_RESPONSE_CACHE.delete(key);
    return null;
  }
  return hit.value;
};

const attendanceCacheSet = (key, value) => {
  ATTENDANCE_RESPONSE_CACHE.set(key, {
    value,
    expiresAt: Date.now() + ATTENDANCE_CACHE_TTL_MS,
  });
};

const loadCourseTitlesByIds = async (courseIds = []) => {
  const ids = Array.from(new Set((courseIds || []).filter(Boolean)));
  if (!ids.length) return {};

  const docs = await Promise.all(ids.map((id) => firestore.collection("courses").doc(id).get()));
  const coursesById = {};
  docs.forEach((docSnap) => {
    if (!docSnap.exists) return;
    const data = docSnap.data() || {};
    coursesById[docSnap.id] = data.title || data.course_name || "Untitled Course";
  });
  return coursesById;
};

const resolveCourseTitle = (course = {}, fallback = "Allocated Course") => {
  const candidates = [course?.title, course?.course_name, course?.courseTitle, course?.name]
    .map((value) => String(value || "").trim())
    .filter(Boolean);
  return candidates[0] || fallback;
};

const attendanceSummary = (rows = []) => {
  const total = rows.length;
  const present = rows.filter((row) => String(row.status || "").toLowerCase() === "present").length;
  const absent = Math.max(total - present, 0);
  const percent = total ? Math.round((present / total) * 10000) / 100 : 0;
  return { total, present, absent, percent };
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

const normalizeSkillTitleKey = (value = "") => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

const hasAllocatedCourseTitleDuplicate = async (userId, titleKey = "") => {
  if (!titleKey) return false;
  const allocationsSnap = await firestore.collection("user_courses").where("user_id", "==", userId).get();
  if (allocationsSnap.empty) return false;

  const uniqueCourseIds = Array.from(
    new Set(
      allocationsSnap.docs
        .map((docSnap) => String(docSnap.data()?.course_id || "").trim())
        .filter(Boolean)
    )
  );

  if (!uniqueCourseIds.length) return false;

  const courseDocs = await Promise.all(
    uniqueCourseIds.map(async (courseId) => {
      const courseDoc = await firestore.collection("courses").doc(courseId).get();
      return courseDoc.exists ? courseDoc.data() || {} : null;
    })
  );

  return courseDocs.some((course) => {
    const key = normalizeSkillTitleKey(course?.title || course?.course_name || "");
    return key && key === titleKey;
  });
};

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

    const dedup = new Map();
    skillsSnapshots.forEach((doc) => {
      const item = normalizeSkillItem({ id: doc.id, ...doc.data() });
      const key = normalizeSkillTitleKey(item.title || item.skillName || item.name);
      if (!key) return;
      const existing = dedup.get(key);
      if (!existing) {
        dedup.set(key, item);
        return;
      }
      if (toEpoch(item.updatedAt || item.createdAt) > toEpoch(existing.updatedAt || existing.createdAt)) {
        dedup.set(key, item);
      }
    });

    const items = Array.from(dedup.values());

    res.json({ items });
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    writeLocalStudentDb(db);
    const dedup = new Map();
    (bucket.skills || []).forEach((raw) => {
      const item = normalizeSkillItem(raw);
      const key = normalizeSkillTitleKey(item.title || item.skillName || item.name);
      if (!key) return;
      const existing = dedup.get(key);
      if (!existing || toEpoch(item.updatedAt || item.createdAt) > toEpoch(existing.updatedAt || existing.createdAt)) {
        dedup.set(key, item);
      }
    });
    res.json({ items: Array.from(dedup.values()), source: "local-fallback" });
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
    const titleKey = normalizeSkillTitleKey(title);

    const existingSnap = await firestore.collection("user_skills").where("user_id", "==", userId).get();
    const duplicate = existingSnap.docs.find((docSnap) => {
      const data = docSnap.data() || {};
      const key = normalizeSkillTitleKey(data.title || data.skillName || data.name);
      return key && key === titleKey;
    });
    if (duplicate) {
      return res.status(409).json({ error: "Duplicate skill is not allowed" });
    }

    const allocatedDuplicate = await hasAllocatedCourseTitleDuplicate(userId, titleKey);
    if (allocatedDuplicate) {
      return res.status(409).json({ error: "Duplicate skill is not allowed" });
    }

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
    const titleKey = normalizeSkillTitleKey(req.body?.title);
    const duplicate = (bucket.skills || []).some((item) => {
      const key = normalizeSkillTitleKey(item.title || item.skillName || item.name);
      return key && key === titleKey;
    });
    if (duplicate) {
      return res.status(409).json({ error: "Duplicate skill is not allowed" });
    }
    const allocatedDuplicate = (bucket.courses || []).some((course) => {
      const key = normalizeSkillTitleKey(course?.title || course?.course_name || "");
      return key && key === titleKey;
    });
    if (allocatedDuplicate) {
      return res.status(409).json({ error: "Duplicate skill is not allowed" });
    }
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
    const titleKey = normalizeSkillTitleKey(title);

    const skillDoc = await firestore.collection("user_skills").doc(skillId).get();
    if (!skillDoc.exists || skillDoc.data().user_id !== userId) {
      return res.status(403).json({ error: "Cannot update this skill" });
    }

    // Prevent editing admin-allocated skills
    if (skillDoc.data().addedBy === "admin") {
      return res.status(403).json({ error: "Cannot edit admin-allocated skills" });
    }

    const existingSnap = await firestore.collection("user_skills").where("user_id", "==", userId).get();
    const duplicate = existingSnap.docs.find((docSnap) => {
      if (docSnap.id === skillId) return false;
      const data = docSnap.data() || {};
      const key = normalizeSkillTitleKey(data.title || data.skillName || data.name);
      return key && key === titleKey;
    });
    if (duplicate) {
      return res.status(409).json({ error: "Duplicate skill is not allowed" });
    }

    const allocatedDuplicate = await hasAllocatedCourseTitleDuplicate(userId, titleKey);
    if (allocatedDuplicate) {
      return res.status(409).json({ error: "Duplicate skill is not allowed" });
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
    const titleKey = normalizeSkillTitleKey(req.body?.title);
    const duplicate = (bucket.skills || []).some((item, index) => {
      if (index === idx) return false;
      const key = normalizeSkillTitleKey(item.title || item.skillName || item.name);
      return key && key === titleKey;
    });
    if (duplicate) return res.status(409).json({ error: "Duplicate skill is not allowed" });
    const allocatedDuplicate = (bucket.courses || []).some((course) => {
      const key = normalizeSkillTitleKey(course?.title || course?.course_name || "");
      return key && key === titleKey;
    });
    if (allocatedDuplicate) return res.status(409).json({ error: "Duplicate skill is not allowed" });
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

    const allocations = allocationsSnapshot.docs.map((docSnap) => ({
      allocationId: docSnap.id,
      ...(docSnap.data() || {}),
    }));

    const uniqueCourseIds = Array.from(
      new Set(
        allocations
          .map((allocation) => String(allocation.course_id || "").trim())
          .filter(Boolean)
      )
    );

    const courseDocEntries = await Promise.all(
      uniqueCourseIds.map(async (courseId) => {
        const docSnap = await firestore.collection("courses").doc(courseId).get();
        return [courseId, docSnap.exists ? docSnap.data() : null];
      })
    );
    const courseById = new Map(courseDocEntries);

    const allocatedCourses = [];
    const registeredCourses = [];
    for (const allocationData of allocations) {
      const courseId = String(allocationData.course_id || "").trim();
      if (!courseId) continue;
      const courseData = courseById.get(courseId);
      if (courseData) {
        const courseItem = {
          id: allocationData.allocationId,
          ...courseData,
          allocationId: allocationData.allocationId,
          title: resolveCourseTitle(courseData, "Allocated Course"),
          courseTitle: resolveCourseTitle(courseData, "Allocated Course"),
          course_name: String(courseData?.course_name || courseData?.title || "").trim(),
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
    const adminDb = readLocalAdminDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const courseById = new Map((adminDb.courses || []).map((course) => [String(course.id || ""), course]));
    const mergedCourses = (Array.isArray(bucket.courses) ? bucket.courses : []).map((course, index) => {
      const courseId = String(course.course_id || course.id || "").trim();
      const catalog = courseById.get(courseId) || {};
      return {
        id: String(course.id || `${req.user.uid}_${courseId || index}`),
        ...catalog,
        ...course,
        course_id: courseId || String(catalog.id || ""),
        title: resolveCourseTitle({ ...catalog, ...course }, courseId ? "Allocated Course" : "Allocated Course"),
        courseTitle: resolveCourseTitle({ ...catalog, ...course }, courseId ? "Allocated Course" : "Allocated Course"),
        course_name: String(catalog.course_name || course.course_name || catalog.title || course.title || "").trim(),
        allocationId: String(course.allocationId || course.id || `${req.user.uid}_${courseId || index}`),
        status: String(course.status || "assigned").toLowerCase() === "assigned" ? "active" : String(course.status || "active"),
        startDate: course.startDate || "",
        endDate: course.endDate || "",
        source: course.source || "admin",
      };
    });

    const allocatedCourses = mergedCourses.filter(
      (course) =>
        String(course.source || "admin").toLowerCase() !== "student" &&
        String(course.status || "").toLowerCase() !== "registered"
    );
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
    const dateFilter = normalizeDateFilter(req.query?.date);
    const hasLimitParam = req.query?.limit !== undefined;
    const limit = hasLimitParam ? normalizeAttendanceLimit(req.query?.limit, 120) : 0;
    const cacheKey = buildAttendanceCacheKey("student-attendance", userId, { dateFilter, courseId, limit });
    const cached = attendanceCacheGet(cacheKey);
    if (cached) return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });

    let query = firestore.collection("attendance").where("user_id", "==", userId);

    if (courseId) {
      query = query.where("course_id", "==", courseId);
    }

    if (dateFilter) {
      query = query.where("date", "==", dateFilter);
    }

    const attendanceSnapshot = await query.get();
    const items = [];

    attendanceSnapshot.forEach((doc) => {
      items.push({ id: doc.id, ...doc.data() });
    });

    // Sort by date descending
    items.sort((a, b) => new Date(b.date) - new Date(a.date));
    const responseItems = !dateFilter && hasLimitParam ? items.slice(0, limit) : items;

    const payload = {
      items: responseItems,
      dateFilter: dateFilter || null,
    };
    attendanceCacheSet(cacheKey, payload);

    res.json(payload);
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const dateFilter = normalizeDateFilter(req.query?.date);
    const hasLimitParam = req.query?.limit !== undefined;
    const limit = hasLimitParam ? normalizeAttendanceLimit(req.query?.limit, 120) : 0;
    const courseIdFilter = String(req.query?.courseId || "").trim();
    const rows = (bucket.attendance || [])
      .filter((row) => {
        if (courseIdFilter && String(row.course_id || row.courseId || "") !== courseIdFilter) return false;
        const dateKey = toDateKey(row.date || "");
        if (dateFilter && dateKey !== dateFilter) return false;
        return true;
      })
      .slice()
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const items = !dateFilter && hasLimitParam ? rows.slice(0, limit) : rows;
    res.json({ items, source: "local-fallback", dateFilter: dateFilter || null });
  }
};

// Get student's attendance for admin-allocated courses only (view-only)
export const getStudentAllocatedAttendance = async (req, res) => {
  try {
    const userId = req.user.uid;
    const dateFilter = normalizeDateFilter(req.query?.date);
    const hasLimitParam = req.query?.limit !== undefined;
    const limit = hasLimitParam ? normalizeAttendanceLimit(req.query?.limit, 120) : 0;
    const cacheKey = buildAttendanceCacheKey("student-allocated-attendance", userId, { dateFilter, limit });
    const cached = attendanceCacheGet(cacheKey);
    if (cached) return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });

    let attendanceQuery = firestore.collection("attendance").where("user_id", "==", userId);
    if (dateFilter) {
      attendanceQuery = attendanceQuery.where("date", "==", dateFilter);
    }

    const [userCoursesSnap, attendanceSnap] = await Promise.all([
      firestore.collection("user_courses").where("user_id", "==", userId).get(),
      attendanceQuery.get(),
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

    if (!allocatedCourseIds.size) {
      const payload = { items: [], dateFilter: dateFilter || null, summary: attendanceSummary([]) };
      attendanceCacheSet(cacheKey, payload);
      return res.json(payload);
    }

    const coursesById = await loadCourseTitlesByIds(Array.from(allocatedCourseIds));

    // Prevent duplicates: one row per (course_id, date), prioritizing present over absent.
    const deduped = new Map();
    attendanceSnap.forEach((docSnap) => {
      const row = { id: docSnap.id, ...(docSnap.data() || {}) };
      if (!row.course_id || !allocatedCourseIds.has(row.course_id)) return;
      const dateKey = toDateKey(row.date);
      if (!dateKey) return;
      if (dateFilter && dateKey !== dateFilter) return;
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
      date: toDateKey(row.date),
      status: String(row.status || "absent").toLowerCase() === "present" ? "present" : "absent",
    }));

    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const responseItems = !dateFilter && hasLimitParam ? items.slice(0, limit) : items;
    const payload = {
      items: responseItems,
      dateFilter: dateFilter || null,
      summary: attendanceSummary(items),
    };
    attendanceCacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const dateFilter = normalizeDateFilter(req.query?.date);
    const hasLimitParam = req.query?.limit !== undefined;
    const limit = hasLimitParam ? normalizeAttendanceLimit(req.query?.limit, 120) : 0;
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
      const date = toDateKey(row.date || "");
      if (!date) return;
      if (dateFilter && date !== dateFilter) return;
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

    const rows = Array.from(dedup.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const items = !dateFilter && hasLimitParam ? rows.slice(0, limit) : rows;
    res.json({ items, source: "local-fallback", dateFilter: dateFilter || null, summary: attendanceSummary(rows) });
  }
};

// Get student's attendance for self-registered skills only (view-only)
export const getStudentMySkillsAttendance = async (req, res) => {
  try {
    const userId = req.user.uid;
    const dateFilter = normalizeDateFilter(req.query?.date);
    const hasLimitParam = req.query?.limit !== undefined;
    const limit = hasLimitParam ? normalizeAttendanceLimit(req.query?.limit, 120) : 0;
    const cacheKey = buildAttendanceCacheKey("student-myskills-attendance", userId, { dateFilter, limit });
    const cached = attendanceCacheGet(cacheKey);
    if (cached) return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });

    const attendancePromise = dateFilter
      ? firestore.collection("users").doc(userId).collection("attendance").doc(dateFilter).get()
      : firestore
          .collection("users")
          .doc(userId)
          .collection("attendance")
          .orderBy("__name__", "desc")
          .limit(hasLimitParam ? limit : 365)
          .get();

    const flatAttendancePromise = (async () => {
      let flatAttendanceQuery = firestore.collection("attendance").where("user_id", "==", userId);
      if (dateFilter) {
        flatAttendanceQuery = flatAttendanceQuery.where("date", "==", dateFilter);
        return flatAttendanceQuery.get();
      }

      try {
        const rowLimit = hasLimitParam ? limit * 4 : 1500;
        return await flatAttendanceQuery.orderBy("date", "desc").limit(rowLimit).get();
      } catch (queryErr) {
        const errCode = String(queryErr?.code || "").toLowerCase();
        const errText = String(queryErr?.message || "").toLowerCase();
        const maybeMissingIndex =
          errCode.includes("failed-precondition") || errText.includes("index") || errText.includes("order by");
        if (!maybeMissingIndex) throw queryErr;
        return flatAttendanceQuery.get();
      }
    })();

    const [legacySkillsSnap, userSkillsSnap, attendanceDailySource, flatAttendanceSnap] = await Promise.all([
      firestore.collection("users").doc(userId).collection("skills").get(),
      firestore.collection("user_skills").where("user_id", "==", userId).get(),
      attendancePromise,
      flatAttendancePromise,
    ]);

    const attendanceDocs = [];
    if (dateFilter) {
      if (attendanceDailySource?.exists) attendanceDocs.push(attendanceDailySource);
    } else {
      attendanceDailySource.forEach((docSnap) => {
        attendanceDocs.push(docSnap);
      });
    }

    const skillsByName = new Map();
    const skillsById = new Map();
    const registerSkill = (skillId, rawName, createdAtValue = "") => {
      const id = String(skillId || "").trim();
      const name = String(rawName || "").trim();
      if (!id || !name) return;
      const key = name.toLowerCase();
      const createdAt = toDateKey(createdAtValue);
      if (!skillsByName.has(key)) {
        skillsByName.set(key, { id, name });
      }
      if (!skillsById.has(id)) {
        skillsById.set(id, { id, name, createdAt });
        return;
      }
      const existing = skillsById.get(id) || { id, name: "", createdAt: "" };
      skillsById.set(id, {
        id,
        name: existing.name || name,
        createdAt: existing.createdAt || createdAt,
      });
    };

    // Legacy source used by older frontends.
    legacySkillsSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      registerSkill(docSnap.id, data.skillName || data.title || data.name, data.createdAt || data.updatedAt || "");
    });

    // Primary source used by student skill APIs.
    userSkillsSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const addedBy = String(data.addedBy || data.source || "student").toLowerCase();
      if (addedBy === "admin") return;
      registerSkill(docSnap.id, data.title || data.skillName || data.name, data.createdAt || data.updatedAt || "");
    });

    const deduped = new Map();
    const upsertAttendanceRow = ({ skillId, skillName, date, status }) => {
      if (!skillId || !date) return;
      const key = `${skillId}__${date}`;
      const normalizedStatus = String(status || "absent").toLowerCase() === "present" ? "present" : "absent";
      const existing = deduped.get(key);
      if (!existing || (existing.status !== "present" && normalizedStatus === "present")) {
        deduped.set(key, {
          id: key,
          skillId,
          skillName,
          date,
          status: normalizedStatus,
        });
      }
    };

    attendanceDocs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const date = toDateKey(data.date || docSnap.id);
      if (!date) return;
      if (dateFilter && date !== dateFilter) return;
      const done = Array.isArray(data.completedSkills) ? data.completedSkills : [];
      const missed = Array.isArray(data.incompleteSkills) ? data.incompleteSkills : [];

      done.forEach((skillName) => {
        const normalized = String(skillName || "").trim().toLowerCase();
        if (!normalized) return;
        const skillMeta = skillsByName.get(normalized);
        if (!skillMeta) return;
        upsertAttendanceRow({
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
        upsertAttendanceRow({
          skillId: skillMeta.id,
          skillName: skillMeta.name,
          date,
          status: "absent",
        });
      });
    });

    // Also include my-skills attendance rows persisted in the flat attendance collection.
    flatAttendanceSnap.forEach((docSnap) => {
      const row = docSnap.data() || {};
      const date = toDateKey(row.date);
      if (!date) return;
      if (dateFilter && date !== dateFilter) return;
      const skillId = String(row.skillId || row.skill_id || row.courseId || row.course_id || "").trim();
      if (!skillId || !skillsById.has(skillId)) return;
      const skillMeta = skillsById.get(skillId);
      upsertAttendanceRow({
        skillId,
        skillName: skillMeta?.name || skillId,
        date,
        status: row.status,
      });
    });

    const datesToBackfill = new Set();
    if (dateFilter) {
      datesToBackfill.add(dateFilter);
    }
    attendanceDocs.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const date = toDateKey(data.date || docSnap.id);
      if (!date) return;
      if (dateFilter && date !== dateFilter) return;
      datesToBackfill.add(date);
    });
    if (!dateFilter) {
      deduped.forEach((row) => {
        const date = toDateKey(row.date);
        if (date) datesToBackfill.add(date);
      });
    }

    datesToBackfill.forEach((date) => {
      skillsById.forEach((meta, skillId) => {
        if (!skillId) return;
        if (meta?.createdAt && meta.createdAt > date) return;
        const key = `${skillId}__${date}`;
        if (deduped.has(key)) return;
        deduped.set(key, {
          id: key,
          skillId,
          skillName: meta?.name || skillId,
          date,
          status: "absent",
        });
      });
    });

    const items = Array.from(deduped.values());
    items.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const responseItems = !dateFilter && hasLimitParam ? items.slice(0, limit) : items;
    const payload = {
      items: responseItems,
      dateFilter: dateFilter || null,
      summary: attendanceSummary(items),
    };
    attendanceCacheSet(cacheKey, payload);
    res.json(payload);
  } catch (err) {
    const db = readLocalStudentDb();
    const bucket = getLocalStudentBucket(db, req.user.uid, req.user.email || "");
    const dateFilter = normalizeDateFilter(req.query?.date);
    const hasLimitParam = req.query?.limit !== undefined;
    const limit = hasLimitParam ? normalizeAttendanceLimit(req.query?.limit, 120) : 0;
    const skillsById = new Map();
    const skillsByName = new Map();
    (bucket.skills || []).forEach((row) => {
      const addedBy = String(row.addedBy || row.source || "student").toLowerCase();
      if (addedBy === "admin") return;
      const skillId = String(row.id || row.skillId || row.skill_id || "").trim();
      const skillName = String(row.title || row.skillName || row.skill_name || "").trim();
      if (!skillId || !skillName) return;
      skillsById.set(skillId, {
        name: skillName,
        createdAt: toDateKey(row.createdAt || row.updatedAt || ""),
      });
      if (!skillsByName.has(skillName.toLowerCase())) {
        skillsByName.set(skillName.toLowerCase(), { id: skillId, name: skillName });
      }
    });

    const dedup = new Map();
    const upsert = ({ skillId, skillName, date, status }) => {
      if (!skillId || !date) return;
      if (dateFilter && date !== dateFilter) return;
      const key = `${skillId}__${date}`;
      const normalizedStatus = String(status || "absent").toLowerCase() === "present" ? "present" : "absent";
      const existing = dedup.get(key);
      if (!existing || (existing.status !== "present" && normalizedStatus === "present")) {
        dedup.set(key, {
          id: key,
          skillId,
          skillName,
          date,
          status: normalizedStatus,
        });
      }
    };

    (bucket.attendance || []).forEach((row, index) => {
      const date = toDateKey(row.date);
      if (!date) return;

      const directSkillId = String(row.skillId || row.skill_id || row.courseId || row.course_id || "").trim();
      const directSkillName = String(row.skillName || row.skill_name || "").trim();

      if (directSkillId && skillsById.has(directSkillId)) {
        const skillMeta = skillsById.get(directSkillId) || { name: directSkillId };
        upsert({
          skillId: directSkillId,
          skillName: skillMeta.name || directSkillId,
          date,
          status: row.status,
        });
        return;
      }

      if (directSkillName) {
        const skillMeta = skillsByName.get(directSkillName.toLowerCase());
        if (!skillMeta) return;
        upsert({
          skillId: skillMeta.id || `local-skill-${index}`,
          skillName: skillMeta.name,
          date,
          status: row.status,
        });
      }
    });

    const datesToBackfill = new Set();
    if (dateFilter) {
      datesToBackfill.add(dateFilter);
    }
    if (!dateFilter) {
      dedup.forEach((row) => {
        const date = toDateKey(row.date);
        if (date) datesToBackfill.add(date);
      });
    }

    datesToBackfill.forEach((date) => {
      skillsById.forEach((meta, skillId) => {
        if (!skillId) return;
        if (meta?.createdAt && meta.createdAt > date) return;
        const key = `${skillId}__${date}`;
        if (dedup.has(key)) return;
        dedup.set(key, {
          id: key,
          skillId,
          skillName: meta?.name || skillId,
          date,
          status: "absent",
        });
      });
    });

    const rows = Array.from(dedup.values()).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
    const items = !dateFilter && hasLimitParam ? rows.slice(0, limit) : rows;

    res.json({ items, source: "local-fallback", dateFilter: dateFilter || null, summary: attendanceSummary(rows) });
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
