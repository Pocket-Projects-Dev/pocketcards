import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AppShell from "./components/AppShell";
import { useSession } from "./hooks/useSession";

export default function App() {
  const { session, loading } = useSession();

  if (loading) return <div className="min-h-screen bg-black text-white p-4">Loading…</div>;

  return (
    <Routes>
      <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
      <Route element={session ? <AppShell /> : <Navigate to="/login" replace />}>
        <Route path="/" element={<Dashboard />} />
      </Route>
      <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} />
    </Routes>
  );
}