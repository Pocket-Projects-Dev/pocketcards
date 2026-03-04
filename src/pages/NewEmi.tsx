import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { buildEmiSchedule } from "../lib/emi";
import { formatINR, todayISO } from "../lib/format";
import { useSession } from "../hooks/useSession";
import { useNavigate } from "react-router-dom";

type Card = { id: string; name: string; last4: string | null };

export default function NewEmi() {
  const { session } = useSession();
  const nav = useNavigate();

  const [cards, setCards] = useState<Card[]>([]);
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
      const { data } = await supabase.from("cards").select("id,name,last4").order("created_at", { ascending: false });
      const list = ((data as any[]) ?? []) as Card[];
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

    const { data: planRow, error: planErr } = await supabase
      .from("emi_plans")
      .insert({
        user_id: userId,
        card_id: cardId,
        principal: P,
        annual_rate: r,
        months: m,
        first_due_date: firstDueDate,
        monthly_emi: schedule.monthlyEmi,
        total_payable: schedule.totalPayable,
        total_interest: schedule.totalInterest,
      })
      .select("id")
      .single();

    if (planErr || !planRow?.id) {
      setBusy(false);
      alert(planErr?.message || "Failed to create EMI plan");
      return;
    }

    const planId = planRow.id as string;

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
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">New EMI</h2>

      <div className="rounded-2xl bg-white/5 p-4 space-y-3">
        <div>
          <div className="text-xs text-white/70">Card</div>
          <select value={cardId} onChange={(e) => setCardId(e.target.value)} className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2">
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/70">Principal</div>
            <input value={principal} onChange={(e) => setPrincipal(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
          <div>
            <div className="text-xs text-white/70">Months</div>
            <input value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/70">Annual rate (%)</div>
            <input value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} inputMode="numeric" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
          <div>
            <div className="text-xs text-white/70">First due date</div>
            <input value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} type="date" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
          </div>
        </div>

        <div>
          <div className="text-xs text-white/70">Purchase date</div>
          <input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} type="date" className="mt-1 w-full rounded-xl bg-black/40 px-3 py-2 outline-none" />
        </div>

        {preview ? (
          <div className="rounded-2xl bg-black/40 p-3 text-sm text-white/70">
            EMI: {formatINR(preview.monthlyEmi)} / mo • Total: {formatINR(preview.totalPayable)}
          </div>
        ) : null}

        <button onClick={save} disabled={busy || !cardId || Number(principal || 0) <= 0 || Number(months || 0) <= 0} className="w-full rounded-2xl bg-white/10 px-4 py-3 text-sm">
          {busy ? "Creating…" : "Create EMI"}
        </button>
      </div>
    </div>
  );
}