#!/usr/bin/env node
/**
 * Run the proxy on its own, for a program that is already running or that sets
 * its proxy some other way. `cordon run` is the shorter path for anything you
 * start yourself; this is the one for a container, a service, or a runtime
 * whose environment you edit rather than whose command line you own.
 *
 * Without `CORDON_CA=1` this serves plaintext only and refuses CONNECT. That
 * default is deliberate: terminating someone's TLS is not something a process
 * should start doing because it was launched with no arguments.
 */
import { createEphemeralCa, OpensslUnavailable, type CertAuthority } from "./ca.ts";
import { httpDaemon } from "./client.ts";
import { createProxy } from "./proxy.ts";

const node = process.env.CORDON_NODE;
if (!node || !/^0x[0-9a-fA-F]{64}$/.test(node)) {
  console.error("CORDON_NODE must be the mandate node this proxy acts for");
  process.exit(2);
}

const daemonUrl = process.env.CORDON_DAEMON ?? "http://127.0.0.1:8402";
const port = Number(process.env.CORDON_PROXY_PORT ?? 8403);

let ca: CertAuthority | undefined;
if (process.env.CORDON_CA === "1") {
  try {
    ca = createEphemeralCa();
  } catch (error) {
    if (error instanceof OpensslUnavailable) {
      console.error(error.message);
      process.exit(2);
    }
    throw error;
  }
}

const server = createProxy({ node, daemon: httpDaemon(daemonUrl), ca });

server.listen(port, () => {
  console.log(`cordon proxy on :${port}`);
  console.log(`  node    ${node}`);
  console.log(`  daemon  ${daemonUrl}`);
  console.log(
    ca
      ? `  tls     terminated; trust ${ca.certPath} in the client, and nowhere else`
      : "  tls     not terminated; CONNECT is refused. Set CORDON_CA=1 to change that",
  );
  console.log("");
  console.log(`  export HTTP_PROXY=http://127.0.0.1:${port}`);
  if (ca) console.log(`  export NODE_EXTRA_CA_CERTS=${ca.certPath}`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close();
    ca?.destroy();
    process.exit(0);
  });
}
