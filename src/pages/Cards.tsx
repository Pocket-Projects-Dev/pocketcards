import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";
import { Card, ProgressBar } from "../components/ui";
import { formatINR } from "../lib/format";

type CardRow = {
  id: string;
  name: string;
  issuer: string | null;
  last4: string | null;
  credit_limit: number | null;
};

type SummaryRow = {
  card_id: string;
  remaining_due: number;
  due_date: string;
  days_to_due: number;
};

export default function Cards() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: c, error: ce } = await supabase
        .from("cards")
        .select("id,name,issuer,last4,credit_limit")
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (ce) {
        setErr(ce.message);
        setLoading(false);
        return;
      }

      setCards((((c as unknown) as any[]) ?? []) as CardRow[]);

      const { data: s, error: se } = await supabase
        .from("card_cycle_summary")
        .select("card_id,remaining_due,due_date,days_to_due")
        .order("due_date", { ascending: true });

      if (!alive) return;
      if (se) {
        setErr(se.message);
        setLoading(false);
        return;
      }

      setSummary((((s as unknown) as any[]) ?? []) as SummaryRow[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const summaryById = useMemo(() => {
    const m = new Map<string, SummaryRow>();
    for (const r of summary) m.set(r.card_id, r);
    return m;
  }, [summary]);

  if (loading) return <div className="p-4 text-sm text-white/70">Loading…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Cards</div>
          <div className="mt-1 text-sm text-white/60">Limits + statements</div>
        </div>
        <Link to="/cards/new" className="text-sm text-white/70">Add</Link>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      {cards.length === 0 ? (
        <Card className="p-5 text-sm text-white/70">No cards yet.</Card>
      ) : (
        <div className="space-y-3">
          {cards.map((c) => {
            const s = summaryById.get(c.id);
            const used = Number(s?.remaining_due || 0);
            const limit = Number(c.credit_limit || 0);
            const left = Math.max(0, limit - used);
            const pct = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;

            return (
              <Link key={c.id} to={`/cards/${c.id}/statement`}>
                <Card className="p-5 hover:bg-white/[0.06] transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-base font-medium">
                        {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
                      </div>
                      <div className="mt-1 text-sm text-white/60">
                        Next due {s?.due_date ? s.due_date : "—"}{typeof s?.days_to_due === "number" ? ` • ${s.days_to_due} days` : ""}
                      </div>
                    </div>
                    <div className="text-right">
                      {limit > 0 ? (
                        <>
                          <div className="text-sm text-white/60">Limit left</div>
                          <div className="text-base font-semibold">
                            {formatINR(left)} / {formatINR(limit)}
                          </div>
                        </>
                      ) : (
                        <div className="text-sm text-white/60">Set limit</div>
                      )}
                    </div>
                  </div>

                  {limit > 0 ? (
                    <div className="mt-4 space-y-2">
                      <ProgressBar value={pct} />
                      <div className="text-xs text-white/60">
                        Limit used: {formatINR(used)} / {formatINR(limit)}
                      </div>
                    </div>
                  ) : null}
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}