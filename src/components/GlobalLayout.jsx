import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import { useTheme } from "../lib/ThemeContext";

const GlobalLayout = ({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onSearchSubmit,
}) => {
  const location = useLocation();
  const { resolvedTheme } = useTheme();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const backgroundClass =
    resolvedTheme === "dark"
      ? "bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950"
      : "bg-gradient-to-b from-[#f8fafc] via-[#eef2f7] to-[#e2e8f0]";

  return (
    <div className={`min-h-screen ${backgroundClass} px-4 sm:px-6 py-6 sm:py-8`}>
      <div className="relative max-w-7xl mx-auto flex lg:flex-row flex-col gap-6 lg:gap-8">
        <div className="hidden lg:block w-64 shrink-0">
          <Sidebar />
        </div>

        <Sidebar isMobile isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

        <div className="flex-1 flex flex-col gap-6 lg:gap-8">
          <Header
            onMenuToggle={() => setIsMobileMenuOpen((open) => !open)}
            isMenuOpen={isMobileMenuOpen}
            searchValue={searchValue}
            onSearchChange={onSearchChange}
            searchPlaceholder={searchPlaceholder}
            onSearchSubmit={onSearchSubmit}
          />
          <motion.main
            key={location.pathname}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="space-y-6 sm:space-y-8"
          >
            {children}
          </motion.main>
        </div>
      </div>
    </div>
  );
};

export default GlobalLayout;
