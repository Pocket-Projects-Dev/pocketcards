import { buildEmiSchedule } from "./emi";
import { cacheDelPrefix } from "./cache";
import { supabase } from "./supabase";

export type OpResult = { ok: true } | { ok: false; error: string };

function errorKind(err: any): { kind: "missing" | "notnull" | "other"; column: string | null; message: string } {
  const msg = String(err?.message || "");

  const mMissing1 = msg.match(/Could not find the '([^']+)' column/i);
  if (mMissing1) return { kind: "missing", column: mMissing1[1], message: msg };

  const mMissing2 = msg.match(/column [^\.]+\.(\w+) does not exist/i);
  if (mMissing2) return { kind: "missing", column: mMissing2[1], message: msg };

  const mNotNull = msg.match(/null value in column "([^"]+)".*violates not-null constraint/i);
  if (mNotNull) return { kind: "notnull", column: mNotNull[1], message: msg };

  return { kind: "other", column: null, message: msg };
}

function invalidateCard(cardId: string) {
  cacheDelPrefix(`stmt:${cardId}:`);
}

export function isOfflineError(err: any) {
  const msg = String(err?.message || err || "").toLowerCase();
  return (
    (typeof navigator !== "undefined" && !navigator.onLine) ||
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("fetch") ||
    msg.includes("offline")
  );
}

export async function createSpend(input: {
  userId: string;
  cardId: string;
  amount: number;
  date: string;
  note?: string;
  isEmi?: boolean;
  emiPlanId?: string | null;
}): Promise<OpResult> {
  const isoAt = new Date(`${input.date}T00:00:00.000Z`).toISOString();

  let payload: any = {
    user_id: input.userId,
    card_id: input.cardId,
    amount: input.amount,
    is_emi: Boolean(input.isEmi),
    emi_plan_id: input.emiPlanId ?? null,

    txn_date: input.date,
    spent_on: input.date,
    transaction_date: input.date,
    date: input.date,

    spent_at: isoAt,
    txn_at: isoAt,
  };

  if (input.note?.trim()) payload.note = input.note.trim();

  for (let i = 0; i < 14; i++) {
    const { error } = await supabase.from("transactions").insert(payload);

    if (!error) {
      invalidateCard(input.cardId);
      return { ok: true };
    }

    const info = errorKind(error);

    if (info.kind === "missing" && info.column && info.column in payload) {
      delete payload[info.column];
      continue;
    }

    if (info.kind === "notnull" && info.column === "txn_date") {
      payload.txn_date = input.date;
      continue;
    }

    return { ok: false, error: info.message };
  }

  return { ok: false, error: "Could not save spend after retries." };
}

export async function updateSpend(input: {
  spendId: string;
  cardId: string;
  amount: number;
  date: string;
  note?: string;
}): Promise<OpResult> {
  const isoAt = new Date(`${input.date}T00:00:00.000Z`).toISOString();

  let payload: any = {
    amount: input.amount,
    note: input.note?.trim() || null,

    txn_date: input.date,
    spent_on: input.date,
    transaction_date: input.date,
    date: input.date,

    spent_at: isoAt,
    txn_at: isoAt,
  };

  for (let i = 0; i < 14; i++) {
    const { error } = await supabase.from("transactions").update(payload).eq("id", input.spendId);

    if (!error) {
      invalidateCard(input.cardId);
      return { ok: true };
    }

    const info = errorKind(error);

    if (info.kind === "missing" && info.column && info.column in payload) {
      delete payload[info.column];
      continue;
    }

    if (info.kind === "notnull" && info.column === "txn_date") {
      payload.txn_date = input.date;
      continue;
    }

    return { ok: false, error: info.message };
  }

  return { ok: false, error: "Could not update spend after retries." };
}

export async function deleteSpend(input: {
  spendId: string;
  cardId: string;
}): Promise<OpResult> {
  const { error } = await supabase.from("transactions").delete().eq("id", input.spendId);

  if (error) return { ok: false, error: error.message };

  invalidateCard(input.cardId);
  return { ok: true };
}

export async function createPayment(input: {
  userId: string;
  cardId: string;
  amount: number;
  paidOn: string;
  withdrawFund?: boolean;
}): Promise<OpResult> {
  const paidAtIso = new Date(`${input.paidOn}T00:00:00.000Z`).toISOString();

  let paymentPayload: any = {
    user_id: input.userId,
    card_id: input.cardId,
    amount: input.amount,

    paid_on: input.paidOn,
    paid_at: paidAtIso,

    txn_date: input.paidOn,
    txn_at: paidAtIso,
    date: input.paidOn,
    payment_date: input.paidOn,
  };

  for (let i = 0; i < 14; i++) {
    const { error } = await supabase.from("payments").insert(paymentPayload);

    if (!error) break;

    const info = errorKind(error);

    if (info.kind === "missing" && info.column && info.column in paymentPayload) {
      delete paymentPayload[info.column];
      continue;
    }

    return { ok: false, error: info.message };
  }

  if (input.withdrawFund) {
    const { error } = await supabase.from("plan_fund_events").insert({
      user_id: input.userId,
      event_date: input.paidOn,
      event_type: "withdraw",
      amount: input.amount,
      note: "Card payment",
    });

    if (error) return { ok: false, error: error.message };
  }

  invalidateCard(input.cardId);
  return { ok: true };
}

export async function updateCard(input: {
  cardId: string;
  name: string;
  issuer?: string | null;
  last4?: string | null;
  closeDay: number;
  dueDay: number;
  creditLimit?: number | null;
}): Promise<OpResult> {
  const payload = {
    name: input.name.trim(),
    issuer: input.issuer?.trim() || null,
    last4: input.last4?.trim() || null,
    close_day: input.closeDay,
    due_day: input.dueDay,
    credit_limit: input.creditLimit ?? null,
  };

  const { error } = await supabase.from("cards").update(payload).eq("id", input.cardId);
  if (error) return { ok: false, error: error.message };
  invalidateCard(input.cardId);
  return { ok: true };
}

export async function archiveCard(cardId: string): Promise<OpResult> {
  const { error } = await supabase
    .from("cards")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", cardId);

  if (error) return { ok: false, error: error.message };
  invalidateCard(cardId);
  return { ok: true };
}

export async function restoreCard(cardId: string): Promise<OpResult> {
  const { error } = await supabase
    .from("cards")
    .update({ archived_at: null })
    .eq("id", cardId);

  if (error) return { ok: false, error: error.message };
  invalidateCard(cardId);
  return { ok: true };
}

export async function markReminderDone(id: string): Promise<OpResult> {
  const { error } = await supabase
    .from("in_app_reminders")
    .update({ is_done: true })
    .eq("id", id);

  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function createEmi(input: {
  userId: string;
  cardId: string;
  principal: number;
  annualRate: number;
  months: number;
  firstDueDate: string;
  purchaseDate: string;
  statementMonth: string;
}): Promise<OpResult> {
  const schedule = buildEmiSchedule({
    principal: input.principal,
    annualRate: input.annualRate,
    months: input.months,
    firstDueDate: input.firstDueDate,
  });

  let planPayload: any = {
    user_id: input.userId,
    card_id: input.cardId,
    principal: input.principal,
    first_due_date: input.firstDueDate,
    purchase_date: input.purchaseDate,
    statement_month: input.statementMonth,

    monthly_emi: schedule.monthlyEmi,
    total_payable: schedule.totalPayable,
    total_interest: schedule.totalInterest,

    months: input.months,
    tenure: input.months,
    tenure_months: input.months,

    annual_interest_rate: input.annualRate,
    annual_rate: input.annualRate,
    rate: input.annualRate,
    interest_rate: input.annualRate,
    apr: input.annualRate,
  };

  let planId: string | null = null;

  for (let i = 0; i < 16; i++) {
    const { data, error } = await supabase.from("emi_plans").insert(planPayload).select("id").single();

    if (!error && data?.id) {
      planId = String(data.id);
      break;
    }

    if (error) {
      const info = errorKind(error);

      if (info.kind === "missing" && info.column && info.column in planPayload) {
        delete planPayload[info.column];
        continue;
      }

      if (info.kind === "notnull" && info.column === "annual_interest_rate") {
        planPayload.annual_interest_rate = input.annualRate;
        continue;
      }

      return { ok: false, error: info.message };
    }
  }

  if (!planId) return { ok: false, error: "Could not create EMI plan after retries." };

  let installmentsPayload: any[] = schedule.installments.map((x: any, idx: number) => ({
    user_id: input.userId,
    emi_plan_id: planId,
    installment_no: Number(x.index || idx + 1),
    due_date: x.due_date,
    amount: x.amount,
    principal_component: x.principal_component,
    interest_component: x.interest_component,
  }));

  for (let i = 0; i < 10; i++) {
    const { error } = await supabase.from("emi_installments").insert(installmentsPayload);
    if (!error) break;

    const info = errorKind(error);

    if (info.kind === "missing" && info.column) {
      installmentsPayload = installmentsPayload.map((row) => {
        const next = { ...row };
        delete next[info.column as keyof typeof next];
        return next;
      });
      continue;
    }

    if (info.kind === "notnull" && info.column === "installment_no") {
      installmentsPayload = installmentsPayload.map((row, idx) => ({
        ...row,
        installment_no: idx + 1,
      }));
      continue;
    }

    return { ok: false, error: info.message };
  }

  const tx = await createSpend({
    userId: input.userId,
    cardId: input.cardId,
    amount: input.principal,
    date: input.purchaseDate,
    note: "EMI conversion",
    isEmi: true,
    emiPlanId: planId,
  });

  if (!tx.ok) return tx;

  invalidateCard(input.cardId);
  return { ok: true };
}