import { Link } from "react-router-dom";

function Action({ to, title, desc }: { to: string; title: string; desc: string }) {
  return (
    <Link to={to} className="block rounded-2xl bg-white/5 p-4">
      <div className="text-base font-medium text-white">{title}</div>
      <div className="mt-1 text-sm text-white/70">{desc}</div>
    </Link>
  );
}

export default function AddHub() {
  return (
    <div className="p-4 text-white">
      <h2 className="text-lg font-semibold">Add</h2>
      <div className="mt-4 space-y-3">
        <Action to="/add/spend" title="Spend" desc="Normal card spend (counts in cycle due)" />
        <Action to="/add/payment" title="Payment" desc="Log what you paid to a card" />
        <Action to="/add/income" title="Income" desc="Salary or other inflow used for bills" />
        <Action to="/add/emi" title="EMI" desc="Create EMI plan + schedule, store purchase record" />
      </div>
    </div>
  );
}