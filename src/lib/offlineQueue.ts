import {
  archiveCard,
  createEmi,
  createPayment,
  createSpend,
  isOfflineError,
  markReminderDone,
  restoreCard,
  updateCard,
  updateSpend,
  deleteSpend,
} from "./dbOps";

export type PendingAction = {
  id: string;
  type:
    | "create_spend"
    | "update_spend"
    | "delete_spend"
    | "create_payment"
    | "update_card"
    | "archive_card"
    | "restore_card"
    | "create_emi"
    | "mark_reminder_done";
  payload: any;
  createdAt: string;
  attempts: number;
  lastError?: string | null;
};

type SyncLogItem = {
  id: string;
  at: string;
  status: "ok" | "error";
  message: string;
  actionType: string;
};

const KEY = "pc_offline_queue_v2";
const LOG_KEY = "pc_sync_log_v1";
const EVENT = "pc_offline_queue_changed";
const LOG_EVENT = "pc_sync_log_changed";

function emitChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT));
}

function emitLogChange() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LOG_EVENT));
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

function readLogs(): SyncLogItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOG_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLogs(logs: SyncLogItem[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOG_KEY, JSON.stringify(logs.slice(0, 50)));
  emitLogChange();
}

function appendLog(status: "ok" | "error", actionType: string, message: string) {
  const logs = readLogs();
  logs.unshift({
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    at: new Date().toISOString(),
    status,
    actionType,
    message,
  });
  writeLogs(logs);
}

export function getPendingActions() {
  return readQueue();
}

export function getPendingCount() {
  return readQueue().length;
}

export function clearPendingQueue() {
  writeQueue([]);
}

export function getSyncHistory() {
  return readLogs();
}

export function clearSyncHistory() {
  writeLogs([]);
}

export function onQueueChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}

export function onSyncHistoryChange(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(LOG_EVENT, handler);
  return () => window.removeEventListener(LOG_EVENT, handler);
}

export function enqueueAction(action: { type: PendingAction["type"]; payload: any }) {
  const queue = readQueue();
  const full: PendingAction = {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`,
    type: action.type,
    payload: action.payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: null,
  };

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

    switch (item.type) {
      case "create_spend":
        result = await createSpend(item.payload);
        break;
      case "update_spend":
        result = await updateSpend(item.payload);
        break;
      case "delete_spend":
        result = await deleteSpend(item.payload);
        break;
      case "create_payment":
        result = await createPayment(item.payload);
        break;
      case "update_card":
        result = await updateCard(item.payload);
        break;
      case "archive_card":
        result = await archiveCard(item.payload.cardId);
        break;
      case "restore_card":
        result = await restoreCard(item.payload.cardId);
        break;
      case "create_emi":
        result = await createEmi(item.payload);
        break;
      case "mark_reminder_done":
        result = await markReminderDone(item.payload.id);
        break;
      default:
        result = { ok: false, error: "Unknown queued action." };
        break;
    }

    if (result.ok) {
      queue = queue.filter((q) => q.id !== item.id);
      writeQueue(queue);
      appendLog("ok", item.type, "Synced");
      synced += 1;
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
    appendLog("error", item.type, result.error);
  }

  return { synced, failed, pending: queue.length };
}