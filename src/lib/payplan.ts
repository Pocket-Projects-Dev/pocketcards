export type DueItem = { due_date: string; amount: number };
export type IncomeItem = { date: string; amount: number };

export type Milestone = {
  due_date: string;
  days_to_due: number;
  due_on_date: number;
  cumulative_due: number;
  required_per_day: number;
  income_until: number;
  gap: number;
};

export type CashflowPoint = {
  date: string;
  income: number;
  due: number;
  balance: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

function toUtcMs(dateISO: string) {
  return new Date(`${dateISO}T00:00:00.000Z`).getTime();
}

export function daysUntilISO(targetISO: string, baseISO: string) {
  const diff = toUtcMs(targetISO) - toUtcMs(baseISO);
  if (diff <= 0) return 0;
  return Math.ceil(diff / DAY_MS);
}

export function buildDuesByDate(items: DueItem[]) {
  const map = new Map<string, number>();
  for (const it of items) {
    const amt = Number(it.amount || 0);
    if (!it.due_date || amt <= 0) continue;
    map.set(it.due_date, (map.get(it.due_date) ?? 0) + amt);
  }
  const dueDates = Array.from(map.keys()).sort((a, b) => toUtcMs(a) - toUtcMs(b));
  return { duesByDate: map, dueDates };
}

export function buildMilestones(args: {
  baseDate: string;
  dueDates: string[];
  duesByDate: Map<string, number>;
  incomes: IncomeItem[];
  startBuffer: number;
}): Milestone[] {
  const incomesSorted = [...args.incomes]
    .filter((x) => x.date && Number(x.amount || 0) !== 0)
    .sort((a, b) => toUtcMs(a.date) - toUtcMs(b.date));

  let cumulative = 0;
  let incomeIdx = 0;
  let incomeSum = 0;

  const out: Milestone[] = [];
  for (const date of args.dueDates) {
    const dueOnDate = Number(args.duesByDate.get(date) ?? 0);
    cumulative += dueOnDate;

    while (incomeIdx < incomesSorted.length && toUtcMs(incomesSorted[incomeIdx].date) <= toUtcMs(date)) {
      incomeSum += Number(incomesSorted[incomeIdx].amount || 0);
      incomeIdx += 1;
    }

    const daysToDue = daysUntilISO(date, args.baseDate);
    const denom = Math.max(daysToDue, 1);
    const requiredPerDay = cumulative / denom;

    const gap = cumulative - (Number(args.startBuffer || 0) + incomeSum);

    out.push({
      due_date: date,
      days_to_due: daysToDue,
      due_on_date: dueOnDate,
      cumulative_due: cumulative,
      required_per_day: requiredPerDay,
      income_until: incomeSum,
      gap,
    });
  }

  return out;
}

function aggregateIncomeByDate(incomes: IncomeItem[]) {
  const map = new Map<string, number>();
  for (const i of incomes) {
    const amt = Number(i.amount || 0);
    if (!i.date || amt === 0) continue;
    map.set(i.date, (map.get(i.date) ?? 0) + amt);
  }
  return map;
}

export function buildCashflow(args: {
  dueDates: string[];
  duesByDate: Map<string, number>;
  incomes: IncomeItem[];
  startBuffer: number;
}) {
  const incomeByDate = aggregateIncomeByDate(args.incomes);

  const allDates = new Set<string>();
  for (const d of args.dueDates) allDates.add(d);
  for (const d of incomeByDate.keys()) allDates.add(d);

  const sortedDates = Array.from(allDates).sort((a, b) => toUtcMs(a) - toUtcMs(b));

  function simulate(start: number) {
    let balance = start;
    let minBalance = balance;
    const points: CashflowPoint[] = [];

    for (const date of sortedDates) {
      const income = Number(incomeByDate.get(date) ?? 0);
      const due = Number(args.duesByDate.get(date) ?? 0);
      balance = balance + income - due;
      minBalance = Math.min(minBalance, balance);
      points.push({ date, income, due, balance });
    }

    return { points, minBalance };
  }

  const simWith0 = simulate(0);
  const requiredStartingBuffer = Math.max(0, -simWith0.minBalance);

  const simWithBuffer = simulate(Number(args.startBuffer || 0));

  return {
    points: simWithBuffer.points,
    minBalance: simWithBuffer.minBalance,
    requiredStartingBuffer,
  };
}

export function buildPaycheckWindows(args: {
  dueDates: string[];
  duesByDate: Map<string, number>;
  incomes: IncomeItem[];
}) {
  const incomesSorted = [...args.incomes]
    .filter((x) => x.date && Number(x.amount || 0) !== 0)
    .sort((a, b) => toUtcMs(a.date) - toUtcMs(b.date));

  const windows: Array<{
    income_date: string;
    income_amount: number;
    next_income_date: string | null;
    dues_in_window: number;
    surplus: number;
    deficit: number;
  }> = [];

  if (incomesSorted.length === 0) {
    return { windows, preIncomeDues: 0 };
  }

  const firstIncomeDate = incomesSorted[0].date;
  let preIncomeDues = 0;
  for (const d of args.dueDates) {
    if (toUtcMs(d) < toUtcMs(firstIncomeDate)) preIncomeDues += Number(args.duesByDate.get(d) ?? 0);
  }

  for (let i = 0; i < incomesSorted.length; i++) {
    const start = incomesSorted[i].date;
    const end = incomesSorted[i + 1]?.date ?? null;

    let duesInWindow = 0;
    for (const d of args.dueDates) {
      const t = toUtcMs(d);
      const tStart = toUtcMs(start);
      const inLower = t >= tStart;
      const inUpper = end ? t < toUtcMs(end) : true;
      if (inLower && inUpper) duesInWindow += Number(args.duesByDate.get(d) ?? 0);
    }

    const incomeAmt = Number(incomesSorted[i].amount || 0);
    const delta = incomeAmt - duesInWindow;

    windows.push({
      income_date: start,
      income_amount: incomeAmt,
      next_income_date: end,
      dues_in_window: duesInWindow,
      surplus: Math.max(0, delta),
      deficit: Math.max(0, -delta),
    });
  }

  return { windows, preIncomeDues };
}