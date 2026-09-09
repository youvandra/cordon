/**
 * A real chain, real contracts, a real seller.
 *
 * Both the daemon suite and the MCP suite run against this, because two copies
 * of a deployment drift the same way two copies of a figure do — and the point
 * of an end-to-end test is that it is the same end.
 */
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { createServer, type Server } from "node:http";
import { resolve, dirname } from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  createPublicClient, createWalletClient, http, defineChain, parseAbi,
  type Hex, type Address, type PublicClient, type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TreeVaultAbi, MandateRegistryAbi } from "../src/abi.gen.ts";

const here = dirname(fileURLToPath(import.meta.url));
const contracts = resolve(here, "../../contracts");

/* Anvil's first accounts. Public, funded, worthless — they ship with every
   Foundry install, so writing them down here leaks nothing. */
export const OWNER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
export const OP_ROOT_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
export const OP_CHILD_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a" as Hex;

export const SELLER_PAYOUT = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57" as Address;
/** $0.0024 — the AIsa scholar endpoint from Circle's live catalogue. */
export const PRICE = 2_400n;
export const ROOT_BUDGET = 10_000_000n;
export const TRANCHE = 5_000_000n;

export const ERC20 = parseAbi([
  "function mint(address to, uint256 v)",
  "function approve(address s, uint256 v) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
export const GATEWAY = parseAbi([
  "function availableBalance(address token, address depositor) view returns (uint256)",
  "function spendOffChain(address token, address to, uint256 value)",
]);

export interface Harness {
  rpc: string;
  chainId: number;
  publicClient: PublicClient;
  asOwner: WalletClient;
  asOpChild: WalletClient;
  usdc: Address;
  gateway: Address;
  registry: Address;
  vault: Address;
  /** The seat, and the two ERC-8004 registries it writes into. Stand-ins here;
   *  on Arc these are live already at deterministic addresses. */
  record: Address;
  identity: Address;
  reputation: Address;
  root: Hex;
  child: Hex;
  /** A seller that answers 402 in the shape Circle's catalogue uses. */
  sellerUrl: string;
  /** One that asks for more than a tranche, so the contract refuses. */
  greedyUrl: string;
  stop(): Promise<void>;
}

/**
 * An anvil with Cordon's contracts on it, and nothing above them.
 *
 * Extracted so `packages/eval` can build its own tree on the same deployment
 * rather than keeping a second copy of it. What differs between the two is the
 * shape of the tree and who spends — which is the subject of both — so the
 * chain and the contracts are the part that must not fork.
 */
export async function startChain(port: number) {
  execFileSync("forge", ["build"], { cwd: contracts, stdio: "pipe" });

  const rpc = `http://127.0.0.1:${port}`;
  const chain = defineChain({
    id: 31337, name: "anvil",
    nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [rpc] } },
  });

  const anvil: ChildProcess = spawn("anvil", ["--port", String(port), "--silent"], { stdio: "ignore" });
  /* anvil mines instantly, so viem's 4,000ms default spends the whole of a
     test suite waiting for receipts that already exist. */
  const pollingInterval = 50;
  const publicClient = createPublicClient({ chain, transport: http(rpc), pollingInterval });
  for (let i = 0; i < 80; i++) {
    try { await publicClient.getBlockNumber(); break; } catch { await new Promise((r) => setTimeout(r, 200)); }
  }

  const owner = privateKeyToAccount(OWNER_KEY);
  const asOwner = createWalletClient({ account: owner, chain, transport: http(rpc), pollingInterval });

  /* `file` and `name` differ when one source holds several contracts, which
     is why this takes both rather than assuming they match. */
  const deploy = async (name: string, args: unknown[] = [], file = name): Promise<Address> => {
    const out = JSON.parse(readFileSync(resolve(contracts, `out/${file}.sol/${name}.json`), "utf8"));
    const hash = await asOwner.deployContract({
      abi: out.abi, bytecode: out.bytecode.object as Hex, args: args as never,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    return receipt.contractAddress!;
  };

  const usdc = await deploy("MockUSDC");
  const gateway = await deploy("MockGateway");
  const registry = await deploy("MandateRegistry");
  const vault = await deploy("TreeVault", [usdc, registry, gateway]);
  const identity = await deploy("MockIdentityRegistry", [], "MockERC8004");
  const reputation = await deploy("MockReputationRegistry", [], "MockERC8004");
  const record = await deploy("ConductRecord", [vault, identity, reputation]);

  return {
    rpc, chain, publicClient, asOwner, owner,
    usdc, gateway, registry, vault, record, identity, reputation,
    walletFor: (key: Hex) =>
      createWalletClient({ account: privateKeyToAccount(key), chain, transport: http(rpc), pollingInterval }),
    kill: () => { anvil.kill(); },
  };
}

/* Inferred rather than declared: viem binds the chain and the account into the
   wallet client's type, and an interface that says `WalletClient` throws that
   away — every write then has to name `chain: null` to get it back. */
export type Chain = Awaited<ReturnType<typeof startChain>>;

export async function startHarness(port = 8546): Promise<Harness> {
  const world = await startChain(port);
  const { rpc, publicClient, asOwner, owner, usdc, gateway, registry, vault, record, identity, reputation } = world;

  const opRoot = privateKeyToAccount(OP_ROOT_KEY);
  const opChild = privateKeyToAccount(OP_CHILD_KEY);
  const asOpRoot = world.walletFor(OP_ROOT_KEY);
  const asOpChild = world.walletFor(OP_CHILD_KEY);

  /* A lifetime cap high enough that it cannot be the reason a test fails.
     Every mandate carries one, so a harness has to name one; the subject of
     these tests is the window, the tranche and the tree, and the lifetime has
     its own gate in the contract suite. Mirrors `NO_LIFETIME_BOUND` in
     packages/contracts/test/Bounds.sol. */
  const NO_LIFETIME_BOUND = (1n << 128n) - 1n;

  const params = (operator: Address, budget: bigint) => ({
    operator, budget6: budget, lifetimeCap6: NO_LIFETIME_BOUND, windowSeconds: 86_400n,
    trancheCap6: TRANCHE, concentrationBps: 3500, maxDepth: 3,
  });

  let hash = await asOwner.writeContract({
    address: registry, abi: MandateRegistryAbi, functionName: "open",
    args: [params(opRoot.address, ROOT_BUDGET)],
  });
  let receipt = await publicClient.waitForTransactionReceipt({ hash });
  const root = receipt.logs[0].topics[1] as Hex;

  hash = await asOpRoot.writeContract({
    address: registry, abi: MandateRegistryAbi, functionName: "spawn",
    args: [root, params(opChild.address, ROOT_BUDGET)],
  });
  receipt = await publicClient.waitForTransactionReceipt({ hash });
  const child = receipt.logs[0].topics[1] as Hex;

  await asOwner.writeContract({ address: usdc, abi: ERC20, functionName: "mint", args: [owner.address, ROOT_BUDGET] });
  await asOwner.writeContract({ address: usdc, abi: ERC20, functionName: "approve", args: [vault, ROOT_BUDGET] });
  hash = await asOwner.writeContract({
    address: vault, abi: TreeVaultAbi, functionName: "fund", args: [root, ROOT_BUDGET],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  const challenge = (amount: bigint) => JSON.stringify({
    x402Version: 2,
    accepts: [{
      scheme: "exact", network: "eip155:31337", asset: usdc,
      payTo: SELLER_PAYOUT, amount: amount.toString(), maxTimeoutSeconds: 300,
    }],
  });

  const listen = (amount: bigint): Promise<{ server: Server; url: string }> =>
    new Promise((done) => {
      const server = createServer((req, res) => {
        if (!req.headers["payment-signature"]) {
          res.writeHead(402, { "content-type": "application/json" });
          res.end(challenge(amount));
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ answer: "the paid body" }));
      });
      server.listen(0, "127.0.0.1", () =>
        done({ server, url: `http://127.0.0.1:${(server.address() as { port: number }).port}/x` }));
    });

  const cheap = await listen(PRICE);
  const greedy = await listen(TRANCHE + 1n);

  return {
    rpc, chainId: 31337, publicClient, asOwner, asOpChild,
    usdc, gateway, registry, vault, record, identity, reputation, root, child,
    sellerUrl: cheap.url, greedyUrl: greedy.url,
    async stop() {
      world.kill();
      await new Promise<void>((r) => cheap.server.close(() => r()));
      await new Promise<void>((r) => greedy.server.close(() => r()));
    },
  };
}
