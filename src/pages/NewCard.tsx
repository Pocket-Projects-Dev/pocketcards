import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";

export default function NewCard() {
  const { session } = useSession();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [last4, setLast4] = useState("");
  const [closeDay, setCloseDay] = useState("25");
  const [dueDay, setDueDay] = useState("5");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    const userId = session?.user?.id;

    const { error } = await supabase.from("cards").insert({
      user_id: userId,
      name: name.trim(),
      issuer: issuer.trim() || null,
      last4: last4.trim() || null,
      close_day: Number(closeDay || 0),
      due_day: Number(dueDay || 0),
    });

    setBusy(false);
    if (error) return alert(error.message);
    nav("/cards");
  };

  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">Add card</h2>

      <div className="rounded-2xl bg-white/5 p-4 space-y-3">
        <div>
          <div className="text-xs text-white/70">Card name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
        </div>

        <div>
          <div className="text-xs text-white/70">Issuer (optional)</div>
          <input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <div className="text-xs text-white/70">Last 4</div>
            <input value={last4} onChange={(e) => setLast4(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
          <div className="col-span-1">
            <div className="text-xs text-white/70">Close day</div>
            <input value={closeDay} onChange={(e) => setCloseDay(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
          <div className="col-span-1">
            <div className="text-xs text-white/70">Due day</div>
            <input value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
        </div>

        <button onClick={save} disabled={busy || !name.trim()} className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm">
          {busy ? "Saving…" : "Save card"}
        </button>
      </div>
    </div>
  );
}