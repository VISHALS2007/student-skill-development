import { firestore } from "../firebaseAdmin.js";
import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { randomUUID } from "crypto";
import vm from "node:vm";

const USERS = "users";
const COURSES = "courses";
const USER_COURSES = "user_courses";
const ATTENDANCE = "attendance";
const QUIZ_RESULTS = "quiz_results";
const NOTIFICATIONS = "notifications";
const ASSIGNMENTS = "assignments";
const ASSIGNMENT_SUBMISSIONS = "assignment_submissions";
const ASSESSMENT_RESULTS = "assessment_results";
const COMMUNICATION_TASKS = "communication_tasks";
const STUDENT_SUBMISSIONS = "student_submissions";

const IS_PRODUCTION = String(process.env.NODE_ENV || "").toLowerCase() === "production";

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@skilldev.com").trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "admin123");
const DEFAULT_SUB_ADMIN_EMAIL = (process.env.SUB_ADMIN_EMAIL || "subadmin@skilldev.com").trim().toLowerCase();
const DEFAULT_SUB_ADMIN_PASSWORD = process.env.SUB_ADMIN_PASSWORD || (IS_PRODUCTION ? "" : "subadmin123");
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || (IS_PRODUCTION ? "" : "skilldev-admin-secret");
const INSTITUTION_EMAIL_DOMAIN = "@bitsathy.ac.in";
const ADMIN_ROLES = new Set(["main_admin", "sub_admin"]);

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCAL_ADMIN_DB_PATH = path.join(__dirname, "..", "data", "local-admin-db.json");
const LOCAL_STUDENT_DB_PATH = path.join(__dirname, "..", "data", "local-student-db.json");

const DASHBOARD_CACHE_TTL_MS = Number(process.env.DASHBOARD_CACHE_TTL_MS || 30000);
const COURSE_LIST_CACHE_TTL_MS = Number(process.env.COURSE_LIST_CACHE_TTL_MS || 60000);
const REPORTS_CACHE_TTL_MS = Number(process.env.REPORTS_CACHE_TTL_MS || 30000);
const RESPONSE_CACHE = new Map();

const cacheGet = (key) => {
  const cached = RESPONSE_CACHE.get(key);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    RESPONSE_CACHE.delete(key);
    return null;
  }
  return cached.value;
};

const cacheSet = (key, value, ttlMs) => {
  RESPONSE_CACHE.set(key, {
    value,
    expiresAt: Date.now() + Math.max(1, Number(ttlMs) || 1),
  });
};

const cacheInvalidateByPrefix = (prefixes = []) => {
  if (!Array.isArray(prefixes) || !prefixes.length) return;
  for (const key of RESPONSE_CACHE.keys()) {
    if (prefixes.some((prefix) => key.startsWith(prefix))) {
      RESPONSE_CACHE.delete(key);
    }
  }
};

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
const normalizeRole = (value = "") => {
  const role = String(value || "").trim().toLowerCase();
  if (role === "admin") return "main_admin";
  return role;
};
const isAdminRole = (value = "") => ADMIN_ROLES.has(normalizeRole(value));
const normalizeSkillCategory = (course = {}) => {
  const base = String(course?.category || "").trim().toLowerCase();
  const custom = String(course?.customCategory || "").trim().toLowerCase();
  const merged = `${base} ${custom}`.trim();
  if (merged.includes("communication")) return "communication";
  if (merged.includes("aptitude")) return "aptitude";
  if (merged.includes("coding") || merged.includes("problem") || merged.includes("learning")) return "coding";
  return "others";
};
const isCommunicationSkill = (course = {}) => normalizeSkillCategory(course) === "communication";
const normalizePracticeType = (value = "") => {
  const key = String(value || "").trim().toLowerCase();
  if (["speaking", "listening", "writing"].includes(key)) return key;
  return "speaking";
};
const toPercentage = (num = 0, den = 0) => {
  if (!den) return 0;
  return Math.max(0, Math.min(100, Math.round((Number(num || 0) / Number(den || 1)) * 100)));
};
const canSubAdminAccessCourse = (course = {}, admin = {}) => {
  const actorRole = normalizeRole(admin?.role || "");
  if (actorRole === "main_admin") return true;
  if (actorRole !== "sub_admin") return false;
  const createdBy = course?.createdBy || {};
  const hasCreatorMeta = Boolean(String(createdBy.id || "").trim() || normalizeEmail(createdBy.email || ""));
  // Backward compatibility: legacy seeded courses may not have creator info.
  if (!hasCreatorMeta) return true;
  const sameId = String(createdBy.id || "") && String(createdBy.id || "") === String(admin?.id || "");
  const sameEmail = normalizeEmail(createdBy.email || "") && normalizeEmail(createdBy.email || "") === normalizeEmail(admin?.email || "");
  return Boolean(sameId || sameEmail);
};
const resolveAdminRedirectByRole = (role = "") =>
  normalizeRole(role) === "sub_admin" ? "/sub-admin" : "/main-admin";
const isInstitutionEmail = (value = "") => normalizeEmail(value).endsWith(INSTITUTION_EMAIL_DOMAIN);
const todayDateKey = () => new Date().toISOString().slice(0, 10);
const normalizeAttendanceStatus = (value) =>
  String(value || "").toLowerCase() === "present" ? "present" : "absent";
const attendanceDocId = (userId, courseId, date) => `${userId}_${courseId}_${date}`;
const DEPARTMENT_BY_CODE = {
  ec: "ECE",
  cs: "CSE",
  it: "IT",
  me: "Mechanical",
  ee: "EEE",
};

const deriveAcademicMetaFromEmail = (email = "") => {
  const normalized = normalizeEmail(email);
  if (!isInstitutionEmail(normalized)) {
    return { departmentCode: "", department: "", batch: "", year: "" };
  }

  const localPart = normalized.split("@")[0] || "";
  const match = localPart.match(/^([a-z]{2})(\d{2})/i);
  if (!match) {
    return { departmentCode: "", department: "", batch: "", year: "" };
  }

  const departmentCode = String(match[1] || "").toLowerCase();
  const batchCode = String(match[2] || "");
  const batchStart = Number(`20${batchCode}`);
  const department = DEPARTMENT_BY_CODE[departmentCode] || departmentCode.toUpperCase();

  if (!Number.isFinite(batchStart)) {
    return { departmentCode, department, batch: "", year: "" };
  }

  return {
    departmentCode,
    department,
    batch: String(batchStart),
    year: `${batchStart}-${batchStart + 4}`,
  };
};

const enrichUserAcademicMeta = (user = {}) => {
  const derived = deriveAcademicMetaFromEmail(user?.email || "");
  return {
    ...user,
    departmentCode: String(user?.departmentCode || derived.departmentCode || ""),
    department: String(user?.department || user?.course || derived.department || ""),
    batch: String(user?.batch || derived.batch || ""),
    year: String(user?.year || derived.year || ""),
  };
};

const toEpoch = (value) => {
  const t = Date.parse(value || "");
  return Number.isNaN(t) ? 0 : t;
};

const dedupeUsersByEmail = (users = []) => {
  const byEmail = new Map();
  const noEmail = [];

  users.forEach((user) => {
    const email = normalizeEmail(user?.email || "");
    if (!email) {
      noEmail.push(user);
      return;
    }

    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, user);
      return;
    }

    const score = (u) =>
      (u?.enabled !== false ? 4 : 0) +
      (String(u?.name || "").trim() ? 2 : 0) +
      (toEpoch(u?.updatedAt || u?.createdAt) > 0 ? 1 : 0);

    const candidate = score(user) > score(existing)
      ? user
      : score(user) < score(existing)
      ? existing
      : toEpoch(user?.updatedAt || user?.createdAt) >= toEpoch(existing?.updatedAt || existing?.createdAt)
      ? user
      : existing;

    byEmail.set(email, candidate);
  });

  return [...byEmail.values(), ...noEmail];
};

const courseDoc = (courseId) => firestore.collection(COURSES).doc(courseId);
const userCourseDoc = (userId, courseId) => firestore.collection(USER_COURSES).doc(`${userId}_${courseId}`);
const assignmentDoc = (assignmentId) => firestore.collection(ASSIGNMENTS).doc(assignmentId);
const parseDateValue = (value) => {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

const toDateKey = (value) => {
  if (!value) return "";
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

const dateKeysBetween = (startKey, endKey) => {
  const start = parseDateValue(startKey);
  const end = parseDateValue(endKey);
  if (!start || !end || start > end) return [];
  const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate()));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()));
  const out = [];
  while (cursor <= last) {
    out.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
};

const normalizeAssessmentType = (value = "") => {
  const t = String(value || "mcq").trim().toLowerCase();
  if (["coding", "mcq", "practice", "short-answer", "communication", "daily-practice"].includes(t)) return t;
  return "mcq";
};

const parseTestCases = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const normalizeAssessmentPayload = (raw = {}) => {
  const testCases = parseTestCases(raw.testCases);
  const questions = Array.isArray(raw.questions) ? raw.questions : [];
  return {
    title: String(raw.title || "").trim(),
    description: String(raw.description || "").trim(),
    openDate: raw.openDate || raw.startDate || null,
    dueDate: raw.dueDate || raw.endDate || null,
    instructions: String(raw.instructions || "").trim(),
    assignTo: String(raw.assignTo || "all").toLowerCase(),
    courseId: raw.courseId || null,
    userIds: Array.isArray(raw.userIds) ? raw.userIds : [],
    assessmentType: normalizeAssessmentType(raw.assessmentType || raw.type),
    timeLimitMinutes: Number(raw.timeLimitMinutes || raw.timeLimit || 0) || 0,
    totalMarks: Number(raw.totalMarks || 0) || 0,
    passingMarks: Number(raw.passingMarks || 0) || 0,
    numberOfQuestions: Number(raw.numberOfQuestions || questions.length || 0) || 0,
    autoEvaluate: raw.autoEvaluate !== false,
    programmingLanguage: String(raw.programmingLanguage || raw.language || "javascript").toLowerCase(),
    problemStatement: String(raw.problemStatement || "").trim(),
    testCases,
    questions,
  };
};

const evaluateMcq = ({ questions = [], answers = [], totalMarks = 0 }) => {
  if (!questions.length) return { score: 0, maxScore: totalMarks || 0, passedCases: 0, totalCases: 0 };
  const each = totalMarks > 0 ? totalMarks / questions.length : 1;
  let correct = 0;
  questions.forEach((q, idx) => {
    const expected = String(q?.correctOption ?? q?.answer ?? "").trim();
    const actual = String(answers[idx] ?? "").trim();
    if (expected && expected === actual) correct += 1;
  });
  const score = Math.round(correct * each);
  return { score, maxScore: totalMarks || questions.length, passedCases: correct, totalCases: questions.length };
};

const evaluateCodingJavaScript = ({ code = "", testCases = [], totalMarks = 0 }) => {
  const safeTestCases = Array.isArray(testCases) ? testCases : [];
  if (!safeTestCases.length) {
    return { score: 0, maxScore: totalMarks || 0, passedCases: 0, totalCases: 0, executionMs: 0, details: [] };
  }

  const wrapped = `${String(code || "")};\nif (typeof solve !== "function") { throw new Error("Please define function solve(input)"); }`;
  const context = vm.createContext({});
  const started = Date.now();
  const script = new vm.Script(wrapped);
  script.runInContext(context, { timeout: 1000 });

  let passed = 0;
  const details = safeTestCases.map((tc, idx) => {
    try {
      const input = tc?.input ?? "";
      const expected = String(tc?.output ?? "").trim();
      const weight = Number(tc?.weight || 0) || 0;
      const actualRaw = context.solve(input);
      const actual = String(actualRaw ?? "").trim();
      const ok = actual === expected;
      if (ok) passed += 1;
      return {
        index: idx + 1,
        input,
        expected,
        actual,
        passed: ok,
        weight,
      };
    } catch (err) {
      return {
        index: idx + 1,
        input: tc?.input ?? "",
        expected: String(tc?.output ?? "").trim(),
        actual: String(err?.message || "runtime-error"),
        passed: false,
        weight: Number(tc?.weight || 0) || 0,
      };
    }
  });

  const weightedTotal = details.reduce((acc, row) => acc + (row.weight > 0 ? row.weight : 0), 0);
  const weightedPassed = details.reduce((acc, row) => acc + (row.passed ? (row.weight > 0 ? row.weight : 0) : 0), 0);
  const ratio = weightedTotal > 0 ? weightedPassed / weightedTotal : passed / safeTestCases.length;
  const score = Math.round((totalMarks || safeTestCases.length) * ratio);
  return {
    score,
    maxScore: totalMarks || safeTestCases.length,
    passedCases: passed,
    totalCases: safeTestCases.length,
    executionMs: Date.now() - started,
    details,
  };
};

const evaluateAssessmentAttempt = ({ assessment = {}, payload = {} }) => {
  const type = normalizeAssessmentType(assessment.assessmentType || assessment.type);
  const totalMarks = Number(assessment.totalMarks || 0) || 0;
  if (type === "coding") {
    if (String(payload.programmingLanguage || assessment.programmingLanguage || "javascript").toLowerCase() !== "javascript") {
      return {
        score: 0,
        maxScore: totalMarks,
        passed: false,
        passedCases: 0,
        totalCases: Array.isArray(assessment.testCases) ? assessment.testCases.length : 0,
        executionMs: 0,
        details: [],
        remark: "Only JavaScript coding evaluation is enabled currently",
      };
    }
    const coding = evaluateCodingJavaScript({
      code: payload.code || "",
      testCases: assessment.testCases || [],
      totalMarks,
    });
    const passingMarks = Number(assessment.passingMarks || 0) || 0;
    return {
      ...coding,
      passed: coding.score >= passingMarks,
      remark: coding.score >= passingMarks ? "pass" : "fail",
    };
  }

  const mcq = evaluateMcq({
    questions: assessment.questions || [],
    answers: Array.isArray(payload.answers) ? payload.answers : [],
    totalMarks,
  });
  const passingMarks = Number(assessment.passingMarks || 0) || 0;
  return {
    ...mcq,
    executionMs: 0,
    details: [],
    passed: mcq.score >= passingMarks,
    remark: mcq.score >= passingMarks ? "pass" : "fail",
  };
};

const markAttendanceOnAttemptFirestore = async ({ userId, courseId = "", dueDate = "" }) => {
  const today = todayDateKey();
  const attendanceStatus = dueDate && today > toDateKey(dueDate) ? "partial" : "present";
  const targetCourseIds = [];
  if (courseId) {
    targetCourseIds.push(courseId);
  } else {
    const allocSnap = await firestore.collection(USER_COURSES).where("user_id", "==", userId).get();
    allocSnap.forEach((d) => {
      const row = d.data() || {};
      if (row.course_id) targetCourseIds.push(row.course_id);
    });
  }

  for (const cid of [...new Set(targetCourseIds)]) {
    const key = attendanceDocId(userId, cid, today);
    await firestore.collection(ATTENDANCE).doc(key).set(
      {
        user_id: userId,
        course_id: cid,
        date: today,
        status: attendanceStatus,
        markedAt: nowIso(),
        source: "assessment-attempt",
      },
      { merge: true }
    );
  }
  return attendanceStatus;
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
      assessments: Array.isArray(parsed.assessments) ? parsed.assessments : [],
      submissions: Array.isArray(parsed.submissions) ? parsed.submissions : [],
      assessmentResults: Array.isArray(parsed.assessmentResults) ? parsed.assessmentResults : [],
      communicationTasks: Array.isArray(parsed.communicationTasks) ? parsed.communicationTasks : [],
      studentSubmissions: Array.isArray(parsed.studentSubmissions) ? parsed.studentSubmissions : [],
    };
  } catch {
    return { courses: [], assessments: [], submissions: [], assessmentResults: [], communicationTasks: [], studentSubmissions: [] };
  }
};

const writeLocalAdminDb = (db) => {
  ensureLocalAdminDb();
  fs.writeFileSync(LOCAL_ADMIN_DB_PATH, JSON.stringify(db, null, 2));
};

const readLocalStudentDb = () => {
  try {
    if (!fs.existsSync(LOCAL_STUDENT_DB_PATH)) return { users: {} };
    const raw = fs.readFileSync(LOCAL_STUDENT_DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    return { users: parsed?.users || {} };
  } catch {
    return { users: {} };
  }
};

const writeLocalStudentDb = (db) => {
  const dir = path.dirname(LOCAL_STUDENT_DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(LOCAL_STUDENT_DB_PATH, JSON.stringify(db, null, 2));
};

const getLocalStudentBucket = (db, userId, fallbackEmail = "") => {
  if (!db.users[userId]) {
    db.users[userId] = {
      profile: { id: userId, name: "", email: fallbackEmail, role: "student", enabled: true },
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

const upsertLocalCourseAllocation = (bucket, payload) => {
  bucket.courses = Array.isArray(bucket.courses) ? bucket.courses : [];
  const index = bucket.courses.findIndex((c) => c.course_id === payload.course_id || c.id === payload.course_id);
  const next = {
    ...(index >= 0 ? bucket.courses[index] : {}),
    id: payload.course_id,
    course_id: payload.course_id,
    status: payload.status || "assigned",
    startDate: payload.startDate || "",
    endDate: payload.endDate || "",
    source: "admin",
    assignedAt: payload.assignedAt || nowIso(),
    updatedAt: nowIso(),
  };
  if (index >= 0) bucket.courses[index] = next;
  else bucket.courses.push(next);
};

const upsertLocalAttendance = (bucket, payload) => {
  bucket.attendance = Array.isArray(bucket.attendance) ? bucket.attendance : [];
  const key = attendanceDocId(payload.user_id, payload.course_id, payload.date);
  const index = bucket.attendance.findIndex((a) => attendanceDocId(a.user_id || payload.user_id, a.course_id || a.courseId, a.date) === key);
  const existing = index >= 0 ? bucket.attendance[index] : null;
  const next = {
    id: key,
    user_id: payload.user_id,
    course_id: payload.course_id,
    date: payload.date,
    status: normalizeAttendanceStatus(payload.status || existing?.status || "absent"),
    markedAt: payload.markedAt || nowIso(),
  };
  if (index >= 0) bucket.attendance[index] = next;
  else bucket.attendance.push(next);
};

const ensureLocalDailyAttendanceForBucket = (bucket, userId, upToDate = todayDateKey(), filterCourseId = "") => {
  const courses = Array.isArray(bucket.courses) ? bucket.courses : [];
  courses.forEach((course) => {
    const source = String(course.source || "admin").toLowerCase();
    if (source === "student") return;
    const courseId = course.course_id || course.id;
    if (!courseId) return;
    if (filterCourseId && courseId !== filterCourseId) return;

    const start = toDateKey(course.startDate) || upToDate;
    const end = toDateKey(course.endDate) || upToDate;
    const cappedEnd = end > upToDate ? upToDate : end;
    dateKeysBetween(start, cappedEnd).forEach((dateKey) => {
      upsertLocalAttendance(bucket, {
        user_id: userId,
        course_id: courseId,
        date: dateKey,
        status: "absent",
      });
    });
  });
};

const commitBatchInChunks = async (writes) => {
  if (!writes.length) return;
  for (let i = 0; i < writes.length; i += 450) {
    const slice = writes.slice(i, i + 450);
    const batch = firestore.batch();
    slice.forEach(({ ref, data }) => batch.set(ref, data, { merge: true }));
    await batch.commit();
  }
};

const isAllocationActiveOnDate = (allocation = {}, dateKey = todayDateKey()) => {
  const status = String(allocation.status || "assigned").toLowerCase();
  if (["completed", "cancelled", "dropped", "archived"].includes(status)) return false;
  const start = toDateKey(allocation.startDate);
  const end = toDateKey(allocation.endDate);
  if (start && dateKey < start) return false;
  if (end && dateKey > end) return false;
  return true;
};

const ensureDailyAttendanceSlotsFirestore = async ({ courseId = "", userId = "", upToDate = todayDateKey(), activeOnly = false, singleDay = false } = {}) => {
  let allocRef = firestore.collection(USER_COURSES);
  if (courseId) allocRef = allocRef.where("course_id", "==", courseId);
  if (userId) allocRef = allocRef.where("user_id", "==", userId);

  let attendanceRef = firestore.collection(ATTENDANCE);
  if (courseId) attendanceRef = attendanceRef.where("course_id", "==", courseId);
  if (userId) attendanceRef = attendanceRef.where("user_id", "==", userId);

  const [allocSnap, attendanceSnap] = await Promise.all([allocRef.get(), attendanceRef.get()]);
  const existing = new Set(attendanceSnap.docs.map((d) => d.id));
  const writes = [];

  allocSnap.forEach((docSnap) => {
    const alloc = docSnap.data() || {};
    if (activeOnly && !isAllocationActiveOnDate(alloc, upToDate)) return;
    const uid = alloc.user_id;
    const cid = alloc.course_id;
    if (!uid || !cid) return;
    const start = toDateKey(alloc.startDate) || upToDate;
    const end = toDateKey(alloc.endDate) || upToDate;
    const dateKeys = singleDay
      ? [upToDate]
      : dateKeysBetween(start, end > upToDate ? upToDate : end);

    dateKeys.forEach((dateKey) => {
      if (dateKey < start || dateKey > end) return;
      const id = attendanceDocId(uid, cid, dateKey);
      if (existing.has(id)) return;
      existing.add(id);
      writes.push({
        ref: firestore.collection(ATTENDANCE).doc(id),
        data: {
          user_id: uid,
          course_id: cid,
          date: dateKey,
          status: "absent",
          markedAt: nowIso(),
          source: "auto-daily",
        },
      });
    });
  });

  await commitBatchInChunks(writes);
};

const ensureLocalDailyAttendanceSlots = ({ upToDate = todayDateKey(), activeOnly = true } = {}) => {
  const db = readLocalStudentDb();
  Object.entries(db.users || {}).forEach(([uid, entry]) => {
    const bucket = getLocalStudentBucket(db, uid, entry?.profile?.email || "");
    const courses = Array.isArray(bucket.courses) ? bucket.courses : [];
    courses.forEach((course) => {
      const source = String(course.source || "admin").toLowerCase();
      if (source === "student") return;
      if (activeOnly && !isAllocationActiveOnDate(course, upToDate)) return;
      const cid = course.course_id || course.id;
      if (!cid) return;
      upsertLocalAttendance(bucket, {
        user_id: uid,
        course_id: cid,
        date: upToDate,
        status: "absent",
        markedAt: nowIso(),
      });
    });
  });
  writeLocalStudentDb(db);
};

const runDailyAttendanceSync = async () => {
  const dateKey = todayDateKey();
  try {
    await ensureDailyAttendanceSlotsFirestore({ upToDate: dateKey, activeOnly: true, singleDay: true });
  } catch {
    ensureLocalDailyAttendanceSlots({ upToDate: dateKey, activeOnly: true });
  }
};

let attendanceSyncScheduled = false;

export const startAttendanceSyncScheduler = () => {
  if (attendanceSyncScheduled) return;
  attendanceSyncScheduled = true;

  const scheduleNext = () => {
    const now = new Date();
    const next = new Date(now);
    next.setHours(24, 0, 0, 0);
    const delayMs = Math.max(1000, next.getTime() - now.getTime());

    const timer = setTimeout(async () => {
      await runDailyAttendanceSync();
      scheduleNext();
    }, delayMs);

    if (typeof timer.unref === "function") timer.unref();
  };

  setTimeout(() => {
    runDailyAttendanceSync().catch(() => {});
  }, 1500);

  scheduleNext();
};

const readLocalStudentProfiles = () => {
  try {
    if (!fs.existsSync(LOCAL_STUDENT_DB_PATH)) return [];
    const raw = fs.readFileSync(LOCAL_STUDENT_DB_PATH, "utf8");
    const parsed = JSON.parse(raw || "{}");
    const users = parsed?.users || {};
    return Object.entries(users).map(([uid, entry]) => {
      const profile = entry?.profile || {};
      return {
        id: profile.id || uid,
        name: profile.name || "",
        email: profile.email || "",
        role: profile.role || "student",
        enabled: profile.enabled !== false,
      };
    });
  } catch {
    return [];
  }
};

export async function ensureDefaultAdminUser() {
  if (!DEFAULT_ADMIN_PASSWORD || !DEFAULT_SUB_ADMIN_PASSWORD) {
    console.warn("Skipping admin seed because ADMIN_PASSWORD/SUB_ADMIN_PASSWORD are not configured.");
    return { seeded: false, skipped: true };
  }

  try {
    const usersRef = firestore.collection(USERS);
    const [mainSnap, subSnap] = await Promise.all([
      usersRef.where("email", "==", DEFAULT_ADMIN_EMAIL).limit(1).get(),
      usersRef.where("email", "==", DEFAULT_SUB_ADMIN_EMAIL).limit(1).get(),
    ]);

    let seeded = false;
    if (mainSnap.empty) {
      seeded = true;
      await usersRef.doc("admin-seed").set(
        {
          id: "admin-seed",
          name: "System Admin",
          email: DEFAULT_ADMIN_EMAIL,
          password: DEFAULT_ADMIN_PASSWORD,
          role: "main_admin",
          createdAt: nowIso(),
        },
        { merge: true }
      );
    }

    if (subSnap.empty) {
      seeded = true;
      await usersRef.doc("sub-admin-seed").set(
        {
          id: "sub-admin-seed",
          name: "Course Admin",
          email: DEFAULT_SUB_ADMIN_EMAIL,
          password: DEFAULT_SUB_ADMIN_PASSWORD,
          role: "sub_admin",
          createdAt: nowIso(),
        },
        { merge: true }
      );
    }

    return { seeded };
  } catch (err) {
    console.warn("Skipping admin seed because Firestore is not configured:", err?.message || err);
    return { seeded: false, skipped: true };
  }
}

export async function adminLogin(req, res) {
  try {
    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "").trim();

    if (!email || !password) {
      return res.status(400).json({ ok: false, error: "Email and password are required" });
    }

    if (!ADMIN_JWT_SECRET) {
      return res.status(500).json({ ok: false, error: "Server auth secret is not configured" });
    }

    const defaultAdminMatch = [
      {
        id: "admin-seed",
        name: "System Admin",
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        role: "main_admin",
      },
      {
        id: "sub-admin-seed",
        name: "Course Admin",
        email: DEFAULT_SUB_ADMIN_EMAIL,
        password: DEFAULT_SUB_ADMIN_PASSWORD,
        role: "sub_admin",
      },
    ].find((item) => item.email === email && item.password === password);

    if (defaultAdminMatch) {
      const role = defaultAdminMatch.role;
      const token = jwt.sign(
        { id: defaultAdminMatch.id, email: defaultAdminMatch.email, role },
        ADMIN_JWT_SECRET,
        { expiresIn: "8h" }
      );
      return res.json({
        ok: true,
        message: "Login successful",
        role,
        token,
        redirectTo: resolveAdminRedirectByRole(role),
        user: {
          id: defaultAdminMatch.id,
          name: defaultAdminMatch.name,
          email: defaultAdminMatch.email,
          role,
        },
      });
    }

    const snap = await firestore.collection(USERS).where("email", "==", email).limit(1).get();
    if (snap.empty) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const user = snap.docs[0].data() || {};
    const role = normalizeRole(user.role);
    if (!isAdminRole(role)) {
      return res.status(403).json({ ok: false, error: "Administrator access required" });
    }

    if (String(user.password || "") !== password) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const token = jwt.sign(
      { id: user.id || snap.docs[0].id, email: user.email || email, role },
      ADMIN_JWT_SECRET,
      { expiresIn: "8h" }
    );
    return res.json({
      ok: true,
      message: "Login successful",
      role,
      token,
      redirectTo: resolveAdminRedirectByRole(role),
      user: {
        id: user.id || snap.docs[0].id,
        name: user.name || "",
        email: user.email || email,
        role,
      },
    });
  } catch (err) {
    console.error("adminLogin error", err);
    return res.status(500).json({ ok: false, error: "Failed to login" });
  }
}

export async function adminLogout(_req, res) {
  return res.json({ ok: true, message: "Logout successful" });
}

export async function getDashboardSummary(req, res) {
  try {
    const roleKey = normalizeRole(req.admin?.role || req.user?.role || "main_admin");
    const cacheKey = `dashboard::${roleKey}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });
    }

    const today = todayDateKey();
    const [usersSnap, coursesSnap, allocationsSnap, attendanceTodaySnap, submissionsSnap] = await Promise.all([
      firestore.collection(USERS).where("role", "==", "student").get(),
      firestore.collection(COURSES).get(),
      firestore.collection(USER_COURSES).get(),
      firestore.collection(ATTENDANCE).where("date", "==", today).get(),
      firestore.collection(ASSIGNMENT_SUBMISSIONS).get(),
    ]);

    const users = dedupeUsersByEmail(
      usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => isInstitutionEmail(u.email || ""))
    );
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.enabled !== false).length;
    const totalCourses = coursesSnap.size;
    const completedCoursesCount = allocationsSnap.docs.filter((d) => String(d.data()?.status || "").toLowerCase() === "completed").length;
    const presentToday = attendanceTodaySnap.docs.filter((d) => String(d.data()?.status || "").toLowerCase() === "present").length;
    const absentToday = Math.max(attendanceTodaySnap.size - presentToday, 0);

    const recentActivity = submissionsSnap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a, b) => toEpoch(b.submittedAt || b.createdAt) - toEpoch(a.submittedAt || a.createdAt))
      .slice(0, 5)
      .map((item) => ({
        id: item.id,
        type: "assessment",
        title: item.assignmentTitle || "Assessment attempt",
        status: item.status || "submitted",
        at: item.submittedAt || item.createdAt || nowIso(),
      }));

    const payload = {
      ok: true,
      item: {
        totalUsers,
        activeUsers,
        totalCourses,
        completedCoursesCount,
        attendanceToday: {
          date: today,
          present: presentToday,
          absent: absentToday,
          totalRows: attendanceTodaySnap.size,
        },
        recentActivity,
      },
      meta: {
        cached: false,
      },
    };

    cacheSet(cacheKey, payload, DASHBOARD_CACHE_TTL_MS);

    return res.json(payload);
  } catch (err) {
    console.error("getDashboardSummary error", err);
    return res.status(500).json({ ok: false, error: "Failed to load dashboard summary" });
  }
}

export async function listCourses(req, res) {
  try {
    const search = String(req.query?.search || "").trim().toLowerCase();
    const category = String(req.query?.category || "all").trim().toLowerCase();
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const date = String(req.query?.date || "").trim();
    const fields = String(req.query?.fields || "").trim();
    const page = Math.max(Number.parseInt(req.query?.page || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query?.pageSize || "10", 10) || 10, 1), 100);
    const cacheKey = `courses::${search}::${category}::${status}::${date}::${fields}::${page}::${pageSize}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });
    }

    const requestedFields = fields
      ? Array.from(new Set(fields.split(",").map((f) => f.trim()).filter(Boolean)))
      : null;

    let ref = firestore.collection(COURSES);
    if (category && category !== "all") ref = ref.where("category", "==", category);
    if (status && status !== "all") ref = ref.where("status", "==", status);

    const snap = await ref.orderBy("course_name", "asc").get();
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

    if (search) {
      items = items.filter((course) => {
        const title = String(course.title || course.course_name || "").toLowerCase();
        const desc = String(course.description || "").toLowerCase();
        return title.includes(search) || desc.includes(search);
      });
    }

    if (date) {
      items = items.filter((course) => String(course.startDate || "") === date);
    }

    if (normalizeRole(req.admin?.role || req.user?.role || "") === "sub_admin") {
      const scoped = items.filter((course) => canSubAdminAccessCourse(course, req.admin || req.user || {}));
      items = scoped;
    }

    const total = items.length;
    const offset = (page - 1) * pageSize;
    const paged = items.slice(offset, offset + pageSize);

    const projected = requestedFields
      ? paged.map((item) => {
          const next = { id: item.id };
          requestedFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(item, field)) next[field] = item[field];
          });
          return next;
        })
      : paged;

    const payload = {
      ok: true,
      items: projected,
      total,
      page,
      pageSize,
      hasMore: offset + projected.length < total,
      meta: {
        cached: false,
      },
    };

    cacheSet(cacheKey, payload, COURSE_LIST_CACHE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    console.warn("listCourses firestore unavailable, using local fallback:", err?.message || err);
    const db = readLocalAdminDb();
    const search = String(req.query?.search || "").trim().toLowerCase();
    const category = String(req.query?.category || "all").trim().toLowerCase();
    const status = String(req.query?.status || "all").trim().toLowerCase();
    const date = String(req.query?.date || "").trim();
    const fields = String(req.query?.fields || "").trim();
    const page = Math.max(Number.parseInt(req.query?.page || "1", 10) || 1, 1);
    const pageSize = Math.min(Math.max(Number.parseInt(req.query?.pageSize || "10", 10) || 10, 1), 100);
    const cacheKey = `courses::${search}::${category}::${status}::${date}::${fields}::${page}::${pageSize}`;

    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });
    }

    const requestedFields = fields
      ? Array.from(new Set(fields.split(",").map((f) => f.trim()).filter(Boolean)))
      : null;

    let items = (db.courses || []).slice().sort((a, b) => String(a.title || "").localeCompare(String(b.title || "")));

    if (category && category !== "all") {
      items = items.filter((course) => String(course.category || "").toLowerCase() === category);
    }
    if (status && status !== "all") {
      items = items.filter((course) => String(course.status || "").toLowerCase() === status);
    }
    if (search) {
      items = items.filter((course) => {
        const title = String(course.title || course.course_name || "").toLowerCase();
        const desc = String(course.description || "").toLowerCase();
        return title.includes(search) || desc.includes(search);
      });
    }
    if (date) {
      items = items.filter((course) => String(course.startDate || "") === date);
    }

    if (normalizeRole(req.admin?.role || req.user?.role || "") === "sub_admin") {
      const scoped = items.filter((course) => canSubAdminAccessCourse(course, req.admin || req.user || {}));
      items = scoped;
    }

    const total = items.length;
    const offset = (page - 1) * pageSize;
    const paged = items.slice(offset, offset + pageSize);

    const projected = requestedFields
      ? paged.map((item) => {
          const next = { id: item.id };
          requestedFields.forEach((field) => {
            if (Object.prototype.hasOwnProperty.call(item, field)) next[field] = item[field];
          });
          return next;
        })
      : paged;

    const payload = {
      ok: true,
      items: projected,
      total,
      page,
      pageSize,
      hasMore: offset + projected.length < total,
      source: "local-fallback",
      meta: {
        cached: false,
      },
    };

    cacheSet(cacheKey, payload, COURSE_LIST_CACHE_TTL_MS);
    return res.json(payload);
  }
}

export async function createCourse(req, res) {
  try {
    const {
      title,
      category = "learning",
      customCategory = "",
      description,
      startDate,
      endDate,
      durationDays = 0,
      difficulty = "Beginner",
      links = [],
      websiteRef = "",
      status = "Active",
      course_name, // For backward compatibility
    } = req.body || {};

    const courseTitle = (title || course_name || "").trim();
    if (!courseTitle) return res.status(400).json({ ok: false, error: "title is required" });
    if (!description?.trim()) return res.status(400).json({ ok: false, error: "description is required" });

    const payload = {
      title: courseTitle,
      course_name: courseTitle, // Keep for backward compatibility
      category,
      customCategory: category === "custom" ? customCategory.trim() : "",
      description: description.trim(),
      startDate: startDate || "",
      endDate: endDate || "",
      durationDays: parseInt(durationDays) || 0,
      difficulty,
      links: Array.isArray(links) ? links : [],
      websiteRef: websiteRef?.trim() || "",
      status,
      createdBy: {
        id: req.admin?.id || req.user?.uid || "",
        email: req.admin?.email || req.user?.email || "",
        role: normalizeRole(req.admin?.role || req.user?.role || "sub_admin"),
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    try {
      const ref = await firestore.collection(COURSES).add(payload);
      cacheInvalidateByPrefix(["courses::", "dashboard::", "reports::"]);
      return res.status(201).json({ ok: true, id: ref.id });
    } catch (firestoreErr) {
      console.warn("createCourse firestore unavailable, using local fallback:", firestoreErr?.message || firestoreErr);
      const db = readLocalAdminDb();
      const id = randomUUID();
      db.courses.push({ id, ...payload });
      writeLocalAdminDb(db);
      cacheInvalidateByPrefix(["courses::", "dashboard::", "reports::"]);
      return res.status(201).json({ ok: true, id, source: "local-fallback" });
    }
  } catch (err) {
    console.error("createCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to create course" });
  }
}

export async function updateCourse(req, res) {
  try {
    const { courseId } = req.params;
    const {
      title,
      category = "learning",
      customCategory = "",
      description,
      startDate,
      endDate,
      durationDays = 0,
      difficulty = "Beginner",
      links = [],
      websiteRef = "",
      status = "Active",
      course_name, // For backward compatibility
    } = req.body || {};

    const updateData = {};

    if (title !== undefined) {
      updateData.title = title.trim();
      updateData.course_name = title.trim(); // Keep for backward compatibility
    } else if (course_name !== undefined) {
      updateData.title = course_name.trim();
      updateData.course_name = course_name.trim();
    }

    if (category !== undefined) updateData.category = category;
    if (customCategory !== undefined) updateData.customCategory = category === "custom" ? customCategory.trim() : "";
    if (description !== undefined) updateData.description = description.trim();
    if (startDate !== undefined) updateData.startDate = startDate;
    if (endDate !== undefined) updateData.endDate = endDate;
    if (durationDays !== undefined) updateData.durationDays = parseInt(durationDays) || 0;
    if (difficulty !== undefined) updateData.difficulty = difficulty;
    if (links !== undefined) updateData.links = Array.isArray(links) ? links : [];
    if (websiteRef !== undefined) updateData.websiteRef = websiteRef?.trim() || "";
    if (status !== undefined) updateData.status = status;

    updateData.updatedAt = nowIso();

    try {
      await courseDoc(courseId).set(updateData, { merge: true });
      cacheInvalidateByPrefix(["courses::", "dashboard::", "reports::"]);
      return res.json({ ok: true });
    } catch (firestoreErr) {
      console.warn("updateCourse firestore unavailable, using local fallback:", firestoreErr?.message || firestoreErr);
      const db = readLocalAdminDb();
      const idx = db.courses.findIndex((c) => c.id === courseId);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Course not found" });
      db.courses[idx] = { ...db.courses[idx], ...updateData };
      writeLocalAdminDb(db);
      cacheInvalidateByPrefix(["courses::", "dashboard::", "reports::"]);
      return res.json({ ok: true, source: "local-fallback" });
    }
  } catch (err) {
    console.error("updateCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to update course" });
  }
}

export async function deleteCourse(req, res) {
  try {
    const { courseId } = req.params;
    try {
      await courseDoc(courseId).delete();
      cacheInvalidateByPrefix(["courses::", "dashboard::", "reports::"]);
      return res.json({ ok: true });
    } catch (firestoreErr) {
      console.warn("deleteCourse firestore unavailable, using local fallback:", firestoreErr?.message || firestoreErr);
      const db = readLocalAdminDb();
      const before = db.courses.length;
      db.courses = db.courses.filter((c) => c.id !== courseId);
      writeLocalAdminDb(db);
      if (db.courses.length === before) return res.status(404).json({ ok: false, error: "Course not found" });
      cacheInvalidateByPrefix(["courses::", "dashboard::", "reports::"]);
      return res.json({ ok: true, source: "local-fallback" });
    }
  } catch (err) {
    console.error("deleteCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to delete course" });
  }
}

export async function assignCourseToAll(req, res) {
  try {
    const { course_id, status = "assigned", start_date = "", end_date = "" } = req.body || {};
    if (!course_id) return res.status(400).json({ ok: false, error: "course_id is required" });
    const courseSnap = await courseDoc(course_id).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Course not found" });
    if (String(courseSnap.data()?.status || "active").toLowerCase() !== "active") {
      return res.status(400).json({ ok: false, error: "Only active courses can be allocated" });
    }
    const startDate = parseDateValue(start_date);
    const endDate = parseDateValue(end_date);
    if (!startDate || !endDate || startDate > endDate) {
      return res.status(400).json({ ok: false, error: "Valid start_date and end_date are required" });
    }
    const usersSnap = await firestore.collection(USERS).where("role", "==", "student").get();
    const students = dedupeUsersByEmail(
      usersSnap.docs
        .map((docSnap) => ({ id: docSnap.id, ...(docSnap.data() || {}) }))
        .filter((u) => u.enabled !== false)
        .filter((u) => isInstitutionEmail(u.email || ""))
    );
    const existingAllocSnap = await firestore.collection(USER_COURSES).where("course_id", "==", course_id).get();
    const existingUserIds = new Set(existingAllocSnap.docs.map((d) => String(d.data()?.user_id || "")));
    const targetStudents = students.filter((student) => !existingUserIds.has(String(student.id || "")));
    if (!targetStudents.length) {
      return res.status(400).json({ ok: false, error: "All eligible students are already allocated" });
    }

    const batch = firestore.batch();
    targetStudents.forEach((student) => {
      const uid = student.id;
      batch.set(userCourseDoc(uid, course_id), {
        user_id: uid,
        course_id,
        status,
        startDate: toDateKey(startDate),
        endDate: toDateKey(endDate),
        assignedAt: nowIso(),
        updatedAt: nowIso(),
      }, { merge: true });
    });
    await batch.commit();
    await ensureDailyAttendanceSlotsFirestore({ courseId: course_id, upToDate: todayDateKey(), activeOnly: true, singleDay: true });
    cacheInvalidateByPrefix(["dashboard::", "reports::"]);
    return res.json({ ok: true, assigned: targetStudents.length });
  } catch (err) {
    console.warn("assignCourseToAll firestore unavailable, using local fallback:", err?.message || err);
    try {
      const startDate = toDateKey(req.body?.start_date);
      const endDate = toDateKey(req.body?.end_date);
      const courseId = req.body?.course_id;
      const status = req.body?.status || "assigned";
      if (!courseId || !startDate || !endDate || startDate > endDate) {
        return res.status(400).json({ ok: false, error: "Valid course_id, start_date and end_date are required" });
      }

      const adminDb = readLocalAdminDb();
      const currentCourse = (adminDb.courses || []).find((c) => c.id === courseId);
      if (!currentCourse) return res.status(404).json({ ok: false, error: "Course not found" });
      if (String(currentCourse.status || "active").toLowerCase() !== "active") {
        return res.status(400).json({ ok: false, error: "Only active courses can be allocated" });
      }

      const db = readLocalStudentDb();
      const students = dedupeUsersByEmail(
        readLocalStudentProfiles()
          .filter((u) => String(u.role || "student").toLowerCase() === "student" && u.enabled !== false)
          .filter((u) => isInstitutionEmail(u.email || ""))
      );

      const alreadyAllocated = new Set();
      Object.entries(db.users || {}).forEach(([uid, entry]) => {
        const bucket = getLocalStudentBucket(db, uid, entry?.profile?.email || "");
        const exists = (bucket.courses || []).some((c) => (c.course_id || c.id) === courseId);
        if (exists) alreadyAllocated.add(uid);
      });
      const targetStudents = students.filter((student) => !alreadyAllocated.has(student.id));
      if (!targetStudents.length) {
        return res.status(400).json({ ok: false, error: "All eligible students are already allocated" });
      }

      targetStudents.forEach((student) => {
        const bucket = getLocalStudentBucket(db, student.id, student.email || "");
        upsertLocalCourseAllocation(bucket, {
          course_id: courseId,
          status,
          startDate,
          endDate,
          assignedAt: nowIso(),
        });
        ensureLocalDailyAttendanceForBucket(bucket, student.id, todayDateKey(), courseId);
      });

      writeLocalStudentDb(db);
  cacheInvalidateByPrefix(["dashboard::", "reports::"]);
  return res.json({ ok: true, assigned: targetStudents.length, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("assignCourseToAll fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to assign course" });
    }
  }
}

export async function assignCourseToSelected(req, res) {
  try {
    const { course_id, user_ids = [], status = "assigned", start_date = "", end_date = "" } = req.body || {};
    if (!course_id || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ ok: false, error: "course_id and user_ids are required" });
    }
    const courseSnap = await courseDoc(course_id).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Course not found" });
    if (String(courseSnap.data()?.status || "active").toLowerCase() !== "active") {
      return res.status(400).json({ ok: false, error: "Only active courses can be allocated" });
    }
    const startDate = parseDateValue(start_date);
    const endDate = parseDateValue(end_date);
    if (!startDate || !endDate || startDate > endDate) {
      return res.status(400).json({ ok: false, error: "Valid start_date and end_date are required" });
    }

    const selectedUsers = [];
    await Promise.all(
      user_ids.map(async (uid) => {
        const snap = await firestore.collection(USERS).doc(uid).get();
        if (!snap.exists) return;
        const data = snap.data() || {};
        if ((data.role || "student") !== "student") return;
        if (data.enabled === false) return;
        if (!isInstitutionEmail(data.email || "")) return;
        selectedUsers.push({ id: uid, ...data });
      })
    );

    const validIds = dedupeUsersByEmail(selectedUsers).map((u) => u.id);
    if (!validIds.length) {
      return res.status(400).json({ ok: false, error: "No registered students selected" });
    }

    const existingDocs = await Promise.all(validIds.map((uid) => userCourseDoc(uid, course_id).get()));
    const alreadyAllocated = new Set(existingDocs.filter((doc) => doc.exists).map((doc) => String(doc.data()?.user_id || "")));
    const freshIds = validIds.filter((uid) => !alreadyAllocated.has(String(uid)));
    if (!freshIds.length) {
      return res.status(400).json({ ok: false, error: "Selected students are already allocated" });
    }

    const batch = firestore.batch();
    freshIds.forEach((uid) => {
      batch.set(userCourseDoc(uid, course_id), {
        user_id: uid,
        course_id,
        status,
        startDate: toDateKey(startDate),
        endDate: toDateKey(endDate),
        assignedAt: nowIso(),
        updatedAt: nowIso(),
      }, { merge: true });
    });
    await batch.commit();
    await ensureDailyAttendanceSlotsFirestore({ courseId: course_id, upToDate: todayDateKey(), activeOnly: true, singleDay: true });
    cacheInvalidateByPrefix(["dashboard::", "reports::"]);
    return res.json({ ok: true, assigned: freshIds.length });
  } catch (err) {
    console.warn("assignCourseToSelected firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { course_id, user_ids = [], status = "assigned", start_date = "", end_date = "" } = req.body || {};
      const startDate = toDateKey(start_date);
      const endDate = toDateKey(end_date);
      if (!course_id || !Array.isArray(user_ids) || !user_ids.length || !startDate || !endDate || startDate > endDate) {
        return res.status(400).json({ ok: false, error: "Valid course_id, user_ids, start_date and end_date are required" });
      }

      const adminDb = readLocalAdminDb();
      const currentCourse = (adminDb.courses || []).find((c) => c.id === course_id);
      if (!currentCourse) return res.status(404).json({ ok: false, error: "Course not found" });
      if (String(currentCourse.status || "active").toLowerCase() !== "active") {
        return res.status(400).json({ ok: false, error: "Only active courses can be allocated" });
      }

      const profileById = new Map(readLocalStudentProfiles().map((u) => [u.id, u]));
      const selectedUsers = user_ids
        .map((uid) => profileById.get(uid))
        .filter(Boolean)
        .filter((u) => String(u.role || "student").toLowerCase() === "student" && u.enabled !== false)
        .filter((u) => isInstitutionEmail(u.email || ""));
      const validIds = dedupeUsersByEmail(selectedUsers).map((u) => u.id);
      if (!validIds.length) {
        return res.status(400).json({ ok: false, error: "No registered students selected" });
      }

      const db = readLocalStudentDb();
      const freshIds = validIds.filter((uid) => {
        const profile = profileById.get(uid) || {};
        const bucket = getLocalStudentBucket(db, uid, profile.email || "");
        return !(bucket.courses || []).some((c) => (c.course_id || c.id) === course_id);
      });
      if (!freshIds.length) {
        return res.status(400).json({ ok: false, error: "Selected students are already allocated" });
      }

      freshIds.forEach((uid) => {
        const profile = profileById.get(uid) || {};
        const bucket = getLocalStudentBucket(db, uid, profile.email || "");
        upsertLocalCourseAllocation(bucket, {
          course_id,
          status,
          startDate,
          endDate,
          assignedAt: nowIso(),
        });
        ensureLocalDailyAttendanceForBucket(bucket, uid, todayDateKey(), course_id);
      });

      writeLocalStudentDb(db);
  cacheInvalidateByPrefix(["dashboard::", "reports::"]);
  return res.json({ ok: true, assigned: freshIds.length, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("assignCourseToSelected fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to assign selected course" });
    }
  }
}

export async function removeAssignedCourse(req, res) {
  try {
    const { userId, courseId } = req.params;
    await userCourseDoc(userId, courseId).delete();
    cacheInvalidateByPrefix(["dashboard::", "reports::"]);
    return res.json({ ok: true });
  } catch (err) {
    console.warn("removeAssignedCourse firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { userId, courseId } = req.params;
      const db = readLocalStudentDb();
      const bucket = getLocalStudentBucket(db, userId);
      const beforeCourses = Array.isArray(bucket.courses) ? bucket.courses.length : 0;
      bucket.courses = (bucket.courses || []).filter((c) => (c.course_id || c.id) !== courseId);
      bucket.attendance = (bucket.attendance || []).filter((a) => (a.course_id || a.courseId) !== courseId);
      writeLocalStudentDb(db);
      if (bucket.courses.length === beforeCourses) {
        return res.status(404).json({ ok: false, error: "Assignment not found" });
      }
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.json({ ok: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("removeAssignedCourse fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to remove assignment" });
    }
  }
}

export async function allocateCourse(req, res) {
  try {
    const { course_id, user_id, user_ids = [], status = "assigned", start_date = "", end_date = "" } = req.body || {};
    const ids = Array.isArray(user_ids) && user_ids.length ? user_ids : user_id ? [user_id] : [];
    if (!course_id || !ids.length) {
      return res.status(400).json({ ok: false, error: "course_id and user_id/user_ids are required" });
    }
    req.body = { course_id, user_ids: ids, status, start_date, end_date };
    return assignCourseToSelected(req, res);
  } catch (err) {
    console.error("allocateCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to allocate course" });
  }
}

export async function listAllocations(req, res) {
  try {
    const { studentId = "", courseId = "" } = req.query || {};
    let ref = firestore.collection(USER_COURSES);
    if (studentId) ref = ref.where("user_id", "==", studentId);
    if (courseId) ref = ref.where("course_id", "==", courseId);
    const snap = await ref.get();
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ ok: true, items });
  } catch (err) {
    console.warn("listAllocations firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { studentId = "", courseId = "" } = req.query || {};
      const db = readLocalStudentDb();
      const items = [];
      Object.entries(db.users || {}).forEach(([uid, entry]) => {
        if (studentId && uid !== studentId) return;
        const bucket = getLocalStudentBucket(db, uid, entry?.profile?.email || "");
        ensureLocalDailyAttendanceForBucket(bucket, uid, todayDateKey(), courseId || "");
        (bucket.courses || []).forEach((c) => {
          const cid = c.course_id || c.id;
          if (courseId && cid !== courseId) return;
          items.push({
            id: `${uid}_${cid}`,
            user_id: uid,
            course_id: cid,
            status: c.status || "assigned",
            startDate: c.startDate || "",
            endDate: c.endDate || "",
            assignedAt: c.assignedAt || "",
            updatedAt: c.updatedAt || "",
          });
        });
      });
      writeLocalStudentDb(db);
      return res.json({ ok: true, items, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listAllocations fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list allocations" });
    }
  }
}

export async function deleteAllocation(req, res) {
  try {
    const { allocationId } = req.params;
    if (!allocationId) return res.status(400).json({ ok: false, error: "allocationId is required" });

    // Supports both document id format and user_course composite id.
    const docRef = firestore.collection(USER_COURSES).doc(allocationId);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      await docRef.delete();
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.json({ ok: true });
    }

    // Fallback: treat allocationId as userId and use courseId from query for deletion.
    const { courseId = "" } = req.query || {};
    if (courseId) {
      await userCourseDoc(allocationId, courseId).delete();
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.json({ ok: true });
    }

    return res.status(404).json({ ok: false, error: "Allocation not found" });
  } catch (err) {
    console.warn("deleteAllocation firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { allocationId } = req.params;
      const { courseId = "" } = req.query || {};
      const db = readLocalStudentDb();

      if (courseId) {
        const bucket = getLocalStudentBucket(db, allocationId);
        const before = (bucket.courses || []).length;
        bucket.courses = (bucket.courses || []).filter((c) => (c.course_id || c.id) !== courseId);
        bucket.attendance = (bucket.attendance || []).filter((a) => (a.course_id || a.courseId) !== courseId);
        writeLocalStudentDb(db);
        if (bucket.courses.length === before) return res.status(404).json({ ok: false, error: "Allocation not found" });
        cacheInvalidateByPrefix(["dashboard::", "reports::"]);
        return res.json({ ok: true, source: "local-fallback" });
      }

      const [uid, cid] = String(allocationId || "").split("_");
      if (!uid || !cid) return res.status(404).json({ ok: false, error: "Allocation not found" });
      const bucket = getLocalStudentBucket(db, uid);
      const before = (bucket.courses || []).length;
      bucket.courses = (bucket.courses || []).filter((c) => (c.course_id || c.id) !== cid);
      bucket.attendance = (bucket.attendance || []).filter((a) => (a.course_id || a.courseId) !== cid);
      writeLocalStudentDb(db);
      if (bucket.courses.length === before) return res.status(404).json({ ok: false, error: "Allocation not found" });
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.json({ ok: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("deleteAllocation fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to delete allocation" });
    }
  }
}

export async function listCourseAllocations(req, res) {
  try {
    const { courseId } = req.params;
    if (!courseId) return res.status(400).json({ ok: false, error: "courseId is required" });

    const [allocSnap, usersSnap] = await Promise.all([
      firestore.collection(USER_COURSES).where("course_id", "==", courseId).get(),
      firestore.collection(USERS).where("role", "==", "student").get(),
    ]);

    const userMap = new Map(
      usersSnap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((u) => u.enabled !== false)
        .map((u) => [u.id, u])
    );

    const rawItems = allocSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((a) => userMap.has(a.user_id))
      .map((a) => ({
        ...a,
        user: {
          id: a.user_id,
          name: userMap.get(a.user_id)?.name || "",
          email: userMap.get(a.user_id)?.email || "",
        },
      }));

    const deduped = [];
    const idxByEmail = new Map();
    rawItems.forEach((item) => {
      const emailKey = normalizeEmail(item.user?.email || "");
      if (!emailKey) {
        deduped.push(item);
        return;
      }
      const existingIdx = idxByEmail.get(emailKey);
      if (existingIdx === undefined) {
        idxByEmail.set(emailKey, deduped.length);
        deduped.push(item);
        return;
      }
      const existing = deduped[existingIdx];
      const existingEpoch = toEpoch(existing.updatedAt || existing.assignedAt);
      const currentEpoch = toEpoch(item.updatedAt || item.assignedAt);
      if (currentEpoch >= existingEpoch) {
        deduped[existingIdx] = item;
      }
    });

    const items = deduped.sort((a, b) => (a.user?.email || "").localeCompare(b.user?.email || ""));

    return res.json({ ok: true, items });
  } catch (err) {
    console.warn("listCourseAllocations firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { courseId } = req.params;
      const students = dedupeUsersByEmail(readLocalStudentProfiles().filter((u) => u.enabled !== false));
      const studentById = new Map(students.map((u) => [u.id, u]));
      const db = readLocalStudentDb();
      const items = [];
      Object.entries(db.users || {}).forEach(([uid, entry]) => {
        const bucket = getLocalStudentBucket(db, uid, entry?.profile?.email || "");
        ensureLocalDailyAttendanceForBucket(bucket, uid, todayDateKey(), courseId);
        (bucket.courses || []).forEach((c) => {
          const cid = c.course_id || c.id;
          if (cid !== courseId) return;
          if (!studentById.has(uid)) return;
          const user = studentById.get(uid);
          items.push({
            id: `${uid}_${cid}`,
            user_id: uid,
            course_id: cid,
            status: c.status || "assigned",
            startDate: c.startDate || "",
            endDate: c.endDate || "",
            user: {
              id: uid,
              name: user.name || "",
              email: user.email || "",
            },
          });
        });
      });
      writeLocalStudentDb(db);

      const deduped = [];
      const idxByEmail = new Map();
      items.forEach((item) => {
        const emailKey = normalizeEmail(item.user?.email || "");
        if (!emailKey) {
          deduped.push(item);
          return;
        }
        const existingIdx = idxByEmail.get(emailKey);
        if (existingIdx === undefined) {
          idxByEmail.set(emailKey, deduped.length);
          deduped.push(item);
          return;
        }
        const existing = deduped[existingIdx];
        const existingEpoch = toEpoch(existing.updatedAt || existing.assignedAt);
        const currentEpoch = toEpoch(item.updatedAt || item.assignedAt);
        if (currentEpoch >= existingEpoch) {
          deduped[existingIdx] = item;
        }
      });

      deduped.sort((a, b) => (a.user?.email || "").localeCompare(b.user?.email || ""));
      return res.json({ ok: true, items: deduped, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listCourseAllocations fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list course allocations" });
    }
  }
}

export async function listAllottedSkills(req, res) {
  try {
    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 6, 1), 50);
    const categoryFilter = String(req.query?.category || "all").trim().toLowerCase();
    const actor = req.admin || req.user || {};
    const today = todayDateKey();

    const [coursesSnap, allocationsSnap, attendanceSnap, tasksSnap, submissionsSnap] = await Promise.all([
      firestore.collection(COURSES).get(),
      firestore.collection(USER_COURSES).get(),
      firestore.collection(ATTENDANCE).where("date", "==", today).get(),
      firestore.collection(COMMUNICATION_TASKS).get(),
      firestore.collection(STUDENT_SUBMISSIONS).get(),
    ]);

    let courses = coursesSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (normalizeRole(actor?.role || "") === "sub_admin") {
      const scoped = courses.filter((course) => canSubAdminAccessCourse(course, actor));
      courses = scoped;
    }

    if (categoryFilter !== "all") {
      courses = courses.filter((course) => normalizeSkillCategory(course) === categoryFilter);
    }

    const courseIdSet = new Set(courses.map((course) => course.id));
    const usersByCourse = new Map();
    allocationsSnap.forEach((docSnap) => {
      const row = docSnap.data() || {};
      const skillId = String(row.course_id || "");
      const userId = String(row.user_id || "");
      if (!skillId || !userId || !courseIdSet.has(skillId)) return;
      if (!usersByCourse.has(skillId)) usersByCourse.set(skillId, new Set());
      usersByCourse.get(skillId).add(userId);
    });

    const attendanceByCourse = new Map();
    attendanceSnap.forEach((docSnap) => {
      const row = docSnap.data() || {};
      const skillId = String(row.course_id || "");
      if (!skillId || !courseIdSet.has(skillId)) return;
      const current = attendanceByCourse.get(skillId) || { present: 0, total: 0 };
      current.total += 1;
      if (String(row.status || "").toLowerCase() === "present") current.present += 1;
      attendanceByCourse.set(skillId, current);
    });

    const tasksBySkill = new Map();
    tasksSnap.forEach((docSnap) => {
      const row = { id: docSnap.id, ...(docSnap.data() || {}) };
      const skillId = String(row.skillId || row.courseId || "");
      if (!skillId || !courseIdSet.has(skillId)) return;
      if (!tasksBySkill.has(skillId)) tasksBySkill.set(skillId, []);
      tasksBySkill.get(skillId).push({
        id: row.id,
        skillId,
        dayNumber: Number(row.dayNumber || 1),
        practiceType: normalizePracticeType(row.practiceType || "speaking"),
        description: String(row.description || "").trim(),
        referenceLink: String(row.referenceLink || "").trim(),
        instructions: String(row.instructions || "").trim(),
        evaluationMarks: Number(row.evaluationMarks || 0) || 0,
      });
    });
    tasksBySkill.forEach((rows) => rows.sort((a, b) => a.dayNumber - b.dayNumber));

    const submissionSummaryBySkill = new Map();
    submissionsSnap.forEach((docSnap) => {
      const row = docSnap.data() || {};
      const skillId = String(row.skillId || row.courseId || "");
      const userId = String(row.studentId || row.userId || "");
      if (!skillId || !userId || !courseIdSet.has(skillId)) return;
      if (!submissionSummaryBySkill.has(skillId)) {
        submissionSummaryBySkill.set(skillId, {
          completedUsers: new Set(),
          pendingUsers: new Set(),
          responsesCount: 0,
        });
      }
      const bucket = submissionSummaryBySkill.get(skillId);
      bucket.responsesCount += 1;
      const status = String(row.status || "submitted").toLowerCase();
      if (["completed", "reviewed", "pass"].includes(status)) {
        bucket.completedUsers.add(userId);
      } else {
        bucket.pendingUsers.add(userId);
      }
    });

    const items = courses
      .map((course) => {
        const skillId = course.id;
        const assignedSet = usersByCourse.get(skillId) || new Set();
        const assignedStudentsCount = assignedSet.size;
        const attendanceSummary = attendanceByCourse.get(skillId) || { present: 0, total: 0 };
        const submissionSummary = submissionSummaryBySkill.get(skillId) || {
          completedUsers: new Set(),
          pendingUsers: new Set(),
          responsesCount: 0,
        };
        const completionPercentage = toPercentage(submissionSummary.completedUsers.size, assignedStudentsCount || 1);
        const category = normalizeSkillCategory(course);
        const communicationTasks = tasksBySkill.get(skillId) || [];

        return {
          id: skillId,
          title: course.title || course.course_name || "Untitled Skill",
          category,
          duration: {
            startDate: course.startDate || "",
            endDate: course.endDate || "",
          },
          assignedStudentsCount,
          completionPercentage,
          attendanceStatus: `${attendanceSummary.present}/${assignedStudentsCount || attendanceSummary.total || 0} present`,
          communication:
            category === "communication"
              ? {
                  tasks: communicationTasks,
                  responsesCount: submissionSummary.responsesCount,
                  pendingResponses: submissionSummary.pendingUsers.size,
                  completedResponses: submissionSummary.completedUsers.size,
                }
              : null,
        };
      })
      .sort((a, b) => a.title.localeCompare(b.title));

    const total = items.length;
    const start = (page - 1) * pageSize;
    const paged = items.slice(start, start + pageSize);
    return res.json({ ok: true, items: paged, total, page, pageSize, hasMore: start + pageSize < total });
  } catch (err) {
    console.warn("listAllottedSkills firestore unavailable, using local fallback:", err?.message || err);
    try {
      const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 6, 1), 50);
      const categoryFilter = String(req.query?.category || "all").trim().toLowerCase();
      const actor = req.admin || req.user || {};
      const today = todayDateKey();
      const adminDb = readLocalAdminDb();
      const studentDb = readLocalStudentDb();

      let courses = (adminDb.courses || []).slice();
      if (normalizeRole(actor?.role || "") === "sub_admin") {
        const scoped = courses.filter((course) => canSubAdminAccessCourse(course, actor));
        courses = scoped;
      }
      if (categoryFilter !== "all") {
        courses = courses.filter((course) => normalizeSkillCategory(course) === categoryFilter);
      }

      const usersByCourse = new Map();
      const attendanceByCourse = new Map();
      Object.entries(studentDb.users || {}).forEach(([uid, entry]) => {
        const bucket = getLocalStudentBucket(studentDb, uid, entry?.profile?.email || "");
        (bucket.courses || []).forEach((row) => {
          const skillId = String(row.course_id || row.id || "");
          if (!skillId) return;
          if (!usersByCourse.has(skillId)) usersByCourse.set(skillId, new Set());
          usersByCourse.get(skillId).add(uid);
        });
        (bucket.attendance || []).forEach((row) => {
          const skillId = String(row.course_id || row.courseId || "");
          if (!skillId || String(row.date || "") !== today) return;
          const current = attendanceByCourse.get(skillId) || { present: 0, total: 0 };
          current.total += 1;
          if (String(row.status || "").toLowerCase() === "present") current.present += 1;
          attendanceByCourse.set(skillId, current);
        });
      });

      const tasksBySkill = new Map();
      (adminDb.communicationTasks || []).forEach((task) => {
        const skillId = String(task.skillId || task.courseId || "");
        if (!skillId) return;
        if (!tasksBySkill.has(skillId)) tasksBySkill.set(skillId, []);
        tasksBySkill.get(skillId).push({
          id: task.id,
          skillId,
          dayNumber: Number(task.dayNumber || 1),
          practiceType: normalizePracticeType(task.practiceType || "speaking"),
          description: String(task.description || "").trim(),
          referenceLink: String(task.referenceLink || "").trim(),
          instructions: String(task.instructions || "").trim(),
          evaluationMarks: Number(task.evaluationMarks || 0) || 0,
        });
      });
      tasksBySkill.forEach((rows) => rows.sort((a, b) => a.dayNumber - b.dayNumber));

      const submissionSummaryBySkill = new Map();
      (adminDb.studentSubmissions || []).forEach((row) => {
        const skillId = String(row.skillId || row.courseId || "");
        const userId = String(row.studentId || row.userId || "");
        if (!skillId || !userId) return;
        if (!submissionSummaryBySkill.has(skillId)) {
          submissionSummaryBySkill.set(skillId, {
            completedUsers: new Set(),
            pendingUsers: new Set(),
            responsesCount: 0,
          });
        }
        const bucket = submissionSummaryBySkill.get(skillId);
        bucket.responsesCount += 1;
        const status = String(row.status || "submitted").toLowerCase();
        if (["completed", "reviewed", "pass"].includes(status)) {
          bucket.completedUsers.add(userId);
        } else {
          bucket.pendingUsers.add(userId);
        }
      });

      const items = courses
        .map((course) => {
          const skillId = course.id;
          const assignedSet = usersByCourse.get(skillId) || new Set();
          const assignedStudentsCount = assignedSet.size;
          const attendanceSummary = attendanceByCourse.get(skillId) || { present: 0, total: 0 };
          const submissionSummary = submissionSummaryBySkill.get(skillId) || {
            completedUsers: new Set(),
            pendingUsers: new Set(),
            responsesCount: 0,
          };
          const completionPercentage = toPercentage(submissionSummary.completedUsers.size, assignedStudentsCount || 1);
          const category = normalizeSkillCategory(course);
          const communicationTasks = tasksBySkill.get(skillId) || [];

          return {
            id: skillId,
            title: course.title || course.course_name || "Untitled Skill",
            category,
            duration: {
              startDate: course.startDate || "",
              endDate: course.endDate || "",
            },
            assignedStudentsCount,
            completionPercentage,
            attendanceStatus: `${attendanceSummary.present}/${assignedStudentsCount || attendanceSummary.total || 0} present`,
            communication:
              category === "communication"
                ? {
                    tasks: communicationTasks,
                    responsesCount: submissionSummary.responsesCount,
                    pendingResponses: submissionSummary.pendingUsers.size,
                    completedResponses: submissionSummary.completedUsers.size,
                  }
                : null,
          };
        })
        .sort((a, b) => a.title.localeCompare(b.title));

      const total = items.length;
      const start = (page - 1) * pageSize;
      const paged = items.slice(start, start + pageSize);
      return res.json({ ok: true, items: paged, total, page, pageSize, hasMore: start + pageSize < total, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listAllottedSkills fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to load allotted skills" });
    }
  }
}

export async function listCommunicationTasks(req, res) {
  try {
    const skillId = String(req.query?.skillId || req.body?.skillId || "").trim();
    if (!skillId) return res.status(400).json({ ok: false, error: "skillId is required" });

    const courseSnap = await firestore.collection(COURSES).doc(skillId).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Skill not found" });
    const course = { id: courseSnap.id, ...(courseSnap.data() || {}) };
    if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
      return res.status(403).json({ ok: false, error: "You cannot access this skill" });
    }

    const snap = await firestore.collection(COMMUNICATION_TASKS).where("skillId", "==", skillId).get();
    const items = snap.docs
      .map((d) => ({ id: d.id, ...(d.data() || {}) }))
      .sort((a, b) => Number(a.dayNumber || 0) - Number(b.dayNumber || 0));
    return res.json({ ok: true, items });
  } catch (err) {
    console.warn("listCommunicationTasks firestore unavailable, using local fallback:", err?.message || err);
    try {
      const skillId = String(req.query?.skillId || req.body?.skillId || "").trim();
      if (!skillId) return res.status(400).json({ ok: false, error: "skillId is required" });
      const db = readLocalAdminDb();
      const course = (db.courses || []).find((row) => row.id === skillId);
      if (!course) return res.status(404).json({ ok: false, error: "Skill not found" });
      if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
        return res.status(403).json({ ok: false, error: "You cannot access this skill" });
      }
      const items = (db.communicationTasks || [])
        .filter((row) => String(row.skillId || row.courseId || "") === skillId)
        .sort((a, b) => Number(a.dayNumber || 0) - Number(b.dayNumber || 0));
      return res.json({ ok: true, items, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listCommunicationTasks fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list communication tasks" });
    }
  }
}

export async function createCommunicationTask(req, res) {
  try {
    const {
      skillId = "",
      dayNumber = 1,
      practiceType = "speaking",
      description = "",
      referenceLink = "",
      instructions = "",
      evaluationMarks = 0,
    } = req.body || {};

    if (!String(skillId).trim()) return res.status(400).json({ ok: false, error: "skillId is required" });
    if (!String(description).trim()) return res.status(400).json({ ok: false, error: "description is required" });

    const courseSnap = await firestore.collection(COURSES).doc(String(skillId).trim()).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Skill not found" });
    const course = { id: courseSnap.id, ...(courseSnap.data() || {}) };
    if (!isCommunicationSkill(course)) {
      return res.status(400).json({ ok: false, error: "Communication tasks are allowed only for communication skills" });
    }
    if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
      return res.status(403).json({ ok: false, error: "You cannot modify this skill" });
    }

    const payload = {
      skillId: String(skillId).trim(),
      dayNumber: Math.max(1, Number(dayNumber || 1)),
      practiceType: normalizePracticeType(practiceType),
      description: String(description || "").trim(),
      referenceLink: String(referenceLink || "").trim(),
      instructions: String(instructions || "").trim(),
      evaluationMarks: Math.max(0, Number(evaluationMarks || 0)),
      createdBy: {
        id: req.admin?.id || req.user?.uid || "",
        email: req.admin?.email || req.user?.email || "",
      },
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };

    const ref = await firestore.collection(COMMUNICATION_TASKS).add(payload);
    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.warn("createCommunicationTask firestore unavailable, using local fallback:", err?.message || err);
    try {
      const {
        skillId = "",
        dayNumber = 1,
        practiceType = "speaking",
        description = "",
        referenceLink = "",
        instructions = "",
        evaluationMarks = 0,
      } = req.body || {};
      if (!String(skillId).trim()) return res.status(400).json({ ok: false, error: "skillId is required" });
      if (!String(description).trim()) return res.status(400).json({ ok: false, error: "description is required" });

      const db = readLocalAdminDb();
      const course = (db.courses || []).find((row) => row.id === String(skillId).trim());
      if (!course) return res.status(404).json({ ok: false, error: "Skill not found" });
      if (!isCommunicationSkill(course)) {
        return res.status(400).json({ ok: false, error: "Communication tasks are allowed only for communication skills" });
      }
      if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
        return res.status(403).json({ ok: false, error: "You cannot modify this skill" });
      }

      const id = randomUUID();
      db.communicationTasks.push({
        id,
        skillId: String(skillId).trim(),
        dayNumber: Math.max(1, Number(dayNumber || 1)),
        practiceType: normalizePracticeType(practiceType),
        description: String(description || "").trim(),
        referenceLink: String(referenceLink || "").trim(),
        instructions: String(instructions || "").trim(),
        evaluationMarks: Math.max(0, Number(evaluationMarks || 0)),
        createdBy: {
          id: req.admin?.id || req.user?.uid || "",
          email: req.admin?.email || req.user?.email || "",
        },
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      writeLocalAdminDb(db);
      return res.status(201).json({ ok: true, id, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("createCommunicationTask fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to create communication task" });
    }
  }
}

export async function updateCommunicationTask(req, res) {
  try {
    const { taskId } = req.params;
    if (!taskId) return res.status(400).json({ ok: false, error: "taskId is required" });

    const taskSnap = await firestore.collection(COMMUNICATION_TASKS).doc(taskId).get();
    if (!taskSnap.exists) return res.status(404).json({ ok: false, error: "Task not found" });
    const task = { id: taskSnap.id, ...(taskSnap.data() || {}) };

    const courseSnap = await firestore.collection(COURSES).doc(String(task.skillId || "")).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Skill not found" });
    const course = { id: courseSnap.id, ...(courseSnap.data() || {}) };
    if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
      return res.status(403).json({ ok: false, error: "You cannot modify this task" });
    }

    const patch = {
      dayNumber: req.body?.dayNumber === undefined ? task.dayNumber : Math.max(1, Number(req.body.dayNumber || 1)),
      practiceType: req.body?.practiceType === undefined ? task.practiceType : normalizePracticeType(req.body.practiceType),
      description: req.body?.description === undefined ? task.description : String(req.body.description || "").trim(),
      referenceLink: req.body?.referenceLink === undefined ? task.referenceLink : String(req.body.referenceLink || "").trim(),
      instructions: req.body?.instructions === undefined ? task.instructions : String(req.body.instructions || "").trim(),
      evaluationMarks:
        req.body?.evaluationMarks === undefined
          ? Number(task.evaluationMarks || 0)
          : Math.max(0, Number(req.body.evaluationMarks || 0)),
      updatedAt: nowIso(),
    };

    await firestore.collection(COMMUNICATION_TASKS).doc(taskId).set(patch, { merge: true });
    return res.json({ ok: true });
  } catch (err) {
    console.warn("updateCommunicationTask firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { taskId } = req.params;
      if (!taskId) return res.status(400).json({ ok: false, error: "taskId is required" });
      const db = readLocalAdminDb();
      const idx = (db.communicationTasks || []).findIndex((row) => row.id === taskId);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Task not found" });
      const task = db.communicationTasks[idx];
      const course = (db.courses || []).find((row) => row.id === String(task.skillId || ""));
      if (!course) return res.status(404).json({ ok: false, error: "Skill not found" });
      if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
        return res.status(403).json({ ok: false, error: "You cannot modify this task" });
      }
      db.communicationTasks[idx] = {
        ...task,
        dayNumber: req.body?.dayNumber === undefined ? task.dayNumber : Math.max(1, Number(req.body.dayNumber || 1)),
        practiceType: req.body?.practiceType === undefined ? task.practiceType : normalizePracticeType(req.body.practiceType),
        description: req.body?.description === undefined ? task.description : String(req.body.description || "").trim(),
        referenceLink: req.body?.referenceLink === undefined ? task.referenceLink : String(req.body.referenceLink || "").trim(),
        instructions: req.body?.instructions === undefined ? task.instructions : String(req.body.instructions || "").trim(),
        evaluationMarks:
          req.body?.evaluationMarks === undefined
            ? Number(task.evaluationMarks || 0)
            : Math.max(0, Number(req.body.evaluationMarks || 0)),
        updatedAt: nowIso(),
      };
      writeLocalAdminDb(db);
      return res.json({ ok: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("updateCommunicationTask fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to update communication task" });
    }
  }
}

export async function listCommunicationSubmissions(req, res) {
  try {
    const skillId = String(req.query?.skillId || "").trim();
    if (!skillId) return res.status(400).json({ ok: false, error: "skillId is required" });
    const statusFilter = String(req.query?.status || "all").trim().toLowerCase();
    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 10, 1), 100);

    const courseSnap = await firestore.collection(COURSES).doc(skillId).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Skill not found" });
    const course = { id: courseSnap.id, ...(courseSnap.data() || {}) };
    if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
      return res.status(403).json({ ok: false, error: "You cannot access this skill" });
    }

    const [submissionsSnap, usersSnap] = await Promise.all([
      firestore.collection(STUDENT_SUBMISSIONS).where("skillId", "==", skillId).get(),
      firestore.collection(USERS).where("role", "==", "student").get(),
    ]);

    const userById = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() || {}) }]));
    let items = submissionsSnap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
    if (statusFilter !== "all") {
      items = items.filter((row) => String(row.status || "submitted").toLowerCase() === statusFilter);
    }

    items.sort((a, b) => toEpoch(b.submittedAt || b.updatedAt || b.createdAt) - toEpoch(a.submittedAt || a.updatedAt || a.createdAt));
    const total = items.length;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize).map((row) => {
      const studentId = String(row.studentId || row.userId || "");
      const user = userById.get(studentId) || {};
      return {
        ...row,
        studentId,
        studentName: user.name || "",
        studentEmail: user.email || "",
      };
    });

    return res.json({ ok: true, items: pageItems, total, page, pageSize, hasMore: start + pageSize < total });
  } catch (err) {
    console.warn("listCommunicationSubmissions firestore unavailable, using local fallback:", err?.message || err);
    try {
      const skillId = String(req.query?.skillId || "").trim();
      if (!skillId) return res.status(400).json({ ok: false, error: "skillId is required" });
      const statusFilter = String(req.query?.status || "all").trim().toLowerCase();
      const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 10, 1), 100);
      const db = readLocalAdminDb();
      const course = (db.courses || []).find((row) => row.id === skillId);
      if (!course) return res.status(404).json({ ok: false, error: "Skill not found" });
      if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
        return res.status(403).json({ ok: false, error: "You cannot access this skill" });
      }

      const profiles = new Map(readLocalStudentProfiles().map((u) => [u.id, u]));
      let items = (db.studentSubmissions || []).filter((row) => String(row.skillId || row.courseId || "") === skillId);
      if (statusFilter !== "all") {
        items = items.filter((row) => String(row.status || "submitted").toLowerCase() === statusFilter);
      }
      items.sort((a, b) => toEpoch(b.submittedAt || b.updatedAt || b.createdAt) - toEpoch(a.submittedAt || a.updatedAt || a.createdAt));

      const total = items.length;
      const start = (page - 1) * pageSize;
      const pageItems = items.slice(start, start + pageSize).map((row) => {
        const studentId = String(row.studentId || row.userId || "");
        const user = profiles.get(studentId) || {};
        return {
          ...row,
          studentId,
          studentName: user.name || "",
          studentEmail: user.email || "",
        };
      });

      return res.json({ ok: true, items: pageItems, total, page, pageSize, hasMore: start + pageSize < total, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listCommunicationSubmissions fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list communication submissions" });
    }
  }
}

export async function reviewCommunicationSubmission(req, res) {
  try {
    const { submissionId } = req.params;
    if (!submissionId) return res.status(400).json({ ok: false, error: "submissionId is required" });

    const snap = await firestore.collection(STUDENT_SUBMISSIONS).doc(submissionId).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "Submission not found" });
    const row = { id: snap.id, ...(snap.data() || {}) };

    const skillId = String(row.skillId || row.courseId || "");
    const courseSnap = await firestore.collection(COURSES).doc(skillId).get();
    if (!courseSnap.exists) return res.status(404).json({ ok: false, error: "Skill not found" });
    const course = { id: courseSnap.id, ...(courseSnap.data() || {}) };
    if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
      return res.status(403).json({ ok: false, error: "You cannot review this submission" });
    }

    const status = String(req.body?.status || "reviewed").trim().toLowerCase();
    const patch = {
      status,
      marks: Math.max(0, Number(req.body?.marks ?? row.marks ?? 0)),
      feedback: String(req.body?.feedback || "").trim(),
      reviewedAt: nowIso(),
      reviewedBy: {
        id: req.admin?.id || req.user?.uid || "",
        email: req.admin?.email || req.user?.email || "",
      },
      updatedAt: nowIso(),
    };

    await firestore.collection(STUDENT_SUBMISSIONS).doc(submissionId).set(patch, { merge: true });
    return res.json({ ok: true });
  } catch (err) {
    console.warn("reviewCommunicationSubmission firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { submissionId } = req.params;
      if (!submissionId) return res.status(400).json({ ok: false, error: "submissionId is required" });
      const db = readLocalAdminDb();
      const idx = (db.studentSubmissions || []).findIndex((row) => row.id === submissionId);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Submission not found" });
      const row = db.studentSubmissions[idx];
      const course = (db.courses || []).find((item) => item.id === String(row.skillId || row.courseId || ""));
      if (!course) return res.status(404).json({ ok: false, error: "Skill not found" });
      if (!canSubAdminAccessCourse(course, req.admin || req.user || {})) {
        return res.status(403).json({ ok: false, error: "You cannot review this submission" });
      }

      db.studentSubmissions[idx] = {
        ...row,
        status: String(req.body?.status || "reviewed").trim().toLowerCase(),
        marks: Math.max(0, Number(req.body?.marks ?? row.marks ?? 0)),
        feedback: String(req.body?.feedback || "").trim(),
        reviewedAt: nowIso(),
        reviewedBy: {
          id: req.admin?.id || req.user?.uid || "",
          email: req.admin?.email || req.user?.email || "",
        },
        updatedAt: nowIso(),
      };
      writeLocalAdminDb(db);
      return res.json({ ok: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("reviewCommunicationSubmission fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to review submission" });
    }
  }
}

export async function listUsers(req, res) {
  try {
    const search = normalizeEmail(req.query.search || "");
    const requestedRole = normalizeRole(req.query.role || "student");
    const actorRole = normalizeRole(req.admin?.role || req.user?.role || "");
    const effectiveRole = actorRole === "sub_admin" ? "student" : requestedRole;
    const status = String(req.query.status || "all").trim().toLowerCase();
    const department = String(req.query.department || "").trim().toLowerCase();
    const batch = String(req.query.batch || "").trim();
    const year = String(req.query.year || "").trim();
    const fieldsRaw = String(req.query.fields || "").trim();
    const fields = fieldsRaw ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean) : [];
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 200);

    let allUsersSnap;
    try {
      let ref = firestore.collection(USERS);
      if (effectiveRole !== "all") {
        ref = ref.where("role", "==", effectiveRole);
      }
      if (status === "active" || status === "enabled") {
        ref = ref.where("enabled", "==", true);
      } else if (status === "inactive" || status === "disabled") {
        ref = ref.where("enabled", "==", false);
      }
      if (batch) {
        ref = ref.where("batch", "==", batch);
      }
      if (year) {
        ref = ref.where("year", "==", year);
      }
      if (department) {
        if (department.length <= 3) {
          ref = ref.where("departmentCode", "==", department);
        } else {
          ref = ref.where("department", "==", department.toUpperCase());
        }
      }
      allUsersSnap = await ref.get();
    } catch {
      // Fall back to broad scan when a composite index is not yet available.
      allUsersSnap = await firestore.collection(USERS).get();
    }

    let items = allUsersSnap.docs
      .map((d) => enrichUserAcademicMeta({ id: d.id, ...d.data() }))
      .filter((u) => isInstitutionEmail(u.email || ""));

    const localItems = readLocalStudentProfiles()
      .map((u) => enrichUserAcademicMeta({ ...u, role: normalizeRole(u.role || "student") || "student" }))
      .filter((u) => isInstitutionEmail(u.email || ""));

    items = dedupeUsersByEmail([...items, ...localItems]);

    if (effectiveRole !== "all") {
      items = items.filter((u) => normalizeRole(u.role || "student") === effectiveRole);
    }

    if (status === "active" || status === "enabled") {
      items = items.filter((u) => u.enabled !== false);
    } else if (status === "inactive" || status === "disabled") {
      items = items.filter((u) => u.enabled === false);
    }

    if (department) {
      items = items.filter((u) => {
        const fullDept = String(u.department || u.course || "").toLowerCase();
        const code = String(u.departmentCode || "").toLowerCase();
        return fullDept === department || code === department;
      });
    }
    if (batch) {
      items = items.filter((u) => String(u.batch || "") === batch);
    }
    if (year) {
      items = items.filter((u) => String(u.year || "") === year);
    }

    if (search) {
      items = items.filter((u) => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(search));
    }
    items = dedupeUsersByEmail(items);
    const safeItems = items.map(({ password, ...safe }) => safe);
    const projectedItems = fields.length
      ? safeItems.map((item) => {
          const projected = { id: item.id };
          fields.forEach((field) => {
            if (field in item) projected[field] = item[field];
          });
          return projected;
        })
      : safeItems;

    const total = projectedItems.length;
    const start = (page - 1) * pageSize;
    const paginatedItems = projectedItems.slice(start, start + pageSize);
    return res.json({ ok: true, items: paginatedItems, page, pageSize, total, hasMore: start + pageSize < total });
  } catch (err) {
    console.warn("listUsers firestore unavailable, using local fallback:", err?.message || err);
    const search = normalizeEmail(req.query.search || "");
    const requestedRole = normalizeRole(req.query.role || "student");
    const actorRole = normalizeRole(req.admin?.role || req.user?.role || "");
    const effectiveRole = actorRole === "sub_admin" ? "student" : requestedRole;
    const status = String(req.query.status || "all").trim().toLowerCase();
    const department = String(req.query.department || "").trim().toLowerCase();
    const batch = String(req.query.batch || "").trim();
    const year = String(req.query.year || "").trim();
    const fieldsRaw = String(req.query.fields || "").trim();
    const fields = fieldsRaw ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean) : [];
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query.pageSize, 10) || 10, 1), 200);

    let items = readLocalStudentProfiles().map((u) => enrichUserAcademicMeta({ ...u, role: normalizeRole(u.role || "student") || "student" }));
    if (effectiveRole !== "all") {
      items = items.filter((u) => normalizeRole(u.role || "student") === effectiveRole);
    }
    items = items.filter((u) => isInstitutionEmail(u.email || ""));

    if (status === "active" || status === "enabled") {
      items = items.filter((u) => u.enabled !== false);
    } else if (status === "inactive" || status === "disabled") {
      items = items.filter((u) => u.enabled === false);
    }

    if (department) {
      items = items.filter((u) => {
        const fullDept = String(u.department || u.course || "").toLowerCase();
        const code = String(u.departmentCode || "").toLowerCase();
        return fullDept === department || code === department;
      });
    }
    if (batch) {
      items = items.filter((u) => String(u.batch || "") === batch);
    }
    if (year) {
      items = items.filter((u) => String(u.year || "") === year);
    }

    if (search) {
      items = items.filter((u) => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(search));
    }
    items = dedupeUsersByEmail(items);

    const projectedItems = fields.length
      ? items.map((item) => {
          const projected = { id: item.id };
          fields.forEach((field) => {
            if (field in item) projected[field] = item[field];
          });
          return projected;
        })
      : items;

    const total = projectedItems.length;
    const start = (page - 1) * pageSize;
    const paginatedItems = projectedItems.slice(start, start + pageSize);

    return res.json({ ok: true, items: paginatedItems, page, pageSize, total, hasMore: start + pageSize < total, source: "local-fallback" });
  }
}

export async function updateUserRole(req, res) {
  try {
    const { userId } = req.params;
    const role = normalizeRole(req.body?.role || "");
    if (!["student", "main_admin", "sub_admin"].includes(role)) {
      return res.status(400).json({ ok: false, error: "Valid role is required" });
    }
    await firestore.collection(USERS).doc(userId).set({ role, updatedAt: nowIso() }, { merge: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error("updateUserRole error", err);
    return res.status(500).json({ ok: false, error: "Failed to update role" });
  }
}

export async function getUserProfileById(req, res) {
  try {
    const { userId } = req.params;
    const snap = await firestore.collection(USERS).doc(userId).get();
    if (!snap.exists) return res.status(404).json({ ok: false, error: "User not found" });
    const data = snap.data() || {};
    return res.json({ ok: true, item: { id: snap.id, ...data, password: undefined } });
  } catch (err) {
    console.error("getUserProfileById error", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch user" });
  }
}

export async function deleteUser(req, res) {
  try {
    const { userId } = req.params;
    await firestore.collection(USERS).doc(userId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteUser error", err);
    return res.status(500).json({ ok: false, error: "Failed to delete user" });
  }
}

export async function updateUserStatus(req, res) {
  try {
    const { userId } = req.params;
    const { enabled } = req.body || {};
    await firestore.collection(USERS).doc(userId).set({ enabled: Boolean(enabled), updatedAt: nowIso() }, { merge: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error("updateUserStatus error", err);
    return res.status(500).json({ ok: false, error: "Failed to update user" });
  }
}

export async function resetStudentPassword(req, res) {
  try {
    const { userId } = req.params;
    const { password } = req.body || {};
    if (!String(password || "").trim()) return res.status(400).json({ ok: false, error: "password is required" });
    await firestore.collection(USERS).doc(userId).set({ password: String(password).trim(), updatedAt: nowIso() }, { merge: true });
    return res.json({ ok: true });
  } catch (err) {
    console.error("resetStudentPassword error", err);
    return res.status(500).json({ ok: false, error: "Failed to reset password" });
  }
}

export async function getStudentProgress(req, res) {
  try {
    const { userId } = req.params;
    const userCoursesSnap = await firestore.collection(USER_COURSES).where("user_id", "==", userId).get();
    const quizSnap = await firestore.collection(QUIZ_RESULTS).where("user_id", "==", userId).get();

    const completedCourses = [];
    const assignedCourses = [];
    userCoursesSnap.forEach((d) => {
      const data = d.data();
      assignedCourses.push(data);
      if (data.status === "completed") completedCourses.push(data);
    });

    const quizResults = quizSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    return res.json({ ok: true, item: { completedCourses, assignedCourses, quizResults } });
  } catch (err) {
    console.error("getStudentProgress error", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch student progress" });
  }
}

export async function markAttendance(req, res) {
  try {
    const { user_id, course_id, date, status } = req.body || {};
    if (!user_id || !course_id || !date || !status) {
      return res.status(400).json({ ok: false, error: "user_id, course_id, date, status are required" });
    }
    const allocation = await userCourseDoc(user_id, course_id).get();
    if (!allocation.exists) {
      return res.status(400).json({ ok: false, error: "Student is not allocated to this course" });
    }

    const duplicateKey = `${user_id}_${course_id}_${date}`;
    const ref = firestore.collection(ATTENDANCE).doc(duplicateKey);
    await ref.set({
      user_id,
      course_id,
      date,
      status: normalizeAttendanceStatus(status),
      markedAt: nowIso(),
    }, { merge: true });
    cacheInvalidateByPrefix(["dashboard::", "reports::"]);
    return res.status(201).json({ ok: true, id: ref.id, deduped: true });
  } catch (err) {
    console.warn("markAttendance firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { user_id, course_id, date, status } = req.body || {};
      if (!user_id || !course_id || !date || !status) {
        return res.status(400).json({ ok: false, error: "user_id, course_id, date, status are required" });
      }
      const db = readLocalStudentDb();
      const bucket = getLocalStudentBucket(db, user_id);
      ensureLocalDailyAttendanceForBucket(bucket, user_id, date, course_id);
      const hasAllocation = (bucket.courses || []).some((c) => (c.course_id || c.id) === course_id);
      if (!hasAllocation) return res.status(400).json({ ok: false, error: "Student is not allocated to this course" });
      upsertLocalAttendance(bucket, { user_id, course_id, date, status: normalizeAttendanceStatus(status), markedAt: nowIso() });
      writeLocalStudentDb(db);
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.status(201).json({ ok: true, id: attendanceDocId(user_id, course_id, date), deduped: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("markAttendance fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to mark attendance" });
    }
  }
}

export async function markBulkAttendance(req, res) {
  try {
    const { course_id, date, entries = [] } = req.body || {};
    if (!course_id || !date || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ ok: false, error: "course_id, date and entries are required" });
    }

    const validAllocations = new Set();
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry?.user_id) return;
        const allocSnap = await userCourseDoc(entry.user_id, course_id).get();
        if (allocSnap.exists) validAllocations.add(entry.user_id);
      })
    );

    const batch = firestore.batch();
    let saved = 0;
    entries.forEach((entry) => {
      if (!entry?.user_id || !validAllocations.has(entry.user_id)) return;
      const key = `${entry.user_id}_${course_id}_${date}`;
      const ref = firestore.collection(ATTENDANCE).doc(key);
      batch.set(ref, {
        user_id: entry.user_id,
        course_id,
        date,
        status: entry.status === "present" ? "present" : "absent",
        markedAt: nowIso(),
      }, { merge: true });
      saved += 1;
    });

    await batch.commit();
    cacheInvalidateByPrefix(["dashboard::", "reports::"]);
    return res.status(201).json({ ok: true, saved, skipped: entries.length - saved, deduped: true });
  } catch (err) {
    console.warn("markBulkAttendance firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { course_id, date, entries = [] } = req.body || {};
      if (!course_id || !date || !Array.isArray(entries) || !entries.length) {
        return res.status(400).json({ ok: false, error: "course_id, date and entries are required" });
      }
      const db = readLocalStudentDb();
      let saved = 0;
      entries.forEach((entry) => {
        if (!entry?.user_id) return;
        const bucket = getLocalStudentBucket(db, entry.user_id);
        ensureLocalDailyAttendanceForBucket(bucket, entry.user_id, date, course_id);
        const hasAllocation = (bucket.courses || []).some((c) => (c.course_id || c.id) === course_id);
        if (!hasAllocation) return;
        upsertLocalAttendance(bucket, {
          user_id: entry.user_id,
          course_id,
          date,
          status: normalizeAttendanceStatus(entry.status),
          markedAt: nowIso(),
        });
        saved += 1;
      });
      writeLocalStudentDb(db);
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.status(201).json({ ok: true, saved, skipped: entries.length - saved, deduped: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("markBulkAttendance fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to mark bulk attendance" });
    }
  }
}

export async function listAttendance(req, res) {
  try {
    const { courseId, date, userId } = req.query || {};
    const fieldsRaw = String(req.query?.fields || "").trim();
    const fields = fieldsRaw ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean) : [];
    const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
    const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 10, 1), 100);
    let ref = firestore.collection(ATTENDANCE);
    if (courseId) ref = ref.where("course_id", "==", courseId);
    if (date) ref = ref.where("date", "==", date);
    if (userId) ref = ref.where("user_id", "==", userId);
    const [snap, usersSnap, coursesSnap] = await Promise.all([
      ref.get(),
      firestore.collection(USERS).get(),
      firestore.collection(COURSES).get(),
    ]);

    const userById = new Map(
      usersSnap.docs.map((d) => [d.id, enrichUserAcademicMeta({ id: d.id, ...(d.data() || {}) })])
    );
    const courseById = new Map(coursesSnap.docs.map((d) => [d.id, { id: d.id, ...(d.data() || {}) }]));

    const items = snap.docs.map((d) => {
      const row = { id: d.id, ...d.data() };
      const user = userById.get(String(row.user_id || "")) || {};
      const course = courseById.get(String(row.course_id || "")) || {};
      return {
        ...row,
        userName: user.name || "",
        userEmail: user.email || "",
        userDepartment: user.department || user.departmentCode || "",
        userBatch: user.batch || "",
        courseTitle: course.title || course.course_name || "",
      };
    });

    items.sort((a, b) => toEpoch(b.date || b.markedAt) - toEpoch(a.date || a.markedAt));

    const total = items.length;
    const start = (page - 1) * pageSize;
    const pageItems = items.slice(start, start + pageSize);
    const projectedItems = fields.length
      ? pageItems.map((item) => {
          const projected = { id: item.id };
          fields.forEach((field) => {
            if (field in item) projected[field] = item[field];
          });
          return projected;
        })
      : pageItems;

    return res.json({ ok: true, items: projectedItems, page, pageSize, total, hasMore: start + pageSize < total });
  } catch (err) {
    console.warn("listAttendance firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { courseId, date, userId } = req.query || {};
      const fieldsRaw = String(req.query?.fields || "").trim();
      const fields = fieldsRaw ? fieldsRaw.split(",").map((f) => f.trim()).filter(Boolean) : [];
      const page = Math.max(parseInt(req.query?.page, 10) || 1, 1);
      const pageSize = Math.min(Math.max(parseInt(req.query?.pageSize, 10) || 10, 1), 100);
      const db = readLocalStudentDb();
      const students = new Map(readLocalStudentProfiles().map((u) => [u.id, enrichUserAcademicMeta(u)]));
      const adminDb = readLocalAdminDb();
      const courseById = new Map((adminDb.courses || []).map((c) => [c.id, c]));
      const items = [];
      Object.entries(db.users || {}).forEach(([uid, entry]) => {
        if (userId && uid !== userId) return;
        const bucket = getLocalStudentBucket(db, uid, entry?.profile?.email || "");
        (bucket.attendance || []).forEach((row) => {
          const cid = row.course_id || row.courseId;
          if (courseId && cid !== courseId) return;
          if (date && row.date !== date) return;
          const student = students.get(uid) || {};
          const course = courseById.get(cid) || {};
          items.push({
            id: row.id || attendanceDocId(uid, cid, row.date),
            user_id: uid,
            course_id: cid,
            date: row.date,
            status: normalizeAttendanceStatus(row.status),
            markedAt: row.markedAt || nowIso(),
            userName: student.name || "",
            userEmail: student.email || entry?.profile?.email || "",
            userDepartment: student.department || student.departmentCode || "",
            userBatch: student.batch || "",
            courseTitle: course.title || course.course_name || "",
          });
        });
      });
      writeLocalStudentDb(db);

      items.sort((a, b) => toEpoch(b.date || b.markedAt) - toEpoch(a.date || a.markedAt));

      const total = items.length;
      const start = (page - 1) * pageSize;
      const pageItems = items.slice(start, start + pageSize);
      const projectedItems = fields.length
        ? pageItems.map((item) => {
            const projected = { id: item.id };
            fields.forEach((field) => {
              if (field in item) projected[field] = item[field];
            });
            return projected;
          })
        : pageItems;

      return res.json({ ok: true, items: projectedItems, page, pageSize, total, hasMore: start + pageSize < total, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listAttendance fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list attendance" });
    }
  }
}

export async function getReports(req, res) {
  try {
    const roleKey = normalizeRole(req.admin?.role || req.user?.role || "main_admin");
    const cacheKey = `reports::${roleKey}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ ...cached, meta: { ...(cached.meta || {}), cached: true } });
    }

    const [usersSnap, coursesSnap, userCoursesSnap] = await Promise.all([
      firestore.collection(USERS).where("role", "==", "student").get(),
      firestore.collection(COURSES).get(),
      firestore.collection(USER_COURSES).get(),
    ]);

    const users = dedupeUsersByEmail(
      usersSnap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((u) => isInstitutionEmail(u.email || ""))
    );
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.enabled !== false).length;
    const totalCourses = coursesSnap.size;
    const completedCourseCount = userCoursesSnap.docs.filter((d) => (d.data() || {}).status === "completed").length;

    const payload = {
      ok: true,
      item: {
        totalUsers,
        activeUsers,
        totalCourses,
        completedCourseCount,
        performanceSummary: {
          completionRate: totalUsers ? Math.round((completedCourseCount / totalUsers) * 100) : 0,
        },
      },
      meta: {
        cached: false,
      },
    };

    cacheSet(cacheKey, payload, REPORTS_CACHE_TTL_MS);
    return res.json(payload);
  } catch (err) {
    console.error("getReports error", err);
    return res.status(500).json({ ok: false, error: "Failed to generate reports" });
  }
}

export async function getDailyProgress(req, res) {
  try {
    const { courseId = "", date = "" } = req.query || {};

    let userCourseRef = firestore.collection(USER_COURSES);
    if (courseId) userCourseRef = userCourseRef.where("course_id", "==", courseId);

    let attendanceRef = firestore.collection(ATTENDANCE);
    if (courseId) attendanceRef = attendanceRef.where("course_id", "==", courseId);
    if (date) attendanceRef = attendanceRef.where("date", "==", date);

    const [usersSnap, userCoursesSnap, attendanceSnap] = await Promise.all([
      firestore.collection(USERS).get(),
      userCourseRef.get(),
      attendanceRef.get(),
    ]);

    const userMap = new Map(usersSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() }]));
    const attendanceMap = new Map();
    attendanceSnap.forEach((docSnap) => {
      const data = docSnap.data() || {};
      const key = `${data.user_id}__${data.course_id}`;
      attendanceMap.set(key, data.status || "absent");
    });

    const items = userCoursesSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((uc) => userMap.has(uc.user_id))
      .map((uc) => {
        const user = userMap.get(uc.user_id) || {};
        const rawStatus = String(uc.status || "assigned").toLowerCase();
        const attendanceStatus = attendanceMap.get(`${uc.user_id}__${uc.course_id}`) || "absent";

        let status = "Incomplete";
        let progressPercent = 0;

        if (rawStatus === "completed") {
          status = "Completed";
          progressPercent = 100;
        } else if (rawStatus === "in_progress" || rawStatus === "in progress") {
          status = "In Progress";
          progressPercent = 40;
        } else if (attendanceStatus === "present") {
          status = "In Progress";
          progressPercent = 20;
        }

        return {
          userId: uc.user_id,
          userEmail: user.email || "",
          userName: user.name || "",
          courseId: uc.course_id,
          status,
          progressPercent,
          attendanceStatus,
        };
      });

    return res.json({ ok: true, items });
  } catch (err) {
    console.error("getDailyProgress error", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch daily progress" });
  }
}

export async function sendNotification(req, res) {
  try {
    const { title, message, audience = "all" } = req.body || {};
    if (!title?.trim() || !message?.trim()) {
      return res.status(400).json({ ok: false, error: "title and message are required" });
    }
    const ref = await firestore.collection(NOTIFICATIONS).add({
      title: title.trim(),
      message: message.trim(),
      audience,
      createdAt: nowIso(),
    });
    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("sendNotification error", err);
    return res.status(500).json({ ok: false, error: "Failed to send notification" });
  }
}

export async function listAssignments(_req, res) {
  try {
    const snap = await firestore.collection(ASSIGNMENTS).orderBy("createdAt", "desc").get();
    return res.json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.warn("listAssignments firestore unavailable, using local fallback:", err?.message || err);
    try {
      const db = readLocalAdminDb();
      const items = [...(db.assessments || [])].sort((a, b) => toEpoch(b.createdAt) - toEpoch(a.createdAt));
      return res.json({ ok: true, items, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listAssignments fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list assessments" });
    }
  }
}

export async function createAssignment(req, res) {
  try {
    const normalized = normalizeAssessmentPayload(req.body || {});
    if (!normalized.title) return res.status(400).json({ ok: false, error: "title is required" });
    if (!normalized.courseId) return res.status(400).json({ ok: false, error: "courseId is required" });
    if (!normalized.openDate || !normalized.dueDate || normalized.openDate > normalized.dueDate) {
      return res.status(400).json({ ok: false, error: "Valid start and end date are required" });
    }
    if (normalized.passingMarks > normalized.totalMarks) {
      return res.status(400).json({ ok: false, error: "passingMarks cannot exceed totalMarks" });
    }

    const ref = await firestore.collection(ASSIGNMENTS).add({
      ...normalized,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.warn("createAssignment firestore unavailable, using local fallback:", err?.message || err);
    try {
      const normalized = normalizeAssessmentPayload(req.body || {});
      if (!normalized.title) return res.status(400).json({ ok: false, error: "title is required" });
      if (!normalized.courseId) return res.status(400).json({ ok: false, error: "courseId is required" });
      if (!normalized.openDate || !normalized.dueDate || normalized.openDate > normalized.dueDate) {
        return res.status(400).json({ ok: false, error: "Valid start and end date are required" });
      }
      if (normalized.passingMarks > normalized.totalMarks) {
        return res.status(400).json({ ok: false, error: "passingMarks cannot exceed totalMarks" });
      }

      const db = readLocalAdminDb();
      const id = randomUUID();
      db.assessments.push({
        id,
        ...normalized,
        createdAt: nowIso(),
        updatedAt: nowIso(),
      });
      writeLocalAdminDb(db);
      return res.status(201).json({ ok: true, id, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("createAssignment fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to create assessment" });
    }
  }
}

export async function updateAssignment(req, res) {
  try {
    const assignmentId = req.params.assignmentId || req.params.assessmentId;
    const payload = normalizeAssessmentPayload(req.body || {});
    await assignmentDoc(assignmentId).set(
      {
        ...payload,
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.warn("updateAssignment firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { assignmentId } = req.params;
      const payload = normalizeAssessmentPayload(req.body || {});
      const db = readLocalAdminDb();
      const idx = db.assessments.findIndex((a) => a.id === assignmentId);
      if (idx === -1) return res.status(404).json({ ok: false, error: "Assessment not found" });
      db.assessments[idx] = { ...db.assessments[idx], ...payload, updatedAt: nowIso() };
      writeLocalAdminDb(db);
      return res.json({ ok: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("updateAssignment fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to update assessment" });
    }
  }
}

export async function deleteAssignment(req, res) {
  try {
    const assignmentId = req.params.assignmentId || req.params.assessmentId;
    await assignmentDoc(assignmentId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.warn("deleteAssignment firestore unavailable, using local fallback:", err?.message || err);
    try {
      const db = readLocalAdminDb();
      const before = db.assessments.length;
      const assignmentId = req.params.assignmentId || req.params.assessmentId;
      db.assessments = (db.assessments || []).filter((a) => a.id !== assignmentId);
      db.submissions = (db.submissions || []).filter((s) => s.assignmentId !== assignmentId);
      db.assessmentResults = (db.assessmentResults || []).filter((s) => s.assignmentId !== assignmentId);
      writeLocalAdminDb(db);
      if (db.assessments.length === before) return res.status(404).json({ ok: false, error: "Assessment not found" });
      return res.json({ ok: true, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("deleteAssignment fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to delete assessment" });
    }
  }
}

export async function listAssignmentSubmissions(req, res) {
  try {
    const { assignmentId } = req.query || {};
    let q = firestore.collection(ASSIGNMENT_SUBMISSIONS);
    if (assignmentId) q = q.where("assignmentId", "==", assignmentId);
    const snap = await q.get();
    return res.json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.warn("listAssignmentSubmissions firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { assignmentId } = req.query || {};
      const db = readLocalAdminDb();
      const items = (db.submissions || []).filter((row) => (!assignmentId ? true : row.assignmentId === assignmentId));
      return res.json({ ok: true, items, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listAssignmentSubmissions fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list submissions" });
    }
  }
}

export async function submitAssignment(req, res) {
  try {
    const { assignmentId, userId, submittedAt = nowIso() } = req.body || {};
    if (!assignmentId || !userId) return res.status(400).json({ ok: false, error: "assignmentId and userId required" });

    const existing = await firestore.collection(ASSIGNMENT_SUBMISSIONS)
      .where("assignmentId", "==", assignmentId)
      .where("userId", "==", userId)
      .limit(1)
      .get();
    if (!existing.empty) {
      return res.status(409).json({ ok: false, error: "Assessment already attempted" });
    }

    const assessmentSnap = await assignmentDoc(assignmentId).get();
    if (!assessmentSnap.exists) return res.status(404).json({ ok: false, error: "Assessment not found" });
    const assessment = { id: assessmentSnap.id, ...(assessmentSnap.data() || {}) };

    const evaluation = evaluateAssessmentAttempt({ assessment, payload: req.body || {} });
    const attendanceStatus = await markAttendanceOnAttemptFirestore({
      userId,
      courseId: assessment.courseId || "",
      dueDate: assessment.dueDate || "",
    });

    const submissionPayload = {
      assignmentId,
      userId,
      status: evaluation.passed ? "pass" : "fail",
      marks: evaluation.score,
      totalMarks: evaluation.maxScore,
      passedCases: evaluation.passedCases,
      totalCases: evaluation.totalCases,
      executionMs: evaluation.executionMs,
      attendanceStatus,
      submittedAt,
      createdAt: nowIso(),
      details: evaluation.details || [],
      language: req.body?.programmingLanguage || assessment.programmingLanguage || "",
    };

    const ref = await firestore.collection(ASSIGNMENT_SUBMISSIONS).add(submissionPayload);
    await firestore.collection(ASSESSMENT_RESULTS).add({
      ...submissionPayload,
      assessmentTitle: assessment.title || "",
      courseId: assessment.courseId || "",
      passingMarks: Number(assessment.passingMarks || 0) || 0,
    });
    cacheInvalidateByPrefix(["dashboard::", "reports::"]);
    return res.status(201).json({ ok: true, id: ref.id, item: submissionPayload });
  } catch (err) {
    console.warn("submitAssignment firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { assignmentId, userId, submittedAt = nowIso() } = req.body || {};
      if (!assignmentId || !userId) return res.status(400).json({ ok: false, error: "assignmentId and userId required" });
      const db = readLocalAdminDb();
      const already = (db.submissions || []).some((s) => s.assignmentId === assignmentId && s.userId === userId);
      if (already) return res.status(409).json({ ok: false, error: "Assessment already attempted" });
      const assessment = (db.assessments || []).find((a) => a.id === assignmentId);
      if (!assessment) return res.status(404).json({ ok: false, error: "Assessment not found" });

      const evaluation = evaluateAssessmentAttempt({ assessment, payload: req.body || {} });
      const attendanceStatus = (() => {
        const today = todayDateKey();
        return assessment.dueDate && today > toDateKey(assessment.dueDate) ? "partial" : "present";
      })();

      const item = {
        id: randomUUID(),
        assignmentId,
        userId,
        status: evaluation.passed ? "pass" : "fail",
        marks: evaluation.score,
        totalMarks: evaluation.maxScore,
        passedCases: evaluation.passedCases,
        totalCases: evaluation.totalCases,
        executionMs: evaluation.executionMs,
        attendanceStatus,
        submittedAt,
        createdAt: nowIso(),
        details: evaluation.details || [],
        language: req.body?.programmingLanguage || assessment.programmingLanguage || "",
      };
      db.submissions.push(item);
      db.assessmentResults.push({
        ...item,
        assessmentTitle: assessment.title || "",
        courseId: assessment.courseId || "",
        passingMarks: Number(assessment.passingMarks || 0) || 0,
      });
      writeLocalAdminDb(db);
      cacheInvalidateByPrefix(["dashboard::", "reports::"]);
      return res.status(201).json({ ok: true, id: item.id, item, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("submitAssignment fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to record submission" });
    }
  }
}

export async function getAssignmentProgress(req, res) {
  try {
    const { assignmentId } = req.params;
    const assignmentSnap = await firestore.collection(ASSIGNMENTS).doc(assignmentId).get();
    if (!assignmentSnap.exists) return res.status(404).json({ ok: false, error: "Assignment not found" });

    const assignment = assignmentSnap.data() || {};
    const usersSnap = await firestore.collection(USERS).get();
    const userList = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
    const studentUsers = userList.filter((u) => u.role === "student" && u.enabled !== false);
    const submissionsSnap = await firestore.collection(ASSIGNMENT_SUBMISSIONS).where("assignmentId", "==", assignmentId).get();
    const submissions = submissionsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const submittedIds = new Set(submissions.map((s) => s.userId));
    const assignedStudents =
      assignment.assignTo === "selected"
        ? studentUsers.filter((u) => Array.isArray(assignment.userIds) && assignment.userIds.includes(u.id))
        : studentUsers;

    const completed = assignedStudents.filter((u) => submittedIds.has(u.id));
    const pending = assignedStudents.filter((u) => !submittedIds.has(u.id));

    return res.json({
      ok: true,
      item: {
        assignment: { id: assignmentSnap.id, ...assignment },
        totalStudents: assignedStudents.length,
        completed: completed.length,
        pending: pending.length,
        progressPercent: assignedStudents.length ? Math.round((completed.length / assignedStudents.length) * 100) : 0,
        students: assignedStudents.map((u) => ({
          id: u.id,
          name: u.name || "",
          email: u.email || "",
          status: submittedIds.has(u.id) ? "Completed" : "Pending",
          progress: submittedIds.has(u.id) ? 100 : 0,
          submittedOn: toDateKey(submissions.find((s) => s.userId === u.id)?.submittedAt) || "-",
          marks: submissions.find((s) => s.userId === u.id)?.marks ?? null,
        })),
      },
    });
  } catch (err) {
    console.warn("getAssignmentProgress firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { assignmentId } = req.params;
      const db = readLocalAdminDb();
      const assessment = (db.assessments || []).find((a) => a.id === assignmentId);
      if (!assessment) return res.status(404).json({ ok: false, error: "Assessment not found" });
      const students = dedupeUsersByEmail(readLocalStudentProfiles().filter((u) => String(u.role || "student").toLowerCase() === "student" && u.enabled !== false));
      const submissions = (db.submissions || []).filter((s) => s.assignmentId === assignmentId);
      const submittedIds = new Set(submissions.map((s) => s.userId));
      const assignedStudents =
        assessment.assignTo === "selected"
          ? students.filter((u) => Array.isArray(assessment.userIds) && assessment.userIds.includes(u.id))
          : students;
      const completed = assignedStudents.filter((u) => submittedIds.has(u.id));
      return res.json({
        ok: true,
        item: {
          assignment: assessment,
          totalStudents: assignedStudents.length,
          completed: completed.length,
          pending: assignedStudents.length - completed.length,
          progressPercent: assignedStudents.length ? Math.round((completed.length / assignedStudents.length) * 100) : 0,
          students: assignedStudents.map((u) => {
            const sub = submissions.find((s) => s.userId === u.id);
            return {
              id: u.id,
              name: u.name || "",
              email: u.email || "",
              status: sub ? "Completed" : "Pending",
              progress: sub ? 100 : 0,
              submittedOn: toDateKey(sub?.submittedAt) || "-",
              marks: sub?.marks ?? null,
            };
          }),
        },
        source: "local-fallback",
      });
    } catch (fallbackErr) {
      console.error("getAssignmentProgress fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to fetch assessment progress" });
    }
  }
}

export const listAssessments = listAssignments;
export const createAssessment = createAssignment;
export const updateAssessment = updateAssignment;
export const deleteAssessment = deleteAssignment;

export async function listAssessmentResults(req, res) {
  try {
    const { courseId = "", studentId = "", date = "" } = req.query || {};
    let q = firestore.collection(ASSESSMENT_RESULTS);
    if (courseId) q = q.where("courseId", "==", courseId);
    if (studentId) q = q.where("userId", "==", studentId);
    const snap = await q.get();
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (date) items = items.filter((row) => toDateKey(row.submittedAt) === date);
    items.sort((a, b) => toEpoch(b.submittedAt || b.createdAt) - toEpoch(a.submittedAt || a.createdAt));
    return res.json({ ok: true, items });
  } catch (err) {
    console.warn("listAssessmentResults firestore unavailable, using local fallback:", err?.message || err);
    try {
      const { courseId = "", studentId = "", date = "" } = req.query || {};
      const db = readLocalAdminDb();
      let items = [...(db.assessmentResults || [])];
      if (courseId) items = items.filter((row) => row.courseId === courseId);
      if (studentId) items = items.filter((row) => row.userId === studentId);
      if (date) items = items.filter((row) => toDateKey(row.submittedAt) === date);
      items.sort((a, b) => toEpoch(b.submittedAt || b.createdAt) - toEpoch(a.submittedAt || a.createdAt));
      return res.json({ ok: true, items, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listAssessmentResults fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list assessment results" });
    }
  }
}

export async function listRecentAssessmentResults(_req, res) {
  try {
    const snap = await firestore.collection(ASSESSMENT_RESULTS).get();
    const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    all.sort((a, b) => toEpoch(b.submittedAt || b.createdAt) - toEpoch(a.submittedAt || a.createdAt));
    const items = all.slice(0, 5);
    const avgScore = items.length
      ? Math.round(items.reduce((sum, row) => sum + Number(row.marks || 0), 0) / items.length)
      : 0;
    return res.json({ ok: true, items, summary: { averageScore: avgScore, totalAttempts: all.length } });
  } catch (err) {
    console.warn("listRecentAssessmentResults firestore unavailable, using local fallback:", err?.message || err);
    try {
      const db = readLocalAdminDb();
      const all = [...(db.assessmentResults || [])].sort((a, b) => toEpoch(b.submittedAt || b.createdAt) - toEpoch(a.submittedAt || a.createdAt));
      const items = all.slice(0, 5);
      const avgScore = items.length
        ? Math.round(items.reduce((sum, row) => sum + Number(row.marks || 0), 0) / items.length)
        : 0;
      return res.json({ ok: true, items, summary: { averageScore: avgScore, totalAttempts: all.length }, source: "local-fallback" });
    } catch (fallbackErr) {
      console.error("listRecentAssessmentResults fallback error", fallbackErr);
      return res.status(500).json({ ok: false, error: "Failed to list recent results" });
    }
  }
}

export async function getLeaderboard(_req, res) {
  try {
    const [usersSnap, userCoursesSnap, attendanceSnap, assignmentsSnap, submissionsSnap] = await Promise.all([
      firestore.collection(USERS).where("role", "==", "student").get(),
      firestore.collection(USER_COURSES).get(),
      firestore.collection(ATTENDANCE).get(),
      firestore.collection(ASSIGNMENTS).get(),
      firestore.collection(ASSIGNMENT_SUBMISSIONS).get(),
    ]);

    const users = usersSnap.docs
      .map((d) => ({ id: d.id, ...d.data() }))
      .filter((u) => u.enabled !== false);

    const coursesByUser = new Map();
    userCoursesSnap.forEach((d) => {
      const row = d.data() || {};
      if (!row.user_id) return;
      if (!coursesByUser.has(row.user_id)) coursesByUser.set(row.user_id, []);
      coursesByUser.get(row.user_id).push(row);
    });

    const attendanceByUser = new Map();
    attendanceSnap.forEach((d) => {
      const row = d.data() || {};
      if (!row.user_id) return;
      if (!attendanceByUser.has(row.user_id)) attendanceByUser.set(row.user_id, []);
      attendanceByUser.get(row.user_id).push(row);
    });

    const submissionSet = new Set(
      submissionsSnap.docs
        .map((d) => d.data() || {})
        .filter((s) => s.assignmentId && s.userId)
        .map((s) => `${s.assignmentId}__${s.userId}`)
    );

    const assignments = assignmentsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

    const rows = users.map((user) => {
      const userCourses = coursesByUser.get(user.id) || [];
      const totalCourses = userCourses.length;
      const completedCourses = userCourses.filter((c) => String(c.status || "").toLowerCase() === "completed").length;
      const completionPct = totalCourses ? Math.round((completedCourses / totalCourses) * 100) : 0;

      const userAttendance = attendanceByUser.get(user.id) || [];
      const presentCount = userAttendance.filter((a) => String(a.status || "").toLowerCase() === "present").length;
      const attendancePct = userAttendance.length ? Math.round((presentCount / userAttendance.length) * 100) : 0;

      const courseIds = new Set(userCourses.map((c) => c.course_id));
      const assignedAssignments = assignments.filter((a) => {
        const assignTo = String(a.assignTo || "all").toLowerCase();
        const selectedUsers = Array.isArray(a.userIds)
          ? a.userIds
          : Array.isArray(a.assignedUsers)
          ? a.assignedUsers
          : [];
        if (assignTo === "selected") return selectedUsers.includes(user.id);
        if (assignTo === "course") return a.courseId && courseIds.has(a.courseId);
        return true;
      });

      const completedAssignments = assignedAssignments.filter((a) => submissionSet.has(`${a.id}__${user.id}`)).length;
      const assignmentPct = assignedAssignments.length ? Math.round((completedAssignments / assignedAssignments.length) * 100) : 0;

      const score = Math.round(completionPct * 0.5 + attendancePct * 0.3 + assignmentPct * 0.2);

      return {
        userId: user.id,
        name: user.name || user.email || user.id,
        email: user.email || "",
        completionPct,
        attendancePct,
        assignmentPct,
        score,
      };
    });

    rows.sort((a, b) => b.score - a.score || b.completionPct - a.completionPct || b.attendancePct - a.attendancePct);
    const items = rows.map((row, idx) => ({ ...row, rank: idx + 1 }));

    return res.json({ ok: true, items });
  } catch (err) {
    console.error("getLeaderboard error", err);
    return res.status(500).json({ ok: false, error: "Failed to build leaderboard" });
  }
}
