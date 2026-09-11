// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {ConductRecord} from "../src/ConductRecord.sol";
import {TreeVault} from "../src/TreeVault.sol";
import {IIdentityRegistry, IReputationRegistry} from "../src/interfaces/IERC8004.sol";
import {MockIdentityRegistry, MockReputationRegistry} from "./mocks/MockERC8004.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G6 — the record cannot be forged.
 *
 * Without this gate the moat is a paragraph. With it, it is a property.
 *
 * The claim has two halves and each gets its own tests:
 *
 * - **Linkage.** Every record Cordon writes resolves to a refusal in the
 *   vault. The ecosystem baseline is 98.7–100% of ERC-8004 feedback with no
 *   payment or task linkage at all.
 * - **Unwritability.** An address that is not the enforcement seat cannot
 *   produce an equivalent record, because feedback is filed under whoever
 *   wrote it and it has no refusals to report.
 *
 * Each test is named after the thing it prevents.
 */
contract G6_Record is Base {
    MockIdentityRegistry internal identity;
    MockReputationRegistry internal reputation;
    ConductRecord internal record;

    /// @dev The impostor: a well-funded stranger with an opinion.
    address internal sybil = makeAddr("sybil");

    uint256 internal agentRoot;
    uint256 internal agentA;

    function setUp() public override {
        super.setUp();

        identity = new MockIdentityRegistry();
        reputation = new MockReputationRegistry();
        record = new ConductRecord(
            vault, IIdentityRegistry(address(identity)), IReputationRegistry(address(reputation))
        );

        /* Each daemon registers its own identity with its own key. Cordon does
           not register it and does not hold it — a record about a token we
           control is the shape of the thing being replaced. */
        vm.prank(opRoot);
        agentRoot = identity.register("https://getcordon.xyz/agent/orchestrator");
        vm.prank(opA);
        agentA = identity.register("https://getcordon.xyz/agent/research-worker");

        record.bind(root, agentRoot);
        record.bind(childA, agentA);
    }

    /* ------------------------------------------------------------------ */
    /* Linkage                                                             */
    /* ------------------------------------------------------------------ */

    function test_a_record_can_only_be_written_from_a_refusal_the_vault_holds() public {
        // Nothing has been refused yet, so there is no id to write about.
        assertEq(vault.refusalCount(), 0, "the tree has not refused anything yet");

        vm.expectRevert(abi.encodeWithSelector(TreeVault.UnknownRefusal.selector, uint256(1)));
        record.attest(1);
    }

    function test_the_record_carries_the_amount_the_contract_refused_and_not_a_number_anyone_chose() public {
        uint128 overCap = Fixtures.TRANCHE6 + 1;
        (bool ok, uint256 refusalId,) = _draw(opA, childA, aisa, overCap);
        assertFalse(ok, "over the tranche cap");

        record.attest(refusalId);

        MockReputationRegistry.Feedback memory f = reputation.feedbackAt(agentA, address(record), 0);
        assertEq(f.value, int128(overCap), "the value is what was refused, in USDC base units");
        assertEq(f.valueDecimals, 6, "6 decimals, because that is the ERC-20 view of USDC");
        assertEq(f.tag1, "cordon.refused", "one tag, one kind of record");
        assertEq(f.tag2, "tranche-cap", "the reason, in the same word the daemon and console use");
    }

    function test_every_record_names_the_refusal_it_came_from() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        record.attest(refusalId);

        MockReputationRegistry.Feedback memory f = reputation.feedbackAt(agentA, address(record), 0);
        assertEq(f.feedbackURI, record.recordUri(refusalId), "the record resolves to its refusal");
        assertEq(
            f.feedbackHash,
            record.refusalHash(refusalId),
            "and commits to the vault tuple, so a reader recomputes rather than trusts"
        );
    }

    function test_the_commitment_changes_when_the_vault_state_it_names_changes() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        bytes32 before = record.refusalHash(refusalId);

        vm.prank(owner);
        vault.release(refusalId);

        assertTrue(
            before != record.refusalHash(refusalId),
            "a released refusal is a different fact, and the hash has to say so"
        );
    }

    function test_a_refusal_is_recorded_once_however_many_times_it_is_offered() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        record.attest(refusalId);

        vm.expectRevert(abi.encodeWithSelector(ConductRecord.AlreadyAttested.selector, refusalId));
        record.attest(refusalId);

        assertEq(reputation.feedbackCount(agentA, address(record)), 1, "one refusal, one record");
    }

    function test_a_node_with_no_identity_produces_no_record_rather_than_an_orphan_one() public {
        // childB was never bound: its daemon has not registered an identity.
        (, uint256 refusalId,) = _draw(opB, childB, aisa, Fixtures.TRANCHE6 + 1);

        vm.expectRevert(abi.encodeWithSelector(ConductRecord.NodeNotBound.selector, childB));
        record.attest(refusalId);
    }

    function test_the_record_is_filed_against_the_agent_that_drew_not_the_ancestor_that_refused() public {
        /* The grandchild draws inside its own budget and is stopped by the
           root's window. The conduct is the grandchild's; the bound is the
           root's, and the reason says so. */
        /* Leave less than one tranche, so the next draw cannot fit however
           the mandate is sized. A fixed remainder here silently stopped
           refusing when the tranche cap came down. */
        _spend(opRoot, root, Fixtures.BUDGET6 - (Fixtures.TRANCHE6 / 2));

        vm.prank(opG);
        uint256 agentG = identity.register("https://getcordon.xyz/agent/scholar-fetch");
        record.bind(grandchild, agentG);

        (bool ok, uint256 refusalId, TreeVault.Reason reason) = _draw(opG, grandchild, aisa, Fixtures.TRANCHE6);
        assertFalse(ok, "the grandchild is inside its own budget and stopped anyway");
        assertTrue(reason == TreeVault.Reason.WindowBudget, "by a window it does not own");

        record.attest(refusalId);

        assertEq(reputation.feedbackCount(agentG, address(record)), 1, "the record is the grandchild's");
        MockReputationRegistry.Feedback memory f = reputation.feedbackAt(agentG, address(record), 0);
        assertEq(f.tag2, "window-budget", "and it names the bound that stopped it");

        TreeVault.Refusal memory r = vault.refusal(refusalId);
        assertEq(r.breachedAt, root, "which belonged to the root");
    }

    /* ------------------------------------------------------------------ */
    /* Unwritability                                                       */
    /* ------------------------------------------------------------------ */

    function test_a_stranger_cannot_write_a_record_that_reads_as_cordons() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        record.attest(refusalId);

        /* Nothing stops a stranger writing to a permissionless registry, and
           nothing should. What they cannot do is write under the seat's
           address, which is the only address a reader filters on. */
        vm.prank(sybil);
        reputation.giveFeedback(
            agentA, 100, 0, "cordon.refused", "window-budget", "", "https://getcordon.xyz/refusal/1", bytes32(0)
        );

        assertEq(reputation.feedbackCount(agentA, sybil), 1, "they wrote something, under their own name");
        assertEq(
            reputation.feedbackCount(agentA, address(record)),
            1,
            "and it did not land in the seat's record, which still holds exactly what the vault refused"
        );
    }

    function test_the_seat_cannot_write_a_refusal_that_did_not_happen_even_for_its_own_deployer() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);

        // There is exactly one refusal. The next id is not a thing that exists.
        vm.prank(deployer);
        vm.expectRevert(abi.encodeWithSelector(TreeVault.UnknownRefusal.selector, refusalId + 1));
        record.attest(refusalId + 1);
    }

    function test_an_identity_its_operator_does_not_hold_cannot_be_bound_to_a_node() public {
        vm.prank(sybil);
        uint256 stolen = identity.register("https://example.com/not-the-daemon");

        vm.expectRevert(
            abi.encodeWithSelector(ConductRecord.IdentityNotHeldByOperator.selector, stolen, sybil, opB)
        );
        record.bind(childB, stolen);
    }

    function test_one_identity_cannot_stand_for_two_nodes() public {
        vm.expectRevert(abi.encodeWithSelector(ConductRecord.AgentAlreadyBound.selector, agentA, childA));
        record.bind(childB, agentA);
    }

    function test_a_node_cannot_be_rebound_to_a_friendlier_identity_after_a_refusal() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        record.attest(refusalId);

        vm.prank(opA);
        uint256 fresh = identity.register("https://getcordon.xyz/agent/research-worker-take-two");

        vm.expectRevert(abi.encodeWithSelector(ConductRecord.NodeAlreadyBound.selector, childA, agentA));
        record.bind(childA, fresh);
    }

    /* ------------------------------------------------------------------ */
    /* The exit is real, and it is on the record                           */
    /* ------------------------------------------------------------------ */

    function test_a_release_is_appended_to_the_refusal_it_belongs_to_and_is_not_a_second_record() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        uint64 index = record.attest(refusalId);

        vm.prank(owner);
        vault.release(refusalId);
        record.attestRelease(refusalId);

        assertEq(
            reputation.feedbackCount(agentA, address(record)),
            1,
            "a reader counting refusals must not count the override twice"
        );
        assertEq(reputation.responseCount(agentA, address(record), index), 1, "the release is on the record");

        MockReputationRegistry.Response memory resp = reputation.responseAt(agentA, address(record), index, 0);
        assertEq(resp.responder, address(record), "written from the seat");
        assertEq(resp.responseHash, record.refusalHash(refusalId), "and committing to the released tuple");
    }

    function test_a_release_nobody_signed_cannot_be_claimed() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        record.attest(refusalId);

        vm.expectRevert(abi.encodeWithSelector(ConductRecord.NotReleased.selector, refusalId));
        record.attestRelease(refusalId);
    }

    /* ------------------------------------------------------------------ */
    /* The reason, in one spelling                                         */
    /* ------------------------------------------------------------------ */

    /**
     * Every bound the contract can refuse on has a word here.
     *
     * This is the test that was missing, and its absence cost four permanent
     * records. `Reason.LifetimeCap` was appended to the enum months after
     * `reasonTag` was written; the two tests that existed asserted the two
     * reasons that predated it, so nothing noticed that a lifetime-cap refusal
     * published itself to the Reputation Registry as `none` — a record saying
     * a draw was refused for no reason at all.
     *
     * Written over the enum rather than over a list of reasons, so appending a
     * member without a word for it fails here and not on chain.
     */
    function test_every_reason_the_contract_can_refuse_on_has_a_word_of_its_own() public view {
        uint8 last = uint8(type(TreeVault.Reason).max);

        for (uint8 i = 1; i <= last; ++i) {
            string memory tag = record.reasonTag(TreeVault.Reason(i));
            assertTrue(bytes(tag).length != 0, "a reason with no word publishes an empty record");
            assertNotEq(
                tag,
                "none",
                "this reason falls through to `none`, and a record of it says the draw was refused for nothing"
            );
        }

        assertEq(record.reasonTag(TreeVault.Reason.None), "none", "and only None is none");
    }

    /**
     * The spelling itself, against `packages/fixtures`.
     *
     * The words are decoded from the enum index by everything that reads a
     * refusal — the daemon, the meter, the console, the public record page —
     * and they are generated into `Fixtures.gen.sol` from the same list. A tag
     * that disagrees with the list is a record the surfaces cannot read back.
     */
    function test_the_word_is_the_one_every_other_surface_decodes() public {
        (, uint256 refusalId,) = _draw(opA, childA, aisa, Fixtures.TRANCHE6 + 1);
        record.attest(refusalId);

        MockReputationRegistry.Feedback memory f = reputation.feedbackAt(agentA, address(record), 0);
        assertEq(f.tag2, record.reasonTag(TreeVault.Reason.TrancheCap), "the record carries the mapping's own word");
        assertEq(record.reasonTag(TreeVault.Reason.LifetimeCap), "lifetime-cap", "the reason four records lost");
    }

}
