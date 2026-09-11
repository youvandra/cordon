// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G1 — a window budget is a rate, and a rate is not a total.
 *
 * Every other test in this suite runs inside one window, which is exactly why
 * this bound went unnoticed: the tumbling window resets, so a tree left
 * running spends its whole budget again in the next window, and in every
 * window after that, without any bound ever refusing anything. The product
 * says "one budget for a tree of agents". A window alone says "one budget per
 * day, forever", which is a different promise and a larger one.
 *
 * The lifetime cap is the total the owner signed for. It never resets, it
 * debits every ancestor exactly as the window does, and the binding limit at
 * any moment is whichever of the two is reached first.
 */
contract G1_Lifetime is Base {
    /// A fresh root with a stated lifetime cap, funded past what any of these
    /// tests draw so that the cap is the only thing under test.
    function _openWithLifetime(uint128 lifetimeCap6) internal returns (bytes32 node) {
        vm.prank(owner);
        node = reg.open(
            MandateRegistry.Params({
                operator: opRoot,
                budget6: Fixtures.BUDGET6,
                lifetimeCap6: lifetimeCap6,
                windowSeconds: Fixtures.WINDOW_SECONDS,
                trancheCap6: Fixtures.TRANCHE6,
                concentrationBps: Fixtures.CONCENTRATION_BPS,
                maxDepth: Fixtures.MAX_DEPTH
            })
        );
        /* Funded well past anything these tests draw, and deliberately not
           derived from the cap: an unbounded cap would overflow, and a vault
           balance that tracked the cap would make Reason.VaultBalance the
           thing being measured instead of the lifetime. */
        usdc.mint(owner, Fixtures.BUDGET6 * 20);
        vm.prank(owner);
        vault.fund(node, Fixtures.BUDGET6 * 10);
    }

    /**
     * The attack, and the reason this bound exists.
     *
     * Two windows of budget is all this mandate authorises. The first window
     * is spent, the second window is spent, and the third is refused with an
     * empty window and a full lifetime — the node's own window says there is
     * room, and there is not.
     */
    function test_a_window_that_resets_is_not_a_total_the_owner_signed_for() public {
        bytes32 node = _openWithLifetime(Fixtures.BUDGET6 * 2);

        _spend(opRoot, node, Fixtures.BUDGET6);
        assertEq(vault.lifetimeSpent(node), Fixtures.BUDGET6, "one window spent");

        vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS);
        _spend(opRoot, node, Fixtures.BUDGET6);
        assertEq(vault.lifetimeSpent(node), Fixtures.BUDGET6 * 2, "two windows spent");

        vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS);
        assertEq(vault.windowSpent(node), 0, "the window rolled and is empty");

        (bool ok,, TreeVault.Reason reason) = _draw(opRoot, node, _payee(0), Fixtures.TRANCHE6);
        assertFalse(ok, "an empty window is not authority the owner gave");
        assertEq(uint256(reason), uint256(TreeVault.Reason.LifetimeCap));
    }

    /// Without the cap the same sequence never refuses, which is the whole
    /// difference. This is the control: the bound is doing the work, not the
    /// arithmetic around it.
    function test_without_a_lifetime_cap_the_same_sequence_never_refuses() public {
        bytes32 node = _openWithLifetime(type(uint128).max);

        for (uint256 i = 0; i < 3; ++i) {
            _spend(opRoot, node, Fixtures.BUDGET6);
            vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS);
        }

        assertEq(vault.lifetimeSpent(node), Fixtures.BUDGET6 * 3, "three windows, nothing refused");
    }

    /// The lifetime debits the whole path, exactly as the window does. Without
    /// this, delegation is the bypass a second time.
    function test_a_descendants_draw_spends_every_ancestors_lifetime() public {
        _spend(opG, grandchild, Fixtures.TRANCHE6 * 3);

        uint128 drawn = Fixtures.TRANCHE6 * 3;
        assertEq(vault.lifetimeSpent(grandchild), drawn, "the node that drew");
        assertEq(vault.lifetimeSpent(childA), drawn, "its parent");
        assertEq(vault.lifetimeSpent(root), drawn, "and the root");
        assertEq(vault.lifetimeSpent(childB), 0, "the sibling is untouched");
    }

    /// A refusal consumes no lifetime, for the same reason it consumes no
    /// window: a bound that charges for being enforced is a fee.
    function test_a_refused_draw_consumes_no_lifetime() public {
        bytes32 node = _openWithLifetime(Fixtures.TRANCHE6 * 2);

        _spend(opRoot, node, Fixtures.TRANCHE6 * 2);
        uint128 before = vault.lifetimeSpent(node);

        (bool ok,, TreeVault.Reason reason) = _draw(opRoot, node, _payee(1), Fixtures.TRANCHE6);
        assertFalse(ok);
        assertEq(uint256(reason), uint256(TreeVault.Reason.LifetimeCap));
        assertEq(vault.lifetimeSpent(node), before, "the refusal cost nothing");
    }

    /**
     * The exact remainder is allowed. One base unit more is not.
     *
     * The remainder is deliberately smaller than a tranche. Asking for one
     * unit more than a whole tranche would be refused by the tranche cap,
     * which is checked first, and the test would pass while proving nothing
     * about this bound at all.
     */
    function test_the_exact_remaining_lifetime_is_allowed_and_one_unit_more_is_not() public {
        uint128 half = Fixtures.TRANCHE6 / 2;
        bytes32 node = _openWithLifetime(Fixtures.TRANCHE6 + half);
        _spend(opRoot, node, Fixtures.TRANCHE6);

        (bool tooMuch,, TreeVault.Reason reason) = _draw(opRoot, node, _payee(2), half + 1);
        assertFalse(tooMuch, "one base unit past the cap");
        assertEq(uint256(reason), uint256(TreeVault.Reason.LifetimeCap), "and past this cap, not the tranche");

        (bool exact,,) = _draw(opRoot, node, _payee(3), half);
        assertTrue(exact, "the exact remainder is not past it");
        assertEq(vault.lifetimeSpent(node), Fixtures.TRANCHE6 + half);
    }

    /// Narrowing, monotonically, exactly as every other bound narrows.
    function test_a_child_may_not_be_given_a_wider_lifetime_than_its_parent() public {
        bytes32 node = _openWithLifetime(Fixtures.BUDGET6 * 2);

        MandateRegistry.Params memory wider = _params(makeAddr("op:wide"), Fixtures.BUDGET6);
        wider.lifetimeCap6 = Fixtures.BUDGET6 * 2 + 1;

        vm.prank(opRoot);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "lifetimeCap6"));
        reg.spawn(node, wider);
    }

    /// Zero is not "unlimited". A mandate that forgot to state a total is the
    /// defect, not a convenience.
    function test_a_mandate_with_no_lifetime_cap_is_refused() public {
        MandateRegistry.Params memory none = _params(makeAddr("op:none"), Fixtures.BUDGET6);
        none.lifetimeCap6 = 0;

        vm.prank(owner);
        vm.expectRevert(MandateRegistry.ZeroLifetimeCap.selector);
        reg.open(none);

        vm.prank(opRoot);
        vm.expectRevert(MandateRegistry.ZeroLifetimeCap.selector);
        reg.spawn(root, none);
    }

    /**
     * A mandate that can never draw is a setup mistake, not a bound.
     *
     * Every other field on `Params` was checked at the door and this one was
     * not, so a tree could be opened, funded and handed to a daemon that would
     * be refused `tranche-cap` on its first purchase and on every one after
     * it — a fence that looks like it is working while nothing can ever get
     * through it. Zero is not "unlimited" for any field on this struct.
     */
    function test_a_mandate_with_no_tranche_cap_is_refused_rather_than_silently_useless() public {
        MandateRegistry.Params memory none = _params(makeAddr("op:tranche"), Fixtures.BUDGET6);
        none.trancheCap6 = 0;

        vm.prank(owner);
        vm.expectRevert(MandateRegistry.ZeroTrancheCap.selector);
        reg.open(none);

        vm.prank(opRoot);
        vm.expectRevert(MandateRegistry.ZeroTrancheCap.selector);
        reg.spawn(root, none);
    }

    /**
     * Headroom answers with the tighter of the two, and names the node.
     *
     * A headroom that reported only the window would tell an agent it may
     * spend money the lifetime cap is about to refuse, which is precisely the
     * figure Rule 1 exists to keep off a screen.
     */
    function test_headroom_reports_the_lifetime_when_it_is_the_tighter_bound() public {
        bytes32 node = _openWithLifetime(Fixtures.BUDGET6 * 2);

        (uint128 available, bytes32 boundBy) = vault.headroom(node);
        assertEq(available, Fixtures.BUDGET6, "the window binds first, at the start");
        assertEq(boundBy, node);

        // Spend most of the lifetime, then roll the window. The window is
        // empty again; the lifetime is nearly gone.
        _spend(opRoot, node, Fixtures.BUDGET6);
        vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS);
        _spend(opRoot, node, Fixtures.BUDGET6 - Fixtures.TRANCHE6);
        vm.warp(block.timestamp + Fixtures.WINDOW_SECONDS);

        assertEq(vault.windowSpent(node), 0, "a fresh window");
        (available, boundBy) = vault.headroom(node);
        assertEq(available, Fixtures.TRANCHE6, "but only the lifetime remainder is real");
        assertEq(boundBy, node);
    }
}
