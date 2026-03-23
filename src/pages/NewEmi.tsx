import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatINR, todayISO } from "../lib/format";
import { buildEmiSchedule } from "../lib/emi";
import { useSession } from "../hooks/useSession";
import { Button, Card, Input, Select } from "../components/ui";
import { createEmi, isOfflineError } from "../lib/dbOps";
import { enqueueAction } from "../lib/offlineQueue";
import { toast } from "../components/ToastHost";

type CardRow = { id: string; name: string; last4: string | null };

export default function NewEmi() {
  const { session } = useSession();
  const userId = session?.user?.id ?? null;

  const nav = useNavigate();
  const location = useLocation();
  const qs = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const preCardId = qs.get("card") ?? "";
  const cycleMonth = qs.get("m") ?? "";

  const [cards, setCards] = useState<CardRow[]>([]);
  const [cardId, setCardId] = useState("");
  const [principal, setPrincipal] = useState("");
  const [annualRate, setAnnualRate] = useState("14");
  const [months, setMonths] = useState("12");
  const [firstDueDate, setFirstDueDate] = useState(todayISO());
  const [purchaseDate, setPurchaseDate] = useState(todayISO());
  const [statementMonth, setStatementMonth] = useState(cycleMonth || todayISO().slice(0, 7));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("id,name,last4")
        .is("archived_at", null)
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error) return;

      const list = (((data as unknown) as any[]) ?? []) as CardRow[];
      setCards(list);

      if (!cardId) {
        const match = list.find((c) => c.id === preCardId);
        setCardId(match?.id ?? list[0]?.id ?? "");
      }
    })();

    return () => {
      alive = false;
    };
  }, [preCardId]);

  useEffect(() => {
    if (!cardId) return;
    let alive = true;

    (async () => {
      const { data, error } = await supabase
        .from("card_cycle_summary")
        .select("due_date")
        .eq("card_id", cardId)
        .limit(1)
        .maybeSingle();

      if (!alive) return;
      if (!error && data?.due_date) setFirstDueDate(String(data.due_date));
    })();

    return () => {
      alive = false;
    };
  }, [cardId]);

  const preview = useMemo(() => {
    const p = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);
    if (p > 0 && m > 0) {
      const s = buildEmiSchedule({ principal: p, annualRate: r, months: m, firstDueDate });
      return { monthlyEmi: s.monthlyEmi, totalPayable: s.totalPayable };
    }
    return null;
  }, [principal, annualRate, months, firstDueDate]);

  const backTo = cycleMonth && cardId ? `/cards/${cardId}/statement?m=${cycleMonth}` : cardId ? `/cards/${cardId}/statement` : "/cards";

  const save = async () => {
    if (!userId) return toast("Not signed in", "error");
    if (!cardId) return;

    const P = Number(principal || 0);
    const r = Number(annualRate || 0);
    const m = Number(months || 0);

    if (!(P > 0) || !(m > 0)) {
      toast("Enter valid EMI details", "error");
      return;
    }

    setBusy(true);

    const result = await createEmi({
      userId,
      cardId,
      principal: P,
      annualRate: r,
      months: m,
      firstDueDate,
      purchaseDate,
      statementMonth,
    });

    if (result.ok) {
      setBusy(false);
      toast("EMI created", "success");
      nav(backTo);
      return;
    }

    if (isOfflineError(result.error)) {
      enqueueAction({
        type: "create_emi",
        payload: {
          userId,
          cardId,
          principal: P,
          annualRate: r,
          months: m,
          firstDueDate,
          purchaseDate,
          statementMonth,
        },
      });
      setBusy(false);
      toast("Offline. EMI creation queued.", "success");
      nav(backTo);
      return;
    }

    setBusy(false);
    toast(result.error, "error");
  };

  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Convert to EMI</div>
        <div className="mt-1 text-sm text-white/60">Route fallback for the statement quick action</div>
      </div>

      <Card className="p-5 space-y-4">
        <div>
          <div className="text-xs text-white/60">Card</div>
          <Select value={cardId} onChange={(e) => setCardId(e.target.value)} className="mt-2">
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}{c.last4 ? ` •••• ${c.last4}` : ""}
              </option>
            ))}
          </Select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Principal</div>
            <Input value={principal} onChange={(e) => setPrincipal(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Months</div>
            <Input value={months} onChange={(e) => setMonths(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Annual rate (%)</div>
            <Input value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">First installment due</div>
            <Input value={firstDueDate} onChange={(e) => setFirstDueDate(e.target.value)} type="date" className="mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Purchase date</div>
            <Input value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} type="date" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Cycle ending month</div>
            <Input value={statementMonth} onChange={(e) => setStatementMonth(e.target.value)} type="month" className="mt-2" />
          </div>
        </div>

        {preview ? (
          <div className="rounded-3xl bg-black/30 border border-white/10 p-4 text-sm text-white/70">
            EMI {formatINR(preview.monthlyEmi)} / mo • Total {formatINR(preview.totalPayable)}
          </div>
        ) : null}

        {!navigator.onLine ? (
          <div className="text-xs text-amber-200">
            You’re offline. EMI creation will be queued and synced later.
          </div>
        ) : null}

        <Button variant="primary" onClick={save} disabled={busy || !cardId || Number(principal || 0) <= 0 || Number(months || 0) <= 0}>
          {busy ? "Saving…" : "Create EMI"}
        </Button>
      </Card>
    </div>
  );
}