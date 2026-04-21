import React from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { FiCalendar, FiLogOut, FiUser, FiSettings, FiLayout, FiTool, FiClipboard } from "react-icons/fi";
import logo from "../assets/logo.svg";

const navItems = [
  { id: "dashboard", label: "Dashboard", path: "/dashboard", icon: FiLayout },
  { id: "allocated-courses", label: "Courses", path: "/allocated-courses", icon: FiClipboard },
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
      <div className="ui-sidebar-brand flex items-center gap-3 mb-6">
          <img src={logo} alt="Skill Development" className="ui-logo-tile w-10 h-10 rounded-lg p-1 border" />
        <div className="min-w-0">
            <p className="ui-brand-kicker text-sm">Skill Development</p>
          <p className="ui-brand-title text-base font-semibold">Skill Tracker</p>
        </div>
      </div>

      <p className="ui-sidebar-caption mb-2 px-1">Student Workspace</p>
      <div className="ui-sidebar-menu space-y-2 flex-1 overflow-y-auto pr-1">
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
                    : "text-slate-700 border-transparent"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span className={`ui-sidebar-icon-wrap ${isActive ? "is-active" : ""}`}>
                    <Icon className="text-[17px]" />
                  </span>
                  <span className="ui-sidebar-label font-medium">{item.label}</span>
                  <span className={`ui-sidebar-dot ${isActive ? "is-active" : ""}`} aria-hidden="true" />
                </>
              )}
            </NavLink>
          );
        })}
      </div>

      <div className="ui-sidebar-footer pt-4 border-t border-slate-200">
        <button
          onClick={handleLogout}
          className="ui-logout-btn w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-lg text-white font-semibold transition-colors focus:outline-none focus:ring-2"
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
          className={`fixed inset-y-0 left-0 w-72 max-w-[88vw] px-3 py-4 lg:hidden z-40 transform transition-transform duration-200 ${
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
