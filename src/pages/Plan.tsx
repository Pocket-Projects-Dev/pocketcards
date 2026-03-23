import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { buildDuesByDate, buildMilestones, type IncomeItem } from "../lib/payplan";
import { Button, Card, Input, ProgressBar } from "../components/ui";
import { computeFundBalance, labelEventType, type FundEvent } from "../lib/fund";
import { useSession } from "../hooks/useSession";
import { toast } from "../components/ToastHost";

type DueRow = {
  card_id: string;
  card_name: string;
  due_date: string;
  remaining_due: number;
};

function isMissingColumn(err: any, field: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(field.toLowerCase());
}

export default function Plan() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [dues, setDues] = useState<DueRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [fundEvents, setFundEvents] = useState<FundEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [amountStr, setAmountStr] = useState("");

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: dueData, error: dueErr } = await supabase
        .from("card_cycle_summary")
        .select("card_id,card_name,due_date,remaining_due")
        .order("due_date", { ascending: true });

      if (!alive) return;
      if (dueErr) {
        setErr(`card_cycle_summary: ${dueErr.message}`);
        setLoading(false);
        return;
      }

      setDues(
        ((((dueData as unknown) as any[]) ?? []) as any[])
          .map((x) => ({
            card_id: String(x.card_id),
            card_name: String(x.card_name),
            due_date: String(x.due_date),
            remaining_due: Number(x.remaining_due || 0),
          }))
          .filter((x) => x.remaining_due > 0)
      );

      const from = todayISO();
      const to = addDaysISO(120);
      const candidates = ["received_on", "event_date", "received_at", "date"];
      let inc: IncomeItem[] = [];

      for (const field of candidates) {
        const { data, error } = await supabase
          .from("income_events")
          .select(`amount,${field}`)
          .gte(field, from)
          .lte(field, to)
          .order(field, { ascending: true });

        if (!alive) return;

        if (!error) {
          const raw = (((data as unknown) as any[]) ?? []) as any[];
          inc = raw
            .map((r) => ({ date: String(r[field]), amount: Number(r.amount || 0) }))
            .filter((r) => r.date && !Number.isNaN(r.amount));
          break;
        }

        if (!isMissingColumn(error, field)) {
          setErr(`income_events: ${error.message}`);
          setLoading(false);
          return;
        }
      }

      setIncomes(inc);

      const { data: fe, error: feErr } = await supabase
        .from("plan_fund_events")
        .select("id,event_date,event_type,amount,note,created_at")
        .order("event_date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(100);

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

  const dueItems = useMemo(
    () => dues.map((d) => ({ due_date: d.due_date, amount: d.remaining_due })),
    [dues]
  );

  const totalDue = useMemo(() => dueItems.reduce((s, x) => s + x.amount, 0), [dueItems]);

  const { duesByDate, dueDates } = useMemo(() => buildDuesByDate(dueItems), [dueItems]);

  const milestones = useMemo(
    () =>
      buildMilestones({
        baseDate: todayISO(),
        dueDates,
        duesByDate,
        incomes,
        startBuffer: fundBalance,
      }),
    [dueDates, duesByDate, incomes, fundBalance]
  );

  const recommendedDaily = useMemo(
    () => milestones.reduce((m, x) => Math.max(m, Number(x.required_per_day || 0)), 0),
    [milestones]
  );

  const nextTarget = useMemo(
    () => milestones.find((m) => Number(m.gap || 0) > 0) ?? milestones[0] ?? null,
    [milestones]
  );

  const customAmount = Math.max(0, Number(amountStr || 0));

  const addFundEvent = async (event_type: "set_aside" | "withdraw", amount: number, note?: string) => {
    if (!userId) {
      toast("Not signed in", "error");
      return;
    }
    if (!(amount > 0)) return;

    setBusy(true);

    const payload = {
      user_id: userId,
      event_date: todayISO(),
      event_type,
      amount,
      note: note ?? null,
    };

    const { data, error } = await supabase
      .from("plan_fund_events")
      .insert(payload)
      .select("id,event_date,event_type,amount,note,created_at")
      .single();

    setBusy(false);

    if (error) {
      toast(error.message, "error");
      return;
    }

    setFundEvents((prev) => [((data as unknown) as FundEvent), ...prev]);
    setAmountStr("");
    toast(event_type === "withdraw" ? "Fund withdrawn" : "Fund added", "success");
  };

  if (loading) return <div className="p-4 text-sm text-white/70">Loading plan…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Plan</div>
          <div className="mt-1 text-sm text-white/60">Set aside, milestones, and fund movement</div>
        </div>
        <Link to="/settings">
          <Button variant="ghost" className="px-3 py-2">Settings</Button>
        </Link>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs text-white/60">Plan Fund</div>
            <div className="mt-2 text-3xl font-semibold">{formatINR(fundBalance)}</div>
            <div className="mt-2 text-xs text-white/60">Use this page for set-aside only.</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-white/60">Upcoming due</div>
            <div className="mt-2 text-2xl font-semibold">{formatINR(totalDue)}</div>
            <div className="mt-2 text-xs text-white/60">Daily target {formatINR(Math.ceil(recommendedDaily || 0))}</div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Fund coverage</span>
            <span>{formatINR(fundBalance)} / {formatINR(totalDue)}</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={totalDue > 0 ? Math.max(0, Math.min(1, fundBalance / totalDue)) : 0} />
          </div>
        </div>

        {nextTarget ? (
          <div className="rounded-3xl bg-black/30 border border-white/10 p-4">
            <div className="text-sm text-white/70">Next target</div>
            <div className="mt-2 text-lg font-semibold">
              {formatDateShort(nextTarget.due_date)} • Need {formatINR(Math.ceil(nextTarget.required_per_day || 0))}/day
            </div>
            <div className="mt-1 text-xs text-white/60">
              Remaining after Fund {formatINR(nextTarget.remaining_after_buffer)} • Income till then {formatINR(nextTarget.income_until)}
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Custom amount</div>
            <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <Button variant="primary" onClick={() => void addFundEvent("set_aside", customAmount, "Manual add")} disabled={busy || !(customAmount > 0)}>
              Add to Fund
            </Button>
            <Button onClick={() => void addFundEvent("withdraw", customAmount, "Manual withdraw")} disabled={busy || !(customAmount > 0)}>
              Withdraw
            </Button>
          </div>
        </div>

        <Button
          variant="secondary"
          onClick={() => void addFundEvent("set_aside", Math.ceil(recommendedDaily || 0), "Daily set-aside")}
          disabled={busy || !(recommendedDaily > 0)}
        >
          Set aside today {recommendedDaily > 0 ? formatINR(Math.ceil(recommendedDaily)) : ""}
        </Button>
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">Milestones</div>

        {milestones.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">No upcoming dues.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {milestones.map((m) => {
              const covered = m.gap <= 0;
              return (
                <div key={m.due_date} className="rounded-3xl bg-black/30 border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-base">
                        {formatDateShort(m.due_date)} <span className="text-white/60">• {m.days_to_due} days</span>
                      </div>
                      <div className="mt-2 text-xs text-white/60">
                        Due that day {formatINR(m.due_on_date)} • Cumulative {formatINR(m.cumulative_due)}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">Need {formatINR(Math.ceil(m.required_per_day || 0))}/day</div>
                      <div className={`mt-2 text-xs ${covered ? "text-white/60" : "text-red-300"}`}>
                        {covered ? `Covered (surplus ${formatINR(Math.abs(m.gap))})` : `Short by ${formatINR(m.gap)}`}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">Fund activity</div>

        {fundEvents.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">No fund activity yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {fundEvents.slice(0, 20).map((e) => {
              const isWithdraw = e.event_type === "withdraw";
              return (
                <div key={e.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm">
                      {labelEventType(e.event_type)} <span className="text-white/60">• {formatDateShort(e.event_date)}</span>
                    </div>
                    {e.note ? <div className="mt-1 text-xs text-white/60 truncate">{e.note}</div> : null}
                  </div>
                  <div className={`text-sm font-semibold ${isWithdraw ? "text-red-300" : "text-white"}`}>
                    {isWithdraw ? "-" : "+"}{formatINR(Number((e as any).amount || 0))}
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