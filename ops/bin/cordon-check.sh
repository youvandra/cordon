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
RPC="${CORDON_RPC:-https://rpc.testnet.arc.io}"
CHAIN_ID="${CORDON_CHAIN_ID:-5042002}"
REPO="$(cd "$(dirname "$0")/../.." && pwd)"

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
CHAIN="$(cast chain-id --rpc-url "$RPC" 2>/dev/null || echo "")"
[ "$CHAIN" = "$CHAIN_ID" ] && ok "rpc reports $CHAIN" || bad "rpc reported '${CHAIN:-nothing}', wanted $CHAIN_ID"

DEPLOYMENT="$REPO/packages/contracts/deployments/$CHAIN_ID.json"
if [ ! -f "$DEPLOYMENT" ]; then
  pending "no deployments/$CHAIN_ID.json"
else
  for name in registry vault record; do
    addr="$(node -e "console.log(require('$DEPLOYMENT').$name)")"
    size="$(cast code "$addr" --rpc-url "$RPC" 2>/dev/null | wc -c | tr -d ' ')"
    [ "${size:-0}" -gt 2 ] \
      && ok "$name has code at $addr" \
      || bad "$name at $addr has no code on chain $CHAIN_ID"
  done

  # The README is generated from this file, so a mismatch means someone edited
  # one of them by hand.
  reg="$(node -e "console.log(require('$DEPLOYMENT').registry)")"
  grep -q "$reg" "$REPO/README.md" \
    && ok "README names the deployed registry" \
    || bad "README does not name $reg — run scripts/record-readme.mjs"
fi

echo "services"
if [ -n "${CORDON_METER:-}" ]; then
  # The one thing chain state can prove about money that has left the vault:
  # an operator's Gateway balance never exceeds what the vault released to it.
  RECON="$(curl -s --max-time 15 "$CORDON_METER/reconcile" || true)"
  case "$RECON" in
    *'"ok": true'*)  ok "meter reconciles: no operator holds more than the vault released" ;;
    *'"ok": false'*) bad "reconciliation FAILED — money reached an operator from outside the tree" ;;
    *'not computed yet'*) pending "meter has not reconciled yet" ;;
    *) bad "meter did not answer /reconcile" ;;
  esac
else
  pending "no CORDON_METER set, so nothing asked the meter"
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
