import { useState } from "react";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { useNavigate } from "react-router-dom";

function isMissingColumn(err: any, field: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(field.toLowerCase());
}

export default function AddIncome() {
  const { session } = useSession();
  const nav = useNavigate();

  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
  const [source, setSource] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const userId = session?.user?.id;

    const dateFields = ["received_on", "event_date", "received_at", "date"];

    for (const field of dateFields) {
      const payload: any = {
        user_id: userId,
        amount: Number(amount || 0),
        source: source.trim() || null,
      };
      payload[field] = date;

      const { error } = await supabase.from("income_events").insert(payload);
      if (!error) {
        setBusy(false);
        nav("/");
        return;
      }
      if (!isMissingColumn(error, field)) {
        setBusy(false);
        alert(error.message);
        return;
      }
    }

    setBusy(false);
    alert("Could not find a valid date column on income_events table. Check schema.");
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">Add income</h2>

      <div className="rounded-2xl bg-white/5 p-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/70">Amount</div>
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
          <div>
            <div className="text-xs text-white/70">Date</div>
            <input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/70">Source (optional)</div>
          <input value={source} onChange={(e) => setSource(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
        </div>

        <button onClick={save} disabled={busy || Number(amount || 0) <= 0} className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm">
          {busy ? "Saving…" : "Save income"}
        </button>
      </div>
    </div>
  );
}