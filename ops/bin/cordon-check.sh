#!/usr/bin/env bash
#
# What is actually true of the live system, from outside it.
#
# Written to be run from anywhere, including a laptop on the morning of a
# judging round. It asks the deployed surfaces rather than the repository, so
# a stale bundle on the box or a service that quietly exited shows up here and
# not in a demo.
#
# A pending thing is not a failure: no mandate and no meter are the honest
# state of a project whose gates say so. This exits non-zero only when
# something claims to be up and is wrong.
#
#     ops/bin/cordon-check.sh
#     CORDON_SITE=http://localhost:5274 ops/bin/cordon-check.sh
set -uo pipefail

SITE="${CORDON_SITE:-https://getcordon.xyz}"
ATTEST="${CORDON_ATTEST:-https://attest.getcordon.xyz}"
CHAIN_ID="${CORDON_CHAIN_ID:-5042002}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

# Ask the chain the same way the box does. Circle's endpoint rate limits an
# address that has run a backfill and then answers nothing at all, so a check
# using it reported three deployed, verified contracts as having no code —
# a checker that cannot ask must never answer on the chain's behalf.
if [ -z "${CORDON_RPC:-}" ] && [ -f "$HOME/cordon/.env.meter" ]; then
  # shellcheck disable=SC1090
  . "$HOME/cordon/.env.meter"
fi
RPC="${CORDON_RPC:-https://rpc.testnet.arc.io}"

# The meter is served beside the site, so there is a default worth having.
METER="${CORDON_METER:-$SITE/api}"

fail=0
ok()      { printf '  ok       %s\n' "$1"; }
pending() { printf '  pending  %s\n' "$1"; }
bad()     { printf '  WRONG    %s\n' "$1"; fail=1; }

code() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$1"; }

echo "site"
for path in "/" "/console/" "/docs" "/drill"; do
  status="$(code "$SITE$path")"
  case "$status" in
    200) ok "$path" ;;
    *)   bad "$path answered $status" ;;
  esac
done

# The bundle, not the page: index.html barely changes between builds, so a
# stale deploy looks fine from the outside until you read the JavaScript.
BUNDLE="$(curl -s --max-time 15 "$SITE/" | grep -o 'assets/[^"]*\.js' | head -1)"
if [ -z "$BUNDLE" ]; then
  bad "no bundle referenced by the landing page"
else
  # Two traps in one line, both of which report a current deploy as a stale
  # one. The body is never held in a variable, because a minified bundle has
  # bytes no shell wants to re-emit and `echo "$BODY"` dies with "character
  # not in range". And `grep -q` exits on the first match, which SIGPIPEs
  # curl, which under `pipefail` fails the whole pipeline — so it counts
  # instead of quitting.
  MATCHES="$(curl -s --max-time 30 "$SITE/$BUNDLE" | grep -c "the work still gets done" || true)"
  if [ "${MATCHES:-0}" -gt 0 ]; then
    ok "bundle carries G7 ($BUNDLE)"
  else
    bad "bundle $BUNDLE predates G7 — the box is serving an old build"
  fi
fi

echo "chain"

# Asked over plain JSON-RPC rather than through `cast`. This script is meant to
# run anywhere, and the box that serves the site has no Foundry on it — the
# version that shelled out to `cast` reported three deployed, verified
# contracts as having no code, which is what a missing tool looks like when
# its absence is read as an answer.
rpc() {
  curl -s --max-time 15 -X POST "$RPC" \
    -H 'content-type: application/json' \
    -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"$1\",\"params\":$2}"
}
rpc_result() {
  printf '%s' "$1" | sed -n 's/.*"result":"\([^"]*\)".*/\1/p'
}

CHAIN_HEX="$(rpc eth_chainId '[]')"
CHAIN_HEX="$(rpc_result "$CHAIN_HEX")"
if [ -n "$CHAIN_HEX" ]; then
  CHAIN="$((CHAIN_HEX))"
else
  CHAIN=""
fi
if [ "$CHAIN" = "$CHAIN_ID" ]; then
  ok "rpc reports $CHAIN"
elif [ -z "$CHAIN" ]; then
  pending "$RPC did not answer; nothing below it is a statement about the chain"
else
  bad "rpc reported '$CHAIN', wanted $CHAIN_ID"
fi

DEPLOYMENT="$REPO/packages/contracts/deployments/$CHAIN_ID.json"
if [ ! -f "$DEPLOYMENT" ]; then
  pending "no deployments/$CHAIN_ID.json"
else
  for name in registry vault record; do
    addr="$(node -e "console.log(require('$DEPLOYMENT').$name)")"
    body="$(rpc eth_getCode "[\"$addr\",\"latest\"]")"
    codehex="$(rpc_result "$body")"
    if [ -z "$codehex" ]; then
      # An endpoint that refused to answer is not a contract that is missing.
      pending "$name at $addr: the rpc would not answer"
    elif [ "${#codehex}" -gt 2 ]; then
      ok "$name has code at $addr"
    else
      bad "$name at $addr has no code on chain $CHAIN_ID"
    fi
  done

  # The README is generated from this file, so a mismatch means someone edited
  # one of them by hand.
  reg="$(node -e "console.log(require('$DEPLOYMENT').registry)")"
  grep -q "$reg" "$REPO/README.md" \
    && ok "README names the deployed registry" \
    || bad "README does not name $reg — run scripts/record-readme.mjs"
fi

echo "services"
if [ -n "$METER" ]; then
  # The one thing chain state can prove about money that has left the vault:
  # an operator's Gateway balance never exceeds what the vault released to it.
  RECON="$(curl -s --max-time 15 "$METER/reconcile" || true)"
  case "$RECON" in
    *'"ok": true'*)  ok "meter reconciles: no operator holds more than the vault released" ;;
    *'"ok": false'*) bad "reconciliation FAILED — money reached an operator from outside the tree" ;;
    *'not computed yet'*) pending "meter has not reconciled yet" ;;
    *) bad "meter did not answer /reconcile" ;;
  esac
else
  pending "no meter to ask"
fi

status="$(code "$ATTEST/health")"
case "$status" in
  200) ok "attest answers /health" ;;
  502|000) pending "attest is not running ($status) — it needs CORDON_ATTEST_KEY" ;;
  *)   bad "attest answered $status" ;;
esac

echo
[ "$fail" = 0 ] && echo "nothing is wrong; what is pending is pending on purpose" || echo "something above is wrong"
exit "$fail"
