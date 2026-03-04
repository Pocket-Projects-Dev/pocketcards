import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { formatDateShort, formatINR } from "../lib/format";
import { Button, Card, ProgressBar } from "../components/ui";

type CardRow = { id: string; name: string; last4: string | null };

type EmiPlan = {
  id: string;
  card_id: string;
  principal: number;
  months: number | null;
  monthly_emi: number;
  created_at: string;
};

type EmiInstallment = {
  id: string;
  emi_plan_id: string;
  due_date: string;
  amount: number;
  paid_at: string | null;
};

function isMissingColumn(err: any, field: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(field.toLowerCase());
}

export default function Emis() {
  const [cards, setCards] = useState<CardRow[]>([]);
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

      const { data: c, error: ce } = await supabase
        .from("cards")
        .select("id,name,last4")
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (ce) {
        setErr(ce.message);
        setLoading(false);
        return;
      }
      setCards(((c as any[]) ?? []) as CardRow[]);

      const monthFields = ["months", "tenure", "tenure_months"];
      let usedMonthField: string | null = null;
      let planData: any[] = [];

      for (const f of monthFields) {
        const { data, error } = await supabase
          .from("emi_plans")
          .select(`id,card_id,principal,${f},monthly_emi,created_at`)
          .order("created_at", { ascending: false });

        if (!alive) return;

        if (!error) {
          usedMonthField = f;
          planData = (data as any[]) ?? [];
          break;
        }

        if (!isMissingColumn(error, f)) {
          setErr(error.message);
          setLoading(false);
          return;
        }
      }

      if (!usedMonthField) {
        const { data, error } = await supabase
          .from("emi_plans")
          .select("id,card_id,principal,monthly_emi,created_at")
          .order("created_at", { ascending: false });

        if (!alive) return;
        if (error) {
          setErr(error.message);
          setLoading(false);
          return;
        }
        planData = (data as any[]) ?? [];
      }

      const normalizedPlans: EmiPlan[] = planData.map((p: any) => ({
        id: String(p.id),
        card_id: String(p.card_id),
        principal: Number(p.principal || 0),
        months: usedMonthField ? Number(p[usedMonthField] || 0) : null,
        monthly_emi: Number(p.monthly_emi || 0),
        created_at: String(p.created_at),
      }));

      setPlans(normalizedPlans);

      const planIds = normalizedPlans.map((x) => x.id);
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

      setInstallments(((ins as any[]) ?? []) as EmiInstallment[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const cardById = useMemo(() => {
    const m = new Map<string, CardRow>();
    for (const c of cards) m.set(c.id, c);
    return m;
  }, [cards]);

  const installmentsByPlan = useMemo(() => {
    const map = new Map<string, EmiInstallment[]>();
    for (const it of installments) {
      const arr = map.get(it.emi_plan_id) ?? [];
      arr.push(it);
      map.set(it.emi_plan_id, arr);
    }
    return map;
  }, [installments]);

  const togglePaid = async (id: string, nextPaid: boolean) => {
    setBusyId(id);
    setErr(null);

    const paidAt = nextPaid ? new Date().toISOString() : null;
    const { error } = await supabase.from("emi_installments").update({ paid_at: paidAt }).eq("id", id);

    if (error) {
      setErr(error.message);
      setBusyId(null);
      return;
    }

    setInstallments((prev) => prev.map((x) => (x.id === id ? { ...x, paid_at: paidAt } : x)));
    setBusyId(null);
  };

  if (loading) return <div className="p-4 text-sm text-white/70">Loading EMIs…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">EMIs</div>
          <div className="mt-1 text-sm text-white/60">Installments and payment tracking</div>
        </div>
      </div>

      {err ? (
        <Card className="p-4 text-sm text-red-300">
          {err}
        </Card>
      ) : null}

      {plans.length === 0 ? (
        <Card className="p-5 text-sm text-white/70">No EMI plans yet.</Card>
      ) : null}

      {plans.map((plan) => {
        const card = cardById.get(plan.card_id);
        const ins = installmentsByPlan.get(plan.id) ?? [];

        const paidCount = ins.filter((x) => x.paid_at).length;
        const totalCount = ins.length;
        const nextUnpaid = ins.find((x) => !x.paid_at);
        const progress = totalCount > 0 ? paidCount / totalCount : 0;

        return (
          <Card key={plan.id} className="p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm text-white/60">
                  {card ? `${card.name}${card.last4 ? ` •••• ${card.last4}` : ""}` : "Card"}
                </div>
                <div className="mt-1 text-xl font-semibold">{formatINR(plan.monthly_emi)} / mo</div>
                <div className="mt-1 text-xs text-white/60">
                  Principal {formatINR(plan.principal)}
                  {plan.months ? ` • ${plan.months} months` : ""}
                  {nextUnpaid ? ` • Next ${formatDateShort(nextUnpaid.due_date)}` : " • Completed"}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-white/60">
                  {paidCount}/{totalCount} paid
                </div>
                <div className="mt-2 w-28">
                  <ProgressBar value={progress} />
                </div>
              </div>
            </div>

            <div className="space-y-2">
              {ins.slice(0, 8).map((it) => {
                const isPaid = !!it.paid_at;
                const disabled = busyId === it.id;

                return (
                  <div key={it.id} className="flex items-center justify-between rounded-2xl bg-black/30 border border-white/10 p-3">
                    <div>
                      <div className="text-sm">{formatDateShort(it.due_date)}</div>
                      <div className="mt-1 text-xs text-white/60">{formatINR(it.amount)}</div>
                    </div>
                    <Button
                      variant={isPaid ? "secondary" : "primary"}
                      disabled={disabled}
                      onClick={() => togglePaid(it.id, !isPaid)}
                      className="px-3 py-2"
                    >
                      {isPaid ? "Paid" : "Mark paid"}
                    </Button>
                  </div>
                );
              })}
              {ins.length > 8 ? <div className="text-xs text-white/60">Showing next 8 installments.</div> : null}
            </div>
          </Card>
        );
      })}
    </div>
  );
}