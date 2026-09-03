import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider, useApp } from "./lib/AppContext";
import LoginScreen from "./auth/LoginScreen";
import ActivateScreen from "./auth/ActivateScreen";
import CoachShell from "./coach/CoachShell";
import ClientApp from "./client/ClientApp";

function RequireRole({ role, children }) {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  if (currentUser.role !== role) return <Navigate to={currentUser.role === "coach" ? "/coach" : "/app"} replace />;
  return children;
}

function RootRedirect() {
  const { currentUser } = useApp();
  if (!currentUser) return <Navigate to="/login" replace />;
  return <Navigate to={currentUser.role === "coach" ? "/coach" : "/app"} replace />;
}

function Routed() {
  return (
    <Routes>
      <Route path="/login" element={<LoginScreen />} />
      <Route path="/activate" element={<ActivateScreen />} />
      <Route
        path="/coach/*"
        element={
          <RequireRole role="coach">
            <CoachShell />
          </RequireRole>
        }
      />
      <Route
        path="/app/*"
        element={
          <RequireRole role="client">
            <ClientApp />
          </RequireRole>
        }
      />
      <Route path="/" element={<RootRedirect />} />
      <Route path="*" element={<RootRedirect />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <Routed />
      </BrowserRouter>
    </AppProvider>
  );
}
