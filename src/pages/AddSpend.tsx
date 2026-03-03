import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/date";

type Card = { id: string; name: string };

export default function AddSpend() {
  const nav = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);

  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState<string>("");
  const [txnDate, setTxnDate] = useState<string>(todayISO());
  const [desc, setDesc] = useState("");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoadingCards(true);
      const { data, error } = await supabase.from("cards").select("id,name").order("created_at", { ascending: false });
      if (!error && data && data.length > 0) {
        setCards(data as Card[]);
        setCardId((data as Card[])[0].id);
      }
      setLoadingCards(false);
    })();
  }, []);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !!cardId && !Number.isNaN(n) && n > 0 && !!txnDate;
  }, [cardId, amount, txnDate]);

  const save = async () => {
    setErr(null);
    if (!canSave) {
      setErr("Add a card, amount, and date.");
      return;
    }

    setSaving(true);
    const { error } = await supabase.from("transactions").insert({
      card_id: cardId,
      txn_date: txnDate,
      amount: Number(amount),
      description: desc.trim() || null,
    });
    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    nav("/");
  };

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add spend</h2>
        <button onClick={() => nav(-1)} className="text-sm text-white/70">
          Back
        </button>
      </div>

      {loadingCards ? (
        <div className="mt-4 text-sm text-white/70">Loading cards…</div>
      ) : cards.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-white/70">
          Add a card first.
          <button
            onClick={() => nav("/cards/new")}
            className="mt-3 w-full rounded-2xl bg-white text-black px-4 py-3 font-medium"
          >
            Add card
          </button>
        </div>
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
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
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
            <div className="text-xs text-white/70">Date</div>
            <input
              className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
              type="date"
              value={txnDate}
              onChange={(e) => setTxnDate(e.target.value)}
            />
          </div>

          <input
            className="w-full rounded-2xl bg-white/5 p-3 outline-none"
            placeholder="Description (optional)"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />

          <button
            onClick={save}
            disabled={!canSave || saving}
            className="w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save spend"}
          </button>
        </div>
      )}
    </div>
  );
}