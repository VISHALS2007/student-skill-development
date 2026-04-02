import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import Login from "./pages/Login";
import AdminLogin from "./pages/AdminLogin";
import AdminDashboard from "./pages/AdminDashboard";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Calendar from "./pages/Calendar";
import CommunicationSession from "./pages/CommunicationSession";
import SkillSystem from "./pages/SkillSystem";
import MicroLearning from "./pages/MicroLearning";
import { useAuth } from "./lib/AuthContext";
import LearningSession from "./pages/LearningSession";
import ProblemSolvingSession from "./pages/ProblemSolvingSession";
import AptitudeSession from "./pages/AptitudeSession";
import LogicalReasoningSession from "./pages/LogicalReasoningSession";
import ReadingSession from "./pages/ReadingSession";
import FocusLearning from "./pages/FocusLearning";
import FocusProblemSolving from "./pages/FocusProblemSolving";
import FocusAptitude from "./pages/FocusAptitude";
import FocusCommunication from "./pages/FocusCommunication";
import FocusLogical from "./pages/FocusLogical";
import { getUserProfile, resolveHomeRouteByRole } from "./lib/roleHelpers";

function LandingRedirect() {
  const { user, loading } = useAuth();
  const [target, setTarget] = useState("");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      try {
        const raw = localStorage.getItem("adminSession:v1");
        const parsed = raw ? JSON.parse(raw) : null;
        if (parsed?.role === "admin") {
          setTarget("/admin/dashboard");
          return;
        }
      } catch (err) {
        // ignore parse errors and continue default routing
      }
      setTarget("/login");
      return;
    }
    let active = true;
    const resolveTarget = async () => {
      try {
        const profile = await getUserProfile(user.uid);
        if (active) setTarget(resolveHomeRouteByRole(profile?.role || "student"));
      } catch (err) {
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
          background: "linear-gradient(180deg,#f6f8ff 0%, #eef2ff 100%)",
          fontSize: "16px",
          color: "#475569",
          fontFamily: "system-ui",
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
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingRedirect />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route
          path="/admin/dashboard"
          element={
            <AdminProtectedRoute>
              <AdminDashboard />
            </AdminProtectedRoute>
          }
        />
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
              <Calendar />
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
          path="/attendance"
          element={
            <ProtectedRoute>
              <Navigate to="/calendar" replace />
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
