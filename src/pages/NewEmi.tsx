import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildEmiSchedule } from "../lib/emi";
import { formatINR, todayISO } from "../lib/format";
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

export default function NewEmi() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const nav = useNavigate();
  const location = useLocation();
  const preCardId = useMemo(() => new URLSearchParams(location.search).get("card") ?? "", [location.search]);

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [annualRate, setAnnualRate] = useState("14");
  const [months, setMonths] = useState("12");
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [statementMonth, setStatementMonth] = useState(() => todayISO().slice(0, 7));
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

  useEffect(() => {
    if (!cardId) return;
    let alive = true;
    (async () => {
      const { data, error } = await supabase
        .from("card_cycle_summary")
        .select("due_date")
        .eq("card_id", cardId)
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (!error && data?.due_date) setFirstDueDate(String(data.due_date));
    })();
    return () => {
      alive = false;
    };
  }, [cardId]);

  const preview = useMemo(() => {
    const P = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);
    if (P > 0 && m > 0) {
      const s = buildEmiSchedule({ principal: P, annualRate: r, months: m, firstDueDate });
      return { monthlyEmi: s.monthlyEmi, totalPayable: s.totalPayable };
    }
    return null;
  }, [principal, annualRate, months, firstDueDate]);

  const save = async () => {
    if (!userId) return alert("Not signed in.");
    if (!cardId) return;

    const P = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);
    if (!(P > 0) || !(m > 0)) return;

    setBusy(true);

    const schedule = buildEmiSchedule({ principal: P, annualRate: r, months: m, firstDueDate });

    // Create emi_plans with broad compatibility fields. annual_interest_rate is required in your schema.
    let planPayload: any = {
      user_id: userId,
      card_id: cardId,
      principal: P,
      first_due_date: firstDueDate,
      purchase_date: purchaseDate,
      statement_month: statementMonth,

      monthly_emi: schedule.monthlyEmi,
      total_payable: schedule.totalPayable,
      total_interest: schedule.totalInterest,

      months: m,
      tenure: m,
      tenure_months: m,

      annual_interest_rate: r,  // required in your schema
      annual_rate: r,
      rate: r,
      interest_rate: r,
      apr: r,
    };

    let planId: string | null = null;

    for (let i = 0; i < 16; i++) {
      const { data, error } = await supabase.from("emi_plans").insert(planPayload).select("id").single();

      if (!error && data?.id) {
        planId = String(data.id);
        break;
      }

      if (error) {
        const info = errorKind(error);

        if (info.kind === "missing" && info.column && info.column in planPayload) {
          delete planPayload[info.column];
          continue;
        }

        if (info.kind === "notnull" && info.column === "annual_interest_rate") {
          planPayload.annual_interest_rate = r;
          continue;
        }

        setBusy(false);
        alert(info.message);
        return;
      }
    }

    if (!planId) {
      setBusy(false);
      alert("Could not create EMI plan after retries. Schema has required fields we are not setting.");
      return;
    }

    const installmentsPayload = schedule.installments.map((x) => ({
      user_id: userId,
      emi_plan_id: planId,
      due_date: x.due_date,
      amount: x.amount,
      principal_component: x.principal_component,
      interest_component: x.interest_component,
    }));

    const { error: instErr } = await supabase.from("emi_installments").insert(installmentsPayload);
    if (instErr) {
      setBusy(false);
      alert(instErr.message);
      return;
    }

    // Insert the conversion as a card transaction, making sure txn_date is populated.
    const txnAt = new Date(`${purchaseDate}T00:00:00.000Z`).toISOString();
    let txPayload: any = {
      user_id: userId,
      card_id: cardId,
      amount: P,
      is_emi: true,
      emi_plan_id: planId,
      note: "EMI conversion",

      txn_date: purchaseDate,   // required in your schema
      spent_on: purchaseDate,
      transaction_date: purchaseDate,
      date: purchaseDate,

      spent_at: txnAt,
      txn_at: txnAt,
    };

    for (let i = 0; i < 16; i++) {
      const { error } = await supabase.from("transactions").insert(txPayload);
      if (!error) break;

      const info = errorKind(error);
      if (info.kind === "missing" && info.column && info.column in txPayload) {
        delete txPayload[info.column];
        continue;
      }
      if (info.kind === "notnull" && info.column === "txn_date") {
        txPayload.txn_date = purchaseDate;
        continue;
      }

      setBusy(false);
      alert(info.message);
      return;
    }

    setBusy(false);
    nav(`/cards/${cardId}/statement`);
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Convert to EMI</div>
        <div className="mt-1 text-sm text-white/60">Card + statement month</div>
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
            <div className="text-xs text-white/60">Principal</div>
            <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Months</div>
            <Input value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Annual rate (%)</div>
            <Input value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">First installment due</div>
            <Input value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Purchase date</div>
            <Input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} type="date" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Show in statement month</div>
            <Input type="month" value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} className="mt-2" />
          </div>
        </div>

        {preview ? (
          <div className="rounded-3xl bg-black/30 border border-white/10 p-4 text-sm text-white/70">
            EMI {formatINR(preview.monthlyEmi)} / mo • Total {formatINR(preview.totalPayable)}
          </div>
        ) : null}

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(principal || 0) <= 0 || Number(months || 0) <= 0}>
          {busy ? "Creating…" : "Create EMI plan"}
        </Button>
      </Card>
    </div>
  );
}