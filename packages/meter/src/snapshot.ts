/**
 * The cache, written down.
 *
 * A snapshot is a convenience and never an authority. It exists so a page can
 * answer without replaying the chain on every request, and it carries the
 * block range it was built from so that "rebuildable from chain" is checkable
 * rather than claimed: delete it, run the meter again from block zero, and the
 * ledger must come back identical.
 *
 * Amounts are USDC base units and do not fit in a JSON number. They are
 * written as decimal strings with an `n` suffix, so the file says which fields
 * are money instead of relying on a reader to remember.
 */
import type { Ledger } from "./ledger.ts";

const BIGINT = /^-?\d+n$/;

export function serialize(ledger: Ledger): string {
  return JSON.stringify(ledger, (_key, value) => (typeof value === "bigint" ? `${value}n` : value), 2);
}

export function deserialize(text: string): Ledger {
  return JSON.parse(text, (_key, value) =>
    typeof value === "string" && BIGINT.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as Ledger;
}
