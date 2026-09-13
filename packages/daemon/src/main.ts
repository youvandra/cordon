/**
 * Start the daemon. Refuses to start misconfigured, because it holds a key.
 */
import { load } from "./config.ts";
import { Gate } from "./gate.ts";
import { CircleSettler } from "./settle.ts";
import { createDaemon } from "./server.ts";
import { keyFileAt } from "./keyfile.ts";

const config = load(process.env);
const gate = new Gate(config);
const keyFile = keyFileAt(config.keyFile);

const server = createDaemon({
  gate,
  keyFile,
  settler: new CircleSettler({
    publicClient: gate.publicClientForSettlement,
    walletFor: (node) => gate.signerFor(node),
    chainId: config.chainId,
  }),
  acceptable: { networks: config.networks, assets: config.assets },
});

/* Enrolment is idempotent: a node that already has an identity is left alone.
   Doing it at startup rather than at the first refusal means the record is
   ready before there is anything to write into it. */
for (const node of gate.nodes()) await gate.enrol(node);

/* And then the names. A child spawned by an operator that held no gas got
   neither, and funding it afterwards used to heal only the first — so an agent
   could be enrolled, publishing refusals, and still anonymous. Both are
   recovered by the same restart now. */
const described = await gate.describeRemembered(keyFile.purposes());

server.listen(config.port, () => {
  console.log(`cordon daemon on :${config.port}`);
  console.log(`  chain    ${config.chainId} via ${config.rpcUrl}`);
  console.log(`  vault    ${config.vault}`);
  console.log(`  nodes    ${gate.nodes().join(", ")}`);
  /* Named because its default is `$HOME/.cordon/cordon.env` whatever
     `--env-file` says, so a second tree run from a second key file still
     writes its spawned children into the first one — silently, until somebody
     greps the wrong file. */
  console.log(`  keys     ${config.keyFile} — spawned children are written here`);
  if (described > 0) {
    console.log(`  purpose  published for ${described} node${described === 1 ? "" : "s"} this key file remembered`);
  }
  console.log(`  settles  ${config.networks.join(", ")}`);
  console.log(
    gate.recorder.enabled
      ? `  record   ${config.record} — every refusal is published to ERC-8004`
      : "  record   none. Refusals are enforced and never published; set CORDON_RECORD",
  );
});
