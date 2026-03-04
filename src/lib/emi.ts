type BuildArgs = {
  principal: number;
  annualRate: number;
  months: number;
  firstDueDate: string; // YYYY-MM-DD
};

export type EmiInstallment = {
  index: number;
  due_date: string;
  amount: number;
  principal_component: number;
  interest_component: number;
};

function addMonthsISO(iso: string, months: number) {
  const d = new Date(`${iso}T00:00:00.000Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);

  // try to preserve day-of-month where possible
  const maxDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, maxDay));

  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function buildEmiSchedule(args: BuildArgs) {
  const P = Number(args.principal || 0);
  const n = Math.max(1, Math.floor(Number(args.months || 0)));
  const r = Number(args.annualRate || 0) / 12 / 100;

  let monthlyEmi = 0;
  if (r === 0) monthlyEmi = P / n;
  else {
    const pow = Math.pow(1 + r, n);
    monthlyEmi = (P * r * pow) / (pow - 1);
  }

  monthlyEmi = Math.round(monthlyEmi);

  const installments: EmiInstallment[] = [];
  let balance = P;
  let totalInterest = 0;

  for (let i = 1; i <= n; i++) {
    const interest = Math.round(balance * r);
    let principalComp = monthlyEmi - interest;

    if (i === n) {
      // final adjust to clear rounding
      principalComp = balance;
    }

    const amt = principalComp + interest;
    balance = Math.max(0, balance - principalComp);
    totalInterest += interest;

    installments.push({
      index: i,
      due_date: addMonthsISO(args.firstDueDate, i - 1),
      amount: amt,
      principal_component: principalComp,
      interest_component: interest,
    });
  }

  const totalPayable = installments.reduce((s, x) => s + x.amount, 0);

  return {
    monthlyEmi,
    totalPayable,
    totalInterest,
    installments,
  };
}