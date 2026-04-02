import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

const ThemeContext = createContext(null);
const THEME_KEY = "app:theme";

const getSystemTheme = () => {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
};

const getInitialTheme = () => {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch (err) {
    /* ignore */
  }
  return "system";
};

const applyTheme = (theme) => {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  const root = document.documentElement;
  const body = document.body;
  const isDark = resolved === "dark";
  root.classList.toggle("theme-dark", isDark);
  root.classList.toggle("theme-light", !isDark);
  root.classList.toggle("dark-mode", isDark);
  body.classList.toggle("theme-dark", isDark);
  body.classList.toggle("theme-light", !isDark);
  body.classList.toggle("dark-mode", isDark);
  root.style.colorScheme = isDark ? "dark" : "light";
};

export const ThemeProvider = ({ children }) => {
  const [theme, setTheme] = useState(getInitialTheme);
  const [resolvedTheme, setResolvedTheme] = useState(getSystemTheme());

  useEffect(() => {
    applyTheme(theme);
    setResolvedTheme(theme === "system" ? getSystemTheme() : theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* ignore */
    }
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      if (theme === "system") {
        applyTheme("system");
        setResolvedTheme(getSystemTheme());
      }
    };
    media.addEventListener("change", handler);
    return () => media.removeEventListener("change", handler);
  }, [theme]);

  const value = useMemo(() => ({ theme, resolvedTheme, setTheme }), [theme, resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
};
