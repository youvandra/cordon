import type { ReactNode } from "react";
import { Appear } from "./motion";

/**
 * One scroll-reveal, used everywhere, so the page has a single rhythm.
 * It defers to `Appear`, which refuses to hide anything it cannot animate.
 */
export function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <Appear inView delay={delay} from={{ opacity: 0, y: 18 }}>
      {children}
    </Appear>
  );
}
