import { todayISO } from "./format";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function makeDate(y: number, m: number, d: number) {
  const last = daysInMonth(y, m);
  const dd = Math.min(d, last);
  return `${y}-${pad2(m)}-${pad2(dd)}`;
}

export function addDays(iso: string, delta: number) {
  const t = new Date(`${iso}T00:00:00.000Z`).getTime() + delta * 86400000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

export function addMonthsToYM(ym: string, delta: number) {
  const [yy, mm] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(yy, mm - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + delta);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function getCurrentCycleMonth(closeDay: number, baseDate = todayISO()) {
  const yy = Number(baseDate.slice(0, 4));
  const mm = Number(baseDate.slice(5, 7));
  const dd = Number(baseDate.slice(8, 10));

  if (dd <= closeDay) return `${yy}-${pad2(mm)}`;

  const d = new Date(Date.UTC(yy, mm - 1, 1));
  d.setUTCMonth(d.getUTCMonth() + 1);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}`;
}

export function computeCycleWindow(cycleMonth: string, closeDay: number, dueDay: number) {
  const [yy, mm] = cycleMonth.split("-").map(Number);

  const cycleEnd = makeDate(yy, mm, closeDay);

  const prev = new Date(Date.UTC(yy, mm - 1, 1));
  prev.setUTCMonth(prev.getUTCMonth() - 1);
  const prevY = prev.getUTCFullYear();
  const prevM = prev.getUTCMonth() + 1;

  const prevClose = makeDate(prevY, prevM, closeDay);
  const cycleStart = addDays(prevClose, 1);

  const dueMonth =
    dueDay > closeDay ? cycleMonth : addMonthsToYM(cycleMonth, 1);

  const [dy, dm] = dueMonth.split("-").map(Number);
  const dueDate = makeDate(dy, dm, dueDay);

  return {
    cycleMonth,
    cycleStart,
    cycleEnd,
    dueDate,
    payStart: cycleStart,
  };
}

export function daysUntilISO(targetISO: string) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const t = new Date(`${targetISO}T00:00:00.000Z`);
  const diff = t.getTime() - base.getTime();
  return Math.ceil(diff / 86400000);
}

export function isoDate(v: any) {
  if (!v) return "";
  const s = String(v);
  return s.includes("T") ? s.slice(0, 10) : s.slice(0, 10);
}