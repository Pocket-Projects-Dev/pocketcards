import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { formatDateShort, formatINR } from "../lib/format";
import { Badge, Button, Card, Input } from "../components/ui";
import { toast } from "../components/ToastHost";

type CardRow = {
  id: string;
  name: string;
  issuer: string | null;
  last4: string | null;
  close_day: number;
  due_day: number;
  credit_limit: number | null;
};

type SummaryRow = {
  remaining_due: number;
  due_date: string;
  days_to_due: number;
};

function num(v: any, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function EditCard() {
  const { cardId } = useParams();
  const id = cardId ?? "";
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [err, setErr] = useState<string | null>(null);

  const [card, setCard] = useState<CardRow | null>(null);
  const [summary, setSummary] = useState<SummaryRow | null>(null);

  const [name, setName] = useState("");
  const [issuer, setIssuer] = useState("");
  const [last4, setLast4] = useState("");
  const [closeDay, setCloseDay] = useState("25");
  const [dueDay, setDueDay] = useState("5");
  const [creditLimit, setCreditLimit] = useState("");

  const [confirmText, setConfirmText] = useState("");

  const mustConfirm = useMemo(() => (summary?.remaining_due ?? 0) > 0, [summary]);
  const canDelete = useMemo(() => confirmText.trim().toUpperCase() === "DELETE", [confirmText]);

  useEffect(() => {
    if (!id) return;

    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data: c, error: ce } = await supabase
        .from("cards")
        .select("id,name,issuer,last4,close_day,due_day,credit_limit")
        .eq("id", id)
        .single();

      if (!alive) return;

      if (ce) {
        setErr(ce.message);
        setLoading(false);
        return;
      }

      const row = c as unknown as CardRow;
      setCard(row);

      setName(row.name ?? "");
      setIssuer(row.issuer ?? "");
      setLast4(row.last4 ?? "");
      setCloseDay(String(row.close_day ?? 25));
      setDueDay(String(row.due_day ?? 5));
      setCreditLimit(row.credit_limit != null ? String(row.credit_limit) : "");

      const { data: s, error: se } = await supabase
        .from("card_cycle_summary")
        .select("remaining_due,due_date,days_to_due")
        .eq("card_id", id)
        .maybeSingle();

      if (!alive) return;

      if (!se && s) {
        setSummary({
          remaining_due: num((s as any).remaining_due, 0),
          due_date: String((s as any).due_date || ""),
          days_to_due: num((s as any).days_to_due, 0),
        });
      } else {
        setSummary(null);
      }

      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [id]);

  const save = async () => {
    if (!id) return;
    if (!name.trim()) {
      toast("Card name is required", "error");
      return;
    }

    setSaving(true);
    setErr(null);

    const payload: any = {
      name: name.trim(),
      issuer: issuer.trim() || null,
      last4: last4.trim() || null,
      close_day: num(closeDay, 25),
      due_day: num(dueDay, 5),
      credit_limit: creditLimit.trim() ? num(creditLimit, 0) : null,
    };

    const { error } = await supabase.from("cards").update(payload).eq("id", id);

    setSaving(false);

    if (error) {
      setErr(error.message);
      toast(error.message, "error");
      return;
    }

    toast("Card updated", "success");
    nav("/cards");
  };

  const purgeCard = async () => {
    if (!id) return;

    if (!canDelete) {
      toast("Type DELETE to confirm", "error");
      return;
    }

    setDeleting(true);
    setErr(null);

    try {
      const { data: plans, error: pe } = await supabase
        .from("emi_plans")
        .select("id")
        .eq("card_id", id);

      if (pe) throw new Error(pe.message);

      const planIds = (((plans as unknown) as any[]) ?? []).map((p: any) => String(p.id));

      if (planIds.length > 0) {
        const { error: ie } = await supabase.from("emi_installments").delete().in("emi_plan_id", planIds);
        if (ie) throw new Error(ie.message);

        const { error: pdel } = await supabase.from("emi_plans").delete().eq("card_id", id);
        if (pdel) throw new Error(pdel.message);
      }

      const { error: tdel } = await supabase.from("transactions").delete().eq("card_id", id);
      if (tdel) throw new Error(tdel.message);

      const { error: paydel } = await supabase.from("payments").delete().eq("card_id", id);
      if (paydel) throw new Error(paydel.message);

      const { error: cdel } = await supabase.from("cards").delete().eq("id", id);
      if (cdel) throw new Error(cdel.message);

      toast("Card deleted (and all linked data removed)", "success");
      nav("/cards");
    } catch (e: any) {
      const msg = e?.message || "Delete failed";
      setErr(msg);
      toast(msg, "error");
      setDeleting(false);
    }
  };

  if (loading) return <div className="p-4 text-sm text-white/70">Loading…</div>;

  return (
    <div className="p-4 text-white space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xl font-semibold tracking-tight truncate">Edit card</div>
          {card ? (
            <div className="mt-1 text-sm text-white/60 truncate">
              {card.name}{card.last4 ? ` •••• ${card.last4}` : ""}
            </div>
          ) : null}
        </div>
        {id ? (
          <Link to={`/cards/${id}/statement`}>
            <Button variant="ghost" className="px-3 py-2">Open statement</Button>
          </Link>
        ) : null}
      </div>

      {err ? <Card className="p-4 text-sm text-red-300">{err}</Card> : null}

      {summary ? (
        <Card className="p-5 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-sm text-white/70">Outstanding</div>
            <Badge tone={summary.remaining_due > 0 ? "warn" : "good"}>
              {summary.remaining_due > 0 ? "Has due" : "Clear"}
            </Badge>
          </div>
          <div className="text-2xl font-semibold">{formatINR(summary.remaining_due)}</div>
          {summary.due_date ? (
            <div className="text-xs text-white/60">
              Due {formatDateShort(summary.due_date)} • {summary.days_to_due} days
            </div>
          ) : null}
        </Card>
      ) : null}

      <Card className="p-5 space-y-4">
        <div>
          <div className="text-xs text-white/60">Card name</div>
          <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-white/60">Issuer (optional)</div>
            <Input value={issuer} onChange={(e) => setIssuer(e.target.value)} className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Last 4 (optional)</div>
            <Input value={last4} onChange={(e) => setLast4(e.target.value)} className="mt-2" />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-white/60">Limit</div>
            <Input value={creditLimit} onChange={(e) => setCreditLimit(e.target.value)} inputMode="numeric" className="mt-2" placeholder="400000" />
          </div>
          <div>
            <div className="text-xs text-white/60">Close day</div>
            <Input value={closeDay} onChange={(e) => setCloseDay(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
          <div>
            <div className="text-xs text-white/60">Due day</div>
            <Input value={dueDay} onChange={(e) => setDueDay(e.target.value)} inputMode="numeric" className="mt-2" />
          </div>
        </div>

        <Button variant="primary" onClick={save} disabled={saving || !name.trim()}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="text-sm text-white/70">Delete card</div>
        <div className="text-xs text-white/60">
          This removes the card and also deletes all linked spends, payments, EMI plans, and EMI installments for this card.
        </div>

        {mustConfirm ? (
          <div className="rounded-3xl bg-black/30 border border-red-400/20 p-4 space-y-3">
            <div className="text-sm text-red-200">This card has outstanding due. Deleting will wipe history.</div>
            <div className="text-xs text-white/60">Type DELETE to confirm.</div>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          </div>
        ) : (
          <div className="rounded-3xl bg-black/30 border border-white/10 p-4 space-y-3">
            <div className="text-xs text-white/60">Type DELETE to confirm.</div>
            <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
          </div>
        )}

        <Button variant="danger" onClick={purgeCard} disabled={deleting || !canDelete}>
          {deleting ? "Deleting…" : "Delete card"}
        </Button>
      </Card>
    </div>
  );
}