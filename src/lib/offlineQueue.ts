import { createPayment, createSpend, deleteSpend, isOfflineError, updateSpend } from "./dbOps";

export type PendingAction =
  | {
      id: string;
      type: "create_spend";
      payload: { userId: string; cardId: string; amount: number; date: string; note?: string };
      createdAt: string;
      attempts: number;
      lastError?: string | null;
    }
  | {
      id: string;
      type: "update_spend";
      payload: { spendId: string; cardId: string; amount: number; date: string; note?: string };
      createdAt: string;
      attempts: number;
      lastError?: string | null;
    }
  | {
      id: string;
      type: "delete_spend";
      payload: { spendId: string; cardId: string };
      createdAt: string;
      attempts: number;
      lastError?: string | null;
    }
  | {
      id: string;
      type: "create_payment";
      payload: { userId: string; cardId: string; amount: number; paidOn: string; withdrawFund?: boolean };
      createdAt: string;
      attempts: number;
      lastError?: string | null;
    };

const KEY = "pc_offline_queue_v1";
const EVENT = "pc_offline_queue_changed";

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

function readQueue(): PendingAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeQueue(queue: PendingAction[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(queue));
  emitChange();
}

export function getPendingActions() {
  return readQueue();
}

export function getPendingCount() {
  return readQueue().length;
}

export function onQueueChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function enqueueAction(action: Omit<PendingAction, "id" | "createdAt" | "attempts">) {
  const queue = readQueue();
  const full: PendingAction = {
    ...action,
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  } as PendingAction;

  queue.push(full);
  writeQueue(queue);
  return full.id;
}

export async function syncPendingQueue() {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return { synced: 0, failed: 0, pending: getPendingCount() };
  }

  let queue = readQueue();
  let synced = 0;
  let failed = 0;

  for (let i = 0; i < queue.length; i++) {
    const item = queue[i];
    let result:
      | { ok: true }
      | { ok: false; error: string };

    if (item.type === "create_spend") {
      result = await createSpend(item.payload);
    } else if (item.type === "update_spend") {
      result = await updateSpend(item.payload);
    } else if (item.type === "delete_spend") {
      result = await deleteSpend(item.payload);
    } else {
      result = await createPayment(item.payload);
    }

    if (result.ok) {
      queue = queue.filter((q) => q.id !== item.id);
      synced += 1;
      writeQueue(queue);
      continue;
    }

    failed += 1;

    if (isOfflineError(result.error)) {
      break;
    }

    queue = queue.map((q) =>
      q.id === item.id
        ? { ...q, attempts: q.attempts + 1, lastError: result.error }
        : q
    );
    writeQueue(queue);
  }

  return { synced, failed, pending: queue.length };
}