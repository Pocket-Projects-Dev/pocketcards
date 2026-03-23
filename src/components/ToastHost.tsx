import { useEffect, useState } from "react";
import { Button, cx } from "./ui";

type ToastType = "info" | "success" | "error";

type ToastAction = {
  label: string;
  onClick: () => void | Promise<void>;
};

type ToastItem = {
  id: string;
  message: string;
  type: ToastType;
  action?: ToastAction;
};

const EVENT = "pp_toast_v2";

function makeId() {
  return `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
}

type ToastInput =
  | string
  | {
      message: string;
      type?: ToastType;
      actionLabel?: string;
      onAction?: () => void | Promise<void>;
    };

export function toast(input: ToastInput, type: ToastType = "info") {
  if (typeof window === "undefined") return;

  if (typeof input === "string") {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: { message: input, type } }));
    return;
  }

  window.dispatchEvent(
    new CustomEvent(EVENT, {
      detail: {
        message: input.message,
        type: input.type || "info",
        action:
          input.actionLabel && input.onAction
            ? { label: input.actionLabel, onClick: input.onAction }
            : undefined,
      },
    })
  );
}

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    const onToast = (e: Event) => {
      const ce = e as CustomEvent<{
        message: string;
        type?: ToastType;
        action?: ToastAction;
      }>;

      const message = String(ce.detail?.message || "").trim();
      if (!message) return;

      const item: ToastItem = {
        id: makeId(),
        message,
        type: (ce.detail?.type || "info") as ToastType,
        action: ce.detail?.action,
      };

      setItems((prev) => [item, ...prev].slice(0, 3));

      window.setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== item.id));
      }, 4200);
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

  const dismiss = (id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  };

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
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">{t.message}</div>
              {t.action ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={async () => {
                    await t.action?.onClick?.();
                    dismiss(t.id);
                  }}
                >
                  {t.action.label}
                </Button>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}