// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Base} from "./Base.t.sol";
import {CordonResolver} from "../src/CordonResolver.sol";
import {MandateRegistry} from "../src/MandateRegistry.sol";
import {Fixtures} from "./Fixtures.gen.sol";

/**
 * G8 — the name answers what the contract answers, at the moment it is asked.
 *
 * The claim these tests exist to hold: there is no copy. Every assertion below
 * changes state through the mandate or the vault and then reads the CHANGE back
 * through an ordinary ENS `text` call, with no write to the resolver in between.
 * If a stored value were ever reintroduced, the reads would go stale and these
 * would fail.
 */
contract G8_Resolver is Base {
    CordonResolver internal resolver;

    /* `worker1.probe.acme.eth`, both ways: the wire format a resolver is given
       and the namehash a reader computes. They have to agree, or a wildcard
       resolver answers about a name nobody asked for. */
    bytes internal constant WIRE =
        hex"07776f726b657231_0570726f6265_0461636d65_03657468_00";

    function setUp() public override {
        super.setUp();
        resolver = new CordonResolver(reg, vault);
    }

    function _namehash(string[4] memory labels) internal pure returns (bytes32 h) {
        for (uint256 i = labels.length; i > 0; --i) {
            h = keccak256(abi.encodePacked(h, keccak256(bytes(labels[i - 1]))));
        }
    }

    function _nh() internal pure returns (bytes32) {
        return _namehash(["worker1", "probe", "acme", "eth"]);
    }

    /* ------------------------------------------------------------------ */

    /// The wire format and EIP-137 must produce the same node, or wildcard
    /// resolution answers about the wrong name.
    function test_the_wire_name_hashes_to_the_same_node_a_reader_computes() public view {
        bytes memory wire = WIRE;
        assertEq(resolver.resolveNamehash(wire), _nh(), "wire and namehash agree");
    }

    function test_an_unbound_name_answers_empty_and_never_zero() public view {
        /* Zero is a number, and a seller would believe it. */
        assertEq(resolver.text(_nh(), "cordon.headroom"), "");
        assertEq(resolver.text(_nh(), "cordon.live"), "");
        assertEq(resolver.addr(_nh()), address(0));
    }

    function test_only_the_mandate_owner_may_bind_a_name() public {
        vm.prank(opG);
        vm.expectRevert(abi.encodeWithSelector(CordonResolver.NotMandateOwner.selector, grandchild, opG));
        resolver.bind(_nh(), grandchild);

        vm.prank(owner);
        resolver.bind(_nh(), grandchild);
        assertEq(resolver.nodeOf(_nh()), grandchild);
    }

    function test_addr_is_the_operator_the_mandate_names() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);
        assertEq(resolver.addr(_nh()), opG, "the key that signs for this agent");
    }

    /**
     * The headline: a draw moves the name's answer, with no write to the
     * resolver. This is the property a stored text record cannot have.
     */
    function test_headroom_in_the_name_follows_the_vault_with_no_resolver_write() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);

        (uint128 before,) = vault.headroom(grandchild);
        assertEq(resolver.text(_nh(), "cordon.headroom"), _usdc(before));

        _spend(opG, grandchild, Fixtures.TRANCHE6 * 3);

        (uint128 after_,) = vault.headroom(grandchild);
        assertLt(after_, before, "the tree spent something");
        assertEq(
            resolver.text(_nh(), "cordon.headroom"),
            _usdc(after_),
            "the name reports the new figure without anyone writing a record"
        );
    }

    /**
     * The one that makes ENS load bearing: revoking the mandate changes what the
     * name says, in the same transaction, with no `unregister` and nothing to
     * remember.
     */
    function test_revoking_a_branch_changes_what_the_name_says_immediately() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);

        assertEq(resolver.text(_nh(), "cordon.live"), "true");
        assertEq(resolver.text(_nh(), "cordon.revokedAt"), "");

        /* One transaction, aimed at an ancestor, naming neither the name nor the
           resolver nor the grandchild. */
        vm.prank(owner);
        reg.revoke(childA);

        assertEq(resolver.text(_nh(), "cordon.live"), "revoked", "the name knows already");
        assertEq(
            resolver.text(_nh(), "cordon.revokedAt"),
            _hex32(childA),
            "and it names the ancestor whose cut did it"
        );
        assertEq(resolver.text(_nh(), "cordon.headroom"), "0.000000", "a cut branch may draw nothing");
    }

    /// ENSIP-10: the resolver answers through `resolve(name, data)`, which is
    /// how a universal resolver reaches it for a name it was never told about.
    function test_resolve_answers_text_and_addr_through_ensip10() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);

        bytes memory wire = WIRE;

        bytes memory textCall = abi.encodeWithSelector(
            bytes4(0x59d1d43c), _nh(), "cordon.live"
        );
        assertEq(abi.decode(resolver.resolve(wire, textCall), (string)), "true");

        bytes memory addrCall = abi.encodeWithSelector(bytes4(0x3b3b57de), _nh());
        assertEq(abi.decode(resolver.resolve(wire, addrCall), (address)), opG);
    }

    function test_it_announces_the_extended_resolver_interface() public view {
        assertTrue(resolver.supportsInterface(0x9061b923), "ENSIP-10");
        assertTrue(resolver.supportsInterface(0x01ffc9a7), "ERC-165");
        assertFalse(resolver.supportsInterface(0xdeadbeef));
    }

    function test_an_unknown_key_answers_empty_rather_than_reverting() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);
        assertEq(resolver.text(_nh(), "com.twitter"), "");
    }

    /* ------------------------------------------------------------------ */
    /* The owner's stated records — ENSIP-25 and ENSIP-26                   */
    /* ------------------------------------------------------------------ */

    /**
     * A resolver that computes the bound must still carry the records nothing
     * enforces, or it is a downgrade: an agent with a live bound and no endpoint
     * is one a caller cannot reach.
     */
    function test_the_owner_may_state_the_records_no_contract_can_answer() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);

        vm.startPrank(owner);
        resolver.setText(_nh(), "agent-endpoint[mcp]", "https://probe.example/mcp");
        resolver.setText(_nh(), "agent-context", "buys market data, nothing else");
        resolver.setText(_nh(), "agent-registration[0x0001...][42]", "1");
        vm.stopPrank();

        assertEq(resolver.text(_nh(), "agent-endpoint[mcp]"), "https://probe.example/mcp");
        assertEq(resolver.text(_nh(), "agent-context"), "buys market data, nothing else");
        assertEq(resolver.text(_nh(), "agent-registration[0x0001...][42]"), "1");
    }

    /**
     * The rule that keeps the two kinds apart. An owner who could write
     * `cordon.headroom` could quote a seller a figure the vault never agreed
     * to — which is exactly the drift this resolver exists to remove, smuggled
     * back in through the one party allowed to write.
     */
    function test_a_stated_record_may_never_shadow_a_computed_one() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);

        string[10] memory computed = [
            "cordon.node", "cordon.registry", "cordon.vault", "cordon.live",
            "cordon.revokedAt", "cordon.headroom", "cordon.boundBy",
            "cordon.budget", "cordon.owner", "cordon.depth"
        ];
        for (uint256 i = 0; i < computed.length; ++i) {
            assertTrue(resolver.isComputed(computed[i]), "listed as computed");
            vm.prank(owner);
            vm.expectRevert(abi.encodeWithSelector(CordonResolver.ComputedKey.selector, computed[i]));
            resolver.setText(_nh(), computed[i], "9999.000000");
        }

        /* And the computed answers are untouched by the attempts. */
        assertEq(resolver.text(_nh(), "cordon.live"), "true");
    }

    function test_the_operator_may_not_describe_itself() public {
        vm.prank(owner);
        resolver.bind(_nh(), grandchild);

        vm.prank(opG);
        vm.expectRevert(abi.encodeWithSelector(CordonResolver.NotMandateOwner.selector, grandchild, opG));
        resolver.setText(_nh(), "agent-endpoint[mcp]", "https://attacker.example/mcp");
    }

    function test_an_unbound_name_cannot_be_described_at_all() public {
        vm.prank(owner);
        vm.expectRevert(abi.encodeWithSelector(CordonResolver.NameNotBound.selector, _nh()));
        resolver.setText(_nh(), "agent-context", "nobody's agent");
    }

    /// A stated record resolves through ENSIP-10 like any other text.
    function test_stated_records_resolve_through_ensip10_too() public {
        vm.startPrank(owner);
        resolver.bind(_nh(), grandchild);
        resolver.setText(_nh(), "agent-context", "buys market data");
        vm.stopPrank();

        bytes memory wire = WIRE;
        bytes memory call_ = abi.encodeWithSelector(bytes4(0x59d1d43c), _nh(), "agent-context");
        assertEq(abi.decode(resolver.resolve(wire, call_), (string)), "buys market data");
    }

    /* ---- local formatters, so the assertions state the expected text ---- */

    function _usdc(uint128 base6) internal pure returns (string memory) {
        bytes memory frac = new bytes(6);
        uint256 rest = base6 % 1_000_000;
        for (uint256 i = 6; i > 0; --i) {
            frac[i - 1] = bytes1(uint8(48 + (rest % 10)));
            rest /= 10;
        }
        return string.concat(vm.toString(uint256(base6) / 1_000_000), ".", string(frac));
    }

    function _hex32(bytes32 v) internal pure returns (string memory) {
        return vm.toString(v);
    }
}
