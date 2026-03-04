import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { addDaysISO, formatDateShort, formatINR, todayISO } from "../lib/format";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Link } from "react-router-dom";
import { Button, Card, ProgressBar } from "../components/ui";

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

function isMissingColumn(err: any, field: string) {
  const msg = String(err?.message || "").toLowerCase();
  return msg.includes("does not exist") && msg.includes(field.toLowerCase());
}

export default function Dashboard() {
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [monthly, setMonthly] = useState<MonthlyRow[]>([]);
  const [income30, setIncome30] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const signOut = async () => {
    await supabase.auth.signOut();
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

      setRows(((dueData as any[]) ?? []).map((x) => ({
        ...x,
        cycle_spend: Number(x.cycle_spend || 0),
        emi_due: Number(x.emi_due || 0),
        total_due: Number(x.total_due || 0),
        paid_to_date: Number(x.paid_to_date || 0),
        remaining_due: Number(x.remaining_due || 0),
        per_day_to_due: Number(x.per_day_to_due || 0),
      })) as CycleRow[]);

      const { data: monthlyData, error: monthlyErr } = await supabase
        .from("monthly_spend")
        .select("month,spend")
        .order("month", { ascending: false })
        .limit(6);

      if (!alive) return;
      if (monthlyErr) {
        setErr(`monthly_spend: ${monthlyErr.message}`);
        setLoading(false);
        return;
      }

      const monthlyNorm = ((monthlyData as any[]) ?? [])
        .map((m) => ({ month: String(m.month).slice(0, 7), spend: Number(m.spend || 0) }))
        .reverse();
      setMonthly(monthlyNorm);

      const from = todayISO();
      const to = addDaysISO(30);

const candidates = ["received_on", "event_date", "received_at", "date"];
let incomeTotal = 0;

for (const field of candidates) {
  const { data, error } = await supabase
    .from("income_events")
    .select("amount")
    .gte(field, from)
    .lte(field, to);

  if (!alive) return;

  if (!error) {
    const rows = ((data as unknown) as Array<{ amount: any }>) ?? [];
    incomeTotal = rows.reduce((s, r) => s + Number(r.amount || 0), 0);
    break;
  }

  if (!isMissingColumn(error, field)) {
    setErr(`income_events: ${error.message}`);
    setLoading(false);
    return;
  }
}

      setIncome30(incomeTotal);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const totalDue = useMemo(() => rows.reduce((s, r) => s + Number(r.remaining_due || 0), 0), [rows]);
  const gap = useMemo(() => income30 - totalDue, [income30, totalDue]);

  if (loading) return <div className="p-4 text-sm text-white/70">Loading…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Dashboard</div>
          <div className="mt-1 text-sm text-white/60">Next dues, trend, and coverage</div>
        </div>

        <div className="flex items-center gap-2">
          <Link to="/plan"><Button variant="ghost" className="px-3 py-2">Plan</Button></Link>
          <Button variant="ghost" className="px-3 py-2" onClick={signOut}>Sign out</Button>
        </div>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

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
                <div key={r.card_id} className="rounded-3xl bg-black/30 border border-white/10 p-4">
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
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">Spend trend (6 months)</div>

        {monthly.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">No data yet.</div>
        ) : (
          <div className="mt-4 h-48">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthly}>
                <XAxis dataKey="month" tick={{ fill: "rgba(255,255,255,0.55)" }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
                <YAxis tick={{ fill: "rgba(255,255,255,0.55)" }} axisLine={{ stroke: "rgba(255,255,255,0.12)" }} tickLine={false} />
                <Tooltip contentStyle={{ background: "rgba(0,0,0,0.85)", border: "1px solid rgba(255,255,255,0.12)" }} />
                <Bar dataKey="spend" fill="rgba(167, 139, 250, 0.75)" radius={[10, 10, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
    </div>
  );
}