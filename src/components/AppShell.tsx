import { NavLink, Outlet } from "react-router-dom";

function TabLink(props: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      className={({ isActive }) =>
        `text-sm px-3 py-2 rounded-xl ${isActive ? "bg-white/10 text-white" : "text-white/70"}`
      }
    >
      {props.label}
    </NavLink>
  );
}

export default function AppShell() {
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-md pb-24">
        <Outlet />
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/90 backdrop-blur">
        <div className="mx-auto max-w-md flex items-center justify-around p-3">
          <TabLink to="/" label="Home" end />
          <TabLink to="/cards" label="Cards" />
          <TabLink to="/add" label="Add" />
        </div>
      </div>
    </div>
  );
}