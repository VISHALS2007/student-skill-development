import { firestore } from "../firebaseAdmin.js";

const USERS = "users";
const COURSES = "courses";
const USER_COURSES = "user_courses";
const ATTENDANCE = "attendance";
const QUIZ_RESULTS = "quiz_results";
const NOTIFICATIONS = "notifications";
const ASSIGNMENTS = "assignments";
const ASSIGNMENT_SUBMISSIONS = "assignment_submissions";

const DEFAULT_ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "admin@skilldev.com").trim().toLowerCase();
const DEFAULT_ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "admin123";

const nowIso = () => new Date().toISOString();
const normalizeEmail = (value = "") => String(value).trim().toLowerCase();

const courseDoc = (courseId) => firestore.collection(COURSES).doc(courseId);
const userCourseDoc = (userId, courseId) => firestore.collection(USER_COURSES).doc(`${userId}_${courseId}`);
const assignmentDoc = (assignmentId) => firestore.collection(ASSIGNMENTS).doc(assignmentId);

const toDateKey = (value) => {
  if (!value) return "";
  const d = typeof value?.toDate === "function" ? value.toDate() : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
};

export async function ensureDefaultAdminUser() {
  try {
    const snap = await firestore.collection(USERS).where("email", "==", DEFAULT_ADMIN_EMAIL).limit(1).get();
    if (!snap.empty) return { seeded: false };

    await firestore.collection(USERS).doc("admin-seed").set(
      {
        id: "admin-seed",
        name: "System Admin",
        email: DEFAULT_ADMIN_EMAIL,
        password: DEFAULT_ADMIN_PASSWORD,
        role: "admin",
        createdAt: nowIso(),
      },
      { merge: true }
    );

    return { seeded: true };
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

    if (email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) {
      return res.json({
        ok: true,
        message: "Login successful",
        role: "admin",
        redirectTo: "/admin/dashboard",
        user: {
          id: "admin-seed",
          name: "System Admin",
          email: DEFAULT_ADMIN_EMAIL,
          role: "admin",
        },
      });
    }

    const snap = await firestore.collection(USERS).where("email", "==", email).limit(1).get();
    if (snap.empty) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const user = snap.docs[0].data() || {};
    if (user.role !== "admin") {
      return res.status(403).json({ ok: false, error: "Administrator access required" });
    }

    if (String(user.password || "") !== password) {
      return res.status(401).json({ ok: false, error: "Invalid email or password" });
    }

    const role = "admin";
    return res.json({
      ok: true,
      message: "Login successful",
      role,
      redirectTo: "/admin/dashboard",
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

export async function listCourses(_req, res) {
  try {
    const snap = await firestore.collection(COURSES).orderBy("course_name", "asc").get();
    return res.json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error("listCourses error", err);
    return res.status(500).json({ ok: false, error: "Failed to list courses" });
  }
}

export async function createCourse(req, res) {
  try {
    const { course_name, description } = req.body || {};
    if (!course_name?.trim()) return res.status(400).json({ ok: false, error: "course_name is required" });
    const ref = await firestore.collection(COURSES).add({
      course_name: course_name.trim(),
      description: description?.trim() || "",
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });
    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("createCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to create course" });
  }
}

export async function updateCourse(req, res) {
  try {
    const { courseId } = req.params;
    const { course_name, description } = req.body || {};
    await courseDoc(courseId).set(
      {
        ...(course_name !== undefined ? { course_name: course_name.trim() } : {}),
        ...(description !== undefined ? { description: description.trim() } : {}),
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("updateCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to update course" });
  }
}

export async function deleteCourse(req, res) {
  try {
    const { courseId } = req.params;
    await courseDoc(courseId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to delete course" });
  }
}

export async function assignCourseToAll(req, res) {
  try {
    const { course_id, status = "assigned" } = req.body || {};
    if (!course_id) return res.status(400).json({ ok: false, error: "course_id is required" });
    const usersSnap = await firestore.collection(USERS).get();
    const batch = firestore.batch();
    usersSnap.forEach((docSnap) => {
      const uid = docSnap.id;
      batch.set(userCourseDoc(uid, course_id), {
        user_id: uid,
        course_id,
        status,
        assignedAt: nowIso(),
      }, { merge: true });
    });
    await batch.commit();
    return res.json({ ok: true, assigned: usersSnap.size });
  } catch (err) {
    console.error("assignCourseToAll error", err);
    return res.status(500).json({ ok: false, error: "Failed to assign course" });
  }
}

export async function assignCourseToSelected(req, res) {
  try {
    const { course_id, user_ids = [], status = "assigned" } = req.body || {};
    if (!course_id || !Array.isArray(user_ids) || user_ids.length === 0) {
      return res.status(400).json({ ok: false, error: "course_id and user_ids are required" });
    }
    const batch = firestore.batch();
    user_ids.forEach((uid) => {
      batch.set(userCourseDoc(uid, course_id), {
        user_id: uid,
        course_id,
        status,
        assignedAt: nowIso(),
      }, { merge: true });
    });
    await batch.commit();
    return res.json({ ok: true, assigned: user_ids.length });
  } catch (err) {
    console.error("assignCourseToSelected error", err);
    return res.status(500).json({ ok: false, error: "Failed to assign selected course" });
  }
}

export async function removeAssignedCourse(req, res) {
  try {
    const { userId, courseId } = req.params;
    await userCourseDoc(userId, courseId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error("removeAssignedCourse error", err);
    return res.status(500).json({ ok: false, error: "Failed to remove assignment" });
  }
}

export async function listUsers(req, res) {
  try {
    const search = normalizeEmail(req.query.search || "");
    const snap = await firestore.collection(USERS).get();
    let items = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    if (search) {
      items = items.filter((u) => `${u.name || ""} ${u.email || ""}`.toLowerCase().includes(search));
    }
    return res.json({ ok: true, items: items.map(({ password, ...safe }) => safe) });
  } catch (err) {
    console.error("listUsers error", err);
    return res.status(500).json({ ok: false, error: "Failed to list users" });
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
    const ref = await firestore.collection(ATTENDANCE).add({
      user_id,
      course_id,
      date,
      status,
      markedAt: nowIso(),
    });
    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("markAttendance error", err);
    return res.status(500).json({ ok: false, error: "Failed to mark attendance" });
  }
}

export async function markBulkAttendance(req, res) {
  try {
    const { course_id, date, entries = [] } = req.body || {};
    if (!course_id || !date || !Array.isArray(entries) || entries.length === 0) {
      return res.status(400).json({ ok: false, error: "course_id, date and entries are required" });
    }

    const batch = firestore.batch();
    entries.forEach((entry) => {
      if (!entry?.user_id) return;
      const ref = firestore.collection(ATTENDANCE).doc();
      batch.set(ref, {
        user_id: entry.user_id,
        course_id,
        date,
        status: entry.status === "present" ? "present" : "absent",
        markedAt: nowIso(),
      });
    });

    await batch.commit();
    return res.status(201).json({ ok: true, saved: entries.length });
  } catch (err) {
    console.error("markBulkAttendance error", err);
    return res.status(500).json({ ok: false, error: "Failed to mark bulk attendance" });
  }
}

export async function listAttendance(req, res) {
  try {
    const { courseId, date, userId } = req.query || {};
    let ref = firestore.collection(ATTENDANCE);
    if (courseId) ref = ref.where("course_id", "==", courseId);
    if (date) ref = ref.where("date", "==", date);
    if (userId) ref = ref.where("user_id", "==", userId);
    const snap = await ref.get();
    return res.json({ ok: true, items: snap.docs.map((d) => ({ id: d.id, ...d.data() })) });
  } catch (err) {
    console.error("listAttendance error", err);
    return res.status(500).json({ ok: false, error: "Failed to list attendance" });
  }
}

export async function getReports(req, res) {
  try {
    const [usersSnap, coursesSnap, userCoursesSnap] = await Promise.all([
      firestore.collection(USERS).get(),
      firestore.collection(COURSES).get(),
      firestore.collection(USER_COURSES).get(),
    ]);

    const users = usersSnap.docs.map((d) => d.data());
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.enabled !== false).length;
    const totalCourses = coursesSnap.size;
    const completedCourseCount = userCoursesSnap.docs.filter((d) => (d.data() || {}).status === "completed").length;

    return res.json({
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
    });
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
    console.error("listAssignments error", err);
    return res.status(500).json({ ok: false, error: "Failed to list assignments" });
  }
}

export async function createAssignment(req, res) {
  try {
    const {
      title,
      description = "",
      openDate = "",
      dueDate = "",
      instructions = "",
      assignTo = "all",
      courseId = "",
      userIds = [],
    } = req.body || {};

    if (!title?.trim()) return res.status(400).json({ ok: false, error: "title is required" });

    const ref = await firestore.collection(ASSIGNMENTS).add({
      title: title.trim(),
      description: description.trim(),
      openDate: openDate || null,
      dueDate: dueDate || null,
      instructions: instructions.trim(),
      assignTo,
      courseId: courseId || null,
      userIds: Array.isArray(userIds) ? userIds : [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    });

    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("createAssignment error", err);
    return res.status(500).json({ ok: false, error: "Failed to create assignment" });
  }
}

export async function updateAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    const payload = req.body || {};
    await assignmentDoc(assignmentId).set(
      {
        ...(payload.title !== undefined ? { title: String(payload.title).trim() } : {}),
        ...(payload.description !== undefined ? { description: String(payload.description).trim() } : {}),
        ...(payload.openDate !== undefined ? { openDate: payload.openDate || null } : {}),
        ...(payload.dueDate !== undefined ? { dueDate: payload.dueDate || null } : {}),
        ...(payload.instructions !== undefined ? { instructions: String(payload.instructions).trim() } : {}),
        ...(payload.assignTo !== undefined ? { assignTo: payload.assignTo } : {}),
        ...(payload.courseId !== undefined ? { courseId: payload.courseId || null } : {}),
        ...(payload.userIds !== undefined ? { userIds: Array.isArray(payload.userIds) ? payload.userIds : [] } : {}),
        updatedAt: nowIso(),
      },
      { merge: true }
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("updateAssignment error", err);
    return res.status(500).json({ ok: false, error: "Failed to update assignment" });
  }
}

export async function deleteAssignment(req, res) {
  try {
    const { assignmentId } = req.params;
    await assignmentDoc(assignmentId).delete();
    return res.json({ ok: true });
  } catch (err) {
    console.error("deleteAssignment error", err);
    return res.status(500).json({ ok: false, error: "Failed to delete assignment" });
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
    console.error("listAssignmentSubmissions error", err);
    return res.status(500).json({ ok: false, error: "Failed to list submissions" });
  }
}

export async function submitAssignment(req, res) {
  try {
    const { assignmentId, userId, status = "completed", submittedAt = nowIso() } = req.body || {};
    if (!assignmentId || !userId) return res.status(400).json({ ok: false, error: "assignmentId and userId required" });
    const ref = await firestore.collection(ASSIGNMENT_SUBMISSIONS).add({
      assignmentId,
      userId,
      status,
      submittedAt,
      createdAt: nowIso(),
    });
    return res.status(201).json({ ok: true, id: ref.id });
  } catch (err) {
    console.error("submitAssignment error", err);
    return res.status(500).json({ ok: false, error: "Failed to record submission" });
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
        })),
      },
    });
  } catch (err) {
    console.error("getAssignmentProgress error", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch assignment progress" });
  }
}
