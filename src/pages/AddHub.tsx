import { Link } from "react-router-dom";

function Tile(props: { to: string; title: string; subtitle: string }) {
  return (
    <Link to={props.to} className="block rounded-2xl bg-white/5 p-4">
      <div className="text-base font-medium">{props.title}</div>
      <div className="mt-1 text-sm text-white/70">{props.subtitle}</div>
    </Link>
  );
}

export default function AddHub() {
  return (
    <div className="p-4 space-y-3">
      <h2 className="text-lg font-semibold">Add</h2>
      <div className="space-y-3">
        <Tile to="/add/spend" title="Spend" subtitle="Add a transaction in this billing cycle" />
        <Tile to="/add/payment" title="Payment" subtitle="Log a card payment" />
        <Tile to="/add/income" title="Income" subtitle="Add salary/income event" />
        <Tile to="/add/emi" title="EMI" subtitle="Create EMI plan + schedule" />
        <Tile to="/emis" title="EMIs" subtitle="View installments and mark paid" />
        <Tile to="/plan" title="Pay plan" subtitle="Daily set-aside and milestones" />
      </div>
    </div>
  );
}