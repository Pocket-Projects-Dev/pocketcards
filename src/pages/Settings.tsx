import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card } from "../components/ui";
import { clearPendingQueue, clearSyncHistory, enqueueAction, getPendingCount, getSyncHistory, onQueueChange, onSyncHistoryChange, syncPendingQueue } from "../lib/offlineQueue";
import { isOfflineError, restoreCard } from "../lib/dbOps";
import { toast } from "../components/ToastHost";

type ArchivedCard = {
  id: string;
  name: string;
  last4: string | null;
  archived_at: string | null;
};

type SyncLog = {
  id: string;
  at: string;
  status: "ok" | "error";
  message: string;
  actionType: string;
};

export default function Settings() {
  const [pending, setPending] = useState(getPendingCount());
  const [history, setHistory] = useState<SyncLog[]>(getSyncHistory() as SyncLog[]);
  const [archived, setArchived] = useState<ArchivedCard[]>([]);
  const [busy, setBusy] = useState(false);

  const loadArchived = async () => {
    const { data, error } = await supabase
      .from("cards")
      .select("id,name,last4,archived_at")
      .not("archived_at", "is", null)
      .order("archived_at", { ascending: false });

    if (!error) {
      setArchived((((data as unknown) as any[]) ?? []) as ArchivedCard[]);
    }
  };

  useEffect(() => {
    void loadArchived();

    const unsubQueue = onQueueChange(() => setPending(getPendingCount()));
    const unsubLog = onSyncHistoryChange(() => setHistory(getSyncHistory() as SyncLog[]));

    return () => {
      unsubQueue();
      unsubLog();
    };
  }, []);

  const syncNow = async () => {
    setBusy(true);
    const result = await syncPendingQueue();
    setPending(result.pending);
    setHistory(getSyncHistory() as SyncLog[]);
    setBusy(false);

    if (result.synced > 0) {
      toast(`Synced ${result.synced} queued change${result.synced === 1 ? "" : "s"}`, "success");
    } else if (result.pending === 0) {
      toast("Nothing to sync", "success");
    }
  };

  const restoreArchived = async (id: string) => {
    const result = await restoreCard(id);

    if (result.ok) {
      setArchived((prev) => prev.filter((c) => c.id !== id));
      toast("Card restored", "success");
      return;
    }

    if (isOfflineError(result.error)) {
      enqueueAction({
        type: "restore_card",
        payload: { cardId: id },
      });
      setArchived((prev) => prev.filter((c) => c.id !== id));
      setPending(getPendingCount());
      toast("Offline. Restore queued.", "success");
      return;
    }

    toast(result.error, "error");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Settings</div>
          <div className="mt-1 text-sm text-white/60">Queue, sync, archived cards, legal</div>
        </div>
        <Link to="/">
          <Button variant="ghost" className="px-3 py-2">Back</Button>
        </Link>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/70">Offline queue</div>
          <Badge tone={pending > 0 ? "warn" : "good"}>{pending} pending</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={() => void syncNow()} disabled={busy}>
            {busy ? "Syncing…" : "Sync now"}
          </Button>
          <Button
            variant="secondary"
            onClick={() => {
              clearPendingQueue();
              setPending(0);
              toast("Pending queue cleared", "success");
            }}
          >
            Clear queue
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/70">Sync history</div>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearSyncHistory();
              setHistory([]);
              toast("Sync history cleared", "success");
            }}
          >
            Clear
          </Button>
        </div>

        {history.length === 0 ? (
          <div className="text-sm text-white/60">No sync history yet.</div>
        ) : (
          <div className="space-y-2">
            {history.slice(0, 20).map((h) => (
              <div key={h.id} className="rounded-3xl bg-black/30 border border-white/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm">{h.actionType}</div>
                  <Badge tone={h.status === "ok" ? "good" : "danger"}>
                    {h.status === "ok" ? "OK" : "Error"}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-white/60">{new Date(h.at).toLocaleString()}</div>
                <div className="mt-2 text-xs text-white/70">{h.message}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-sm text-white/70">Archived cards</div>

        {archived.length === 0 ? (
          <div className="text-sm text-white/60">No archived cards.</div>
        ) : (
          <div className="space-y-2">
            {archived.map((c) => (
              <div key={c.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-base">
                    {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    Archived {c.archived_at ? new Date(c.archived_at).toLocaleDateString() : ""}
                  </div>
                </div>
                <Button size="sm" variant="primary" onClick={() => void restoreArchived(c.id)}>
                  Restore
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-sm text-white/70">Legal</div>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/privacy"><Button className="w-full">Privacy</Button></Link>
          <Link to="/terms"><Button className="w-full">Terms</Button></Link>
        </div>
      </Card>
    </div>
  );
}