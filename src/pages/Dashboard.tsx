import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";

const [err, setErr] = useState<string | null>(null);

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

type MonthlyRow = { month: string; spend: number };
type IncomeRow = { amount: number };

export default function Dashboard() {
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [income30, setIncome30] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  {err ? (
  <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-red-300">
    {err}
  </div>
) : null}

useEffect(() => {
  let alive = true;

  (async () => {
    setLoading(true);
    setErr(null);

    const { data: dueData, error: dueErr } = await supabase
      .from("card_cycle_summary")
      .select("card_id,card_name,issuer,last4,due_date,days_to_due,cycle_spend,emi_due,total_due,paid_to_date,remaining_due,per_day_to_due")
      .order("due_date", { ascending: true });

    console.log("card_cycle_summary", { dueErr, dueData });

    if (dueErr) {
      if (alive) {
        setErr(`card_cycle_summary: ${dueErr.message}`);
        setLoading(false);
      }
      return;
    }

    if (alive) {
      setRows(((dueData as any[]) ?? []).map((x) => ({
        ...x,
        cycle_spend: Number(x.cycle_spend || 0),
        emi_due: Number(x.emi_due || 0),
        total_due: Number(x.total_due || 0),
        paid_to_date: Number(x.paid_to_date || 0),
        remaining_due: Number(x.remaining_due || 0),
        per_day_to_due: Number(x.per_day_to_due || 0),
      })) as CycleRow[]);
    }

    const { data: monthlyData, error: monthlyErr } = await supabase
      .from("monthly_spend")
      .select("month,spend")
      .order("month", { ascending: false })
      .limit(6);

    console.log("monthly_spend", { monthlyErr, monthlyData });

    if (monthlyErr) {
      if (alive) {
        setErr(`monthly_spend: ${monthlyErr.message}`);
        setLoading(false);
      }
      return;
    }

    const monthlyNorm = ((monthlyData as any[]) ?? [])
      .map((m) => ({ month: String(m.month).slice(0, 7), spend: Number(m.spend || 0) }))
      .reverse();

    if (alive) setMonthly(monthlyNorm);

    const from = todayISO();
    const to = addDaysISO(30);

    const { data: incData, error: incErr } = await supabase
      .from("income_events")
      .select("amount")
      .gte("received_on", from)
      .lte("received_on", to);

    console.log("income_events next30d", { incErr, from, to, incData });

    if (incErr) {
      if (alive) {
        setErr(`income_events: ${incErr.message}`);
        setLoading(false);
      }
      return;
    }

    const incTotal = ((incData as IncomeRow[]) ?? []).reduce(
      (s, x) => s + Number(x.amount || 0),
      0
    );

    if (alive) {
      setIncome30(incTotal);
      setLoading(false);
    }
  })();

  return () => {
    alive = false;
  };
}, []);

  const totalDue = useMemo(
    () => rows.reduce((s, r) => s + Number(r.remaining_due || 0), 0),
    [rows]
  );

  const gap = useMemo(() => income30 - totalDue, [income30, totalDue]);

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <button onClick={signOut} className="text-sm text-white/70">Sign out</button>
      </div>
      <Link to="/plan" className="text-sm text-white/70">Plan</Link>
      {loading ? (
        <div className="mt-4 text-sm text-white/70">Loading…</div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="text-xs text-white/70">Remaining due (next)</div>
              <div className="mt-2 text-xl font-semibold">{formatINR(totalDue)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 p-4">
              <div className="text-xs text-white/70">Income (next 30d)</div>
              <div className="mt-2 text-xl font-semibold">{formatINR(income30)}</div>
              <div className={`mt-1 text-xs ${gap >= 0 ? "text-white/70" : "text-red-300"}`}>
                Gap: {formatINR(gap)}
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl bg-white/5 p-4">
            <div className="text-sm text-white/70">Upcoming dues</div>
            {rows.length === 0 ? (
              <div className="mt-2 text-sm text-white/70">Add a card to see due planning.</div>
            ) : (
              <div className="mt-3 space-y-3">
                {rows.map((r) => (
                  <div key={r.card_id} className="rounded-2xl bg-black/40 p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="text-base font-medium">
                          {r.card_name}{r.last4 ? ` • •••• ${r.last4}` : ""}
                        </div>
                        <div className="mt-1 text-sm text-white/70">
                          Due {formatDateShort(r.due_date)} • {r.days_to_due} days
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold">{formatINR(r.remaining_due)}</div>
                        <div className="mt-1 text-xs text-white/70">~{formatINR(r.per_day_to_due)}/day</div>
                      </div>
                    </div>
                    <div className="mt-2 text-xs text-white/60">
                      Cycle spend {formatINR(r.cycle_spend)} • EMI {formatINR(r.emi_due)} • Paid {formatINR(r.paid_to_date)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3 rounded-2xl bg-white/5 p-4">
            <div className="text-sm text-white/70">Spend trend (6 months)</div>
            {monthly.length === 0 ? (
              <div className="mt-2 text-sm text-white/70">No data yet.</div>
            ) : (
              <div className="mt-3 h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={monthly}>
                    <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.6)" }} />
                    <YAxis tick={{ fill: "rgba(255,255,255,0.6)" }} />
                    <Tooltip />
                    <Bar dataKey="spend" fill="rgba(255,255,255,0.85)" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}