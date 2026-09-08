/**
 * An ephemeral certificate authority, trusted by one child process for the
 * length of one run.
 *
 * The proxy has to read a seller's `402` to know the price and the payee, and
 * every seller in Circle's catalogue is on https. A proxy that only tunnels
 * `CONNECT` sees ciphertext, so it cannot read the challenge and the agent
 * cannot pay through it. Terminating TLS is therefore not a shortcut here; it
 * is the only way the surface functions at all.
 *
 * Three properties keep that from being a liberty taken with someone's
 * machine:
 *
 * - The CA is generated per run into a private temporary directory, and both
 *   the key and the directory are removed when the run ends.
 * - It is never installed into a system or browser trust store. `cordon run`
 *   points the child process at it with environment variables, so exactly one
 *   process trusts it, and only while it is alive.
 * - Nothing else can use it: it is valid for one day and, having never been
 *   distributed, is trusted by nobody who did not just create it.
 *
 * A program launched some other way — no `cordon run`, no CA in its
 * environment — fails the handshake loudly rather than silently talking to a
 * middlebox. That is the direction this should fail in.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SecureContextOptions } from "node:tls";

export interface CertAuthority {
  /** PEM of the root certificate. The only part a child process is given. */
  readonly certPath: string;
  /** A leaf for one hostname, issued on demand and cached. */
  contextFor(hostname: string): SecureContextOptions;
  destroy(): void;
}

export class OpensslUnavailable extends Error {}

const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/* A hostname arrives from a CONNECT line written by whatever the agent is
   running, and it becomes an argument to openssl and a field in a
   certificate. Anything that is not a hostname is refused rather than
   escaped: there is no legitimate CONNECT to a name with a slash in it. */
const HOSTNAME = /^[a-zA-Z0-9]([-a-zA-Z0-9]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([-a-zA-Z0-9]{0,61}[a-zA-Z0-9])?)*$/;

function openssl(args: string[], cwd: string): void {
  try {
    execFileSync("openssl", args, { cwd, stdio: "pipe" });
  } catch (error) {
    const detail = (error as { stderr?: Buffer }).stderr?.toString().trim();
    throw new OpensslUnavailable(
      `openssl ${args[0]} failed${detail ? `: ${detail}` : ""}. ` +
        "The proxy needs it to terminate TLS; without it, use the MCP surface " +
        "or call the daemon's /fetch directly.",
    );
  }
}

/** Generate a CA now. Throws if openssl is not on the path, which is the only
 *  honest answer — a proxy that cannot issue a certificate cannot read a 402. */
export function createEphemeralCa(): CertAuthority {
  const dir = mkdtempSync(join(tmpdir(), "cordon-ca-"));
  const caKey = join(dir, "ca.key");
  const caCert = join(dir, "ca.crt");

  openssl(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", caKey], dir);
  openssl(
    [
      "req", "-x509", "-new", "-key", caKey, "-sha256", "-days", "1",
      "-subj", "/CN=Cordon local proxy (ephemeral)",
      "-addext", "basicConstraints=critical,CA:TRUE,pathlen:0",
      "-addext", "keyUsage=critical,keyCertSign,cRLSign",
      "-out", caCert,
    ],
    dir,
  );

  const cache = new Map<string, SecureContextOptions>();
  let destroyed = false;

  return {
    certPath: caCert,

    contextFor(hostname: string): SecureContextOptions {
      if (destroyed) throw new Error("this authority has been destroyed");

      const cached = cache.get(hostname);
      if (cached) return cached;

      const isIp = IPV4.test(hostname);
      if (!isIp && !HOSTNAME.test(hostname)) {
        throw new Error(`not a hostname: ${hostname}`);
      }

      const stem = join(dir, `leaf-${cache.size}`);
      const key = `${stem}.key`;
      const csr = `${stem}.csr`;
      const cert = `${stem}.crt`;
      const ext = `${stem}.ext`;

      writeFileSync(
        ext,
        `subjectAltName=${isIp ? "IP" : "DNS"}:${hostname}\n` +
          "extendedKeyUsage=serverAuth\n" +
          "basicConstraints=critical,CA:FALSE\n",
        { mode: 0o600 },
      );

      openssl(["ecparam", "-name", "prime256v1", "-genkey", "-noout", "-out", key], dir);
      /* CN is capped at 64 characters and SAN is what anything modern reads,
         so the name that matters is in the extension file above. */
      openssl(["req", "-new", "-key", key, "-subj", `/CN=${hostname.slice(0, 64)}`, "-out", csr], dir);
      openssl(
        [
          "x509", "-req", "-in", csr, "-CA", caCert, "-CAkey", caKey,
          "-CAcreateserial", "-days", "1", "-sha256", "-extfile", ext, "-out", cert,
        ],
        dir,
      );

      const context: SecureContextOptions = {
        key: readFileSync(key),
        cert: readFileSync(cert),
      };
      cache.set(hostname, context);
      return context;
    },

    destroy() {
      destroyed = true;
      cache.clear();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
