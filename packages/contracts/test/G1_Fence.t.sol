// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — the fence around the arithmetic.
 *
 * The tree maths is only worth something if the values it measures cannot be
 * spoofed, the money cannot arrive from anywhere else, and the people who
 * wrote the contract cannot undo what it decided. These are the tests that
 * separate a control from a dashboard.
 */
contract G1_Fence is Base {
    /* ------------------------------------------------------------------ */
    /* Derived values, not declared ones                                   */
    /* ------------------------------------------------------------------ */

    function test_the_counterparty_cannot_be_spoofed_because_it_is_the_transfer_target() public {
        // There is no "counterparty" argument to lie about. The address the
        // bound is applied to is the address that receives the money, so a
        // caller can only dodge the concentration bound by paying someone else.
        (bool ok,,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertTrue(ok);

        assertEq(usdc.balanceOf(aisa), Fixtures.TRANCHE6, "the money went where the bound was measured");
        (uint128 spent6,) = vault.concentrationBound(grandchild, aisa);
        assertEq(spent6, Fixtures.TRANCHE6, "and the bound was measured where the money went");

        (uint128 otherSpent,) = vault.concentrationBound(grandchild, allium);
        assertEq(otherSpent, 0, "nobody else was charged for it");
    }

    function test_the_notional_cannot_be_understated_because_it_is_what_leaves_the_vault() public {
        uint128 amount = Fixtures.TRANCHE6;
        uint128 treasuryBefore = vault.treasury6(root);

        _draw(opG, grandchild, aisa, amount);

        assertEq(vault.treasury6(root), treasuryBefore - amount, "the ledger moved by the drawn amount");
        assertEq(vault.windowSpent(root), amount, "and the window moved by the same one");
    }

    /* ------------------------------------------------------------------ */
    /* The vault is the only funding source                                */
    /* ------------------------------------------------------------------ */

    function test_no_agent_key_holds_a_balance_or_an_allowance() public {
        _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        _draw(opA, childA, allium, Fixtures.TRANCHE6);
        _draw(opB, childB, arkham, Fixtures.TRANCHE6);

        address[4] memory daemons = [opRoot, opA, opB, opG];
        for (uint256 i = 0; i < daemons.length; ++i) {
            assertEq(usdc.balanceOf(daemons[i]), 0, "a daemon key never holds funds");
            assertEq(usdc.allowance(address(vault), daemons[i]), 0, "and never holds an allowance on the vault");
        }
    }

    function test_a_second_tree_cannot_spend_the_first_trees_treasury() public {
        address other = makeAddr("other owner");
        vm.prank(other);
        bytes32 otherRoot = reg.open(
            MandateRegistry.Params({
                operator: other,
                budget6: Fixtures.BUDGET6,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            })
        );

        // Funds are held per root. An unfunded tree draws nothing, however
        // much USDC happens to be sitting in the vault contract.
        assertGt(usdc.balanceOf(address(vault)), 0, "the vault holds the first tree's money");

        (bool ok,, TreeVault.Reason reason) = _draw(other, otherRoot, aisa, Fixtures.TRANCHE6);
        assertFalse(ok);
        assertEq(uint256(reason), uint256(TreeVault.Reason.VaultBalance));
    }

    function test_the_vault_rejects_native_value_so_the_two_decimal_views_never_mix() public {
        // USDC on Arc is 18 decimals native and 6 as an ERC-20 view of the same
        // balance. The vault speaks only the 6-decimal view, and it has no
        // receive and no fallback, so the other view cannot get in here at all.
        vm.deal(address(this), 1 ether);
        (bool sent,) = address(vault).call{value: 1 ether}("");
        assertFalse(sent, "native USDC has no way into the vault");

        (bool sentToRegistry,) = address(reg).call{value: 1 ether}("");
        assertFalse(sentToRegistry, "nor into the registry");
    }

    function test_only_the_nodes_own_daemon_may_draw_for_it() public {
        vm.prank(opB);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOperator.selector, grandchild, opB));
        vault.draw(grandchild, aisa, Fixtures.TRANCHE6);

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOperator.selector, grandchild, owner));
        vault.draw(grandchild, aisa, Fixtures.TRANCHE6);
    }

    /* ------------------------------------------------------------------ */
    /* The refusal survives its authors — the shape of G5, asserted early   */
    /* ------------------------------------------------------------------ */

    function test_the_deployer_holds_no_power_over_any_tree() public {
        (, uint256 id,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);

        vm.startPrank(deployer);
        vm.expectRevert(MandateRegistry.NotOwner.selector);
        reg.revoke(root);

        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOwner.selector, root, deployer));
        vault.release(id);

        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOwner.selector, root, deployer));
        vault.withdraw(root, deployer, 1);
        vm.stopPrank();

        assertEq(uint256(vault.refusal(id).reason), uint256(TreeVault.Reason.TrancheCap), "the refusal is unchanged");
    }

    function test_nothing_in_either_contract_can_erase_a_refusal() public {
        (, uint256 id,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);
        TreeVault.Refusal memory before = vault.refusal(id);

        // The owner has the most authority in the system. They can sign an
        // exception beside the record; they cannot remove it.
        vm.startPrank(owner);
        vault.release(id);
        reg.revoke(root);
        vault.withdraw(root, owner, vault.treasury6(root));
        vm.stopPrank();

        TreeVault.Refusal memory afterwards = vault.refusal(id);
        assertEq(afterwards.node, before.node);
        assertEq(afterwards.breachedAt, before.breachedAt);
        assertEq(afterwards.amount6, before.amount6);
        assertEq(uint256(afterwards.reason), uint256(before.reason));
        assertEq(afterwards.at, before.at);
        assertEq(vault.refusalCount(), 1, "and the count only ever grows");
    }

    function test_the_owner_can_take_their_money_back_but_that_is_not_a_reversal() public {
        vm.prank(owner);
        vault.withdraw(root, owner, Fixtures.BUDGET6);

        (bool ok,, TreeVault.Reason reason) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertFalse(ok, "an empty treasury refuses like any other bound");
        assertEq(uint256(reason), uint256(TreeVault.Reason.VaultBalance));
    }
}
