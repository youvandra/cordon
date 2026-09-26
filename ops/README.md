# Serving Cordon

Six surfaces, one box, three names.

| What | Where | How |
|---|---|---|
| site | `https://getcordon.xyz/` | static, `/var/www/cordon` |
| console | `https://getcordon.xyz/console/` | static, `/var/www/cordon/console`, built with base `/console/` |
| meter read API, Sepolia | `https://getcordon.xyz/api/` | `cordon-meter-sepolia.service` on `127.0.0.1:8407`, proxied |
| meter read API, Arc | `https://getcordon.xyz/api/arc/` | `cordon-meter.service` on `127.0.0.1:8404`, proxied |
| attest | `https://attest.getcordon.xyz/` | `cordon-attest.service` on `127.0.0.1:8405`, proxied |
| demo seller | `https://demo-seller.getcordon.xyz/` | `cordon-demo-seller.service` on `127.0.0.1:8406`, proxied |
| Beacon, the sample market | `https://getcordon.xyz/market/` | `cordon-market.service` on `127.0.0.1:8409`, proxied, prefix stripped |

The demo seller sells a live reading of Arc at $1 so a demo buys from
something that is not the record — Circle's marketplace has no testnet seller.
It runs out of `packages/attest` with attest's key, from the same
`.env.attest`, so it adds no key to the box.

Beacon is the sixth and the only seller without a name of its own. The other
two hold subdomains because their URLs were published before the endpoints
existed; nothing had published Beacon's, so it went up behind a `location`
block on the origin and cost neither a certificate nor a DNS record. It sells
five things on Sepolia, priced across a per-draw cap so that four of them pay
and one is refused — the refusal happens because an agent asked for the
expensive one, not because anybody staged it. Like the demo seller it runs out
of `packages/attest` on attest's key, so it adds no key to the box.

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
| A | `demo-seller` | `<box IP>` |

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
sudo cp ops/nginx/cordon-headers.conf ops/nginx/cordon-locations.conf \
       ops/nginx/cordon-compression.conf /etc/nginx/snippets/
# The rate-limit zone. conf.d, not the vhost: `limit_req_zone` is http-context
# and must be declared exactly once on the box.
sudo cp ops/nginx/cordon-limits.conf /etc/nginx/conf.d/
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

# 6. and that the bundles are actually compressed. `gzip on` in nginx.conf
# does nothing for scripts on its own: the default gzip_types is text/html.
curl -sI --compressed https://getcordon.xyz/console/ | grep -i content-encoding
```

## The services, after the deploy exists

```bash
# Written in an editor, not with printf: a key typed into a command lands in
# shell history. umask first, so the file is 0600 from the moment it exists
# rather than after a chmod that follows it.
umask 077 && ${EDITOR:-nano} ~/cordon/.env.attest    # CORDON_ATTEST_KEY=0x…
sudo cp ops/systemd/cordon-*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cordon-meter cordon-meter-sepolia cordon-attest
journalctl -u cordon-attest -n 40 --no-pager
```

### The demo seller

Its 443 block names a certificate that does not exist yet, so `nginx -t`
fails on the full vhost before `certbot` has run — and on this box a failed
reload is nine sites, not one. Answer ACME with a port-80 block first:

```bash
sudo tee /etc/nginx/sites-available/cordon-demo-seller >/dev/null <<'EOF'
server {
    listen 80;
    server_name demo-seller.getcordon.xyz;
    location ^~ /.well-known/acme-challenge/ { root /var/www/cordon; default_type "text/plain"; }
    location / { return 404; }
}
EOF
sudo ln -sf /etc/nginx/sites-available/cordon-demo-seller /etc/nginx/sites-enabled/cordon-demo-seller
sudo nginx -t && sudo systemctl reload nginx
sudo certbot certonly --webroot -w /var/www/cordon -d demo-seller.getcordon.xyz

sudo cp ops/nginx/demo-seller.getcordon.xyz.conf /etc/nginx/sites-available/cordon-demo-seller
sudo nginx -t && sudo systemctl reload nginx
sudo systemctl enable --now cordon-demo-seller    # the unit was copied with cordon-*.service above
curl -s https://demo-seller.getcordon.xyz/health
```

It shares the `cordon_attest` rate-limit zone. `CORDON_DEMO_PAYTO` in
`.env.attest` sends its sales to an address other than attest's.

### Beacon, the sample market

No certificate and no DNS record: it is a `location` in
`ops/nginx/cordon-locations.conf`, which the origin vhost already includes, so
publishing it is the origin's own reload.

```bash
sudo systemctl enable --now cordon-market      # copied with the other cordon-*.service units
curl -s 127.0.0.1:8409/health                  # it answers before nginx is touched, or the unit is the problem
sudo cp ops/nginx/cordon-locations.conf /etc/nginx/snippets/cordon-locations.conf
sudo nginx -t && sudo systemctl reload nginx
curl -s https://getcordon.xyz/market/health
curl -si https://getcordon.xyz/market/v1/signal/btc | head -1   # expect 402, not 200
```

The trailing slash on its `proxy_pass` strips the `/market/` prefix, because
Beacon serves `/v1/...` at its own root. Its 402 therefore names `resource` as
the stripped path — harmless, and worth knowing before it surprises somebody:
an x402 payer signs an amount and a payee, never a path.

The 402 on the last line is the check that matters. A `200` there means the
catalogue is being served without a price, and a `404` means the prefix is not
coming off.

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

## The console's wallet gate

The console signs through Privy, and the app id is a **build-time** value:
`packages/console/.env.local` on the box, read by Vite when `cordon-publish.sh`
rebuilds the bundle.

```bash
printf 'VITE_PRIVY_APP_ID=<the app id>\n' > ~/cordon/packages/console/.env.local
```

Without it the gate falls back to the preview that touches no key, every
surface says so out loud, and **Connect wallet stops being able to sign** —
which is the one failure on this box that looks like nothing is wrong. An app
id is public, so the file is not a secret; it is simply not in the repository,
because it names an account rather than a deployment.

Check the published bundle rather than the page:

```bash
curl -s https://getcordon.xyz/console/ | grep -o 'assets/index-[^"]*\.js' |
  head -1 | xargs -I{} curl -s --compressed "https://getcordon.xyz/console/{}" |
  grep -c 'auth.privy.io'
```

## What this box does not run

**No daemon.** `cordon-meter`, `cordon-attest` and `cordon-demo-seller` are
the only Cordon units here, and none holds an operator key — the meter reads,
and the other two sell a reading. Nothing on this box can draw from the vault or pay a
seller.

That is deliberate: an operator key on a web-facing box is a key on a
web-facing box. The daemon runs where its keys are, which today is the author's
own machine:

```bash
node --env-file=.env.live --env-file="$HOME/.cordon/cordon.env" \
  packages/daemon/src/main.ts
```

So a purchase, a refusal and a published record all happen off this box, and
what the box does is show them afterwards.

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

`cordon-publish.sh` sets it to **`/api`** — the meter on this box's own origin,
proxied by nginx — so a redeploy needs nothing passed. `CORDON_METER_URL`
overrides it for a meter somewhere else:

```bash
CORDON_METER_URL=https://meter.example.com ./ops/bin/cordon-publish.sh
```

### Two chains, one id space

Cordon is deployed on Arc and on Sepolia, and `RECORD_BASE` is the same
constant on both. So Arc's refusal 7 and Sepolia's refusal 7 are two different
events that write the same URL, and one meter behind `/api` can answer for
only one of them.

There are two meters. `/api` is **Sepolia** — the chain the names are on, the
chain the console reads, and the chain a demo runs. `/api/arc` is Arc, kept so
that every record Arc ever wrote still resolves. The site asks the first, and
asks the second when the first has no such id; every meter answer carries its
own `chainId`, so the page names the chain that replied rather than assuming
one. `CORDON_METER_ARC_URL` overrides the second the way `CORDON_METER_URL`
overrides the first.

Each meter keeps its own snapshot (`ledger.<chainId>.json`) and its own
environment file. `~/.cordon/.env.meter` names Arc's RPC and Arc's window
sizes; a Sepolia meter handed that file asks Arc for Sepolia's blocks, so it
reads `~/cordon/.env.meter.sepolia` instead. Sepolia's public endpoint answers
the default windows, so that file may hold nothing but a comment — or an
endpoint with a key, if the public one starts refusing.

The console is pointed at one chain by `packages/console/src/lib/chain.ts` and
throws away a meter answer whose `chainId` is not that chain's, then reads the
chain itself in windows. That is why the Refusals screen kept working while
`/api` was still Arc — slowly, against a public RPC, in a demo.

The meter already sends `access-control-allow-origin: *` — a record only its
owner can fetch is not a record.

`CORDON_METER=http://127.0.0.1:8404 ops/bin/cordon-check.sh` also asks the
meter to reconcile: an operator's Gateway balance must never exceed what the
vault released to it. A balance above that means money reached an agent from
outside the tree, and the claim that the vault is the only funding source is
false for that node.
