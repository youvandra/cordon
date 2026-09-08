import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, createWalletClient, http, defineChain, parseAbi, type Hex, type Address,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { load } from "../src/config.ts";
import { Gate } from "../src/gate.ts";
import { cordonFetch, type Transport } from "../src/fetch.ts";
import { createDaemon } from "../src/server.ts";
import type { Settler, Payment, Settlement } from "../src/settle.ts";
import { TreeVaultAbi, MandateRegistryAbi } from "../src/abi.gen.ts";

/**
 * The claim, end to end: an agent that holds no key pays a seller through the
 * daemon, and the same agent is refused when the tree is out of room.
 *
 * Everything here is real except Circle: real contracts on a real chain, real
 * operator keys, a real HTTP seller answering a real 402. The one thing stood
 * in for is Gateway settlement, and the stand-in is honest about being one.
 */

const here = dirname(fileURLToPath(import.meta.url));
const contracts = resolve(here, "../../contracts");

/* Anvil's first accounts. Public, funded, and worthless — they exist in every
   Foundry install and are safe to write down. */
const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const OP_ROOT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const OP_CHILD_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;

const RPC = "http://127.0.0.1:8546";
const chain = defineChain({
  id: 31337, name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ERC20 = parseAbi([
  "function mint(address to, uint256 v)",
  "function approve(address s, uint256 v) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
const GATEWAY = parseAbi([
  "function availableBalance(address token, address depositor) view returns (uint256)",
  "function spendOffChain(address token, address to, uint256 value)",
]);

let anvil: ChildProcess;
let seller: Server;
let sellerUrl: string;
let sellerCalls: { paid: boolean }[] = [];

let usdc: Address, gatewayAddr: Address, registry: Address, vault: Address;
let root: Hex, child: Hex;

const owner = privateKeyToAccount(OWNER_KEY);
const opRoot = privateKeyToAccount(OP_ROOT_KEY);
const opChild = privateKeyToAccount(OP_CHILD_KEY);

const publicClient = createPublicClient({ chain, transport: http(RPC) });
const asOwner = createWalletClient({ account: owner, chain, transport: http(RPC) });
const asOpChild = createWalletClient({ account: opChild, chain, transport: http(RPC) });

const SELLER_PAYOUT = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57" as Address;
const PRICE = 2_400n; // $0.0024, the AIsa scholar endpoint from the catalogue

/** Deploy from the forge artifact, so the bytecode under test is the one built. */
async function deploy(name: string, args: unknown[] = []): Promise<Address> {
  const out = JSON.parse(
    execFileSync("cat", [resolve(contracts, `out/${name}.sol/${name}.json`)], { encoding: "utf8" }),
  );
  const hash = await asOwner.deployContract({
    abi: out.abi, bytecode: out.bytecode.object as Hex, args: args as never,
  });
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  return receipt.contractAddress!;
}

before(async () => {
  execFileSync("forge", ["build"], { cwd: contracts, stdio: "pipe" });

  anvil = spawn("anvil", ["--port", "8546", "--silent"], { stdio: "ignore" });
  for (let i = 0; i < 60; i++) {
    try { await publicClient.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }

  usdc = await deploy("MockUSDC");
  gatewayAddr = await deploy("MockGateway");
  registry = await deploy("MandateRegistry");
  vault = await deploy("TreeVault", [usdc, registry, gatewayAddr]);

  // A $10 root, $5 tranche, 35% concentration, one level of children.
  const params = (operator: Address, budget: bigint) => ({
    operator, budget6: budget, windowSeconds: 86_400n,
    trancheCap6: 5_000_000n, concentrationBps: 3500, maxDepth: 3,
  });

  let hash = await asOwner.writeContract({
    address: registry, abi: MandateRegistryAbi, functionName: "open",
    args: [params(opRoot.address, 10_000_000n)],
  });
  let receipt = await publicClient.waitForTransactionReceipt({ hash });
  root = receipt.logs[0].topics[1] as Hex;

  const asOpRoot = createWalletClient({ account: opRoot, chain, transport: http(RPC) });
  hash = await asOpRoot.writeContract({
    address: registry, abi: MandateRegistryAbi, functionName: "spawn",
    args: [root, params(opChild.address, 10_000_000n)],
  });
  receipt = await publicClient.waitForTransactionReceipt({ hash });
  child = receipt.logs[0].topics[1] as Hex;

  await asOwner.writeContract({ address: usdc, abi: ERC20, functionName: "mint", args: [owner.address, 10_000_000n] });
  await asOwner.writeContract({ address: usdc, abi: ERC20, functionName: "approve", args: [vault, 10_000_000n] });
  hash = await asOwner.writeContract({
    address: vault, abi: TreeVaultAbi, functionName: "fund", args: [root, 10_000_000n],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  // A seller that actually answers 402, in the shape Circle's catalogue uses.
  seller = createServer((req, res) => {
    const paid = Boolean(req.headers["payment-signature"]);
    sellerCalls.push({ paid });
    if (!paid) {
      res.writeHead(402, { "content-type": "application/json" });
      res.end(JSON.stringify({
        x402Version: 2,
        accepts: [{
          scheme: "exact", network: "eip155:31337", asset: usdc,
          payTo: SELLER_PAYOUT, amount: PRICE.toString(), maxTimeoutSeconds: 300,
        }],
      }));
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ answer: "the paid body" }));
  });
  await new Promise<void>((r) => seller.listen(0, "127.0.0.1", r));
  sellerUrl = `http://127.0.0.1:${(seller.address() as { port: number }).port}/scholar`;
});

after(async () => {
  anvil?.kill();
  await new Promise<void>((r) => seller?.close(() => r()));
});

/** Spends the Gateway balance the way its depositor really can: off chain,
 *  unasked, with no contract in the path. Named for what it is. */
class LocalSettler implements Settler {
  async settle(node: Hex, payment: Payment): Promise<Settlement> {
    const wallet = node === child ? asOpChild : asOwner;
    const hash = await wallet.writeContract({
      address: gatewayAddr, abi: GATEWAY, functionName: "spendOffChain",
      args: [payment.asset, payment.to, payment.value],
    });
    await publicClient.waitForTransactionReceipt({ hash });
    return { proof: `local:${hash}`, txHash: hash };
  }
}

function makeGate(): Gate {
  const env = {
    CORDON_RPC: RPC, CORDON_CHAIN_ID: "31337",
    CORDON_VAULT: vault, CORDON_REGISTRY: registry, CORDON_USDC: usdc,
    CORDON_NETWORKS: "eip155:31337", CORDON_ASSETS: usdc,
    CORDON_NODE_CHILD: child, CORDON_KEY_CHILD: OP_CHILD_KEY,
  } as NodeJS.ProcessEnv;
  process.env.CORDON_KEY_CHILD = OP_CHILD_KEY;
  return new Gate(load(env));
}

const transport: Transport = async (url, init) => {
  const r = await fetch(url, { method: init.method, headers: init.headers, body: init.body });
  return { status: r.status, headers: {}, body: await r.json() };
};

test("an agent with no key pays a seller through the daemon", async () => {
  const gate = makeGate();
  const before = await publicClient.readContract({
    address: usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
  });

  const result = await cordonFetch(
    { node: child, url: sellerUrl },
    { gate, settler: new LocalSettler(), transport,
      acceptable: { networks: ["eip155:31337"], assets: [usdc] } },
  );

  assert.equal(result.paid, true);
  assert.deepEqual((result as { body: unknown }).body, { answer: "the paid body" });

  const after = await publicClient.readContract({
    address: usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
  });
  assert.equal(after - (before as bigint), PRICE, "the seller was paid exactly its own price");

  // The agent named no recipient. The seller did, in its own 402.
  assert.equal((result as { offer: { payTo: string } }).offer.payTo, SELLER_PAYOUT);

  // And the tree paid for it, at every level.
  const rootSpent = await publicClient.readContract({
    address: vault, abi: TreeVaultAbi, functionName: "windowSpent", args: [root],
  });
  assert.equal(rootSpent, PRICE, "the root was debited by a purchase two levels down");
});

test("the daemon holds a key for its own node and no other", async () => {
  const gate = makeGate();
  assert.deepEqual(gate.nodes(), [child.toLowerCase()]);
  await assert.rejects(() => gate.draw(root, SELLER_PAYOUT, PRICE), /holds no key/);
});

test("a seller asking past the tranche cap is refused, and nothing is paid", async () => {
  const gate = makeGate();
  const greedy = createServer((_req, res) => {
    res.writeHead(402, { "content-type": "application/json" });
    res.end(JSON.stringify({
      x402Version: 2,
      accepts: [{ scheme: "exact", network: "eip155:31337", asset: usdc,
        payTo: SELLER_PAYOUT, amount: "6000000" }],
    }));
  });
  await new Promise<void>((r) => greedy.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${(greedy.address() as { port: number }).port}/expensive`;

  const before = await publicClient.readContract({
    address: usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
  });

  const result = await cordonFetch(
    { node: child, url },
    { gate, settler: new LocalSettler(), transport,
      acceptable: { networks: ["eip155:31337"], assets: [usdc] } },
  );

  assert.equal(result.paid, false);
  const refusal = (result as { refusal: { reason: string; refusalId?: bigint } }).refusal;
  assert.equal(refusal.reason, "tranche-cap");
  assert.ok(refusal.refusalId! > 0n, "and it is on the record");

  const after = await publicClient.readContract({
    address: usdc, abi: ERC20, functionName: "balanceOf", args: [SELLER_PAYOUT],
  });
  assert.equal(after, before, "the seller got nothing");
  await new Promise<void>((r) => greedy.close(() => r()));
});

test("headroom the daemon reports is the tightest limit above it", async () => {
  const gate = makeGate();
  const { available, boundBy } = await gate.headroom(child);
  const rootSpent = await publicClient.readContract({
    address: vault, abi: TreeVaultAbi, functionName: "windowSpent", args: [root],
  }) as bigint;

  assert.equal(available, 10_000_000n - rootSpent);
  assert.ok(boundBy === root || boundBy === child);
});


test("the daemon serves fetch, status and spawn — and no way to transfer", async () => {
  const gate = makeGate();
  const daemon = createDaemon({
    gate, settler: new LocalSettler(), transport,
    acceptable: { networks: ["eip155:31337"], assets: [usdc] },
  });
  await new Promise<void>((r) => daemon.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${(daemon.address() as { port: number }).port}`;

  const status = (await (await fetch(`${base}/status`)).json()) as {
    nodes: { headroom: { available: string } }[];
  };
  assert.equal(status.nodes.length, 1, "it reports only the node it holds a key for");
  assert.ok(BigInt(status.nodes[0].headroom.available) > 0n);

  const paid = (await (await fetch(`${base}/fetch`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ node: child, url: sellerUrl }),
  })).json()) as { paid: boolean };
  assert.equal(paid.paid, true, "an agent gets its body by asking for a URL");

  /* The absences. An agent that wants to move money has no way to say so. */
  for (const path of ["/transfer", "/pay", "/send", "/draw"]) {
    const res = await fetch(`${base}${path}`, { method: "POST", body: "{}" });
    assert.equal(res.status, 404, `${path} must not exist`);
    const body = (await res.json()) as { absent: string };
    assert.match(body.absent, /no transfer endpoint/);
  }

  await new Promise<void>((r) => daemon.close(() => r()));
});
