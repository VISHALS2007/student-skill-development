import { Suspense, lazy, useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import { signOut } from "firebase/auth";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import { useAuth } from "./lib/AuthContext";
import LoadingSpinner from "./components/LoadingSpinner";
import { ensureUserProfile, resolveHomeRouteByRole } from "./lib/roleHelpers";
import { auth } from "./firebase";

const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Register = lazy(() => import("./pages/Register"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const StudentDashboard = lazy(() => import("./pages/StudentDashboard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Progress = lazy(() => import("./pages/Progress"));
const StudentAttendance = lazy(() => import("./pages/StudentAttendance"));
const AllocatedCourses = lazy(() => import("./pages/AllocatedCourses"));
const CommunicationSession = lazy(() => import("./pages/CommunicationSession"));
const SkillSystem = lazy(() => import("./pages/SkillSystem"));
const MicroLearning = lazy(() => import("./pages/MicroLearning"));
const LearningSession = lazy(() => import("./pages/LearningSession"));
const ProblemSolvingSession = lazy(() => import("./pages/ProblemSolvingSession"));
const AptitudeSession = lazy(() => import("./pages/AptitudeSession"));
const LogicalReasoningSession = lazy(() => import("./pages/LogicalReasoningSession"));
const ReadingSession = lazy(() => import("./pages/ReadingSession"));
const FocusLearning = lazy(() => import("./pages/FocusLearning"));
const FocusProblemSolving = lazy(() => import("./pages/FocusProblemSolving"));
const FocusAptitude = lazy(() => import("./pages/FocusAptitude"));
const FocusCommunication = lazy(() => import("./pages/FocusCommunication"));
const FocusLogical = lazy(() => import("./pages/FocusLogical"));

const ADMIN_SESSION_KEY = "adminSession:v1";

const normalizeRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" ? "main_admin" : normalized;
};

const readAdminRoleFromSession = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return "";
    const parsed = JSON.parse(raw);
    const role = normalizeRole(parsed?.role || "");
    return role === "main_admin" || role === "sub_admin" ? role : "";
  } catch {
    return "";
  }
};

function LandingRedirect() {
  const { user, loading } = useAuth();
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const adminRole = readAdminRoleFromSession();
      if (adminRole) {
        setTarget(resolveHomeRouteByRole(adminRole));
      } else {
        setTarget("/login");
      }
      return;
    }
    let active = true;
    const resolveTarget = async () => {
      try {
        const profile = await ensureUserProfile(user, {
          name: user.displayName || "",
          email: user.email || "",
          role: "student",
          enabled: true,
        });
        if (!profile) {
          await signOut(auth);
          if (active) setTarget("/login");
          return;
        }
        if (profile.enabled === false) {
          await signOut(auth);
          if (active) setTarget("/login");
          return;
        }
        if (active) setTarget(resolveHomeRouteByRole(profile?.role || "student"));
      } catch {
        if (active) setTarget("/dashboard");
      }
    };
    resolveTarget();
    return () => {
      active = false;
    };
  }, [loading, user]);

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#f8fafc",
          fontSize: "16px",
          color: "#6b7280",
          fontFamily: "Inter, Poppins, Roboto, system-ui",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
          <div>Checking session...</div>
        </div>
      </div>
    );
  }

  if (!target) return null;
  return <Navigate to={target} replace />;
}

function App() {
  const routeFallback = (
    <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
      <div className="ui-card flex items-center gap-3">
        <LoadingSpinner label="Loading page" />
        <span className="text-sm text-slate-600">Loading page...</span>
      </div>
    </div>
  );

  return (
    <BrowserRouter>
      <Suspense fallback={routeFallback}>
        <Routes>
          <Route path="/" element={<LandingRedirect />} />
          <Route path="/login" element={<Login />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/register" element={<Register />} />
          <Route
            path="/main-admin"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/sub-admin"
            element={
              <AdminProtectedRoute>
                <AdminDashboard />
              </AdminProtectedRoute>
            }
          />
          <Route
            path="/student"
            element={
              <ProtectedRoute>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route path="/admin/dashboard" element={<Navigate to="/main-admin" replace />} />
          <Route path="/student/dashboard" element={<Navigate to="/student" replace />} />
          <Route
            path="/dashboard"
            element={
              <ProtectedRoute>
                <Dashboard />
              </ProtectedRoute>
            }
          />

          <Route
            path="/learning-session"
            element={
              <ProtectedRoute>
                <LearningSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/focus-learning"
            element={
              <ProtectedRoute>
                <FocusLearning />
              </ProtectedRoute>
            }
          />
          <Route
            path="/problem-solving-session"
            element={
              <ProtectedRoute>
                <ProblemSolvingSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/focus-problem-solving"
            element={
              <ProtectedRoute>
                <FocusProblemSolving />
              </ProtectedRoute>
            }
          />
          <Route
            path="/aptitude-session"
            element={
              <ProtectedRoute>
                <AptitudeSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/focus-aptitude"
            element={
              <ProtectedRoute>
                <FocusAptitude />
              </ProtectedRoute>
            }
          />
          <Route
            path="/focus-communication"
            element={
              <ProtectedRoute>
                <FocusCommunication />
              </ProtectedRoute>
            }
          />
          <Route
            path="/focus-logical"
            element={
              <ProtectedRoute>
                <FocusLogical />
              </ProtectedRoute>
            }
          />
          <Route
            path="/logical-reasoning-session"
            element={
              <ProtectedRoute>
                <LogicalReasoningSession />
              </ProtectedRoute>
            }
          />
          <Route
            path="/reading-session"
            element={
              <ProtectedRoute>
                <ReadingSession />
              </ProtectedRoute>
            }
          />

          <Route
            path="/calendar"
            element={
              <ProtectedRoute>
                <StudentAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/allocated-courses"
            element={
              <ProtectedRoute>
                <AllocatedCourses />
              </ProtectedRoute>
            }
          />

          <Route
            path="/profile"
            element={
              <ProtectedRoute>
                <Profile />
              </ProtectedRoute>
            }
          />

          <Route
            path="/settings"
            element={
              <ProtectedRoute>
                <Settings />
              </ProtectedRoute>
            }
          />
          <Route
            path="/progress"
            element={
              <ProtectedRoute>
                <Progress />
              </ProtectedRoute>
            }
          />
          <Route
            path="/attendance"
            element={
              <ProtectedRoute>
                <StudentAttendance />
              </ProtectedRoute>
            }
          />
          <Route
            path="/skill-tracker"
            element={
              <ProtectedRoute>
                <SkillSystem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/manage-skills"
            element={
              <ProtectedRoute>
                <SkillSystem />
              </ProtectedRoute>
            }
          />
          <Route
            path="/micro-learning"
            element={
              <ProtectedRoute>
                <MicroLearning />
              </ProtectedRoute>
            }
          />
          <Route
            path="/communication-session"
            element={
              <ProtectedRoute>
                <CommunicationSession />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<LandingRedirect />} />
        </Routes>
      </Suspense>
      <ToastContainer
        containerId="global-toasts"
        position="top-center"
        autoClose={2500}
        newestOnTop
        closeOnClick
        pauseOnHover={false}
        draggable
        theme="colored"
        style={{ zIndex: 9999 }}
      />
    </BrowserRouter>
  );
}

export default App;

