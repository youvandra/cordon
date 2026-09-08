// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — the difference between a budget and an amount.
 *
 * The console's first version showed each node's share of its own window, and
 * a grandchild sitting at 10% of $30 read as $27 still available. It was not:
 * the root two levels up was full, and every one of those $27 would have been
 * refused. A figure the contract will not honour is exactly the figure Rule 1
 * exists to keep off the screen.
 */
contract G1_Headroom is Base {
    function test_headroom_is_the_tightest_limit_on_the_path_not_the_nodes_own() public {
        // Fill the root from the root's own daemon — childB is capped at $60
        // and could not exhaust a $100 tree by itself. The grandchild has
        // spent nothing and its own window is untouched.
        _spend(opRoot, root, Fixtures.BUDGET6);

        assertEq(vault.windowSpent(grandchild), 0, "the grandchild has spent nothing");

        (uint128 available, bytes32 boundBy) = vault.headroom(grandchild);
        assertEq(available, 0, "and can still draw nothing");
        assertEq(boundBy, root, "because the root is what binds it");

        (bool ok,,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertFalse(ok, "headroom agrees with what a draw would do");
    }

    function test_headroom_names_the_node_that_binds_so_a_refusal_is_never_a_surprise() public {
        // The grandchild's own $30 is the tightest limit while the tree is empty.
        (uint128 available, bytes32 boundBy) = vault.headroom(grandchild);
        assertEq(available, GRAND_BUDGET6);
        assertEq(boundBy, grandchild, "its own window, at the start");

        // Spend most of the root, and the binding moves up.
        _spend(opRoot, root, 80_000_000);

        (available, boundBy) = vault.headroom(grandchild);
        assertEq(available, Fixtures.BUDGET6 - 80_000_000, "what the root has left");
        assertEq(boundBy, root, "and the root is now the reason");
    }

    function test_headroom_never_promises_more_than_the_vault_holds() public {
        vm.prank(owner);
        vault.withdraw(root, owner, Fixtures.BUDGET6 - 1_000_000);

        (uint128 available, bytes32 boundBy) = vault.headroom(grandchild);
        assertEq(available, 1_000_000, "the treasury is the limit once it is the smallest");
        assertEq(boundBy, root);
    }

    function test_a_revoked_branch_has_no_headroom_at_all() public {
        vm.prank(owner);
        reg.revoke(childA);

        (uint128 available, bytes32 boundBy) = vault.headroom(grandchild);
        assertEq(available, 0);
        assertEq(boundBy, childA, "and the record says which node was cut");
    }

    function test_headroom_falls_by_exactly_what_a_draw_took() public {
        (uint128 before,) = vault.headroom(grandchild);
        _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        (uint128 afterwards,) = vault.headroom(grandchild);

        assertEq(before - afterwards, Fixtures.TRANCHE6, "no figure drifts from the draw that moved it");
    }

    /// The property: headroom is never a promise the contract will not keep.
    function testFuzz_a_draw_of_the_headroom_is_always_released(uint8 fillSeed) public {
        uint128 fill = uint128(bound(fillSeed, 0, 20)) * Fixtures.TRANCHE6;
        if (fill > 0) _spend(opRoot, root, fill);

        (uint128 available,) = vault.headroom(grandchild);
        if (available == 0) return;

        // Draw it in tranche-sized pieces across enough sellers that
        // concentration, which bounds distribution rather than total, does not
        // stand in for the limit under test.
        uint128 moved;
        uint256 i;
        while (moved < available) {
            uint128 step = available - moved < Fixtures.TRANCHE6 ? available - moved : Fixtures.TRANCHE6;
            (bool ok,,) = _draw(opG, grandchild, _seller(i++), step);
            assertTrue(ok, "headroom promised more than the contract released");
            moved += step;
        }

        (uint128 left,) = vault.headroom(grandchild);
        assertEq(left, 0, "and having drawn it, there is none");
    }

    function _seller(uint256 i) internal returns (address) {
        return makeAddr(string.concat("seller:", vm.toString(i % 16)));
    }

    function _spend(address op, bytes32 node, uint128 total) internal {
        uint128 moved;
        uint256 i;
        while (moved < total) {
            uint128 step = total - moved < Fixtures.TRANCHE6 ? total - moved : Fixtures.TRANCHE6;
            (bool ok,,) = _draw(op, node, _seller(i++), step);
            assertTrue(ok, "setup draw was expected to release");
            moved += step;
        }
    }
}
