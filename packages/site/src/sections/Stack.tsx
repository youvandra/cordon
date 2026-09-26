import { SEPOLIA, ARC } from "@cordon/fixtures";

/**
 * Who this is built on, moving past.
 *
 * Names rather than logos, and that is a licensing fact before it is a taste
 * one. ENS asks for a trademark licence in advance and says plainly not to
 * imply a partnership that does not exist; an unlicensed symbol in a strip
 * headed "built on" is exactly that implication, on a site ENS is judging.
 * Using the word to say which namespace an agent resolves in is ordinary
 * description and needs nobody's permission. When a licence exists the symbol
 * drops in beside the word without any of this moving.
 *
 * Each one still carries what it does here. That is the part a reader wants
 * after the hero, and it is what keeps the strip from reading as a wall of
 * borrowed credibility.
 *
 * The standards live in the prose, not here. ERC-8004 and EIP-3009 are things
 * this project implements rather than parties it stands on, and mixing the two
 * kinds made the strip answer two questions at once.
 *
 * ETHGlobal Tokyo is the eyebrow and not an item, for the same reason: the
 * event is where this was built, which is a different sentence from what it
 * is built on. It read as a stutter when both said it.
 *
 * The words are in the DOM whether or not the animation runs. `CLAUDE.md`:
 * animation may not gate visibility — a marquee whose content depends on a
 * frame loop is blank in a background tab, and this one is a list that happens
 * to move.
 */
const STACK = [
  { name: "ENS", role: "names and permissions" },
  { name: SEPOLIA.name, role: "where the names live" },
  { name: "Circle", role: "Gateway, and USDC" },
  { name: ARC.name, role: "where it began" },
  { name: "x402", role: "the payment" },
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
