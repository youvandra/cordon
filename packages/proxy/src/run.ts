#!/usr/bin/env node
/**
 * `cordon run --node 0x… -- python my_agent.py`
 *
 * Start a proxy, hand exactly one child process the environment that points at
 * it, and take both away when the child exits. The program is unmodified and
 * unaware; what changed is the environment it was launched into.
 *
 * The certificate authority created here is trusted by this child and by
 * nothing else — it is written to a private temporary directory, given to the
 * child through environment variables, and deleted when the run ends. It is
 * never installed into a system or browser trust store, and no other process
 * on the machine will accept a certificate it signed.
 *
 * Because `HTTPS_PROXY` is set for the same child, every TLS peer it sees is
 * this proxy, so replacing its certificate bundle is consistent rather than
 * lossy.
 *
 * Nothing is exempted from the proxy, and localhost least of all: an agent
 * reaching a seller that happens to run on this machine is still buying, and
 * an exemption written for convenience is a hole shaped like a hostname. The
 * child never needs to reach the daemon itself — the proxy does that, and the
 * proxy is this process, whose own environment is untouched. A program that
 * genuinely needs an unproxied hop can set `NO_PROXY` before `cordon run`, and
 * it is inherited rather than overwritten.
 */
import { spawn } from "node:child_process";
import { createEphemeralCa, OpensslUnavailable, type CertAuthority } from "./ca.ts";
import { httpDaemon } from "./client.ts";
import { createProxy } from "./proxy.ts";

interface Args {
  node: string;
  daemon: string;
  command: string[];
}

function usage(message: string): never {
  console.error(message);
  console.error("");
  console.error("usage: cordon run --node <0x…64> [--daemon <url>] -- <command> [args…]");
  process.exit(2);
}

function parse(argv: string[]): Args {
  /* `cordon run …` and `cordon-run …` should both work; the word `run` is a
     subcommand only when the binary was invoked under the shorter name. */
  const args = argv[0] === "run" ? argv.slice(1) : argv;

  let node = process.env.CORDON_NODE ?? "";
  let daemon = process.env.CORDON_DAEMON ?? "http://127.0.0.1:8402";
  let i = 0;
  for (; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--") { i++; break; }
    if (arg === "--node") node = args[++i] ?? "";
    else if (arg === "--daemon") daemon = args[++i] ?? "";
    else usage(`unknown argument: ${arg}`);
  }

  const command = args.slice(i);
  if (!/^0x[0-9a-fA-F]{64}$/.test(node)) usage("--node must be the mandate node this run acts for");
  if (command.length === 0) usage("nothing to run: put the command after --");
  return { node, daemon, command };
}

const { node, daemon, command } = parse(process.argv.slice(2));

let ca: CertAuthority;
try {
  ca = createEphemeralCa();
} catch (error) {
  if (error instanceof OpensslUnavailable) usage(error.message);
  throw error;
}

const server = createProxy({ node, daemon: httpDaemon(daemon), ca });

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  if (address === null || typeof address === "string") throw new Error("the proxy has no port");
  const url = `http://127.0.0.1:${address.port}`;

  const child = spawn(command[0]!, command.slice(1), {
    stdio: "inherit",
    env: {
      ...process.env,
      /* Both cases: clients disagree about which they read, and a client that
         reads the one we did not set goes out unproxied and simply fails. */
      HTTP_PROXY: url,
      HTTPS_PROXY: url,
      http_proxy: url,
      https_proxy: url,
      /* Node adds this one to its defaults; the rest replace a bundle, which
         is what we want here — see the note at the top of this file. */
      NODE_EXTRA_CA_CERTS: ca.certPath,
      REQUESTS_CA_BUNDLE: ca.certPath,
      SSL_CERT_FILE: ca.certPath,
      CURL_CA_BUNDLE: ca.certPath,
      /* The node this run acts for, for a program that wants to say so. It is
         not a credential: the key stays in the daemon and is not here. */
      CORDON_NODE: node,
    },
  });

  const shutdown = (code: number) => {
    server.close();
    ca.destroy();
    process.exit(code);
  };

  child.on("error", (error) => {
    console.error(`could not run ${command[0]}: ${error.message}`);
    shutdown(127);
  });
  child.on("exit", (code, signal) => shutdown(signal ? 128 : (code ?? 0)));

  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    process.on(sig, () => child.kill(sig));
  }
});
