/**
 * The daemon's surface. Three endpoints, and the absences are the argument.
 *
 * There is no transfer endpoint, and there will not be one. An agent cannot
 * express "send money to X" here — only "fetch this URL", after which the
 * recipient comes from the seller's own 402 and the amount comes from the
 * seller's own price. A general transfer endpoint would leak the whole claim,
 * so the tool list is part of the fence rather than a matter of convenience.
 *
 * The plan also listed `POST /draw { node, amount }`, a bare tranche. It is
 * gone, and its absence is an improvement: since a draw must now declare the
 * counterparty it is for, a draw with no purchase behind it is exactly the
 * unattributed tranche this design exists to remove.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import type { Gate } from "./gate.ts";
import type { Settler } from "./settle.ts";
import { cordonFetch, httpTransport, type Transport } from "./fetch.ts";
import type { Acceptable } from "./challenge.ts";

export interface ServerDeps {
  gate: Gate;
  settler: Settler;
  acceptable: Acceptable;
  transport?: Transport;
  /** Overridden only by a test that needs a key it can predict. */
  newOperatorKey?: () => Hex;
}

const json = (res: ServerResponse, status: number, body: unknown) => {
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  res.writeHead(status, { "content-type": "application/json" });
  res.end(text);
};

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    /* An agent is a program, and a program with a bug can stream forever. */
    if (size > 1_000_000) throw new Error("request body is too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createDaemon(deps: ServerDeps) {
  const transport = deps.transport ?? httpTransport;
  const newKey = deps.newOperatorKey ?? generatePrivateKey;

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");

      if (req.method === "GET" && url.pathname === "/status") {
        const nodes = await Promise.all(
          deps.gate.nodes().map(async (node) => {
            const [headroom, mandate] = await Promise.all([
              deps.gate.headroom(node),
              deps.gate.mandate(node),
            ]);
            return { node, headroom, mandate };
          }),
        );
        return json(res, 200, { nodes });
      }

      if (req.method === "POST" && url.pathname === "/fetch") {
        const body = await readBody(req);
        if (typeof body.node !== "string" || typeof body.url !== "string") {
          return json(res, 400, { error: "node and url are required" });
        }
        const result = await cordonFetch(
          {
            node: body.node as Hex,
            url: body.url,
            method: typeof body.method === "string" ? body.method : undefined,
            headers: (body.headers as Record<string, string>) ?? undefined,
            body: typeof body.body === "string" ? body.body : undefined,
          },
          { gate: deps.gate, settler: deps.settler, acceptable: deps.acceptable, transport },
        );
        /* A refusal is a 200 with a refusal in it, not an HTTP error. The agent
           asked a valid question and got a real answer: no. */
        return json(res, 200, result);
      }

      if (req.method === "POST" && url.pathname === "/spawn") {
        const body = await readBody(req);
        if (typeof body.node !== "string") {
          return json(res, 400, { error: "node is required" });
        }
        /* The child's operator is not the caller's to choose. An address the
           caller names is an address whose key this daemon does not hold, and
           a node whose key nobody here holds can neither draw nor be stopped
           from holding money that never came from this tree — which is what
           the hostile drill did, twice, with addresses that already had a
           Gateway balance. The key is generated here and never leaves. */
        if (body.operator !== undefined) {
          return json(res, 400, {
            error: "operator is not accepted: this daemon holds the child's key",
            why: "a node this daemon holds no key for can be funded from outside the tree",
          });
        }
        const operator = deps.gate.addOperator(newKey());
        const spawned = await deps.gate.spawn(body.node as Hex, {
          operator,
          budget6: BigInt(String(body.budget6 ?? "0")),
          /* Omitted means the parent's total, not none: the gate resolves it
             from the chain rather than sending a zero the contract refuses. */
          lifetimeCap6: body.lifetimeCap6 === undefined ? undefined : BigInt(String(body.lifetimeCap6)),
          trancheCap6: BigInt(String(body.trancheCap6 ?? "0")),
          concentrationBps: Number(body.concentrationBps ?? 0),
        });
        /* The address is public; the key it came from is not returned, not
           logged and not written down. */
        return json(res, 200, { ...spawned, operator });
      }

      return json(res, 404, {
        error: "no such endpoint",
        endpoints: ["GET /status", "POST /fetch", "POST /spawn"],
        absent: "there is no transfer endpoint, and there will not be one",
      });
    } catch (error) {
      return json(res, 500, { error: (error as Error).message });
    }
  });
}
