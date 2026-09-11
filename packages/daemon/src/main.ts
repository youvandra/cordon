/**
 * Start the daemon. Refuses to start misconfigured, because it holds a key.
 */
import { load } from "./config.ts";
import { Gate } from "./gate.ts";
import { CircleSettler } from "./settle.ts";
import { createDaemon } from "./server.ts";

const config = load(process.env);
const gate = new Gate(config);

const server = createDaemon({
  gate,
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

server.listen(config.port, () => {
  console.log(`cordon daemon on :${config.port}`);
  console.log(`  chain    ${config.chainId} via ${config.rpcUrl}`);
  console.log(`  vault    ${config.vault}`);
  console.log(`  nodes    ${gate.nodes().join(", ")}`);
  console.log(`  settles  ${config.networks.join(", ")}`);
  console.log(
    gate.recorder.enabled
      ? `  record   ${config.record} — every refusal is published to ERC-8004`
      : "  record   none. Refusals are enforced and never published; set CORDON_RECORD",
  );
});
