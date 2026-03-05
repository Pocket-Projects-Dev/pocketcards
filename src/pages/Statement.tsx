import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card, Input, ProgressBar, Skeleton, cx } from "../components/ui";
import { formatDateShort, formatINR } from "../lib/format";
import { cacheGet, cacheSet } from "../lib/cache";

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

type StatementCache = {
  spends: SpendRow[];
  payments: PayRow[];
  installments: InstRow[];
  plansThisMonth: PlanRow[];
  fetchedAt: string;
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
  const t = new Date(`${iso}T00:00:00.000Z`).getTime() + delta * 86400000;
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
function daysUntilISO(targetISO: string) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const t = new Date(`${targetISO}T00:00:00.000Z`);
  const diff = t.getTime() - base.getTime();
  return Math.ceil(diff / 86400000);
}

type TLItem = {
  id: string;
  date: string;
  kind: "spend" | "payment" | "emi_due" | "emi_convert";
  title: string;
  subtitle?: string;
  amount: number;
};

function StatementSkeleton() {
  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 w-full">
          <Skeleton className="h-7 w-3/4" />
          <Skeleton className="mt-2 h-4 w-full" />
        </div>
        <Skeleton className="h-7 w-20 rounded-full" />
      </div>

      <Card className="p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-11 w-full" />
      </Card>

      <Card className="p-5 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-2 w-full rounded-full" />
        <div className="grid grid-cols-3 gap-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
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
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const cardKey = useMemo(() => `card:${id}`, [id]);
  const stmtKey = useMemo(() => `stmt:${id}:${month}`, [id, month]);

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
    const dueY = dueSameMonth ? yy : mm === 12 ? yy + 1 : yy;
    const dueM = dueSameMonth ? mm : mm === 12 ? 1 : mm + 1;
    const dueDate = makeDate(dueY, dueM, card.due_day);

    const payStart = cycleStart;
    return { cycleStart, cycleEnd, dueDate, payStart };
  }, [card, month]);

  useEffect(() => {
    if (!id) return;

    const cachedCard = cacheGet<CardRow>(cardKey);
    if (cachedCard) setCard(cachedCard);

    const cachedStmt = cacheGet<StatementCache>(stmtKey);
    if (cachedStmt) {
      setSpends(cachedStmt.spends);
      setPayments(cachedStmt.payments);
      setInstallments(cachedStmt.installments);
      setPlansThisMonth(cachedStmt.plansThisMonth);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    let alive = true;

    (async () => {
      setErr(null);
      setRefreshing(true);

      const { data: c, error: ce } = await supabase
        .from("cards")
        .select("id,name,last4,issuer,close_day,due_day,credit_limit")
        .eq("id", id)
        .single();

      if (!alive) return;

      if (ce) {
        setErr(ce.message);
        setRefreshing(false);
        setLoading(false);
        return;
      }

      const cardRow = c as unknown as CardRow;
      setCard(cardRow);
      cacheSet(cardKey, cardRow, 10 * 60 * 1000);

      const [yy, mm] = month.split("-").map(Number);
      const closeDate = makeDate(yy, mm, cardRow.close_day);
      const prevY = mm === 1 ? yy - 1 : yy;
      const prevM = mm === 1 ? 12 : mm - 1;
      const prevClose = makeDate(prevY, prevM, cardRow.close_day);
      const cycleStart = addDays(prevClose, 1);
      const cycleEnd = closeDate;

      const dueSameMonth = cardRow.due_day > cardRow.close_day;
      const dueY = dueSameMonth ? yy : mm === 12 ? yy + 1 : yy;
      const dueM = dueSameMonth ? mm : mm === 12 ? 1 : mm + 1;
      const dueDate = makeDate(dueY, dueM, cardRow.due_day);

      const dateFields = ["txn_date", "spent_on", "spent_at", "transaction_date", "date", "created_at"];
      let txRows: any[] = [];
      let usedField: string | null = null;

      for (const f of dateFields) {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("card_id", cardRow.id)
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
        setRefreshing(false);
        setLoading(false);
        return;
      }

      const spendsNext: SpendRow[] = txRows.map((r) => ({
        id: String(r.id),
        date: usedField ? isoDate(r[usedField]) : isoDate(r.created_at),
        amount: Number(r.amount || 0),
        note: r.note ? String(r.note) : null,
      }));

      const { data: allPlans, error: ape } = await supabase
        .from("emi_plans")
        .select("id")
        .eq("card_id", cardRow.id);

      if (!alive) return;
      if (ape) {
        setErr(ape.message);
        setRefreshing(false);
        setLoading(false);
        return;
      }

      const planIds = ((((allPlans as unknown) as any[]) ?? []) as any[]).map((x) => String(x.id));

      let installmentsNext: InstRow[] = [];
      if (planIds.length > 0) {
        const { data: ins, error: ie } = await supabase
          .from("emi_installments")
          .select("id,emi_plan_id,due_date,amount,paid_at")
          .in("emi_plan_id", planIds)
          .eq("due_date", dueDate);

        if (!alive) return;
        if (ie) {
          setErr(ie.message);
          setRefreshing(false);
          setLoading(false);
          return;
        }

        installmentsNext = ((((ins as unknown) as any[]) ?? []) as any[]).map((r) => ({
          id: String(r.id),
          emi_plan_id: String(r.emi_plan_id),
          due_date: String(r.due_date),
          amount: Number(r.amount || 0),
          paid_at: r.paid_at ? String(r.paid_at) : null,
        }));
      }

      const { data: pay, error: pae } = await supabase
        .from("payments")
        .select("*")
        .eq("card_id", cardRow.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (!alive) return;
      if (pae) {
        setErr(pae.message);
        setRefreshing(false);
        setLoading(false);
        return;
      }

      const paymentsNext: PayRow[] = ((((pay as unknown) as any[]) ?? []) as any[]).map((r) => ({
        id: String(r.id),
        amount: Number(r.amount || 0),
        paid_on: r.paid_on ? String(r.paid_on) : null,
        paid_at: r.paid_at ? String(r.paid_at) : null,
        created_at: String(r.created_at),
      }));

      let plansNext: PlanRow[] = [];
      const { data: p, error: pe } = await supabase
        .from("emi_plans")
        .select("id,principal,monthly_emi,purchase_date,statement_month")
        .eq("card_id", cardRow.id)
        .eq("statement_month", month)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (pe) {
        const missing = extractMissingColumn(pe);
        if (missing !== "statement_month" && missing !== "purchase_date") {
          setErr(pe.message);
          setRefreshing(false);
          setLoading(false);
          return;
        }
      } else {
        plansNext = ((((p as unknown) as any[]) ?? []) as any[]).map((r) => ({
          id: String(r.id),
          principal: Number(r.principal || 0),
          monthly_emi: Number(r.monthly_emi || 0),
          purchase_date: r.purchase_date ? String(r.purchase_date) : null,
          statement_month: r.statement_month ? String(r.statement_month) : null,
        }));
      }

      setSpends(spendsNext);
      setInstallments(installmentsNext);
      setPayments(paymentsNext);
      setPlansThisMonth(plansNext);

      cacheSet(
        stmtKey,
        {
          spends: spendsNext,
          payments: paymentsNext,
          installments: installmentsNext,
          plansThisMonth: plansNext,
          fetchedAt: new Date().toISOString(),
        },
        2 * 60 * 1000
      );

      setRefreshing(false);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id, month, cardKey, stmtKey]);

  const totals = useMemo(() => {
    if (!computed) return null;

    const spendTotal = spends.reduce((s, x) => s + Number(x.amount || 0), 0);
    const emiTotal = installments.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalDue = spendTotal + emiTotal;

    const paidTotal = payments
      .filter((p) => {
        const d = dateFromPayment(p);
        return d >= computed.payStart && d <= computed.dueDate;
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const remaining = Math.max(0, totalDue - paidTotal);
    return { spendTotal, emiTotal, totalDue, paidTotal, remaining };
  }, [computed, spends, installments, payments]);

  const payRemaining = totals ? Math.ceil(Number(totals.remaining || 0)) : 0;
  const progress = totals && totals.totalDue > 0 ? Math.max(0, Math.min(1, totals.paidTotal / totals.totalDue)) : 0;

  const dueDays = computed ? daysUntilISO(computed.dueDate) : 0;
  const dueTone = dueDays <= 3 ? "danger" : dueDays <= 7 ? "warn" : "neutral";

  const timeline = useMemo(() => {
    if (!computed) return [] as TLItem[];

    const items: TLItem[] = [];

    for (const s of spends) {
      items.push({
        id: `sp_${s.id}`,
        date: s.date,
        kind: "spend",
        title: "Spend",
        subtitle: s.note || undefined,
        amount: Number(s.amount || 0),
      });
    }

    for (const p of payments) {
      const d = dateFromPayment(p);
      if (d < computed.payStart || d > computed.dueDate) continue;
      items.push({
        id: `pay_${p.id}`,
        date: d,
        kind: "payment",
        title: "Payment recorded",
        amount: Number(p.amount || 0),
      });
    }

    for (const i of installments) {
      items.push({
        id: `emi_${i.id}`,
        date: i.due_date,
        kind: "emi_due",
        title: "EMI billed",
        subtitle: i.paid_at ? "Marked paid" : "Unpaid",
        amount: Number(i.amount || 0),
      });
    }

    for (const p of plansThisMonth) {
      const d = p.purchase_date || computed.cycleStart;
      items.push({
        id: `conv_${p.id}`,
        date: d,
        kind: "emi_convert",
        title: "Converted to EMI",
        subtitle: p.purchase_date ? `Purchase ${formatDateShort(p.purchase_date)}` : undefined,
        amount: Number(p.principal || 0),
      });
    }

    items.sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : b.date.localeCompare(a.date)));
    return items;
  }, [computed, spends, payments, installments, plansThisMonth]);

  if (loading && !card) return <StatementSkeleton />;

  const onMonthChange = (m: string) => {
    setMonth(m);
    nav({ pathname: location.pathname, search: `?m=${encodeURIComponent(m)}` }, { replace: true });
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight truncate">
            {card?.name}{card?.last4 ? ` •••• ${card.last4}` : ""} statement
          </div>
          {computed ? (
            <div className="mt-1 text-sm text-white/60">
              Cycle {computed.cycleStart} → {computed.cycleEnd} • Due {formatDateShort(computed.dueDate)}
              {refreshing ? <span className="ml-2 text-white/40">Refreshing…</span> : null}
            </div>
          ) : null}
        </div>
        {computed ? <Badge tone={dueTone}>Due in {dueDays}d</Badge> : null}
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      <Card className="p-5 space-y-3">
        <div className="text-xs text-white/60">Statement month</div>
        <Input type="month" value={month} onChange={(e) => onMonthChange(e.target.value)} />
      </Card>

      {totals ? (
        <Card className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs text-white/60">Remaining</div>
              <div className="mt-2 text-3xl font-semibold">{formatINR(totals.remaining)}</div>
              <div className="mt-2 text-xs text-white/60">
                Total {formatINR(totals.totalDue)} • Paid {formatINR(totals.paidTotal)}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-white/60">Breakdown</div>
              <div className="mt-2 text-sm text-white/80">Spends {formatINR(totals.spendTotal)}</div>
              <div className="mt-1 text-sm text-white/80">EMI {formatINR(totals.emiTotal)}</div>
            </div>
          </div>

          <ProgressBar value={progress} />

          <div className="grid grid-cols-3 gap-2">
            <Link to={`/add/spend?card=${card?.id ?? ""}&m=${month}`}>
              <Button className="w-full" size="sm">Add spend</Button>
            </Link>

            {payRemaining > 0 ? (
              <Link to={`/add/payment?card=${card?.id ?? ""}&m=${month}&amount=${payRemaining}&max=${payRemaining}&withdraw=1`}>
                <Button className="w-full" size="sm" variant="primary">Pay remaining</Button>
              </Link>
            ) : (
              <Button className="w-full" size="sm" disabled variant="primary">Paid</Button>
            )}

            <Link to={`/add/emi?card=${card?.id ?? ""}&m=${month}`}>
              <Button className="w-full" size="sm">Convert EMI</Button>
            </Link>
          </div>

          {computed ? (
            <div className="text-xs text-white/50">
              Payments count if recorded between {computed.payStart} and {computed.dueDate}.
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-5">
        <div className="text-sm text-white/70">Timeline</div>

        {timeline.length === 0 ? (
          <div className="mt-3 space-y-3">
            <div className="text-sm text-white/70">Start your statement</div>
            <div className="text-sm text-white/60">
              Add spends as they happen, then record payments anytime during the cycle until the due date.
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Link to={`/add/spend?card=${card?.id ?? ""}&m=${month}`}>
                <Button className="w-full" size="sm">Add spend</Button>
              </Link>
              <Link to={`/add/payment?card=${card?.id ?? ""}&m=${month}`}>
                <Button className="w-full" size="sm" variant="primary">Add payment</Button>
              </Link>
              <Link to={`/add/emi?card=${card?.id ?? ""}&m=${month}`}>
                <Button className="w-full" size="sm">Convert EMI</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {timeline.map((t) => {
              const chip =
                t.kind === "payment"
                  ? <Badge tone="good">Payment</Badge>
                  : t.kind === "spend"
                  ? <Badge>Spend</Badge>
                  : t.kind === "emi_due"
                  ? <Badge tone="warn">EMI</Badge>
                  : <Badge>Conversion</Badge>;

              const amtTone =
                t.kind === "payment" ? "text-emerald-200" : "text-white";

              const prefix = t.kind === "payment" ? "-" : "";

              return (
                <div key={t.id} className="rounded-3xl bg-black/30 border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        {chip}
                        <div className="text-sm">{formatDateShort(t.date)}</div>
                      </div>
                      <div className="mt-2 text-base">{t.title}</div>
                      {t.subtitle ? <div className="mt-1 text-xs text-white/60 truncate">{t.subtitle}</div> : null}
                    </div>

                    <div className={cx("text-right text-sm font-semibold", amtTone)}>
                      {prefix}{formatINR(t.amount)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}