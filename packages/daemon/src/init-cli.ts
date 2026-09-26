/**
 * `cordon-init` — the command around `initOperators`.
 *
 * Prints addresses and nothing else. If a private key ever appears in this
 * output it is a defect, and there is a test that says so.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { DEFAULT_CHAIN, DEPLOYMENT } from "../../fixtures/src/index.ts";

/** Where the owner surface lives. Overridable for a console served elsewhere. */
const CONSOLE_URL = process.env.CORDON_CONSOLE_URL ?? "https://getcordon.xyz/console";
import { initOperators } from "./init.ts";

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const at = argv.indexOf(`--${name}`);
  return at === -1 ? undefined : argv[at + 1];
};

const nodes = Number(flag("nodes") ?? 1);
const path = resolve(flag("out") ?? `${homedir()}/.cordon/cordon.env`);
const force = argv.includes("--force");

try {
  const { operators } = initOperators({ path, nodes, force });

  console.log(`operator keys written to ${path} (0600)`);
  console.log("");
  console.log("operator addresses — the ones that do the spending, one per node:");
  for (const operator of operators) {
    console.log(`  ${operator.label.toLowerCase().padEnd(8)} ${operator.address}`);
  }
  console.log("");
  /* A link with the root's address already in it, because the step after this
     one is otherwise "copy a 42-character string into the right field", and
     that is a step where people paste the wrong thing. The console reads it
     from the query and fills the field in; nothing is signed by a link. */
  console.log("open the console with the first one already filled in:");
  console.log("");
  console.log(`  ${CONSOLE_URL}/new?operator=${operators[0]!.address}`);
  console.log("");
  console.log(`Each needs gas on ${DEFAULT_CHAIN.name} — ${DEFAULT_CHAIN.faucet} — and holds no USDC`);
  console.log("by design: the vault tops it up one purchase at a time.");
  console.log("");
  console.log("These are the daemon's, not your wallet's and not the agent's.");
  console.log("The agent holds no key at all; that is the point of the product.");
  console.log("");
  console.log("Then, once the owner has opened a mandate for an operator, put its");
  console.log(`node id in CORDON_NODE_<label> in that file.`);
  console.log("");
  /* The addresses, not a sentence pointing at where the addresses live. This
     command used to end at `npm start`, which cannot work: the keys are only
     half of what the daemon needs, and following it to the letter answers
     `CORDON_VAULT is not set` with nothing on screen saying where to find one. */
  if (DEPLOYMENT) {
    console.log("The daemon needs the contracts too. Write them beside the keys —");
    console.log("this file holds addresses only, which is why it is not 0600:");
    console.log("");
    console.log("  cat > packages/daemon/.env.live <<'ENV'");
    console.log(`  CORDON_VAULT=${DEPLOYMENT.vault}`);
    console.log(`  CORDON_REGISTRY=${DEPLOYMENT.registry}`);
    console.log(`  CORDON_RECORD=${DEPLOYMENT.record}`);
    console.log(`  CORDON_RPC=${DEFAULT_CHAIN.rpc}`);
    console.log(`  CORDON_PORT=8402`);
    /* Named explicitly because its default is `$HOME`, whatever the two files
       above say: a second tree started from a second key file still writes its
       spawned children into the first one. */
    console.log(`  CORDON_KEY_FILE=${path}`);
    console.log("  ENV");
  } else {
    console.log("This build carries no deployment, so the contract addresses for");
    console.log("CORDON_VAULT, CORDON_REGISTRY and CORDON_RECORD have to come from");
    console.log("whoever deployed them.");
  }
  console.log("");
  console.log("Then start it:");
  console.log("");
  console.log("  node --env-file=packages/daemon/.env.live \\");
  console.log(`       --env-file=${path} \\`);
  console.log("       packages/daemon/src/main.ts");
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
