/**
 * What the daemon needs to run, and where it refuses to start.
 *
 * A misconfigured daemon that starts anyway is worse than one that does not:
 * it holds a key. So every value is checked here, once, and the process exits
 * rather than discovering a missing address halfway through a payment.
 */
/* A relative path rather than an alias: this package runs under plain node,
   where a tsconfig `paths` entry does not exist and a bundler is not involved.
   One import, resolved the same way at build time and at run time. */
import { homedir } from "node:os";
import { join } from "node:path";
import { ARC, ERC8004 } from "../../fixtures/src/index.ts";

export interface NodeKey {
  /** The mandate node this key is the operator of. */
  node: `0x${string}`;
  /** Where the private key comes from. Never the value itself. */
  keyEnv: string;
}

export interface Config {
  rpcUrl: string;
  chainId: number;
  vault: `0x${string}`;
  registry: `0x${string}`;
  usdc: `0x${string}`;
  /** The seat. Absent means this daemon publishes nothing, and says so. */
  record?: `0x${string}`;
  /** ERC-8004 Identity. Live on Arc already; overridable for a local chain. */
  identity: `0x${string}`;
  /** CAIP-2 networks and assets this daemon will settle on. */
  networks: string[];
  assets: string[];
  port: number;
  /**
   * The interface to listen on. Loopback unless told otherwise.
   *
   * This process holds the only keys in the system and its endpoints spend
   * money, so a default of 0.0.0.0 puts the wallet on the public internet the
   * moment the box has an open port. `attest` and `meter` already default to
   * loopback; this one did not, and it is the only one of the three that can
   * pay somebody.
   */
  bind: string;
  /**
   * A shared secret every request must carry, or nothing.
   *
   * Optional on loopback, where the operating system is the boundary, and
   * required the moment `bind` is anything else — see `load`. A daemon exposed
   * to a network without one is a wallet anyone who can route to it may spend.
   */
  token?: string;
  /**
   * How often to poll for a receipt, in milliseconds.
   *
   * viem's default is 4,000, which is written for chains where a block is
   * minutes away. Arc has sub-second deterministic finality, so that default
   * spends up to four seconds per purchase waiting for something that already
   * happened — on a path this project argues should add no latency.
   */
  pollMs: number;
  keys: NodeKey[];
  /** Where a key minted at run time by a spawn is written, before the spawn is sent. */
  keyFile: string;
}

class ConfigError extends Error {}

/**
 * Whether an address keeps the daemon on this machine.
 *
 * `::` and `0.0.0.0` are the wildcards and are the case this exists to catch;
 * everything else that is not a loopback address is some specific interface,
 * which is still off-machine. Anything unparseable is treated as exposed,
 * because the safe direction here is to ask for a token that was not needed.
 */
function isLoopback(bind: string): boolean {
  const host = bind.trim().replace(/^\[|\]$/g, "").toLowerCase();
  return host === "localhost" || host === "::1" || /^127\./.test(host);
}

/**
 * What the daemon reads, declared once.
 *
 * `load` uses this, and so does the config block the website tells people to
 * paste. Two config blocks were written by hand before this existed and both
 * named variables no code has ever read — a reader could copy either and watch
 * it fail. A variable added to `load` and not to this list will show up
 * missing at startup, which is the direction that fails safely.
 */
export const ENV = {
  required: {
    CORDON_VAULT: "TreeVault address, from deployments/<chainId>.json",
    CORDON_REGISTRY: "MandateRegistry address, from the same file",
    "CORDON_NODE_<label>": "the mandate node this daemon acts for",
    "CORDON_KEY_<label>": "the operator key for that node. The agent never sees it",
  },
  optional: {
    CORDON_RECORD: "ConductRecord, from deployments/<chainId>.json. Without it, refusals are enforced but never published",
    CORDON_IDENTITY: `ERC-8004 Identity; defaults to ${ERC8004.identity}`,
    CORDON_RPC: `defaults to ${ARC.rpc}`,
    CORDON_CHAIN_ID: `defaults to ${ARC.chainId}`,
    CORDON_USDC: "the 6-decimal ERC-20 view; defaults to Arc's",
    CORDON_NETWORKS: "CAIP-2 ids this daemon will settle on",
    CORDON_ASSETS: "assets it will pay in",
    CORDON_PORT: "defaults to 8402",
    CORDON_BIND: "the interface to listen on; defaults to 127.0.0.1. Anything else requires CORDON_TOKEN",
    CORDON_TOKEN: "a shared secret every request must send as `Authorization: Bearer <token>`. Optional on loopback, required off it",
    CORDON_POLL_MS: "receipt polling interval; defaults to 250, matched to Arc's finality rather than to viem's 4,000",
    CORDON_KEY_FILE: "where a spawned child's key is written, before the spawn is sent; defaults to ~/.cordon/cordon.env",
  },
} as const;

/* These read the env they are given, not the process's. `load` takes an
   environment as an argument so a test can build one; reading process.env
   here anyway would make that argument a lie. */
function required(env: NodeJS.ProcessEnv, name: string): string {
  const v = env[name];
  if (!v) throw new ConfigError(`${name} is not set`);
  return v;
}

function address(env: NodeJS.ProcessEnv, name: string): `0x${string}` {
  const v = required(env, name);
  if (!/^0x[0-9a-fA-F]{40}$/.test(v)) throw new ConfigError(`${name} is not an address: ${v}`);
  return v as `0x${string}`;
}

export function load(env = process.env): Config {
  const keys: NodeKey[] = [];
  /* CORDON_NODE_<label> = <nodeId>, with the key in CORDON_KEY_<label>. The
     key never appears in configuration, only the name of the variable holding
     it, so a config dump cannot leak one. */
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith("CORDON_NODE_") || !value) continue;
    const label = name.slice("CORDON_NODE_".length);
    if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
      throw new ConfigError(`${name} is not a node id: ${value}`);
    }
    const keyEnv = `CORDON_KEY_${label}`;
    if (!env[keyEnv]) throw new ConfigError(`${name} is set but ${keyEnv} is not`);
    keys.push({ node: value as `0x${string}`, keyEnv });
  }
  if (keys.length === 0) throw new ConfigError("no CORDON_NODE_<label> is set");

  /* Off loopback, a token is not a hardening step, it is the whole boundary.
     Refusing to start is the same answer this file gives to every other
     missing value, and for the same reason: a daemon that starts anyway is
     one that discovers the problem when somebody else's request spends. */
  const bind = env.CORDON_BIND ?? "127.0.0.1";
  const token = env.CORDON_TOKEN || undefined;
  if (!isLoopback(bind) && !token) {
    throw new ConfigError(
      `CORDON_BIND is ${bind}, which is reachable from off this machine, and CORDON_TOKEN is not set. ` +
        `This process holds the operator keys: bind to 127.0.0.1, or set a token.`,
    );
  }

  return {
    rpcUrl: env.CORDON_RPC ?? ARC.rpc,
    chainId: Number(env.CORDON_CHAIN_ID ?? ARC.chainId),
    vault: address(env, "CORDON_VAULT"),
    registry: address(env, "CORDON_REGISTRY"),
    usdc: (env.CORDON_USDC ?? ARC.erc20) as `0x${string}`,
    record: env.CORDON_RECORD ? address(env, "CORDON_RECORD") : undefined,
    identity: (env.CORDON_IDENTITY ?? ERC8004.identity) as `0x${string}`,
    networks: (env.CORDON_NETWORKS ?? `eip155:${ARC.chainId}`).split(",").map((s) => s.trim()),
    assets: (env.CORDON_ASSETS ?? ARC.erc20).split(",").map((s) => s.trim()),
    port: Number(env.CORDON_PORT ?? 8402),
    bind,
    token,
    pollMs: Number(env.CORDON_POLL_MS ?? 250),
    keys,
    keyFile: env.CORDON_KEY_FILE ?? join(homedir(), ".cordon", "cordon.env"),
  };
}
