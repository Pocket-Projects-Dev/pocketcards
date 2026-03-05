import { useEffect, useState } from "react";
import { cx } from "./ui";

type ToastType = "info" | "success" | "error";
type ToastItem = { id: string; message: string; type: ToastType };

const EVENT = "pp_toast_v1";

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

export function toast(message: string, type: ToastType = "info") {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { message, type } }));
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{ message: string; type?: ToastType }>;
      const message = String(ce.detail?.message || "").trim();
      if (!message) return;

      const type = (ce.detail?.type || "info") as ToastType;
      const id = makeId();
      const next: ToastItem = { id, message, type };

      setItems((prev) => [next, ...prev].slice(0, 3));

      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, 3200);
    };

    window.addEventListener(EVENT, onToast as EventListener);
    return () => window.removeEventListener(EVENT, onToast as EventListener);
  }, []);

  if (items.length === 0) return null;

  const tone = (t: ToastType) =>
    t === "error"
      ? "border-red-400/20 bg-red-500/10 text-red-100"
      : t === "success"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-50"
      : "border-white/10 bg-white/5 text-white";

  return (
    <div className="fixed top-3 left-0 right-0 z-50 px-3">
      <div className="mx-auto max-w-md space-y-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cx(
              "rounded-2xl border px-4 py-3 text-sm shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur",
              tone(t.type)
            )}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}