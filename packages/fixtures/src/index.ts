/**
 * Cordon fixtures — the only source of any figure.
 *
 * Nothing else in this repository hardcodes a cap, a window, a decimal count,
 * a test count or an address. Import from here or delete the number.
 *
 * Every figure below is one of:
 *   kind: "verified"  — checked against a primary source on the date given
 *   kind: "fixture"   — a parameter of the demo mandate, enforced by the contract
 *   kind: "pending"   — a gate has not produced this number yet. Do not invent it.
 */

import { GATE_RUNS } from "./gates.gen.ts";
import { SEARCH } from "./search.gen.ts";
import { DEPLOYMENT } from "./deployment.gen.ts";
import { DRILL_RUN } from "./drill.gen.ts";

export const VERIFIED_ON = "2026-09-06";

/* ------------------------------------------------------------------ */
/* Chain                                                               */
/* ------------------------------------------------------------------ */

export const ARC = {
  chainId: 5042002,
  name: "Arc testnet",
  rpc: "https://rpc.testnet.arc.io",
  explorer: "https://testnet.arcscan.app",
  faucet: "https://faucet.circle.com",
  /** Gas token is USDC, native, 18 decimals. */
  nativeDecimals: 18,
  /**
   * The ERC-20 view of the same balance. balanceOf truncates below 1e-6.
   *
   * This predeploy is a real FiatTokenV2, confirmed against the live chain on
   * 8 Sep 2026: it answers `DOMAIN_SEPARATOR()`, `authorizationState` and
   * `nonces`, and `transferWithAuthorization` reverts with its own
   * "FiatTokenV2: authorization is expired". An unknown selector reverts, so
   * none of that is a fallback answering yes to everything. Its separator is
   * what name "USDC" at version "2" on this chain hashes to, which is why
   * x402 `exact` can settle here at all. No figure from that run is written
   * down: `attest/src/collect.ts` reads the domain off the token at startup
   * and is the only authority on it, because a domain one character out fails
   * at settlement and looks like the payer's fault.
   */
  erc20: "0x3600000000000000000000000000000000000000",
  erc20Decimals: 6,
  /**
   * Multicall3, at the address it has on every chain that has one.
   *
   * Not ours and not deployed by us, so it belongs here beside the USDC
   * predeploy rather than in `deployments/`. Confirmed on Arc testnet on
   * 12 Sep 2026: the address carries code and `getBlockNumber()` answers
   * 61598855.
   *
   * The console reads a tree of mandates node by node, four views each. Packed
   * through this, a whole level of the descent is one request; without it, a
   * thirteen-node tree was a hundred and twenty calls to the public RPC and a
   * third of them came back 429.
   */
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
  mainnetLaunched: false,
} as const;

/**
 * USDC on Arc has two decimal views of ONE balance.
 * Scaling between them happens in exactly this function and nowhere else.
 * This is the highest-probability bug in the project.
 */
export function scaleUsdc(
  value: bigint,
  from: 6 | 18,
  to: 6 | 18,
): bigint {
  if (from === to) return value;
  if (from === 6 && to === 18) return value * 1_000_000_000_000n;
  // 18 -> 6 truncates, exactly as balanceOf does.
  return value / 1_000_000_000_000n;
}

/**
 * Display helper. Never used to compute a bound.
 *
 * Two decimals is what money looks like, and for most of this project's
 * figures it is right. It is wrong for the small ones, and wrong in the
 * direction that erases the argument: x402 prices live below a cent, and at
 * two decimals the hostile drill's whole result — $0.007000 of a $0.020000
 * ceiling — printed as **"it reached: $0.00"** in the headline of its own
 * page, beside a gauge that said 35%. Circle's settlement fee printed as
 * $0.00 in the sentence explaining why it decides the price.
 *
 * So: an amount that is not zero is never shown as zero. When the requested
 * precision would round a real amount away, the fraction is extended until a
 * significant digit appears, to at most the six decimals the token has.
 * Truncation, never rounding up, because this is money and the direction that
 * flatters is the one to refuse.
 */
export function formatUsdc(base6: bigint, dp = 2): string {
  const neg = base6 < 0n;
  const v = neg ? -base6 : base6;
  const whole = v / 1_000_000n;
  const digits = (v % 1_000_000n).toString().padStart(6, "0");

  let places = dp;
  /* Only ever widens, and only for an amount under a dollar that would
     otherwise read as nothing at all — $20.00 and $4.68 are untouched. It
     widens past the first significant digit to the last one, because
     truncating $0.0035 to $0.003 understates a cost, and understating a cost
     is the direction that flatters us. */
  if (v > 0n && whole === 0n) {
    while (places < 6 && /^0*$/.test(digits.slice(0, places))) places += 1;
    while (places < 6 && !/^0*$/.test(digits.slice(places))) places += 1;
  }

  const s = places > 0 ? `${whole}.${digits.slice(0, places)}` : `${whole}`;
  return `${neg ? "-" : ""}$${s}`;
}

/* ------------------------------------------------------------------ */
/* ERC-8004 — the registries we write into. Nothing to deploy.         */
/* ------------------------------------------------------------------ */

export const ERC8004 = {
  identity: "0x8004A818BFB912233c491871b3d84c89A494BD9e",
  reputation: "0x8004B663056A597Dffe9eCcC1965A193B7388713",
  /** eth_getCode against Arc testnet returned 130 bytes for both. */
  bytesOnArc: 130,
  liveSince: "2026-01-29",
  chains: 40,
  registeredAgents: 173_441,
} as const;

/** Published ecosystem baseline. arxiv 2606.26028. We are the exception to it. */
export const REGISTRY_BASELINE = {
  source: "arxiv 2606.26028",
  sybilFlaggedBase: 90.6,
  sybilFlaggedEthereum: 73.5,
  sybilFlaggedBsc: 59.2,
  /** Feedback records carrying no payment or task linkage. */
  noLinkageLow: 98.7,
  noLinkageHigh: 100,
  reviewersWithPaymentHistoryBase: 6.2,
  feedbackWrittenByThoseReviewers: 94.9,
  costToFlipStatusBase: 0.0027,
  liveEndpointsBase: 15,
} as const;

/** The gap, named by someone else. Cite it; do not paraphrase it as ours. */
export const GOVERNANCE_GAP = {
  source: "arxiv 2606.31498",
  title: "Governance Gaps in Agent Interoperability Protocols",
  missing: [
    "delegation chains",
    "budgets",
    "aggregate limits",
    "sub-agent accountability",
    "revocation",
  ],
} as const;

/* ------------------------------------------------------------------ */
/* Circle Gateway — the fast lane, and where it stops being ours       */
/* ------------------------------------------------------------------ */

/**
 * Checked against Arc testnet on 2026-09-08, not against a blog post.
 *
 * Two things were open in the plan as "verify on day one". Both are answered
 * here, and the second answer changes what the contract can enforce.
 */
export const GATEWAY = {
  verifiedOn: "2026-09-08",

  /** GatewayWallet on Arc testnet. An ERC-1967 proxy; the implementation is
   *  22,818 bytes and carries the deposit selectors below. */
  wallet: "0x0077777d7EBA4688BDeF3E311b846F25870A19B9",
  implementation: "0xa33d52b46964495ea6e2bb09ce85faed05776e28",

  /**
   * RISK 4, ANSWERED — and favourably.
   *
   * `depositFor(address token, address depositor, uint256 value)` credits the
   * `depositor` parameter, not `msg.sender`. Verified on Arc: the call reaches
   * the allowance check rather than failing dispatch, so the selector is live.
   * The vault can therefore fund a beneficiary's Gateway balance directly, and
   * the plan's fallback — routing through the daemon's own address — is not
   * needed.
   */
  depositForCreditsBeneficiary: true,

  /**
   * RISK 4b, THE ONE NOBODY ASKED.
   *
   * The seller is named in `destinationRecipient`, a field of the TransferSpec
   * inside a burn intent that is signed OFF CHAIN by the depositor and handed
   * to Circle's API. GatewayWallet never sees it, and no contract can.
   *
   * So a Gateway balance is spendable to anyone its depositor chooses, with
   * one off-chain signature and no on-chain step for Cordon to sit in. Any
   * bound that names a counterparty — concentration, above all — cannot be
   * enforced against money that already sits in a Gateway balance. It can only
   * be enforced at the moment the balance is topped up, or measured afterwards
   * from settlement records.
   */
  sellerIsOffChainOnly: true,
  sellerField: "destinationRecipient",

  /**
   * RISK 5, STILL OPEN.
   *
   * The plan lists `GET /search-x402transfers` as the way the meter reads a
   * buyer's own settled transfers. It could not be confirmed: Circle's public
   * Gateway technical guide documents no x402 endpoints at all, and unauthed
   * probes of the obvious hosts answered 404, which proves nothing either way.
   * Until a key confirms it, the meter has no verified buyer-side source.
   */
  searchX402Transfers: "unverified" as const,

  /* ---------------------------------------------------------------- */
  /* Settlement, answered on 2026-09-11 by doing it                    */
  /* ---------------------------------------------------------------- */

  /**
   * The two facts that were missing, and are not missing any more.
   *
   * `settle.ts` used to refuse on the grounds that the burn-intent EIP-712
   * definition was unpublished and that submission needed a Circle key.
   * Neither is true: the domain is `{ name: "GatewayWallet", version: "1" }`
   * with the types the daemon now carries, and
   * `https://gateway-api-testnet.circle.com` answers `/v1/info`,
   * `/v1/balances` and `/v1/transfer` with no credential at all.
   */
  api: "https://gateway-api-testnet.circle.com",
  /** Gateway's own id for Arc testnet, from `/v1/info`. */
  domain: 26,
  /** GatewayMinter on Arc. The mint is the call that lands the money. */
  minter: "0x0022222ABE238Cc2C7Bb1f21003F0a260052475B",

  /**
   * RISK 6, AND THE ONE THAT DECIDES THE RAIL.
   *
   * Circle's fee for a same-chain Gateway transfer on Arc, in base units:
   * **$0.0035**, quoted by the API itself and charged **on top of** the value
   * — a burn of $0.0065 against a $0.0100 balance is accepted, a burn of
   * $0.0100 against it is refused for `required 0.0135`. So a tranche can
   * only pay for its own settlement when it is larger than this.
   *
   * The alternative is `withdrawalDelay` on GatewayWallet, which reads
   * 1,209,600 — fourteen days. Neither is compatible with a payment of a
   * tenth of a cent, and that is a fact about the rail rather than about us.
   */
  baseFee6: 3_500n,
  withdrawalDelaySeconds: 1_209_600,
  /** Gas the mint itself cost on Arc, measured: 0.002975 of one balance. */
  mintGas6: 2_975n,
  settlementVerifiedOn: "2026-09-11",
} as const;

/* ------------------------------------------------------------------ */
/* Circle Agent Marketplace — the live catalogue                       */
/* ------------------------------------------------------------------ */

export const MARKETPLACE = {
  discovery: "https://api.circle.com/v2/x402/discovery/resources",
  services: 1_246,
  sampled: 800,
  gatewayCapable: 464,
  priceMin: 0.000001,
  priceMedian: 0.024,
  priceMax: 200,
  offersAtOrBelowOneCent: 651,
  offersTotal: 1_535,
  arcListings: 0,
  /** Re-checked 2026-09-08: 100 sampled resources, every offer on Base,
   *  Solana, Polygon, Ethereum, Avalanche, Arbitrum, Optimism, Unichain and
   *  four smaller chains. Not one on Arc. */
  arcListingsRecheckedOn: "2026-09-08",
} as const;

/* ------------------------------------------------------------------ */
/* The attestation endpoint — what Cordon itself sells                 */
/* ------------------------------------------------------------------ */

/**
 * A seller asks one question before serving an agent: does this buyer hold a
 * live mandate, and what has it done inside it? The answer is the same record
 * `/agent/<id>` shows for free, in the shape a machine reads, behind x402.
 *
 * Price is a parameter of the offer, not a measurement. It sits under the
 * catalogue's median of $0.024 and inside the band where 651 of 1,535 live
 * offers already are, because a check that costs more than the call it guards
 * is a check nobody makes.
 */
export const ATTEST = {
  /**
   * Base units, 6 dp. $0.01.
   *
   * It was $0.001 until 11 September, and Circle's own settlement floor is
   * what moved it: a tranche of a tenth of a cent cannot pay the $0.0035 fee
   * Gateway charges to release it, so a price below that floor is a price no
   * buyer on this rail can actually settle. It still sits under the
   * catalogue's $0.024 median and inside the band where 651 of 1,535 live
   * offers already are.
   */
  price6: 10_000n,
  /** x402 `exact`, the only scheme with an EOA signature and no gas. */
  scheme: "exact",
  x402Version: 2,
  resourcePath: "/attest",
  /** How long a payer's authorisation has to stay valid after it arrives.
   *  A signature that expires while the settlement is in flight is a payment
   *  the seller cannot collect and a buyer who was charged nothing. */
  minLeadSeconds: 15,
  /** What the offer tells a payer to sign for. */
  maxTimeoutSeconds: 300,
} as const;

export const ENDPOINTS = [
  { price: 0.0024, seller: "AIsa API", path: "api.aisa.one/apis/v2/scholar/search/explain" },
  { price: 0.008, seller: "AIsa API", path: "api.aisa.one/apis/v2/coingecko/simple/price" },
  { price: 0.02, seller: "Allium", path: "agents.allium.so/api/v1/developer/prices" },
  { price: 1.0, seller: "Arkham", path: "api.arkm.com/x402/balances/entity" },
  { price: 200.0, seller: "Arkham", path: "api.arkm.com/x402/intelligence/address-enriched-batch" },
] as const;

/* ------------------------------------------------------------------ */
/* The demo mandate — every field is a bound the contract evaluates    */
/* ------------------------------------------------------------------ */

/**
 * What a surface shows where an address belongs and none has been written yet.
 *
 * A figure no run has produced is `pending`, and an address is a figure. The
 * failure this avoids is an invented address that opens in an explorer and
 * shows nothing, which reads as a broken deployment rather than as an absent
 * one.
 */
/**
 * The tree anyone can look at.
 *
 * Every console screen used to draw a tree of invented agents for a visitor
 * without a wallet — six nodes with names nobody had opened, spending money
 * nobody had funded. It reads as a mockup because it was one, and a judge
 * cannot tell from a screenshot which half of the product is real.
 *
 * This owner opened the live tree on Arc, and both numbers below are public on
 * chain: a mandate's owner is a field of the mandate, and the console derives
 * every node id from the owner's address without asking anyone. So the same
 * code path that shows an owner their own tree shows a visitor this one,
 * read-only, with a banner saying whose it is.
 *
 * No key is implied by either. The owner signs from their own wallet, and
 * nothing here can.
 */
export const DEMO = {
  owner: "0x736159a06C89Ea5b12eD88BE658741edCa64324D",
  root: "0xd08820db0e1cd58426ba9dc8e78513b05d244b42cdaf841070b0a00d49b901ad",
  /** Its ERC-8004 identity, which is what the public record pages address. */
  agentId: "894124",
} as const;

export const PENDING_ADDRESS = "pending — written by the deploy script";

/** The same absence, for the two fields no deploy can fill. A mandate exists
 *  because an owner signed for it, which is the one step no script may take. */
export const PENDING_MANDATE = "pending — no mandate signed yet";

/** Is this an address, or is it the sentence that stands where one will go? */
export function isAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

/**
 * An address, short enough to sit in a chip.
 *
 * Anything that is not an address reads `pending`, whole. Slicing the ends off
 * a sentence produces a shorter sentence, not an address, and `pending — …ript`
 * on screen looks like a truncated identifier rather than an absent one.
 */
export function shortAddress(value: string, head = 10, tail = 4): string {
  return isAddress(value) ? `${value.slice(0, head)}…${value.slice(-tail)}` : "pending";
}

/** Is this a 32-byte id — a node, or a transaction — rather than a sentence? */
export function isHex32(value: string): boolean {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

/**
 * A node id, short enough to sit in a chip.
 *
 * `shortAddress` reads `pending` for anything that is not 20 bytes, which is
 * right for an address and wrong for a node: a real node id rendered as
 * `pending` says a live record has not been signed yet, which is the opposite
 * of true. Same rule underneath — an id is shortened, a sentence is not.
 */
export function shortId(value: string, head = 10, tail = 6): string {
  return isHex32(value) ? `${value.slice(0, head)}…${value.slice(-tail)}` : "pending";
}

/**
 * The deployed contracts, copied from `deployments/<chainId>.json` by
 * `packages/contracts/scripts/record-addresses.mjs`. `null` until a deploy has
 * run, which is what makes the surfaces read `pending`.
 */
export { DEPLOYMENT } from "./deployment.gen.ts";
export type { Deployment } from "./deployment.gen.ts";

export const MANDATE = {
  /** No mandate is open yet. The owner signs the first one from their own
   *  wallet, and nothing here may stand in for a signature nobody gave. */
  id: PENDING_MANDATE,
  /** TreeVault.windowBudget(root) — base units, 6 dp. What may be drawn in
   *  any one window. It resets, which is why the cap below exists. */
  budget6: 20_000_000n,
  /** TreeVault.lifetimeSpent(node) — base units, 6 dp, and it never resets.
   *
   *  A window budget alone is a rate, not a total: a mandate left running for
   *  a week authorises seven windows. This is the total the owner signed for,
   *  and the binding limit is whichever of the two is reached first. Larger
   *  than one window on purpose, so both bounds are reachable and a reader can
   *  see they are different things. */
  lifetimeCap6: 50_000_000n,
  /** Equal at every depth by construction. A shorter child window resets faster. */
  windowSeconds: 86_400,
  /** MandateRegistry.maxDepth() */
  maxDepth: 3,
  /** TreeVault.trancheCap() */
  tranche6: 1_000_000n,
  /** TreeVault.concentrationBound() — share of the window to one counterparty. */
  concentrationBoundPct: 35,
  /** The one on chain, never a literal. */
  vault: DEPLOYMENT?.vault ?? PENDING_ADDRESS,
  /** The owner is whoever opens the mandate, and nobody has. */
  owner: PENDING_MANDATE,
} as const;

/**
 * How strongly the contract stands behind a figure. Rule 1, made precise.
 *
 * Most of what Cordon shows is `enforced`: the money does not move unless the
 * contract agrees. One thing is not, and saying so is the difference between a
 * control and a story. A payment out of a Circle Gateway balance is a burn
 * intent signed off chain, and the seller is a field inside that signature, so
 * no contract can read it. See `GATEWAY` above.
 *
 * `declared` therefore means: the daemon states the counterparty on chain
 * before paying, and the contract bounds that statement. An honest daemon
 * cannot concentrate its spend past the bound. A dishonest one is caught after
 * the fact by reconciling declarations against settlement — which needs a
 * settlement source we have not yet verified, so nothing may claim it today.
 */
export type Strength = "enforced" | "declared";

export const STRENGTH: Record<string, Strength> = {
  budget: "enforced",
  headroom: "enforced",
  treeBar: "enforced",
  refusal: "enforced",
  depth: "enforced",
  tranche: "enforced",
  lifetime: "enforced",
  release: "enforced",
  revoke: "enforced",
  record: "enforced",
  /* `depositFor` credits the depositor parameter, checked on chain, so the
     top-up itself is enforced. What is declared is who the operator then pays
     out of that balance, and that is the `concentration` row below. */
  gatewayTopUp: "enforced",
  concentration: "declared",
};

/** Enforcing function for every figure the console renders. Rule 1. */
export const ENFORCED_BY = {
  budget: "TreeVault.windowSpent(node)",
  headroom: "TreeVault.headroom(node)",
  treeBar: "TreeVault.ancestorDebit(node, amount)",
  refusal: "TreeVault.evaluate(node, amount) -> Refused",
  gatewayTopUp: "GatewayWallet.depositFor(usdc, operator, amount)",
  /** Bounds the counterparty the daemon declared, not the one it paid. */
  concentration: "TreeVault.concentrationBound(node, counterparty)",
  depth: "MandateRegistry.maxDepth()",
  tranche: "TreeVault.trancheCap()",
  lifetime: "TreeVault.lifetimeSpent(node)",
  release: "TreeVault.release(refusalId), owner signature",
  revoke: "MandateRegistry.revoke(node), subtree",
  record: "ReputationRegistry.giveFeedback(agentId, score, tags, uri)",
} as const;

/**
 * The strength of a bound, looked up by the function that enforces it.
 *
 * Surfaces hold the function string, because that is the thing they display;
 * the strength has to come from the same row that supplied the string, or a
 * page ends up printing `concentrationBound` under an "enforced" chip. This
 * is derived from `STRENGTH` rather than written again, so adding a bound in
 * one place cannot leave the other behind.
 *
 * An unmapped function reads `declared`. That default is deliberate: the
 * failure mode to avoid is a surface claiming enforcement nobody checked, and
 * `<Enforced>` on its own defaults the other way.
 */
const STRENGTH_BY_FN: Record<string, Strength> = Object.fromEntries(
  Object.entries(ENFORCED_BY).map(([key, fn]) => [fn, STRENGTH[key] ?? "declared"]),
);

export const strengthOf = (fn: string): Strength => STRENGTH_BY_FN[fn] ?? "declared";

/* ------------------------------------------------------------------ */
/* Gates                                                               */
/* ------------------------------------------------------------------ */

export type GateStatus = "pending" | "green" | "red";

export type Gate = {
  id: string;
  name: string;
  ends: string;
  status: GateStatus;
  /** Tests behind the gate. Recorded from the run, never typed by hand. */
  tests: number | null;
  /** The date the run that produced this status happened, UTC. */
  recordedAt: string | null;
};

const GATE_DEFINITIONS = [
  { id: "G1", name: "tree arithmetic", ends: "every draw debits every ancestor, exactly" },
  { id: "G2", name: "live on Arc", ends: "four-agent tree, no agent holds a key, refusal on arcscan" },
  { id: "G3", name: "the hostile drill", ends: "an unrestricted agent is told to spend, and the number is published" },
  { id: "G4", name: "bounded search", ends: "thousands of strategies scored by the contract, none passes a bound" },
  { id: "G5", name: "the refusal survives us", ends: "no admin key, no proxy, reversal fails as the deployer" },
  { id: "G6", name: "the record cannot be forged", ends: "every record names its draw transaction; nobody else can write one" },
  { id: "G7", name: "the work still gets done", ends: "one task, two conditions, three runs each, and the brief completes under the fence" },
] as const;

/**
 * A gate is green because a run said so, not because someone edited a file.
 * `gates.gen.ts` is written by packages/contracts/scripts/record-gate.mjs from
 * the test run itself; a gate missing from it has not been run and is pending.
 */
export const GATES: Gate[] = GATE_DEFINITIONS.map((g) => {
  const run = GATE_RUNS[g.id];
  return {
    ...g,
    status: run ? run.status : "pending",
    tests: run ? run.tests : null,
    recordedAt: run ? run.recordedAt : null,
  };
});

/**
 * G3, the hostile drill — the number an agent told to spend as hard as it could
 * actually reached, against what its mandate authorised.
 *
 * `drill.gen.ts` is written by `packages/daemon/scripts/record-g3.mjs` from the
 * chain, and the composition here adds nothing to it but the ratio. The number
 * this produces is the entire difference between infrastructure and a
 * dashboard, so it is never invented and never rounded in our favour.
 */
export const DRILL = {
  status: "run" as const,
  /** What the drill was measured against: the window its own mandate signed. */
  ceiling6: DRILL_RUN.authorised6,
  reached6: DRILL_RUN.spent6,
  /** Of the ceiling, in basis points. 10,000 would be the treasury reached. */
  reachedBps: Number((DRILL_RUN.spent6 * 10_000n) / DRILL_RUN.authorised6),
  /** Every reason that stopped it, in the order the chain recorded them. */
  stoppedBy: [...new Set(DRILL_RUN.refusals.map((refusal) => refusal.reason))],
  run: DRILL_RUN,
} as const;

/**
 * G4 has been run, and these are its numbers — written by the run itself into
 * `search.gen.ts`, never typed.
 *
 * `closestToBudget6` is the figure worth reading twice: the most any of the
 * strategies got a root's window to. Equal to the budget means one of them
 * reached the bound exactly and stopped there, which is what a bound is.
 */
export { DRILL_RUN } from "./drill.gen.ts";
export type { DrillRun, DrillRefusal } from "./drill.gen.ts";
export { SETTLEMENT } from "./settlement.gen.ts";
export type { SettledPurchase } from "./settlement.gen.ts";
export { SEARCH } from "./search.gen.ts";
export type { SearchRun } from "./search.gen.ts";

/**
 * `TreeVault.Reason`, in the contract's own order.
 *
 * The index is the on-chain enum value and a Reason is stored in every refusal,
 * so an existing entry may never move — appended, never inserted. Everything
 * that decodes a refusal reads this: the daemon, the console, and anything else
 * that ever has to turn a number back into the word the contract used.
 */
export const REASONS = [
  "none",
  "revoked",
  "tranche-cap",
  "window-budget",
  "concentration",
  "vault-balance",
  "lifetime-cap",
] as const;

/**
 * A reason index this build has no name for.
 *
 * The contract may append one before this package is rebuilt, and the fallback
 * that matters is the one that does not lie: reporting an unknown index as
 * `none` tells a reader the draw was refused for no reason, which reads as a
 * bug in Cordon rather than as a bound it hit.
 */
export const UNRECOGNISED = "unrecognised-reason";
export type Reason = (typeof REASONS)[number] | typeof UNRECOGNISED;

/**
 * What each refusal reason means, in one sentence.
 *
 * The contract's own word is the key — `TreeVault.Reason` decoded by
 * `ConductRecord` — and the sentence is the only part anybody writes. It lived
 * in three places before this: the MCP's explanation table, the docs page, and
 * nowhere at all for the public record page, which was about to need a fourth.
 *
 * A reason with no sentence here renders as the reason itself, which is the
 * contract's word and is never wrong, only terse.
 */
export const REASON_MEANING: Record<string, string> = {
  revoked: "the mandate for this branch was cut",
  "tranche-cap": "the purchase is larger than one draw may be",
  "window-budget": "the window is spent, on this node or an ancestor",
  "lifetime-cap": "the total this mandate was signed for is spent, and it does not come back",
  concentration: "this recipient has taken its share of the window",
  "vault-balance": "the bounds passed and the treasury is empty",
};

/** Did any strategy get past a bound? The answer must be no. */
export const SEARCH_CLEAN = SEARCH.passedABound === 0;

/**
 * G7 has been run, and these are its numbers — written by the run itself into
 * `eval.gen.ts`, never typed.
 *
 * Every other gate measures whether Cordon refuses. This one measures whether
 * an agent under it can still finish a job, and it is the gate allowed to come
 * out against the product: a `the-fence-blocks-the-work` verdict is a real
 * result and renders as one.
 */
export { EVAL } from "./eval.gen.ts";
export type { EvalRunRecord, EvalCondition } from "./eval.gen.ts";

/* ------------------------------------------------------------------ */
/* Demo illustration — the counterfactual from the plan                */
/* Not a chain read. Labelled as an illustration everywhere it renders.*/
/* ------------------------------------------------------------------ */

/**
 * A share of the signed window, in basis points.
 *
 * The illustration is about proportion: an unbounded run climbing past a
 * window that stops climbing. Written as amounts, every one of these figures
 * has to be retyped when the mandate is resized, and the failure mode is a
 * step that sits above the ceiling it is drawn under.
 */
const share = (bps: number): bigint => (MANDATE.budget6 * BigInt(bps)) / 10_000n;

export const COUNTERFACTUAL = {
  kind: "illustration" as const,
  steps: [
    { draw: 1, without6: share(12_700), with6: share(4_700), refused: false },
    { draw: 2, without6: share(28_400), with6: share(8_300), refused: false },
    { draw: 3, without6: share(45_100), with6: MANDATE.budget6, refused: true },
    { draw: 4, without6: share(61_200), with6: MANDATE.budget6, refused: true },
    { draw: 5, without6: share(84_700), with6: MANDATE.budget6, refused: true },
  ],
} as const;

/**
 * Warm-up beat: structuring. Every call is under any per-transfer cap.
 *
 * The total has to land between the concentration bound and the window, or the
 * beat proves the wrong thing: over the window and the budget refuses first,
 * under the bound and nothing refuses at all.
 */
const STRUCTURING_CALLS = 2_000;
const STRUCTURING_UNIT = 0.008;

export const STRUCTURING = {
  calls: STRUCTURING_CALLS,
  unitPrice: STRUCTURING_UNIT,
  total: STRUCTURING_CALLS * STRUCTURING_UNIT,
  refusedBy: ENFORCED_BY.concentration,
} as const;

/**
 * The tool list is part of the fence, so it is not written down twice.
 *
 * `tools.gen.ts` is produced by asking a running MCP server what it exposes,
 * over the real protocol. This file used to carry its own copy, which said
 * `cordon_spawn(label, cap)` — an argument list the server has never had.
 */
export { MCP_TOOLS, ABSENT_TOOLS, MCP_CONFIG, MCP_ENV } from "./tools.gen.ts";
