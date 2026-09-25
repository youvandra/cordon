// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreeVault} from "../../src/TreeVault.sol";
import {MandateRegistry} from "../../src/MandateRegistry.sol";

/**
 * An agent spending, and being told no.
 *
 * Signed by the agent's own operator key, because that is the only address the
 * vault will accept for this node. The counterparty and the amount come from
 * outside; whether the money moves is decided here, by the contract, against
 * the mandate and every mandate above it.
 *
 * **A refused draw returns rather than reverting.** A revert would roll back
 * the events and leave no trace, and a refusal nobody can read is not a
 * record. So this prints the reason it was given rather than catching an
 * error, and the same call that refused wrote the refusal to the agent's
 * conduct record.
 */
contract AgentDraws is Script {
    function run() external {
        TreeVault vault = TreeVault(vm.envAddress("CORDON_VAULT"));
        MandateRegistry registry = MandateRegistry(vm.envAddress("CORDON_REGISTRY"));
        bytes32 node = vm.envBytes32("CORDON_DRAW_NODE");
        address seller = vm.envAddress("CORDON_SELLER");
        uint128 amount6 = uint128(vm.envOr("CORDON_DRAW6", uint256(1_000_000)));

        (uint128 before6, ) = vault.headroom(node);
        console.log("headroom before", before6);
        console.log("live before    ", registry.isLive(node));

        vm.startBroadcast();
        (bool released, uint256 refusalId, TreeVault.Reason reason) =
            vault.draw(node, seller, amount6);
        vm.stopBroadcast();

        (uint128 after6, ) = vault.headroom(node);
        console.log("released       ", released);
        console.log("reason         ", uint8(reason));
        console.log("refusalId      ", refusalId);
        console.log("headroom after ", after6);
        console.log("seller holds   ", amount6);
    }
}
