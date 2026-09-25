// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";

/**
 * Gas for the daemon keys.
 *
 * An operator draws, settles and names itself with its own key, and every one
 * of those is a transaction it pays for. That cost sits outside the mandate on
 * purpose: the mandate bounds what an agent may spend on the owner's behalf,
 * and gas is what it spends on its own. An operator with no gas is an agent
 * that cannot act at all, which looks from outside exactly like a refusal and
 * is not one.
 *
 * On Arc these two would be the same balance, because gas there is USDC. Here
 * they are separate tokens and this is the one that buys blocks.
 */
contract FuelOperators is Script {
    function run() external {
        address root = vm.envAddress("CORDON_OPERATOR_ROOT");
        address probe = vm.envAddress("CORDON_OPERATOR_PROBE");
        uint256 each = vm.envOr("CORDON_FUEL_WEI", uint256(0.05 ether));

        vm.startBroadcast();
        (bool okRoot,) = root.call{value: each}("");
        require(okRoot, "root operator would not take it");
        (bool okProbe,) = probe.call{value: each}("");
        require(okProbe, "probe operator would not take it");
        vm.stopBroadcast();

        console.log("root operator ", root, root.balance);
        console.log("probe operator", probe, probe.balance);
    }
}
