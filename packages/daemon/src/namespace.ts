/**
 * What the namespace says, held against what the contract does.
 *
 * Two questions about a name are decided by arithmetic rather than by a chain
 * read, and both of them have already been got wrong once. They live here so
 * that a test can ask them without a node, an RPC, or a deployment:
 *
 *   - `mirror`, which says whether a set of roles on a name grants an
 *     authority the mandate refuses;
 *   - `registrationKey`, which builds the ENSIP-25 key an ERC-8004
 *     registration is published under.
 *
 * The scripts that print these answers — `scripts/check-authority.ts` and
 * `scripts/resolve-agent.ts` — read the chain and then call in here. Nothing
 * below touches the network, and nothing below prints.
 */

/**
 * One authority, as the name grants it and as the mandate allows it.
 *
 * `what` is the wording the check prints, carried along so the caller does not
 * have to keep a parallel list in the same order.
 */
export type Grant = {
  what: string;
  /** Does a role on the name confer this? */
  granted: boolean;
  /** Does the mandate behind the name permit it? */
  allowed: boolean;
};

/**
 * The three ways a grant can land, and they are not three shades of the same
 * thing.
 *
 * `invented` is the defect the whole check exists to catch: the name confers
 * an authority the contract refuses, so a stranger reading the name is told
 * something no contract will honour and whoever holds the role can act on it.
 *
 * `narrower` is the opposite direction and is not a failure. The name confers
 * less than the mandate allows — usually a name that has not been given its
 * own registry yet. Nothing false is published and nobody gains anything.
 *
 * Collapsing the two into "mismatch" is what hid the defect the first time.
 */
export type Verdict = "ok" | "invented" | "narrower";

export function verdict(grant: Grant): Verdict {
  if (grant.granted === grant.allowed) return "ok";
  return grant.granted ? "invented" : "narrower";
}

export type Mirror = {
  rows: Array<Grant & { verdict: Verdict }>;
  /** Authorities the name grants and the contract refuses. */
  invented: number;
  /** Places the name grants less than the mandate allows. */
  narrower: number;
  /** Non-zero only for `invented`. Being narrower never fails a run. */
  exitCode: 0 | 1;
};

export function mirror(grants: Grant[]): Mirror {
  const rows = grants.map((grant) => ({ ...grant, verdict: verdict(grant) }));
  const invented = rows.filter((row) => row.verdict === "invented").length;
  const narrower = rows.filter((row) => row.verdict === "narrower").length;
  return { rows, invented, narrower, exitCode: invented === 0 ? 0 : 1 };
}

/**
 * An ERC-7930 interoperable address: the registry an ERC-8004 identity lives
 * in, encoded the way ENSIP-25 keys it.
 *
 * Version, chain type, the length of the chain reference and the reference
 * itself, then the length of the address and the address. It is built rather
 * than written down because a key one byte out looks *absent* rather than
 * wrong — and an absent registration reads as an agent that never claimed its
 * identity, which is a sentence about the agent that nobody meant to say.
 */
export function erc7930(chainId: number, address: string): string {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error(`chain id must be a positive integer, got ${chainId}`);
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(address)) {
    throw new Error(`not a 20-byte address: ${address}`);
  }
  let ref = chainId.toString(16);
  if (ref.length % 2) ref = "0" + ref;
  const refLen = (ref.length / 2).toString(16).padStart(2, "0");
  return `0x0001` + `0000` + refLen + ref + `14` + address.slice(2).toLowerCase();
}

/** The whole ENSIP-25 text key, registry and agent id together. */
export function registrationKey(chainId: number, registry: string, agentId: bigint): string {
  return `agent-registration[${erc7930(chainId, registry)}][${agentId}]`;
}
