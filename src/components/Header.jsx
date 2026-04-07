import React, { useState } from "react";
import { FiBell, FiSearch, FiUser, FiMenu } from "react-icons/fi";
import { useAuth } from "../lib/AuthContext";

export default function Header({
  onMenuToggle,
  isMenuOpen,
  searchValue,
  onSearchChange,
  searchPlaceholder = "Search...",
  onSearchSubmit,
}) {
  const { user } = useAuth();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const displayName = user?.displayName || user?.email || "User";
  const avatarLetter = displayName?.charAt(0)?.toUpperCase() || "U";
  const showPhoto = Boolean(user?.photoURL) && !avatarFailed;

  const handleKeyDown = (event) => {
    if (event.key === "Enter" && typeof onSearchSubmit === "function") {
      onSearchSubmit(searchValue?.trim() || "");
    }
  };

  return (
    <header className="ui-card flex flex-wrap items-center justify-between px-4 sm:px-6 py-4 gap-3">
      <div className="flex items-center gap-3 min-w-0">
        <button
          className="inline-flex lg:hidden items-center justify-center p-2.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-all duration-200"
          onClick={onMenuToggle}
          aria-label="Toggle menu"
        >
          <FiMenu className="text-[20px]" />
          <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
        </button>
        <div className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 leading-tight truncate">Skill Tracker</div>
      </div>

      <div className="flex items-center gap-2 sm:gap-3 min-w-0 ml-auto">
        <div className="hidden md:flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-200 text-sm text-slate-600 w-[38vw] max-w-xs lg:w-64">
          <FiSearch className="text-slate-400 text-[18px]" />
          <input
            className="bg-transparent outline-none w-full placeholder:text-slate-400"
            placeholder={searchPlaceholder}
            value={typeof onSearchChange === "function" ? searchValue ?? "" : undefined}
            onChange={typeof onSearchChange === "function" ? (e) => onSearchChange(e.target.value) : undefined}
            onKeyDown={typeof onSearchSubmit === "function" ? handleKeyDown : undefined}
          />
        </div>
        <button className="p-2.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-all duration-200">
          <FiBell className="text-[18px]" />
        </button>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 min-w-0 max-w-[220px] sm:max-w-[240px]">
          {showPhoto ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="w-9 h-9 rounded-full object-cover shrink-0"
              onError={() => setAvatarFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="w-9 h-9 rounded-full bg-indigo-100 text-indigo-600 grid place-items-center text-base font-bold shrink-0">
              {avatarLetter}
            </div>
          )}
          <div className="text-sm text-slate-700 font-medium flex items-center gap-1.5 min-w-0">
            <FiUser className="text-slate-400 text-[16px] shrink-0" />
            <span className="truncate">{displayName}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
