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
        "rounded-3xl border border-white/10 bg-white/[0.04] shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm",
        className
      )}
    />
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost";
};

export function Button(props: ButtonProps) {
  const { className, variant = "secondary", ...rest } = props;

  const base =
    "inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm transition active:scale-[0.99] disabled:opacity-50 disabled:active:scale-100";
  const styles =
    variant === "primary"
      ? "bg-violet-500/20 border border-violet-400/20 text-white hover:bg-violet-500/25"
      : variant === "ghost"
      ? "text-white/70 hover:text-white hover:bg-white/5"
      : "bg-white/5 border border-white/10 text-white hover:bg-white/7";

  return <button {...rest} className={cx(base, styles, className)} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  const { className, ...rest } = props;
  return (
    <input
      {...rest}
      className={cx(
        "w-full rounded-2xl bg-black/35 border border-white/10 px-3 py-3 text-white outline-none",
        "focus:border-violet-400/30 focus:ring-2 focus:ring-violet-500/10",
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
        "w-full rounded-2xl bg-black/35 border border-white/10 px-3 py-3 text-white outline-none",
        "focus:border-violet-400/30 focus:ring-2 focus:ring-violet-500/10",
        className
      )}
    />
  );
}

export function ProgressBar(props: { value: number }) {
  const v = Math.max(0, Math.min(1, Number(props.value || 0)));
  return (
    <div className="h-2 w-full rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full bg-violet-400/50" style={{ width: `${v * 100}%` }} />
    </div>
  );
}