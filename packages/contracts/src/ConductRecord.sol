// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {MandateRegistry} from "./MandateRegistry.sol";
import {TreeVault} from "./TreeVault.sol";
import {IIdentityRegistry, IReputationRegistry} from "./interfaces/IERC8004.sol";

/**
 * ConductRecord — the seat.
 *
 * ERC-8004 gives the ecosystem a shared Identity and Reputation registry, and
 * the read side of it is a public good. The data in it is worthless: across
 * 173,441 registered agents, 98.7–100% of feedback records carry no proof of
 * payment or task linkage, most reviewers on Base are Sybil-flagged, and
 * flipping an agent's reputation status there costs $0.0027. That is not an
 * implementation failure. It is structural: reputation there is **an opinion
 * somebody types**, and anyone can type.
 *
 * What this contract writes is a different kind of object — a measurement a
 * contract made:
 *
 *     this node was refused $2.40 by its grandparent's window budget,
 *     and here is the refusal it came from.
 *
 * Three properties, and each one is a test in `G6_Record.t.sol`:
 *
 * 1. **Linkage.** Every record is derived from `TreeVault.refusal(id)`, read
 *    here, in this transaction. There is no parameter through which a caller
 *    supplies an amount, a node or a reason. A refusal that did not happen has
 *    no id, and `refusal` reverts on one. The ecosystem baseline is 98.7–100%
 *    of records with no linkage at all; every record written from here has it
 *    by construction, not by policy.
 *
 * 2. **Unwritability.** Feedback in ERC-8004 is filed under the address that
 *    wrote it. Every record from here is filed under *this* address, and no
 *    other address can write under it. Anyone may write their own opinion to
 *    the same registry — they always could — but they cannot write one that
 *    reads as Cordon's, and they have no refusals to report because they are
 *    not the thing that refuses. You must be the seat to hold a record of
 *    refusals.
 *
 * 3. **No judgement anywhere in the path.** The value written is the amount
 *    the contract refused, in USDC base units. Not a rating, not a score, not
 *    a model's opinion of an agent. If Cordon ever wants to publish a
 *    judgement it will have to build something else, and this contract will
 *    not be able to sign it.
 *
 * There is no admin key, no privileged caller and no pause. `attest` is open
 * to anyone precisely because it invents nothing: whoever pays the gas, the
 * record that gets written is the one the vault already holds.
 */
contract ConductRecord {
    /* ------------------------------------------------------------------ */
    /* Immutables — the seat is bound to one vault at deployment           */
    /* ------------------------------------------------------------------ */

    TreeVault public immutable vault;
    MandateRegistry public immutable registry;
    IIdentityRegistry public immutable identity;
    IReputationRegistry public immutable reputation;

    /// @dev Records resolve here. The path carries the refusal id; the client
    ///      address on the feedback carries which vault, on which chain.
    string public constant RECORD_BASE = "https://getcordon.xyz/refusal/";

    /// @dev One tag, because there is one kind of record here. A release is
    ///      appended to the refusal it belongs to, not filed as its own event.
    string private constant TAG_REFUSED = "cordon.refused";

    /* ------------------------------------------------------------------ */
    /* Storage                                                             */
    /* ------------------------------------------------------------------ */

    /// @notice The ERC-8004 identity this node's conduct is filed against.
    mapping(bytes32 => uint256) public agentIdOf;
    /// @notice The reverse, so one identity cannot stand for two nodes.
    mapping(uint256 => bytes32) public nodeOfAgent;
    /// @notice Where a refusal's record landed, so a release can be appended
    ///         to the record it belongs to rather than written as a new one.
    mapping(uint256 => uint64) public feedbackIndexOf;
    mapping(uint256 => bool) public attested;
    mapping(uint256 => bool) public releaseAttested;

    /* ------------------------------------------------------------------ */
    /* Errors                                                              */
    /* ------------------------------------------------------------------ */

    error NodeNotBound(bytes32 node);
    error NodeAlreadyBound(bytes32 node, uint256 agentId);
    error AgentAlreadyBound(uint256 agentId, bytes32 node);
    error IdentityNotHeldByOperator(uint256 agentId, address holder, address operator);
    error AlreadyAttested(uint256 refusalId);
    error NotAttested(uint256 refusalId);
    error NotReleased(uint256 refusalId);

    /* ------------------------------------------------------------------ */
    /* Events                                                              */
    /* ------------------------------------------------------------------ */

    event Bound(bytes32 indexed node, uint256 indexed agentId, address indexed operator);
    event Attested(uint256 indexed refusalId, bytes32 indexed node, uint256 indexed agentId, bytes32 recordHash);
    event ReleaseAttested(uint256 indexed refusalId, uint256 indexed agentId, bytes32 recordHash);

    constructor(TreeVault vault_, IIdentityRegistry identity_, IReputationRegistry reputation_) {
        vault = vault_;
        registry = vault_.registry();
        identity = identity_;
        reputation = reputation_;
    }

    /* ------------------------------------------------------------------ */
    /* Binding a node to an identity                                       */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Attach a node to the ERC-8004 identity its operator holds.
     *
     * Cordon does not register the identity and does not hold it. An agent's
     * identity is the agent's, and a registry entry we own would be a record
     * about a token we control — which is the shape of the thing being
     * replaced. The daemon registers in the Identity Registry with its own
     * key, and this function checks the link rather than creating it.
     *
     * Anyone may call it, because it asserts nothing: both sides are read from
     * chain state, and a mismatch reverts.
     */
    function bind(bytes32 node, uint256 agentId) external {
        MandateRegistry.Mandate memory m = registry.mandate(node);

        uint256 already = agentIdOf[node];
        if (already != 0) revert NodeAlreadyBound(node, already);
        bytes32 taken = nodeOfAgent[agentId];
        if (taken != bytes32(0)) revert AgentAlreadyBound(agentId, taken);

        address holder = identity.ownerOf(agentId);
        if (holder != m.operator) revert IdentityNotHeldByOperator(agentId, holder, m.operator);

        agentIdOf[node] = agentId;
        nodeOfAgent[agentId] = node;
        emit Bound(node, agentId, m.operator);
    }

    /* ------------------------------------------------------------------ */
    /* Writing the record                                                  */
    /* ------------------------------------------------------------------ */

    /**
     * @notice Write one refusal into the Reputation Registry.
     *
     * Every field comes from `vault.refusal(refusalId)`, read in this call.
     * The caller supplies an id and nothing else, so there is no way to write
     * a record of something that did not happen — `refusal` reverts on an id
     * the vault does not hold.
     *
     * The value is the amount refused, in USDC base units with 6 decimals. A
     * reader who wants a rate divides by the draws in the same window, which
     * are in the Arc event log where they belong; this contract does not keep
     * a second copy of a number the chain already has.
     */
    function attest(uint256 refusalId) external returns (uint64 feedbackIndex) {
        if (attested[refusalId]) revert AlreadyAttested(refusalId);

        TreeVault.Refusal memory r = vault.refusal(refusalId);
        uint256 agentId = agentIdOf[r.node];
        if (agentId == 0) revert NodeNotBound(r.node);

        attested[refusalId] = true;

        bytes32 recordHash = refusalHash(refusalId, r);

        reputation.giveFeedback(
            agentId,
            int128(uint128(r.amount6)),
            6,
            TAG_REFUSED,
            reasonTag(r.reason),
            "",
            _recordUri(refusalId),
            recordHash
        );

        /* The registry assigns the index; asking it is the only way to know
           where the record landed, and a release has to find it later. */
        feedbackIndex = reputation.getLastIndex(agentId, address(this));
        feedbackIndexOf[refusalId] = feedbackIndex;

        emit Attested(refusalId, r.node, agentId, recordHash);
    }

    /**
     * @notice Record that a named human released a refusal, on the record the
     *         refusal already has.
     *
     * The exit is real and it is logged. It is appended rather than written as
     * a second record because a release is not another event about the agent —
     * it is what happened to *this* one, and a reader counting refusals must
     * not count the override twice.
     */
    function attestRelease(uint256 refusalId) external {
        if (!attested[refusalId]) revert NotAttested(refusalId);
        if (releaseAttested[refusalId]) revert AlreadyAttested(refusalId);

        TreeVault.Refusal memory r = vault.refusal(refusalId);
        if (!r.released) revert NotReleased(refusalId);

        releaseAttested[refusalId] = true;
        uint256 agentId = agentIdOf[r.node];
        bytes32 recordHash = refusalHash(refusalId, r);

        reputation.appendResponse(
            agentId, address(this), feedbackIndexOf[refusalId], _recordUri(refusalId), recordHash
        );

        emit ReleaseAttested(refusalId, agentId, recordHash);
    }

    /* ------------------------------------------------------------------ */
    /* Views — a reader recomputes rather than trusts                      */
    /* ------------------------------------------------------------------ */

    /**
     * @notice The commitment carried in a record: the vault tuple it was made
     *         from, hashed. Anyone can read the refusal, recompute this, and
     *         find any disagreement between the record and the chain.
     */
    function refusalHash(uint256 refusalId, TreeVault.Refusal memory r) public view returns (bytes32) {
        return keccak256(
            abi.encode(
                block.chainid,
                address(vault),
                refusalId,
                r.node,
                r.breachedAt,
                r.counterparty,
                r.amount6,
                uint8(r.reason),
                r.at,
                r.released
            )
        );
    }

    /// @notice The same commitment, for a reader holding only an id.
    function refusalHash(uint256 refusalId) external view returns (bytes32) {
        return refusalHash(refusalId, vault.refusal(refusalId));
    }

    function recordUri(uint256 refusalId) external pure returns (string memory) {
        return _recordUri(refusalId);
    }

    /* ------------------------------------------------------------------ */
    /* Internals                                                           */
    /* ------------------------------------------------------------------ */

    function _recordUri(uint256 refusalId) private pure returns (string memory) {
        return string.concat(RECORD_BASE, _toString(refusalId));
    }

    /**
     * @notice The reason, as the same word the daemon and the console use.
     *
     * Public because it was private, fell behind the enum it reads, and
     * nothing could ask it what it thought. `LifetimeCap` was appended to
     * `TreeVault.Reason` after this function was written and never given a
     * branch here, so every lifetime-cap refusal was published to the
     * Reputation Registry tagged `none` — a permanent record saying a draw was
     * refused for no reason, while the event it was derived from named the
     * bound. Four of the first eight published records carry it.
     *
     * `G6_Record` now walks every member of the enum through this function, so
     * the next appended reason fails a test instead of a record.
     */
    function reasonTag(TreeVault.Reason reason) public pure returns (string memory) {
        if (reason == TreeVault.Reason.Revoked) return "revoked";
        if (reason == TreeVault.Reason.TrancheCap) return "tranche-cap";
        if (reason == TreeVault.Reason.WindowBudget) return "window-budget";
        if (reason == TreeVault.Reason.Concentration) return "concentration";
        if (reason == TreeVault.Reason.VaultBalance) return "vault-balance";
        if (reason == TreeVault.Reason.LifetimeCap) return "lifetime-cap";
        return "none";
    }

    function _toString(uint256 value) private pure returns (string memory) {
        if (value == 0) return "0";
        uint256 digits;
        for (uint256 v = value; v != 0; v /= 10) ++digits;
        bytes memory buffer = new bytes(digits);
        for (uint256 v = value; v != 0; v /= 10) buffer[--digits] = bytes1(uint8(48 + (v % 10)));
        return string(buffer);
    }
}
