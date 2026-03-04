import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { buildDuesByDate, buildMilestones, type IncomeItem } from "../lib/payplan";
import { Card, Input } from "../components/ui";

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
  const [dues, setDues] = useState<DueRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [bufferStr, setBufferStr] = useState(() => localStorage.getItem("pp_buffer_v1") ?? "0");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const buffer = Number(bufferStr || 0) || 0;

  useEffect(() => {
    localStorage.setItem("pp_buffer_v1", bufferStr);
  }, [bufferStr]);

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

      const dueRows = ((dueData as any[]) ?? []).map((x) => ({
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
          inc = (((data as any[]) ?? []) as any[])
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
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const dueItems = useMemo(
    () => dues.filter((d) => d.remaining_due > 0).map((d) => ({ due_date: d.due_date, amount: d.remaining_due })),
    [dues]
  );

  const { duesByDate, dueDates } = useMemo(() => buildDuesByDate(dueItems), [dueItems]);

  const milestones = useMemo(
    () =>
      buildMilestones({
        baseDate: todayISO(),
        dueDates,
        duesByDate,
        incomes,
        startBuffer: buffer,
      }),
    [dueDates, duesByDate, incomes, buffer]
  );

  const totalDue = useMemo(() => dueItems.reduce((s, x) => s + x.amount, 0), [dueItems]);

  const recommendedDaily = useMemo(
    () => milestones.reduce((m, x) => Math.max(m, Number(x.required_per_day || 0)), 0),
    [milestones]
  );

  const worstShortfall = useMemo(
    () => milestones.reduce((m, x) => Math.max(m, Math.max(0, x.gap)), 0),
    [milestones]
  );

  if (loading) return <div className="p-4 text-sm text-white/70">Loading plan…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Pay plan</div>
        <div className="mt-1 text-sm text-white/60">
          Buffer reduces daily set-aside. Gap shows whether buffer + scheduled income covers dues.
        </div>
      </div>

      {err ? (
        <Card className="p-4 text-sm text-red-300">{err}</Card>
      ) : null}

      <Card className="p-5 space-y-2">
        <div className="text-sm text-white/70">Starting buffer</div>
        <Input
          value={bufferStr}
          onChange={(e) => setBufferStr(e.target.value)}
          inputMode="numeric"
          placeholder="0"
        />
        <div className="text-xs text-white/60">
          This reduces “Need/day” and recommended daily set-aside.
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-5">
          <div className="text-xs text-white/60">Total remaining due</div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(totalDue)}</div>
        </Card>
        <Card className="p-5">
          <div className="text-xs text-white/60">Recommended daily set-aside</div>
          <div className="mt-2 text-2xl font-semibold">{formatINR(recommendedDaily)}</div>
          <div className={`mt-2 text-xs ${worstShortfall > 0 ? "text-red-300" : "text-white/60"}`}>
            Worst shortfall: {formatINR(worstShortfall)}
          </div>
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
                        Remaining after buffer {formatINR(m.remaining_after_buffer)} • Income till then {formatINR(m.income_until)}
                      </div>
                    </div>

                    <div className="text-right">
                      <div className="text-sm font-semibold">Need {formatINR(m.required_per_day)}/day</div>
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
    </div>
  );
}