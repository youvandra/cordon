/**
 * What the namespace says, held against what the contract does.
 *
 * What a name grants is decided by arithmetic rather than by a chain read, and
 * it has already been got wrong once. `mirror` lives here so that a test can
 * ask it without a node, an RPC, or a deployment.
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
 * The ENSIP-25 key builder lives in `fixtures`, beside the registries it
 * encodes, because the console's Resolve screen keys records with it too. It
 * is re-exported here so this module stays the one place a script asks about
 * a name.
 */
export { erc7930, registrationKey } from "../../fixtures/src/index.ts";
