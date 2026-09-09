/**
 * The two ways of paying for the same task.
 *
 * A. **Cordon.** Nothing leaves the vault until a purchase has been evaluated.
 *    The worker holds no key; the daemon does, and the contract decides.
 * B. **A plain shared cap.** The owner releases the cap up front into one
 *    balance, hands one operator to the whole tree, and the limit is a counter
 *    in the code that spends. This is not a straw man — it is what an agent
 *    stack does today, and it completes the same work.
 *
 * The measurable difference is not the outcome of a purchase. Both conditions
 * buy the same four facts. It is *when the money leaves the owner*, and what
 * exists afterwards to point at.
 */
import type { Address, Hex } from "viem";
import { load } from "../../daemon/src/config.ts";
import { Gate } from "../../daemon/src/gate.ts";
import { cordonFetch, type Transport } from "../../daemon/src/fetch.ts";
import type { Settler, Payment, Settlement } from "../../daemon/src/settle.ts";
import { GATEWAY, ERC20, type World, type WorkerId, OP_SHARED_KEY } from "./world.ts";

export interface Purchase {
  ok: boolean;
  body?: string;
  /** The payee the seller declared. A string, in the seller's own format,
      because that is what the daemon reads and what the contract is given. */
  paidTo?: string;
  amount6: bigint;
  /** Set when a purchase did not happen. In condition A, the contract's own. */
  refusedBy?: string;
  /** Transactions this one purchase cost. The price of the fence, counted. */
  chainWrites: number;
  ms: number;
}

export interface Buyer {
  id: "cordon" | "shared-cap";
  /**
   * USDC out of the owner's hands before a single line of work was done.
   *
   * Zero under Cordon and the whole cap under a shared balance, and it is a
   * property of the design rather than a result of this run.
   */
  exposureAtStart6: bigint;
  buy(worker: WorkerId, url: string): Promise<Purchase>;
  stop(): Promise<void>;
}

const transport: Transport = async (url, init) => {
  const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body });
  return { status: r.status, headers: {}, body: await r.json() };
};

function fact(body: unknown): string | undefined {
  return typeof body === "object" && body !== null && "fact" in body
    ? String((body as { fact: unknown }).fact)
    : undefined;
}

/**
 * Condition A.
 *
 * The settler stands in for Circle exactly as the daemon's own suite does: it
 * spends the Gateway balance off chain, with no contract in the path, because
 * that is what a real depositor can do and pretending otherwise would let this
 * run assert a guarantee the product does not give.
 */
export function cordonBuyer(world: World): Buyer {
  const gates: Partial<Record<WorkerId, Gate>> = {};

  for (const id of ["left", "right"] as WorkerId[]) {
    const worker = world.tree.workers[id];
    const label = id.toUpperCase();
    process.env[`CORDON_KEY_${label}`] = worker.key;
    gates[id] = new Gate(load({
      CORDON_RPC: world.rpc,
      CORDON_CHAIN_ID: "31337",
      CORDON_VAULT: world.vault,
      CORDON_REGISTRY: world.registry,
      CORDON_USDC: world.usdc,
      CORDON_NETWORKS: "eip155:31337",
      /* anvil mines instantly; the default spends four seconds per draw. */
      CORDON_POLL_MS: "50",
      CORDON_ASSETS: world.usdc,
      [`CORDON_NODE_${label}`]: worker.node,
      [`CORDON_KEY_${label}`]: worker.key,
    } as NodeJS.ProcessEnv));
  }

  const settlerFor = (id: WorkerId): Settler => ({
    async settle(_node: Hex, payment: Payment): Promise<Settlement> {
      const wallet = world.walletFor(world.tree.workers[id].key);
      const hash = await wallet.writeContract({
        address: world.gateway, abi: GATEWAY, functionName: "spendOffChain",
        args: [payment.asset, payment.to, payment.value],
      });
      await world.publicClient.waitForTransactionReceipt({ hash });
      return { proof: `local:${hash}`, txHash: hash };
    },
  });

  return {
    id: "cordon",
    exposureAtStart6: 0n,
    async buy(worker, url) {
      const started = Date.now();
      const result = await cordonFetch(
        { node: world.tree.workers[worker].node, url },
        {
          gate: gates[worker]!,
          settler: settlerFor(worker),
          transport,
          acceptable: { networks: ["eip155:31337"], assets: [world.usdc] },
        },
      );
      const ms = Date.now() - started;

      if (result.paid) {
        return {
          ok: true, body: fact(result.body), paidTo: result.offer.payTo,
          amount6: result.offer.amount, chainWrites: 2, ms,
        };
      }
      if (!result.free) {
        /* The draw was simulated and refused, so it cost no gas and no
           transaction. A refusal here is a defect of the product, not a
           result, and the run reports it as one. */
        return {
          ok: false, amount6: result.offer.amount,
          refusedBy: result.refusal.reason, chainWrites: 0, ms,
        };
      }
      return { ok: false, amount6: 0n, refusedBy: "seller-asked-for-nothing", chainWrites: 0, ms };
    },
    async stop() {},
  };
}

/**
 * Condition B.
 *
 * The cap is `remaining6`, a number in this process. Nothing on chain knows
 * about it, nothing writes it down, and the only reason it holds is that the
 * code checks it — which is the honest description of every shared allowance
 * an agent stack ships with today.
 */
export async function sharedCapBuyer(world: World, cap6: bigint): Promise<Buyer> {
  const shared = world.walletFor(OP_SHARED_KEY);

  await world.asOwner.writeContract({
    address: world.usdc, abi: ERC20, functionName: "approve", args: [world.gateway, cap6],
  });
  const funding = await world.asOwner.writeContract({
    address: world.gateway, abi: GATEWAY, functionName: "depositFor",
    args: [world.usdc, shared.account.address, cap6],
  });
  await world.publicClient.waitForTransactionReceipt({ hash: funding });

  let remaining6 = cap6;

  return {
    id: "shared-cap",
    exposureAtStart6: cap6,
    async buy(_worker, url) {
      const started = Date.now();
      const challenged = await fetch(url);
      const body = await challenged.json() as { accepts?: { payTo: Address; amount: string }[] };
      const offer = body.accepts?.[0];
      if (!offer) return { ok: false, amount6: 0n, refusedBy: "seller-asked-for-nothing", chainWrites: 0, ms: Date.now() - started };

      const amount6 = BigInt(offer.amount);
      if (amount6 > remaining6) {
        return { ok: false, amount6, refusedBy: "shared-cap", chainWrites: 0, ms: Date.now() - started };
      }

      const hash = await shared.writeContract({
        address: world.gateway, abi: GATEWAY, functionName: "spendOffChain",
        args: [world.usdc, offer.payTo, amount6],
      });
      await world.publicClient.waitForTransactionReceipt({ hash });
      remaining6 -= amount6;

      const answered = await fetch(url, { headers: { "payment-signature": `local:${hash}` } });
      const paid = await answered.json();
      return {
        ok: true, body: fact(paid), paidTo: offer.payTo, amount6,
        chainWrites: 1, ms: Date.now() - started,
      };
    },
    async stop() {},
  };
}
