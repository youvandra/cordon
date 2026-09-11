/**
 * Where an agent's URL is allowed to point.
 *
 * `cordon_fetch` is the whole tool list, and the argument for that is that an
 * agent cannot express "send money to X" — only "fetch this URL". That claim
 * is about money and it holds. It was quietly doing duty for a second claim it
 * never made good on: `cordon_fetch` takes a method and a body as well, so it
 * is a general HTTP client, and a general HTTP client inside the daemon can
 * reach everything the daemon can reach.
 *
 * On the box this runs on, that is the meter on `127.0.0.1:8404` and the
 * attest endpoint on `127.0.0.1:8405` — both bound to loopback *because they
 * trust loopback*, with nginx as the only way in from outside. It is also
 * `169.254.169.254`, which is where a cloud host keeps the credentials of the
 * machine. An agent that has been told to go and find something can ask for
 * any of them, and the answer comes back to it as a tool result.
 *
 * So the fence gets a network half:
 *
 *  - `http` and `https`, and nothing else. No `file:`, no `gopher:`.
 *  - the name is resolved first, and every address it resolves to has to be a
 *    public one. A name that resolves to loopback is the ordinary way past a
 *    hostname allowlist, and it costs an attacker nothing to register one.
 *  - redirects are followed here rather than by `fetch`, so every hop is
 *    checked the same way. `fetch` follows them silently, and a seller that
 *    answers 302 is a seller choosing the next URL.
 *
 * **What this does not close.** The name is resolved, checked, and then
 * resolved again by `fetch` when it connects, so a name that answers
 * differently between those two moments is not caught. Closing that needs the
 * connection pinned to the address that was checked — an undici dispatcher
 * with its own `lookup` — which is a dependency this does not have. What is
 * closed is every address an agent can simply ask for, which is the shape the
 * problem actually takes here.
 */
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export class EgressError extends Error {}

/**
 * Ranges an agent has no business reaching through this daemon.
 *
 * Written out rather than pulled from a package, because the list is short,
 * the failure of getting it wrong is silent, and a reader of this file should
 * be able to check it against RFC 1918 and RFC 4193 without leaving the page.
 */
function isPrivateV4(address: string): boolean {
  const [a = 0, b = 0] = address.split(".").map(Number);
  if (a === 10) return true; // 10.0.0.0/8, RFC 1918
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12, RFC 1918
  if (a === 192 && b === 168) return true; // 192.168.0.0/16, RFC 1918
  if (a === 127) return true; // loopback
  if (a === 0) return true; // "this host", and 0.0.0.0 reaches loopback
  if (a === 169 && b === 254) return true; // link-local, and cloud metadata
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10, carrier NAT
  if (a >= 224) return true; // multicast and reserved
  return false;
}

function isPrivateV6(address: string): boolean {
  const plain = address.toLowerCase().split("%")[0]!;
  if (plain === "::1" || plain === "::") return true;
  if (plain.startsWith("fc") || plain.startsWith("fd")) return true; // unique local, RFC 4193
  if (plain.startsWith("fe8") || plain.startsWith("fe9")) return true; // link local
  if (plain.startsWith("fea") || plain.startsWith("feb")) return true;
  if (plain.startsWith("ff")) return true; // multicast
  /* `::ffff:127.0.0.1` is loopback wearing a v6 hat, and it is the first thing
     anybody tries against a check that only reads the v4 list. */
  const mapped = plain.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateV4(mapped[1]!);
  return false;
}

export function isPrivateAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPrivateV4(address);
  if (family === 6) return isPrivateV6(address);
  /* Not an address at all. Refusing is the safe direction for a check whose
     answer decides whether to send a request somewhere. */
  return true;
}

export interface EgressOptions {
  /** Injected by the test, which has no DNS worth depending on. */
  resolve?: (hostname: string) => Promise<string[]>;
}

const resolveAll = async (hostname: string): Promise<string[]> => {
  const answers = await lookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
};

/**
 * Refuse a URL an agent should not be able to reach, by name.
 *
 * Every refusal says which rule stopped it, because this sits in the path of
 * an agent doing its job and "fetch failed" is not something anybody can act
 * on — least of all the agent, which will simply try again.
 */
export async function assertPublicUrl(raw: string, options: EgressOptions = {}): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new EgressError(`${raw} is not a URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new EgressError(
      `${url.protocol} is not a scheme this daemon fetches. A purchase is an HTTP request ` +
        `answered with 402, and nothing else here needs a network.`,
    );
  }

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [host] : await (options.resolve ?? resolveAll)(host).catch(() => []);

  if (addresses.length === 0) {
    throw new EgressError(`${url.hostname} does not resolve, so there is nothing to ask`);
  }

  /* Every address, not the first. A name that answers with one public address
     and one loopback address is the ordinary way past a check that stops at
     the first answer. */
  for (const address of addresses) {
    if (isPrivateAddress(address)) {
      throw new EgressError(
        `${url.hostname} resolves to ${address}, which is on this machine or its private network. ` +
          `The daemon runs beside the meter and the attest endpoint, both of which listen on ` +
          `loopback because they trust it, and a URL is the only thing an agent can hand this tool.`,
      );
    }
  }

  return url;
}
