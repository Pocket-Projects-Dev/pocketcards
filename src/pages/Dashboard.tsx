import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { Button, Card, ProgressBar } from "../components/ui";
import { buildDuesByDate, buildMilestones, type IncomeItem } from "../lib/payplan";
import { computeFundBalance, sumTodayNet, type FundEvent } from "../lib/fund";
import { useSession } from "../hooks/useSession";

type CycleRow = {
  card_id: string;
  card_name: string;
  issuer: string | null;
  last4: string | null;
  due_date: string;
  days_to_due: number;
  cycle_spend: number;
  emi_due: number;
  total_due: number;
  paid_to_date: number;
  remaining_due: number;
  per_day_to_due: number;
};


function isMissingColumn(err: any, field: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(field.toLowerCase());
}

export default function Dashboard() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<CycleRow[]>([]);
  const [income30, setIncome30] = useState<number>(0);
  const [incomes120, setIncomes120] = useState<IncomeItem[]>([]);
  const [fundEvents, setFundEvents] = useState<FundEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const signOut = () => {
  void (async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) alert(error.message);
    } catch (e: any) {
      alert(e?.message || "Sign out failed");
    }
  })();
};

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: dueData, error: dueErr } = await supabase
        .from("card_cycle_summary")
        .select("card_id,card_name,issuer,last4,due_date,days_to_due,cycle_spend,emi_due,total_due,paid_to_date,remaining_due,per_day_to_due")
        .order("due_date", { ascending: true });

      if (!alive) return;
      if (dueErr) {
        setErr(`card_cycle_summary: ${dueErr.message}`);
        setLoading(false);
        return;
      }

      setRows((((dueData as unknown) as any[]) ?? []).map((x) => ({
        ...x,
        cycle_spend: Number(x.cycle_spend || 0),
        emi_due: Number(x.emi_due || 0),
        total_due: Number(x.total_due || 0),
        paid_to_date: Number(x.paid_to_date || 0),
        remaining_due: Number(x.remaining_due || 0),
        per_day_to_due: Number(x.per_day_to_due || 0),
      })) as CycleRow[]);

      const from = todayISO();
      const to120 = addDaysISO(120);
      const to30 = addDaysISO(30);

      const candidates = ["received_on", "event_date", "received_at", "date"];
      let inc: IncomeItem[] = [];

      for (const field of candidates) {
        const { data, error } = await supabase
          .from("income_events")
          .select("*")
          .gte(field, from)
          .lte(field, to120)
          .order(field, { ascending: true });

        if (!alive) return;

        if (!error) {
          const raw = ((((data as unknown) as any[]) ?? []) as any[]);
          inc = raw
            .map((r) => ({ date: String(r[field]).slice(0, 10), amount: Number(r.amount || 0) }))
            .filter((r) => r.date && !Number.isNaN(r.amount));
          break;
        }

        if (!isMissingColumn(error, field)) {
          setErr(`income_events: ${error.message}`);
          setLoading(false);
          return;
        }
      }

      setIncomes120(inc);
      setIncome30(inc.filter((x) => x.date >= from && x.date <= to30).reduce((s, x) => s + Number(x.amount || 0), 0));

      const { data: fe, error: feErr } = await supabase
        .from("plan_fund_events")
        .select("id,event_date,event_type,amount,note,created_at")
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(50);

      if (!alive) return;
      if (feErr) {
        setErr(`plan_fund_events: ${feErr.message}`);
        setLoading(false);
        return;
      }

      setFundEvents((((fe as unknown) as any[]) ?? []) as FundEvent[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const fundBalance = useMemo(() => computeFundBalance(fundEvents), [fundEvents]);
  const todayNet = useMemo(() => sumTodayNet(fundEvents, todayISO()), [fundEvents]);

  const dueItems = useMemo(
    () => rows.filter((r) => Number(r.remaining_due || 0) > 0).map((r) => ({ due_date: r.due_date, amount: Number(r.remaining_due || 0) })),
    [rows]
  );

  const totalDue = useMemo(() => dueItems.reduce((s, x) => s + x.amount, 0), [dueItems]);
  const gap = useMemo(() => income30 - totalDue, [income30, totalDue]);

  const nextCard = useMemo(() => {
    const list = rows.filter((r) => Number(r.remaining_due || 0) > 0);
    return (list[0] ?? rows[0] ?? null) as CycleRow | null;
  }, [rows]);

  const { duesByDate, dueDates } = useMemo(() => buildDuesByDate(dueItems), [dueItems]);

  const milestones = useMemo(
    () =>
      buildMilestones({
        baseDate: todayISO(),
        dueDates,
        duesByDate,
        incomes: incomes120,
        startBuffer: fundBalance,
      }),
    [dueDates, duesByDate, incomes120, fundBalance]
  );

  const recommendedDaily = useMemo(
    () => milestones.reduce((m, x) => Math.max(m, Number(x.required_per_day || 0)), 0),
    [milestones]
  );

  const todaySuggestion = useMemo(() => Math.ceil(recommendedDaily || 0), [recommendedDaily]);

  const fundProgress = useMemo(() => {
    if (totalDue <= 0) return 0;
    return Math.max(0, Math.min(1, fundBalance / totalDue));
  }, [fundBalance, totalDue]);

  const setAsideToday = async () => {
    if (!userId) return;
    if (!(todaySuggestion > 0)) return;

    setBusy(true);
    setErr(null);

    const payload = {
      user_id: userId,
      event_date: todayISO(),
      event_type: "set_aside",
      amount: Number(todaySuggestion),
      note: "Daily set-aside",
    };

    const { data, error } = await supabase
      .from("plan_fund_events")
      .insert(payload)
      .select("id,event_date,event_type,amount,note,created_at")
      .single();

    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }

    setFundEvents((prev) => [((data as unknown) as FundEvent), ...prev]);
    setBusy(false);
  };

  if (loading) return <div className="p-4 text-sm text-white/70">Loading…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Dashboard</div>
          <div className="mt-1 text-sm text-white/60">Continue your next statement</div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/plan"><Button variant="ghost" className="px-3 py-2">Plan</Button></Link>
          <Button variant="ghost" className="px-3 py-2" onClick={signOut}>Sign out</Button>
        </div>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      {nextCard ? (
        <Card className="p-5 space-y-4">
          <div className="text-sm text-white/60">Continue</div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xl font-semibold">
                {nextCard.card_name}{nextCard.last4 ? ` •••• ${nextCard.last4}` : ""}
              </div>
              <div className="mt-1 text-sm text-white/60">
                Due {formatDateShort(nextCard.due_date)} • {nextCard.days_to_due} days • Remaining {formatINR(nextCard.remaining_due)}
              </div>
            </div>
            <Link to={`/cards/${nextCard.card_id}/statement`}>
              <Button variant="primary" className="px-4 py-3">Open</Button>
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Link to={`/add/spend?card=${nextCard.card_id}`}><Button className="w-full">Add spend</Button></Link>
            <Link to={`/add/payment?card=${nextCard.card_id}`}><Button className="w-full">Add payment</Button></Link>
            <Link to={`/add/emi?card=${nextCard.card_id}`}><Button className="w-full">Convert EMI</Button></Link>
          </div>

          <div className="text-xs text-white/60">
            Tip: Everything you log routes back to the statement so you stay in one flow.
          </div>
        </Card>
      ) : null}

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Today’s set-aside</div>
            <div className="mt-1 text-3xl font-semibold">{formatINR(todaySuggestion)}</div>
            <div className="mt-2 text-xs text-white/60">
              Fund {formatINR(fundBalance)} • Today net {todayNet >= 0 ? "+" : "-"}{formatINR(Math.abs(todayNet))}
            </div>
          </div>
          <Button variant="primary" onClick={setAsideToday} disabled={busy || !(todaySuggestion > 0)}>
            {busy ? "Saving…" : "Set aside"}
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Fund coverage vs upcoming due</span>
            <span>{formatINR(fundBalance)} / {formatINR(totalDue)}</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={fundProgress} />
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-5">
          <div className="text-xs text-white/60">Remaining due (next)</div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(totalDue)}</div>
        </Card>

        <Card className="p-5">
          <div className="text-xs text-white/60">Income (next 30d)</div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(income30)}</div>
          <div className={`mt-2 text-xs ${gap >= 0 ? "text-white/60" : "text-red-300"}`}>
            Gap: {formatINR(gap)}
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-sm text-white/70">Upcoming dues</div>

        {rows.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">Add a card to see due planning.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r) => {
              const denom = Math.max(1, Number(r.total_due || 0));
              const progress = Math.max(0, Math.min(1, Number(r.paid_to_date || 0) / denom));
              const urgent = r.days_to_due <= 5;

              return (
                <Link key={r.card_id} to={`/cards/${r.card_id}/statement`}>
                  <div className="rounded-3xl bg-black/30 border border-white/10 p-4 hover:bg-white/[0.03] transition">
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-base font-medium">
                          {r.card_name}{r.last4 ? ` •••• ${r.last4}` : ""}
                        </div>
                        <div className={`mt-1 text-sm ${urgent ? "text-red-200" : "text-white/60"}`}>
                          Due {formatDateShort(r.due_date)} • {r.days_to_due} days
                        </div>
                        <div className="mt-3">
                          <ProgressBar value={progress} />
                          <div className="mt-2 text-xs text-white/60">
                            Paid {formatINR(r.paid_to_date)} • Total {formatINR(r.total_due)}
                          </div>
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-semibold">{formatINR(r.remaining_due)}</div>
                        <div className="mt-1 text-xs text-white/60">Need ~{formatINR(r.per_day_to_due)}/day</div>
                        <div className="mt-2 text-xs text-white/50">
                          Spend {formatINR(r.cycle_spend)} • EMI {formatINR(r.emi_due)}
                        </div>
                      </div>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}