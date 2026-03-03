import { supabase } from "../lib/supabase";

export default function Dashboard() {
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Dashboard</h2>
        <button onClick={signOut} className="text-sm text-white/70">
          Sign out
        </button>
      </div>

      <div className="mt-4 rounded-2xl bg-white/5 p-4">
        <div className="text-sm text-white/70">Status</div>
        <div className="mt-2 text-base">
          Auth is live. Next we add cards, spends, billing cycles, EMI schedule, and pay plan.
        </div>
      </div>
    </div>
  );
}