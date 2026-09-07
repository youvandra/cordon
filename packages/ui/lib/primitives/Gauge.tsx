import { useId } from "react";
import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { transition } from "../../tokens/motion";
import { useCordon } from "../CordonProvider";
import { cx } from "../cx";

/* ==========================================================================
   Gauge — the stage's tick ring, promoted from decoration to a live readout.

   The hero draws a radar: a fine tick ring, a swept wedge, a bloom. It shows
   nothing. Cordon keeps the geometry exactly — centre 163,163; ticks every 5°
   with every fifth run long (r 142 → 129 rather than 133); the same wedge and
   the same blur radii — and points it at a value. Same rhythm, real job.
   ========================================================================== */

const CENTRE = 163;
/** The arc the ring occupies, in degrees. 190° is lower-left, 350° upper-right. */
const START = 190;
const END = 350;
const SPAN = END - START;
const TICK_STEP = 5;
const TICK_COUNT = SPAN / TICK_STEP + 1;

const polar = (angleDeg: number, radius: number) => {
  const radians = (angleDeg * Math.PI) / 180;
  return { x: CENTRE + Math.cos(radians) * radius, y: CENTRE + Math.sin(radians) * radius };
};

const arcPath = (from: number, to: number, radius: number) => {
  const a = polar(from, radius);
  const b = polar(to, radius);
  const large = to - from > 180 ? 1 : 0;
  return `M${a.x.toFixed(2)} ${a.y.toFixed(2)}A${radius} ${radius} 0 ${large} 1 ${b.x.toFixed(2)} ${b.y.toFixed(2)}`;
};

export interface GaugeProps {
  /** 0–1. Drives the sweep, the lit ticks and the arc fill. */
  value?: number;
  /** Sits in the middle of the ring — usually a `DotText` numeral. */
  children?: ReactNode;
  /** Below the readout, in small caps. */
  footnote?: ReactNode;
  /** Reads the wedge as a live radar rather than a fixed pointer. */
  sweep?: boolean;
  size?: number | string;
  label?: string;
  className?: string;
}

export function Gauge({
  value = 0.62,
  children,
  footnote,
  sweep = false,
  size = "100%",
  label,
  className,
}: GaugeProps) {
  const { reducedMotion } = useCordon();
  const uid = useId().replace(/[:»«]/g, "");
  const clamped = Math.min(1, Math.max(0, value));
  const angle = START + SPAN * clamped;

  /* The wedge from the hero, redrawn at 0° so it can be rotated to the value. */
  const wedge = (() => {
    const outer = 150;
    const inner = 55;
    const half = 11;
    const a = polar(-half, outer);
    const b = polar(half, outer);
    const c = polar(half, inner);
    const d = polar(-half, inner);
    return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A${outer} ${outer} 0 0 1 ${b.x.toFixed(1)} ${b.y.toFixed(1)}L${c.x.toFixed(1)} ${c.y.toFixed(1)}A${inner} ${inner} 0 0 0 ${d.x.toFixed(1)} ${d.y.toFixed(1)}Z`;
  })();

  return (
    <div className={cx("cordon-gauge", className)} style={{ width: size }}>
      <svg
        className="cordon-gauge__svg"
        viewBox="0 0 326 186"
        role={label ? "img" : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
      >
        <defs>
          <linearGradient id={`cordonArc-${uid}`} gradientUnits="userSpaceOnUse" x1="7" y1="136" x2="312" y2="109">
            <stop offset="0" stopColor="#ff9ab7" stopOpacity=".06" />
            <stop offset=".08" stopColor="#ff8caf" stopOpacity=".44" />
            <stop offset=".34" stopColor="#ff6796" stopOpacity=".94" />
            <stop offset=".58" stopColor="#ff6796" stopOpacity="1" />
            <stop offset=".82" stopColor="#ffe7ed" stopOpacity=".74" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id={`cordonArcShadow-${uid}`} gradientUnits="userSpaceOnUse" x1="11" y1="136" x2="308" y2="110">
            <stop offset="0" stopColor="#6e1639" stopOpacity=".04" />
            <stop offset=".09" stopColor="#6e1639" stopOpacity=".17" />
            <stop offset=".52" stopColor="#72163d" stopOpacity=".18" />
            <stop offset="1" stopColor="#7b1a43" stopOpacity="0" />
          </linearGradient>
          <radialGradient id={`cordonBeam-${uid}`} gradientUnits="userSpaceOnUse" cx={CENTRE} cy={CENTRE} r="145">
            <stop offset=".3" stopColor="#650f35" stopOpacity="0" />
            <stop offset=".7" stopColor="#650f35" stopOpacity=".065" />
            <stop offset=".9" stopColor="#650f35" stopOpacity=".08" />
            <stop offset="1" stopColor="#650f35" stopOpacity=".05" />
          </radialGradient>
          <filter id={`cordonGaugeSoft-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.35" />
          </filter>
          <filter id={`cordonGaugeBloom-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="11" />
          </filter>
        </defs>

        {/* the ring: shadow under, lit arc over, hairline inside */}
        <path d={arcPath(START, END, 154)} fill="none" stroke={`url(#cordonArcShadow-${uid})`} strokeWidth="3.2" strokeLinecap="round" />
        <path d={arcPath(START, END, 158.5)} fill="none" className="cordon-gauge__ring" strokeWidth="2.2" strokeLinecap="round" />
        <motion.path
          d={arcPath(START, END, 158.5)}
          fill="none"
          stroke={`url(#cordonArc-${uid})`}
          strokeWidth="2.2"
          strokeLinecap="round"
          pathLength={1}
          initial={reducedMotion ? false : { strokeDashoffset: 1 }}
          animate={{ strokeDashoffset: 1 - clamped }}
          transition={reducedMotion ? { duration: 0 } : transition.resolve}
          style={{ strokeDasharray: 1 }}
        />
        <path d={arcPath(START + 6, END - 40, 146)} fill="none" className="cordon-gauge__hairline" strokeWidth="1.15" />

        {/* the swept wedge, pointed at the value */}
        {/* transformBox + transformOrigin, not framer's originX/originY —
            those are fractions of the box and land the pivot off-centre on a
            non-square viewBox, which sends the wedge orbiting the wrong point. */}
        <motion.g
          className={cx(sweep && !reducedMotion && "cordon-gauge__sweeping")}
          initial={reducedMotion ? false : { rotate: START }}
          animate={{ rotate: sweep ? START : angle }}
          transition={reducedMotion ? { duration: 0 } : transition.resolve}
          style={{ transformBox: "view-box", transformOrigin: `${CENTRE}px ${CENTRE}px` }}
        >
          <path d={wedge} fill={`url(#cordonBeam-${uid})`} filter={`url(#cordonGaugeSoft-${uid})`} />
          <path
            d={`M${polar(0, 150).x.toFixed(1)} ${polar(0, 150).y.toFixed(1)}L${polar(0, 55).x.toFixed(1)} ${polar(0, 55).y.toFixed(1)}`}
            className="cordon-gauge__pointer"
            strokeWidth="1.6"
            strokeLinecap="round"
            filter={`url(#cordonGaugeSoft-${uid})`}
          />
        </motion.g>

        {/* the tick ring: the hero's rhythm, run across the whole arc */}
        <g>
          {Array.from({ length: TICK_COUNT }, (_, index) => {
            const tickAngle = START + index * TICK_STEP;
            const major = index % 5 === 0;
            const lit = tickAngle <= angle;
            const outer = polar(tickAngle, 142);
            const inner = polar(tickAngle, major ? 129 : 133);
            return (
              <line
                key={index}
                x1={outer.x}
                y1={outer.y}
                x2={inner.x}
                y2={inner.y}
                strokeWidth={major ? 1.5 : 1}
                className={cx("cordon-gauge__tick", lit && "cordon-gauge__tick--lit")}
              />
            );
          })}
        </g>

        <ellipse cx="225" cy="166" rx="92" ry="76" fill="#fff" opacity=".055" filter={`url(#cordonGaugeBloom-${uid})`} />
      </svg>

      {children || footnote ? (
        <div className="cordon-gauge__readout">
          {children}
          {footnote ? <span className="cordon-gauge__footnote">{footnote}</span> : null}
        </div>
      ) : null}
    </div>
  );
}
