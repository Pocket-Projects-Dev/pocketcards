import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDateShort, formatINR, todayISO } from "../lib/format";
import { Badge, Button, Card, Skeleton } from "../components/ui";
import { toast } from "../components/ToastHost";
import AnimatedNumber from "../components/AnimatedNumber";
import SwipeRow from "../components/SwipeRow";
import { getCardAccent } from "../lib/cardTheme";

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

type ReminderRow = {
  id: string;
  card_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  remind_on: string;
  is_done: boolean;
  created_at: string;
};

function addDaysToISO(dateISO: string, delta: number) {
  const d = new Date(`${dateISO}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function DashboardSkeleton() {
  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-2 w-full">
          <Skeleton className="h-7 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-10 w-20" />
      </div>

      <Card className="p-5 space-y-3">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-4 w-60" />
      </Card>

      <Card className="p-5 space-y-2">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-16 w-full" />
      </Card>

      <Card className="p-5 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const [rows, setRows] = useState<CycleRow[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [remindersSupported, setRemindersSupported] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const signOut = () => {
    void (async () => {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) toast(error.message, "error");
      } catch (e: any) {
        toast(e?.message || "Sign out failed", "error");
      }
    })();
  };

  const loadReminders = async () => {
    const today = todayISO();
    const to = addDaysToISO(today, 14);

    const { data, error } = await supabase
      .from("in_app_reminders")
      .select("id,card_id,kind,title,body,remind_on,is_done,created_at")
      .eq("is_done", false)
      .gte("remind_on", today)
      .lte("remind_on", to)
      .order("remind_on", { ascending: true });

    if (!error) {
      setReminders((((data as unknown) as any[]) ?? []) as ReminderRow[]);
      setRemindersSupported(true);
      return;
    }

    const msg = String(error.message || "").toLowerCase();
    if (msg.includes("schema cache") || msg.includes("does not exist") || msg.includes("in_app_reminders")) {
      setRemindersSupported(false);
      setReminders([]);
      return;
    }

    setErr(error.message);
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

      setRows(
        ((((dueData as unknown) as any[]) ?? []) as any[]).map((x) => ({
          ...x,
          cycle_spend: Number(x.cycle_spend || 0),
          emi_due: Number(x.emi_due || 0),
          total_due: Number(x.total_due || 0),
          paid_to_date: Number(x.paid_to_date || 0),
          remaining_due: Number(x.remaining_due || 0),
          per_day_to_due: Number(x.per_day_to_due || 0),
        })) as CycleRow[]
      );

      await loadReminders();
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const dueList = useMemo(() => rows.filter((r) => Number(r.remaining_due || 0) > 0), [rows]);
  const totalDue = useMemo(() => dueList.reduce((s, r) => s + Number(r.remaining_due || 0), 0), [dueList]);
  const nextDue = useMemo(() => dueList[0] ?? null, [dueList]);
  const urgent = useMemo(() => dueList.find((r) => r.days_to_due <= 0) ?? dueList.find((r) => r.days_to_due <= 3) ?? dueList.find((r) => r.days_to_due <= 7) ?? null, [dueList]);
  const safeCount = useMemo(() => dueList.filter((r) => r.days_to_due > 7).length, [dueList]);

  const hero = useMemo(() => {
    if (dueList.length === 0) {
      return {
        badge: "All clear",
        tone: "good" as const,
        title: "No active due right now",
        subtitle: "Nice. Everything is calm at the moment.",
        cardClass: "from-emerald-500/18 via-emerald-400/8 to-white/[0.02]",
      };
    }

    if (urgent?.days_to_due != null && urgent.days_to_due <= 0) {
      return {
        badge: "Behind",
        tone: "danger" as const,
        title: "Needs attention now",
        subtitle: `${urgent.card_name}${urgent.last4 ? ` •••• ${urgent.last4}` : ""} is already due.`,
        cardClass: "from-red-500/18 via-red-400/8 to-white/[0.02]",
      };
    }

    if (urgent?.days_to_due != null && urgent.days_to_due <= 3) {
      return {
        badge: "Due soon",
        tone: "warn" as const,
        title: "Tight window ahead",
        subtitle: `${urgent.card_name}${urgent.last4 ? ` •••• ${urgent.last4}` : ""} needs focus next.`,
        cardClass: "from-amber-500/18 via-amber-400/8 to-white/[0.02]",
      };
    }

    return {
      badge: "In control",
      tone: "neutral" as const,
      title: "You’re ahead for now",
      subtitle:
        safeCount > 0
          ? `${safeCount} card${safeCount === 1 ? "" : "s"} comfortably safe right now.`
          : "Keep moving through the current cycle.",
      cardClass: "from-violet-500/18 via-fuchsia-400/8 to-white/[0.02]",
    };
  }, [dueList, urgent, safeCount]);

  const markDone = async (id: string) => {
    if (!navigator.onLine) {
      toast("Reconnect to mark a reminder done", "error");
      return;
    }

    const { error } = await supabase.from("in_app_reminders").update({ is_done: true }).eq("id", id);
    if (error) {
      toast(error.message, "error");
      return;
    }

    setReminders((prev) => prev.filter((r) => r.id !== id));
    toast("Nice. One less thing to think about.", "success");
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Dashboard</div>
          <div className="mt-1 text-sm text-white/60">Upcoming dues + reminders</div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/plan"><Button variant="ghost" className="px-3 py-2">Plan</Button></Link>
          <Button variant="ghost" className="px-3 py-2" onClick={signOut}>Sign out</Button>
        </div>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      <Card className={`p-5 bg-gradient-to-br ${hero.cardClass}`}>
        <div className="flex items-center justify-between gap-3">
          <Badge tone={hero.tone}>{hero.badge}</Badge>
          {dueList.length > 0 ? (
            <div className="text-xs text-white/50">
              {dueList.length} active card{dueList.length === 1 ? "" : "s"}
            </div>
          ) : null}
        </div>

        <div className="mt-4 text-4xl font-semibold">
          <AnimatedNumber value={totalDue} formatter={(n) => formatINR(n)} />
        </div>

        <div className="mt-3 text-lg">{hero.title}</div>
        <div className="mt-1 text-sm text-white/65">{hero.subtitle}</div>

        {nextDue ? (
          <div className="mt-4 flex items-center justify-between gap-4 rounded-3xl border border-white/10 bg-black/25 p-4">
            <div>
              <div className="text-sm text-white/60">Next due</div>
              <div className="mt-1 text-base font-medium">
                {nextDue.card_name}{nextDue.last4 ? ` •••• ${nextDue.last4}` : ""}
              </div>
              <div className="mt-1 text-xs text-white/55">
                {formatDateShort(nextDue.due_date)} • {nextDue.days_to_due} days
              </div>
            </div>
            <Link to={`/cards/${nextDue.card_id}/statement`}>
              <Button variant="primary">Open</Button>
            </Link>
          </div>
        ) : null}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/70">Reminders</div>
          {reminders.length > 0 ? <Badge>{reminders.length}</Badge> : null}
        </div>

        {!remindersSupported ? (
          <div className="mt-3 text-sm text-white/60">
            Reminders are not enabled yet. Run the SQL once to enable in-app reminders.
          </div>
        ) : reminders.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">All caught up for the next 14 days.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {reminders.map((r, idx) => (
              <SwipeRow
                key={r.id}
                actionLabel="Done"
                tone="good"
                onAction={() => void markDone(r.id)}
                className="fade-up"
              >
                <div
                  className="rounded-3xl bg-black/30 border border-white/10 p-4"
                  style={{ animation: `fadeUp 260ms ease both`, animationDelay: `${idx * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="text-sm">{formatDateShort(r.remind_on)}</div>
                      <div className="mt-1 text-base">{r.title}</div>
                      {r.body ? <div className="mt-1 text-xs text-white/60 truncate">{r.body}</div> : null}
                    </div>
                    <Badge tone="warn">Swipe</Badge>
                  </div>
                </div>
              </SwipeRow>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-sm text-white/70">Upcoming dues</div>
          {safeCount > 0 ? <Badge tone="good">{safeCount} safe</Badge> : null}
        </div>

        {dueList.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">No active due right now.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {dueList.map((r, idx) => {
              const accent = getCardAccent(r.card_name, r.issuer);
              return (
                <Link key={r.card_id} to={`/cards/${r.card_id}/statement`}>
                  <div
                    className="rounded-3xl border border-white/10 bg-black/30 p-4 transition hover:bg-white/[0.03]"
                    style={{
                      animation: `fadeUp 260ms ease both`,
                      animationDelay: `${idx * 35}ms`,
                      boxShadow: `inset 0 1px 0 rgba(255,255,255,0.03), 0 18px 40px ${accent.glow}`,
                    }}
                  >
                    <div className="mb-3 h-1.5 rounded-full" style={{ background: `linear-gradient(90deg, ${accent.from}, ${accent.to})` }} />
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <div className="text-base font-medium">
                          {r.card_name}{r.last4 ? ` •••• ${r.last4}` : ""}
                        </div>
                        <div className={`mt-1 text-sm ${r.days_to_due <= 5 ? "text-red-200" : "text-white/60"}`}>
                          Due {formatDateShort(r.due_date)} • {r.days_to_due} days
                        </div>
                        <div className="mt-2 text-xs text-white/60">
                          Need ~{formatINR(r.per_day_to_due)}/day
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-semibold">
                          <AnimatedNumber value={r.remaining_due} formatter={(n) => formatINR(n)} />
                        </div>
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