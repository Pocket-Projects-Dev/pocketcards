import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const [last30, setLast30] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const d = new Date();
      d.setDate(d.getDate() - 30);
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const from = `${yyyy}-${mm}-${dd}`;

      const { data, error } = await supabase
        .from("transactions")
        .select("amount, txn_date")
        .gte("txn_date", from);

      if (!error && data) {
        const total = (data as any[]).reduce((sum, t) => sum + Number(t.amount || 0), 0);
        setLast30(total);
      }
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <button onClick={signOut} className="text-sm text-white/70">
          Sign out
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Spend (last 30 days)</div>
        <div className="mt-2 text-2xl font-semibold">{loading ? "Loading…" : last30.toFixed(2)}</div>
      </div>

      <div className="mt-3 rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Next</div>
        <div className="mt-2 text-base">
          Next we compute billing-cycle totals per card + due plan, then EMIs.
        </div>
      </div>
    </div>
  );
}