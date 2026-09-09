/**
 * `cordon-init` — the command around `initOperators`.
 *
 * Prints addresses and nothing else. If a private key ever appears in this
 * output it is a defect, and there is a test that says so.
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { ARC } from "../../fixtures/src/index.ts";

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
  console.log("the operator addresses, one per node:");
  for (const operator of operators) {
    console.log(`  ${operator.label.toLowerCase().padEnd(8)} ${operator.address}`);
  }
  console.log("");
  /* A link with the root's address already in it, because the step after this
     one is otherwise "copy a 42-character string into the right field", and
     that is a step where people paste the wrong thing. The console reads it
     from the query and fills the field in; nothing is signed by a link. */
  console.log("open the console with the root operator already filled in:");
  console.log("");
  console.log(`  ${CONSOLE_URL}/setup?operator=${operators[0]!.address}`);
  console.log("");
  console.log(`Each address needs gas on ${ARC.name} — ${ARC.faucet} — and holds`);
  console.log("no USDC by design: the vault tops it up one purchase at a time.");
  console.log("");
  console.log("Then, once the owner has opened a mandate for an operator, put its");
  console.log(`node id in CORDON_NODE_<label> in that file and start the daemon:`);
  console.log("");
  console.log(`  set -a; . ${path}; set +a`);
  console.log("  npm start --prefix packages/daemon");
} catch (error) {
  console.error((error as Error).message);
  process.exit(1);
}
