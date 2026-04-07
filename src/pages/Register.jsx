import React, { useEffect, useState } from "react";
import { createUserWithEmailAndPassword, updateProfile, signOut } from "firebase/auth";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth } from "../firebase";
import { useAuth } from "../lib/AuthContext";
import { ensureUserProfile, resolveHomeRouteByRole } from "../lib/roleHelpers";
import { COLLEGE_EMAIL_ERROR, isCollegeEmail, normalizeEmail, parseAcademicDetailsFromEmail } from "../lib/emailPolicy";
import "./Auth.css";
import logo from "../assets/logo.svg";
import heroIllustration from "../assets/skill-hero.svg";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Register() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const heroSrc = heroIllustration;
  const heroFallback = "https://drive.google.com/uc?export=view&id=1awP1ywNpWk3A6mNLbSOvr6EXSOfYY7M7";

  useEffect(() => {
    if (authLoading || !user) return;
    navigate(resolveHomeRouteByRole("student"), { replace: true });
  }, [authLoading, user, navigate]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    setError("");
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    if (loading) return;
    const name = String(formData.name || "").trim();
    const email = normalizeEmail(formData.email);
    const password = String(formData.password || "").trim();
    const confirmPassword = String(formData.confirmPassword || "").trim();

    if (!name || !email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    if (!isCollegeEmail(email)) {
      setError(COLLEGE_EMAIL_ERROR);
      toast.error(COLLEGE_EMAIL_ERROR, { containerId: "global-toasts" });
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Password and confirm password do not match.");
      return;
    }

    setLoading(true);
    try {
      const academicMeta = parseAcademicDetailsFromEmail(email);
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      if (name) {
        await updateProfile(credential.user, { displayName: name });
      }

      await ensureUserProfile(credential.user, {
        name,
        email,
        role: "student",
        enabled: true,
        departmentCode: academicMeta.departmentCode,
        department: academicMeta.department,
        batch: academicMeta.batch,
        year: academicMeta.year,
      });

      toast.success("Registration successful", { containerId: "global-toasts" });
      await signOut(auth).catch(() => {
        // Keep flow resilient if sign-out fails after registration.
      });
      navigate("/login", { replace: true });
    } catch (err) {
      const code = String(err?.code || "");
      let message = err?.message || "Unable to register now. Please try again.";
      if (code === "auth/email-already-in-use") message = "This email is already registered.";
      if (code === "auth/invalid-email") message = "Invalid email address.";
      if (code === "auth/weak-password") message = "Password must be at least 6 characters.";
      setError(message);
      toast.error(message, { containerId: "global-toasts" });
      await signOut(auth).catch(() => {
        // Ignore sign out errors.
      });
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <img src={logo} alt="Skills Development logo" className="logo-img" />
            <div className="app-title">Skills Development</div>
          </div>
          <p className="auth-sub">Checking session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-visual">
          <div className="auth-visual-inner">
            <img
              src={heroSrc}
              alt="Student registration illustration"
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
          <h2 className="auth-title">Create account</h2>
          <p className="auth-sub">Use your college email.</p>

          <form className="auth-form" onSubmit={handleRegister} noValidate>
            <label className="input-label">Name</label>
            <input
              className="input-field"
              type="text"
              name="name"
              placeholder="Full name"
              value={formData.name}
              onChange={handleChange}
              disabled={loading}
            />

            <label className="input-label">Email</label>
            <input
              className="input-field"
              type="email"
              name="email"
              placeholder="student@bitsathy.ac.in"
              value={formData.email}
              onChange={handleChange}
              disabled={loading}
            />

            <label className="input-label">Password</label>
            <input
              className="input-field"
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              disabled={loading}
            />

            <label className="input-label">Confirm Password</label>
            <input
              className="input-field"
              type="password"
              name="confirmPassword"
              placeholder="Confirm password"
              value={formData.confirmPassword}
              onChange={handleChange}
              disabled={loading}
            />

            {error && <div className="input-error">{error}</div>}

            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create"}
            </button>
          </form>

          <div className="auth-footer">Already have an account? <Link to="/login">Sign in</Link></div>
        </div>
      </div>
    </div>
  );
}
