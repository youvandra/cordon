/* ==========================================================================
   The architecture, drawn as the path one purchase takes.

   The numbered arrows are the numbered steps in "the path of one purchase"
   on the same page, in the same order, so the drawing and the list are one
   fact rather than two that can disagree. Add a step to the list and it gets
   an arrow here, or the numbering starts lying.

   Time runs downward and every arrow is horizontal between two lanes, which
   is the only layout that leaves each label a whole row to itself. A solid
   arrow is a request and a dashed one is an answer, which is why the 402 and
   the release are drawn the same way. The
   earlier attempt drew the same parts as a map and had three labels stacked
   in one gap; a picture nobody can read is worse than the paragraph it was
   drawn to replace.

   No animation and no measurement: every coordinate is fixed, so the figure
   is complete in a hidden tab and in a print.
   ========================================================================== */

const LANES = [
  { x: 120, name: "Agent", holds: "holds nothing" },
  { x: 380, name: "Daemon", holds: "holds the operator keys" },
  { x: 640, name: "Arc", holds: "the vault, and the record" },
  { x: 900, name: "Seller", holds: "names its price and payee" },
] as const;

const TOP = 118;
const BOTTOM = 636;

/** An arrow from one lane to another, with its label sitting above it. */
function Step({
  from, to, y, label, n, dashed,
}: {
  from: number; to: number; y: number; label: string; n?: number; dashed?: boolean;
}) {
  const a = LANES[from]!.x;
  const b = LANES[to]!.x;
  const dir = b > a ? 1 : -1;
  const x1 = a + dir * 9;
  const x2 = b - dir * 9;
  const left = Math.min(x1, x2);

  return (
    <g>
      <path
        d={`M ${x1} ${y} L ${x2} ${y}`}
        fill="none"
        stroke="var(--cordon-hairline)"
        strokeWidth="1.5"
        strokeDasharray={dashed ? "4 5" : undefined}
        markerEnd="url(#arch-arrow)"
      />
      <text x={left + (n === undefined ? 4 : 26)} y={y - 12} className="arch__edge">
        {label}
      </text>
      {n === undefined ? null : (
        <>
          <circle cx={left + 10} cy={y - 17} r="10" fill="var(--cordon-paper)" stroke="var(--cordon-accent-line)" />
          <text x={left + 10} y={y - 13} className="arch__step">{n}</text>
        </>
      )}
    </g>
  );
}

/**
 * Something a lane does to itself, which is where the decision lives.
 *
 * The label is given as lines rather than wrapped, because SVG text does not
 * wrap and a single long one ran past the right edge of the viewBox and was
 * clipped with nothing to say it had been.
 */
function Aside({
  lane, y, label, n, dashed,
}: { lane: number; y: number; label: string[]; n?: number; dashed?: boolean }) {
  const x = LANES[lane]!.x;
  return (
    <g>
      <path
        d={`M ${x} ${y - 16} l 22 0 a 12 12 0 0 1 0 32 l -22 0`}
        fill="none"
        stroke="var(--cordon-hairline)"
        strokeWidth="1.5"
        strokeDasharray={dashed ? "4 5" : undefined}
        markerEnd="url(#arch-arrow)"
      />
      <text x={x + 56} y={y - 3} className="arch__edge">
        {label.map((line, index) => (
          <tspan key={line} x={x + 56} dy={index === 0 ? 0 : 19}>{line}</tspan>
        ))}
      </text>
      {n === undefined ? null : (
        <>
          <circle cx={x + 34} cy={y - 24} r="10" fill="var(--cordon-paper)" stroke="var(--cordon-accent-line)" />
          <text x={x + 34} y={y - 20} className="arch__step">{n}</text>
        </>
      )}
    </g>
  );
}

export function Architecture({ className }: { className?: string }) {
  return (
    <figure className={className ? `arch ${className}` : "arch"}>
      <svg
        viewBox="0 0 1020 700"
        role="img"
        aria-label="The path one purchase takes, as four lanes with time running downward. The agent, which holds nothing, asks the daemon for a URL. The daemon, which holds the operator keys, requests it and gets back a 402 challenge naming the seller's own price and payee. It asks the vault on Arc for a tranche of exactly that size for exactly that payee. The contract charges every node from the agent up to the root and moves the money into that agent's own payment balance, or refuses; if any bound fails nothing moves and the refusal is written on chain and published to the ERC-8004 reputation registry. Only after a release does the daemon sign the payment off chain and ask again, and the seller returns the body. The owner's own wallet is not in this path: it opens the mandate, and it is the only key that can release a refusal or cut a branch."
      >
        <defs>
          <marker id="arch-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--cordon-copy-dim)" />
          </marker>
        </defs>

        {LANES.map((lane, index) => (
          <g key={lane.name}>
            <rect
              x={lane.x - 95} y={34} width={190} height={68} rx="10"
              fill={index === 1 || index === 2 ? "var(--cordon-paper-raised)" : "transparent"}
              stroke={index === 1 || index === 2 ? "var(--cordon-accent-line)" : "var(--cordon-hairline)"}
              strokeWidth={index === 1 || index === 2 ? 1.5 : 1}
            />
            <text x={lane.x} y={62} className="arch__name" textAnchor="middle">{lane.name}</text>
            <text x={lane.x} y={83} className="arch__sub" textAnchor="middle">{lane.holds}</text>
            <path
              d={`M ${lane.x} ${TOP} L ${lane.x} ${BOTTOM}`}
              stroke="var(--cordon-hairline-soft)" strokeWidth="1.5" strokeDasharray="2 6"
            />
          </g>
        ))}

        <Step n={1} from={0} to={1} y={170} label="asks for a URL, which is the only thing it can ask for" />
        <Step n={2} from={1} to={3} y={228} label="requests it" />
        <Step n={3} from={3} to={1} y={286} dashed label="402: the seller's own price, the seller's own payee" />
        <Step n={4} from={1} to={2} y={344} label="a tranche of exactly that size, for exactly that payee" />
        <Aside n={5} lane={2} y={410} label={["charges every node up to the root,", "and moves the money"]} />
        <Step from={2} to={1} y={470} dashed label="released" />
        <Step n={6} from={1} to={3} y={528} label="signs the payment off chain, and asks again" />
        <Step from={3} to={1} y={586} label="the body" dashed />
        <Aside n={7} lane={2} y={652} dashed label={["if any bound fails: nothing moves,", "and the refusal is published"]} />
      </svg>
      <figcaption className="arch__caption">
        The owner's wallet is not on this path. It opens the mandate, and it is
        the only key that can release a refusal or cut a branch — which is why
        step 5 is a decision the contract makes rather than one anybody is
        asked for.
      </figcaption>
    </figure>
  );
}
