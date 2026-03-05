import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDateShort, formatINR, todayISO } from "../lib/format";
import { Button, Card, ProgressBar, Skeleton, Badge } from "../components/ui";
import { computeFundBalance, sumTodayNet, type FundEvent } from "../lib/fund";
import { useSession } from "../hooks/useSession";
import { toast } from "../components/ToastHost";

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
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-full" />
      </Card>

      <div className="grid grid-cols-2 gap-3">
        <Card className="p-5 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-32" />
        </Card>
        <Card className="p-5 space-y-2">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-8 w-32" />
        </Card>
      </div>

      <Card className="p-5 space-y-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const [rows, setRows] = useState<CycleRow[]>([]);
  const [fundEvents, setFundEvents] = useState<FundEvent[]>([]);
  const [reminders, setReminders] = useState<ReminderRow[]>([]);
  const [remindersSupported, setRemindersSupported] = useState(true);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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

      await loadReminders();

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  const dueList = useMemo(() => rows.filter((r) => Number(r.remaining_due || 0) > 0), [rows]);

  const nextCard = useMemo(() => (dueList[0] ?? rows[0] ?? null) as CycleRow | null, [dueList, rows]);

  const urgent = useMemo(() => dueList.find((r) => r.days_to_due <= 3) ?? dueList.find((r) => r.days_to_due <= 7) ?? null, [dueList]);

  const totalDue = useMemo(() => rows.reduce((s, r) => s + Number(r.remaining_due || 0), 0), [rows]);
  const todaySuggestion = useMemo(() => Math.ceil(rows.reduce((s, r) => s + Number(r.per_day_to_due || 0), 0)), [rows]);

  const fundBalance = useMemo(() => computeFundBalance(fundEvents), [fundEvents]);
  const todayNet = useMemo(() => sumTodayNet(fundEvents, todayISO()), [fundEvents]);

  const fundProgress = useMemo(() => {
    if (totalDue <= 0) return 0;
    return Math.max(0, Math.min(1, fundBalance / totalDue));
  }, [fundBalance, totalDue]);

  const setAsideToday = async () => {
    if (!userId) return;
    if (!(todaySuggestion > 0)) return;

    setBusy(true);
    setErr(null);

    const payload = {
      user_id: userId,
      event_date: todayISO(),
      event_type: "set_aside",
      amount: Number(todaySuggestion),
      note: "Daily set-aside",
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

    setFundEvents((prev) => [((data as unknown) as FundEvent), ...prev]);
    toast("Set-aside saved", "success");
    setBusy(false);
  };

  const createDueReminder = async (row: CycleRow) => {
    if (!userId) return;
    if (!remindersSupported) {
      toast("Reminders table not enabled yet", "error");
      return;
    }

    const today = todayISO();
    const candidate = addDaysToISO(row.due_date, -3);
    const remindOn = candidate < today ? today : candidate;

    const payload = {
      user_id: userId,
      card_id: row.card_id,
      kind: "due",
      title: `Pay ${row.card_name}${row.last4 ? ` •••• ${row.last4}` : ""}`,
      body: `Due ${row.due_date}. Remaining ${Number(row.remaining_due || 0)}.`,
      remind_on: remindOn,
      is_done: false,
    };

    const { error } = await supabase
      .from("in_app_reminders")
      .upsert(payload, { onConflict: "user_id,card_id,remind_on,kind" });

    if (error) {
      toast(error.message, "error");
      return;
    }

    toast(`Reminder set for ${formatDateShort(remindOn)}`, "success");
    await loadReminders();
  };

  const markDone = async (id: string) => {
    const { error } = await supabase.from("in_app_reminders").update({ is_done: true }).eq("id", id);
    if (error) {
      toast(error.message, "error");
      return;
    }
    setReminders((prev) => prev.filter((r) => r.id !== id));
    toast("Marked done", "success");
  };

  if (loading) return <DashboardSkeleton />;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-2xl font-semibold tracking-tight">Dashboard</div>
          <div className="mt-1 text-sm text-white/60">Daily action + upcoming dues</div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/plan"><Button variant="ghost" className="px-3 py-2">Plan</Button></Link>
          <Button variant="ghost" className="px-3 py-2" onClick={signOut}>Sign out</Button>
        </div>
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      {rows.length === 0 ? (
        <Card className="p-5 space-y-3">
          <div className="text-lg font-semibold">Start here</div>
          <div className="text-sm text-white/60">
            Add your first card, then open its statement to track spends and payments.
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/cards/new"><Button className="w-full" variant="primary">Add card</Button></Link>
            <Link to="/cards"><Button className="w-full">View cards</Button></Link>
          </div>
        </Card>
      ) : null}

      {urgent ? (
        <Card className="p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Due soon</div>
            <Badge tone={urgent.days_to_due <= 3 ? "danger" : "warn"}>In {urgent.days_to_due}d</Badge>
          </div>
          <div className="text-xl font-semibold">
            {urgent.card_name}{urgent.last4 ? ` •••• ${urgent.last4}` : ""} • {formatINR(urgent.remaining_due)}
          </div>
          <div className="text-sm text-white/60">Due {formatDateShort(urgent.due_date)}</div>
          <div className="grid grid-cols-2 gap-2">
            <Link to={`/cards/${urgent.card_id}/statement`}><Button className="w-full" variant="primary">Open statement</Button></Link>
            <Button className="w-full" onClick={() => createDueReminder(urgent)} disabled={!remindersSupported}>
              Add reminder
            </Button>
          </div>
        </Card>
      ) : null}

      {nextCard ? (
        <Card className="p-5 space-y-4">
          <div className="text-sm text-white/60">Continue</div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-xl font-semibold">
                {nextCard.card_name}{nextCard.last4 ? ` •••• ${nextCard.last4}` : ""}
              </div>
              <div className="mt-1 text-sm text-white/60">
                Due {formatDateShort(nextCard.due_date)} • {nextCard.days_to_due} days • Remaining {formatINR(nextCard.remaining_due)}
              </div>
            </div>
            <Link to={`/cards/${nextCard.card_id}/statement`}>
              <Button variant="primary" className="px-4 py-3">Open</Button>
            </Link>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Link to={`/add/spend?card=${nextCard.card_id}`}><Button className="w-full">Add spend</Button></Link>
            <Link to={`/add/payment?card=${nextCard.card_id}`}><Button className="w-full">Add payment</Button></Link>
            <Link to={`/add/emi?card=${nextCard.card_id}`}><Button className="w-full">Convert EMI</Button></Link>
          </div>
        </Card>
      ) : null}

      <Card className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-sm text-white/60">Today’s set-aside</div>
            <div className="mt-1 text-3xl font-semibold">{formatINR(todaySuggestion)}</div>
            <div className="mt-2 text-xs text-white/60">
              Fund {formatINR(fundBalance)} • Today net {todayNet >= 0 ? "+" : "-"}{formatINR(Math.abs(todayNet))}
            </div>
          </div>
          <Button variant="primary" onClick={setAsideToday} disabled={busy || !(todaySuggestion > 0)}>
            {busy ? "Saving…" : "Set aside"}
          </Button>
        </div>

        <div>
          <div className="flex items-center justify-between text-xs text-white/60">
            <span>Fund coverage vs upcoming due</span>
            <span>{formatINR(fundBalance)} / {formatINR(totalDue)}</span>
          </div>
          <div className="mt-2">
            <ProgressBar value={fundProgress} />
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">Reminders</div>

        {!remindersSupported ? (
          <div className="mt-3 text-sm text-white/60">
            Reminders are not enabled yet. Run the SQL in Step 0 to enable in-app reminders.
          </div>
        ) : reminders.length === 0 ? (
          <div className="mt-3 text-sm text-white/60">No reminders due in the next 14 days.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {reminders.map((r) => (
              <div key={r.id} className="rounded-3xl bg-black/30 border border-white/10 p-4 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-sm">{formatDateShort(r.remind_on)}</div>
                  <div className="mt-1 text-base">{r.title}</div>
                  {r.body ? <div className="mt-1 text-xs text-white/60 truncate">{r.body}</div> : null}
                </div>
                <Button size="sm" variant="secondary" onClick={() => markDone(r.id)}>
                  Done
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-5">
        <div className="text-sm text-white/70">Upcoming dues</div>

        {rows.length === 0 ? (
          <div className="mt-3 text-sm text-white/70">Add a card to see due planning.</div>
        ) : (
          <div className="mt-4 space-y-2">
            {rows.map((r) => (
              <Link key={r.card_id} to={`/cards/${r.card_id}/statement`}>
                <div className="rounded-3xl bg-black/30 border border-white/10 p-4 hover:bg-white/[0.03] transition">
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
                      <div className="text-lg font-semibold">{formatINR(r.remaining_due)}</div>
                      <div className="mt-2 text-xs text-white/50">
                        Spend {formatINR(r.cycle_spend)} • EMI {formatINR(r.emi_due)}
                      </div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}