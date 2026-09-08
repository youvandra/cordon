/**
 * The settlement, against a real token on a real chain.
 *
 * The rest of the suite stubs the collector, which is right for testing a
 * refusal but proves nothing about being paid. This deploys a token that
 * implements EIP-3009 the way USDC does, signs an authorisation as a payer
 * would, and checks that the money actually moved — and that the domain the
 * endpoint publishes is the one the token verifies against, because a domain
 * that is one character out fails in a way that looks like the payer's fault.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { ATTEST } from "../../fixtures/src/index.ts";
import { Eip3009Collector, resolveDomain, CollectError } from "../src/collect.ts";
import { TRANSFER_WITH_AUTHORIZATION_TYPES, type Authorization, type Payment } from "../src/payment.ts";

const here = dirname(fileURLToPath(import.meta.url));
const contracts = resolve(here, "../../contracts");

/* Anvil's first accounts. Public, funded, worthless. */
const PAYER_KEY = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80" as Hex;
const SUBMITTER_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d" as Hex;
const PAYTO = "0xc0d000000000000000000000000000000000c0d0" as Address;
const PORT = 8548;
const RPC = `http://127.0.0.1:${PORT}`;

const chain = defineChain({
  id: 31337,
  name: "anvil",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: [RPC] } },
});

const ERC20 = parseAbi([
  "function mint(address to, uint256 v)",
  "function balanceOf(address) view returns (uint256)",
]);

const payer = privateKeyToAccount(PAYER_KEY);
let anvil: ChildProcess;
let client: PublicClient;
let token: Address;

before(async () => {
  execFileSync("forge", ["build"], { cwd: contracts, stdio: "pipe" });
  anvil = spawn("anvil", ["--port", String(PORT), "--silent"], { stdio: "ignore" });
  client = createPublicClient({ chain, transport: http(RPC) }) as PublicClient;
  for (let i = 0; i < 80; i++) {
    try {
      await client.getBlockNumber();
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const deployer = createWalletClient({ account: payer, chain, transport: http(RPC) });
  const out = JSON.parse(readFileSync(resolve(contracts, "out/Mock3009.sol/Mock3009.json"), "utf8"));
  const hash = await deployer.deployContract({ abi: out.abi, bytecode: out.bytecode.object as Hex });
  token = (await client.waitForTransactionReceipt({ hash })).contractAddress!;

  const mint = await deployer.writeContract({
    address: token,
    abi: ERC20,
    functionName: "mint",
    args: [payer.address, 1_000_000n],
  });
  await client.waitForTransactionReceipt({ hash: mint });
}, { timeout: 120_000 });

after(() => anvil?.kill());

async function sign(overrides: Partial<Authorization> = {}): Promise<Payment> {
  const now = BigInt((await client.getBlock()).timestamp);
  const authorization: Authorization = {
    from: payer.address,
    to: PAYTO,
    value: ATTEST.price6,
    validAfter: now - 60n,
    validBefore: now + 600n,
    nonce: `0x${Math.floor(Math.random() * 1e15).toString(16).padStart(64, "0")}` as Hex,
    ...overrides,
  };
  const domain = await resolveDomain(client, token, chain.id);
  const signature = await payer.signTypedData({
    domain,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: authorization,
  });
  return {
    x402Version: ATTEST.x402Version,
    scheme: ATTEST.scheme,
    network: `eip155:${chain.id}`,
    asset: token,
    signature,
    authorization,
  };
}

test("the domain the endpoint publishes is the one the token verifies against", async () => {
  const domain = await resolveDomain(client, token, chain.id);
  assert.deepEqual(domain, {
    name: "USD Coin",
    version: "2",
    chainId: chain.id,
    verifyingContract: token,
  });
});

test("a token that cannot verify an authorisation is refused at startup, not at settlement", async () => {
  const out = JSON.parse(readFileSync(resolve(contracts, "out/MockUSDC.sol/MockUSDC.json"), "utf8"));
  const deployer = createWalletClient({ account: payer, chain, transport: http(RPC) });
  const hash = await deployer.deployContract({ abi: out.abi, bytecode: out.bytecode.object as Hex });
  const plain = (await client.waitForTransactionReceipt({ hash })).contractAddress!;

  await assert.rejects(() => resolveDomain(client, plain, chain.id), CollectError);
});

test("a signed authorisation moves the money the payer signed for", async () => {
  const collector = new Eip3009Collector({ rpcUrl: RPC, chain, token, privateKey: SUBMITTER_KEY });
  const payment = await sign();

  const before6 = await client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [PAYTO] });
  const collected = await collector.collect(payment);
  const after6 = await client.readContract({ address: token, abi: ERC20, functionName: "balanceOf", args: [PAYTO] });

  assert.equal(after6 - before6, ATTEST.price6, "the endpoint was paid its price");
  assert.equal(collected.payer, payer.address);
  assert.match(collected.txHash, /^0x[0-9a-f]{64}$/);
});

test("the payer pays no gas, which is why this endpoint can cost a tenth of a cent", async () => {
  const collector = new Eip3009Collector({ rpcUrl: RPC, chain, token, privateKey: SUBMITTER_KEY });
  const before = await client.getBalance({ address: payer.address });
  await collector.collect(await sign());
  const after = await client.getBalance({ address: payer.address });

  assert.equal(after, before, "the submitter paid the gas, as the bearer of the signature");
});

test("the same authorisation cannot be settled twice, whatever this process forgot", async () => {
  const collector = new Eip3009Collector({ rpcUrl: RPC, chain, token, privateKey: SUBMITTER_KEY });
  const payment = await sign();
  await collector.collect(payment);

  /* The nonce map is a courtesy. This is the guard: the token refuses, so a
     replay that gets past a restarted server still collects nothing. */
  await assert.rejects(() => collector.collect(payment), /authorization is used/);
});

test("an authorisation the payer cannot cover is refused before a transaction is sent", async () => {
  const collector = new Eip3009Collector({ rpcUrl: RPC, chain, token, privateKey: SUBMITTER_KEY });
  const payment = await sign({ value: 10_000_000n });
  await assert.rejects(() => collector.collect(payment), CollectError);
});
