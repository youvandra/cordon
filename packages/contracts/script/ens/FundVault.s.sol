// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {TreeVault} from "../../src/TreeVault.sol";
import {IERC20} from "../../src/interfaces/IERC20.sol";
import {Fixtures} from "../../test/Fixtures.gen.sol";

/**
 * Put money behind the root, so the tree's headroom is a real number.
 *
 * The vault is the only funding source in this system: no agent key holds a
 * balance, and a draw moves money out of here and nowhere else. Funding is the
 * owner's own transaction, which is the point — nothing in this repository can
 * move money into a tree on somebody's behalf.
 *
 * The amount is the mandate's budget, from `packages/fixtures`. Funding more
 * than the budget would not widen anything: the budget is what the contract
 * enforces, and the treasury is only what it can pay out of.
 */
contract FundVault is Script {
    function run() external {
        TreeVault vault = TreeVault(vm.envAddress("CORDON_VAULT"));
        IERC20 usdc = IERC20(vm.envAddress("CORDON_USDC"));
        bytes32 root = vm.envBytes32("CORDON_ROOT_NODE");
        uint128 amount6 = uint128(vm.envOr("CORDON_FUND6", uint256(Fixtures.BUDGET6)));

        vm.startBroadcast();
        /* Exactly this deposit. The vault carries no standing allowance from
           an owner, for the same reason it carries none to Circle. */
        usdc.approve(address(vault), amount6);
        vault.fund(root, amount6);
        vm.stopBroadcast();

        (uint128 available6, bytes32 boundBy) = vault.headroom(vm.envBytes32("CORDON_PROBE_NODE"));
        console.log("funded6        ", amount6);
        console.log("treasury6      ", vault.treasury6(root));
        console.log("probe headroom6", available6);
        console.log("probe bound by (root means the limit is above it)");
        console.logBytes32(boundBy);
    }
}
