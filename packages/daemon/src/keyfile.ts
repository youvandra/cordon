/**
 * Where a key minted at run time is kept.
 *
 * A spawn generates the child's operator key inside this process, and the
 * mandate it creates names that key's address as its operator for good — the
 * registry has no function to repoint one. Held only in memory, that key died
 * with the process: the child stayed on chain, live and fundable, with nobody
 * able to sign for it ever again.
 *
 * So the key is written to the same file `npm run init` writes, at 0600, and
 * **before the spawn is sent**. Written after, a spawn that landed and a write
 * that failed would be exactly the loss this exists to prevent. Written before,
 * the worst case is a key line with an empty node id beside it, which `load`
 * already skips.
 */
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { Address, Hex } from "viem";

export interface KeyFile {
  readonly path: string;
  /** Write the key under a fresh label with an empty node id. Call before the spawn. */
  remember(secret: Hex, operator: Address): string;
  /** Fill that label's node id once the registry has assigned one. */
  bind(label: string, node: Hex): void;
}

/** A label derived from the operator, so the file says which address a key is. */
export function labelForOperator(operator: Address): string {
  return `CHILD_${operator.slice(2, 10).toUpperCase()}`;
}

export function keyFileAt(path: string): KeyFile {
  return {
    path,

    remember(secret, operator) {
      const label = labelForOperator(operator);
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });

      const existing = existsSync(path) ? readFileSync(path, "utf8") : "";
      if (new RegExp(`^CORDON_KEY_${label}=`, "m").test(existing)) {
        /* Overwriting is how a key a live mandate names gets lost. */
        throw new Error(`${path} already holds a key labelled ${label}`);
      }

      const lead = existing !== "" && !existing.endsWith("\n") ? "\n" : "";
      appendFileSync(
        path,
        `${lead}\n# Spawned ${new Date().toISOString()} for operator ${operator}.\n` +
          `# Private key: never commit this file, never paste its contents.\n` +
          `CORDON_KEY_${label}=${secret}\n` +
          `CORDON_NODE_${label}=\n`,
        { mode: 0o600 },
      );
      /* `mode` on an append only applies when the file is created, and even
         then the umask trims it. A key file readable by the group is the thing
         this file being one file is meant to rule out. */
      chmodSync(path, 0o600);
      return label;
    },

    bind(label, node) {
      const current = readFileSync(path, "utf8");
      const empty = new RegExp(`^CORDON_NODE_${label}=$`, "m");
      if (!empty.test(current)) {
        throw new Error(`${path} has no empty CORDON_NODE_${label} to fill`);
      }
      /* Written beside and renamed over, so a crash mid-write leaves the old
         file whole rather than a truncated one missing every key in it. */
      const next = current.replace(empty, `CORDON_NODE_${label}=${node}`);
      const staging = `${path}.tmp-${process.pid}`;
      writeFileSync(staging, next, { mode: 0o600 });
      chmodSync(staging, 0o600);
      renameSync(staging, path);
    },
  };
}
