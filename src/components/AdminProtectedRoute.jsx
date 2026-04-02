import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";
import { getUserProfile } from "../lib/roleHelpers";

const ADMIN_SESSION_KEY = "adminSession:v1";

const hasLocalAdminSession = () => {
  try {
    const raw = localStorage.getItem(ADMIN_SESSION_KEY);
    if (!raw) return false;
    const parsed = JSON.parse(raw);
    return parsed?.role === "admin";
  } catch (err) {
    return false;
  }
};

export default function AdminProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const [role, setRole] = useState("");
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    if (!user?.uid) {
      setRole("");
      setChecking(false);
      return;
    }
    let active = true;
    const checkRole = async () => {
      try {
        const profile = await getUserProfile(user.uid);
        if (active) setRole(profile?.role || "student");
      } catch (err) {
        if (active) setRole("student");
      } finally {
        if (active) setChecking(false);
      }
    };
    checkRole();
    return () => {
      active = false;
    };
  }, [user?.uid]);

  if (hasLocalAdminSession()) return children;
  if (loading || checking) return null;
  if (!user) return <Navigate to="/login" replace />;
  return role === "admin" ? children : <Navigate to="/dashboard" replace />;
}
