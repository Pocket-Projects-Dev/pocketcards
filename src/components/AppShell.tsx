import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import ToastHost, { toast } from "./ToastHost";
import { Badge, Button, Card, cx } from "./ui";
import { getPendingCount, onQueueChange, syncPendingQueue } from "../lib/offlineQueue";

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
  const [isOnline, setIsOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [pending, setPending] = useState(getPendingCount());
  const [syncing, setSyncing] = useState(false);

  const banner = useMemo(() => {
    if (!isOnline) {
      return {
        tone: "warn" as const,
        text: pending > 0
          ? `${pending} change${pending === 1 ? "" : "s"} queued. They’ll sync when you’re online.`
          : "You’re offline. New spends and payments will queue locally.",
      };
    }

    if (syncing) {
      return {
        tone: "neutral" as const,
        text: `Syncing ${pending} queued change${pending === 1 ? "" : "s"}…`,
      };
    }

    if (pending > 0) {
      return {
        tone: "good" as const,
        text: `${pending} queued change${pending === 1 ? "" : "s"} ready to sync.`,
      };
    }

    return null;
  }, [isOnline, pending, syncing]);

  const runSync = async () => {
    if (!navigator.onLine || syncing || getPendingCount() === 0) return;

    setSyncing(true);
    const result = await syncPendingQueue();
    setPending(result.pending);
    setSyncing(false);

    if (result.synced > 0) {
      toast(`Synced ${result.synced} queued change${result.synced === 1 ? "" : "s"}`, "success");
    }
  };

  useEffect(() => {
    const updateOnline = () => setIsOnline(navigator.onLine);
    const updateQueue = () => setPending(getPendingCount());

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);

    const unsub = onQueueChange(updateQueue);

    const onVisible = () => {
      if (document.visibilityState === "visible") {
        updateOnline();
        updateQueue();
        void runSync();
      }
    };

    document.addEventListener("visibilitychange", onVisible);

    const timer = window.setInterval(() => {
      updateQueue();
      void runSync();
    }, 15000);

    updateQueue();
    void runSync();

    return () => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(timer);
      unsub();
    };
  }, [syncing]);

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
        {banner ? (
          <div className="sticky top-0 z-30 px-4 pt-3">
            <Card className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 text-sm text-white/80">{banner.text}</div>
                <div className="flex items-center gap-2">
                  {banner.tone === "warn" ? <Badge tone="warn">Offline</Badge> : null}
                  {banner.tone === "good" ? <Badge tone="good">Queued</Badge> : null}
                  {isOnline && pending > 0 ? (
                    <Button size="sm" variant="secondary" onClick={() => void runSync()} disabled={syncing}>
                      {syncing ? "Syncing…" : "Sync now"}
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          </div>
        ) : null}

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