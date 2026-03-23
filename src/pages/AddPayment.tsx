import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";
import { createPayment, isOfflineError } from "../lib/dbOps";
import { enqueueAction } from "../lib/offlineQueue";
import { computeCycleWindow } from "../lib/statement";
import { toast } from "../components/ToastHost";

type CardRow = { id: string; name: string; last4: string | null };
type CardMeta = { close_day: number; due_day: number };

export default function AddPayment() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const nav = useNavigate();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const preCardId = qs.get("card") ?? "";
  const preAmount = qs.get("amount") ?? "";
  const preWithdraw = (qs.get("withdraw") ?? "") === "1";
  const cycleMonth = qs.get("m") ?? "";
  const maxStr = qs.get("max") ?? "";

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState(preAmount);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [withdraw, setWithdraw] = useState(preWithdraw);
  const [busy, setBusy] = useState(false);
  const [hint, setHint] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id,name,last4")
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error) return;

      const list = (((data as unknown) as any[]) ?? []) as CardRow[];
      setCards(list);

      if (!cardId) {
        const match = list.find((c) => c.id === preCardId);
        setCardId(match?.id ?? list[0]?.id ?? "");
      }
    })();

    return () => {
      alive = false;
    };
  }, [preCardId]);

  useEffect(() => {
    if (!cycleMonth || !cardId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("close_day,due_day")
        .eq("id", cardId)
        .single();

      if (!alive) return;
      if (error) return;

      const meta = data as unknown as CardMeta;
      const w = computeCycleWindow(cycleMonth, Number(meta.close_day || 0), Number(meta.due_day || 0));
      setHint(`This payment counts if the date is between ${w.payStart} and ${w.dueDate}.`);
    })();

    return () => {
      alive = false;
    };
  }, [cycleMonth, cardId]);

  const backTo = cycleMonth ? `/cards/${cardId}/statement?m=${cycleMonth}` : `/cards/${cardId}/statement`;

  const save = async () => {
    if (!userId) return toast("Not signed in", "error");
    if (!cardId) return;

    const amt = Number(amount || 0);
    if (!(amt > 0)) return;

    let maxAllowed = Number(maxStr || 0) || 0;

    if (navigator.onLine) {
      if (!(maxAllowed > 0)) {
        const { data, error } = await supabase
          .from("card_cycle_summary")
          .select("remaining_due")
          .eq("card_id", cardId)
          .maybeSingle();

        if (!error && data) maxAllowed = Number((data as any).remaining_due || 0) || 0;
      }

      if (maxAllowed > 0 && amt > maxAllowed) {
        toast(`Payment exceeds remaining due (${maxAllowed}). Reduce amount.`, "error");
        return;
      }

      if (cycleMonth) {
        const { data, error } = await supabase
          .from("cards")
          .select("close_day,due_day")
          .eq("id", cardId)
          .single();

        if (!error && data) {
          const meta = data as any;
          const w = computeCycleWindow(cycleMonth, Number(meta.close_day || 0), Number(meta.due_day || 0));
          if (!(paidOn >= w.payStart && paidOn <= w.dueDate)) {
            toast(`Pick a date between ${w.payStart} and ${w.dueDate} to count for this cycle.`, "error");
            return;
          }
        }
      }
    } else if (maxAllowed > 0 && amt > maxAllowed) {
      toast(`Payment exceeds remaining due (${maxAllowed}). Reduce amount.`, "error");
      return;
    }

    setBusy(true);

    const result = await createPayment({
      userId,
      cardId,
      amount: amt,
      paidOn,
      withdrawFund: withdraw,
    });

    if (result.ok) {
      setBusy(false);
      toast("Payment saved", "success");
      nav(backTo);
      return;
    }

    if (isOfflineError(result.error)) {
      enqueueAction({
        type: "create_payment",
        payload: { userId, cardId, amount: amt, paidOn, withdrawFund: withdraw },
      });
      setBusy(false);
      toast("No internet. Payment saved locally and will sync later.", "success");
      nav(backTo);
      return;
    }

    setBusy(false);
    toast(result.error, "error");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add payment</div>
        <div className="mt-1 text-sm text-white/60">Counts against the active cycle</div>
      </div>

      <Card className="p-5 space-y-4">
        {hint ? <div className="text-xs text-white/60">{hint}</div> : null}

        <div>
          <div className="text-xs text-white/60">Card</div>
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)} className="mt-2">
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Amount</div>
            <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Date</div>
            <Input value={paidOn} onChange={(e) => setPaidOn(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div className="rounded-3xl bg-black/30 border border-white/10 p-4">
          <div className="text-sm">Withdraw from Fund?</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant={withdraw ? "primary" : "secondary"} onClick={() => setWithdraw(true)} type="button">
              Yes
            </Button>
            <Button variant={!withdraw ? "primary" : "secondary"} onClick={() => setWithdraw(false)} type="button">
              No
            </Button>
          </div>
        </div>

        {!navigator.onLine ? (
          <div className="text-xs text-amber-200">
            You’re offline. This payment will be queued locally and synced when you reconnect.
          </div>
        ) : null}

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(amount || 0) <= 0}>
          {busy ? "Saving…" : "Save payment"}
        </Button>
      </Card>
    </div>
  );
}