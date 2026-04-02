import React, { useState } from "react";
import { auth } from "../firebase";
import { updateEmail, updatePassword, signOut } from "firebase/auth";
import GlobalLayout from "../components/GlobalLayout";
import { FiBell, FiMoon, FiUser, FiLogOut } from "react-icons/fi";
import { useNavigate } from "react-router-dom";
import { useTheme } from "../lib/ThemeContext";

export default function Settings() {
  const user = auth.currentUser;
  const { theme, setTheme } = useTheme();
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [notifications, setNotifications] = useState(true);
  const [preferredPlatforms, setPreferredPlatforms] = useState({ gfg: true, leetcode: true, hackerrank: true });
  const [status, setStatus] = useState("");
  const navigate = useNavigate();

  const handleEmail = async (e) => {
    e.preventDefault();
    if (!user || !email) return;
    try {
      await updateEmail(user, email);
      setStatus("Email updated.");
    } catch (err) {
      setStatus(err.message || "Failed to update email.");
    }
  };

  const handlePassword = async (e) => {
    e.preventDefault();
    if (!user || password.length < 6) {
      setStatus("Password must be at least 6 characters.");
      return;
    }
    try {
      await updatePassword(user, password);
      setStatus("Password updated.");
      setPassword("");
    } catch (err) {
      setStatus(err.message || "Failed to update password.");
    }
  };

  const togglePlatform = (key) => {
    setPreferredPlatforms((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <GlobalLayout>
      <div className="space-y-6">
        <div>
          <p className="text-sm font-semibold text-indigo-600">Settings</p>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Preferences and security</h1>
          <p className="text-slate-600 text-base">Update account, notifications, theme, and logout.</p>
        </div>

        <div className="grid gap-5 grid-cols-1 lg:grid-cols-2">
          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100 space-y-3">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiUser className="text-[18px]" />
              <span>Account settings</span>
            </div>
            <form className="space-y-3" onSubmit={handleEmail}>
              <label className="text-sm font-medium text-slate-700">Email
                <input value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition" />
              </label>
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-500 via-purple-500 to-sky-500 text-white font-semibold shadow-lg shadow-indigo-500/25 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-200" type="submit">
                <FiUser className="text-[18px]" />
                Update email
              </button>
            </form>
            <form className="space-y-3" onSubmit={handlePassword}>
              <label className="text-sm font-medium text-slate-700">New password
                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 focus:ring-2 focus:ring-indigo-200 focus:border-indigo-300 transition" />
              </label>
              <button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white font-semibold shadow-lg hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-200" type="submit">
                <FiMoon className="text-[18px]" />
                Change password
              </button>
            </form>
          </div>

          <div className="rounded-2xl bg-white shadow-md hover:shadow-lg hover:-translate-y-1 transition-all duration-200 p-5 border border-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiBell className="text-[18px]" />
              <span>Notification settings</span>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-700">Enable focus reminders</span>
              <input type="checkbox" checked={notifications} onChange={() => setNotifications(!notifications)} />
            </label>

            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiMoon className="text-[18px]" />
              <span>Theme</span>
            </div>
            <label className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-700">Use dark mode</span>
              <input type="checkbox" checked={theme === "dark"} onChange={(e) => setTheme(e.target.checked ? "dark" : "light")} />
            </label>

            <div className="flex items-center gap-2 text-slate-700 font-semibold">
              <FiLogOut className="text-[18px]" />
              <span>Logout</span>
            </div>
            <button
              onClick={async () => { await signOut(auth); navigate("/login", { replace: true }); }}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 via-red-500 to-orange-400 text-white font-semibold shadow-lg shadow-rose-500/25 hover:-translate-y-0.5 hover:shadow-xl active:scale-95 transition-all duration-200"
            >
              <FiLogOut className="text-[18px]" />
              Logout
            </button>

            {status && <div className="text-sm text-emerald-600 font-semibold">{status}</div>}
          </div>
        </div>
      </div>
    </GlobalLayout>
  );
}
