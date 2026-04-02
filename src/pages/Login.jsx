import React, { useState, useEffect } from "react";
import { auth } from "../firebase";
import { signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { createOrUpdateUser } from "../lib/authHelpers";
import { useAuth } from "../lib/AuthContext";
import { ensureUserProfile, getUserProfile, resolveHomeRouteByRole } from "../lib/roleHelpers";
import "./Auth.css";
import logo from "../assets/logo.svg";
import heroIllustration from "../assets/skill-hero.svg";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getErrorMessage = (error) => {
  switch (error.code) {
    case "auth/invalid-email":
      return "Invalid email address format.";
    case "auth/user-not-found":
      return "No account found with this email.";
    case "auth/wrong-password":
      return "Incorrect password.";
    case "auth/user-disabled":
      return "This account has been disabled.";
    case "auth/too-many-requests":
      return "Too many login attempts. Try again later.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was cancelled.";
    case "auth/network-request-failed":
      return "Network error. Please check your connection.";
    default:
      return error.message || "Authentication failed. Please try again.";
  }
};

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const heroSrc = heroIllustration;
  const heroFallback = "https://drive.google.com/uc?export=view&id=1awP1ywNpWk3A6mNLbSOvr6EXSOfYY7M7";

  useEffect(() => {
    if (authLoading || !user) return;
    let active = true;
    const redirectByRole = async () => {
      try {
        const profile = (await getUserProfile(user.uid)) || (await ensureUserProfile(user));
        const role = profile?.role || "student";
        if (role !== "admin") {
          localStorage.removeItem("adminSession:v1");
        }
        const home = resolveHomeRouteByRole(role);
        if (active) navigate(home, { replace: true });
      } catch (err) {
        if (active) navigate("/dashboard", { replace: true });
      }
    };
    redirectByRole();
    return () => {
      active = false;
    };
  }, [authLoading, user, navigate]);

  if (authLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <img src={logo} alt="Skills Development logo" className="logo-img" />
            <div className="app-title">Skills Development</div>
          </div>
          <p className="auth-sub">Checking your session...</p>
        </div>
      </div>
    );
  }

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!formData.email.trim() || !formData.password.trim()) {
      setError("Please fill in all fields.");
      return;
    }

    if (!emailRegex.test(formData.email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, formData.email, formData.password);
      toast.success("Welcome back!", { containerId: "global-toasts" });
      const current = auth.currentUser;
      try {
        const profile = (await getUserProfile(current?.uid)) || (await ensureUserProfile(current));
        const role = profile?.role || "student";
        if (role !== "admin") {
          localStorage.removeItem("adminSession:v1");
        }
        navigate(resolveHomeRouteByRole(role), { replace: true });
      } catch (innerErr) {
        localStorage.removeItem("adminSession:v1");
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(msg, { containerId: "global-toasts" });
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setLoading(true);
    try {
      const googleProvider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, googleProvider);
      const user = result.user;
      const isNewUser = result.additionalUserInfo?.isNewUser ?? false;
      if (isNewUser) {
        await createOrUpdateUser(user, { name: user.displayName || "", email: user.email || "" });
        toast.success("Account created! Welcome.", { containerId: "global-toasts" });
      } else {
        toast.success("Welcome back!", { containerId: "global-toasts" });
      }
      try {
        const profile = (await getUserProfile(user.uid)) || (await ensureUserProfile(user));
        const role = profile?.role || "student";
        if (role !== "admin") {
          localStorage.removeItem("adminSession:v1");
        }
        navigate(resolveHomeRouteByRole(role), { replace: true });
      } catch (innerErr) {
        localStorage.removeItem("adminSession:v1");
        navigate("/dashboard", { replace: true });
      }
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(msg, { containerId: "global-toasts" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-visual">
          <div className="auth-visual-inner">
            <img
              src={heroSrc}
              alt="Student learning illustration"
              className="auth-visual-img"
              onError={(e) => {
                if (e.currentTarget.dataset.fallbackApplied) return;
                e.currentTarget.dataset.fallbackApplied = "true";
                e.currentTarget.src = heroFallback;
              }}
            />
          </div>
        </div>

        <div className="auth-content">
          <div className="auth-header">
            <img src={logo} alt="Skills Development logo" className="logo-img" />
            <div className="app-title">Skills Development</div>
          </div>
          <h2 className="auth-title">Welcome back</h2>
          <p className="auth-sub">Sign in to continue to Skills Development</p>

          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <label className="input-label">Email</label>
            <input
              className="input-field"
              type="email"
              name="email"
              placeholder="you@example.com"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />

            <label className="input-label">Password</label>
            <input
              className="input-field"
              type="password"
              name="password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
            />

            {error && <div className="input-error">{error}</div>}

            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>

          <div className="divider">or</div>

          <button className="google-btn" onClick={handleGoogleLogin} disabled={loading}>
            {loading ? "Processing..." : "Continue with Google"}
          </button>

          <div className="auth-footer">Need access? Contact your admin to get invited.</div>
          <div className="auth-footer" style={{ marginTop: "6px" }}>
            Faculty/Admin? <Link to="/admin/login">Go to Admin Login</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

