import { supabase } from "./supabase";
import { cacheDelPrefix } from "./cache";

type OpResult = { ok: true } | { ok: false; error: string };

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
      cacheDelPrefix(`stmt:${input.cardId}:`);
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
      cacheDelPrefix(`stmt:${input.cardId}:`);
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

  cacheDelPrefix(`stmt:${input.cardId}:`);
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

  cacheDelPrefix(`stmt:${input.cardId}:`);
  return { ok: true };
}