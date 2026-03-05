import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useNavigate } from "react-router-dom";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input } from "../components/ui";

export default function NewCard() {
  const { session } = useSession();
  const nav = useNavigate();

  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [last4, setLast4] = useState("");
  const [creditLimit, setCreditLimit] = useState("");
  const [closeDay, setCloseDay] = useState("25");
  const [dueDay, setDueDay] = useState("5");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const userId = session?.user?.id;
    if (!userId) return alert("Not signed in.");
    if (!name.trim()) return;

    setBusy(true);

    const limitNum = Number(creditLimit || 0);
    const payload: any = {
      user_id: userId,
      name: name.trim(),
      issuer: issuer.trim() || null,
      last4: last4.trim() || null,
      close_day: Number(closeDay || 0),
      due_day: Number(dueDay || 0),
      credit_limit: creditLimit.trim() ? limitNum : null,
    };

    const { error } = await supabase.from("cards").insert(payload);

    setBusy(false);
    if (error) return alert(error.message);
    nav("/cards");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add card</div>
        <div className="mt-1 text-sm text-white/60">Basics + credit limit</div>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <div className="text-xs text-white/60">Card name</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Issuer (optional)</div>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Last 4 (optional)</div>
            <Input value={last4} onChange={(e) => setLast4(e.target.value)} className="mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="col-span-1">
            <div className="text-xs text-white/60">Limit</div>
            <Input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="numeric" className="mt-2" placeholder="400000" />
          </div>
          <div className="col-span-1">
            <div className="text-xs text-white/60">Close day</div>
            <Input value={closeDay} onChange={(e) => setCloseDay(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div className="col-span-1">
            <div className="text-xs text-white/60">Due day</div>
            <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
        </div>

        <Button variant="primary" onClick={save} disabled={busy || !name.trim()}>
          {busy ? "Saving…" : "Save card"}
        </Button>
      </Card>
    </div>
  );
}