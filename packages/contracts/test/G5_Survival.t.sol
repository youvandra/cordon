// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G5 — the refusal survives us.
 *
 * If the people who wrote this can undo a refusal, the whole product is
 * cosmetic: a control whose author can reverse it is a suggestion with better
 * typography. The deployment has no proxy, no admin key and no supervisor
 * role, and this is where that stops being a sentence in a README.
 *
 * The deploy script checks the same properties at deploy time on the real
 * chain. This checks them on the code, which is the half a reader can verify
 * without trusting our deployment.
 *
 * Note what is *not* claimed. There is an exit: a named human releases a
 * specific refusal from their own key, and the release is recorded beside the
 * refusal forever. What cannot be reversed is the **bound**. The decision is a
 * person's, and it is logged.
 */
contract G5_Survival is Base {
    /* ------------------------------------------------------------------ */
    /* The deployer holds nothing                                          */
    /* ------------------------------------------------------------------ */

    function test_the_deployer_cannot_release_a_refusal_it_deployed_the_vault_for() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);

        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOwner.selector, root, deployer));
        vault.release(refusalId);

        assertFalse(vault.refusal(refusalId).released, "and the refusal stands");
    }

    function test_the_deployer_cannot_move_the_treasury_it_never_owned() public {
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOwner.selector, root, deployer));
        vault.withdraw(root, deployer, 1);
    }

    function test_the_deployer_cannot_revoke_a_branch_or_widen_one() public {
        vm.prank(deployer);
        vm.expectRevert(MandateRegistry.NotOwner.selector);
        reg.revoke(childA);

        vm.prank(deployer);
        vm.expectRevert(MandateRegistry.NotParentOperator.selector);
        reg.spawn(root, _params(deployer, Fixtures.BUDGET6));
    }

    function test_the_deployer_holds_no_mandate_and_no_balance() public view {
        assertEq(vault.treasury6(bytes32(0)), 0, "there is no unowned pot");
        assertFalse(reg.exists(bytes32(0)), "and no mandate at the zero id");
        assertEq(usdc.balanceOf(deployer), 0, "the deployer was never paid");
    }

    /* ------------------------------------------------------------------ */
    /* Nobody can widen a bound, including the owner                       */
    /* ------------------------------------------------------------------ */

    function test_a_mandate_cannot_be_edited_after_it_is_signed() public {
        /* There is no setter. The only way a tree changes shape is a new
           child, and a child can only narrow. This asserts the absence by
           trying every plausible name a widening function would have had —
           a call to a selector no function answers hits no fallback here,
           because neither contract has one. */
        string[4] memory names = [
            "setBudget(bytes32,uint128)",
            "setTrancheCap(bytes32,uint128)",
            "setOperator(bytes32,address)",
            "setOwner(address)"
        ];

        for (uint256 i = 0; i < names.length; ++i) {
            (bool ok,) = address(reg).call(abi.encodeWithSignature(names[i], root, uint256(1)));
            assertFalse(ok, string.concat("MandateRegistry answered ", names[i]));

            (ok,) = address(vault).call(abi.encodeWithSignature(names[i], root, uint256(1)));
            assertFalse(ok, string.concat("TreeVault answered ", names[i]));
        }
    }

    function test_a_child_wider_than_its_parent_is_refused_whoever_asks() public {
        MandateRegistry.Mandate memory m = reg.mandate(root);

        /* The owner is the human who signed the tree, and the operator is the
           only key allowed to spawn under this node. Neither can widen it, and
           the contract says so with the same error both times: the shape of
           the child is checked before the identity of the caller, so the rule
           is structural rather than a matter of who is asking. */
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "budget6"));
        reg.spawn(root, _params(makeAddr("daemon:new"), m.budget6 + 1));

        vm.prank(opRoot);
        vm.expectRevert(abi.encodeWithSelector(MandateRegistry.NotNarrowing.selector, "budget6"));
        reg.spawn(root, _params(makeAddr("daemon:new"), m.budget6 + 1));
    }

    function test_a_revocation_cannot_be_undone() public {
        vm.prank(owner);
        reg.revoke(childA);

        (bool ok,) = address(reg).call(abi.encodeWithSignature("unrevoke(bytes32)", childA));
        assertFalse(ok, "there is no way back");

        assertTrue(reg.mandate(childA).revoked);
        assertEq(reg.revokedAt(grandchild), childA, "and the whole subtree stays cut");
    }

    /* ------------------------------------------------------------------ */
    /* A refusal is permanent, and a release does not erase it             */
    /* ------------------------------------------------------------------ */

    function test_a_refusal_cannot_be_deleted_rewritten_or_re_run() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        TreeVault.Refusal memory before = vault.refusal(refusalId);

        (bool ok,) = address(vault).call(abi.encodeWithSignature("deleteRefusal(uint256)", refusalId));
        assertFalse(ok, "there is no way to remove a record");

        /* Asking again is free and stays refused: the bound did not move. */
        (bool released,,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        assertFalse(released, "re-running a refused draw by stepping over the bound is not a control anyone accepts");

        TreeVault.Refusal memory unchanged = vault.refusal(refusalId);
        assertEq(unchanged.amount6, before.amount6);
        assertEq(unchanged.breachedAt, before.breachedAt);
        assertEq(uint8(unchanged.reason), uint8(before.reason));
    }

    function test_the_human_exit_exists_is_the_owners_alone_and_is_recorded() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);

        vm.prank(opA);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.NotOwner.selector, root, opA));
        vault.release(refusalId);

        vm.prank(owner);
        vault.release(refusalId);

        TreeVault.Refusal memory r = vault.refusal(refusalId);
        assertTrue(r.released, "there is an exit");
        assertEq(uint8(r.reason), uint8(TreeVault.Reason.TrancheCap), "and the refusal it overrides is still there");

        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.AlreadyReleased.selector, refusalId));
        vault.release(refusalId);
    }

    function test_a_release_does_not_raise_the_bound_it_stepped_around() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);

        vm.prank(owner);
        vault.release(refusalId);

        /* The same draw is refused again immediately afterwards. A release is
           one decision about one refusal, not a change to the mandate. */
        (bool released,, TreeVault.Reason reason) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        assertFalse(released);
        assertTrue(reason == TreeVault.Reason.TrancheCap, "the cap is exactly where the owner left it");
    }

    /* ------------------------------------------------------------------ */
    /* Nothing points anywhere it can be repointed                         */
    /* ------------------------------------------------------------------ */

    function test_the_vault_cannot_be_repointed_at_another_registry_or_token() public {
        assertEq(address(vault.registry()), address(reg));
        assertEq(address(vault.usdc()), address(usdc));
        assertEq(address(vault.gateway()), address(gateway));

        string[3] memory names = ["setRegistry(address)", "setUsdc(address)", "setGateway(address)"];
        for (uint256 i = 0; i < names.length; ++i) {
            (bool ok,) = address(vault).call(abi.encodeWithSignature(names[i], address(this)));
            assertFalse(ok, string.concat("TreeVault answered ", names[i]));
        }
    }

    function test_there_is_no_proxy_underneath_either_contract() public view {
        /* EIP-1967 implementation and admin slots. A proxy is the ordinary way
           a team keeps the ability to change a deployed rule, so their being
           empty is part of the claim rather than a detail. */
        bytes32 implementation = 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc;
        bytes32 admin = 0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103;

        assertEq(vm.load(address(vault), implementation), bytes32(0));
        assertEq(vm.load(address(vault), admin), bytes32(0));
        assertEq(vm.load(address(reg), implementation), bytes32(0));
        assertEq(vm.load(address(reg), admin), bytes32(0));
    }
}
