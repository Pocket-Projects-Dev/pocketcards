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