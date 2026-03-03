import { Link, Outlet, useLocation } from "react-router-dom";

function NavItem({ to, label }: { to: string; label: string }) {
  const { pathname } = useLocation();
  const active = pathname === to;

  return (
    <Link
      to={to}
      className={`flex-1 py-3 text-center text-sm ${
        active ? "text-white" : "text-white/60"
      }`}
    >
      {label}
    </Link>
  );
}

export default function AppShell() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto w-full max-w-md pb-20">
        <Outlet />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 bg-black/80 backdrop-blur border-t border-white/10">
        <div className="mx-auto max-w-md flex">
          <NavItem to="/" label="Home" />
          <NavItem to="/cards" label="Cards" />
          <NavItem to="/add" label="Add" />
        </div>
      </nav>
    </div>
  );
}