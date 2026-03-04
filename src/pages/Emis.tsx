import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDateShort, formatINR } from "../lib/format";

type EmiPlan = {
  id: string;
  card_id: string;
  principal: number;
  months: number;
  monthly_emi: number;
  created_at: string;
  cards?: { name: string } | null;
};

type EmiInstallment = {
  id: string;
  emi_plan_id: string;
  due_date: string;
  amount: number;
  paid_at: string | null;
};

export default function Emis() {
  const [plans, setPlans] = useState<EmiPlan[]>([]);
  const [installments, setInstallments] = useState<EmiInstallment[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: p, error: pe } = await supabase
        .from("emi_plans")
        .select("id,card_id,principal,months,monthly_emi,created_at,cards(name)")
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (pe) {
        setErr(pe.message);
        setLoading(false);
        return;
      }

      const planRows = ((p as any[]) ?? []) as EmiPlan[];
      setPlans(planRows);

      const planIds = planRows.map((x) => x.id);
      if (planIds.length === 0) {
        setInstallments([]);
        setLoading(false);
        return;
      }

      const { data: ins, error: ie } = await supabase
        .from("emi_installments")
        .select("id,emi_plan_id,due_date,amount,paid_at")
        .in("emi_plan_id", planIds)
        .order("due_date", { ascending: true });

      if (!alive) return;
      if (ie) {
        setErr(ie.message);
        setLoading(false);
        return;
      }

      setInstallments((((ins as any[]) ?? []) as EmiInstallment[]));
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const installmentsByPlan = useMemo(() => {
    const map = new Map<string, EmiInstallment[]>();
    for (const it of installments) {
      const arr = map.get(it.emi_plan_id) ?? [];
      arr.push(it);
      map.set(it.emi_plan_id, arr);
    }
    return map;
  }, [installments]);

  async function togglePaid(installmentId: string, nextPaid: boolean) {
    setBusyId(installmentId);
    setErr(null);

    const nextPaidAt = nextPaid ? new Date().toISOString() : null;

    const { error } = await supabase
      .from("emi_installments")
      .update({ paid_at: nextPaidAt })
      .eq("id", installmentId);

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    setInstallments((prev) =>
      prev.map((x) => (x.id === installmentId ? { ...x, paid_at: nextPaidAt } : x))
    );
    setBusyId(null);
  }

  if (loading) return <div className="p-4 text-sm text-white/70">Loading EMIs…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">EMIs</h2>
      </div>

      {err ? (
        <div className="rounded-2xl bg-white/5 p-3 text-sm text-red-300">{err}</div>
      ) : null}

      {plans.length === 0 ? (
        <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/70">No EMI plans yet.</div>
      ) : null}

      {plans.map((plan) => {
        const ins = installmentsByPlan.get(plan.id) ?? [];
        const paidCount = ins.filter((x) => x.paid_at).length;
        const nextUnpaid = ins.find((x) => !x.paid_at);

        return (
          <div key={plan.id} className="rounded-2xl bg-white/5 p-4 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="text-sm text-white/70">{plan.cards?.name ?? "Card"}</div>
                <div className="mt-1 text-base font-semibold">{formatINR(plan.monthly_emi)} / mo</div>
                <div className="mt-1 text-xs text-white/60">
                  Principal {formatINR(plan.principal)} · {plan.months} months · Next{" "}
                  {nextUnpaid ? formatDateShort(nextUnpaid.due_date) : "Completed"}
                </div>
              </div>
              <div className="text-xs text-white/60">
                {paidCount}/{ins.length} paid
              </div>
            </div>

            <div className="space-y-2">
              {ins.slice(0, 12).map((it) => {
                const isPaid = !!it.paid_at;
                const disabled = busyId === it.id;

                return (
                  <div key={it.id} className="flex items-center justify-between rounded-2xl bg-black/40 p-3">
                    <div>
                      <div className="text-sm">{formatDateShort(it.due_date)}</div>
                      <div className="text-xs text-white/70">{formatINR(it.amount)}</div>
                    </div>
                    <button
                      disabled={disabled}
                      onClick={() => togglePaid(it.id, !isPaid)}
                      className={`text-xs rounded-xl px-3 py-2 bg-white/5 ${disabled ? "opacity-60" : ""}`}
                    >
                      {isPaid ? "Paid" : "Mark paid"}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}