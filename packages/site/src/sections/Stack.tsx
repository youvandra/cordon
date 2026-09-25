import { SEPOLIA, ARC } from "@cordon/fixtures";

/**
 * What this is built on, moving past.
 *
 * Every item is a dependency this project actually calls, named with the thing
 * it does here rather than with a badge. A strip of borrowed logos says
 * "associated with"; a strip that says which part each one is answers the
 * question a reader actually has after the hero, which is what any of this is
 * standing on.
 *
 * The words are in the DOM whether or not the animation runs. `CLAUDE.md`:
 * animation may not gate visibility — a marquee whose content depends on a
 * frame loop is blank in a background tab, and this one is a list that happens
 * to move.
 */
const STACK = [
  { name: "ENSv2", role: "names and permissions" },
  { name: "ERC-8004", role: "identity and conduct" },
  { name: "x402", role: "the payment" },
  { name: "EIP-3009", role: "the authorisation" },
  { name: SEPOLIA.name, role: "where the names live" },
  { name: ARC.name, role: "where it began" },
  { name: "Circle Gateway", role: "settlement on Arc" },
  { name: "Model Context Protocol", role: "the client surface" },
];

function Track({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="stack__track" aria-hidden={hidden || undefined}>
      {STACK.map((item) => (
        <li className="stack__item" key={item.name}>
          <span className="stack__name">{item.name}</span>
          <span className="stack__role">{item.role}</span>
        </li>
      ))}
    </ul>
  );
}

export function Stack() {
  return (
    <section className="stack" aria-label="What Cordon is built on">
      <div className="wrap">
        <p className="stack__eyebrow">
          Built at <b>ETHGlobal Tokyo 2026</b> on
        </p>
      </div>
      {/* Two identical tracks, so the loop has no seam. The second is hidden
          from assistive technology: it is the same list twice, and a reader
          using a screen reader should be told it once. */}
      <div className="stack__window">
        <div className="stack__rail">
          <Track />
          <Track hidden />
        </div>
      </div>
    </section>
  );
}
