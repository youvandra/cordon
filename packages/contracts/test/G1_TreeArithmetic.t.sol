// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — tree arithmetic.
 *
 * The claim this file defends: each child obeys its own limit, every limit is
 * respected, and somebody finally computes the total. A trailing window on one
 * agent is reproducible by giving that agent a smaller wallet. Debiting every
 * ancestor is not.
 */
contract G1_TreeArithmetic is Base {
    function test_grandchild_draw_debits_every_ancestor_or_delegation_is_the_bypass() public {
        uint128 amount = Fixtures.TRANCHE6;

        (bool ok,,) = _draw(opG, grandchild, aisa, amount);
        assertTrue(ok, "a draw inside every bound must release");

        assertEq(vault.windowSpent(grandchild), amount, "the spender");
        assertEq(vault.windowSpent(childA), amount, "the parent");
        assertEq(vault.windowSpent(root), amount, "the root");
        assertEq(vault.windowSpent(childB), 0, "an unrelated branch pays nothing");
    }

    function test_two_children_cannot_each_spend_their_own_budget_because_the_root_sees_both() public {
        // childA and childB are each allowed $60 of a $100 root. Their own
        // limits are obeyed the whole way through; the root's is what binds.
        _spendAcross(opA, childA, aisa, 4); // $20
        _spendAcross(opA, childA, allium, 4); // $20
        _spendAcross(opA, childA, arkham, 4); // $20
        assertEq(vault.windowSpent(childA), CHILD_BUDGET6, "childA spent exactly its own budget");

        _spendAcross(opB, childB, aisa, 3); // $15
        _spendAcross(opB, childB, allium, 3); // $15
        _spendAcross(opB, childB, arkham, 2); // $10
        assertEq(vault.windowSpent(root), Fixtures.BUDGET6, "the root is now exactly at its budget");

        uint128 spentByB = vault.windowSpent(childB);
        assertLt(spentByB, CHILD_BUDGET6, "childB still has room under its own limit");

        (bool ok,, TreeVault.Reason reason) = _draw(opB, childB, arkham, Fixtures.TRANCHE6);
        assertFalse(ok, "the draw must not release");
        assertEq(uint256(reason), uint256(TreeVault.Reason.WindowBudget), "stopped by a budget, not a cap");
        assertEq(vault.windowSpent(childB), spentByB, "and childB's own window is untouched");
    }

    function test_the_refusal_names_the_ancestor_that_breached_not_the_node_that_asked() public {
        _spendAcross(opA, childA, aisa, 4);
        _spendAcross(opA, childA, allium, 4);
        _spendAcross(opA, childA, arkham, 4);
        _spendAcross(opB, childB, aisa, 3);
        _spendAcross(opB, childB, allium, 3);
        _spendAcross(opB, childB, arkham, 2);

        (, uint256 id,) = _draw(opB, childB, arkham, Fixtures.TRANCHE6);
        TreeVault.Refusal memory r = vault.refusal(id);

        assertEq(r.node, childB, "the node that asked");
        assertEq(r.breachedAt, root, "the node whose bound stopped it");
    }

    function test_ancestorDebit_view_agrees_with_what_a_draw_would_do() public {
        _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);

        (bytes32[] memory nodes, uint128[] memory after6, uint128[] memory budget6) =
            vault.ancestorDebit(grandchild, Fixtures.TRANCHE6);

        assertEq(nodes.length, 3, "grandchild, childA, root");
        assertEq(nodes[0], grandchild);
        assertEq(nodes[1], childA);
        assertEq(nodes[2], root);

        for (uint256 i = 0; i < nodes.length; ++i) {
            assertEq(after6[i], Fixtures.TRANCHE6 * 2, "the view predicts the second draw");
        }
        assertEq(budget6[0], GRAND_BUDGET6);
        assertEq(budget6[1], CHILD_BUDGET6);
        assertEq(budget6[2], Fixtures.BUDGET6);
    }

    function test_the_window_rolls_and_a_parent_never_drifts_out_of_phase_with_its_child() public {
        _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertEq(vault.windowSpent(root), Fixtures.TRANCHE6);

        // One second before the window closes, nothing has reset.
        vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS - 1);
        assertEq(vault.windowSpent(root), Fixtures.TRANCHE6, "still inside the window");
        assertEq(vault.windowSpent(grandchild), Fixtures.TRANCHE6);

        // One second later, every node on the path resets together, because
        // the windows are equal in length and advanced in whole multiples.
        vm.warp(block.timestamp + 1);
        assertEq(vault.windowSpent(root), 0, "root reset");
        assertEq(vault.windowSpent(childA), 0, "parent reset");
        assertEq(vault.windowSpent(grandchild), 0, "child reset in the same second");
    }

    /// @dev The property, not an example of it. No sequence of draws anywhere
    ///      in the tree may put the root over its budget.
    function testFuzz_no_sequence_of_draws_anywhere_puts_the_root_over_its_budget(
        uint128[12] calldata amounts,
        uint8[12] calldata whichNode,
        uint8[12] calldata whichPayee
    ) public {
        bytes32[4] memory nodes = [root, childA, childB, grandchild];
        address[4] memory ops = [opRoot, opA, opB, opG];
        address[3] memory payees = [aisa, allium, arkham];

        for (uint256 i = 0; i < 12; ++i) {
            uint128 amount = uint128(bound(amounts[i], 1, Fixtures.TRANCHE6 * 2));
            uint256 n = whichNode[i] % 4;
            _draw(ops[n], nodes[n], payees[whichPayee[i] % 3], amount);

            assertLe(vault.windowSpent(root), Fixtures.BUDGET6, "root budget is the ceiling");
            assertLe(vault.windowSpent(childA), CHILD_BUDGET6, "childA obeys its own");
            assertLe(vault.windowSpent(childB), CHILD_BUDGET6, "childB obeys its own");
            assertLe(vault.windowSpent(grandchild), GRAND_BUDGET6, "grandchild obeys its own");
        }
    }

    /// @dev The vault can never pay out more than it was funded.
    function testFuzz_the_vault_is_the_only_funding_source(
        uint128[12] calldata amounts,
        uint8[12] calldata whichNode
    ) public {
        bytes32[4] memory nodes = [root, childA, childB, grandchild];
        address[4] memory ops = [opRoot, opA, opB, opG];

        for (uint256 i = 0; i < 12; ++i) {
            uint128 amount = uint128(bound(amounts[i], 1, Fixtures.TRANCHE6 * 2));
            uint256 n = whichNode[i] % 4;
            _draw(ops[n], nodes[n], aisa, amount);
        }

        // Released money now sits in Gateway rather than with a seller: the
        // draw is a top-up, and the payment out of it happens off chain.
        uint256 released = usdc.balanceOf(address(gateway));
        assertEq(released + usdc.balanceOf(address(vault)), Fixtures.BUDGET6, "nothing appeared and nothing vanished");
        assertEq(vault.treasury6(root), uint128(Fixtures.BUDGET6 - released), "the ledger matches the balance");
        assertEq(
            gateway.availableBalance(address(usdc), opRoot)
                + gateway.availableBalance(address(usdc), opA)
                + gateway.availableBalance(address(usdc), opB)
                + gateway.availableBalance(address(usdc), opG),
            released,
            "and every cent of it is credited to the daemon that drew it"
        );
    }

    function _spendAcross(address op, bytes32 node, address payee, uint256 times) internal {
        for (uint256 i = 0; i < times; ++i) {
            (bool ok,,) = _draw(op, node, payee, Fixtures.TRANCHE6);
            assertTrue(ok, "setup draw was expected to release");
        }
    }
}
