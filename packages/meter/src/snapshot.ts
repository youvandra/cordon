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
import { renameSync, writeFileSync } from "node:fs";
import type { Ledger } from "./ledger.ts";

const BIGINT = /^-?\d+n$/;

export function serialize(ledger: Ledger): string {
  return JSON.stringify(ledger, (_key, value) => (typeof value === "bigint" ? `${value}n` : value), 2);
}

export function deserialize(text: string): Ledger {
  const ledger = JSON.parse(text, (_key, value) =>
    typeof value === "string" && BIGINT.test(value) ? BigInt(value.slice(0, -1)) : value,
  ) as Ledger;
  return normalise(ledger);
}

/**
 * Fill in what a snapshot written by an older build has no field for.
 *
 * A running box carries its snapshot across a deploy, so a field added here is
 * `undefined` on every row already on disk — and `undefined` in an arithmetic
 * chain is a `TypeError` in a loop whose whole job is to keep running, or
 * worse a figure that silently reads as nothing. Zero is the honest value: the
 * range was read by a build that did not count this, and re-reading it from
 * the deploy block is how a reader gets the real number back.
 */
function normalise(ledger: Ledger): Ledger {
  ledger.releasedUnattributed6 ??= 0n;
  for (const row of Object.values(ledger.nodes)) row.releasedTo6 ??= 0n;
  return ledger;
}

/**
 * Write the snapshot so a reader never sees half of one.
 *
 * `writeFileSync` truncates the file and then fills it, so a process killed in
 * between — a deploy, an OOM, a box rebooting — leaves a file that is valid
 * JSON up to the cut and nothing after it. The next start hands that to
 * `deserialize`, which throws, and the service does not come up at all: a
 * cache that cannot be read has taken down the thing it exists to speed up.
 *
 * Writing beside it and renaming is atomic within a filesystem, so the old
 * snapshot stays whole until the new one is complete. The worst case becomes a
 * snapshot one tick behind, which the ledger's own block range already admits
 * to and which the next tick closes.
 */
export function writeSnapshot(path: string, ledger: Ledger): void {
  const beside = `${path}.tmp`;
  writeFileSync(beside, serialize(ledger));
  renameSync(beside, path);
}
