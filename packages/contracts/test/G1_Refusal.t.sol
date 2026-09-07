// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — what a refusal is.
 *
 * A refusal is the product. It has to be a record, which means it must not
 * revert; it must cost the refused branch nothing, which means it must not
 * touch a window; and it must not be undoable, which means nothing may erase
 * it — including the owner, whose exit is to sign an exception beside it.
 */
contract G1_Refusal is Base {
    function test_a_refused_draw_returns_and_never_reverts_so_the_record_survives() public {
        // A revert would roll the event back with it, and a refusal that
        // leaves no trace is not a record.
        (bool ok, uint256 id, TreeVault.Reason reason) =
            _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);

        assertFalse(ok, "released nothing");
        assertGt(id, 0, "but wrote a record");
        assertEq(uint256(reason), uint256(TreeVault.Reason.TrancheCap));
        assertEq(vault.refusalCount(), 1, "and the record is on chain");
    }

    function test_a_refusal_consumes_no_budget_so_it_cannot_burn_down_a_rival_branch() public {
        (bool ok,,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6);
        assertTrue(ok);
        uint128 before = vault.windowSpent(root);

        // childB hammers the tranche cap. If a refusal debited anything,
        // one branch could exhaust the root's window without ever being
        // allowed to spend a cent of it.
        for (uint256 i = 0; i < 20; ++i) {
            (bool released,,) = _draw(opB, childB, arkham, Fixtures.TRANCHE6 + 1);
            assertFalse(released);
        }

        assertEq(vault.windowSpent(root), before, "the root's window is untouched");
        assertEq(vault.windowSpent(childB), 0, "and so is the refused branch's");
        assertEq(vault.refusalCount(), 20, "every attempt is on the record");
    }

    function test_a_single_draw_cannot_exceed_the_tranche_cap() public {
        (bool ok,, TreeVault.Reason reason) = _draw(opRoot, root, arkham, Fixtures.TRANCHE6 + 1);
        assertFalse(ok);
        assertEq(uint256(reason), uint256(TreeVault.Reason.TrancheCap));

        (bool exact,,) = _draw(opRoot, root, arkham, Fixtures.TRANCHE6);
        assertTrue(exact, "the cap itself is allowed; it is a bound, not a strict one");
    }

    /**
     * The structuring beat. Ten thousand calls at $0.008 to one seller is $80,
     * and every single one of them is under any per-transfer cap ever written.
     * The concentration bound is the thing that sees it.
     */
    function test_ten_thousand_small_calls_to_one_seller_are_refused_by_concentration() public {
        (, uint128 limit6) = vault.concentrationBound(grandchild, aisa);
        assertEq(limit6, GRAND_BUDGET6 * Fixtures.CONCENTRATION_BPS / 10_000, "35% of the node's window");

        uint256 released;
        for (uint256 i = 0; i < Fixtures.STRUCTURING_CALLS; ++i) {
            (bool ok,, TreeVault.Reason reason) = _draw(opG, grandchild, aisa, Fixtures.STRUCTURING_UNIT6);
            if (!ok) {
                assertEq(uint256(reason), uint256(TreeVault.Reason.Concentration), "not a per-transfer cap");
                break;
            }
            ++released;
        }

        assertLt(released, Fixtures.STRUCTURING_CALLS, "it stopped well short of ten thousand");
        assertLe(released * Fixtures.STRUCTURING_UNIT6, limit6, "and stopped at the bound");
        assertGt((released + 1) * Fixtures.STRUCTURING_UNIT6, limit6, "not one call earlier than the bound");
    }

    function test_the_concentration_bound_is_per_counterparty_not_per_total() public {
        (, uint128 limit6) = vault.concentrationBound(grandchild, aisa);
        uint128 chunk = Fixtures.TRANCHE6;
        uint256 fits = limit6 / chunk;

        for (uint256 i = 0; i < fits; ++i) {
            (bool ok,,) = _draw(opG, grandchild, aisa, chunk);
            assertTrue(ok);
        }
        (bool refused,, TreeVault.Reason reason) = _draw(opG, grandchild, aisa, chunk);
        assertFalse(refused, "one seller is full");
        assertEq(uint256(reason), uint256(TreeVault.Reason.Concentration));

        (bool other,,) = _draw(opG, grandchild, allium, chunk);
        assertTrue(other, "a different seller is still open, this bounds concentration, not spend");
    }

    function test_revoking_a_parent_kills_every_descendant_in_one_transaction() public {
        (bool before,,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertTrue(before);

        vm.prank(owner);
        reg.revoke(childA); // one transaction, constant cost, whole subtree

        (bool ok, uint256 id, TreeVault.Reason reason) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertFalse(ok, "the grandchild died with its parent");
        assertEq(uint256(reason), uint256(TreeVault.Reason.Revoked));
        assertEq(vault.refusal(id).breachedAt, childA, "the record names the node that was cut");

        (bool sibling,,) = _draw(opB, childB, aisa, Fixtures.TRANCHE6);
        assertTrue(sibling, "an unrelated branch keeps working");
    }

    function test_a_cut_branch_still_trying_to_spend_is_recorded_rather_than_reverted() public {
        vm.prank(owner);
        reg.revoke(childA);

        for (uint256 i = 0; i < 5; ++i) {
            _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        }
        assertEq(vault.refusalCount(), 5, "conduct after revocation is exactly what the record is for");
    }

    function test_a_parents_daemon_can_cut_its_own_subtree_without_waking_the_owner() public {
        vm.prank(opRoot);
        reg.revoke(childA);
        assertFalse(reg.isLive(grandchild));
    }

    function test_a_daemon_cannot_cut_a_branch_it_does_not_sit_above() public {
        vm.prank(opB);
        vm.expectRevert(MandateRegistry.NotOwner.selector);
        reg.revoke(childA);
    }

    function test_a_node_cannot_revoke_itself_out_of_a_refusal_and_back_in() public {
        vm.prank(owner);
        reg.revoke(childA);
        // There is no un-revoke. The only way back is a new mandate, which is
        // a new record, not a repaired one.
        assertFalse(reg.isLive(childA));
    }

    /* ------------------------------------------------------------------ */
    /* Release — the human exit                                            */
    /* ------------------------------------------------------------------ */

    function test_release_pays_the_refused_counterparty_and_leaves_the_refusal_standing() public {
        (, uint256 id,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);

        vm.prank(owner);
        vault.release(id);

        assertEq(usdc.balanceOf(aisa), Fixtures.TRANCHE6 + 1, "the named human moved the money");

        TreeVault.Refusal memory r = vault.refusal(id);
        assertTrue(r.released, "the exception is recorded");
        assertEq(uint256(r.reason), uint256(TreeVault.Reason.TrancheCap), "and the refusal it answers is still there");
    }

    function test_release_does_not_widen_a_bound_the_next_draw_is_refused_the_same_way() public {
        (, uint256 id,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);
        vm.prank(owner);
        vault.release(id);

        (bool ok,, TreeVault.Reason reason) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);
        assertFalse(ok, "the bound did not move");
        assertEq(uint256(reason), uint256(TreeVault.Reason.TrancheCap));
    }

    function test_only_the_named_human_can_release_not_the_daemon_that_was_refused() public {
        (, uint256 id,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);

        vm.prank(opG);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOwner.selector, root, opG));
        vault.release(id);
    }

    function test_a_release_cannot_be_replayed() public {
        (, uint256 id,) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6 + 1);

        vm.startPrank(owner);
        vault.release(id);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.AlreadyReleased.selector, id));
        vault.release(id);
        vm.stopPrank();
    }
}
