import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { useNavigate } from "react-router-dom";

type Card = { id: string; name: string; last4: string | null };

export default function AddSpend() {
  const { session } = useSession();
  const nav = useNavigate();

  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [spentOn, setSpentOn] = useState(todayISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cards").select("id,name,last4").order("created_at", { ascending: false });
      const list = ((data as any[]) ?? []) as Card[];
      setCards(list);
      if (!cardId && list[0]?.id) setCardId(list[0].id);
    })();
  }, []);

  const save = async () => {
    setBusy(true);
    const userId = session?.user?.id;

    const { error } = await supabase.from("transactions").insert({
      user_id: userId,
      card_id: cardId,
      amount: Number(amount || 0),
      spent_on: spentOn,
      note: note.trim() || null,
      is_emi: false,
      emi_plan_id: null,
    });

    setBusy(false);
    if (error) return alert(error.message);
    nav("/");
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">Add spend</h2>

      <div className="rounded-2xl bg-white/5 p-4 space-y-3">
        <div>
          <div className="text-xs text-white/70">Card</div>
          <select value={cardId} onChange={(e) => setCardId(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2">
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/70">Amount</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
          <div>
            <div className="text-xs text-white/70">Date</div>
            <input value={spentOn} onChange={(e) => setSpentOn(e.target.value)} type="date" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/70">Note (optional)</div>
          <input value={note} onChange={(e) => setNote(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
        </div>

        <button onClick={save} disabled={busy || !cardId || Number(amount || 0) <= 0} className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm">
          {busy ? "Saving…" : "Save spend"}
        </button>
      </div>
    </div>
  );
}