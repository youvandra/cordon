import { SEPOLIA } from "@cordon/fixtures";
import { EnsMark, EthereumMark } from "../parts/marks";

/**
 * Who this is built on, moving past.
 *
 * Every item carries its own mark. An item whose mark this project could not
 * source was removed rather than left as a bare word beside logos: a strip
 * where some entries have one and some do not reads as the missing ones
 * mattering less, which is not what the list means.
 *
 * Two of them are files rather than inline SVG, and that is a correctness
 * choice. The marquee renders the track twice, so an inline SVG carrying ids
 * or a <style> block puts duplicate ids in the document and injects the same
 * rules twice — `circle.svg` has both, down to a class named `.st0`. Files
 * referenced by <img> cannot collide with anything. They carry explicit
 * dimensions so the layout is settled before either arrives.
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
const MARK_PX = 22;

interface Item {
  name: string;
  role: string;
  /** Inline, for a mark with no ids and no styles to collide with. */
  Mark?: (props: { size?: number }) => React.ReactElement;
  /** A file under public/, for one that has either. */
  src?: string;
  /** Width over height, so the box is reserved before the file lands. */
  ratio?: number;
}

const STACK: Item[] = [
  { name: "ENS", role: "names and permissions", Mark: EnsMark },
  { name: SEPOLIA.name, role: "where the names live", Mark: EthereumMark },
  { name: "Circle", role: "Gateway, and USDC", src: "/brand/circle.svg", ratio: 1 },
  { name: "x402", role: "the payment, in USDC", src: "/brand/usdc.webp", ratio: 1 },
];

function Track({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul className="stack__track" aria-hidden={hidden || undefined}>
      {STACK.map(({ name, role, Mark, src, ratio }) => (
        <li className="stack__item" key={name}>
          {/* The mark is decoration beside a name that is already there, so it
              is hidden from assistive technology rather than read twice. */}
          <span className="stack__mark" aria-hidden="true">
            {Mark ? (
              <Mark size={MARK_PX} />
            ) : (
              <img
                src={src}
                alt=""
                width={Math.round(MARK_PX * (ratio ?? 1))}
                height={MARK_PX}
                loading="eager"
                decoding="async"
              />
            )}
          </span>
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
