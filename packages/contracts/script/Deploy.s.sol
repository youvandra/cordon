// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IGatewayWallet} from "../src/interfaces/IGatewayWallet.sol";
import {ConductRecord} from "../src/ConductRecord.sol";
import {IIdentityRegistry, IReputationRegistry} from "../src/interfaces/IERC8004.sol";
import {Fixtures} from "../test/Fixtures.gen.sol";

/**
 * Deploy Cordon.
 *
 * Three contracts, no proxy, no admin key, no constructor owner. The deployer
 * pays for the transaction and gains nothing from it — that is checked at the
 * end rather than asserted in a README, because "the refusal survives its
 * authors" is the claim and this is the moment it becomes true or does not.
 *
 * The ERC-8004 registries are not among them. They are already live at
 * deterministic addresses on this chain, which is the whole reason the record
 * goes there: a registry we deployed would be a silo, and this one is read by
 * everyone. The script checks they are really there and stops if they are not,
 * because a ConductRecord pointing at an empty address would look deployed and
 * write nothing.
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
        address identity = vm.envOr("CORDON_IDENTITY", Fixtures.IDENTITY_REGISTRY);
        address reputation = vm.envOr("CORDON_REPUTATION", Fixtures.REPUTATION_REGISTRY);

        require(usdc.code.length > 0, "USDC has no code on this chain");
        require(gateway.code.length > 0, "GatewayWallet has no code on this chain");
        require(identity.code.length > 0, "ERC-8004 Identity has no code on this chain");
        require(reputation.code.length > 0, "ERC-8004 Reputation has no code on this chain");

        vm.startBroadcast();

        MandateRegistry registry = new MandateRegistry();
        TreeVault vault = new TreeVault(IERC20(usdc), registry, IGatewayWallet(gateway));
        ConductRecord record =
            new ConductRecord(vault, IIdentityRegistry(identity), IReputationRegistry(reputation));

        vm.stopBroadcast();

        console.log("chainId  ", block.chainid);
        console.log("registry ", address(registry));
        console.log("vault    ", address(vault));
        console.log("record   ", address(record));
        console.log("usdc     ", usdc);
        console.log("gateway  ", gateway);
        console.log("identity ", identity);
        console.log("reputatn ", reputation);

        _assertNoBackDoor(registry, vault, record);
    }

    /**
     * The deployer must hold nothing. There is no owner variable, no admin
     * role and no proxy, so this checks the only things that could still be
     * true by accident: that the vault trusts nobody at deploy time and that
     * the registry has no mandate the deployer already controls.
     */
    function _assertNoBackDoor(MandateRegistry registry, TreeVault vault, ConductRecord record)
        private
        view
    {
        require(address(vault.registry()) == address(registry), "vault points at another registry");
        require(vault.treasury6(bytes32(0)) == 0, "vault opened with a balance");
        require(!registry.exists(bytes32(0)), "registry opened with a mandate");
        /* The seat must read the vault it was deployed beside. A record
           contract pointed at some other vault would write true-looking
           refusals about a tree nobody here can audit. */
        require(address(record.vault()) == address(vault), "record points at another vault");
        require(address(record.registry()) == address(registry), "record points at another registry");
    }
}
