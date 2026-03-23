import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { Badge, Button, Card, RingMeter, Skeleton } from "../components/ui";
import { formatINR } from "../lib/format";
import AnimatedNumber from "../components/AnimatedNumber";
import { getCardAccent } from "../lib/cardTheme";

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

function CardsSkeleton() {
  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-end justify-between">
        <div className="space-y-2 w-full">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-24" />
      </div>

      {[0, 1, 2].map((i) => (
        <Card key={i} className="p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 w-full">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </div>
            <Skeleton className="h-20 w-20 rounded-full" />
          </div>
          <Skeleton className="h-4 w-2/3" />
        </Card>
      ))}
    </div>
  );
}

export default function Cards() {
  const nav = useNavigate();

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

  if (loading) return <CardsSkeleton />;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Cards</div>
          <div className="mt-1 text-sm text-white/60">Distinct cards, clearer limits, faster decisions</div>
        </div>
        <Link to="/cards/new">
          <Button variant="primary" size="sm">Add card</Button>
        </Link>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      {cards.length === 0 ? (
        <Card className="p-5 space-y-3">
          <div className="text-lg font-semibold">Add your first card</div>
          <div className="text-sm text-white/60">
            Then open its statement, add spends, and record payments anytime until the due date.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/cards/new"><Button className="w-full" variant="primary">Add card</Button></Link>
            <Link to="/"><Button className="w-full">Go to dashboard</Button></Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {cards.map((c, idx) => {
            const s = summaryById.get(c.id);
            const used = Number(s?.remaining_due || 0);
            const limit = Number(c.credit_limit || 0);
            const left = Math.max(0, limit - used);
            const pct = limit > 0 ? Math.max(0, Math.min(1, used / limit)) : 0;
            const accent = getCardAccent(c.name, c.issuer);

            return (
              <Card
                key={c.id}
                className="p-5 cursor-pointer transition hover:bg-white/[0.06]"
                onClick={() => nav(`/cards/${c.id}/statement`)}
                style={{
                  animation: `fadeUp 260ms ease both`,
                  animationDelay: `${idx * 45}ms`,
                  boxShadow: `0 18px 45px ${accent.glow}`,
                }}
              >
                <div className="mb-4 h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />

                <div className="grid grid-cols-[1fr_auto] gap-4 items-start">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-base font-medium">
                        {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
                      </div>
                      {typeof s?.days_to_due === "number" && s.days_to_due <= 3 ? <Badge tone="danger">Soon</Badge> : null}
                    </div>

                    <div className="mt-1 text-sm text-white/60">
                      {c.issuer || "Card"} • {s?.due_date ? `Next due ${s.due_date}` : "No active due"}
                      {typeof s?.days_to_due === "number" ? ` • ${s.days_to_due} days` : ""}
                    </div>

                    {limit > 0 ? (
                      <div className="mt-4 grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-xs text-white/50">Limit left</div>
                          <div className="mt-1 text-xl font-semibold">
                            <AnimatedNumber value={left} formatter={(n) => formatINR(n)} />
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-white/50">Limit used</div>
                          <div className="mt-1 text-xl font-semibold">
                            <AnimatedNumber value={used} formatter={(n) => formatINR(n)} />
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-4 text-xs text-white/60">Set a credit limit in Edit.</div>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-3" onClick={(e) => e.stopPropagation()}>
                    {limit > 0 ? (
                      <RingMeter
                        value={pct}
                        from={accent.from}
                        to={accent.to}
                        label={`${Math.round(pct * 100)}%`}
                        sublabel="used"
                      />
                    ) : null}

                    <Link to={`/cards/${c.id}/edit`}>
                      <Button variant="ghost" size="sm">Edit</Button>
                    </Link>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}