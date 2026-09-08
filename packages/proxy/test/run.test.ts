/**
 * `cordon run`, exercised the way the claim is stated: a program nobody
 * modified, launched into an environment that points it at the proxy.
 *
 * The program here is `curl`. That is the point — it was not written for
 * Cordon, it has no Cordon library in it, and it reads `http_proxy` because
 * every HTTP client has read `http_proxy` for thirty years. If this test
 * passes with curl, it passes with the runtimes whose source we cannot touch,
 * which is the only reason this surface exists.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const runner = resolve(here, "../src/run.ts");

const NODE = `0x${"11".repeat(32)}`;
const SELLER = "0x6302D9e6DBB22fEC3c350551568Bb39B4b35Ad57";
/** $0.0024 — the AIsa scholar endpoint from Circle's live catalogue. */
const PRICE = "2400";

const offer = {
  scheme: "exact",
  network: "eip155:8453",
  asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  payTo: SELLER,
  amount: PRICE,
};

/** A daemon that pays for one path and is refused on the other. The contract
 *  makes that decision for real elsewhere; here it is scripted, because what
 *  is under test is the wiring around it. */
let daemon: Server;
let daemonUrl: string;
const asked: string[] = [];

before(async () => {
  daemon = createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      const body = JSON.parse(raw || "{}") as { url?: string };
      asked.push(body.url ?? "");
      const answer = String(body.url).includes("/expensive")
        ? {
            paid: false,
            free: false,
            refusal: {
              released: false,
              reason: "window-budget",
              breachedAt: `0x${"22".repeat(32)}`,
              refusalId: "7",
              txHash: `0x${"cd".repeat(32)}`,
            },
            offer,
          }
        : {
            paid: true,
            status: 200,
            headers: { "content-type": "application/json" },
            body: { citations: 3 },
            draw: { released: true, reason: "none", txHash: `0x${"ab".repeat(32)}` },
            offer,
          };
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify(answer));
    });
  });
  await new Promise<void>((r) => daemon.listen(0, "127.0.0.1", r));
  daemonUrl = `http://127.0.0.1:${(daemon.address() as AddressInfo).port}`;
});

after(async () => {
  daemon.closeAllConnections();
  await new Promise<void>((r) => daemon.close(() => r()));
});

/** Run a command through `cordon run` and collect what it printed. */
function cordonRun(command: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((done) => {
    execFile(
      process.execPath,
      [runner, "--node", NODE, "--daemon", daemonUrl, "--", ...command],
      { timeout: 30_000 },
      (error, stdout, stderr) => {
        const code = (error as { code?: number } | null)?.code ?? 0;
        done({ code, stdout, stderr });
      },
    );
  });
}

/* `--write-out` puts the status on its own last line, so the test reads a
   status rather than inferring one from the body. */
const curl = (url: string) => ["curl", "--silent", "--show-error", "--write-out", "\n%{http_code}", url];

/** The status is the last line; everything before it is the body, which may
 *  well have newlines of its own. */
function split(stdout: string): { body: string; status: string } {
  const lines = stdout.trimEnd().split("\n");
  return { status: lines.pop() ?? "", body: lines.join("\n") };
}

test("an unmodified program buys through cordon run, having been given no key and no code change", async () => {
  const result = await cordonRun(curl("http://seller.example/apis/v2/scholar"));

  const { body, status } = split(result.stdout);
  assert.equal(status, "200", result.stderr);
  assert.deepEqual(JSON.parse(body), { citations: 3 });
  assert.ok(
    asked.includes("http://seller.example/apis/v2/scholar"),
    "the request reached the daemon, which is the only thing holding a key",
  );
});

test("the same program, refused, gets 402 rather than a hang or an empty success", async () => {
  const result = await cordonRun(curl("http://seller.example/expensive"));

  const { body, status } = split(result.stdout);
  assert.equal(status, "402", result.stderr);
  assert.equal(JSON.parse(body).cordon, "refused");
  assert.equal(JSON.parse(body).reason, "window-budget");
});

test("https works too, because every seller in the catalogue is on https", async () => {
  const result = await cordonRun(curl("https://seller.example/apis/v2/scholar"));

  const { body, status } = split(result.stdout);
  assert.equal(status, "200", result.stderr);
  assert.deepEqual(JSON.parse(body), { citations: 3 });
  assert.ok(asked.includes("https://seller.example/apis/v2/scholar"));
});

test("the same program without cordon run reaches nothing, because the host does not exist", async () => {
  /* The counterfactual. Nothing about the program changed; what changed is the
     environment it was launched into. Without it there is no proxy, the name
     does not resolve, and — the part that matters — there is still no key. */
  const result = await new Promise<{ code: number; stdout: string }>((done) => {
    execFile(curl("http://seller.example/apis/v2/scholar")[0]!, curl("http://seller.example/x").slice(1), {
      timeout: 30_000,
      env: { PATH: process.env.PATH ?? "" },
    }, (error, stdout) => done({ code: (error as { code?: number } | null)?.code ?? 0, stdout }));
  });

  assert.notEqual(result.code, 0, "no proxy, no purchase");
});

test("the run's exit code is the program's own", async () => {
  const result = await cordonRun(["node", "-e", "process.exit(3)"]);
  assert.equal(result.code, 3, "a wrapper that swallows an exit code breaks every script above it");
});
