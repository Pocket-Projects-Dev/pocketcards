import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";
import { createSpend, isOfflineError } from "../lib/dbOps";
import { enqueueAction } from "../lib/offlineQueue";
import { toast } from "../components/ToastHost";

type CardRow = { id: string; name: string; last4: string | null };

export default function AddSpend() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const nav = useNavigate();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const preCardId = qs.get("card") ?? "";
  const cycleMonth = qs.get("m") ?? "";

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

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

  const backTo = cycleMonth ? `/cards/${cardId}/statement?m=${cycleMonth}` : `/cards/${cardId}/statement`;

  const save = async () => {
    if (!userId) return toast("Not signed in", "error");
    if (!cardId) return;

    const amt = Number(amount || 0);
    if (!(amt > 0)) return;

    setBusy(true);

    if (navigator.onLine) {
      const { data: cardMeta, error: ce } = await supabase
        .from("cards")
        .select("credit_limit")
        .eq("id", cardId)
        .single();

      if (!ce && cardMeta) {
        const limit = Number((cardMeta as any).credit_limit || 0) || 0;
        if (limit > 0) {
          const { data: s, error: se } = await supabase
            .from("card_cycle_summary")
            .select("remaining_due")
            .eq("card_id", cardId)
            .maybeSingle();

          if (!se && s) {
            const used = Number((s as any).remaining_due || 0) || 0;
            const left = limit - used;
            if (amt > left) {
              setBusy(false);
              toast(`This spend exceeds available limit. Left: ${left}`, "error");
              return;
            }
          }
        }
      }
    }

    const result = await createSpend({
      userId,
      cardId,
      amount: amt,
      date,
      note,
    });

    if (result.ok) {
      setBusy(false);
      toast("Spend saved", "success");
      nav(backTo);
      return;
    }

    if (isOfflineError(result.error)) {
      enqueueAction({
        type: "create_spend",
        payload: { userId, cardId, amount: amt, date, note },
      });
      setBusy(false);
      toast("No internet. Spend saved locally and will sync later.", "success");
      nav(backTo);
      return;
    }

    setBusy(false);
    toast(result.error, "error");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add spend</div>
        <div className="mt-1 text-sm text-white/60">Saved into the active cycle</div>
      </div>

      <Card className="p-5 space-y-4">
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
            <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/60">Note (optional)</div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2" />
        </div>

        {!navigator.onLine ? (
          <div className="text-xs text-amber-200">
            You’re offline. This spend will be queued locally and synced when you reconnect.
          </div>
        ) : null}

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(amount || 0) <= 0}>
          {busy ? "Saving…" : "Save spend"}
        </Button>
      </Card>
    </div>
  );
}