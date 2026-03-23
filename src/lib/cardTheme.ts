export type CardAccent = {
  from: string;
  to: string;
  glow: string;
  soft: string;
};

export function getCardAccent(name?: string, issuer?: string | null): CardAccent {
  const text = `${name || ""} ${issuer || ""}`.toLowerCase();

  if (text.includes("hdfc")) {
    return {
      from: "#38bdf8",
      to: "#22d3ee",
      glow: "rgba(34,211,238,0.22)",
      soft: "rgba(56,189,248,0.12)",
    };
  }

  if (text.includes("icici")) {
    return {
      from: "#fb7185",
      to: "#f97316",
      glow: "rgba(249,115,22,0.22)",
      soft: "rgba(251,113,133,0.12)",
    };
  }

  if (text.includes("sbi")) {
    return {
      from: "#60a5fa",
      to: "#2563eb",
      glow: "rgba(37,99,235,0.22)",
      soft: "rgba(96,165,250,0.12)",
    };
  }

  if (text.includes("axis")) {
    return {
      from: "#f472b6",
      to: "#ec4899",
      glow: "rgba(236,72,153,0.22)",
      soft: "rgba(244,114,182,0.12)",
    };
  }

  if (text.includes("amex") || text.includes("american express")) {
    return {
      from: "#60a5fa",
      to: "#8b5cf6",
      glow: "rgba(139,92,246,0.22)",
      soft: "rgba(96,165,250,0.12)",
    };
  }

  return {
    from: "#8b5cf6",
    to: "#ec4899",
    glow: "rgba(139,92,246,0.22)",
    soft: "rgba(236,72,153,0.12)",
  };
}