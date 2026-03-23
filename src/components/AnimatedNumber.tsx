import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber(props: {
  value: number;
  formatter?: (n: number) => string;
  duration?: number;
  className?: string;
}) {
  const { value, formatter, duration = 650, className } = props;
  const [display, setDisplay] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setDisplay(value);
      prevRef.current = value;
      return;
    }

    const from = prevRef.current;
    const to = value;
    const start = performance.now();

    let raf = 0;

    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);

      if (p < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        prevRef.current = to;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const out = formatter ? formatter(display) : String(Math.round(display));

  return <span className={className}>{out}</span>;
}