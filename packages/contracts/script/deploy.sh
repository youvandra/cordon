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
# Foundry asks for the keystore password on the terminal. To run unattended,
# put that password in a file only you can read and name it. The key stays in
# the keystore either way; what is named here is a password, never a key.
#
#     printf '%s' 'the password' > ~/.cordon-pw && chmod 600 ~/.cordon-pw
#     CORDON_PASSWORD_FILE=~/.cordon-pw ./script/deploy.sh
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

# ETH_PASSWORD_FILE is not read by foundry 1.8.1, which prompts anyway and
# fails with "Device not configured" when there is no terminal, so the flag is
# passed explicitly rather than exported.
PASSWORD=()
if [ -n "${CORDON_PASSWORD_FILE:-}" ]; then
  PASSWORD=(--password-file "$CORDON_PASSWORD_FILE")
fi

echo "chain     $CHAIN_ID"
echo "rpc       $RPC"
echo "account   $ACCOUNT (keystore)"

# The generated fixtures carry USDC, GatewayWallet and the two ERC-8004
# registries, so regenerate before building rather than deploying against a
# stale copy of any of them.
node ../fixtures/scripts/emit-solidity.ts

# The same four addresses, exported so the recorder writes what the script
# deployed against rather than leaving nulls beside real addresses. Solidity
# reads them through vm.envOr and falls back to the same fixtures, so there is
# still exactly one source.
fixture() { node -e "import('../fixtures/src/index.ts').then((f) => console.log($1))"; }
export CORDON_USDC="${CORDON_USDC:-$(fixture 'f.ARC.erc20')}"
export CORDON_GATEWAY="${CORDON_GATEWAY:-$(fixture 'f.GATEWAY.wallet')}"
export CORDON_IDENTITY="${CORDON_IDENTITY:-$(fixture 'f.ERC8004.identity')}"
export CORDON_REPUTATION="${CORDON_REPUTATION:-$(fixture 'f.ERC8004.reputation')}"
echo "usdc      $CORDON_USDC"
echo "gateway   $CORDON_GATEWAY"
echo "identity  $CORDON_IDENTITY"
echo "reputatn  $CORDON_REPUTATION"

SENDER="$(cast wallet address --account "$ACCOUNT" "${PASSWORD[@]}")"
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
  "${PASSWORD[@]}" \
  --broadcast

CORDON_COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)" \
  node scripts/record-deployment.mjs "$CHAIN_ID"

REGISTRY="$(node -e "console.log(require('./deployments/$CHAIN_ID.json').registry)")"
VAULT="$(node -e "console.log(require('./deployments/$CHAIN_ID.json').vault)")"
RECORD="$(node -e "console.log(require('./deployments/$CHAIN_ID.json').record)")"

# G5 needs the sources readable by anyone. arcscan runs Blockscout v11.2.8,
# confirmed against its own /api/v2/config/backend-version on 2026-09-08.
echo
echo "verifying sources on $VERIFIER_URL"
for pair in "$REGISTRY:src/MandateRegistry.sol:MandateRegistry" \
            "$VAULT:src/TreeVault.sol:TreeVault" \
            "$RECORD:src/ConductRecord.sol:ConductRecord"; do
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
echo "record    https://testnet.arcscan.app/address/$RECORD"
echo
echo "Next: open a mandate from the owner's own wallet, then fund the vault."
echo "Neither is this script's job — both need a signature only the owner has."
