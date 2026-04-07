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

  const backgroundClass = resolvedTheme === "dark" ? "bg-slate-950" : "bg-transparent";

  return (
    <div className={`ui-shell min-h-screen ${backgroundClass} px-4 lg:px-6 py-6`}>
      <div className="ui-page relative max-w-7xl mx-auto flex lg:flex-row flex-col items-start gap-6">
        <div className="hidden lg:block w-64 shrink-0">
          <Sidebar />
        </div>

        <Sidebar isMobile isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

        <div className="ui-main flex-1 w-full min-w-0 flex flex-col gap-6">
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
            className="w-full min-w-0 space-y-6"
          >
            {children}
          </motion.main>
        </div>
      </div>
    </div>
  );
};

export default GlobalLayout;
