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
  settler: new CircleSettler(),
  acceptable: { networks: config.networks, assets: config.assets },
});

server.listen(config.port, () => {
  console.log(`cordon daemon on :${config.port}`);
  console.log(`  chain    ${config.chainId} via ${config.rpcUrl}`);
  console.log(`  vault    ${config.vault}`);
  console.log(`  nodes    ${gate.nodes().join(", ")}`);
  console.log(`  settles  ${config.networks.join(", ")}`);
});
