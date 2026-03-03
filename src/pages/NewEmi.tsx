import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { buildEmiSchedule } from "../lib/emi";
import { todayISO } from "../lib/format";

type Card = { id: string; name: string };
type CycleRow = { card_id: string; due_date: string };

export default function NewEmi() {
  const nav = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [cardId, setCardId] = useState("");

  const [merchant, setMerchant] = useState("");
  const [principal, setPrincipal] = useState<string>("");
  const [annualRate, setAnnualRate] = useState<string>("14");
  const [months, setMonths] = useState<string>("12");
  const [purchaseDate, setPurchaseDate] = useState<string>(todayISO());
  const [firstDueDate, setFirstDueDate] = useState<string>(todayISO());

  const [preview, setPreview] = useState<{ emi: number; total: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("cards").select("id,name").order("created_at", { ascending: false });
      const list = (data as Card[]) ?? [];
      setCards(list);
      if (list[0]) setCardId(list[0].id);
    })();
  }, []);

  useEffect(() => {
    (async () => {
      if (!cardId) return;
      const { data } = await supabase
        .from("card_cycle_summary")
        .select("card_id,due_date")
        .eq("card_id", cardId)
        .maybeSingle();

      const row = data as CycleRow | null;
      if (row?.due_date) setFirstDueDate(row.due_date);
    })();
  }, [cardId]);

  const canSave = useMemo(() => {
    const p = Number(principal);
    const r = Number(annualRate);
    const n = Number(months);
    return !!cardId && !Number.isNaN(p) && p > 0 && !Number.isNaN(r) && r >= 0 && !Number.isNaN(n) && n > 0 && !!firstDueDate;
  }, [cardId, principal, annualRate, months, firstDueDate]);

  useEffect(() => {
    if (!canSave) return setPreview(null);
    const p = Number(principal);
    const r = Number(annualRate);
    const n = Number(months);
    const s = buildEmiSchedule({ principal: p, annualRate: r, months: n, firstDueDate });
    setPreview({ emi: s.monthlyEmi, total: s.totalPayable });
  }, [canSave, principal, annualRate, months, firstDueDate]);

  const save = async () => {
    setErr(null);
    if (!canSave) return setErr("Fill card, principal, rate, months, and first due date.");
    setSaving(true);

    const p = Number(principal);
    const r = Number(annualRate);
    const n = Number(months);
    const schedule = buildEmiSchedule({ principal: p, annualRate: r, months: n, firstDueDate });

    const { data: planRow, error: planErr } = await supabase
      .from("emi_plans")
      .insert({
        card_id: cardId,
        merchant: merchant.trim() || null,
        principal: p,
        annual_interest_rate: r,
        tenure_months: n,
        first_due_date: firstDueDate,
        monthly_emi: schedule.monthlyEmi,
        total_payable: schedule.totalPayable,
        total_interest: schedule.totalInterest,
        status: "active",
      })
      .select("id")
      .single();

    if (planErr || !planRow?.id) {
      setSaving(false);
      return setErr(planErr?.message || "Failed to create EMI plan.");
    }

    const planId = planRow.id as string;

    const { error: instErr } = await supabase.from("emi_installments").insert(
      schedule.installments.map((x) => ({
        emi_plan_id: planId,
        installment_no: x.installmentNo,
        due_date: x.dueDate,
        principal_component: x.principal,
        interest_component: x.interest,
        amount: x.amount,
      }))
    );

    if (instErr) {
      setSaving(false);
      return setErr(instErr.message);
    }

    const { error: txnErr } = await supabase.from("transactions").insert({
      card_id: cardId,
      txn_date: purchaseDate,
      amount: p,
      description: merchant.trim() ? `EMI purchase: ${merchant.trim()}` : "EMI purchase",
      is_emi: true,
      emi_plan_id: planId,
    });

    setSaving(false);
    if (txnErr) return setErr(txnErr.message);

    nav("/");
  };

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Add EMI</h2>
        <button onClick={() => nav(-1)} className="text-sm text-white/70">Back</button>
      </div>

      <div className="mt-4 space-y-3">
        {err ? <div className="rounded-2xl bg-white/5 p-4 text-sm text-red-300">{err}</div> : null}

        {cards.length === 0 ? (
          <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/70">Add a card first.</div>
        ) : (
          <>
            <div className="rounded-2xl bg-white/5 p-3">
              <div className="text-xs text-white/70">Card</div>
              <select
                className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
                value={cardId}
                onChange={(e) => setCardId(e.target.value)}
              >
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            <input
              className="w-full rounded-2xl bg-white/5 p-3 outline-none"
              placeholder="Merchant / Note (optional)"
              value={merchant}
              onChange={(e) => setMerchant(e.target.value)}
            />

            <input
              className="w-full rounded-2xl bg-white/5 p-3 outline-none text-lg"
              placeholder="Principal"
              inputMode="decimal"
              value={principal}
              onChange={(e) => setPrincipal(e.target.value)}
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-white/70">Annual interest %</div>
                <input
                  className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
                  inputMode="decimal"
                  value={annualRate}
                  onChange={(e) => setAnnualRate(e.target.value)}
                />
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-white/70">Tenure (months)</div>
                <input
                  className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
                  inputMode="numeric"
                  value={months}
                  onChange={(e) => setMonths(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-white/70">Purchase date</div>
                <input
                  className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                />
              </div>
              <div className="rounded-2xl bg-white/5 p-3">
                <div className="text-xs text-white/70">First due date</div>
                <input
                  className="mt-2 w-full rounded-xl bg-black/40 p-3 outline-none"
                  type="date"
                  value={firstDueDate}
                  onChange={(e) => setFirstDueDate(e.target.value)}
                />
              </div>
            </div>

            {preview ? (
              <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/80">
                Estimated EMI: {preview.emi.toFixed(2)} / month • Total: {preview.total.toFixed(2)}
              </div>
            ) : null}

            <button
              onClick={save}
              disabled={!canSave || saving}
              className="w-full rounded-2xl bg-white text-black px-4 py-3 font-medium disabled:opacity-60"
            >
              {saving ? "Saving…" : "Create EMI"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}