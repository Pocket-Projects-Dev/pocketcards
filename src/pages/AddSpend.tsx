import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";

type CardRow = { id: string; name: string; last4: string | null };

function missingColumn(err: any, col: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("could not find") && msg.includes(`'${col.toLowerCase()}'`) && msg.includes("schema cache");
}

export default function AddSpend() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;
  const nav = useNavigate();

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(todayISO());
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

    const base: any = {
      user_id: userId,
      card_id: cardId,
      amount: amt,
      spent_on: spentOn,
      is_emi: false,
      emi_plan_id: null,
    };

    const withNote: any = { ...base };
    if (note.trim()) withNote.note = note.trim();

    let { error } = await supabase.from("transactions").insert(withNote);

    if (error && missingColumn(error, "note")) {
      const { error: e2 } = await supabase.from("transactions").insert(base);
      error = e2;
    }

    setBusy(false);

    if (error) return alert(error.message);
    nav("/");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add spend</div>
        <div className="mt-1 text-sm text-white/60">Regular card spend (non-EMI)</div>
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
            <Input value={spentOn} onChange={(e) => setSpentOn(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/60">Note (optional)</div>
          <Input value={note} onChange={(e) => setNote(e.target.value)} className="mt-2" />
        </div>

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(amount || 0) <= 0}>
          {busy ? "Saving…" : "Save spend"}
        </Button>
      </Card>
    </div>
  );
}