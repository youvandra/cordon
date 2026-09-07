// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — children narrow monotonically.
 *
 * A parent may create a child without waking the owner, because spawns happen
 * in seconds and a per-spawn approval is not a control anyone can operate.
 * Everything therefore rests on the contract refusing a child wider than its
 * parent no matter who asks — including the owner.
 */
contract G1_Narrowing is Base {
    function test_a_child_may_not_carry_a_larger_budget_than_its_parent() public {
        vm.prank(opRoot);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "budget6"));
        reg.spawn(root, _params(makeAddr("op"), Fixtures.BUDGET6 + 1));
    }

    function test_the_owner_is_not_an_exception_to_narrowing() public {
        // The owner has more authority than the parent daemon and still cannot
        // widen a branch. If they want a wider tree they open a wider root.
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "budget6"));
        reg.spawn(childA, _params(makeAddr("op"), CHILD_BUDGET6 + 1));
    }

    function test_a_child_may_not_carry_a_larger_tranche_cap_than_its_parent() public {
        MandateRegistry.Params memory p = _params(makeAddr("op"), CHILD_BUDGET6);
        p.trancheCap6 = Fixtures.TRANCHE6 + 1;

        vm.prank(opRoot);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "trancheCap6"));
        reg.spawn(root, p);
    }

    function test_a_child_may_not_loosen_the_concentration_bound() public {
        MandateRegistry.Params memory p = _params(makeAddr("op"), CHILD_BUDGET6);
        p.concentrationBps = Fixtures.CONCENTRATION_BPS + 1;

        vm.prank(opRoot);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "concentrationBps"));
        reg.spawn(root, p);
    }

    function test_a_shorter_child_window_is_refused_because_it_resets_faster_than_what_it_debits() public {
        // This is the subtle one. A child with a one-hour window inside a
        // parent with a one-day window drains the parent 24 times over while
        // never once breaching its own limit. Equal, not merely smaller.
        MandateRegistry.Params memory p = _params(makeAddr("op"), CHILD_BUDGET6);
        p.windowSeconds = Fixtures.WINDOW_SECONDS - 1;

        vm.prank(opRoot);
        vm.expectRevert(
            abi.encodeWithSelector(
                MandateRegistry.WindowMustEqualParent.selector, Fixtures.WINDOW_SECONDS - 1, Fixtures.WINDOW_SECONDS
            )
        );
        reg.spawn(root, p);
    }

    function test_a_longer_child_window_is_refused_too_equality_is_the_rule() public {
        MandateRegistry.Params memory p = _params(makeAddr("op"), CHILD_BUDGET6);
        p.windowSeconds = Fixtures.WINDOW_SECONDS + 1;

        vm.prank(opRoot);
        vm.expectRevert(
            abi.encodeWithSelector(
                MandateRegistry.WindowMustEqualParent.selector, Fixtures.WINDOW_SECONDS + 1, Fixtures.WINDOW_SECONDS
            )
        );
        reg.spawn(root, p);
    }

    function test_the_tree_cannot_grow_deeper_than_the_root_allowed() public {
        // The root set maxDepth. grandchild sits at depth 2, so one more level
        // is inside the mandate and the level after it is not.
        vm.prank(opG);
        bytes32 great = reg.spawn(grandchild, _params(makeAddr("op:great"), GRAND_BUDGET6));
        assertEq(reg.mandate(great).depth, Fixtures.MAX_DEPTH, "the last permitted level");

        vm.prank(makeAddr("op:great"));
        vm.expectRevert(
            abi.encodeWithSelector(MandateRegistry.DepthExceeded.selector, Fixtures.MAX_DEPTH + 1, Fixtures.MAX_DEPTH)
        );
        reg.spawn(great, _params(makeAddr("op:deeper"), GRAND_BUDGET6));
    }

    function test_a_child_cannot_raise_the_depth_bound_it_inherited() public {
        MandateRegistry.Params memory p = _params(makeAddr("op"), CHILD_BUDGET6);
        p.maxDepth = 250; // ignored on purpose — depth is a property of the root

        vm.prank(opRoot);
        bytes32 c = reg.spawn(root, p);
        assertEq(reg.mandate(c).maxDepth, Fixtures.MAX_DEPTH, "inherited, never raised");
    }

    function test_a_stranger_cannot_spawn_under_someone_elses_branch() public {
        vm.prank(makeAddr("stranger"));
        vm.expectRevert(MandateRegistry.NotParentOperator.selector);
        reg.spawn(childA, _params(makeAddr("op"), 1));
    }

    function test_a_sibling_daemon_cannot_spawn_under_its_sibling() public {
        // opB runs childB. childA is not its branch, and holding one key must
        // not confer authority over a peer's subtree.
        vm.prank(opB);
        vm.expectRevert(MandateRegistry.NotParentOperator.selector);
        reg.spawn(childA, _params(makeAddr("op"), 1));
    }

    function test_children_inherit_the_owner_so_no_branch_can_be_reparented_to_a_stranger() public view {
        assertEq(reg.mandate(grandchild).owner, owner, "the human at the root of the tree");
        assertEq(reg.mandate(grandchild).root, root, "and the tree it belongs to");
    }

    function testFuzz_a_child_is_never_wider_than_its_parent_on_any_axis(
        uint128 budget6,
        uint128 tranche6,
        uint16 bps
    ) public {
        budget6 = uint128(bound(budget6, 1, type(uint96).max));
        tranche6 = uint128(bound(tranche6, 0, type(uint96).max));
        bps = uint16(bound(bps, 1, 10_000));

        MandateRegistry.Params memory p = MandateRegistry.Params({
            operator: makeAddr("op"),
            budget6: budget6,
            windowSeconds: Fixtures.WINDOW_SECONDS,
            trancheCap6: tranche6,
            concentrationBps: bps,
            maxDepth: Fixtures.MAX_DEPTH
        });

        MandateRegistry.Mandate memory parent = reg.mandate(childA);
        bool widerSomewhere =
            budget6 > parent.budget6 || tranche6 > parent.trancheCap6 || bps > parent.concentrationBps;

        vm.prank(opA);
        if (widerSomewhere) {
            vm.expectRevert();
            reg.spawn(childA, p);
        } else {
            bytes32 c = reg.spawn(childA, p);
            MandateRegistry.Mandate memory child = reg.mandate(c);
            assertLe(child.budget6, parent.budget6);
            assertLe(child.trancheCap6, parent.trancheCap6);
            assertLe(child.concentrationBps, parent.concentrationBps);
            assertEq(child.windowSeconds, parent.windowSeconds);
        }
    }
}
