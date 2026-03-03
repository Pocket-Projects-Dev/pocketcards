function round2(n: number) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

function toISO(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export type EmiInstallment = {
  installmentNo: number;
  dueDate: string;
  principal: number;
  interest: number;
  amount: number;
};

export function buildEmiSchedule(args: {
  principal: number;
  annualRate: number; // percent
  months: number;
  firstDueDate: string; // YYYY-MM-DD
}) {
  const { principal, annualRate, months, firstDueDate } = args;
  const r = annualRate <= 0 ? 0 : annualRate / 12 / 100;

  const monthlyEmi =
    r === 0
      ? round2(principal / months)
      : round2((principal * r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1));

  let outstanding = principal;
  const first = new Date(`${firstDueDate}T00:00:00`);
  const day = first.getDate(); // safe because we only use 1-28 typically

  const installments: EmiInstallment[] = [];
  let totalInterest = 0;

  for (let i = 1; i <= months; i++) {
    const due = new Date(first.getFullYear(), first.getMonth() + (i - 1), day);
    const interest = r === 0 ? 0 : round2(outstanding * r);

    let principalComp = round2(monthlyEmi - interest);
    if (i === months) {
      principalComp = round2(outstanding); // close out balance
    }

    const amount = round2(principalComp + interest);
    outstanding = round2(outstanding - principalComp);
    totalInterest = round2(totalInterest + interest);

    installments.push({
      installmentNo: i,
      dueDate: toISO(due),
      principal: principalComp,
      interest,
      amount,
    });
  }

  const totalPayable = round2(installments.reduce((s, x) => s + x.amount, 0));
  return { monthlyEmi, totalPayable, totalInterest, installments };
}