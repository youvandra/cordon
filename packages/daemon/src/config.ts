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
import { ARC } from "../../fixtures/src/index.ts";

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
  /** CAIP-2 networks and assets this daemon will settle on. */
  networks: string[];
  assets: string[];
  port: number;
  keys: NodeKey[];
}

class ConfigError extends Error {}

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
    CORDON_RPC: `defaults to ${ARC.rpc}`,
    CORDON_CHAIN_ID: `defaults to ${ARC.chainId}`,
    CORDON_USDC: "the 6-decimal ERC-20 view; defaults to Arc's",
    CORDON_NETWORKS: "CAIP-2 ids this daemon will settle on",
    CORDON_ASSETS: "assets it will pay in",
    CORDON_PORT: "defaults to 8402",
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

  return {
    rpcUrl: env.CORDON_RPC ?? ARC.rpc,
    chainId: Number(env.CORDON_CHAIN_ID ?? ARC.chainId),
    vault: address(env, "CORDON_VAULT"),
    registry: address(env, "CORDON_REGISTRY"),
    usdc: (env.CORDON_USDC ?? ARC.erc20) as `0x${string}`,
    networks: (env.CORDON_NETWORKS ?? `eip155:${ARC.chainId}`).split(",").map((s) => s.trim()),
    assets: (env.CORDON_ASSETS ?? ARC.erc20).split(",").map((s) => s.trim()),
    port: Number(env.CORDON_PORT ?? 8402),
    keys,
  };
}
