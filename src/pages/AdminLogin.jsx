import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import logo from "../assets/logo.svg";
import "./Admin.css";

const ADMIN_SESSION_KEY = "adminSession:v1";
const DEFAULT_ADMIN_EMAIL = "admin@skilldev.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";

const readAdminSession = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    return null;
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
    if (session?.role === "admin") {
      navigate("/admin/dashboard", { replace: true });
      return;
    }

    let active = true;
    const init = async () => {
      try {
        const res = await fetch("/api/admin/health");
        const data = await res.json();
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
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, password: normalizedPassword }),
      });
      const data = await response.json();

      if (!response.ok || !data?.ok) {
        const message = data?.error || "Invalid email or password.";
        setError(message);
        toast.error(message, { containerId: "global-toasts" });
        return;
      }

      const role = data?.role || "student";
      if (role !== "admin") {
        const message = "Administrator access required.";
        setError(message);
        toast.error(message, { containerId: "global-toasts" });
        return;
      }

      const record = data?.user || { id: data?.user?.id, email: normalizedEmail, role: "admin" };

      localStorage.setItem(
        ADMIN_SESSION_KEY,
        JSON.stringify({
          id: record?.id || "admin",
          email: normalizedEmail,
          role: "admin",
          loggedAt: new Date().toISOString(),
        })
      );

      toast.success("Admin login successful", { containerId: "global-toasts" });
      navigate("/admin/dashboard", { replace: true });
    } catch (err) {
      setError("Unable to login now. Please try again.");
      toast.error("Login failed. Check database connection.", { containerId: "global-toasts" });
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
