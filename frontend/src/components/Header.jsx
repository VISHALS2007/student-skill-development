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
    <header className="ui-card ui-topbar flex flex-col gap-3 px-4 sm:px-6 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full min-w-0 items-center gap-3 sm:w-auto">
        <button
          className="ui-icon-btn inline-flex lg:hidden items-center justify-center p-2.5 rounded-lg transition-all duration-200"
          onClick={onMenuToggle}
          aria-label="Toggle menu"
        >
          <FiMenu className="text-[20px]" />
          <span className="sr-only">{isMenuOpen ? "Close menu" : "Open menu"}</span>
        </button>
        <div className="ui-topbar-title min-w-0 truncate text-lg font-bold leading-tight text-slate-900 sm:text-xl md:text-2xl">
          Skill Tracker
        </div>
      </div>

      <div className="flex w-full min-w-0 items-center justify-between gap-2 sm:w-auto sm:justify-end sm:gap-3">
        <div className="ui-search-field hidden md:flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3.5 py-2 text-sm md:max-w-[24rem] lg:w-[280px]">
          <FiSearch className="text-slate-400 text-[18px]" />
          <input
            className="bg-transparent outline-none w-full placeholder:text-slate-400"
            placeholder={searchPlaceholder}
            value={typeof onSearchChange === "function" ? searchValue ?? "" : undefined}
            onChange={typeof onSearchChange === "function" ? (e) => onSearchChange(e.target.value) : undefined}
            onKeyDown={typeof onSearchSubmit === "function" ? handleKeyDown : undefined}
          />
        </div>
        <button className="ui-icon-btn shrink-0 p-2.5 rounded-lg transition-all duration-200">
          <FiBell className="text-[18px]" />
        </button>
        <div className="ui-profile-pill flex min-w-0 max-w-[160px] items-center gap-2 rounded-lg px-3 py-2 sm:max-w-[240px] lg:max-w-[260px]">
          {showPhoto ? (
            <img
              src={user.photoURL}
              alt="Profile"
              className="h-9 w-9 shrink-0 rounded-full object-cover"
              onError={() => setAvatarFailed(true)}
              referrerPolicy="no-referrer"
            />
          ) : (
            <div className="ui-avatar-fallback grid h-9 w-9 shrink-0 place-items-center rounded-full text-base font-bold">
              {avatarLetter}
            </div>
          )}
          <div className="hidden min-w-0 items-center gap-1.5 text-sm font-medium text-slate-700 sm:flex">
            <FiUser className="text-slate-400 text-[16px] shrink-0" />
            <span className="truncate">{displayName}</span>
          </div>
        </div>
      </div>
    </header>
  );
}
