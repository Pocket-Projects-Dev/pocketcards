import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { buildEmiSchedule } from "../lib/emi";
import { formatINR, todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { useNavigate } from "react-router-dom";
import { Button, Card, Input, Select } from "../components/ui";

type CardRow = { id: string; name: string; last4: string | null };

function isMissingColumn(err: any, field: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(field.toLowerCase());
}

export default function NewEmi() {
  const { session } = useSession();
  const nav = useNavigate();

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [annualRate, setAnnualRate] = useState("14");
  const [months, setMonths] = useState("12");
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [busy, setBusy] = useState(false);

  const [preview, setPreview] = useState<{ monthlyEmi: number; totalPayable: number } | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("cards")
        .select("id,name,last4")
        .order("created_at", { ascending: false });

      const list = ((data as any[]) ?? []) as CardRow[];
      setCards(list);
      if (!cardId && list[0]?.id) setCardId(list[0].id);
    })();
  }, []);

  useEffect(() => {
    const p = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);
    if (p > 0 && m > 0) {
      const s = buildEmiSchedule({ principal: p, annualRate: r, months: m, firstDueDate });
      setPreview({ monthlyEmi: s.monthlyEmi, totalPayable: s.totalPayable });
    } else {
      setPreview(null);
    }
  }, [principal, annualRate, months, firstDueDate]);

  const save = async () => {
    setBusy(true);

    const userId = session?.user?.id;
    const P = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);

    const schedule = buildEmiSchedule({ principal: P, annualRate: r, months: m, firstDueDate });

    const basePayload: any = {
      user_id: userId,
      card_id: cardId,
      principal: P,
      annual_rate: r,
      first_due_date: firstDueDate,
      monthly_emi: schedule.monthlyEmi,
      total_payable: schedule.totalPayable,
      total_interest: schedule.totalInterest,
    };

    const monthFields = ["months", "tenure", "tenure_months"];

    let planId: string | null = null;
    for (const f of monthFields) {
      const payload = { ...basePayload, [f]: m };

      const { data, error } = await supabase.from("emi_plans").insert(payload).select("id").single();

      if (!error && data?.id) {
        planId = String(data.id);
        break;
      }

      if (error && !isMissingColumn(error, f)) {
        setBusy(false);
        alert(error.message);
        return;
      }
    }

    if (!planId) {
      setBusy(false);
      alert("Could not create EMI plan: tenure/months column not found on emi_plans.");
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

    const { error: txErr } = await supabase.from("transactions").insert({
      user_id: userId,
      card_id: cardId,
      amount: P,
      spent_on: purchaseDate,
      note: "EMI purchase",
      is_emi: true,
      emi_plan_id: planId,
    });

    if (txErr) {
      setBusy(false);
      alert(txErr.message);
      return;
    }

    setBusy(false);
    nav("/emis");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">New EMI</div>
        <div className="mt-1 text-sm text-white/60">Create plan, generate installments, and link purchase</div>
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
            <div className="text-xs text-white/60">First due date</div>
            <Input value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/60">Purchase date</div>
          <Input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} type="date" className="mt-2" />
        </div>

        {preview ? (
          <div className="rounded-2xl bg-black/30 border border-white/10 p-3 text-sm text-white/70">
            EMI {formatINR(preview.monthlyEmi)} / mo • Total {formatINR(preview.totalPayable)}
          </div>
        ) : null}

        <Button
          variant="primary"
          onClick={save}
          disabled={busy || !cardId || Number(principal || 0) <= 0 || Number(months || 0) <= 0}
        >
          {busy ? "Creating…" : "Create EMI"}
        </Button>
      </Card>
    </div>
  );
}