import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * The entry point, started the way a client starts it.
 *
 * Both other suites build the server with `createMcpServer` and a settler of
 * their own, so neither has ever executed `main.ts` — and `main.ts` built its
 * settler with no arguments, which threw on the first property read. The
 * server was correct and the thing that starts it could not start. Only
 * running it finds that, so this runs it.
 *
 * No chain is reached: the process announces itself before the first call.
 */
const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

/* A throwaway key. It is an operator of nothing and holds nothing; a config
   the process refuses to start without, so the test must supply one. */
const KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";

test("the entry point starts and announces its node", async () => {
  const child = spawn(process.execPath, [MAIN], {
    env: {
      ...process.env,
      CORDON_VAULT: "0x00ab57acd260c594a661b6101bdf7e92267af135",
      CORDON_REGISTRY: "0x0000000000000000000000000000000000000001",
      CORDON_NODE_TEST: `0x${"11".repeat(32)}`,
      CORDON_KEY_TEST: KEY,
      CORDON_RPC: "http://127.0.0.1:1",
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  const said = await new Promise<string>((resolve, reject) => {
    let text = "";
    const done = setTimeout(() => reject(new Error(`said nothing: ${text}`)), 20_000);
    child.stderr.on("data", (chunk) => {
      text += String(chunk);
      /* Either outcome ends the wait: the ready line, or the stack trace that
         is the defect this test exists for. */
      if (/cordon mcp: node|Error/.test(text)) {
        clearTimeout(done);
        resolve(text);
      }
    });
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(done);
      resolve(text);
    });
  });

  child.kill();

  assert.match(said, /cordon mcp: node 0x1111/, said);
});
