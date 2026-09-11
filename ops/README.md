# Serving Cordon

Four surfaces, one box, two names.

| What | Where | How |
|---|---|---|
| site | `https://getcordon.xyz/` | static, `/var/www/cordon` |
| console | `https://getcordon.xyz/console/` | static, `/var/www/cordon/console`, built with base `/console/` |
| meter read API | `https://getcordon.xyz/api/` | `cordon-meter.service` on `127.0.0.1:8404`, proxied |
| attest | `https://attest.getcordon.xyz/` | `cordon-attest.service` on `127.0.0.1:8405`, proxied |

The site and the console share one origin on purpose. The console asks the
owner's wallet to sign typed data naming the contract, so a separate API host
would be a CORS problem for no benefit — and the chain points at this origin:
`ConductRecord` writes `https://getcordon.xyz/refusal/<id>` and the daemon
writes `https://getcordon.xyz/agent/<id>`. Those paths belong to the name in
the record.

`attest` is the exception because the site already owns `/attest/:id` as a
page, and because it is the one surface that takes money.

Both services bind loopback and are reachable only through nginx. Neither
takes an address as an argument: they read
`packages/contracts/deployments/5042002.json` and exit 2 when it is absent, so
**neither can run before the deploy**.

## DNS

Two records, both A, both pointing at the box.

| Type | Host | Value |
|---|---|---|
| A | `@` | `<box IP>` |
| A | `www` | `<box IP>` |
| A | `attest` | `<box IP>` |

`www` exists only to redirect to the bare name, which is the name the contract
writes. No AAAA: the box has no routable IPv6 address, and an AAAA that does
not answer costs every visitor a timeout before the v4 fallback.

## First install

```bash
# 1. the tree and the web root
git clone git@github.com:youvandra/cordon.git ~/cordon
sudo mkdir -p /var/www/cordon && sudo chown "$USER:$USER" /var/www/cordon
cd ~/cordon && npm ci --prefix packages/site && npm ci --prefix packages/console

# 2. a server that answers ACME, and the site over plain HTTP
sudo cp ops/nginx/bootstrap.conf /etc/nginx/sites-available/cordon
sudo ln -sf /etc/nginx/sites-available/cordon /etc/nginx/sites-enabled/cordon
sudo nginx -t && sudo systemctl reload nginx
./ops/bin/cordon-publish.sh

# check the real bundle before DNS exists: http://<box IP>:9081/
# another site owns 9080 here, so grep the box before claiming a port

# 3. certificates, once DNS resolves
sudo certbot certonly --webroot -w /var/www/cordon \
  -d getcordon.xyz -d www.getcordon.xyz
sudo certbot certonly --webroot -w /var/www/cordon -d attest.getcordon.xyz

# 4. the real configuration
# Both snippets. `cordon-headers.conf` is included from every `location` in
# the other one and from the attest vhost, because nginx's `add_header` does
# not merge — a `location` that sets one of its own inherits none from above.
sudo cp ops/nginx/cordon-headers.conf ops/nginx/cordon-locations.conf /etc/nginx/snippets/
sudo cp ops/nginx/getcordon.xyz.conf /etc/nginx/sites-available/cordon
sudo cp ops/nginx/attest.getcordon.xyz.conf /etc/nginx/sites-available/cordon-attest
sudo ln -sf /etc/nginx/sites-available/cordon-attest /etc/nginx/sites-enabled/cordon-attest
sudo nginx -t && sudo systemctl reload nginx

# 5. check the headers actually arrived, on a route that sets its own
# Cache-Control and on one that does not. This is the step the add_header
# inheritance rule exists to catch.
curl -sI https://getcordon.xyz/console/ | grep -i 'frame-ancestors\|nosniff\|strict-transport'
curl -sI https://getcordon.xyz/assets/ -o /dev/null -w '%{http_code}\n'
curl -sI https://attest.getcordon.xyz/health | grep -i 'nosniff\|strict-transport'
```

## The services, after the deploy exists

```bash
printf 'CORDON_ATTEST_KEY=0x…\n' > ~/cordon/.env.attest && chmod 600 ~/cordon/.env.attest
sudo cp ops/systemd/cordon-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cordon-meter cordon-attest
journalctl -u cordon-attest -n 40 --no-pager
```

`attest` will refuse to start if the USDC view cannot verify the EIP-712
domain it would publish. On Arc it can — checked against the live chain, see
the EIP-3009 notes — so a refusal there means the deployment or the RPC, not
the token.

**systemd only.** This box also runs pm2, and supervising one process from
both is the mistake that has already cost two outages here. Nothing Cordon
runs goes into pm2.

### The endpoint the box reads, and why it is not Circle's

`https://rpc.testnet.arc.io` limits `eth_getLogs` twice over: it refuses a
range wider than about fifteen hundred blocks, and it cuts an address off
entirely after a few hundred of them — **and it calls both `rate limit
exceeded`**, so a range it will never answer looks like something worth
waiting for. One backfill of this deployment exhausts the quota for that IP
and every later request fails, including the narrow ones.

Blockdaemon's endpoint answers fifty-thousand-block ranges from the same box
with no key. It is the same chain and the same contracts; only the door is
different, and the meter's own snapshot is rebuildable from either.

```bash
umask 077
cat > ~/cordon/.env.meter <<'EOF'
CORDON_RPC=https://rpc.blockdaemon.testnet.arc.io
CORDON_METER_CHUNK=10000
CORDON_METER_MAX_BLOCKS=100000
CORDON_METER_PACE_MS=100
EOF
```

`.env.attest` carries the same `CORDON_RPC`. Both files are 0600 and neither
is committed. The alternates are listed at
<https://docs.arc.io/arc/references/rpc-endpoints>; dRPC caps free ranges at
ten thousand blocks, and QuickNode's keyless host was already rate limiting
this address when it was tried.

## Redeploy

```bash
cd ~/cordon && git pull && ./ops/bin/cordon-publish.sh
```

The script rebuilds both bundles, refuses if the console was built without
base `/console/`, and never deletes at the web root — `console/` and
`.well-known/` live there too.

## The two gates that are recorded from the chain

G1, G4, G5, G6 and G7 are suites. G2 and G3 are claims about a live tree, so
they are recorded by asking Arc and the meter what a real run left behind.
Neither reads a key: node ids, mandates, draws and refusals are public, which
is what makes them re-runnable by anyone checking us.

```bash
CORDON_ROOT=0x…  node packages/daemon/scripts/record-g2.mjs
CORDON_ROOT=0x… CORDON_DRILL=0x…  node packages/daemon/scripts/record-g3.mjs
```

Both write their row into `packages/fixtures/src/gates.gen.ts`, and G3 also
writes the number it measured into `packages/fixtures/src/drill.gen.ts` — the
drill publishes its figure whichever way it came out, so that file is
generated and never edited.

## Checking what is actually live

```bash
ops/bin/cordon-check.sh
```

Asks the deployed surfaces from outside, so a stale bundle on the box or a
service that quietly exited shows up here rather than in a demo. It reads the
**bundle**, not the page: `index.html` barely changes between builds, so a
stale deploy looks fine until you read the JavaScript.

A pending thing is not a failure. No mandate and no meter are the honest state
of a project whose gates say so, and the script exits non-zero only when
something claims to be up and is wrong.

## Pointing the site at the meter

`ConductRecord.RECORD_BASE` is a Solidity constant, so every record Cordon
writes carries `https://getcordon.xyz/refusal/<id>` with the id the *chain*
wrote. Those ids are not the demo's, and until the site can ask the meter for
them they resolve to a not-found.

Build the site with `VITE_METER_URL` set to wherever the meter answers, and
`/refusal/:id` reads live rows first and falls back to the preview ones, so the
illustration keeps working beside real records. Unset, the site behaves exactly
as it did.

```bash
VITE_METER_URL=https://meter.getcordon.xyz npm run build --prefix packages/site
```

The meter already sends `access-control-allow-origin: *` — a record only its
owner can fetch is not a record.

`CORDON_METER=http://127.0.0.1:8404 ops/bin/cordon-check.sh` also asks the
meter to reconcile: an operator's Gateway balance must never exceed what the
vault released to it. A balance above that means money reached an agent from
outside the tree, and the claim that the vault is the only funding source is
false for that node.
