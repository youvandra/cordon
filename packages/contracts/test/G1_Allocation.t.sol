// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — allocation without a forecast.
 *
 * The objection this answers: an owner with $100 and two agents has to guess
 * the split in advance. A per-transaction cap cannot express "$70 to one and
 * $30 to the other", and a daily cap cannot either — so the owner picks $50
 * each and is wrong, because the work is not divided the way the budget was.
 *
 * Guessing is not the interesting part, though. Sizing two wallets $70 and $30
 * solves the guessed case, and needs no contract at all. What no wallet does
 * is let the owner decline to guess: size every branch for the worst case it
 * could legitimately need, and let the root be the only real total.
 */
contract G1_Allocation is Base {
    /// The version of the problem an owner can actually state up front.
    function test_a_fixed_split_holds_each_branch_to_its_share() public {
        vm.startPrank(opRoot);
        bytes32 heavy = reg.spawn(root, _params(makeAddr("op:heavy"), 70_000_000));
        bytes32 light = reg.spawn(root, _params(makeAddr("op:light"), 30_000_000));
        vm.stopPrank();

        _spend(makeAddr("op:heavy"), heavy, 70_000_000);
        assertEq(vault.windowSpent(heavy), 70_000_000, "the heavy branch got its share");

        _spend(makeAddr("op:light"), light, 30_000_000);
        assertEq(vault.windowSpent(root), Fixtures.BUDGET6, "and together they are the root's budget");

        (bool ok,, TreeVault.Reason reason) = _draw(makeAddr("op:light"), light, _payee(99), Fixtures.TRANCHE6);
        assertFalse(ok);
        assertEq(uint256(reason), uint256(TreeVault.Reason.WindowBudget));
    }

    /**
     * The version an owner cannot state up front, and the one that matters.
     *
     * Both branches are sized at the full $100 — deliberately more than the
     * tree can afford in total. Neither is throttled by a forecast, and the
     * root is what stops them. Whichever branch turns out to need the money
     * can have it, and the two together still cannot exceed what the owner
     * signed. No wallet does this: two wallets holding $100 each hold $200.
     */
    function test_two_branches_may_each_be_sized_for_the_whole_budget() public {
        vm.startPrank(opRoot);
        bytes32 a = reg.spawn(root, _params(makeAddr("op:a"), Fixtures.BUDGET6));
        bytes32 b = reg.spawn(root, _params(makeAddr("op:b"), Fixtures.BUDGET6));
        vm.stopPrank();

        // The work turns out to be split 70/30, which nobody knew in advance.
        _spend(makeAddr("op:a"), a, 70_000_000);
        _spend(makeAddr("op:b"), b, 30_000_000);

        assertEq(vault.windowSpent(a), 70_000_000, "the branch that needed more took more");
        assertEq(vault.windowSpent(b), 30_000_000, "the branch that needed less took less");
        assertEq(vault.windowSpent(root), Fixtures.BUDGET6, "and the owner's total is exactly what they signed");

        (bool ok,, TreeVault.Reason reason) = _draw(makeAddr("op:a"), a, _payee(99), Fixtures.TRANCHE6);
        assertFalse(ok, "neither branch may exceed the total, however much its own cap allowed");
        assertEq(uint256(reason), uint256(TreeVault.Reason.WindowBudget));
    }

    /**
     * The same elasticity, one level deeper, which is where a wallet stops
     * being able to imitate it at all. The orchestrator does not know how many
     * workers it will spawn or what each will cost, so it sizes each of them
     * generously and spawns as it goes.
     */
    function test_an_orchestrator_may_spawn_generously_because_the_root_still_binds() public {
        address[4] memory ops = [
            makeAddr("op:w1"), makeAddr("op:w2"), makeAddr("op:w3"), makeAddr("op:w4")
        ];
        bytes32[4] memory workers;

        vm.startPrank(opA);
        for (uint256 i = 0; i < 4; ++i) {
            // Every worker is sized at its parent's whole budget.
            workers[i] = reg.spawn(childA, _params(ops[i], CHILD_BUDGET6));
        }
        vm.stopPrank();

        uint128 released;
        for (uint256 i = 0; i < 4; ++i) {
            for (uint256 j = 0; j < 6; ++j) {
                (bool ok,,) = _draw(ops[i], workers[i], _payee(i), Fixtures.TRANCHE6);
                if (ok) released += Fixtures.TRANCHE6;
            }
        }

        assertEq(released, CHILD_BUDGET6, "four generous workers still share one parent's budget");
        assertEq(vault.windowSpent(childA), CHILD_BUDGET6, "the parent is exactly full");
        assertLe(vault.windowSpent(root), Fixtures.BUDGET6, "and the root was never at risk");
    }

    /**
     * The cost of elasticity, stated rather than hidden: a shared pool is
     * first-come, first-served. A greedy branch can take the headroom a
     * sibling was going to need.
     *
     * That is what the child cap is for. An owner who wants isolation sizes
     * the branches; an owner who wants elasticity does not. The contract
     * offers both knobs and takes neither decision.
     */
    function test_a_greedy_branch_can_starve_a_sibling_unless_the_owner_caps_it() public {
        vm.startPrank(opRoot);
        bytes32 greedy = reg.spawn(root, _params(makeAddr("op:greedy"), Fixtures.BUDGET6));
        bytes32 patient = reg.spawn(root, _params(makeAddr("op:patient"), Fixtures.BUDGET6));
        vm.stopPrank();

        _spend(makeAddr("op:greedy"), greedy, Fixtures.BUDGET6);

        (bool ok,, TreeVault.Reason reason) = _draw(makeAddr("op:patient"), patient, _payee(99), Fixtures.TRANCHE6);
        assertFalse(ok, "the sibling arrives to an empty root");
        assertEq(uint256(reason), uint256(TreeVault.Reason.WindowBudget));
        assertEq(vault.windowSpent(patient), 0, "having spent nothing of its own");
    }

    /**
     * Enough sellers that concentration never binds first.
     *
     * These tests are about allocation, and the concentration bound is a
     * different bound with a different point. Three sellers is not enough: a
     * $70 branch may take 35% of its window from any one of them, which is
     * $24.50, and a $5 tranche only reaches $20 of that. Spreading the spend
     * keeps the two questions apart.
     */
    function _payee(uint256 i) internal returns (address) {
        return makeAddr(string.concat("seller:", vm.toString(i % 8)));
    }

    /// Spend `total` in tranche-sized draws, round-robin across sellers.
    function _spend(address op, bytes32 node, uint128 total) internal {
        uint128 moved;
        uint256 i;
        while (moved < total) {
            uint128 step = total - moved < Fixtures.TRANCHE6 ? total - moved : Fixtures.TRANCHE6;
            (bool ok,,) = _draw(op, node, _payee(i++), step);
            assertTrue(ok, "setup draw was expected to release");
            moved += step;
        }
    }
}
