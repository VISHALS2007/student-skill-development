import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { FiCalendar, FiLogOut, FiUser, FiSettings, FiLayout, FiBook, FiTool } from "react-icons/fi";
import logo from "../assets/logo.svg";

// Icon Components
const DashboardIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="7" height="7" />
    <rect x="14" y="3" width="7" height="7" />
    <rect x="14" y="14" width="7" height="7" />
    <rect x="3" y="14" width="7" height="7" />
  </svg>
);

const navItems = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: FiLayout },
  { id: "micro-learning", label: "Micro Learning", path: "/micro-learning", icon: FiBook },
  { id: "manage-skills", label: "Manage Skills", path: "/manage-skills", icon: FiTool },
  { id: "calendar", label: "Attendance", path: "/calendar", icon: FiCalendar },
  { id: "profile", label: "Profile", path: "/profile", icon: FiUser },
  { id: "settings", label: "Settings", path: "/settings", icon: FiSettings },
];

const Sidebar = ({ isMobile = false, isOpen = false, onClose }) => {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await signOut(auth);
    navigate("/login", { replace: true });
  };

  const content = (
    <div className="rounded-3xl bg-gradient-to-b from-slate-900 via-slate-800 to-slate-900 text-white p-6 shadow-2xl border border-white/10 h-full flex flex-col">
      <div className="flex items-center gap-3 mb-8">
        <img src={logo} alt="Skill Development" className="w-10 h-10 rounded-xl bg-white/10 p-1" />
        <div>
          <p className="text-sm text-slate-200">Skill Development</p>
          <p className="text-base font-semibold">Tracker</p>
        </div>
      </div>

      <div className="space-y-2 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.id}
              to={item.path}
              onClick={() => onClose && onClose()}
              className={({ isActive }) =>
                `group relative flex items-center gap-3.5 px-3.5 py-2.5 rounded-2xl text-sm font-semibold tracking-tight transition-all duration-200 border ${
                  isActive
                    ? "bg-white/10 border-white/20 text-white shadow-lg shadow-indigo-600/15"
                    : "text-slate-200 border-transparent hover:border-white/10 hover:bg-white/5 hover:text-white"
                } hover:-translate-y-0.5`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <span className="absolute left-1 top-1/2 -translate-y-1/2 h-8 w-1.5 rounded-full bg-gradient-to-b from-indigo-300 to-sky-300" />
                  )}
                  <Icon className="text-[18px]" />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      <div className="pt-4 border-t border-white/10">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-rose-500 via-red-500 to-orange-400 text-white font-semibold shadow-lg shadow-rose-500/20 transition-all duration-200 hover:-translate-y-0.5 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-rose-300/80"
        >
          <FiLogOut className="text-[18px]" />
          <span className="font-semibold">Logout</span>
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <>
        <div
          className={`fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-200 lg:hidden ${
            isOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"
          }`}
          onClick={onClose}
        />
        <aside
          className={`fixed inset-y-0 left-0 w-72 max-w-[82vw] px-3 py-4 lg:hidden z-40 transform transition-transform duration-200 ${
            isOpen ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          {content}
        </aside>
      </>
    );
  }

  return (
    <aside className="w-64 shrink-0">
      <div className="sticky top-4">{content}</div>
    </aside>
  );
};

export default Sidebar;
