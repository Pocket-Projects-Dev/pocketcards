import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";

type Card = {
  id: string;
  name: string;
  issuer: string | null;
  last4: string | null;
  credit_limit: number | null;
  close_day: number;
  due_day: number;
};

export default function Cards() {
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setErr(null);

    const { data, error } = await supabase
      .from("cards")
      .select("id,name,issuer,last4,credit_limit,close_day,due_day")
      .order("created_at", { ascending: false });

    if (error) setErr(error.message);
    setCards((data as Card[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="p-4 text-white">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cards</h2>
        <Link
          to="/cards/new"
          className="text-sm rounded-xl bg-white text-black px-3 py-2 font-medium"
        >
          Add
        </Link>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-white/70">Loading…</div>
      ) : err ? (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-red-300">{err}</div>
      ) : cards.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-white/70">
          No cards yet. Add your first card.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {cards.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white/5 p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-base font-medium">{c.name}</div>
                  <div className="mt-1 text-sm text-white/70">
                    Closes: {c.close_day} • Due: {c.due_day}
                    {c.last4 ? ` • •••• ${c.last4}` : ""}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}