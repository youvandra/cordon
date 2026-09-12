import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, type ChildProcess } from "node:child_process";
import { fileURLToPath } from "node:url";

/**
 * The entry point, started the way a client starts it.
 *
 * Both other suites build the server with `createMcpServer` and a settler of
 * their own, so neither has ever executed `main.ts` — and `main.ts` built its
 * settler with no arguments, which threw on the constructor's first property
 * read. The server was correct and the thing that starts it could not start.
 * Only running it finds that, so this runs it.
 *
 * No chain is reached: the process announces itself before the first call.
 */
const MAIN = fileURLToPath(new URL("../src/main.ts", import.meta.url));

/* Throwaway keys. They are operators of nothing and hold nothing; a config the
   process refuses to start without, so the test must supply one. Two of them,
   so "the first node" and "the node asked for" are different answers. */
const KEY_ONE = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const KEY_TWO = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";
const ONE = `0x${"11".repeat(32)}`;
const TWO = `0x${"22".repeat(32)}`;

const base: Record<string, string> = {
  CORDON_VAULT: "0x00ab57acd260c594a661b6101bdf7e92267af135",
  CORDON_REGISTRY: "0x0000000000000000000000000000000000000001",
  CORDON_NODE_ONE: ONE,
  CORDON_KEY_ONE: KEY_ONE,
  CORDON_NODE_TWO: TWO,
  CORDON_KEY_TWO: KEY_TWO,
  CORDON_RPC: "http://127.0.0.1:1",
};

function start(extra: Record<string, string> = {}): ChildProcess {
  return spawn(process.execPath, [MAIN], {
    env: { ...process.env, ...base, ...extra },
    stdio: ["pipe", "pipe", "pipe"],
  });
}

/** Whatever the process says first: the ready line, the refusal, or the stack
 *  trace that is the defect this file exists for. */
function firstWord(child: ChildProcess): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let text = "";
    const gaveUp = setTimeout(() => reject(new Error(`said nothing: ${text}`)), 20_000);
    child.stderr!.on("data", (chunk) => {
      text += String(chunk);
      if (/cordon mcp: node|holds no key|Error/.test(text)) {
        clearTimeout(gaveUp);
        resolve(text);
      }
    });
    child.on("error", reject);
    child.on("exit", () => {
      clearTimeout(gaveUp);
      resolve(text);
    });
  });
}

test("the entry point starts and announces its node", async () => {
  const child = start();
  const said = await firstWord(child);
  child.kill();
  assert.match(said, /cordon mcp: node 0x1111/, said);
});

test("the node it speaks for can be named rather than ordered into", async () => {
  const child = start({ CORDON_MCP_NODE: TWO });
  const said = await firstWord(child);
  child.kill();
  assert.match(said, /cordon mcp: node 0x2222/, said);
});

test("a node this process holds no key for is refused by name", async () => {
  const child = start({ CORDON_MCP_NODE: `0x${"99".repeat(32)}` });
  const said = await firstWord(child);
  child.kill();
  assert.match(said, /holds no key for it/, said);
  assert.doesNotMatch(said, /cordon mcp: node 0x/, said);
});
