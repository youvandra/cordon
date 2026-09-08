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
| A | `@` | `43.134.86.221` |
| A | `www` | `43.134.86.221` |
| A | `attest` | `43.134.86.221` |

`www` exists only to redirect to the bare name, which is the name the contract
writes. No AAAA: the box has no routable IPv6 address, and an AAAA that does
not answer costs every visitor a timeout before the v4 fallback.

## First install

```bash
# 1. the tree and the web root
git clone git@github.com:youvandra/cordon.git ~/cordon
sudo mkdir -p /var/www/cordon && sudo chown ubuntu:ubuntu /var/www/cordon
cd ~/cordon && npm ci --prefix packages/site && npm ci --prefix packages/console

# 2. a server that answers ACME, and the site over plain HTTP
sudo cp ops/nginx/bootstrap.conf /etc/nginx/sites-available/cordon
sudo ln -sf /etc/nginx/sites-available/cordon /etc/nginx/sites-enabled/cordon
sudo nginx -t && sudo systemctl reload nginx
./ops/bin/cordon-publish.sh

# 3. certificates, once DNS resolves
sudo certbot certonly --webroot -w /var/www/cordon \
  -d getcordon.xyz -d www.getcordon.xyz
sudo certbot certonly --webroot -w /var/www/cordon -d attest.getcordon.xyz

# 4. the real configuration
sudo cp ops/nginx/cordon-locations.conf /etc/nginx/snippets/
sudo cp ops/nginx/getcordon.xyz.conf /etc/nginx/sites-available/cordon
sudo cp ops/nginx/attest.getcordon.xyz.conf /etc/nginx/sites-available/cordon-attest
sudo ln -sf /etc/nginx/sites-available/cordon-attest /etc/nginx/sites-enabled/cordon-attest
sudo nginx -t && sudo systemctl reload nginx
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

## Redeploy

```bash
cd ~/cordon && git pull && ./ops/bin/cordon-publish.sh
```

The script rebuilds both bundles, refuses if the console was built without
base `/console/`, and never deletes at the web root — `console/` and
`.well-known/` live there too.
