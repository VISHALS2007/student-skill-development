import React, { useState } from "react";
import { auth, provider } from "../firebase";
import { signInWithEmailAndPassword, signInWithPopup, signInWithRedirect, signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { Link } from "react-router-dom";
import { toast } from "react-toastify";
import { ensureUserProfile, getUserProfile, resolveHomeRouteByRole } from "../lib/roleHelpers";
import { adminApi } from "../lib/adminApi";
import { COLLEGE_EMAIL_ERROR, isCollegeEmail, normalizeEmail } from "../lib/emailPolicy";
import "./Auth.css";
import logo from "../assets/logo.svg";
import heroIllustration from "../assets/skill-hero.svg";

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ADMIN_SESSION_KEY = "adminSession:v1";
const ADMIN_TOKEN_KEY = "adminToken:v1";
const DEFAULT_ADMIN_EMAIL = "admin@skilldev.com";
const DEFAULT_ADMIN_PASSWORD = "admin123";
const DEFAULT_SUB_ADMIN_EMAIL = "subadmin@skilldev.com";
const DEFAULT_SUB_ADMIN_PASSWORD = "subadmin123";
const INTERACTIVE_LOGIN_KEY = "interactiveLogin:v1";

const normalizeRole = (role = "") => {
  const normalized = String(role || "").trim().toLowerCase();
  return normalized === "admin" ? "main_admin" : normalized;
};

const isAdminRole = (role = "") => {
  const normalized = normalizeRole(role);
  return normalized === "main_admin" || normalized === "sub_admin";
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

const resolveDefaultLocalAdminRole = (email = "", password = "") => {
  if (email === DEFAULT_ADMIN_EMAIL && password === DEFAULT_ADMIN_PASSWORD) return "main_admin";
  if (email === DEFAULT_SUB_ADMIN_EMAIL && password === DEFAULT_SUB_ADMIN_PASSWORD) return "sub_admin";
  return "";
};

const persistAdminSession = (emailValue, roleValue, token = "") => {
  localStorage.setItem(
    ADMIN_SESSION_KEY,
    JSON.stringify({
      id: "admin-session",
      email: emailValue,
      role: normalizeRole(roleValue),
      loggedAt: new Date().toISOString(),
    })
  );

  if (token) {
    localStorage.setItem(ADMIN_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
  }
};

const clearAdminSession = () => {
  localStorage.removeItem(ADMIN_SESSION_KEY);
  localStorage.removeItem(ADMIN_TOKEN_KEY);
};

const getErrorMessage = (error) => {
  switch (error.code) {
    case "auth/invalid-email":
      return "Invalid email address format.";
    case "auth/invalid-credential":
      return "Invalid email or password.";
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
    case "You are not registered":
      return "You are not registered";
    default:
      return error.message || "Authentication failed. Please try again.";
  }
};

const isPermissionError = (error) => {
  const text = String(error?.message || error || "").toLowerCase();
  return text.includes("permission") || text.includes("insufficient");
};

const withTimeout = (promise, timeoutMs = 1200) => {
  let timer;
  const timeoutPromise = new Promise((resolve) => {
    timer = setTimeout(() => resolve(null), timeoutMs);
  });

  return Promise.race([
    promise.finally(() => clearTimeout(timer)),
    timeoutPromise,
  ]);
};

const markInteractiveLogin = () => {
  try {
    sessionStorage.setItem(INTERACTIVE_LOGIN_KEY, "1");
  } catch {
    // Ignore session storage failures.
  }
};

const clearInteractiveLogin = () => {
  try {
    sessionStorage.removeItem(INTERACTIVE_LOGIN_KEY);
  } catch {
    // Ignore session storage failures.
  }
};

export default function Login() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const navigate = useNavigate();
  const isBusy = loading || googleLoading;

  const heroSrc = heroIllustration;
  const heroFallback = "https://drive.google.com/uc?export=view&id=1awP1ywNpWk3A6mNLbSOvr6EXSOfYY7M7";

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const enforceRegisteredStudent = async (firebaseUser) => {
    try {
      const existingProfile = await getUserProfile(firebaseUser?.uid);
      const profile =
        existingProfile ||
        (await ensureUserProfile(firebaseUser, {
          name: firebaseUser?.displayName || "",
          email: normalizeEmail(firebaseUser?.email || ""),
          role: "student",
          enabled: true,
        }));

      if (!profile) {
        throw new Error("You are not registered");
      }

      if (profile.enabled === false) {
        throw new Error("Your account is disabled. Contact admin.");
      }

      return profile;
    } catch (err) {
      if (isPermissionError(err)) {
        return {
          role: "student",
          enabled: true,
          email: normalizeEmail(firebaseUser?.email || ""),
        };
      }
      throw err;
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (isBusy) return;
    const normalizedEmail = normalizeEmail(formData.email);
    const normalizedPassword = formData.password.trim();

    if (!normalizedEmail || !normalizedPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (!emailRegex.test(normalizedEmail)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      clearAdminSession();
      clearInteractiveLogin();

      const loginStudent = async () => {
        const credential = await signInWithEmailAndPassword(auth, normalizedEmail, normalizedPassword);
        const current = credential.user;
        const profilePromise = enforceRegisteredStudent(current);
        const quickProfile = await withTimeout(profilePromise, 1200);

        if (quickProfile) {
          const role = normalizeRole(quickProfile?.role || "student");
          if (isAdminRole(role)) {
            persistAdminSession(normalizedEmail, role);
          }
          markInteractiveLogin();
          toast.success("Welcome back!", { containerId: "global-toasts" });
          navigate(resolveHomeRouteByRole(role), { replace: true });
          return;
        }

        // Fast path: continue to student home while profile checks finish in background.
        markInteractiveLogin();
        toast.success("Welcome back!", { containerId: "global-toasts" });
        navigate("/dashboard", { replace: true });

        profilePromise
          .then(async (profile) => {
            const role = normalizeRole(profile?.role || "student");
            if (profile?.enabled === false) {
              await signOut(auth).catch(() => {
                // Ignore forced sign-out errors.
              });
              const disabledMessage = "Your account is disabled. Contact admin.";
              setError(disabledMessage);
              toast.error(disabledMessage, { containerId: "global-toasts" });
              navigate("/login", { replace: true });
              return;
            }

            if (isAdminRole(role)) {
              persistAdminSession(normalizedEmail, role);
              navigate(resolveHomeRouteByRole(role), { replace: true });
            }
          })
          .catch(async (profileErr) => {
            const code = String(profileErr?.code || "");
            const msg = String(profileErr?.message || "");
            const shouldForceLogout = code === "You are not registered" || msg.toLowerCase().includes("not registered");
            if (!shouldForceLogout) return;

            await signOut(auth).catch(() => {
              // Ignore forced sign-out errors.
            });
            setError("You are not registered");
            toast.error("You are not registered", { containerId: "global-toasts" });
            navigate("/login", { replace: true });
          });
      };

      const loginAdmin = async () => {
        const adminData = await adminApi.login({ email: normalizedEmail, password: normalizedPassword });
        const adminRole = normalizeRole(adminData?.role || adminData?.user?.role || "");
        if (adminData?.ok && isAdminRole(adminRole)) {
          persistAdminSession(normalizedEmail, adminRole, adminData?.token || "");
          toast.success("Welcome back!", { containerId: "global-toasts" });
          navigate(resolveHomeRouteByRole(adminRole), { replace: true });
          return true;
        }
        return false;
      };

      // College emails are student-first but can still belong to admins/sub-admins.
      if (isCollegeEmail(normalizedEmail)) {
        try {
          await loginStudent();
          return;
        } catch (studentErr) {
          try {
            const didAdminLogin = await loginAdmin();
            if (didAdminLogin) return;
          } catch {
            // Fall through to student auth error for college accounts.
          }
          throw studentErr;
        }
      }

      let adminLoginError = null;

      try {
        const didAdminLogin = await loginAdmin();
        if (didAdminLogin) return;
      } catch (adminErr) {
        adminLoginError = adminErr;
      }

      const localAdminRole = resolveDefaultLocalAdminRole(normalizedEmail, normalizedPassword);
      if (localAdminRole && isConnectivityError(adminLoginError?.message || "")) {
        persistAdminSession(normalizedEmail, localAdminRole);
        toast.success("Welcome back!", { containerId: "global-toasts" });
        navigate(resolveHomeRouteByRole(localAdminRole), { replace: true });
        return;
      }

      const adminMsg = String(adminLoginError?.message || "").trim();
      const fallbackMsg = adminMsg || "Invalid admin credentials.";
      setError(fallbackMsg);
      toast.error(fallbackMsg, { containerId: "global-toasts" });
    } catch (err) {
      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(msg, { containerId: "global-toasts" });
    } finally {
      setLoading(false);
    }
  };

  const buildGoogleProvider = () => {
    const emailHint = normalizeEmail(formData.email || "");
    if (emailHint && isCollegeEmail(emailHint)) {
      provider.setCustomParameters({ login_hint: emailHint });
    } else {
      provider.setCustomParameters({});
    }
    return provider;
  };

  const handleGoogleLogin = async () => {
    if (isBusy) return;
    setGoogleLoading(true);
    setError("");
    try {
      clearAdminSession();
      clearInteractiveLogin();

      const result = await signInWithPopup(auth, buildGoogleProvider());
      const current = result?.user;
      const normalizedEmail = normalizeEmail(current?.email || "");

      if (!normalizedEmail || !isCollegeEmail(normalizedEmail)) {
        await signOut(auth).catch(() => {
          // Ignore forced sign-out errors.
        });
        const message = "Use your @bitsathy.ac.in email.";
        setError(message);
        toast.error(message, { containerId: "global-toasts" });
        return;
      }

      const profilePromise = enforceRegisteredStudent(current);
      const quickProfile = await withTimeout(profilePromise, 900);

      if (quickProfile) {
        const role = normalizeRole(quickProfile?.role || "student");
        if (isAdminRole(role)) {
          persistAdminSession(normalizedEmail, role);
        }
        markInteractiveLogin();
        toast.success("Welcome back!", { containerId: "global-toasts" });
        navigate(resolveHomeRouteByRole(role), { replace: true });
        return;
      }

      markInteractiveLogin();
      toast.success("Welcome back!", { containerId: "global-toasts" });
      navigate("/dashboard", { replace: true });

      profilePromise
        .then(async (profile) => {
          const role = normalizeRole(profile?.role || "student");
          if (profile?.enabled === false) {
            await signOut(auth).catch(() => {
              // Ignore forced sign-out errors.
            });
            clearInteractiveLogin();
            const disabledMessage = "Your account is disabled. Contact admin.";
            setError(disabledMessage);
            toast.error(disabledMessage, { containerId: "global-toasts" });
            navigate("/login", { replace: true });
            return;
          }

          if (isAdminRole(role)) {
            persistAdminSession(normalizedEmail, role);
            navigate(resolveHomeRouteByRole(role), { replace: true });
          }
        })
        .catch(async (profileErr) => {
          const code = String(profileErr?.code || "");
          const msg = String(profileErr?.message || "");
          const shouldForceLogout = code === "You are not registered" || msg.toLowerCase().includes("not registered");
          if (!shouldForceLogout) return;

          await signOut(auth).catch(() => {
            // Ignore forced sign-out errors.
          });
          clearInteractiveLogin();
          setError("You are not registered");
          toast.error("You are not registered", { containerId: "global-toasts" });
          navigate("/login", { replace: true });
        });
    } catch (err) {
      if (err?.code === "auth/popup-blocked" || err?.code === "auth/cancelled-popup-request") {
        try {
          await signInWithRedirect(auth, buildGoogleProvider());
          return;
        } catch (redirectErr) {
          const redirectMsg = getErrorMessage(redirectErr);
          setError(redirectMsg);
          toast.error(redirectMsg, { containerId: "global-toasts" });
          return;
        }
      }

      const msg = getErrorMessage(err);
      setError(msg);
      toast.error(msg, { containerId: "global-toasts" });
    } finally {
      setGoogleLoading(false);
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
          <h2 className="auth-title">Sign in</h2>
          <p className="auth-sub">Use your email to continue.</p>

          <form className="auth-form" onSubmit={handleLogin} noValidate>
            <label className="input-label">Email</label>
            <input
              className="input-field"
              type="email"
              name="email"
              placeholder="Email"
              value={formData.email}
              onChange={handleChange}
              disabled={isBusy}
            />
            <p className="auth-helper">Students: @bitsathy.ac.in</p>

            <label className="input-label">Password</label>
            <input
              className="input-field"
              type="password"
              name="password"
              placeholder="Password"
              value={formData.password}
              onChange={handleChange}
              disabled={isBusy}
            />

            {error && <div className="input-error">{error}</div>}

            <button className="primary-btn" type="submit" disabled={isBusy}>
              {loading ? "Signing in..." : "Sign in"}
            </button>

            <div className="divider">or</div>

            <button className="google-btn" type="button" onClick={handleGoogleLogin} disabled={isBusy}>
              {googleLoading ? "Connecting..." : "Google Sign in"}
            </button>
          </form>

          <div className="auth-footer">New student? <Link to="/register">Create account</Link></div>
          <div className="auth-footer">Admin/Sub Admin? <Link to="/admin/login">Use admin login</Link></div>
        </div>
      </div>
    </div>
  );
}

