import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { Link } from "react-router-dom";

type CardRow = {
  id: string;
  name: string;
  issuer: string | null;
  last4: string | null;
};

export default function Cards() {
  const [cards, setCards] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setErr(null);

      const { data, error } = await supabase
        .from("cards")
        .select("id,name,issuer,last4")
        .order("created_at", { ascending: false });

      if (!alive) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }

      setCards(((data as any[]) ?? []) as CardRow[]);
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cards</h2>
        <Link to="/cards/new" className="text-sm text-white/70">Add</Link>
      </div>

      {err ? <div className="mt-3 rounded-2xl bg-white/5 p-3 text-sm text-red-300">{err}</div> : null}

      {loading ? (
        <div className="mt-4 text-sm text-white/70">Loading…</div>
      ) : cards.length === 0 ? (
        <div className="mt-4 rounded-2xl bg-white/5 p-4 text-sm text-white/70">No cards yet.</div>
      ) : (
        <div className="mt-4 space-y-3">
          {cards.map((c) => (
            <div key={c.id} className="rounded-2xl bg-white/5 p-4">
              <div className="text-base font-medium">
                {c.name}{c.last4 ? ` • •••• ${c.last4}` : ""}
              </div>
              <div className="mt-1 text-sm text-white/70">{c.issuer ?? "—"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}