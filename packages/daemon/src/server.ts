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
import { timingSafeEqual } from "node:crypto";
import type { Hex } from "viem";
import { generatePrivateKey } from "viem/accounts";
import { SpawnRefused } from "./gate.ts";
import type { Gate } from "./gate.ts";
import type { Settler } from "./settle.ts";
import { cordonFetch, httpTransport, type Transport } from "./fetch.ts";
import type { Acceptable } from "./challenge.ts";
import { cleanPurpose, type KeyFile } from "./keyfile.ts";
import type { ReleasedPurchases } from "./released.ts";

export interface ServerDeps {
  gate: Gate;
  settler: Settler;
  acceptable: Acceptable;
  transport?: Transport;
  /** Overridden only by a test that needs a key it can predict. */
  newOperatorKey?: () => Hex;
  /** Where a spawned child's key is written before the spawn is sent. Without
   *  one, the key lives only in this process and dies with it. */
  keyFile?: KeyFile;
  /** Refusals the owner released, spent before a draw is asked for. */
  released?: ReleasedPurchases;
  /** The shared secret every request must carry. Absent means loopback only,
   *  which `config.load` is what actually enforces. */
  token?: string;
}

/**
 * Whether a request carries the token, compared in constant time.
 *
 * A byte-by-byte comparison that returns early tells a caller how much of the
 * token it guessed, which over enough requests is the token. `timingSafeEqual`
 * needs equal lengths, so the length is checked first — that leaks the length
 * and nothing else, which is a fact about the token nobody had to guess.
 */
function carriesToken(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) return false;
  const offered = Buffer.from(header.slice("Bearer ".length));
  const expected = Buffer.from(token);
  return offered.length === expected.length && timingSafeEqual(offered, expected);
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
      /* Before the route, before the body is read. Every endpoint here either
         spends money or describes a tree that says where the money is, so
         there is no surface worth answering unauthenticated. */
      if (deps.token && !carriesToken(req, deps.token)) {
        return json(res, 401, { error: "a bearer token is required" });
      }

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
          { gate: deps.gate, settler: deps.settler, acceptable: deps.acceptable, transport, released: deps.released },
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
        /* Checked before a key exists, so a purpose that is refused leaves
           nothing behind. */
        let purpose: string | undefined;
        try {
          purpose = cleanPurpose(body.purpose);
        } catch (error) {
          return json(res, 400, { error: (error as Error).message });
        }
        /* Every bound the contract will not accept as zero, checked here.
           These used to be `?? 0`, and zero is the one value each of them
           rejects — so a body missing `concentrationBps` generated a key,
           wrote it to the key file, sent the transaction and came back with
           seven hundred characters of `ConcentrationOutOfRange(0)` and a
           contract-call trace. Zero is not "unlimited" for any of them, and a
           caller who left one out should be told which. */
        const bound = (name: string, raw: unknown): bigint | { error: string } => {
          if (raw === undefined) return { error: `${name} is required; zero is not unlimited and the contract refuses it` };
          let value: bigint;
          try {
            value = BigInt(String(raw));
          } catch {
            return { error: `${name} is not a whole number of base units: ${String(raw)}` };
          }
          return value <= 0n ? { error: `${name} must be more than zero` } : value;
        };
        const budget6 = bound("budget6", body.budget6);
        if (typeof budget6 === "object") return json(res, 400, budget6);
        const trancheCap6 = bound("trancheCap6", body.trancheCap6);
        if (typeof trancheCap6 === "object") return json(res, 400, trancheCap6);
        let lifetimeCap6: bigint | undefined;
        if (body.lifetimeCap6 !== undefined) {
          const checked = bound("lifetimeCap6", body.lifetimeCap6);
          if (typeof checked === "object") return json(res, 400, checked);
          lifetimeCap6 = checked;
        }
        const concentrationBps = Number(body.concentrationBps);
        if (!Number.isInteger(concentrationBps) || concentrationBps < 1 || concentrationBps > 10_000) {
          return json(res, 400, {
            error: "concentrationBps is required: a whole number of basis points from 1 to 10000",
            why: "the share of a window any one counterparty may take. 10000 is all of it; zero is refused by the contract",
          });
        }
        const secret = newKey();
        const operator = deps.gate.addOperator(secret);
        /* Written down before the registry is asked. The mandate will name this
           address as its operator for good, and a key that exists only in this
           process is a child nobody can sign for after a restart. If this write
           fails, nothing has been sent. */
        const label = deps.keyFile?.remember(secret, operator, purpose);
        let spawned;
        try {
          spawned = await deps.gate.spawn(body.node as Hex, {
            operator,
            budget6,
            /* Omitted means the parent's total, not none: the gate resolves it
               from the chain rather than sending a zero the contract refuses. */
            lifetimeCap6,
            trancheCap6,
            concentrationBps,
            purpose,
          });
        } catch (error) {
          /* Only a refusal takes the key back. The registry said no before
             anything was broadcast, so nothing on chain names this address and
             nothing ever will — and left in the file it is a label whose node
             id can never be filled, indistinguishable from a child still being
             born. Every other failure keeps the key: a connection dropped
             while waiting for a receipt is not a spawn that did not happen,
             and a key discarded on that reading is a live mandate nobody can
             operate again. */
          const refused = error instanceof SpawnRefused;
          if (refused && label) deps.keyFile?.forget(label);
          return json(res, refused ? 400 : 502, {
            error: (error as Error).message,
            ...(label ? { keyDiscarded: refused, ...(refused ? {} : { label }) } : {}),
            ...(refused
              ? {}
              : { why: "this may still have landed; the child's key is kept under its label" }),
          });
        }
        /* The node id beside the key it belongs to. A failure here leaves the
           key safe and the id missing, which is recoverable, so it is reported
           rather than thrown over a spawn that already landed. */
        let nodeIdSaved = false;
        if (deps.keyFile && label) {
          try {
            deps.keyFile.bind(label, spawned.node);
            nodeIdSaved = true;
          } catch {
            nodeIdSaved = false;
          }
        }
        /* What the caller has to do next, said here rather than left in this
           process's stderr.
           
           `spawn` generates the child's operator key, and a key generated a
           second ago holds no gas — so `enrol` cannot send, the child gets no
           ERC-8004 identity, its purpose is never written, and later its
           refusals are enforced on chain and rejected by `attest` with
           `NodeNotBound`. Every one of those read as a `200` with a `false` in
           it. The operator needs gas, and the sentence saying so belongs in
           the answer. */
        const needsGas = spawned.enrolled === false || (purpose ? spawned.purposePublished === false : false);
        return json(res, 200, {
          ...spawned,
          operator,
          ...(purpose ? { purpose } : {}),
          ...(label ? { label, nodeIdSaved } : {}),
          ...(needsGas
            ? {
                operatorNeedsGas: true,
                next: `send gas to ${operator}, then restart the daemon: it enrols on start and publishes any purpose this key file remembers`,
              }
            : {}),
        });
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
