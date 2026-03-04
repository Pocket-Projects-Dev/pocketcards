export type FundEvent = {
  id: string;
  event_date: string; // YYYY-MM-DD
  event_type: "set_aside" | "withdraw" | "adjust" | string;
  amount: number;
  note: string | null;
  created_at: string;
};

export function computeFundBalance(events: FundEvent[]) {
  return events.reduce((sum, e) => {
    const amt = Number((e as any).amount || 0);
    if (e.event_type === "withdraw") return sum - amt;
    return sum + amt;
  }, 0);
}

export function sumTodayNet(events: FundEvent[], today: string) {
  return events
    .filter((e) => e.event_date === today)
    .reduce((sum, e) => {
      const amt = Number((e as any).amount || 0);
      if (e.event_type === "withdraw") return sum - amt;
      return sum + amt;
    }, 0);
}

export function labelEventType(t: string) {
  if (t === "set_aside") return "Set aside";
  if (t === "withdraw") return "Withdraw";
  if (t === "adjust") return "Adjust";
  return t;
}