import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";

type Card = { id: string; name: string };

export default function AddPayment() {
  const nav = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [paidOn, setPaidOn] = useState<string>(todayISO());
  const [notes, setNotes] = useState("");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("cards").select("id,name").order("created_at", { ascending: false });
      const list = (data as Card[]) ?? [];
      setCards(list);
      if (list[0]) setCardId(list[0].id);
      setLoading(false);
    })();
  }, []);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !!cardId && !Number.isNaN(n) && n > 0 && !!paidOn;
  }, [cardId, amount, paidOn]);

  const save = async () => {
    setErr(null);
    if (!canSave) return setErr("Pick a card, amount, and date.");
    setSaving(true);

    const { error } = await supabase.from("payments").insert({
      card_id: cardId,
      paid_on: paidOn,
      amount: Number(amount),
      notes: notes.trim() || null,
    });

    setSaving(false);
    if (error) return setErr(error.message);
    nav("/");
  };

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add payment</h2>
        <button onClick={() => nav(-1)} className="text-sm text-white/70">Back</button>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-white/70">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-white/70">Add a card first.</div>
      ) : (
        <div className="mt-4 space-y-3">
          {err ? <div className="rounded-2xl bg-white/5 p-4 text-sm text-red-300">{err}</div> : null}

          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs text-white/70">Card</div>
            <select
              className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
              value={cardId}
              onChange={(e) => setCardId(e.target.value)}
            >
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <input
            className="w-full rounded-2xl bg-white/5 p-3 outline-none text-lg"
            placeholder="Amount"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />

          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs text-white/70">Paid on</div>
            <input
              className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
              type="date"
              value={paidOn}
              onChange={(e) => setPaidOn(e.target.value)}
            />
          </div>

          <input
            className="w-full rounded-2xl bg-white/5 p-3 outline-none"
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          <button
            onClick={save}
            disabled={!canSave || saving}
            className="w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save payment"}
          </button>
        </div>
      )}
    </div>
  );
}