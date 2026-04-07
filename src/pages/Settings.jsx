import React, { useState } from "react";
import { auth } from "../firebase";
import { updateEmail, updatePassword, signOut } from "firebase/auth";
import GlobalLayout from "../components/GlobalLayout";
import { FiBell, FiMoon, FiUser, FiLogOut, FiLock, FiSun, FiMonitor, FiSave } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";

const SETTINGS_PREFS_KEY = "settings:prefs:v1";

const readPrefs = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_PREFS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    return parsed;
  } catch {
    return null;
  }
};

const authErrorMessage = (err) => {
  const code = String(err?.code || "");
  if (code === "auth/requires-recent-login") {
    return "Please login again, then retry this change.";
  }
  if (code === "auth/invalid-email") {
    return "Please enter a valid email address.";
  }
  if (code === "auth/email-already-in-use") {
    return "This email is already in use.";
  }
  if (code === "auth/weak-password") {
    return "Use a stronger password.";
  }
  return err?.message || "Request failed. Please try again.";
};

export default function Settings() {
  const user = auth.currentUser;
  const { theme, setTheme } = useTheme();
  const initialPrefs = readPrefs();
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [notifications, setNotifications] = useState(
    initialPrefs?.notifications || { focusReminder: true, sessionDone: true, emailDigest: false }
  );
  const [preferredPlatforms, setPreferredPlatforms] = useState(
    initialPrefs?.preferredPlatforms || { gfg: true, leetcode: true, hackerrank: true }
  );
  const [status, setStatus] = useState({ type: "", message: "" });
  const [busy, setBusy] = useState({ email: false, password: false, logout: false, prefs: false });
  const navigate = useNavigate();

  const setStatusMessage = (type, message) => {
    setStatus({ type, message });
  };

  const persistPreferences = () => {
    setBusy((prev) => ({ ...prev, prefs: true }));
    try {
      localStorage.setItem(
        SETTINGS_PREFS_KEY,
        JSON.stringify({
          notifications,
          preferredPlatforms,
          updatedAt: new Date().toISOString(),
        })
      );
      setStatusMessage("success", "Preferences saved.");
    } catch {
      setStatusMessage("error", "Could not save preferences on this device.");
    } finally {
      setBusy((prev) => ({ ...prev, prefs: false }));
    }
  };

  const handleEmail = async (e) => {
    e.preventDefault();
    if (!user) return;
    const nextEmail = String(email || "").trim().toLowerCase();
    if (!nextEmail) {
      setStatusMessage("error", "Email is required.");
      return;
    }
    if (nextEmail === String(user.email || "").toLowerCase()) {
      setStatusMessage("info", "Email is unchanged.");
      return;
    }
    try {
      setBusy((prev) => ({ ...prev, email: true }));
      await updateEmail(user, nextEmail);
      setStatusMessage("success", "Email updated.");
    } catch (err) {
      setStatusMessage("error", authErrorMessage(err));
    } finally {
      setBusy((prev) => ({ ...prev, email: false }));
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (!user) return;
    if (password.length < 6) {
      setStatusMessage("error", "Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setStatusMessage("error", "Password confirmation does not match.");
      return;
    }
    try {
      setBusy((prev) => ({ ...prev, password: true }));
      await updatePassword(user, password);
      setStatusMessage("success", "Password updated.");
      setPassword("");
      setConfirmPassword("");
    } catch (err) {
      setStatusMessage("error", authErrorMessage(err));
    } finally {
      setBusy((prev) => ({ ...prev, password: false }));
    }
  };

  const togglePlatform = (key) => {
    setPreferredPlatforms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleLogout = async () => {
    setBusy((prev) => ({ ...prev, logout: true }));
    try {
      await signOut(auth);
      navigate("/login", { replace: true });
    } finally {
      setBusy((prev) => ({ ...prev, logout: false }));
    }
  };

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Settings</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Preferences and Security</h1>
          <p className="text-slate-600 text-base">Manage account details, learning preferences, and appearance.</p>
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiUser className="text-[18px]" />
              <span>Account</span>
            </div>
            <p className="text-sm text-slate-500">Signed in as {user?.email || "-"}</p>
            <form className="space-y-3" onSubmit={handleEmail}>
              <label className="text-sm font-medium text-slate-700">Email
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition"
                />
              </label>
              <button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 text-white font-semibold shadow hover:bg-indigo-700 disabled:opacity-60"
                type="submit"
                disabled={busy.email}
              >
                <FiUser className="text-[18px]" />
                {busy.email ? "Updating..." : "Update Email"}
              </button>
            </form>
            <form className="space-y-3" onSubmit={handlePassword}>
              <div className="flex items-center gap-2 text-slate-700 font-semibold pt-1">
                <FiLock className="text-[18px]" />
                <span>Password</span>
              </div>
              <label className="text-sm font-medium text-slate-700">New password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition"
                />
              </label>
              <label className="text-sm font-medium text-slate-700">Confirm password
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition"
                />
              </label>
              <button
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold shadow hover:bg-slate-800 disabled:opacity-60"
                type="submit"
                disabled={busy.password}
              >
                <FiMoon className="text-[18px]" />
                {busy.password ? "Updating..." : "Change Password"}
              </button>
            </form>
          </div>

          <div className="rounded-2xl bg-white shadow-md p-5 border border-slate-100 space-y-5">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiBell className="text-[18px]" />
              <span>Notifications</span>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-700">Focus reminders</span>
              <input
                type="checkbox"
                checked={notifications.focusReminder}
                onChange={(e) => setNotifications((prev) => ({ ...prev, focusReminder: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-700">Session completion alerts</span>
              <input
                type="checkbox"
                checked={notifications.sessionDone}
                onChange={(e) => setNotifications((prev) => ({ ...prev, sessionDone: e.target.checked }))}
              />
            </label>
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-700">Email digest</span>
              <input
                type="checkbox"
                checked={notifications.emailDigest}
                onChange={(e) => setNotifications((prev) => ({ ...prev, emailDigest: e.target.checked }))}
              />
            </label>

            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiUser className="text-[18px]" />
              <span>Preferred platforms</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {[
                { key: "gfg", label: "GeeksforGeeks" },
                { key: "leetcode", label: "LeetCode" },
                { key: "hackerrank", label: "HackerRank" },
              ].map((platform) => {
                const active = preferredPlatforms[platform.key];
                return (
                  <button
                    key={platform.key}
                    type="button"
                    onClick={() => togglePlatform(platform.key)}
                    className={`px-3 py-2 rounded-xl border font-semibold ${
                      active
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-slate-50 text-slate-600"
                    }`}
                  >
                    {platform.label}
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiMoon className="text-[18px]" />
              <span>Theme</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
              {[
                { key: "light", label: "Light", icon: FiSun },
                { key: "dark", label: "Dark", icon: FiMoon },
                { key: "system", label: "System", icon: FiMonitor },
              ].map((opt) => {
                const Icon = opt.icon;
                const active = theme === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => setTheme(opt.key)}
                    className={`flex items-center justify-center gap-2 px-3 py-2 rounded-xl border font-semibold ${
                      active
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-slate-200 bg-slate-50 text-slate-700"
                    }`}
                  >
                    <Icon className="text-[16px]" />
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={persistPreferences}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-800 font-semibold hover:bg-slate-50 disabled:opacity-60"
              disabled={busy.prefs}
            >
              <FiSave className="text-[16px]" />
              {busy.prefs ? "Saving..." : "Save Preferences"}
            </button>

            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiLogOut className="text-[18px]" />
              <span>Session</span>
            </div>
            <button
              onClick={handleLogout}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-rose-600 text-white font-semibold shadow hover:bg-rose-700 disabled:opacity-60"
              disabled={busy.logout}
            >
              <FiLogOut className="text-[18px]" />
              {busy.logout ? "Logging Out..." : "Logout"}
            </button>

            {status.message && (
              <div
                className={`text-sm font-semibold ${
                  status.type === "error"
                    ? "text-rose-600"
                    : status.type === "success"
                    ? "text-emerald-600"
                    : "text-slate-600"
                }`}
              >
                {status.message}
              </div>
            )}
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}
