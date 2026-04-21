import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useLocation } from "react-router-dom";
import Sidebar from "./Sidebar";
import Header from "./Header";
import LiveTimerBubble from "./LiveTimerBubble";

const GlobalLayout = ({
  children,
  searchValue,
  onSearchChange,
  searchPlaceholder,
  onSearchSubmit,
}) => {
  const location = useLocation();
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

  return (
    <div className="ui-shell min-h-screen overflow-x-hidden bg-transparent px-3 sm:px-4 lg:px-6 py-4 sm:py-5 lg:py-6">
      <div className="ui-page relative mx-auto flex max-w-[1460px] flex-col items-start gap-4 lg:flex-row lg:gap-6">
        <div className="hidden lg:block w-64 shrink-0">
          <Sidebar />
        </div>

        <Sidebar isMobile isOpen={isMobileMenuOpen} onClose={() => setIsMobileMenuOpen(false)} />

        <div className="ui-main flex w-full min-w-0 flex-1 flex-col gap-4 sm:gap-5 lg:gap-6">
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
      <LiveTimerBubble />
    </div>
  );
};

export default GlobalLayout;
