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
    actionWidth = 92,
    className,
  } = props;

  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef<number | null>(null);

  const clamp = (n: number) => Math.max(-actionWidth, Math.min(0, n));

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
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
    setDx((prev) => (prev < -actionWidth * 0.4 ? -actionWidth : 0));
    startX.current = null;
  };

  const onPointerUp = () => settle();
  const onPointerCancel = () => settle();

  return (
    <div className={cx("relative overflow-hidden rounded-3xl", className)}>
      <div className="absolute inset-y-0 right-0 flex items-center pr-2">
        <Button
          variant={tone === "danger" ? "danger" : tone === "good" ? "primary" : "secondary"}
          size="sm"
          onClick={() => void onAction()}
          className="h-[84%] min-w-[84px]"
        >
          {actionLabel}
        </Button>
      </div>

      <div
        className="touch-pan-y transition-transform duration-200 ease-out"
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