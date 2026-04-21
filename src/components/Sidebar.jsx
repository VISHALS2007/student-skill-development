import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { FiCalendar, FiLogOut, FiUser, FiSettings, FiLayout, FiBook, FiTool, FiClipboard } from "react-icons/fi";
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
  { id: "allocated-courses", label: "Courses", path: "/allocated-courses", icon: FiClipboard },
  { id: "micro-learning", label: "Micro", path: "/micro-learning", icon: FiBook },
  { id: "manage-skills", label: "My Courses", path: "/manage-skills", icon: FiTool },
  { id: "attendance", label: "Attendance", path: "/attendance", icon: FiCalendar },
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
      <div className="app-sidebar-panel p-4 shadow-sm h-full flex flex-col">
      <div className="flex items-center gap-3 mb-8">
          <img src={logo} alt="Skill Development" className="w-10 h-10 rounded-lg bg-white p-1 border border-slate-200" />
        <div>
            <p className="text-sm text-slate-500">Skill Development</p>
          <p className="text-base font-semibold text-slate-900">Skill Tracker</p>
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
                `app-sidebar-item group relative flex items-center gap-3.5 px-3 py-2.5 text-sm font-semibold tracking-tight transition-all duration-200 border ${
                  isActive
                    ? "is-active border-transparent"
                    : "text-slate-700 border-transparent hover:border-indigo-100"
                }`
              }
            >
              {() => (
                <>
                  <Icon className="text-[18px]" />
                  <span className="font-medium">{item.label}</span>
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      <div className="pt-4 border-t border-slate-200">
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg bg-indigo-600 text-white font-semibold transition-colors hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-300"
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
