import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card, Input, ProgressBar, Skeleton, cx } from "../components/ui";
import { formatDateShort, formatINR } from "../lib/format";
import { cacheGet, cacheSet } from "../lib/cache";
import { computeCycleWindow, daysUntilISO, getCurrentCycleMonth, isoDate } from "../lib/statement";
import { getPendingActions, onQueueChange, type PendingAction } from "../lib/offlineQueue";

type CardRow = {
  id: string;
  name: string;
  last4: string | null;
  issuer: string | null;
  close_day: number;
  due_day: number;
  credit_limit: number | null;
};

type SpendRow = {
  id: string;
  date: string;
  amount: number;
  note: string | null;
  pending?: boolean;
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
  pending?: boolean;
};

type StatementCache = {
  spends: SpendRow[];
  payments: PayRow[];
  installments: InstRow[];
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

function dateFromPayment(p: PayRow) {
  if (p.paid_on) return p.paid_on;
  if (p.paid_at) return isoDate(p.paid_at);
  return isoDate(p.created_at);
}

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
        <Skeleton className="h-4 w-36" />
        <Skeleton className="h-11 w-full" />
      </Card>

      <Card className="p-5 space-y-3">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-10 w-40" />
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

type TLItem = {
  id: string;
  date: string;
  kind: "spend" | "payment" | "emi_due";
  title: string;
  subtitle?: string;
  amount: number;
  spendId?: string;
  pending?: boolean;
};

export default function Statement() {
  const { cardId } = useParams();
  const id = cardId ?? "";

  const location = useLocation();
  const nav = useNavigate();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const qsMonth = qs.get("m") || "";

  const [month, setMonth] = useState(qsMonth || "");
  const [card, setCard] = useState<CardRow | null>(null);

  const [spends, setSpends] = useState<SpendRow[]>([]);
  const [installments, setInstallments] = useState<InstRow[]>([]);
  const [payments, setPayments] = useState<PayRow[]>([]);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [queueTick, setQueueTick] = useState(0);

  const activeMonth = useMemo(() => {
    if (qsMonth) return qsMonth;
    if (month) return month;
    if (card) return getCurrentCycleMonth(card.close_day);
    return "";
  }, [qsMonth, month, card]);

  const cardKey = useMemo(() => `card:${id}`, [id]);
  const stmtKey = useMemo(() => (activeMonth ? `stmt:${id}:${activeMonth}` : ""), [id, activeMonth]);

  const computed = useMemo(() => {
    if (!card || !activeMonth) return null;
    return computeCycleWindow(activeMonth, card.close_day, card.due_day);
  }, [card, activeMonth]);

  const pendingActions = useMemo(() => getPendingActions(), [queueTick]);

  useEffect(() => {
    const unsub = onQueueChange(() => setQueueTick((x) => x + 1));
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!id) return;

    const cachedCard = cacheGet<CardRow>(cardKey);
    if (cachedCard) setCard(cachedCard);

    let alive = true;

    (async () => {
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

      const cardRow = c as unknown as CardRow;
      setCard(cardRow);
      cacheSet(cardKey, cardRow, 10 * 60 * 1000);

      if (!qsMonth && !month) {
        setMonth(getCurrentCycleMonth(cardRow.close_day));
      }
    })();

    return () => {
      alive = false;
    };
  }, [id, qsMonth, month, cardKey]);

  useEffect(() => {
    if (!card || !computed || !stmtKey) return;

    const cachedStmt = cacheGet<StatementCache>(stmtKey);
    if (cachedStmt) {
      setSpends(cachedStmt.spends);
      setPayments(cachedStmt.payments);
      setInstallments(cachedStmt.installments);
      setLoading(false);
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    let alive = true;

    (async () => {
      setErr(null);
      setRefreshing(true);

      const dateFields = ["txn_date", "spent_on", "spent_at", "transaction_date", "date", "created_at"];
      let txRows: any[] = [];
      let usedField: string | null = null;

      for (const f of dateFields) {
        const { data, error } = await supabase
          .from("transactions")
          .select("*")
          .eq("card_id", card.id)
          .eq("is_emi", false)
          .gte(f, computed.cycleStart)
          .lte(f, computed.cycleEnd)
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
        .eq("card_id", card.id);

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
          .eq("due_date", computed.dueDate);

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
        .eq("card_id", card.id)
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

      setSpends(spendsNext);
      setInstallments(installmentsNext);
      setPayments(paymentsNext);

      cacheSet(
        stmtKey,
        {
          spends: spendsNext,
          payments: paymentsNext,
          installments: installmentsNext,
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
  }, [card, computed, stmtKey]);

  const displaySpends = useMemo(() => {
    if (!card || !computed) return spends;

    let next = [...spends];

    const relevant = pendingActions.filter(
      (a) =>
        (a.type === "create_spend" || a.type === "update_spend" || a.type === "delete_spend") &&
        a.payload.cardId === card.id
    );

    for (const a of relevant) {
      if (a.type === "create_spend") {
        if (a.payload.date >= computed.cycleStart && a.payload.date <= computed.cycleEnd) {
          next.unshift({
            id: `pending_${a.id}`,
            date: a.payload.date,
            amount: a.payload.amount,
            note: a.payload.note || "Pending sync",
            pending: true,
          });
        }
      }

      if (a.type === "update_spend") {
        next = next.map((s) =>
          s.id === a.payload.spendId
            ? {
                ...s,
                date: a.payload.date,
                amount: a.payload.amount,
                note: a.payload.note || null,
                pending: true,
              }
            : s
        );
      }

      if (a.type === "delete_spend") {
        next = next.filter((s) => s.id !== a.payload.spendId);
      }
    }

    next = next.filter((s) => s.date >= computed.cycleStart && s.date <= computed.cycleEnd);
    next.sort((a, b) => b.date.localeCompare(a.date));
    return next;
  }, [spends, pendingActions, card, computed]);

  const displayPayments = useMemo(() => {
    if (!card || !computed) return payments;

    let next = [...payments];

    const relevant = pendingActions.filter(
      (a) => a.type === "create_payment" && a.payload.cardId === card.id
    ) as Extract<PendingAction, { type: "create_payment" }>[];

    for (const a of relevant) {
      if (a.payload.paidOn >= computed.payStart && a.payload.paidOn <= computed.dueDate) {
        next.unshift({
          id: `pending_${a.id}`,
          amount: a.payload.amount,
          paid_on: a.payload.paidOn,
          paid_at: null,
          created_at: a.createdAt,
          pending: true,
        });
      }
    }

    return next;
  }, [payments, pendingActions, card, computed]);

  const totals = useMemo(() => {
    if (!computed) return null;

    const spendTotal = displaySpends.reduce((s, x) => s + Number(x.amount || 0), 0);
    const emiTotal = installments.reduce((s, x) => s + Number(x.amount || 0), 0);
    const totalDue = spendTotal + emiTotal;

    const paidTotal = displayPayments
      .filter((p) => {
        const d = dateFromPayment(p);
        return d >= computed.payStart && d <= computed.dueDate;
      })
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    const remaining = Math.max(0, totalDue - paidTotal);
    return { spendTotal, emiTotal, totalDue, paidTotal, remaining };
  }, [computed, displaySpends, installments, displayPayments]);

  const payRemaining = totals ? Math.ceil(Number(totals.remaining || 0)) : 0;
  const progress = totals && totals.totalDue > 0 ? Math.max(0, Math.min(1, totals.paidTotal / totals.totalDue)) : 0;

  const dueDays = computed ? daysUntilISO(computed.dueDate) : 0;
  const dueTone = dueDays <= 3 ? "danger" : dueDays <= 7 ? "warn" : "neutral";

  const timeline = useMemo(() => {
    if (!computed) return [] as TLItem[];

    const items: TLItem[] = [];

    for (const s of displaySpends) {
      items.push({
        id: `sp_${s.id}`,
        date: s.date,
        kind: "spend",
        title: "Spend",
        subtitle: s.pending ? `${s.note || ""}${s.note ? " • " : ""}Pending sync` : s.note || undefined,
        amount: Number(s.amount || 0),
        spendId: s.id.startsWith("pending_") ? undefined : s.id,
        pending: s.pending,
      });
    }

    for (const p of displayPayments) {
      const d = dateFromPayment(p);
      if (d < computed.payStart || d > computed.dueDate) continue;
      items.push({
        id: `pay_${p.id}`,
        date: d,
        kind: "payment",
        title: "Payment recorded",
        subtitle: p.pending ? "Pending sync" : undefined,
        amount: Number(p.amount || 0),
        pending: p.pending,
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

    items.sort((a, b) => (a.date === b.date ? a.kind.localeCompare(b.kind) : b.date.localeCompare(a.date)));
    return items;
  }, [computed, displaySpends, displayPayments, installments]);

  if ((loading && !card) || !activeMonth) return <StatementSkeleton />;

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
        <div className="text-xs text-white/60">Cycle ending month</div>
        <Input type="month" value={activeMonth} onChange={(e) => onMonthChange(e.target.value)} />
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
            <Link to={`/add/spend?card=${card?.id ?? ""}&m=${activeMonth}`}>
              <Button className="w-full" size="sm">Add spend</Button>
            </Link>

            {payRemaining > 0 ? (
              <Link to={`/add/payment?card=${card?.id ?? ""}&m=${activeMonth}&amount=${payRemaining}&max=${payRemaining}&withdraw=1`}>
                <Button className="w-full" size="sm" variant="primary">Pay remaining</Button>
              </Link>
            ) : (
              <Button className="w-full" size="sm" disabled variant="primary">Paid</Button>
            )}

            <Link to={`/add/emi?card=${card?.id ?? ""}&m=${activeMonth}`}>
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
            <div className="text-sm text-white/70">Start this cycle</div>
            <div className="text-sm text-white/60">
              Add spends as they happen, then record payments anytime until the due date.
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Link to={`/add/spend?card=${card?.id ?? ""}&m=${activeMonth}`}>
                <Button className="w-full" size="sm">Add spend</Button>
              </Link>
              <Link to={`/add/payment?card=${card?.id ?? ""}&m=${activeMonth}`}>
                <Button className="w-full" size="sm" variant="primary">Add payment</Button>
              </Link>
              <Link to={`/add/emi?card=${card?.id ?? ""}&m=${activeMonth}`}>
                <Button className="w-full" size="sm">Convert EMI</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-2">
            {timeline.map((t) => {
              const chip =
                t.kind === "payment"
                  ? <Badge tone={t.pending ? "warn" : "good"}>{t.pending ? "Pending" : "Payment"}</Badge>
                  : t.kind === "spend"
                  ? <Badge tone={t.pending ? "warn" : "neutral"}>{t.pending ? "Pending" : "Spend"}</Badge>
                  : <Badge tone="warn">EMI</Badge>;

              const amtTone = t.kind === "payment" ? "text-emerald-200" : "text-white";
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

                    <div className="text-right">
                      <div className={cx("text-sm font-semibold", amtTone)}>
                        {prefix}{formatINR(t.amount)}
                      </div>

                      {t.kind === "spend" && t.spendId ? (
                        <Link to={`/spends/${t.spendId}/edit?card=${card?.id ?? ""}&m=${activeMonth}`}>
                          <Button size="sm" variant="ghost" className="mt-2">Edit</Button>
                        </Link>
                      ) : null}
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