import { useRef, useState } from "react";
import { Button, cx } from "./ui";

export default function SwipeRow(props: {
  children: React.ReactNode;
  actionLabel: string;
  onAction: () => void | Promise<void>;
  tone?: "danger" | "good" | "secondary";
  disabled?: boolean;
  actionWidth?: number;
  className?: string;
}) {
  const {
    children,
    actionLabel,
    onAction,
    tone = "danger",
    disabled = false,
    actionWidth = 96,
    className,
  } = props;

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);

  const clamp = (n: number) => Math.max(-actionWidth, Math.min(0, n));

  const isInteractiveTarget = (target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button,a,input,select,textarea,label"));
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    if (isInteractiveTarget(e.target)) return;

    startX.current = e.clientX;
    setDragging(true);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled || !dragging || startX.current == null) return;
    const delta = e.clientX - startX.current;
    setDx(clamp(delta));
  };

  const settle = () => {
    setDragging(false);
    setDx((prev) => (prev < -actionWidth * 0.45 ? -actionWidth : 0));
    startX.current = null;
  };

  const onPointerUp = () => settle();
  const onPointerCancel = () => settle();

  const showAction = dx < -8;

  return (
    <div className={cx("relative overflow-hidden rounded-3xl", className)}>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
        <div
          className={cx(
            "transition-opacity duration-150",
            showAction ? "opacity-100" : "opacity-0"
          )}
        >
          <Button
            variant={tone === "danger" ? "danger" : tone === "good" ? "primary" : "secondary"}
            size="sm"
            onClick={() => void onAction()}
            className="h-[84px] min-w-[88px]"
          >
            {actionLabel}
          </Button>
        </div>
      </div>

      <div
        className={cx(
          "relative z-10 w-full touch-pan-y",
          dragging ? "" : "transition-transform duration-200 ease-out"
        )}
        style={{ transform: `translateX(${dx}px)` }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {children}
      </div>
    </div>
  );
}