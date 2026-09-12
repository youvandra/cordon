import type { ChainNode } from "./tree";

/** A 32-byte id or an address, short enough to sit in a row. */
export function shortId(id: string, head = 6, tail = 4): string {
  if (!id || id.length <= head + tail + 2) return id;
  return `${id.slice(0, head + 2)}…${id.slice(-tail)}`;
}

/** How much of `of` is spent, 0–100, to one decimal. */
export function share(spent: bigint, of: bigint): number {
  if (of <= 0n) return 0;
  return Math.min(100, Number((spent * 1000n) / of) / 10);
}

/** A window length in the words the setup form offers. */
export function windowLabel(seconds: bigint | number): string {
  const s = Number(seconds);
  if (s === 3600) return "1 hour";
  if (s === 86_400) return "24 hours";
  if (s === 604_800) return "7 days";
  if (s % 86_400 === 0) return `${s / 86_400} days`;
  if (s % 3600 === 0) return `${s / 3600} hours`;
  return `${s.toLocaleString()} seconds`;
}

/** Held down by an ancestor rather than by its own window: the case worth seeing. */
export function isHeld(node: ChainNode): boolean {
  return !node.revoked && node.boundBy.toLowerCase() !== node.node.toLowerCase();
}

/**
 * Whether a node draws nothing because it, or anything above it, was revoked.
 * Revocation runs down a branch, so a child of a cut parent is cut even though
 * its own flag is false.
 */
export function cutLookup(nodes: ChainNode[]): (id: string) => boolean {
  const byId = new Map(nodes.map((node) => [node.node.toLowerCase(), node]));
  return (id: string) => {
    let cursor = byId.get(id.toLowerCase());
    while (cursor) {
      if (cursor.revoked) return true;
      cursor = cursor.parent ? byId.get(cursor.parent.toLowerCase()) : undefined;
    }
    return false;
  };
}

/** Dollars as typed, in USDC base units. Rounding to the millionth is the token's own precision. */
export function usdc6(dollars: string): bigint {
  const value = Number(dollars || "0");
  if (!Number.isFinite(value) || value < 0) return 0n;
  return BigInt(Math.round(value * 1_000_000));
}
