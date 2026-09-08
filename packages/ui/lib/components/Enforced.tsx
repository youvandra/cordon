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
      frontend preview — {note ?? "figures are fixtures, not chain reads"}
    </Tag>
  );
}

export function Enforced({ children }: { children: React.ReactNode }) {
  return (
    <span className="enforced">
      <span className="enforced__dot" aria-hidden="true" />
      <span className="mono">{children}</span>
    </span>
  );
}
