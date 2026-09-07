import { useEffect, useState } from "react";
import { useMotionValue, useSpring } from "framer-motion";
import { DotText } from "./DotText";
import type { DotTextProps } from "./DotText";
import { spring } from "../../tokens/spring";
import { useCordonReducedMotion } from "../../hooks/useReducedMotion";

/* ==========================================================================
   A number that arrives rather than appears.

   The stage's numerals are its loudest element, and a loud element that
   simply blinks into place is the thing that makes a page feel like a
   screenshot. This counts to the value on a spring and sets each frame in the
   dot face, so the digits visibly resolve.
   ========================================================================== */

export interface AnimatedNumberProps extends Omit<DotTextProps, "children"> {
  value: number;
  /** Decimal places. `2.4` needs 1; `118` needs 0. */
  decimals?: number;
  /** Printed before the number, e.g. "$". */
  prefix?: string;
  /** Printed after, e.g. "%". Units usually belong outside in ordinary type. */
  suffix?: string;
  /** Hold at the start value for this long, to sequence with an entrance. */
  delay?: number;
}

export function AnimatedNumber({
  value,
  decimals = 0,
  prefix = "",
  suffix = "",
  delay = 0,
  ...rest
}: AnimatedNumberProps) {
  const reduced = useCordonReducedMotion();
  const raw = useMotionValue(reduced ? value : 0);
  const smooth = useSpring(raw, spring.count);
  const [shown, setShown] = useState(reduced ? value : 0);

  useEffect(() => {
    if (reduced) {
      setShown(value);
      return;
    }
    const timer = window.setTimeout(() => raw.set(value), delay * 1000);
    return () => window.clearTimeout(timer);
  }, [value, delay, raw, reduced]);

  useEffect(() => smooth.on("change", (latest) => setShown(latest)), [smooth]);

  return (
    <DotText {...rest}>{`${prefix}${shown.toFixed(decimals)}${suffix}`}</DotText>
  );
}
