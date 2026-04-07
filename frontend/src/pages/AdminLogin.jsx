import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import logo from "../assets/logo.svg";
import { adminApi } from "../lib/adminApi";
import "./Admin.css";

const ADMIN_SESSION_KEY = "adminSession:v1";
const ADMIN_TOKEN_KEY = "adminToken:v1";
const DEFAULT_ADMIN_EMAIL = "admin@skilldev.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_SUB_ADMIN_EMAIL = "subadmin@skilldev.com";
const DEFAULT_SUB_ADMIN_PASSWORD = "subadmin123";
const ADMIN_ROLES = new Set(["main_admin", "sub_admin", "admin"]);

const normalizeAdminRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" ? "main_admin" : normalized;
};

const isAdminRole = (role = "") => ADMIN_ROLES.has(String(role || "").trim().toLowerCase()) || ["main_admin", "sub_admin"].includes(normalizeAdminRole(role));

const resolveAdminHomeRoute = (role = "") => {
  const normalized = normalizeAdminRole(role);
  return normalized === "sub_admin" ? "/sub-admin" : "/main-admin";
};

const resolveDefaultLocalAdminRole = (email = "", password = "") => {
  if (email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) return "main_admin";
  if (email === DEFAULT_SUB_ADMIN_EMAIL && password === DEFAULT_SUB_ADMIN_PASSWORD) return "sub_admin";
  return "";
};

const readAdminSession = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
  }
};

const isConnectivityError = (message = "") => {
  const text = String(message || "").toLowerCase();
  return (
    text.includes("cannot connect") ||
    text.includes("failed to fetch") ||
    text.includes("network") ||
    text.includes("timeout")
  );
};

const persistAdminSession = (emailValue, roleValue = "main_admin", token = "") => {
  const role = normalizeAdminRole(roleValue) || "main_admin";
  localStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      id: "admin",
      email: emailValue,
      role,
      loggedAt: new Date().toISOString(),
    })
  );
  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
};

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [dbStatus, setDbStatus] = useState("Checking database connection...");

  useEffect(() => {
    const session = readAdminSession();
    if (isAdminRole(session?.role)) {
      navigate("/admin/dashboard", { replace: true });
      return;
    }

    let active = true;
    const init = async () => {
      try {
        const data = await adminApi.health();
        if (!active) return;
        setDbStatus(data?.message || "Database connected");
        console.debug("[AdminLogin] API health:", data);
      } catch (err) {
        if (!active) return;
        console.error("[AdminLogin] Database connection failed", err);
        setDbStatus("Database connection failed");
      }
    };
    init();
    return () => {
      active = false;
    };
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    const normalizedEmail = email.trim().toLowerCase();
    const normalizedPassword = password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setError("Please enter admin email and password.");
      return;
    }

    setLoading(true);
    try {
      const data = await adminApi.login({ email: normalizedEmail, password: normalizedPassword });

      if (!data?.ok) {
        const message = data?.error || "Invalid email or password.";
        setError(message);
        toast.error(message, { containerId: "global-toasts" });
        return;
      }

      const role = normalizeAdminRole(data?.role || "student");
      if (!isAdminRole(role)) {
        const message = "Administrator access required.";
        setError(message);
        toast.error(message, { containerId: "global-toasts" });
        return;
      }

      const record = data?.user || { id: data?.user?.id, email: normalizedEmail, role };
      persistAdminSession(record?.email || normalizedEmail, role, data?.token || "");

      toast.success("Admin login successful", { containerId: "global-toasts" });
      navigate(data?.redirectTo || resolveAdminHomeRoute(role), { replace: true });
    } catch (err) {
      const message = err?.message || "Unable to login now. Please try again.";
      const fallbackRole = resolveDefaultLocalAdminRole(normalizedEmail, normalizedPassword);

      const canUseLocalFallback =
        Boolean(fallbackRole) &&
        (isConnectivityError(message) ||
          String(dbStatus || "").toLowerCase().includes("failed") ||
          String(message || "").toLowerCase().includes("invalid email or password"));

      if (canUseLocalFallback) {
        persistAdminSession(normalizedEmail, fallbackRole);
        setError("");
        toast.success("Logged in with local admin fallback", { containerId: "global-toasts" });
        navigate(resolveAdminHomeRoute(fallbackRole), { replace: true });
      } else {
        setError(message);
        toast.error(message, { containerId: "global-toasts" });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-auth-shell">
      <div className="admin-auth-card">
        <div className="admin-auth-head">
          <img src={logo} alt="Skill Development logo" className="admin-logo" />
          <div>
            <p className="admin-eyebrow">Administrator Module</p>
            <h1>Admin Login</h1>
          </div>
        </div>

        <p className="admin-subtext">Sign in to manage students, courses, tests, certificates, and analytics.</p>
        <p className="admin-subtext" style={{ marginTop: "-8px" }}>Debug: {dbStatus}</p>
        <p className="admin-subtext" style={{ marginTop: "-10px" }}>
          Test Admin: <strong>{DEFAULT_ADMIN_EMAIL}</strong> / <strong>{DEFAULT_ADMIN_PASSWORD}</strong>
        </p>
        <p className="admin-subtext" style={{ marginTop: "-10px" }}>
          Test Sub Admin: <strong>{DEFAULT_SUB_ADMIN_EMAIL}</strong> / <strong>{DEFAULT_SUB_ADMIN_PASSWORD}</strong>
        </p>

        <form className="admin-auth-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              type="email"
              placeholder="admin@skilldev.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Password
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </label>

          {error && <p className="admin-error">{error}</p>}

          <button type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
          </button>
        </form>

        <div className="admin-auth-links">
          <span>Forgot password? Contact super admin.</span>
          <Link to="/login">Student Login</Link>
        </div>
      </div>
    </div>
  );
}
