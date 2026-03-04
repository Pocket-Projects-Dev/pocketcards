import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { buildDuesByDate, buildMilestones, type IncomeItem } from "../lib/payplan";
import { Button, Card, Input, ProgressBar } from "../components/ui";
import { computeFundBalance, labelEventType, sumTodayNet, type FundEvent } from "../lib/fund";
import { useSession } from "../hooks/useSession";

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
  const [err, setErr] = useState<string | null>(null);

  const [amountStr, setAmountStr] = useState("");
  const [busy, setBusy] = useState(false);

  const [legacyBuffer, setLegacyBuffer] = useState<number>(() => Number(localStorage.getItem("pp_buffer_v1") || 0) || 0);

  const today = todayISO();

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

      const dueRows = (((dueData as unknown) as any[]) ?? []).map((x) => ({
        card_id: String(x.card_id),
        card_name: String(x.card_name),
        due_date: String(x.due_date),
        remaining_due: Number(x.remaining_due || 0),
      })) as DueRow[];

      setDues(dueRows);

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
  const todayNet = useMemo(() => sumTodayNet(fundEvents, today), [fundEvents, today]);

  const dueItems = useMemo(
    () => dues.filter((d) => d.remaining_due > 0).map((d) => ({ due_date: d.due_date, amount: d.remaining_due })),
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

  const worstShortfall = useMemo(
    () => milestones.reduce((m, x) => Math.max(m, Math.max(0, x.gap)), 0),
    [milestones]
  );

  const fundProgress = useMemo(() => {
    if (totalDue <= 0) return 0;
    return Math.max(0, Math.min(1, fundBalance / totalDue));
  }, [fundBalance, totalDue]);

  const addEvent = async (event_type: "set_aside" | "withdraw", amount: number, note?: string) => {
    if (!userId) {
      setErr("Not signed in.");
      return;
    }
    if (!(amount > 0)) return;

    setBusy(true);
    setErr(null);

    const payload = {
      user_id: userId,
      event_date: todayISO(),
      event_type,
      amount: Number(amount),
      note: note ?? null,
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

    const row = (data as unknown) as FundEvent;
    setFundEvents((prev) => [row, ...prev]);
    setAmountStr("");
    setBusy(false);
  };

  const setAsideToday = async () => {
    const amt = Math.ceil(Number(recommendedDaily || 0));
    await addEvent("set_aside", amt, "Daily set-aside");
  };

  const importLegacyBuffer = async () => {
    if (!(legacyBuffer > 0)) return;
    await addEvent("set_aside", legacyBuffer, "Imported buffer");
    localStorage.removeItem("pp_buffer_v1");
    setLegacyBuffer(0);
  };

  const customAmount = Math.max(0, Number(amountStr || 0));

  if (loading) return <div className="p-4 text-sm text-white/70">Loading plan…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Pay plan</div>
        <div className="mt-1 text-sm text-white/60">Use Fund to set aside daily and stay on track.</div>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      {legacyBuffer > 0 ? (
        <Card className="p-5 space-y-3">
          <div className="text-sm text-white/70">You have an old buffer saved from earlier versions</div>
          <div className="text-2xl font-semibold">{formatINR(legacyBuffer)}</div>
          <div className="text-xs text-white/60">Import it into Fund so it’s synced and used in planning.</div>
          <Button variant="primary" onClick={importLegacyBuffer} disabled={busy}>
            Import to Fund
          </Button>
        </Card>
      ) : null}

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-sm text-white/60">Plan Fund</div>
            <div className="mt-1 text-3xl font-semibold">{formatINR(fundBalance)}</div>
            <div className="mt-2 text-xs text-white/60">
              Today net: {todayNet >= 0 ? "+" : "-"}
              {formatINR(Math.abs(todayNet))}
            </div>
          </div>

          <div className="text-right">
            <div className="text-xs text-white/60">Coverage vs upcoming due</div>
            <div className="mt-2 w-28">
              <ProgressBar value={fundProgress} />
            </div>
            <div className="mt-2 text-xs text-white/60">
              {formatINR(fundBalance)} / {formatINR(totalDue)}
            </div>
          </div>
        </div>

        <div className="rounded-3xl bg-black/30 border border-white/10 p-4">
          <div className="text-sm text-white/70">Today’s action</div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-xl font-semibold">{formatINR(Math.ceil(recommendedDaily || 0))}</div>
              <div className="mt-1 text-xs text-white/60">Suggested set-aside to stay on track</div>
            </div>
            <Button variant="primary" onClick={setAsideToday} disabled={busy || !(recommendedDaily > 0)}>
              Set aside today
            </Button>
          </div>
          <div className={`mt-3 text-xs ${worstShortfall > 0 ? "text-red-300" : "text-white/60"}`}>
            Worst shortfall: {formatINR(worstShortfall)}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Custom amount</div>
            <Input value={amountStr} onChange={(e) => setAmountStr(e.target.value)} inputMode="numeric" placeholder="0" className="mt-2" />
          </div>
          <div className="flex flex-col justify-end gap-2">
            <Button variant="secondary" disabled={busy || !(customAmount > 0)} onClick={() => addEvent("set_aside", customAmount, "Manual set-aside")}>
              Add to Fund
            </Button>
            <Button variant="secondary" disabled={busy || !(customAmount > 0)} onClick={() => addEvent("withdraw", customAmount, "Withdrawal")}>
              Withdraw
            </Button>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-5">
          <div className="text-xs text-white/60">Total remaining due</div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(totalDue)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-white/60">Recommended daily set-aside</div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(Math.ceil(recommendedDaily || 0))}</div>
          <div className="mt-2 text-xs text-white/60">This auto-updates as Fund grows.</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="text-sm text-white/70">Milestones</div>

        {milestones.length === 0 ? (
          <div className="mt-2 text-sm text-white/70">No upcoming dues.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {milestones.map((m) => {
              const covered = m.gap <= 0;
              return (
                <div key={m.due_date} className="rounded-3xl bg-black/30 border border-white/10 p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-base">
                        {formatDateShort(m.due_date)} <span className="text-white/60">• {m.days_to_due} days</span>
                      </div>
                      <div className="mt-2 text-xs text-white/60">
                        Due that day {formatINR(m.due_on_date)} • Cumulative {formatINR(m.cumulative_due)}
                      </div>
                      <div className="mt-1 text-xs text-white/60">
                        Remaining after Fund {formatINR(m.remaining_after_buffer)} • Income till then {formatINR(m.income_until)}
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
          <div className="mt-3 text-sm text-white/70">No fund activity yet.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {fundEvents.slice(0, 10).map((e) => {
              const isWithdraw = e.event_type === "withdraw";
              const amt = Number((e as any).amount || 0);
              return (
                <div key={e.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-sm">
                      {labelEventType(e.event_type)} <span className="text-white/60">• {formatDateShort(e.event_date)}</span>
                    </div>
                    {e.note ? <div className="mt-1 text-xs text-white/60 truncate">{e.note}</div> : null}
                  </div>
                  <div className={`text-sm font-semibold ${isWithdraw ? "text-red-300" : "text-white"}`}>
                    {isWithdraw ? "-" : "+"}{formatINR(amt)}
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