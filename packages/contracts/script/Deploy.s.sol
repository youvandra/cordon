// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IGatewayWallet} from "../src/interfaces/IGatewayWallet.sol";
import {Fixtures} from "../test/Fixtures.gen.sol";

/**
 * Deploy Cordon.
 *
 * Two contracts, no proxy, no admin key, no constructor owner. The deployer
 * pays for the transaction and gains nothing from it — that is checked at the
 * end rather than asserted in a README, because "the refusal survives its
 * authors" is the claim and this is the moment it becomes true or does not.
 *
 * Addresses are read from the generated fixtures, so the one place USDC and
 * GatewayWallet are written down stays packages/fixtures. Both are overridable
 * for a fork or a local run, which is the only reason the env lookups exist.
 *
 *   forge script script/Deploy.s.sol:Deploy \
 *     --rpc-url $ARC_RPC --account cordon-deployer --broadcast
 */
contract Deploy is Script {
    function run() external {
        address usdc = vm.envOr("CORDON_USDC", Fixtures.USDC);
        address gateway = vm.envOr("CORDON_GATEWAY", Fixtures.GATEWAY_WALLET);

        require(usdc.code.length > 0, "USDC has no code on this chain");
        require(gateway.code.length > 0, "GatewayWallet has no code on this chain");

        vm.startBroadcast();

        MandateRegistry registry = new MandateRegistry();
        TreeVault vault = new TreeVault(IERC20(usdc), registry, IGatewayWallet(gateway));

        vm.stopBroadcast();

        console.log("chainId  ", block.chainid);
        console.log("registry ", address(registry));
        console.log("vault    ", address(vault));
        console.log("usdc     ", usdc);
        console.log("gateway  ", gateway);

        _assertNoBackDoor(registry, vault);
    }

    /**
     * The deployer must hold nothing. There is no owner variable, no admin
     * role and no proxy, so this checks the only things that could still be
     * true by accident: that the vault trusts nobody at deploy time and that
     * the registry has no mandate the deployer already controls.
     */
    function _assertNoBackDoor(MandateRegistry registry, TreeVault vault) private view {
        require(address(vault.registry()) == address(registry), "vault points at another registry");
        require(vault.treasury6(bytes32(0)) == 0, "vault opened with a balance");
        require(!registry.exists(bytes32(0)), "registry opened with a mandate");
    }
}
