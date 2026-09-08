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
  /** The ERC-20 view of the same balance. balanceOf truncates below 1e-6. */
  erc20: "0x3600000000000000000000000000000000000000",
  erc20Decimals: 6,
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

/** Display helper. Never used to compute a bound. */
export function formatUsdc(base6: bigint, dp = 2): string {
  const neg = base6 < 0n;
  const v = neg ? -base6 : base6;
  const whole = v / 1_000_000n;
  const frac = (v % 1_000_000n).toString().padStart(6, "0").slice(0, dp);
  const s = dp > 0 ? `${whole}.${frac}` : `${whole}`;
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

export const MANDATE = {
  id: "0x7f3a9c41d2e8b5470a6f1c93be2d84f05a71c6e8",
  /** TreeVault.windowBudget(root) — base units, 6 dp. */
  budget6: 100_000_000n,
  /** Equal at every depth by construction. A shorter child window resets faster. */
  windowSeconds: 86_400,
  /** MandateRegistry.maxDepth() */
  maxDepth: 3,
  /** TreeVault.trancheCap() */
  tranche6: 5_000_000n,
  /** TreeVault.concentrationBound() — share of the window to one counterparty. */
  concentrationBoundPct: 35,
  vault: "0x4c9a1f7b3d0e6852af14c7d95b3e08a6127df4b0",
  owner: "0xB1f4A2c7093Ed5688cA0Fb2371d9E4c806a3F17d",
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
  release: "enforced",
  revoke: "enforced",
  record: "enforced",
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
  release: "TreeVault.release(refusalId) — owner signature",
  revoke: "MandateRegistry.revoke(node) — subtree",
  record: "ReputationRegistry.giveFeedback(agentId, score, tags, uri)",
} as const;

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
 * G3 and G4 have not been run. The number is the entire difference between
 * infrastructure and a dashboard, so it is never invented here.
 */
export const DRILL = {
  status: "pending" as const,
  /** What the drill is measured against when it runs. */
  ceiling6: MANDATE.budget6,
  strategiesPlanned: 10_000,
} as const;

/* ------------------------------------------------------------------ */
/* Demo illustration — the counterfactual from the plan                */
/* Not a chain read. Labelled as an illustration everywhere it renders.*/
/* ------------------------------------------------------------------ */

export const COUNTERFACTUAL = {
  kind: "illustration" as const,
  steps: [
    { draw: 1, without6: 127_000_000n, with6: 47_000_000n, refused: false },
    { draw: 2, without6: 284_000_000n, with6: 83_000_000n, refused: false },
    { draw: 3, without6: 451_000_000n, with6: 100_000_000n, refused: true },
    { draw: 4, without6: 612_000_000n, with6: 100_000_000n, refused: true },
    { draw: 5, without6: 847_000_000n, with6: 100_000_000n, refused: true },
  ],
} as const;

/** Warm-up beat: structuring. Every call is under any per-transfer cap. */
export const STRUCTURING = {
  calls: 10_000,
  unitPrice: 0.008,
  total: 80,
  refusedBy: ENFORCED_BY.concentration,
} as const;

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export const SURFACES = [
  {
    id: "mcp",
    name: "MCP",
    shape: "LLM loop with tools — Claude Desktop, Claude Code, MCP runtimes",
    cost: "one config block",
    snippet: `{ "mcpServers": { "cordon": {
    "command": "npx", "args": ["-y", "@cordon/mcp"],
    "env": { "CORDON_MANDATE": "0x7f3a...", "CORDON_CHAIN": "arc" } } } }`,
  },
  {
    id: "proxy",
    name: "HTTP proxy",
    shape: "code that makes HTTP calls — LangChain, CrewAI, scripts",
    cost: "one env var",
    snippet: `export HTTP_PROXY=http://localhost:8402
# or
cordon run --mandate 0x7f3a... -- python my_agent.py`,
  },
  {
    id: "sdk",
    name: "SDK",
    shape: "code we own, wanting explicit control of spawn and retry",
    cost: "two lines",
    snippet: `const cordon = await Cordon.attach(process.env.CORDON_MANDATE)
const res = await cordon.fetch("https://api.aisa.one/apis/v2/...")`,
  },
] as const;

/** The tool list is part of the fence. There is no cordon_transfer, ever. */
export const MCP_TOOLS = [
  { name: "cordon_fetch", args: "url, method", note: "pays a 402 endpoint through the gate" },
  { name: "cordon_spawn", args: "label, cap", note: "registers a child mandate, narrowing only" },
  { name: "cordon_status", args: "—", note: "tree exposure" },
] as const;

export const ABSENT_TOOL = "cordon_transfer(to, amount)";
