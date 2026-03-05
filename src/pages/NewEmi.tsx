import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildEmiSchedule } from "../lib/emi";
import { formatINR, todayISO } from "../lib/format";
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
    if (statementMonth === todayISO().slice(0, 7)) setStatementMonth(purchaseDate.slice(0, 7));
  }, [purchaseDate]);

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

  const insertPlan = async (payload: any, tenureField: string, rateField: string) => {
    let p = { ...payload };

    for (let attempt = 0; attempt < 6; attempt++) {
      const { data, error } = await supabase.from("emi_plans").insert(p).select("id").single();
      if (!error && data?.id) return { id: String(data.id), payloadUsed: p };

      const missing = extractMissingColumn(error);
      if (missing && missing in p) {
        if (missing === tenureField || missing === rateField) return { id: null, payloadUsed: null };
        delete p[missing];
        continue;
      }

      return { id: null, payloadUsed: null, fatal: error?.message || "Failed to create EMI plan" };
    }

    return { id: null, payloadUsed: null };
  };

  const insertEmiTransaction = async (planId: string, amountNum: number) => {
    const purchaseAtIso = new Date(`${purchaseDate}T00:00:00.000Z`).toISOString();

    const base: any = {
      user_id: userId,
      card_id: cardId,
      amount: amountNum,
      is_emi: true,
      emi_plan_id: planId,
      note: "EMI conversion",
    };

    const dateCandidates: Array<{ field: string; value: any }> = [
      { field: "spent_on", value: purchaseDate },
      { field: "spent_at", value: purchaseAtIso },
      { field: "transaction_date", value: purchaseDate },
      { field: "date", value: purchaseDate },
    ];

    for (const c of dateCandidates) {
      let payload: any = { ...base, [c.field]: c.value };

      for (let attempt = 0; attempt < 3; attempt++) {
        const { error } = await supabase.from("transactions").insert(payload);
        if (!error) return null;

        const missing = extractMissingColumn(error);
        if (missing && missing in payload) {
          if (missing === c.field) break;
          delete payload[missing];
          continue;
        }

        return error.message;
      }
    }

    return "Could not insert EMI transaction into transactions. Run the SQL fix + reload schema.";
  };

  const save = async () => {
    if (!userId) return alert("Not signed in.");
    if (!cardId) return;

    const P = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);
    if (!(P > 0) || !(m > 0)) return;

    setBusy(true);

    const schedule = buildEmiSchedule({ principal: P, annualRate: r, months: m, firstDueDate });

    const tenureFields = ["months", "tenure", "tenure_months"];
    const rateFields = ["annual_rate", "rate", "interest_rate", "apr"];

    const baseCommon: any = {
      user_id: userId,
      card_id: cardId,
      principal: P,
      first_due_date: firstDueDate,
      monthly_emi: schedule.monthlyEmi,
      total_payable: schedule.totalPayable,
      total_interest: schedule.totalInterest,
      purchase_date: purchaseDate,
      statement_month: statementMonth,
    };

    let planId: string | null = null;
    let fatal: string | null = null;

    for (const tf of tenureFields) {
      for (const rf of rateFields) {
        const payload = { ...baseCommon, [tf]: m, [rf]: r };

        const res = await insertPlan(payload, tf, rf);
        if (res.fatal) {
          fatal = res.fatal;
          break;
        }
        if (res.id) {
          planId = res.id;
          break;
        }
      }
      if (fatal || planId) break;
    }

    if (fatal) {
      setBusy(false);
      alert(fatal);
      return;
    }

    if (!planId) {
      setBusy(false);
      alert("Could not create EMI plan. Your emi_plans table is missing expected columns. Run the SQL fix + reload schema.");
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

    const txErr = await insertEmiTransaction(planId, P);
    if (txErr) {
      setBusy(false);
      alert(txErr);
      return;
    }

    setBusy(false);
    nav(`/cards/${cardId}/statement`);
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Convert to EMI</div>
        <div className="mt-1 text-sm text-white/60">Tagged to a card + statement month</div>
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
            <div className="text-xs text-white/60">First installment due date</div>
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