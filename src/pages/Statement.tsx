import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Button, Card, Input, ProgressBar } from "../components/ui";
import { formatINR } from "../lib/format";

type CardRow = {
  id: string;
  name: string;
  last4: string | null;
  issuer: string | null;
  close_day: number;
  due_day: number;
  credit_limit: number | null;
};

type SpendRow = { id: string; date: string; amount: number; note: string | null };

type PlanRow = {
  id: string;
  principal: number;
  monthly_emi: number;
  purchase_date: string | null;
  statement_month: string | null;
};

type InstRow = {
  id: string;
  emi_plan_id: string;
  due_date: string;
  amount: number;
  paid_at: string | null;
};

type PayRow = {
  id: string;
  amount: number;
  paid_on: string | null;
  paid_at: string | null;
  created_at: string;
};

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

function pad2(n: number) {
  return String(n).padStart(2, "0");
}
function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}
function makeDate(y: number, m: number, d: number) {
  const last = daysInMonth(y, m);
  const dd = Math.min(d, last);
  return `${y}-${pad2(m)}-${pad2(dd)}`;
}
function addDays(iso: string, delta: number) {
  const t = new Date(`${iso}T00:00:00.000Z`).getTime() + delta * 24 * 60 * 60 * 1000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}
function ymNow() {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}
function isoDate(v: any) {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
}
function dateFromPayment(p: PayRow) {
  if (p.paid_on) return p.paid_on;
  if (p.paid_at) return isoDate(p.paid_at);
  return isoDate(p.created_at);
}

export default function Statement() {
  const { cardId } = useParams();
  const id = cardId ?? "";

  const location = useLocation();
  const nav = useNavigate();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qsMonth = qs.get("m") || "";

  const [month, setMonth] = useState(qsMonth || ymNow());
  const [card, setCard] = useState<CardRow | null>(null);

  const [spends, setSpends] = useState<SpendRow[]>([]);
  const [plansThisMonth, setPlansThisMonth] = useState<PlanRow[]>([]);
  const [installments, setInstallments] = useState<InstRow[]>([]);
  const [payments, setPayments] = useState<PayRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (qsMonth && qsMonth !== month) setMonth(qsMonth);
  }, [qsMonth]);

  const computed = useMemo(() => {
    if (!card) return null;

    const [yy, mm] = month.split("-").map(Number);
    const closeDate = makeDate(yy, mm, card.close_day);

    const prevY = mm === 1 ? yy - 1 : yy;
    const prevM = mm === 1 ? 12 : mm - 1;
    const prevClose = makeDate(prevY, prevM, card.close_day);

    const cycleStart = addDays(prevClose, 1);
    const cycleEnd = closeDate;

    const dueSameMonth = card.due_day > card.close_day;
    const dueY = dueSameMonth ? yy : (mm === 12 ? yy + 1 : yy);
    const dueM = dueSameMonth ? mm : (mm === 12 ? 1 : mm + 1);
    const dueDate = makeDate(dueY, dueM, card.due_day);

    // IMPORTANT FIX: payments count from cycleStart (not cycleEnd)
    const payStart = cycleStart;

    return { cycleStart, cycleEnd, dueDate, payStart };
  }, [card, month]);

  useEffect(() => {
    if (!id) return;
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: c, error: ce } = await supabase
        .from("cards")
        .select("id,name,last4,issuer,close_day,due_day,credit_limit")
        .eq("id", id)
        .single();

      if (!alive) return;
      if (ce) {
        setErr(ce.message);
        setLoading(false);
        return;
      }

      setCard((c as unknown) as CardRow);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    if (!card || !computed) return;
    let alive = true;

    (async () => {
      setErr(null);

      const { cycleStart, cycleEnd, dueDate } = computed;

      // Spends (non-EMI), using whatever date column your schema supports
      const dateFields = ["txn_date", "spent_on", "spent_at", "transaction_date", "date", "created_at"];
      let txRows: any[] = [];
      let usedField: string | null = null;

      for (const f of dateFields) {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("card_id", card.id)
          .eq("is_emi", false)
          .gte(f, cycleStart)
          .lte(f, cycleEnd)
          .order(f, { ascending: false });

        if (!alive) return;

        if (!error) {
          txRows = (((data as unknown) as any[]) ?? []) as any[];
          usedField = f;
          break;
        }

        const missing = extractMissingColumn(error);
        if (missing === f) continue;

        setErr(error.message);
        return;
      }

      setSpends(
        txRows.map((r) => ({
          id: String(r.id),
          date: usedField ? isoDate(r[usedField]) : isoDate(r.created_at),
          amount: Number(r.amount || 0),
          note: r.note ? String(r.note) : null,
        }))
      );

      // Get all EMI plan IDs for card
      const { data: allPlans, error: ape } = await supabase
        .from("emi_plans")
        .select("id")
        .eq("card_id", card.id);

      if (!alive) return;
      if (ape) {
        setErr(ape.message);
        return;
      }

      const planIds = ((((allPlans as unknown) as any[]) ?? []) as any[]).map((x) => String(x.id));

      // Installments billed on this statement due date
      if (planIds.length === 0) {
        setInstallments([]);
      } else {
        const { data: ins, error: ie } = await supabase
          .from("emi_installments")
          .select("id,emi_plan_id,due_date,amount,paid_at")
          .in("emi_plan_id", planIds)
          .eq("due_date", dueDate);

        if (!alive) return;
        if (ie) {
          setErr(ie.message);
          return;
        }

        setInstallments(
          ((((ins as unknown) as any[]) ?? []) as any[]).map((r) => ({
            id: String(r.id),
            emi_plan_id: String(r.emi_plan_id),
            due_date: String(r.due_date),
            amount: Number(r.amount || 0),
            paid_at: r.paid_at ? String(r.paid_at) : null,
          }))
        );
      }

      // Payments for card (we filter into statement window in totals)
      const { data: pay, error: pae } = await supabase
        .from("payments")
        .select("*")
        .eq("card_id", card.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!alive) return;
      if (pae) {
        setErr(pae.message);
        return;
      }

      setPayments(
        ((((pay as unknown) as any[]) ?? []) as any[]).map((r) => ({
          id: String(r.id),
          amount: Number(r.amount || 0),
          paid_on: r.paid_on ? String(r.paid_on) : null,
          paid_at: r.paid_at ? String(r.paid_at) : null,
          created_at: String(r.created_at),
        }))
      );

      // EMI conversions tagged to this statement month (optional)
      const { data: p, error: pe } = await supabase
        .from("emi_plans")
        .select("id,principal,monthly_emi,purchase_date,statement_month")
        .eq("card_id", card.id)
        .eq("statement_month", month)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (pe) {
        const missing = extractMissingColumn(pe);
        if (missing === "statement_month" || missing === "purchase_date") {
          setPlansThisMonth([]);
        } else {
          setErr(pe.message);
          return;
        }
      } else {
        setPlansThisMonth(
          ((((p as unknown) as any[]) ?? []) as any[]).map((r) => ({
            id: String(r.id),
            principal: Number(r.principal || 0),
            monthly_emi: Number(r.monthly_emi || 0),
            purchase_date: r.purchase_date ? String(r.purchase_date) : null,
            statement_month: r.statement_month ? String(r.statement_month) : null,
          }))
        );
      }
    })();

    return () => {
      alive = false;
    };
  }, [card, computed, month]);

  const totals = useMemo(() => {
    if (!computed) return null;

    const spendTotal = spends.reduce((s, x) => s + Number(x.amount || 0), 0);
    const emiTotal = installments.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalDue = spendTotal + emiTotal;

    const payStart = computed.payStart; // now cycleStart
    const dueDate = computed.dueDate;

    const paidTotal = payments
      .filter((p) => {
        const d = dateFromPayment(p);
        return d >= payStart && d <= dueDate;
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const remaining = Math.max(0, totalDue - paidTotal);

    return { spendTotal, emiTotal, totalDue, paidTotal, remaining };
  }, [computed, spends, installments, payments]);

  const payRemaining = totals ? Math.ceil(Number(totals.remaining || 0)) : 0;
  const paidProgress = totals && totals.totalDue > 0 ? Math.max(0, Math.min(1, totals.paidTotal / totals.totalDue)) : 0;

  if (loading) return <div className="p-4 text-sm text-white/70">Loading statement…</div>;

  const onMonthChange = (m: string) => {
    setMonth(m);
    nav({ pathname: location.pathname, search: `?m=${encodeURIComponent(m)}` }, { replace: true });
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">
          {card?.name}{card?.last4 ? ` •••• ${card.last4}` : ""} statement
        </div>
        <div className="mt-1 text-sm text-white/60">Cycle → due → actions</div>
      </div>

      <div className="flex gap-2">
        <Link to={`/add/spend?card=${card?.id ?? ""}&m=${month}`} className="flex-1">
          <Button className="w-full">Add spend</Button>
        </Link>

        {payRemaining > 0 ? (
          <Link
            to={`/add/payment?card=${card?.id ?? ""}&m=${month}&amount=${payRemaining}&max=${payRemaining}&withdraw=1`}
            className="flex-1"
          >
            <Button className="w-full">Pay remaining</Button>
          </Link>
        ) : (
          <div className="flex-1">
            <Button className="w-full" disabled>Paid</Button>
          </div>
        )}

        <Link to={`/add/emi?card=${card?.id ?? ""}&m=${month}`} className="flex-1">
          <Button className="w-full">Convert EMI</Button>
        </Link>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      <Card className="p-5 space-y-3">
        <div className="text-xs text-white/60">Statement month</div>
        <Input type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
        {computed ? (
          <div className="text-xs text-white/60">
            Cycle {computed.cycleStart} → {computed.cycleEnd} • Due {computed.dueDate}
          </div>
        ) : null}
      </Card>

      {totals ? (
        <Card className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-white/60">Total due</div>
              <div className="mt-2 text-2xl font-semibold">{formatINR(totals.totalDue)}</div>
              <div className="mt-2 text-xs text-white/60">
                Spends {formatINR(totals.spendTotal)} • EMI {formatINR(totals.emiTotal)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/60">Remaining</div>
              <div className="mt-2 text-2xl font-semibold">{formatINR(totals.remaining)}</div>
              <div className="mt-2 text-xs text-white/60">Paid {formatINR(totals.paidTotal)}</div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between text-xs text-white/60">
              <span>Paid progress</span>
              <span>{formatINR(totals.paidTotal)} / {formatINR(totals.totalDue)}</span>
            </div>
            <div className="mt-2">
              <ProgressBar value={paidProgress} />
            </div>
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="text-sm text-white/70">Spends in cycle</div>
        {spends.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">No spends in this cycle.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {spends.map((s) => (
              <div key={s.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm">{s.date}</div>
                  {s.note ? <div className="mt-1 text-xs text-white/60 truncate">{s.note}</div> : null}
                </div>
                <div className="text-sm font-semibold">{formatINR(s.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">EMI installments billed (due date)</div>
        {installments.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">No EMI installments billed for this statement.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {installments.map((i) => (
              <div key={i.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm">Due {i.due_date}</div>
                  <div className="mt-1 text-xs text-white/60">{i.paid_at ? "Marked paid" : "Unpaid"}</div>
                </div>
                <div className="text-sm font-semibold">{formatINR(i.amount)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">Payments counted for this statement</div>
        {computed ? (
          <div className="mt-2 text-xs text-white/60">
            Counted if payment date is between {computed.payStart} and {computed.dueDate}.
          </div>
        ) : null}

        {computed && payments.filter((p) => {
          const d = dateFromPayment(p);
          return d >= computed.payStart && d <= computed.dueDate;
        }).length === 0 ? (
          <div className="mt-3 text-sm text-white/70">No payments in this statement window.</div>
        ) : computed ? (
          <div className="mt-4 space-y-2">
            {payments
              .filter((p) => {
                const d = dateFromPayment(p);
                return d >= computed.payStart && d <= computed.dueDate;
              })
              .slice(0, 30)
              .map((p) => (
                <div key={p.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                  <div className="text-sm">{dateFromPayment(p)}</div>
                  <div className="text-sm font-semibold">{formatINR(p.amount)}</div>
                </div>
              ))}
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">EMI conversions tagged to this statement (informational)</div>
        {plansThisMonth.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">No EMI conversions tagged to this month.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {plansThisMonth.map((p) => (
              <div key={p.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm">Converted</div>
                  <div className="mt-1 text-xs text-white/60">
                    Purchase {p.purchase_date ?? "—"} • {p.statement_month ?? month}
                  </div>
                </div>
                <div className="text-sm font-semibold">{formatINR(p.principal)}</div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}