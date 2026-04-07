import React, { useEffect, useRef, useState } from "react";

const toNumber = (value) => {
  if (typeof value === "number") return value;
  const text = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
};

export default function CountUpValue({ value, duration = 700, suffix = "" }) {
  const numericValue = toNumber(value);
  const [display, setDisplay] = useState(numericValue);
  const rafRef = useRef(0);

  useEffect(() => {
    const start = performance.now();
    const initial = display;

    const tick = (now) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      const nextValue = Math.round(initial + (numericValue - initial) * eased);
      setDisplay(nextValue);
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [numericValue]);

  return (
    <span aria-live="polite">
      {display}
      {suffix}
    </span>
  );
}
