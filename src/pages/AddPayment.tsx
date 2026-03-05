import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";

type CardRow = { id: string; name: string; last4: string | null };

function missingColumnName(err: any) {
  const msg = String(err?.message || "");
  const m = msg.match(/Could not find the '([^']+)' column/i);
  return m?.[1] ?? null;
}

export default function AddPayment() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const nav = useNavigate();

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [paidOn, setPaidOn] = useState(todayISO());
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
      if (!cardId && list[0]?.id) setCardId(list[0].id);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const save = async () => {
    if (!userId) return alert("Not signed in.");
    if (!cardId) return;
    const amt = Number(amount || 0);
    if (!(amt > 0)) return;

    setBusy(true);

    const paidAtIso = new Date(`${paidOn}T00:00:00.000Z`).toISOString();

    let payload: any = {
      user_id: userId,
      card_id: cardId,
      amount: amt,
      paid_on: paidOn,
      paid_at: paidAtIso,
    };

    for (let i = 0; i < 3; i++) {
      const { error } = await supabase.from("payments").insert(payload);
      if (!error) {
        setBusy(false);
        nav("/");
        return;
      }

      const missing = missingColumnName(error);
      if (missing && missing in payload) {
        delete payload[missing];
        continue;
      }

      setBusy(false);
      alert(error.message);
      return;
    }

    setBusy(false);
    alert("Payments table is missing date columns. Ensure paid_on and/or paid_at exist, then reload schema cache.");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add payment</div>
        <div className="mt-1 text-sm text-white/60">Card payment towards statement</div>
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
            <Input value={paidOn} onChange={(e) => setPaidOn(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(amount || 0) <= 0}>
          {busy ? "Saving…" : "Save payment"}
        </Button>
      </Card>
    </div>
  );
}