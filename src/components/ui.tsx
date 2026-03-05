import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  SelectHTMLAttributes,
} from "react";

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Card(props: HTMLAttributes<HTMLDivElement>) {
  const { className, ...rest } = props;
  return (
    <div
      {...rest}
      className={cx(
        "relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.045] shadow-[0_12px_50px_rgba(0,0,0,0.55)] backdrop-blur",
        "before:pointer-events-none before:absolute before:inset-0 before:opacity-60",
        "before:bg-[radial-gradient(900px_260px_at_20%_-10%,rgba(255,255,255,0.12),transparent_60%)]",
        className
      )}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button(props: ButtonProps) {
  const { className, variant = "secondary", size = "md", ...rest } = props;

  const base =
    "inline-flex items-center justify-center rounded-2xl font-medium transition active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100";
  const sizes =
    size === "sm"
      ? "px-3 py-2 text-sm"
      : size === "lg"
      ? "px-5 py-4 text-base"
      : "px-4 py-3 text-sm";

  const styles =
    variant === "primary"
      ? "border border-violet-300/25 bg-gradient-to-b from-violet-500/30 to-violet-500/10 text-white shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_18px_60px_rgba(124,58,237,0.18)] hover:from-violet-500/36 hover:to-violet-500/14"
      : variant === "danger"
      ? "border border-red-300/20 bg-red-500/10 text-red-50 hover:bg-red-500/14"
      : variant === "ghost"
      ? "text-white/70 hover:text-white hover:bg-white/6"
      : "border border-white/10 bg-white/6 text-white hover:bg-white/8";

  return <button {...rest} className={cx(base, sizes, styles, className)} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={cx(
        "w-full rounded-2xl bg-black/35 border border-white/10 px-4 py-3 text-white outline-none",
        "placeholder:text-white/30",
        "focus:border-violet-300/25 focus:ring-2 focus:ring-violet-500/10",
        className
      )}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { className, ...rest } = props;
  return (
    <select
      {...rest}
      className={cx(
        "w-full rounded-2xl bg-black/35 border border-white/10 px-4 py-3 text-white outline-none",
        "focus:border-violet-300/25 focus:ring-2 focus:ring-violet-500/10",
        className
      )}
    />
  );
}

export function ProgressBar(props: { value: number }) {
  const v = Math.max(0, Math.min(1, Number(props.value || 0)));
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div
        className="h-full rounded-full bg-gradient-to-r from-violet-400/70 to-fuchsia-400/50"
        style={{ width: `${v * 100}%` }}
      />
    </div>
  );
}

export function Badge(props: { children: any; tone?: "neutral" | "danger" | "good" | "warn" }) {
  const tone = props.tone ?? "neutral";
  const cls =
    tone === "danger"
      ? "border-red-400/20 bg-red-500/10 text-red-100"
      : tone === "good"
      ? "border-emerald-400/20 bg-emerald-500/10 text-emerald-50"
      : tone === "warn"
      ? "border-amber-300/20 bg-amber-500/10 text-amber-50"
      : "border-white/10 bg-white/5 text-white/80";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-2.5 py-1 text-xs", cls)}>
      {props.children}
    </span>
  );
}

export function Skeleton(props: { className?: string }) {
  return <div className={cx("animate-pulse rounded-2xl bg-white/10", props.className)} />;
}