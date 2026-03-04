import { Link } from "react-router-dom";
import { Card } from "../components/ui";

function Tile(props: { to: string; title: string; subtitle: string }) {
  return (
    <Link to={props.to}>
      <Card className="p-5 hover:bg-white/[0.06] transition">
        <div className="text-base font-medium">{props.title}</div>
        <div className="mt-1 text-sm text-white/60">{props.subtitle}</div>
      </Card>
    </Link>
  );
}

export default function AddHub() {
  return (
    <div className="p-4 text-white space-y-3">
      <div>
        <div className="text-2xl font-semibold tracking-tight">Add</div>
        <div className="mt-1 text-sm text-white/60">Quick actions</div>
      </div>

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