import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";

export default function AddIncome() {
  const nav = useNavigate();
  const [amount, setAmount] = useState<string>("");
  const [receivedOn, setReceivedOn] = useState<string>(todayISO());
  const [source, setSource] = useState<string>("Salary");

  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const canSave = useMemo(() => {
    const n = Number(amount);
    return !Number.isNaN(n) && n > 0 && !!receivedOn;
  }, [amount, receivedOn]);

  const save = async () => {
    setErr(null);
    if (!canSave) return setErr("Enter amount and date.");
    setSaving(true);

    const { error } = await supabase.from("income_events").insert({
      received_on: receivedOn,
      amount: Number(amount),
      source: source.trim() || null,
    });

    setSaving(false);
    if (error) return setErr(error.message);
    nav("/");
  };

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add income</h2>
        <button onClick={() => nav(-1)} className="text-sm text-white/70">Back</button>
      </div>

      <div className="mt-4 space-y-3">
        {err ? <div className="rounded-2xl bg-white/5 p-4 text-sm text-red-300">{err}</div> : null}

        <input
          className="w-full rounded-2xl bg-white/5 p-3 outline-none text-lg"
          placeholder="Amount"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />

        <div className="rounded-2xl bg-white/5 p-3">
          <div className="text-xs text-white/70">Received on</div>
          <input
            className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
            type="date"
            value={receivedOn}
            onChange={(e) => setReceivedOn(e.target.value)}
          />
        </div>

        <input
          className="w-full rounded-2xl bg-white/5 p-3 outline-none"
          placeholder="Source (optional)"
          value={source}
          onChange={(e) => setSource(e.target.value)}
        />

        <button
          onClick={save}
          disabled={!canSave || saving}
          className="w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save income"}
        </button>
      </div>
    </div>
  );
}