#!/usr/bin/env bash
#
# Open the root mandate, from the owner's own wallet.
#
# Deliberately not part of deploy.sh: the deployer is a machine and the owner is
# a person, and the whole argument of the console is that this signature is the
# owner's. This script builds the call from `packages/fixtures` so nobody has to
# retype a bound, and it will print the calldata rather than send it if you
# would rather sign from a browser wallet.
#
#     ./script/open-mandate.sh 0x<rootOperator>                 # print only
#     CORDON_OWNER_ACCOUNT=cordon-owner ./script/open-mandate.sh 0x<rootOperator>
#
# `Params` is a 7-field tuple and its order is not the order anyone remembers:
#   (operator, budget6, lifetimeCap6, windowSeconds, trancheCap6,
#    concentrationBps, maxDepth)
# Getting `lifetimeCap6` and `windowSeconds` the wrong way round produces a
# mandate that opens, looks right, and bounds nothing anybody meant.
#
# The call is built from the contracts in this repository, so it only works
# against a deployment made from them. Run against the addresses that predate
# `lifetimeCap6` it reverts on an unknown selector, which is the direction that
# fails safely — the wrong outcome would be a mandate that opened.
set -euo pipefail

cd "$(dirname "$0")/.."

OPERATOR="${1:-}"
if [ -z "$OPERATOR" ]; then
  echo "usage: $0 <root operator address>" >&2
  exit 2
fi

CHAIN_ID="${CORDON_CHAIN_ID:-5042002}"
RPC="${CORDON_RPC:-https://rpc.testnet.arc.io}"

if [ ! -f "deployments/$CHAIN_ID.json" ]; then
  echo "no deployments/$CHAIN_ID.json — deploy first" >&2
  exit 1
fi
REGISTRY="$(node -e "console.log(require('./deployments/$CHAIN_ID.json').registry)")"

# `String()` because node prints a bigint as `20000000n`, and `cast` reads that
# as a parse error rather than as a number.
fixture() { node -e "import('../fixtures/src/index.ts').then((f) => console.log(String($1)))"; }
BUDGET="$(fixture 'f.MANDATE.budget6')"
LIFETIME="$(fixture 'f.MANDATE.lifetimeCap6')"
WINDOW="$(fixture 'f.MANDATE.windowSeconds')"
TRANCHE="$(fixture 'f.MANDATE.tranche6')"
CONCENTRATION="$(fixture 'f.MANDATE.concentrationBoundPct * 100')"
DEPTH="$(fixture 'f.MANDATE.maxDepth')"

echo "registry       $REGISTRY"
echo "operator       $OPERATOR"
echo "budget6        $BUDGET   (per window)"
echo "lifetimeCap6   $LIFETIME   (never rolls)"
echo "windowSeconds  $WINDOW"
echo "trancheCap6    $TRANCHE   (one purchase)"
echo "concentration  $CONCENTRATION bps"
echo "maxDepth       $DEPTH"
echo

SIG="open((address,uint128,uint128,uint64,uint128,uint16,uint8))"
ARG="($OPERATOR,$BUDGET,$LIFETIME,$WINDOW,$TRANCHE,$CONCENTRATION,$DEPTH)"

echo "calldata, to sign from any wallet:"
cast calldata "$SIG" "$ARG"
echo

if [ -z "${CORDON_OWNER_ACCOUNT:-}" ]; then
  echo "CORDON_OWNER_ACCOUNT is not set, so nothing was sent."
  echo "Send the calldata above to $REGISTRY from the owner's wallet, or rerun"
  echo "with CORDON_OWNER_ACCOUNT=<foundry keystore name>."
  exit 0
fi

# Empty-array expansion under `set -u` is an error in bash 3.2, which is what
# macOS ships. See the same guard in deploy.sh.
PASSWORD=()
if [ -n "${CORDON_OWNER_PASSWORD_FILE:-}" ]; then
  PASSWORD=(--password-file "$CORDON_OWNER_PASSWORD_FILE")
fi

cast send "$REGISTRY" "$SIG" "$ARG" \
  --rpc-url "$RPC" \
  --account "$CORDON_OWNER_ACCOUNT" \
  ${PASSWORD[@]+"${PASSWORD[@]}"}

echo
echo "The node id is the first topic of the MandateOpened log above."
echo "Fold it and the owner into packages/fixtures, then fund the vault."
