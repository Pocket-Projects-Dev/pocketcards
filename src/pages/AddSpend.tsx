import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";

type CardRow = { id: string; name: string; last4: string | null };

function errorKind(err: any): { kind: "missing" | "notnull" | "other"; column: string | null; message: string } {
  const msg = String(err?.message || "");

  const mMissing1 = msg.match(/Could not find the '([^']+)' column/i);
  if (mMissing1) return { kind: "missing", column: mMissing1[1], message: msg };

  const mMissing2 = msg.match(/column [^\.]+\.(\w+) does not exist/i);
  if (mMissing2) return { kind: "missing", column: mMissing2[1], message: msg };

  const mNotNull = msg.match(/null value in column "([^"]+)".*violates not-null constraint/i);
  if (mNotNull) return { kind: "notnull", column: mNotNull[1], message: msg };

  return { kind: "other", column: null, message: msg };
}

export default function AddSpend() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const nav = useNavigate();
  const location = useLocation();

  const preCardId = useMemo(() => new URLSearchParams(location.search).get("card") ?? "", [location.search]);

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(todayISO());
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

      if (!cardId) {
        const match = list.find((c) => c.id === preCardId);
        setCardId(match?.id ?? list[0]?.id ?? "");
      }
    })();
    return () => {
      alive = false;
    };
  }, [preCardId]);

  const save = async () => {
    if (!userId) return alert("Not signed in.");
    if (!cardId) return;

    const amt = Number(amount || 0);
    if (!(amt > 0)) return;

    setBusy(true);

    const isoAt = new Date(`${date}T00:00:00.000Z`).toISOString();
    const noteVal = note.trim();

    // Provide ALL likely date fields (including required txn_date). Missing fields will be dropped.
    let payload: any = {
      user_id: userId,
      card_id: cardId,
      amount: amt,
      is_emi: false,
      emi_plan_id: null,

      txn_date: date,           // required in your schema
      spent_on: date,
      transaction_date: date,
      date: date,

      spent_at: isoAt,
      txn_at: isoAt,
    };

    if (noteVal) payload.note = noteVal;

    // Retry loop: delete unknown columns; for not-null columns, set known value.
    for (let i = 0; i < 12; i++) {
      const { error } = await supabase.from("transactions").insert(payload);

      if (!error) {
        setBusy(false);
        nav(`/cards/${cardId}/statement`);
        return;
      }

      const info = errorKind(error);

      if (info.kind === "missing" && info.column && info.column in payload) {
        delete payload[info.column];
        continue;
      }

      if (info.kind === "notnull" && info.column) {
        if (info.column === "txn_date") {
          payload.txn_date = date;
          continue;
        }
        // If DB requires some other not-null column, we don't know what to set.
      }

      setBusy(false);
      alert(info.message);
      return;
    }

    setBusy(false);
    alert("Could not save after retries. Schema has required fields we are not setting.");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add spend</div>
        <div className="mt-1 text-sm text-white/60">Saved into the statement cycle</div>
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
            <Input value={date} onChange={(e) => setDate(e.target.value)} type="date" className="mt-2" />
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