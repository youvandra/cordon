/**
 * Say what the nodes this daemon holds keys for are for.
 *
 * `purpose` is written at spawn, and every node on the live tree predates the
 * field — so a console that reads it back correctly had nothing to read, and
 * an owner looking at their own tree saw twelve hexadecimal ids and no way to
 * tell the agent that buys market data from the one that reads a social feed.
 *
 * `Recorder.describe` is not tied to spawning: it reads the node's ERC-8004
 * identity and writes the metadata with the operator's key, which is the only
 * key the registry accepts for it. So the same call backfills.
 *
 * Nothing here can change a bound. `cordon.purpose` is metadata on an identity;
 * the vault has never read it and never will, which is why the console labels
 * it a description rather than a limit.
 *
 *   node --env-file=.env.live --env-file=$HOME/.cordon/cordon.env \
 *     scripts/describe-nodes.ts [--dry-run]
 *
 * Idempotent: a node whose purpose already matches is left alone, so a rerun
 * after a failure costs nothing and writes nothing.
 */
import { hexToString } from "viem";
import { ERC8004 } from "../../fixtures/src/index.ts";
import { load } from "../src/config.ts";
import { Gate } from "../src/gate.ts";
import { ConductRecordAbi } from "../src/abi.gen.ts";

/* Keyed by node id. A node this daemon holds no key for is skipped by name
   rather than silently: the operator is the only signer the registry takes. */
const PURPOSE: Record<string, string> = {
  "0xd08820db0e1cd58426ba9dc8e78513b05d244b42cdaf841070b0a00d49b901ad":
    "The desk's mandate. Every agent below shares this budget.",
  "0xe4516a46eb1115550187a182f500da5072de4d6244fb8159c68283be3601dfb2":
    "Market data buyer. Pays for price and attestation readings on demand.",
  "0x3f37bbd5943b808c3bf6a0ed1981950aaf68a8a07ccff0573e30e4dab019938c":
    "Research lead. Delegates paid lookups to its own probes.",
  "0x08bd7e428ea927accef4b310ed056cb75e3315a96b3f7d4c6d1a74540f270f99":
    "Cheap-source probe. Capped so small it refuses anything but the cheapest reading.",
  "0x4d04735a35452031e145d12584c32676d61c61e0b4472967db8544e4b870f324":
    "Social sentiment lead. Splits its window between two feed readers.",
  "0x77e9a3d7e0580ce950dbaa6d557ce1093f9ae795cf90b4d86d2002c672f92717":
    "Social feed reader — sentiment on one venue.",
  "0x23bc439dc7a5bd846c913ed1d70b67d9f12aac8e3452cfe159cf775be0d4698a":
    "Second feed reader. Cut after its operator turned up holding funds from outside the tree.",
  "0xce62536fab40faf475d24967b38348df257c3d5d6e28b45f60b19ba48f83340c":
    "Retired execution agent. Revoked; draws nothing.",
};

const dryRun = process.argv.includes("--dry-run");
const config = load(process.env);
const gate = new Gate(config);
const held = new Set(gate.nodes().map((node) => node.toLowerCase()));

if (!config.record) {
  console.error("CORDON_RECORD is not set, so no node has an identity to write to.");
  process.exit(2);
}

for (const [node, purpose] of Object.entries(PURPOSE)) {
  const short = `${node.slice(0, 12)}…`;

  /* The registry's own cap, checked here rather than discovered by a revert
     that has already cost gas. */
  if (purpose.length > ERC8004.purposeMaxLength) {
    console.log(`${short}  too long (${purpose.length} > ${ERC8004.purposeMaxLength}) — skipped`);
    continue;
  }
  if (!held.has(node.toLowerCase())) {
    console.log(`${short}  no key held for this node — skipped`);
    continue;
  }

  const agentId = (await gate.publicClientForSettlement.readContract({
    address: config.record,
    abi: ConductRecordAbi,
    functionName: "agentIdOf",
    args: [node as `0x${string}`],
  })) as bigint;
  if (agentId === 0n) {
    console.log(`${short}  no ERC-8004 identity — skipped`);
    continue;
  }

  const raw = (await gate.publicClientForSettlement.readContract({
    address: config.identity,
    abi: [
      {
        type: "function",
        name: "getMetadata",
        stateMutability: "view",
        inputs: [
          { name: "agentId", type: "uint256" },
          { name: "metadataKey", type: "string" },
        ],
        outputs: [{ name: "", type: "bytes" }],
      },
    ] as const,
    functionName: "getMetadata",
    args: [agentId, ERC8004.purposeKey],
  })) as `0x${string}`;
  const already = raw === "0x" ? "" : hexToString(raw).trim();
  if (already === purpose) {
    console.log(`${short}  already says this — left alone`);
    continue;
  }

  if (dryRun) {
    console.log(`${short}  would write to #${agentId}: ${purpose}`);
    continue;
  }

  const ok = await gate.describe(node as `0x${string}`, purpose);
  console.log(`${short}  ${ok ? `written to #${agentId}` : "write refused"}: ${purpose}`);
}
