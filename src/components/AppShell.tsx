import { NavLink, Outlet } from "react-router-dom";
import { cx } from "./ui";

function TabLink(props: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      className={({ isActive }) =>
        cx(
          "w-full text-center text-sm px-3 py-2 rounded-2xl transition",
          isActive ? "bg-white/10 text-white" : "text-white/70 hover:text-white hover:bg-white/5"
        )
      }
    >
      {props.label}
    </NavLink>
  );
}

export default function AppShell() {
  return (
    <div className="min-h-screen text-white">
      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />
        <div className="absolute inset-0 opacity-[0.09] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:26px_26px]" />
        <div className="absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-violet-500/15 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md pb-28">
        <Outlet />
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/70 backdrop-blur">
        <div className="mx-auto max-w-md p-3">
          <div className="grid grid-cols-3 gap-2 rounded-3xl bg-white/5 border border-white/10 p-2">
            <TabLink to="/" label="Home" end />
            <TabLink to="/cards" label="Cards" />
            <TabLink to="/add" label="Add" />
          </div>
        </div>
      </div>
    </div>
  );
}