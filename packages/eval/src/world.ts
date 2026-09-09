/**
 * One chain, one owner, one task — and two ways of paying for it.
 *
 * The deployment comes from `startChain`, the same one the daemon's end to end
 * suite runs against, so the contracts under both conditions are the contracts
 * that ship. What this file adds is the tree: a root the owner signed and two
 * workers under it, one per section of the brief.
 */
import { parseAbi, type Address, type Hex } from "viem";
import { startChain, type Chain } from "../../daemon/test/harness.ts";
import { MandateRegistryAbi, TreeVaultAbi } from "../../daemon/src/abi.gen.ts";

/* Anvil accounts 3, 4 and 5. Public, funded, worthless. Operators need gas
   because the operator submits the draw, and they hold no USDC by design. */
export const OP_ROOT_KEY = "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6" as Hex;
export const OP_LEFT_KEY = "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a" as Hex;
export const OP_RIGHT_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba" as Hex;
/** Account 6, the one operator a shared cap gives the whole tree. */
export const OP_SHARED_KEY = "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e" as Hex;

export const ERC20 = parseAbi([
  "function mint(address to, uint256 v)",
  "function approve(address s, uint256 v) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
]);
export const GATEWAY = parseAbi([
  "function availableBalance(address token, address depositor) view returns (uint256)",
  "function depositFor(address token, address depositor, uint256 value)",
  "function spendOffChain(address token, address to, uint256 value)",
]);

export type WorkerId = "left" | "right";

export interface Tree {
  root: Hex;
  workers: Record<WorkerId, { node: Hex; key: Hex; operator: Address }>;
}

export interface World extends Chain {
  /** The window the owner signed, and what the whole comparison is scaled to. */
  window6: bigint;
  trancheCap6: bigint;
  tree: Tree;
  /** USDC the owner has put behind the mandate. */
  funded6: bigint;
  /**
   * Roll every window forward by one whole period.
   *
   * Runs of a condition have to be independent, and a window that never rolls
   * makes run 2 inherit run 1's spending — which would read as the fence
   * tightening over time rather than as three measurements of one thing.
   */
  warpWindow(): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Deliberately generous next to the task.
 *
 * The subject here is whether legitimate work completes, so a bound that binds
 * would be measuring something else — G1 and G4 already measure that, with
 * thousands of strategies. A refusal in this run is a defect, not a result,
 * and the numbers are chosen so nothing can excuse one.
 */
export const WINDOW6 = 20_000_000n;
export const TRANCHE6 = 1_000_000n;
export const WINDOW_SECONDS = 86_400n;
/** Never the reason anything is refused here; the lifetime has its own gate. */
const NO_LIFETIME_BOUND = (1n << 128n) - 1n;

/**
 * How much of the root window each worker is given.
 *
 * `10_000` is the whole of it, which is the delegation a shared cap cannot
 * express: either worker may spend everything and between them they still may
 * not. A narrower share is the shape that matters when one worker misbehaves,
 * because then the bound that saves the other worker is its sibling's, not the
 * root's.
 */
export async function startWorld(port: number, workerShareBps = 10_000): Promise<World> {
  const chain = await startChain(port);
  const { publicClient, asOwner, owner, usdc, registry, vault } = chain;

  const params = (operator: Address, budget6: bigint) => ({
    operator,
    budget6,
    lifetimeCap6: NO_LIFETIME_BOUND,
    windowSeconds: WINDOW_SECONDS,
    trancheCap6: TRANCHE6,
    concentrationBps: 3500,
    maxDepth: 3,
  });

  const opRoot = chain.walletFor(OP_ROOT_KEY);
  const opLeft = chain.walletFor(OP_LEFT_KEY);
  const opRight = chain.walletFor(OP_RIGHT_KEY);

  let hash = await asOwner.writeContract({
    address: registry, abi: MandateRegistryAbi, functionName: "open",
    args: [params(opRoot.account.address, WINDOW6)],
  });
  let receipt = await publicClient.waitForTransactionReceipt({ hash });
  const root = receipt.logs[0].topics[1] as Hex;

  const workerWindow6 = (WINDOW6 * BigInt(workerShareBps)) / 10_000n;
  const spawn = async (operator: Address): Promise<Hex> => {
    const h = await opRoot.writeContract({
      address: registry, abi: MandateRegistryAbi, functionName: "spawn",
      args: [root, params(operator, workerWindow6)],
    });
    const r = await publicClient.waitForTransactionReceipt({ hash: h });
    return r.logs[0].topics[1] as Hex;
  };

  const left = await spawn(opLeft.account.address);
  const right = await spawn(opRight.account.address);

  /* Funded for every run the comparison will make, and minted well past that,
     so `vault-balance` can never be the reason a draw is refused. The subject
     is the bounds; a treasury that ran dry would be measuring the harness. */
  const funded6 = WINDOW6 * 8n;
  await asOwner.writeContract({ address: usdc, abi: ERC20, functionName: "mint", args: [owner.address, funded6 * 4n] });
  await asOwner.writeContract({ address: usdc, abi: ERC20, functionName: "approve", args: [vault, funded6] });
  hash = await asOwner.writeContract({
    address: vault, abi: TreeVaultAbi, functionName: "fund", args: [root, funded6],
  });
  await publicClient.waitForTransactionReceipt({ hash });

  return {
    ...chain,
    window6: WINDOW6,
    trancheCap6: TRANCHE6,
    funded6,
    tree: {
      root,
      workers: {
        left: { node: left, key: OP_LEFT_KEY, operator: opLeft.account.address },
        right: { node: right, key: OP_RIGHT_KEY, operator: opRight.account.address },
      },
    },
    async warpWindow() {
      await publicClient.request({
        method: "evm_increaseTime" as never,
        params: [Number(WINDOW_SECONDS) + 1] as never,
      });
      await publicClient.request({ method: "evm_mine" as never, params: [] as never });
    },
    async stop() { chain.kill(); },
  };
}
