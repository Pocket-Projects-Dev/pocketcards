import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { buildDuesByDate, buildMilestones, type IncomeItem } from "../lib/payplan";

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

  if (loading) return <div className="p-4 text-sm text-white/70">Loading plan…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <h2 className="text-lg font-semibold">Pay plan</h2>

      {err ? <div className="rounded-2xl bg-white/5 p-3 text-sm text-red-300">{err}</div> : null}

      <div className="rounded-2xl bg-white/5 p-4 space-y-2">
        <div className="text-sm text-white/70">Starting buffer</div>
        <input
          value={bufferStr}
          onChange={(e) => setBufferStr(e.target.value)}
          inputMode="numeric"
          className="w-full rounded-xl bg-black/40 px-3 py-2 text-white outline-none"
          placeholder="0"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-xs text-white/70">Total remaining due</div>
          <div className="mt-2 text-xl font-semibold">{formatINR(totalDue)}</div>
        </div>
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-xs text-white/70">Recommended daily set-aside</div>
          <div className="mt-2 text-xl font-semibold">{formatINR(recommendedDaily)}</div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Milestones</div>

        {milestones.length === 0 ? (
          <div className="mt-2 text-sm text-white/70">No upcoming dues.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {milestones.map((m) => (
              <div key={m.due_date} className="rounded-2xl bg-black/40 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm">
                      {formatDateShort(m.due_date)} • {m.days_to_due} days
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      Due that day {formatINR(m.due_on_date)} • Income till then {formatINR(m.income_until)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-semibold">{formatINR(m.cumulative_due)}</div>
                    <div className="mt-1 text-xs text-white/70">Need {formatINR(m.required_per_day)}/day</div>
                    <div className={`mt-1 text-xs ${m.gap <= 0 ? "text-white/60" : "text-red-300"}`}>
                      Gap {formatINR(m.gap)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}