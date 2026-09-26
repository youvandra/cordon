import { SEPOLIA, ARC } from "@cordon/fixtures";
import { EnsMark, EthereumMark } from "../parts/marks";

/**
 * Who this is built on, moving past.
 *
 * A mark where one could be sourced from that project's own brand page, and
 * the name alone where it could not. A redrawn logo is a wrong logo, and a
 * strip headed "built on" is the worst place to put one — so nothing here is
 * traced, guessed or pulled off a search result.
 *
 * ENS requires a trademark licence before its brand is used and asks that no
 * partnership be implied. The owner has confirmed this use is supported.
 *
 * Each one still carries what it does here. That is the part a reader wants
 * after the hero, and it is what keeps the strip from reading as a wall of
 * borrowed credibility.
 *
 * The standards live in the prose, not here. ERC-8004 and EIP-3009 are things
 * this project implements rather than parties it stands on, and mixing the two
 * kinds made the strip answer two questions at once.
 *
 * The eyebrow is "Built on" and names no event. Where this was built belongs
 * in the prose that can give it a sentence, not in the label over a list of
 * what it stands on.
 *
 * The words are in the DOM whether or not the animation runs. `CLAUDE.md`:
 * animation may not gate visibility — a marquee whose content depends on a
 * frame loop is blank in a background tab, and this one is a list that happens
 * to move.
 */
interface Item {
  name: string;
  role: string;
  /** The official mark, where this project could source one. */
  Mark?: (props: { size?: number }) => React.ReactElement;
}

const STACK: Item[] = [
  { name: "ENS", role: "names and permissions", Mark: EnsMark },
  { name: SEPOLIA.name, role: "where the names live", Mark: EthereumMark },
  { name: "Circle", role: "Gateway, and USDC" },
  { name: ARC.name, role: "where it began" },
  { name: "x402", role: "the payment" },
  { name: "Model Context Protocol", role: "the client surface" },
];

function Track({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="stack__track" aria-hidden={hidden || undefined}>
      {STACK.map(({ name, role, Mark }) => (
        <li className="stack__item" key={name}>
          {/* The mark is decoration beside a name that is already there, so it
              is hidden from assistive technology rather than read twice. */}
          {Mark ? (
            <span className="stack__mark" aria-hidden="true">
              <Mark />
            </span>
          ) : null}
          <span className="stack__name">{name}</span>
          <span className="stack__role">{role}</span>
        </li>
      ))}
    </ul>
  );
}

export function Stack() {
  return (
    <section className="stack" aria-label="What Cordon is built on">
      <div className="wrap">
        <p className="stack__eyebrow">Built on</p>
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
