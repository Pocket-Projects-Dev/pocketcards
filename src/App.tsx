import { Routes, Route, Navigate } from "react-router-dom";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Cards from "./pages/Cards";
import NewCard from "./pages/NewCard";
import AddHub from "./pages/AddHub";
import AddSpend from "./pages/AddSpend";
import AddPayment from "./pages/AddPayment";
import AddIncome from "./pages/AddIncome";
import NewEmi from "./pages/NewEmi";
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
        <Route path="/cards" element={<Cards />} />
        <Route path="/cards/new" element={<NewCard />} />

        <Route path="/add" element={<AddHub />} />
        <Route path="/add/spend" element={<AddSpend />} />
        <Route path="/add/payment" element={<AddPayment />} />
        <Route path="/add/income" element={<AddIncome />} />
        <Route path="/add/emi" element={<NewEmi />} />
      </Route>

      <Route path="*" element={<Navigate to={session ? "/" : "/login"} replace />} />
    </Routes>
  );
}