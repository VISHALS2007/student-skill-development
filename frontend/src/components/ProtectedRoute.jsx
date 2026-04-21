import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../lib/AuthContext";

const INTERACTIVE_LOGIN_KEY = "interactiveLogin:v1";

export default function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const hasInteractiveLogin =
    typeof window !== "undefined" &&
    String(sessionStorage.getItem(INTERACTIVE_LOGIN_KEY) || "") === "1";

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "linear-gradient(180deg,#f6f8ff 0%, #eef2ff 100%)",
          fontSize: "16px",
          color: "#475569",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>⏳</div>
          <div>Loading...</div>
        </div>
      </div>
    );
  }

  if (!user || !hasInteractiveLogin) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
