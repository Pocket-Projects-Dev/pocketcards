import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Card, Input } from "../components/ui";
import { deleteSpend, isOfflineError, updateSpend } from "../lib/dbOps";
import { enqueueAction } from "../lib/offlineQueue";
import { toast } from "../components/ToastHost";
import { isoDate } from "../lib/statement";

type SpendRow = {
  id: string;
  card_id: string;
  amount: number;
  note: string | null;
  txn_date?: string | null;
  spent_on?: string | null;
  transaction_date?: string | null;
  date?: string | null;
  created_at?: string | null;
};

export default function EditSpend() {
  const { spendId } = useParams();
  const id = spendId ?? "";

  const nav = useNavigate();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const cardIdFromQs = qs.get("card") ?? "";
  const cycleMonth = qs.get("m") ?? "";

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [cardId, setCardId] = useState(cardIdFromQs);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");

  const backTo = cycleMonth && cardId ? `/cards/${cardId}/statement?m=${cycleMonth}` : cardId ? `/cards/${cardId}/statement` : "/cards";

  useEffect(() => {
    if (!id) return;

    let alive = true;

    (async () => {
      setLoading(true);

      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("id", id)
        .single();

      if (!alive) return;

      if (error) {
        toast(error.message, "error");
        setLoading(false);
        return;
      }

      const row = data as unknown as SpendRow;

      setCardId(String(row.card_id));
      setAmount(String(Number(row.amount || 0)));
      setNote(row.note || "");

      const spendDate =
        row.txn_date ||
        row.spent_on ||
        row.transaction_date ||
        row.date ||
        row.created_at ||
        "";

      setDate(isoDate(spendDate));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const save = async () => {
    if (!id || !cardId) return;

    const amt = Number(amount || 0);
    if (!(amt > 0)) {
      toast("Amount must be greater than 0", "error");
      return;
    }

    setBusy(true);

    const result = await updateSpend({
      spendId: id,
      cardId,
      amount: amt,
      date,
      note,
    });

    if (result.ok) {
      setBusy(false);
      toast("Spend updated", "success");
      nav(backTo);
      return;
    }

    if (isOfflineError(result.error)) {
      enqueueAction({
        type: "update_spend",
        payload: { spendId: id, cardId, amount: amt, date, note },
      });
      setBusy(false);
      toast("No internet. Spend update queued and will sync later.", "success");
      nav(backTo);
      return;
    }

    setBusy(false);
    toast(result.error, "error");
  };

  const remove = async () => {
    if (!id || !cardId) return;

    setBusy(true);

    const result = await deleteSpend({
      spendId: id,
      cardId,
    });

    if (result.ok) {
      setBusy(false);
      toast("Spend deleted", "success");
      nav(backTo);
      return;
    }

    if (isOfflineError(result.error)) {
      enqueueAction({
        type: "delete_spend",
        payload: { spendId: id, cardId },
      });
      setBusy(false);
      toast("No internet. Spend delete queued and will sync later.", "success");
      nav(backTo);
      return;
    }

    setBusy(false);
    toast(result.error, "error");
  };

  if (loading) return <div className="p-4 text-sm text-white/70">Loading…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Edit spend</div>
          <div className="mt-1 text-sm text-white/60">Update or remove this spend</div>
        </div>
        <Link to={backTo}>
          <Button variant="ghost" className="px-3 py-2">Back</Button>
        </Link>
      </div>

      <Card className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Amount</div>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Date</div>
            <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/60">Note</div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2" />
        </div>

        {!navigator.onLine ? (
          <div className="text-xs text-amber-200">
            You’re offline. Changes here will queue locally and sync when you reconnect.
          </div>
        ) : null}

        <Button variant="primary" onClick={save} disabled={busy || Number(amount || 0) <= 0}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-sm text-white/70">Delete spend</div>

        {!confirmDelete ? (
          <Button variant="danger" onClick={() => setConfirmDelete(true)}>
            Delete spend
          </Button>
        ) : (
          <>
            <div className="text-xs text-white/60">
              This removes the spend from this cycle. Continue?
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="danger" onClick={remove} disabled={busy}>
                {busy ? "Deleting…" : "Yes, delete"}
              </Button>
              <Button onClick={() => setConfirmDelete(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}