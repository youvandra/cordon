# @cordon/proxy

The surface for code we cannot change.

An agent runtime whose source we do not own still makes HTTP requests, and
`HTTP_PROXY` is the seam every HTTP client in every language already reads. The
program runs unmodified. Its requests arrive here. Anything that answers `402`
is paid for by the daemon, inside the bound the owner signed, or it is not paid
for at all.

```bash
cordon run --node 0x7f3a… -- python my_agent.py
```

That is the whole integration. No import, no wrapper, no library.

## What this surface does, and what it does not

The distinction matters more here than anywhere else in the repository,
because a proxy is exactly the kind of component people assume is doing the
enforcing.

- The proxy does **not** create the bound. The bound is `TreeVault`, on Arc,
  and the reason an agent cannot step around it is that **the agent holds no
  key**. A program that ignores `HTTP_PROXY` entirely still cannot pay anybody.
- What the proxy adds is the ability to **succeed** inside the bound. Without
  it, an unmodified program meets a `402` and can do nothing with it.

So a request that never reaches this process is a request that *fails*, not a
request that *escapes*. Nothing in this package is described as enforcement,
and nothing in it should be.

## What comes back

| Situation | Response |
|---|---|
| Seller wanted nothing | the seller's own response, untouched |
| Seller was paid | the seller's response, plus `cordon-paid` and `cordon-transaction` |
| The contract refused | **402**, with `cordon-refusal`, `cordon-breached-at`, `cordon-transaction` and the refusal in the body |
| No daemon behind the proxy | 502. Nothing was bought, and nothing is pretended |

A refusal is a `402` because that is the literal truth of what happened: the
seller asked to be paid and nobody paid. A program that handles
payment-required at all handles this without knowing Cordon exists.

## TLS

Every seller in Circle's catalogue is on https, and a proxy that only tunnels
`CONNECT` sees ciphertext — it cannot read the price or the payee, so the agent
cannot pay through it. `cordon run` therefore terminates TLS, using a
certificate authority it generates for that one run.

Three properties keep that from being a liberty taken with your machine:

- **Per run.** The CA is created into a private temporary directory and both it
  and its key are deleted when the run ends.
- **Per process.** It is never installed into a system or browser trust store.
  The child process is pointed at it with `NODE_EXTRA_CA_CERTS`,
  `REQUESTS_CA_BUNDLE`, `SSL_CERT_FILE` and `CURL_CA_BUNDLE`. Exactly one
  process trusts it, and only while it is alive.
- **Trusted by nobody else.** Having never been distributed, a certificate it
  signs is rejected by every other client on the machine. There is a test for
  that.

A program launched some other way — no `cordon run`, no CA in its environment —
fails the handshake loudly rather than silently talking to a middlebox.

Running `cordon-proxy` on its own defaults to plaintext and **refuses**
`CONNECT` rather than tunnelling it. Terminating someone's TLS is not something
a process should begin doing because it was started with no arguments; set
`CORDON_CA=1` to opt in.

## Running it separately

For a container, a service, or a runtime whose environment you edit rather than
whose command line you own:

```bash
CORDON_NODE=0x7f3a… CORDON_DAEMON=http://127.0.0.1:8402 CORDON_CA=1 \
  node src/main.ts
```

| Variable | |
|---|---|
| `CORDON_NODE` | the mandate node this proxy acts for. One proxy, one node |
| `CORDON_DAEMON` | defaults to `http://127.0.0.1:8402` |
| `CORDON_PROXY_PORT` | defaults to `8403` |
| `CORDON_CA` | `1` to terminate TLS. Off by default |

Nothing here is a credential. The key stays in the daemon, which is the point.

## Tests

```bash
npm test
```

The `cordon run` suite drives **curl** — a program that was not written for
Cordon, has no Cordon library in it, and reads `http_proxy` because every HTTP
client has for thirty years. If it passes with curl it passes with the runtimes
whose source we cannot touch, which is the only reason this surface exists.
