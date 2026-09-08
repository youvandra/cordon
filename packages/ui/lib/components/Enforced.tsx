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
export function Preview({ note }: { note?: string }) {
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
