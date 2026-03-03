import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function NewCard() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [last4, setLast4] = useState("");
  const [creditLimit, setCreditLimit] = useState<string>("");
  const [closeDay, setCloseDay] = useState<number>(10);
  const [dueDay, setDueDay] = useState<number>(15);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const save = async () => {
    setErr(null);

    if (!name.trim()) {
      setErr("Card name is required.");
      return;
    }
    if (closeDay < 1 || closeDay > 28 || dueDay < 1 || dueDay > 28) {
      setErr("Close day and due day must be between 1 and 28.");
      return;
    }
    if (last4 && !/^\d{4}$/.test(last4)) {
      setErr("Last4 must be exactly 4 digits.");
      return;
    }

    setSaving(true);

    const payload: any = {
      name: name.trim(),
      issuer: issuer.trim() || null,
      last4: last4.trim() || null,
      close_day: closeDay,
      due_day: dueDay,
      credit_limit: creditLimit ? Number(creditLimit) : null,
    };

    const { error } = await supabase.from("cards").insert(payload);
    setSaving(false);

    if (error) {
      setErr(error.message);
      return;
    }

    nav("/cards");
  };

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add card</h2>
        <button onClick={() => nav(-1)} className="text-sm text-white/70">
          Back
        </button>
      </div>

      {err ? <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-red-300">{err}</div> : null}

      <div className="mt-4 space-y-3">
        <input
          className="w-full rounded-2xl bg-white/5 p-3 outline-none"
          placeholder="Card name (e.g., HDFC Regalia)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <input
          className="w-full rounded-2xl bg-white/5 p-3 outline-none"
          placeholder="Issuer (optional)"
          value={issuer}
          onChange={(e) => setIssuer(e.target.value)}
        />
        <input
          className="w-full rounded-2xl bg-white/5 p-3 outline-none"
          placeholder="Last 4 digits (optional)"
          inputMode="numeric"
          value={last4}
          onChange={(e) => setLast4(e.target.value)}
        />
        <input
          className="w-full rounded-2xl bg-white/5 p-3 outline-none"
          placeholder="Credit limit (optional)"
          inputMode="decimal"
          value={creditLimit}
          onChange={(e) => setCreditLimit(e.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs text-white/70">Statement close day</div>
            <input
              className="mt-2 w-full rounded-xl bg-black/40 p-2 outline-none"
              type="number"
              min={1}
              max={28}
              value={closeDay}
              onChange={(e) => setCloseDay(Number(e.target.value))}
            />
          </div>
          <div className="rounded-2xl bg-white/5 p-3">
            <div className="text-xs text-white/70">Payment due day</div>
            <input
              className="mt-2 w-full rounded-xl bg-black/40 p-2 outline-none"
              type="number"
              min={1}
              max={28}
              value={dueDay}
              onChange={(e) => setDueDay(Number(e.target.value))}
            />
          </div>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}