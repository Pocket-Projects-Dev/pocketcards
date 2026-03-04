import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { Link } from "react-router-dom";
import {
  buildCashflow,
  buildDuesByDate,
  buildMilestones,
  buildPaycheckWindows,
  type IncomeItem,
} from "../lib/payplan";

type DueRow = {
  card_id: string;
  card_name: string;
  due_date: string;
  remaining_due: number;
};

export default function Plan() {
  const [dues, setDues] = useState<DueRow[]>([]);
  const [incomes, setIncomes] = useState<IncomeItem[]>([]);
  const [incomeDateField, setIncomeDateField] = useState<string | null>(null);

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

      const dateFieldsToTry = ["received_on", "event_date", "received_at", "date"];

      let loaded = false;

      for (const field of dateFieldsToTry) {
        const { data, error } = await supabase
          .from("income_events")
          .select(`amount,${field}`)
          .gte(field, from)
          .lte(field, to)
          .order(field, { ascending: true });

        if (!alive) return;

        if (!error) {
          const rows = ((data as any[]) ?? [])
            .map((r) => ({
              date: String(r[field]),
              amount: Number(r.amount || 0),
            }))
            .filter((r) => r.date && !Number.isNaN(r.amount));

          setIncomes(rows);
          setIncomeDateField(field);
          loaded = true;
          break;
        }

        const msg = String(error.message || "");
        const missingColumn = msg.toLowerCase().includes("does not exist") && msg.includes(field);
        if (!missingColumn) {
          setErr(`income_events: ${error.message}`);
          setLoading(false);
          return;
        }
      }

      if (!alive) return;

      if (!loaded) {
        setIncomeDateField(null);
        setIncomes([]);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const dueItems = useMemo(() => {
    return dues
      .filter((d) => Number(d.remaining_due || 0) > 0)
      .map((d) => ({ due_date: d.due_date, amount: Number(d.remaining_due || 0) }));
  }, [dues]);

  const { duesByDate, dueDates } = useMemo(() => buildDuesByDate(dueItems), [dueItems]);

  const milestones = useMemo(() => {
    return buildMilestones({
      baseDate: todayISO(),
      dueDates,
      duesByDate,
      incomes,
      startBuffer: buffer,
    });
  }, [dueDates, duesByDate, incomes, buffer]);

  const totalDue = useMemo(() => {
    return dueItems.reduce((s, x) => s + Number(x.amount || 0), 0);
  }, [dueItems]);

  const nextDueDate = useMemo(() => dueDates[0] ?? null, [dueDates]);

  const recommendedDaily = useMemo(() => {
    return milestones.reduce((m, x) => Math.max(m, Number(x.required_per_day || 0)), 0);
  }, [milestones]);

  const cashflow = useMemo(() => {
    return buildCashflow({ dueDates, duesByDate, incomes, startBuffer: buffer });
  }, [dueDates, duesByDate, incomes, buffer]);

  const paycheck = useMemo(() => {
    return buildPaycheckWindows({ dueDates, duesByDate, incomes });
  }, [dueDates, duesByDate, incomes]);

  if (loading) return <div className="p-4 text-sm text-white/70">Loading plan…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Pay plan</h2>
        <Link to="/" className="text-sm text-white/70">Back</Link>
      </div>

      {err ? (
        <div className="rounded-2xl bg-white/5 p-3 text-sm text-red-300">{err}</div>
      ) : null}

      <div className="rounded-2xl bg-white/5 p-4 space-y-2">
        <div className="text-sm text-white/70">Starting buffer (cash you can use for dues)</div>
        <input
          value={bufferStr}
          onChange={(e) => setBufferStr(e.target.value)}
          inputMode="numeric"
          className="w-full rounded-xl bg-black/40 px-3 py-2 text-white outline-none"
          placeholder="0"
        />
        <div className="text-xs text-white/60">
          Minimum buffer to never go negative (based on incomes + dues): {formatINR(cashflow.requiredStartingBuffer)}
          {incomeDateField ? ` • income date field: ${incomeDateField}` : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-xs text-white/70">Total remaining due</div>
          <div className="mt-2 text-xl font-semibold">{formatINR(totalDue)}</div>
          <div className="mt-1 text-xs text-white/60">
            Next due: {nextDueDate ? formatDateShort(nextDueDate) : "—"}
          </div>
        </div>

        <div className="rounded-2xl bg-white/5 p-4">
          <div className="text-xs text-white/70">Recommended daily set-aside</div>
          <div className="mt-2 text-xl font-semibold">{formatINR(recommendedDaily)}</div>
          <div className={`mt-1 text-xs ${cashflow.minBalance >= 0 ? "text-white/60" : "text-red-300"}`}>
            Lowest projected balance: {formatINR(cashflow.minBalance)}
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Milestones (cumulative due by date)</div>

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

      <div className="rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Paycheck plan (dues before next income)</div>

        {incomes.length === 0 ? (
          <div className="mt-2 text-sm text-white/70">No income events found in the next 120 days.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {paycheck.preIncomeDues > 0 ? (
              <div className="rounded-2xl bg-black/40 p-3">
                <div className="text-sm">Dues before first income</div>
                <div className={`mt-1 text-xs ${buffer >= paycheck.preIncomeDues ? "text-white/60" : "text-red-300"}`}>
                  {formatINR(paycheck.preIncomeDues)} (buffer covers: {formatINR(buffer)})
                </div>
              </div>
            ) : null}

            {paycheck.windows.map((w) => (
              <div key={w.income_date} className="rounded-2xl bg-black/40 p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-sm">
                      Income {formatDateShort(w.income_date)}: {formatINR(w.income_amount)}
                    </div>
                    <div className="mt-1 text-xs text-white/60">
                      Dues until next income: {formatINR(w.dues_in_window)}
                    </div>
                  </div>

                  <div className="text-right">
                    {w.deficit > 0 ? (
                      <div className="text-xs text-red-300">Deficit {formatINR(w.deficit)}</div>
                    ) : (
                      <div className="text-xs text-white/60">Surplus {formatINR(w.surplus)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Cashflow timeline</div>
        {cashflow.points.length === 0 ? (
          <div className="mt-2 text-sm text-white/70">No dated events found.</div>
        ) : (
          <div className="mt-3 space-y-2">
            {cashflow.points.slice(0, 12).map((p) => (
              <div key={p.date} className="rounded-2xl bg-black/40 p-3 flex items-center justify-between">
                <div>
                  <div className="text-sm">{formatDateShort(p.date)}</div>
                  <div className="mt-1 text-xs text-white/60">
                    Income {formatINR(p.income)} • Due {formatINR(p.due)}
                  </div>
                </div>
                <div className={`text-sm ${p.balance >= 0 ? "text-white" : "text-red-300"}`}>
                  {formatINR(p.balance)}
                </div>
              </div>
            ))}
            {cashflow.points.length > 12 ? (
              <div className="text-xs text-white/60">Showing first 12 dates. Expand later.</div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}