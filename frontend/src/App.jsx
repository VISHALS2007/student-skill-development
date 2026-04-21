import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import ProtectedRoute from "./components/ProtectedRoute";
import AdminProtectedRoute from "./components/AdminProtectedRoute";
import LoadingSpinner from "./components/LoadingSpinner";

const Login = lazy(() => import("./pages/Login"));
const AdminLogin = lazy(() => import("./pages/AdminLogin"));
const Register = lazy(() => import("./pages/Register"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Profile = lazy(() => import("./pages/Profile"));
const Settings = lazy(() => import("./pages/Settings"));
const Progress = lazy(() => import("./pages/Progress"));
const StudentAttendance = lazy(() => import("./pages/StudentAttendance"));
const AllocatedCourses = lazy(() => import("./pages/AllocatedCourses"));
const CommunicationSession = lazy(() => import("./pages/CommunicationSession"));
const SkillSystem = lazy(() => import("./pages/SkillSystem"));
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
          <Route path="/" element={<Navigate to="/login" replace />} />
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
            element={<Navigate to="/dashboard" replace />}
          />
          <Route path="/admin/dashboard" element={<Navigate to="/main-admin" replace />} />
          <Route path="/student/dashboard" element={<Navigate to="/dashboard" replace />} />
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
            element={<Navigate to="/dashboard" replace />}
          />
          <Route
            path="/communication-session"
            element={
              <ProtectedRoute>
                <CommunicationSession />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/login" replace />} />
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

