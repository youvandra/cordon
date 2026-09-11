import { Tag } from "./Tag";

/**
 * Two labels no Cordon surface may be without.
 *
 * `Preview` says the figures are not chain reads. `Enforced` names the contract
 * function that produces the figure beside it — the rule is that no surface may
 * display a number the contract does not enforce, so a figure without one of
 * these is a figure that should be deleted.
 *
 * They live in the library because both surfaces render them: the console shows
 * an owner their own tree, the public record pages show anyone the same tree.
 */
export function Preview({
  note,
  live = false,
  figures = true,
}: {
  note?: string;
  live?: boolean;
  /**
   * Whether there are figures beside this badge at all.
   *
   * A screen that is still reading, or one whose read failed, has none — and
   * "preview build" is a claim about figures. Saying it over a skeleton tells
   * a reader the build they are on is a mock-up while it is in fact reading
   * the chain, which is the thing the live badge was introduced to stop.
   */
  figures?: boolean;
}) {
  /* "Preview build" meant one thing: the figures beside it are fixtures. Some
     of these screens now read the chain while still being somebody else's
     tree, and keeping the old words there would have the badge deny the thing
     it is sitting next to. A live read says what it is and is not a caution. */
  if (live) {
    return (
      <Tag tone="positive" size="sm" dot>
        {note ?? "read from the chain"}
      </Tag>
    );
  }

  /* Nothing to caption yet, or nothing to caption at all. The note carries
     what is happening and the badge claims nothing about figures that are not
     on the screen. */
  if (!figures) {
    return (
      <Tag tone="neutral" size="sm" dot>
        {note ?? "reading"}
      </Tag>
    );
  }

  return (
    <Tag tone="caution" size="sm" dot>
      preview build · {note ?? "figures are fixtures, not chain reads"}
    </Tag>
  );
}

/**
 * How hard the contract stands behind the figure beside it.
 *
 * `enforced` is the ordinary case: the money does not move unless the contract
 * agrees. `declared` is the one place that is not true. A payment out of a
 * Circle Gateway balance is a burn intent signed off chain, and the seller is
 * a field inside that signature, so no contract can read it. What the contract
 * bounds there is what the daemon stated on chain before paying.
 *
 * The distinction is shown rather than smoothed over, because a bound that
 * looks stronger than it is does more harm than one that admits its edge.
 */
export type Strength = "enforced" | "declared";

export function Enforced({
  children,
  strength = "enforced",
}: {
  children: React.ReactNode;
  strength?: Strength;
}) {
  return (
    <span className="enforced" data-strength={strength}>
      <span className="enforced__dot" aria-hidden="true" />
      <span className="mono">{children}</span>
      {strength === "declared" ? (
        <span className="enforced__strength">declared, not enforced</span>
      ) : null}
    </span>
  );
}
