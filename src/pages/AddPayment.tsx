import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";

type CardRow = { id: string; name: string; last4: string | null };

function extractMissingColumn(err: any) {
  const msg = String(err?.message || "");
  const m1 = msg.match(/Could not find the '([^']+)' column/i);
  if (m1) return m1[1];
  const m2 = msg.match(/column [^\.]+\.(\w+) does not exist/i);
  if (m2) return m2[1];
  const m3 = msg.match(/column "([^"]+)" does not exist/i);
  if (m3) return m3[1];
  return null;
}

export default function AddPayment() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const nav = useNavigate();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const preCardId = qs.get("card") ?? "";
  const preAmount = qs.get("amount") ?? "";
  const preWithdraw = (qs.get("withdraw") ?? "") === "1";

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [amount, setAmount] = useState(preAmount);
  const [paidOn, setPaidOn] = useState(todayISO());
  const [withdraw, setWithdraw] = useState(preWithdraw);
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

    const paidAtIso = new Date(`${paidOn}T00:00:00.000Z`).toISOString();

    let paymentPayload: any = {
      user_id: userId,
      card_id: cardId,
      amount: amt,
      paid_on: paidOn,
      paid_at: paidAtIso,
    };

    for (let i = 0; i < 10; i++) {
      const { error } = await supabase.from("payments").insert(paymentPayload);

      if (!error) break;

      const missing = extractMissingColumn(error);
      if (missing && missing in paymentPayload) {
        delete paymentPayload[missing];
        continue;
      }

      setBusy(false);
      alert(error.message);
      return;
    }

    if (withdraw) {
      const fundPayload = {
        user_id: userId,
        event_date: paidOn,
        event_type: "withdraw",
        amount: amt,
        note: "Card payment",
      };

      const { error: feErr } = await supabase.from("plan_fund_events").insert(fundPayload);
      if (feErr) {
        setBusy(false);
        alert(`Payment saved, but Fund withdraw failed: ${feErr.message}`);
        nav(`/cards/${cardId}/statement`);
        return;
      }
    }

    setBusy(false);
    nav(`/cards/${cardId}/statement`);
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add payment</div>
        <div className="mt-1 text-sm text-white/60">Optionally withdraw from Plan Fund</div>
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
            <Input value={paidOn} onChange={(e) => setPaidOn(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div className="rounded-3xl bg-black/30 border border-white/10 p-4">
          <div className="text-sm">Withdraw from Fund?</div>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Button variant={withdraw ? "primary" : "secondary"} onClick={() => setWithdraw(true)} type="button">
              Yes
            </Button>
            <Button variant={!withdraw ? "primary" : "secondary"} onClick={() => setWithdraw(false)} type="button">
              No
            </Button>
          </div>
          <div className="mt-2 text-xs text-white/60">
            If Yes, the same amount is recorded as a Fund withdrawal.
          </div>
        </div>

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(amount || 0) <= 0}>
          {busy ? "Saving…" : "Save payment"}
        </Button>
      </Card>
    </div>
  );
}