/**
 * The read API. Read-only, on purpose.
 *
 * Nothing here can move money, open a mandate or write a record — those all
 * need a signature, and this process holds no key at all. It answers questions
 * about what already happened, which is the only thing an indexer should be
 * able to do.
 *
 * Every figure it returns came out of an Arc event, and every refusal carries
 * the transaction it happened in. That last part is the whole argument of the
 * public record page: the ecosystem baseline is 98.7–100% of ERC-8004 feedback
 * with no linkage at all.
 */
import { createServer, type ServerResponse } from "node:http";
import type { Hex } from "viem";
import { conductOf, subtree, topCounterparty, type Ledger } from "./ledger.ts";
import type { Reconciliation } from "./reconcile.ts";

const json = (res: ServerResponse, status: number, body: unknown) => {
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(text),
    /* The record is meant to be read by people who are not the owner: sellers
       before serving, underwriters before pricing, other owners before hiring.
       A record only its owner can fetch is not a record. */
    "access-control-allow-origin": "*",
  });
  res.end(text);
};

const HEX32 = /^0x[0-9a-fA-F]{64}$/;

export function createReadApi(
  current: () => Ledger,
  /* Optional so a test can build the API without a chain to reconcile
     against. Absent, `/reconcile` says it has not been computed rather than
     saying everything is fine. */
  reconciliation: () => Reconciliation | undefined = () => undefined,
) {
  return createServer((req, res) => {
    const ledger = current();
    const url = new URL(req.url ?? "/", "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean);

    if (req.method !== "GET") {
      return json(res, 405, { error: "the meter is read-only" });
    }

    /* What range this answer covers, on every response. An indexer that does
       not say how far behind it is invites a reader to assume it is current. */
    const range = { chainId: ledger.chainId, fromBlock: ledger.fromBlock, toBlock: ledger.toBlock };

    if (parts.length === 0 || parts[0] === "health") {
      return json(res, 200, {
        ...range,
        nodes: Object.keys(ledger.nodes).length,
        refusals: ledger.refusals.length,
      });
    }

    /* The check that the vault is the only funding source, which existed and
       was reachable by nothing. An operator holding more than the vault
       released to it means money came from outside the tree. */
    if (parts[0] === "reconcile") {
      const report = reconciliation();
      if (!report) return json(res, 503, { ...range, error: "not computed yet" });
      return json(res, 200, report);
    }

    if (parts[0] === "tree" && parts[1]) {
      if (!HEX32.test(parts[1])) return json(res, 400, { error: "a node id is 32 bytes" });
      const nodes = subtree(ledger, parts[1] as Hex);
      if (nodes.length === 0) return json(res, 404, { error: "no such tree in this range", ...range });
      return json(res, 200, {
        ...range,
        funded6: ledger.funded6[parts[1].toLowerCase() as Hex] ?? 0n,
        withdrawn6: ledger.withdrawn6[parts[1].toLowerCase() as Hex] ?? 0n,
        nodes: nodes.map((n) => ({ ...n, topCounterparty: topCounterparty(n) })),
      });
    }

    if (parts[0] === "node" && parts[1]) {
      if (!HEX32.test(parts[1])) return json(res, 400, { error: "a node id is 32 bytes" });
      const conduct = conductOf(ledger, parts[1] as Hex);
      if (!conduct) return json(res, 404, { error: "no such node in this range", ...range });
      return json(res, 200, { ...range, ...conduct });
    }

    /* The public page is addressed by ERC-8004 identity, because that is the
       name the rest of the ecosystem already uses for an agent. */
    if (parts[0] === "agent" && parts[1]) {
      const agentId = BigInt(/^\d+$/.test(parts[1]) ? parts[1] : "0");
      const row = Object.values(ledger.nodes).find((n) => n.agentId === agentId && agentId !== 0n);
      if (!row) return json(res, 404, { error: "no node in this range is bound to that identity", ...range });
      return json(res, 200, { ...range, ...conductOf(ledger, row.node) });
    }

    if (parts[0] === "refusal" && parts[1]) {
      const id = /^\d+$/.test(parts[1]) ? BigInt(parts[1]) : -1n;
      const row = ledger.refusals.find((r) => r.id === id);
      if (!row) return json(res, 404, { error: "no such refusal in this range", ...range });
      return json(res, 200, { ...range, ...row });
    }

    return json(res, 404, {
      error: "no such endpoint",
      endpoints: [
        "GET /health",
        "GET /reconcile",
        "GET /tree/:root",
        "GET /node/:node",
        "GET /agent/:agentId",
        "GET /refusal/:id",
      ],
    });
  });
}
