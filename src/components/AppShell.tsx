import { NavLink, Outlet } from "react-router-dom";
import ToastHost from "./ToastHost";
import { cx } from "./ui";

function TabLink(props: { to: string; label: string; end?: boolean }) {
  return (
    <NavLink
      to={props.to}
      end={props.end}
      className={({ isActive }) =>
        cx(
          "w-full text-center text-sm px-3 py-2 rounded-2xl transition",
          isActive
            ? "bg-white/10 text-white"
            : "text-white/70 hover:text-white hover:bg-white/6"
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
      <ToastHost />

      <div className="fixed inset-0 -z-10">
        <div className="absolute inset-0 bg-gradient-to-b from-black via-zinc-950 to-black" />
        <div className="absolute inset-0 opacity-[0.07] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.14)_1px,transparent_0)] [background-size:26px_26px]" />
        <div className="absolute -top-48 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-violet-500/14 blur-3xl" />
        <div className="absolute -top-10 right-[-120px] h-[360px] w-[360px] rounded-full bg-fuchsia-500/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-md pb-[calc(112px+env(safe-area-inset-bottom))]">
        <Outlet />
      </div>

      <div className="fixed bottom-0 left-0 right-0 border-t border-white/10 bg-black/70 backdrop-blur">
        <div className="mx-auto max-w-md p-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
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