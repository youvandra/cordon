#!/usr/bin/env bash
#
# Deploy Cordon to Arc, record the addresses, verify the sources.
#
# The private key is never an argument to this script and never an environment
# variable. Foundry keeps it in an encrypted keystore and asks for the password
# when it needs to sign:
#
#     cast wallet import cordon-deployer --interactive
#
# After that, this script never sees it and neither does your shell history.
#
#     ./script/deploy.sh                 # Arc testnet, from packages/fixtures
#     CORDON_ACCOUNT=other ./script/deploy.sh
#
set -euo pipefail

cd "$(dirname "$0")/.."

CHAIN_ID="${CORDON_CHAIN_ID:-5042002}"
RPC="${CORDON_RPC:-https://rpc.testnet.arc.io}"
ACCOUNT="${CORDON_ACCOUNT:-cordon-deployer}"
VERIFIER_URL="${CORDON_VERIFIER_URL:-https://testnet.arcscan.app/api/}"

echo "chain     $CHAIN_ID"
echo "rpc       $RPC"
echo "account   $ACCOUNT (keystore)"

# The generated fixtures carry USDC and GatewayWallet, so regenerate before
# building rather than deploying against a stale copy of either.
node ../fixtures/scripts/emit-solidity.ts

SENDER="$(cast wallet address --account "$ACCOUNT")"
echo "sender    $SENDER"

BALANCE="$(cast balance "$SENDER" --rpc-url "$RPC")"
echo "balance   $BALANCE wei (gas on Arc is USDC, 18 decimals)"
if [ "$BALANCE" = "0" ]; then
  echo
  echo "This account holds nothing on chain $CHAIN_ID. Fund it first:"
  echo "  https://faucet.circle.com"
  exit 1
fi

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$RPC" \
  --account "$ACCOUNT" \
  --sender "$SENDER" \
  --broadcast

CORDON_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)" \
  node scripts/record-deployment.mjs "$CHAIN_ID"

REGISTRY="$(node -e "console.log(require('./deployments/$CHAIN_ID.json').registry)")"
VAULT="$(node -e "console.log(require('./deployments/$CHAIN_ID.json').vault)")"

# G5 needs the sources readable by anyone. arcscan runs Blockscout v11.2.8,
# confirmed against its own /api/v2/config/backend-version on 2026-09-08.
echo
echo "verifying sources on $VERIFIER_URL"
for pair in "$REGISTRY:src/MandateRegistry.sol:MandateRegistry" "$VAULT:src/TreeVault.sol:TreeVault"; do
  ADDR="${pair%%:*}"
  TARGET="${pair#*:}"
  forge verify-contract "$ADDR" "$TARGET" \
    --chain-id "$CHAIN_ID" \
    --verifier blockscout \
    --verifier-url "$VERIFIER_URL" \
    --watch || echo "verification failed for $TARGET — rerun forge verify-contract by hand"
done

echo
echo "registry  https://testnet.arcscan.app/address/$REGISTRY"
echo "vault     https://testnet.arcscan.app/address/$VAULT"
echo
echo "Next: open a mandate from the owner's own wallet, then fund the vault."
echo "Neither is this script's job — both need a signature only the owner has."
